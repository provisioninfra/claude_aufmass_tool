/* =============================================================================
 * freigabe.js — Kunden-Freigabe des Schließplans
 *
 * Der Kunde erhält einen Link, öffnet den Plan im Browser und trägt in den
 * freigegebenen Feldern seine Berechtigungen ein. Je Link ist festgelegt,
 * was er außerdem darf: Mitarbeiter pflegen, Gruppen pflegen, neue Spalten
 * aufnehmen. Seine Antwort enthält nur die Abweichungen; zusätzlich kann er
 * den Plan verbindlich freigeben.
 *
 * Zwei Wege: Über die gemeinsame Ablage (Kurzlink, Server prüft die Antwort
 * gegen die Freigabe) oder ohne Server - dann stehen die Daten im
 * Adress-Anker (#) des Links, der niemals an einen Server gesendet wird, und
 * die Antwort kommt als Rückschlüssel zurück.
 *
 * Format 2 (Fassung 1.2): Mitarbeiter und Gruppen als eigene Listen, Medien
 * je Mitarbeiter, Rechte je Link. Links aus früheren Fassungen gelten nicht
 * mehr - sie wurden mit einem anderen Datenmodell erzeugt.
 * ========================================================================== */
(function (global) {
  'use strict';

  var FORMAT = 2;
  /* Zeichen je Berechtigungsstufe - ein Zeichen pro Zelle hält die Daten klein */
  var WERTE = ['nein', 'ja', 'zeit', 'temp', 'sperr'];
  var ZEICHEN = ['0', '1', '2', '3', '4'];
  var NEU_ID = /^neu-[a-z0-9]{1,12}$/;
  var ID = /^[A-Za-z0-9_-]{1,64}$/;

  function wertZuZeichen(w) {
    var i = WERTE.indexOf(w || 'nein');
    return ZEICHEN[i === -1 ? 0 : i];
  }
  function zeichenZuWert(z) {
    var i = ZEICHEN.indexOf(z);
    return WERTE[i === -1 ? 0 : i];
  }

  /* --- Lauflängenkodierung: Matrizen bestehen überwiegend aus Nullen ------
   * Wiederholungen werden mit einem Trennzeichen eingeleitet, das in den
   * Daten selbst nicht vorkommt. Ohne dieses Zeichen ließe sich "04" sowohl
   * als "einmal 0, einmal 4" wie auch als "viermal 0" lesen. */
  var WIEDERHOLUNG = '~';

  function packen(text) {
    var aus = '', i = 0;
    while (i < text.length) {
      var z = text[i], n = 1;
      while (i + n < text.length && text[i + n] === z) n++;
      if (n > 3) {
        /* In Blöcken zählen, damit der Zähler einstellig bleibt (max 35) */
        var rest = n;
        while (rest > 0) {
          var block = Math.min(rest, 35);
          if (block > 3) { aus += z + WIEDERHOLUNG + block.toString(36); }
          else { for (var k = 0; k < block; k++) aus += z; }
          rest -= block;
        }
      } else {
        for (var j = 0; j < n; j++) aus += z;
      }
      i += n;
    }
    return aus;
  }

  function entpacken(text) {
    var aus = '', i = 0;
    while (i < text.length) {
      var z = text[i];
      if (text[i + 1] === WIEDERHOLUNG) {
        var n = parseInt(text[i + 2], 36);
        if (!isFinite(n) || n < 1) n = 1;
        for (var k = 0; k < n; k++) aus += z;
        i += 3;
      } else {
        aus += z; i += 1;
      }
    }
    return aus;
  }

  /* --- Text sicher in eine Adresse verpacken ------------------------------ */
  function textZuAnker(text) {
    var bytes = unescape(encodeURIComponent(text));
    var b64 = (typeof btoa === 'function') ? btoa(bytes)
            : Buffer.from(bytes, 'binary').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function ankerZuText(anker) {
    var b64 = String(anker || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bytes = (typeof atob === 'function') ? atob(b64)
              : Buffer.from(b64, 'base64').toString('binary');
    return decodeURIComponent(escape(bytes));
  }

  /* --- Bereinigen: dieselben Regeln wie freigaben.php ----------------------
   * Die Kundenseite hat kein Modell geladen, deshalb stehen die Regeln für
   * Medien, Mitarbeiter und Gruppen hier noch einmal in knapper Form. */
  function text(wert, max) {
    if (wert === null || wert === undefined) return '';
    return String(wert).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  function kennung(wert) {
    var k = String(wert === null || wert === undefined ? '' : wert).trim();
    return ID.test(k) ? k : '';
  }
  function medienBereinigen(liste) {
    if (!Array.isArray(liste)) return [];
    var aus = [];
    liste.forEach(function (x) {
      if (x === null || x === undefined) return;
      var typ = '', anzahl = 1;
      if (Array.isArray(x)) { typ = x[0]; anzahl = x[1]; }
      else if (typeof x === 'object') { typ = x.typ; anzahl = x.anzahl; }
      else if (typeof x === 'string') { typ = x; }
      else return;
      typ = text(typ, 60);
      var n = parseInt(anzahl, 10);
      if (!isFinite(n) || n < 1) n = 1;
      if (n > 999) n = 999;
      var da = aus.filter(function (y) { return y[0] === typ; })[0];
      if (da) da[1] = Math.min(999, da[1] + n); else aus.push([typ, n]);
    });
    return aus;
  }
  /* Mitarbeiter in die knappe Form [Kennung, Name, [Gruppen], [[Art, Anzahl]]] */
  function mitarbeiterBereinigen(liste) {
    if (!Array.isArray(liste)) return [];
    var aus = [], gesehen = {};
    liste.forEach(function (x) {
      if (!x) return;
      var id, name, gruppen, medien;
      if (Array.isArray(x)) { id = x[0]; name = x[1]; gruppen = x[2]; medien = x[3]; }
      else if (typeof x === 'object') { id = x.id; name = x.name; gruppen = x.gruppen; medien = x.medien; }
      else return;
      name = text(name, 120);
      if (!name) return;
      id = kennung(id);
      if (id && gesehen[id]) return;
      if (id) gesehen[id] = true;
      var g = [], gs = {};
      (Array.isArray(gruppen) ? gruppen : []).forEach(function (gid) {
        gid = kennung(gid);
        if (gid && !gs[gid]) { gs[gid] = true; g.push(gid); }
      });
      aus.push([id, name, g, medienBereinigen(medien)]);
    });
    return aus.slice(0, 500);
  }
  function gruppenBereinigen(liste) {
    if (!Array.isArray(liste)) return [];
    var aus = [], gesehen = {};
    liste.forEach(function (x) {
      if (!x) return;
      var id, name;
      if (Array.isArray(x)) { id = x[0]; name = x[1]; }
      else if (typeof x === 'object') { id = x.id; name = x.name; }
      else return;
      name = text(name, 120);
      if (!name) return;
      id = kennung(id);
      if (id && gesehen[id]) return;
      if (id) gesehen[id] = true;
      aus.push([id, name]);
    });
    return aus.slice(0, 200);
  }
  function kennungenBereinigen(liste) {
    if (!Array.isArray(liste)) return [];
    var aus = [], gesehen = {};
    liste.forEach(function (x) { var k = kennung(x); if (k && !gesehen[k]) { gesehen[k] = true; aus.push(k); } });
    return aus.slice(0, 500);
  }
  function listenGleich(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function rechteBereinigen(r) {
    r = (r && typeof r === 'object') ? r : {};
    return { m: r.m ? 1 : 0, g: r.g ? 1 : 0, s: r.s ? 1 : 0 };
  }

  /* =========================================================================
   * Freigabe erzeugen
   * ======================================================================
   * optionen: { freigegebeneSchliessungen: [id, ...], nurLeereFelder,
   *             hinweis, frist, firma, rechte: {m,g,s}, medienArten: [] }
   */
  function erstellen(projekt, optionen) {
    optionen = optionen || {};
    var M = global.Model;
    M.spaltenAngleichen(projekt);
    var frei = optionen.freigegebeneSchliessungen || [];
    var schliessungen = M.spaltenSortiert(projekt);

    /* Türen in der Reihenfolge der Gliederung, mit ihrem Bereich */
    var tueren = [];
    M.tuerenGruppiert(projekt).forEach(function (g) {
      g.tueren.forEach(function (t) {
        tueren.push({ id: t.id, nr: t.nummer || '', bez: t.bezeichnung || '', bereich: g.titel });
      });
    });

    /* Matrix und Freigabemaske als je eine Zeichenkette */
    var matrix = '', maske = '';
    tueren.forEach(function (t) {
      schliessungen.forEach(function (s) {
        var wert = M.getBerechtigung(projekt, t.id, s.id);
        matrix += wertZuZeichen(wert);
        var darf = frei.indexOf(s.id) !== -1;
        if (darf && optionen.nurLeereFelder && wert !== 'nein') darf = false;
        maske += darf ? '1' : '0';
      });
    });

    return {
      f: FORMAT,
      pid: projekt.id,
      kunde: projekt.kunde || '',
      objekt: projekt.objekt || '',
      anlage: projekt.anlagenNr || '',
      hinweis: optionen.hinweis || '',
      frist: optionen.frist || '',
      firma: optionen.firma || '',
      r: rechteBereinigen(optionen.rechte),
      mt: (Array.isArray(optionen.medienArten) ? optionen.medienArten : []).map(function (x) { return text(x, 60); }).filter(Boolean).slice(0, 50),
      gr: (projekt.gruppen || []).map(function (g) { return [g.id, g.name || '']; }),
      ma: (projekt.mitarbeiter || []).map(function (m) {
        return [m.id, m.name || '', (m.gruppen || []).slice(),
                M.medienBereinigen(m.medien).map(function (x) { return [x.typ, x.anzahl]; })];
      }),
      t: tueren.map(function (t) { return [t.id, t.nr, t.bez, t.bereich]; }),
      /* Je Spalte: Kennung, Kürzel, Bezeichnung, Trägertext, Art, die
         Kennung der Gruppe bzw. des Mitarbeiters dahinter und bei einer
         Schließung die Kennungen ihrer Träger - damit die Kundenseite
         zeigen kann, worüber jemand berechtigt ist. */
      s: schliessungen.map(function (s) {
        return [s.id, s.kuerzel || '', s.bezeichnung || '', M.traegerText(projekt, s), s.art || 'schliessung',
                s.art === 'gruppe' ? (s.gruppeId || '') : (s.art === 'mitarbeiter' ? (s.mitarbeiterId || '') : ''),
                s.art === 'schliessung' ? (s.traeger || []).slice() : []];
      }),
      m: packen(matrix),
      e: packen(maske)
    };
  }

  function alsAnker(daten) { return textZuAnker(JSON.stringify(daten)); }

  function datenPruefen(daten, quelle) {
    if (!daten || typeof daten !== 'object') throw new Error('Die Freigabe ist leer.');
    if (daten.f !== FORMAT) {
      throw new Error(quelle === 'anker'
        ? 'Der Link stammt aus einer anderen Fassung des Werkzeugs. Bitte um einen neuen Link bitten.'
        : 'Die Freigabe stammt aus einer anderen Fassung des Werkzeugs.');
    }
    if (!Array.isArray(daten.t) || !Array.isArray(daten.s)) throw new Error('Die Freigabe ist unvollständig.');
    daten.matrix = entpacken(String(daten.m || ''));
    daten.maske = entpacken(String(daten.e || ''));
    var erwartet = daten.t.length * daten.s.length;
    if (daten.matrix.length !== erwartet || daten.maske.length !== erwartet) {
      throw new Error(quelle === 'anker' ? 'Der Link ist unvollständig. Bitte vollständig kopieren.' : 'Die Freigabe ist unvollständig.');
    }
    daten.r = rechteBereinigen(daten.r);
    daten.mt = Array.isArray(daten.mt) ? daten.mt.map(function (x) { return text(x, 60); }).filter(Boolean) : [];
    daten.gr = gruppenBereinigen(daten.gr);
    daten.ma = mitarbeiterBereinigen(daten.ma);
    return daten;
  }

  function ausAnker(anker) {
    var daten;
    try { daten = JSON.parse(ankerZuText(anker)); }
    catch (e) { throw new Error('Der Link ist nicht lesbar.'); }
    return datenPruefen(daten, 'anker');
  }

  /* Dieselben Daten, aber nicht aus dem Anker, sondern vom Server geholt
     (Kurzlink). Die Matrix wird genauso aufgelöst und geprüft. */
  function ausDaten(daten) { return datenPruefen(daten, 'server'); }

  /* =========================================================================
   * Antwort des Kunden
   * ======================================================================
   * aenderungen: { ma: Liste|null, max: [ids], gr: Liste|null, grx: [ids],
   *                n: [[art, kennung, zellen]], fr: {name, funktion}|null }
   * Listen, die sich nicht geändert haben, bleiben weg - das hält die
   * Antwort kurz und macht beim Übernehmen klar, was der Kunde wollte.
   */
  function antwortErstellen(daten, geaenderteMatrix, aenderungen) {
    aenderungen = aenderungen || {};
    var a = [];
    for (var i = 0; i < geaenderteMatrix.length; i++) {
      if (geaenderteMatrix[i] !== daten.matrix[i] && daten.maske[i] === '1') {
        a.push(i.toString(36) + ':' + geaenderteMatrix[i]);
      }
    }
    var antwort = {
      f: FORMAT, pid: daten.pid, typ: 'antwort',
      anzahl: daten.t.length + 'x' + daten.s.length,
      tIds: daten.t.map(function (t) { return t[0]; }),
      sIds: daten.s.map(function (s) { return s[0]; }),
      a: a.join(','),
      gesendet: new Date().toISOString()
    };
    if (aenderungen.ma) {
      var ma = mitarbeiterBereinigen(aenderungen.ma);
      if (!listenGleich(ma, mitarbeiterBereinigen(daten.ma))) antwort.ma = ma;
    }
    var max = kennungenBereinigen(aenderungen.max);
    if (max.length) antwort.max = max;
    if (aenderungen.gr) {
      var gr = gruppenBereinigen(aenderungen.gr);
      if (!listenGleich(gr, gruppenBereinigen(daten.gr))) antwort.gr = gr;
    }
    var grx = kennungenBereinigen(aenderungen.grx);
    if (grx.length) antwort.grx = grx;
    if (Array.isArray(aenderungen.n) && aenderungen.n.length) {
      antwort.n = aenderungen.n.map(function (x) {
        return [x[0] === 'gruppe' ? 'gruppe' : 'mitarbeiter', kennung(x[1]), packen(String(x[2] || ''))];
      }).filter(function (x) { return x[1]; });
    }
    if (aenderungen.fr && text(aenderungen.fr.name, 120)) {
      antwort.fr = { name: text(aenderungen.fr.name, 120), funktion: text(aenderungen.fr.funktion, 120) };
    }
    return antwort;
  }

  function antwortAlsSchluessel(antwort) { return textZuAnker(JSON.stringify(antwort)); }

  function antwortAusSchluessel(schluessel) {
    var roh = String(schluessel || '').trim();
    /* Auch eine vollständige Adresse wird angenommen */
    var raute = roh.indexOf('#');
    if (raute !== -1) roh = roh.slice(raute + 1);
    if (roh.indexOf('antwort=') === 0) roh = roh.slice(8);
    var antwort;
    try { antwort = JSON.parse(ankerZuText(roh)); }
    catch (e) { throw new Error('Der Rückschlüssel ist nicht lesbar. Bitte vollständig einfügen.'); }
    if (!antwort || antwort.typ !== 'antwort') throw new Error('Das ist keine Kundenantwort.');
    if (antwort.f !== FORMAT) throw new Error('Die Antwort stammt aus einer anderen Fassung. Bitte einen neuen Link senden.');
    return antwort;
  }

  /* Was steckt in einer Antwort? - ein kurzer Text für die Vorschau */
  function antwortKurz(antwort) {
    var teile = [];
    var n = antwort.a ? String(antwort.a).split(',').filter(Boolean).length : 0;
    teile.push(n + (n === 1 ? ' Änderung' : ' Änderungen') + ' im Plan');
    if (Array.isArray(antwort.ma) || (antwort.max && antwort.max.length)) teile.push('Mitarbeiterliste');
    if (Array.isArray(antwort.gr) || (antwort.grx && antwort.grx.length)) teile.push('Gruppen');
    if (Array.isArray(antwort.n) && antwort.n.length) teile.push(antwort.n.length + (antwort.n.length === 1 ? ' neue Spalte' : ' neue Spalten'));
    if (antwort.fr && antwort.fr.name) teile.push('verbindliche Freigabe durch ' + antwort.fr.name);
    return teile.join(', ');
  }

  /* Lesbarer Bericht über eine Übernahme */
  function berichtText(e) {
    var teile = [e.uebernommen + (e.uebernommen === 1 ? ' Berechtigung' : ' Berechtigungen') + ' übernommen'];
    if (e.mitarbeiterNeu) teile.push(e.mitarbeiterNeu + ' Mitarbeiter neu');
    if (e.mitarbeiterGeaendert) teile.push(e.mitarbeiterGeaendert + ' Mitarbeiter geändert');
    if (e.mitarbeiterEntfernt) teile.push(e.mitarbeiterEntfernt + ' Mitarbeiter entfernt');
    if (e.gruppenNeu) teile.push(e.gruppenNeu + (e.gruppenNeu === 1 ? ' Gruppe neu' : ' Gruppen neu'));
    if (e.gruppenGeaendert) teile.push(e.gruppenGeaendert + (e.gruppenGeaendert === 1 ? ' Gruppe umbenannt' : ' Gruppen umbenannt'));
    if (e.gruppenEntfernt) teile.push(e.gruppenEntfernt + (e.gruppenEntfernt === 1 ? ' Gruppe entfernt' : ' Gruppen entfernt'));
    if (e.spaltenNeu) teile.push(e.spaltenNeu + (e.spaltenNeu === 1 ? ' neue Spalte' : ' neue Spalten'));
    if (e.freigabe) teile.push('verbindliche Freigabe durch ' + [e.freigabe.name, e.freigabe.funktion].filter(Boolean).join(', ') + ' vermerkt');
    var ueb = (e.uebersprungen || 0) + (e.listenUebersprungen || 0);
    if (ueb) teile.push(ueb + ' übersprungen (nicht freigegeben oder nicht mehr vorhanden)');
    return teile.join(', ');
  }

  /* Welche Felder und Rechte waren für diese Antwort freigegeben?
     Nachgeschlagen in den beim Erzeugen des Links abgelegten Freigaben
     (gleiche Türen und Spalten in gleicher Reihenfolge). Mehrere passende
     Links ergeben die Vereinigung - was in irgendeinem Link freigegeben
     war, darf der Kunde eintragen. null: keine bekannt. */
  function freigabeFinden(projekt, antwort) {
    var tKey = JSON.stringify(antwort.tIds || []), sKey = JSON.stringify(antwort.sIds || []);
    var passende = (projekt.freigabenLokal || []).filter(function (f) {
      return f && JSON.stringify(f.tIds || []) === tKey && JSON.stringify(f.sIds || []) === sKey;
    });
    if (!passende.length) return null;
    var maske = '', rechte = { m: 0, g: 0, s: 0 };
    passende.forEach(function (f) {
      var m = String(f.maske || '');
      for (var i = 0; i < m.length; i++) {
        if (i >= maske.length) maske += m[i]; else if (m[i] === '1') maske = maske.slice(0, i) + '1' + maske.slice(i + 1);
      }
      var r = rechteBereinigen(f.rechte);
      if (r.m) rechte.m = 1;
      if (r.g) rechte.g = 1;
      if (r.s) rechte.s = 1;
    });
    return { maske: maske, rechte: rechte };
  }

  function freigabeMerken(projekt, daten) {
    if (!projekt || !daten) return null;
    if (!Array.isArray(projekt.freigabenLokal)) projekt.freigabenLokal = [];
    var eintrag = {
      id: 'frg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      erstellt: new Date().toISOString(),
      tIds: daten.t.map(function (t) { return t[0]; }),
      sIds: daten.s.map(function (s) { return s[0]; }),
      maske: entpacken(daten.e),
      rechte: rechteBereinigen(daten.r)
    };
    projekt.freigabenLokal.push(eintrag);
    /* Es bleiben die letzten 50 - mehr Links hat kein Aufmaß in Umlauf */
    if (projekt.freigabenLokal.length > 50) projekt.freigabenLokal.splice(0, projekt.freigabenLokal.length - 50);
    return eintrag;
  }

  /* Antwort in das Projekt übernehmen. Gibt einen Bericht zurück.
   * optionen: { serverGeprueft, code, fremdesProjektZulassen } */
  function antwortUebernehmen(projekt, antwort, optionen) {
    optionen = optionen || {};
    var M = global.Model;
    if (antwort.pid !== projekt.id && !optionen.fremdesProjektZulassen) {
      throw new Error('Die Antwort gehört zu einem anderen Projekt.');
    }
    var tIds = antwort.tIds || [], sIds = antwort.sIds || [];
    var spalten = sIds.length;
    var e = { uebernommen: 0, uebersprungen: 0,
              mitarbeiterNeu: 0, mitarbeiterGeaendert: 0, mitarbeiterEntfernt: 0,
              gruppenNeu: 0, gruppenGeaendert: 0, gruppenEntfernt: 0,
              spaltenNeu: 0, listenUebersprungen: 0, freigabe: null, aenderungen: [] };

    /* Nur, was freigegeben war: Maske und Rechte stehen nicht in der
       Antwort (die könnte verändert sein), sondern in der beim Erzeugen
       des Links abgelegten Freigabe. Ist keine bekannt, wird die
       Rückmeldung abgelehnt. Einzige Ausnahme: Rückmeldungen über den
       Server, die der Server bereits gegen seine Freigabe geprüft hat. */
    var freigabe = freigabeFinden(projekt, antwort);
    if (!freigabe && !optionen.serverGeprueft) {
      var fehler = new Error('Zu dieser Rückmeldung ist auf diesem Gerät keine Freigabe abgelegt. ' +
        'Der Link stammt aus einer früheren Fassung oder von einem anderen Gerät. ' +
        'Bitte einen neuen Freigabe-Link erzeugen und dem Kunden senden.');
      fehler.code = 'keine_freigabe';
      throw fehler;
    }
    var rechte = optionen.serverGeprueft ? { m: 1, g: 1, s: 1 } : freigabe.rechte;
    var maske = freigabe ? freigabe.maske : null;

    function tuerVon(id) { return projekt.tueren.filter(function (t) { return t.id === id; })[0]; }
    function spalteVon(id) { return projekt.schliessungen.filter(function (s) { return s.id === id; })[0]; }

    /* --- Berechtigungen --- */
    (antwort.a ? String(antwort.a).split(',') : []).forEach(function (eintrag) {
      if (!eintrag) return;
      var teile = eintrag.split(':');
      var index = parseInt(teile[0], 36);
      var wert = zeichenZuWert(teile[1]);
      var zeile = Math.floor(index / spalten), spalte = index % spalten;
      var tuerId = tIds[zeile], schliessungId = sIds[spalte];
      if (!tuerId || !schliessungId) { e.uebersprungen++; return; }
      if (maske && maske[index] !== '1') { e.uebersprungen++; return; }
      var tuer = tuerVon(tuerId), sch = spalteVon(schliessungId);
      if (!tuer || !sch) { e.uebersprungen++; return; }
      var vorher = M.getBerechtigung(projekt, tuerId, schliessungId);
      if (vorher === wert) return;
      M.setBerechtigung(projekt, tuerId, schliessungId, wert);
      e.uebernommen++;
      e.aenderungen.push({ tuer: tuer.nummer || tuer.bezeichnung, schliessung: sch.kuerzel || sch.bezeichnung,
                           vorher: vorher, nachher: wert });
    });

    var gruppenNeu = {};   /* Kennung des Kunden -> echte Kennung */
    var maNeu = {};

    /* --- Gruppen --- */
    if (Array.isArray(antwort.gr) || (Array.isArray(antwort.grx) && antwort.grx.length)) {
      if (!rechte.g) { e.listenUebersprungen++; }
      else {
        gruppenBereinigen(antwort.gr).forEach(function (x) {
          var id = x[0], name = x[1];
          var da = id && !NEU_ID.test(id) ? M.gruppeVon(projekt, id) : null;
          if (da) {
            if (da.name !== name) {
              e.aenderungen.push({ gruppe: true, art: 'geaendert', name: name, vorher: da.name });
              da.name = name; e.gruppenGeaendert++;
            }
            return;
          }
          if (id && !NEU_ID.test(id)) return;   /* unbekannte Kennung: nicht erfinden */
          var g = M.neueGruppe({ name: name });
          projekt.gruppen.push(g);
          if (id) gruppenNeu[id] = g.id;
          e.gruppenNeu++;
          e.aenderungen.push({ gruppe: true, art: 'neu', name: name });
        });
        kennungenBereinigen(antwort.grx).forEach(function (id) {
          var g = M.gruppeVon(projekt, id);
          if (!g) return;
          /* Eine Gruppe mit Spalte im Plan bleibt - die Spalte haben wir angelegt */
          if (projekt.schliessungen.some(function (s) { return s.art === 'gruppe' && s.gruppeId === id; })) { e.listenUebersprungen++; return; }
          M.gruppeLoeschen(projekt, id);
          e.gruppenEntfernt++;
          e.aenderungen.push({ gruppe: true, art: 'entfernt', name: g.name });
        });
      }
    }

    /* --- Mitarbeiter --- */
    if (Array.isArray(antwort.ma) || (Array.isArray(antwort.max) && antwort.max.length)) {
      if (!rechte.m) { e.listenUebersprungen++; }
      else {
        mitarbeiterBereinigen(antwort.ma).forEach(function (x) {
          var id = x[0], name = x[1];
          var gruppen = x[2].map(function (gid) { return gruppenNeu[gid] || gid; })
            .filter(function (gid) { return !!M.gruppeVon(projekt, gid); });
          var medien = x[3].map(function (md) { return { typ: md[0], anzahl: md[1] }; });
          var da = id && !NEU_ID.test(id) ? M.mitarbeiterVon(projekt, id) : null;
          if (da) {
            var vorher = JSON.stringify([da.name, (da.gruppen || []).slice().sort(), M.medienBereinigen(da.medien)]);
            da.name = name; da.gruppen = gruppen; da.medien = M.medienBereinigen(medien);
            var nachher = JSON.stringify([da.name, (da.gruppen || []).slice().sort(), M.medienBereinigen(da.medien)]);
            if (vorher !== nachher) {
              e.mitarbeiterGeaendert++;
              e.aenderungen.push({ mitarbeiter: true, art: 'geaendert', name: name, gruppen: gruppenNamen(projekt, gruppen), medien: medienText(da.medien) });
            }
            return;
          }
          if (id && !NEU_ID.test(id)) return;
          var m = M.neuerMitarbeiter({ name: name, gruppen: gruppen, medien: medien });
          projekt.mitarbeiter.push(m);
          if (id) maNeu[id] = m.id;
          e.mitarbeiterNeu++;
          e.aenderungen.push({ mitarbeiter: true, art: 'neu', name: name, gruppen: gruppenNamen(projekt, gruppen), medien: medienText(m.medien) });
        });
        kennungenBereinigen(antwort.max).forEach(function (id) {
          var m = M.mitarbeiterVon(projekt, id);
          if (!m) return;
          if (projekt.schliessungen.some(function (s) { return s.art === 'mitarbeiter' && s.mitarbeiterId === id; })) { e.listenUebersprungen++; return; }
          M.mitarbeiterLoeschen(projekt, id);
          e.mitarbeiterEntfernt++;
          e.aenderungen.push({ mitarbeiter: true, art: 'entfernt', name: m.name });
        });
      }
    }

    /* --- Neue Spalten des Kunden --- */
    if (Array.isArray(antwort.n) && antwort.n.length) {
      if (!rechte.s) { e.listenUebersprungen++; }
      else {
        antwort.n.forEach(function (x) {
          if (!Array.isArray(x)) return;
          var art = x[0] === 'gruppe' ? 'gruppe' : 'mitarbeiter';
          var id = kennung(x[1]);
          id = (art === 'gruppe' ? gruppenNeu[id] : maNeu[id]) || id;
          var ziel = art === 'gruppe' ? M.gruppeVon(projekt, id) : M.mitarbeiterVon(projekt, id);
          if (!ziel) { e.listenUebersprungen++; return; }
          var zellen = entpacken(String(x[2] || ''));
          var vorhanden = projekt.schliessungen.some(function (s) {
            return s.art === art && (art === 'gruppe' ? s.gruppeId === id : s.mitarbeiterId === id);
          });
          var sp = M.spalteFuer(projekt, art, id);
          var gesetzt = 0;
          for (var i = 0; i < tIds.length && i < zellen.length; i++) {
            var wert = zeichenZuWert(zellen[i]);
            if (wert === 'nein' || !tuerVon(tIds[i])) continue;
            M.setBerechtigung(projekt, tIds[i], sp.id, wert);
            gesetzt++;
          }
          if (!vorhanden) e.spaltenNeu++;
          e.uebernommen += gesetzt;
          e.aenderungen.push({ spalte: true, art: art, name: ziel.name, zellen: gesetzt, vorhanden: vorhanden });
        });
      }
    }

    /* --- Verbindliche Freigabe --- */
    if (antwort.fr && text(antwort.fr.name, 120)) {
      projekt.freigabe = {
        am: antwort.gesendet || new Date().toISOString(),
        name: text(antwort.fr.name, 120),
        funktion: text(antwort.fr.funktion, 120),
        art: antwort.fr.art === 'nachtraeglich' ? 'nachtraeglich' : 'mit_antwort',
        code: optionen.code || '',
        stand: M.freigabeStand(projekt)
      };
      e.freigabe = { name: projekt.freigabe.name, funktion: projekt.freigabe.funktion, art: projekt.freigabe.art };
      e.aenderungen.push({ freigabe: true, name: projekt.freigabe.name, funktion: projekt.freigabe.funktion, art: projekt.freigabe.art });
    }

    M.spaltenAngleichen(projekt);
    e.listen = (Array.isArray(antwort.ma) ? 1 : 0) + (Array.isArray(antwort.gr) ? 1 : 0) + e.spaltenNeu;
    return e;
  }

  function gruppenNamen(projekt, ids) {
    var M = global.Model;
    return ids.map(function (id) { var g = M.gruppeVon(projekt, id); return g ? g.name : ''; }).filter(Boolean);
  }
  function medienText(liste) {
    return (liste || []).map(function (x) { return x.anzahl + '× ' + (x.typ || 'Art offen'); }).join(', ');
  }

  global.Freigabe = {
    FORMAT: FORMAT,
    WERTE: WERTE, ZEICHEN: ZEICHEN,
    wertZuZeichen: wertZuZeichen, zeichenZuWert: zeichenZuWert,
    erstellen: erstellen, alsAnker: alsAnker, ausAnker: ausAnker, ausDaten: ausDaten,
    antwortErstellen: antwortErstellen,
    antwortAlsSchluessel: antwortAlsSchluessel,
    antwortAusSchluessel: antwortAusSchluessel,
    antwortUebernehmen: antwortUebernehmen,
    antwortKurz: antwortKurz,
    berichtText: berichtText,
    freigabeMerken: freigabeMerken,
    freigabeFinden: freigabeFinden,
    medienBereinigen: medienBereinigen,
    mitarbeiterBereinigen: mitarbeiterBereinigen,
    gruppenBereinigen: gruppenBereinigen,
    kennungenBereinigen: kennungenBereinigen,
    listenGleich: listenGleich,
    rechteBereinigen: rechteBereinigen,
    _intern: { packen: packen, entpacken: entpacken, textZuAnker: textZuAnker, ankerZuText: ankerZuText, text: text, kennung: kennung }
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Freigabe; }
})(typeof window !== 'undefined' ? window : globalThis);
