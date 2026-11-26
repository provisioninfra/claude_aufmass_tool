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
  var WERTE = ['nein', 'ja', 'zeit', 'temp', 'sperr', 'plan'];
  var ZEICHEN = ['0', '1', '2', '3', '4', '5'];
  var NEU_ID = /^neu-[a-z0-9]{1,12}$/;
  /* Nachschlagetabellen mit Kennungen als Schlüssel: ohne Prototyp, damit
     eine Kennung wie „constructor“ oder „__proto__“ (aus einem Import
     denkbar) nicht Object.prototype trifft. */
  function tabelle() { return Object.create(null); }
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
    /* Mailprogramme brechen lange Links um; dabei geraten Leerzeichen,
       Zeilenumbrüche oder deren URL-Kodierung in den Anker. Sie zählen sonst
       bei der Auffüllung mit „=“ mit, und der Schlüssel gilt als unlesbar. */
    var b64 = String(anker || '').replace(/%(20|0A|0D|09)/gi, '').replace(/\s+/g, '')
      .replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bytes = (typeof atob === 'function') ? atob(b64)
              : Buffer.from(b64, 'base64').toString('binary');
    return decodeURIComponent(escape(bytes));
  }

  /* --- Bereinigen: dieselben Regeln wie freigaben.php ----------------------
   * Die Kundenseite hat kein Modell geladen, deshalb stehen die Regeln für
   * Medien, Mitarbeiter und Gruppen hier noch einmal in knapper Form. */
  function text(wert, max) {
    if (wert === null || wert === undefined || (typeof wert !== 'string' && typeof wert !== 'number' && typeof wert !== 'boolean')) return '';
    var t = String(wert).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
    /* nie mitten in einem Zeichenpaar (Emoji) abschneiden - ein halbes Paar ist kein gültiger Text */
    if (/[\uD800-\uDBFF]$/.test(t)) t = t.slice(0, -1);
    return t;
  }
  function kennung(wert) {
    if (typeof wert !== 'string' && typeof wert !== 'number') return '';
    var k = String(wert).trim();
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
    var aus = [], gesehen = tabelle();
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
      var g = [], gs = tabelle();
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
    var aus = [], gesehen = tabelle();
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
    var aus = [], gesehen = tabelle();
    liste.forEach(function (x) { var k = kennung(x); if (k && !gesehen[k]) { gesehen[k] = true; aus.push(k); } });
    return aus.slice(0, 500);
  }
  function listenGleich(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  /* Einträge (je [Kennung, …]), die gegenüber der Vorlage neu oder anders sind */
  function nurGeaenderte(liste, vorlage) {
    var vorher = tabelle();
    (vorlage || []).forEach(function (x) { if (x && x[0]) vorher[x[0]] = JSON.stringify(x); });
    return (liste || []).filter(function (x) { return x && (!x[0] || !vorher[x[0]] || vorher[x[0]] !== JSON.stringify(x)); });
  }
  /* Vorlage einer Liste als Nachschlagetabelle Kennung -> Eintrag */
  function nachKennung(liste) {
    var aus = tabelle();
    (liste || []).forEach(function (x) { if (x && x[0]) aus[x[0]] = x; });
    return aus;
  }
  /* Kennzeichen einer Rückmeldung: dieselbe Rückmeldung ergibt dasselbe Kennzeichen */
  function antwortKennzeichen(antwort) {
    var s = [antwort.pid, antwort.gesendet, antwort.a, JSON.stringify([antwort.ma || null, antwort.max || null, antwort.gr || null, antwort.grx || null, antwort.n || null, antwort.fr || null])].join('|');
    var h1 = 5381, h2 = 52711;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = ((h1 * 33) ^ c) >>> 0; h2 = ((h2 * 31) + c) >>> 0; }
    return h1.toString(36) + '-' + h2.toString(36) + '-' + s.length.toString(36);
  }
  /* Namen vergleichen wie ein Mensch: Groß/Klein und Leerraum zählen nicht */
  function namenGleich(a, b) {
    var n = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
    return n(a) !== '' && n(a) === n(b);
  }
  /* Rechte wie der Server (!empty): „0“, leere Listen und Objekte zählen nicht */
  function rechteBereinigen(r) {
    r = (r && typeof r === 'object' && !Array.isArray(r)) ? r : {};
    function an(w) {
      if (w === true || w === 1) return 1;
      if (typeof w === 'number') return w !== 0 ? 1 : 0;
      if (typeof w === 'string') return (w !== '' && w !== '0') ? 1 : 0;
      if (Array.isArray(w)) return w.length ? 1 : 0;
      if (w && typeof w === 'object') return Object.keys(w).length ? 1 : 0;
      return 0;
    }
    return { m: an(r.m), g: an(r.g), s: an(r.s) };
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
        /* Ausdrückliche Vorgaben des Planers (gesperrt, befristet) bleiben auf
           Wunsch gesperrt - ein Tipp des Kunden machte sonst aus „–“ ein „X“. */
        if (darf && optionen.vorgabenSchuetzen && (wert === 'sperr' || wert === 'temp')) darf = false;
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
      /* Adresse für die Rückmeldung per E-Mail (nur beim langen Link gebraucht) */
      mail: /@/.test(String(optionen.mail || '')) ? text(optionen.mail, 200) : '',
      r: rechteBereinigen(optionen.rechte),
      mt: (Array.isArray(optionen.medienArten) ? optionen.medienArten : []).map(function (x) { return text(x, 60); }).filter(Boolean).slice(0, 50),
      gr: (projekt.gruppen || []).map(function (g) { return [g.id, g.name || '']; }),
      ma: (projekt.mitarbeiter || []).map(function (m) {
        return [m.id, m.name || '', (m.gruppen || []).slice(),
                M.medienBereinigen(m.medien).map(function (x) { return [x.typ, x.anzahl]; })];
      }),
      t: tueren.map(function (t) { return [t.id, t.nr, t.bez, t.bereich]; }),
      /* Gleichschließende Türen (Haupttür zuerst): Die Kundenseite hält ihre
         Felder einer Spalte gleich - sonst stünden Widersprüche im Plan, die
         beim Übernehmen stillschweigend die zuletzt gelesene Zelle gewinnt. */
      vb: verbuende(projekt, tueren.map(function (t) { return t.id; })),
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

  function verbuende(projekt, tIds) {
    var M = global.Model;
    if (!M.schliessungsTueren) return [];
    var gesehen = tabelle(), aus = [];
    tIds.forEach(function (id) {
      if (gesehen[id]) return;
      var gruppe = M.schliessungsTueren(projekt, id).map(function (t) { return t.id; }).filter(function (x) { return tIds.indexOf(x) !== -1; });
      gruppe.forEach(function (x) { gesehen[x] = true; });
      if (gruppe.length >= 2) aus.push(gruppe);
    });
    return aus;
  }
  /* Nur Kennungen, die es in t gibt; je Tür höchstens ein Verbund. */
  function verbuendeBereinigen(vb, tIds) {
    if (!Array.isArray(vb)) return [];
    var bekannt = tabelle(), vergeben = tabelle(), aus = [];
    tIds.forEach(function (id) { bekannt[id] = true; });
    vb.slice(0, 2000).forEach(function (g) {
      if (!Array.isArray(g)) return;
      var ids = [];
      g.slice(0, 200).forEach(function (x) { var k = kennung(x); if (k && bekannt[k] && !vergeben[k] && ids.indexOf(k) === -1) ids.push(k); });
      if (ids.length >= 2) { ids.forEach(function (k) { vergeben[k] = true; }); aus.push(ids); }
    });
    return aus;
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
    /* Anzeigetexte sind Texte - ein Objekt an dieser Stelle ließ die Kundenseite
       beim Einhängen in die Seite abstürzen. */
    function nurText(w, max) { return (typeof w === 'string' || typeof w === 'number') ? text(w, max) : ''; }
    ['kunde', 'objekt', 'anlage', 'hinweis', 'firma'].forEach(function (k) { daten[k] = nurText(daten[k], 500); });
    daten.frist = nurText(daten.frist, 100);
    daten.mail = /@/.test(nurText(daten.mail, 200)) ? nurText(daten.mail, 200) : '';
    daten.pid = kennung(daten.pid) || String(daten.pid === null || daten.pid === undefined ? '' : daten.pid).slice(0, 64);
    daten.vb = verbuendeBereinigen(daten.vb, daten.t.map(function (x) { return Array.isArray(x) ? kennung(x[0]) : ''; }));
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
    if (daten.fid && kennung(daten.fid)) antwort.fid = kennung(daten.fid);
    /* Nur, was der Kunde angefasst hat: geänderte und neue Einträge. Die
       unveränderten bleiben weg - sonst setzte die Übernahme alles, was im
       Werkzeug inzwischen geändert wurde, still auf den Linkstand zurück. */
    if (aenderungen.ma) {
      var ma = nurGeaenderte(mitarbeiterBereinigen(aenderungen.ma), mitarbeiterBereinigen(daten.ma));
      if (ma.length) antwort.ma = ma;
    }
    var max = kennungenBereinigen(aenderungen.max);
    if (max.length) antwort.max = max;
    if (aenderungen.gr) {
      var gr = nurGeaenderte(gruppenBereinigen(aenderungen.gr), gruppenBereinigen(daten.gr));
      if (gr.length) antwort.gr = gr;
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
    /* Der Schlüssel kommt meist aus einer E-Mail: als vollständige Adresse,
       vom Mailprogramm umbrochen, mit eingestreuten Leerzeichen - oder der
       ganze Mailtext wurde eingefügt. Versucht wird der Reihe nach: der Text
       selbst, der Teil hinter „#“ bzw. „antwort=“, beides ohne Zwischenräume,
       dann jeder schlüsselartige Block darin (längster zuerst). Angenommen
       wird nur, was sich als Antwort entpuppt - ein Zufallstreffer ist
       ausgeschlossen. */
    var kandidaten = [];
    function merken(k) { k = String(k || '').trim(); if (k && kandidaten.indexOf(k) === -1) kandidaten.push(k); }
    function varianten(text) {
      merken(text);
      var raute = text.indexOf('#');
      var hinten = raute !== -1 ? text.slice(raute + 1) : text;
      if (hinten.indexOf('antwort=') === 0) hinten = hinten.slice(8);
      merken(hinten);
      merken(text.replace(/\s+/g, ''));
      merken(hinten.replace(/\s+/g, ''));
      /* zitiert („> …“ am Zeilenanfang) und dann umbrochen */
      merken(text.replace(/^[>|\s]+/gm, '').replace(/\s+/g, ''));
      /* quoted-printable aus dem Rohtext einer Mail: „=“ am Zeilenende ist ein weicher Umbruch */
      merken(text.replace(/=\r?\n/g, '').replace(/^[>|\s]+/gm, '').replace(/\s+/g, ''));
    }
    varianten(roh);
    [roh, roh.replace(/\s+/g, '')].forEach(function (quelle) {
      (quelle.match(/[A-Za-z0-9_-]{40,}/g) || []).sort(function (a, b) { return b.length - a.length; }).forEach(merken);
    });
    var antwort = null, lesbar = null;
    for (var i = 0; i < kandidaten.length && !antwort; i++) {
      var versuch;
      try { versuch = JSON.parse(ankerZuText(kandidaten[i])); } catch (e) { continue; }
      if (versuch && typeof versuch === 'object') {
        if (versuch.typ === 'antwort') antwort = versuch;
        else if (!lesbar) lesbar = versuch;
      }
    }
    if (!antwort) {
      if (lesbar) throw new Error('Das ist keine Kundenantwort.');
      throw new Error('Der Rückschlüssel ist nicht lesbar. Bitte vollständig einfügen.');
    }
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
    var alle = (projekt.freigabenLokal || []).filter(function (f) {
      return f && JSON.stringify(f.tIds || []) === tKey && JSON.stringify(f.sIds || []) === sKey;
    });
    /* Nennt die Antwort ihren Link, gilt genau der - sonst (ältere Links) die
       Vereinigung aller passenden. Zurückgezogene Links gelten nicht. */
    var fid = kennung(antwort.fid);
    var genau = fid ? alle.filter(function (f) { return f.id === fid; }) : [];
    if (genau.length && genau.every(function (f) { return f.zurueckgezogen; })) return { zurueckgezogen: genau[0].zurueckgezogen };
    var passende = (genau.length ? genau : alle).filter(function (f) { return !f.zurueckgezogen; });
    if (!passende.length) return null;
    var maske = '', rechte = { m: 0, g: 0, s: 0 }, ma = null, gr = null, tNr = null, sKurz = null;
    passende.forEach(function (f) {
      var m = String(f.maske || '');
      for (var i = 0; i < m.length; i++) {
        if (i >= maske.length) maske += m[i]; else if (m[i] === '1') maske = maske.slice(0, i) + '1' + maske.slice(i + 1);
      }
      var r = rechteBereinigen(f.rechte);
      if (r.m) rechte.m = 1;
      if (r.g) rechte.g = 1;
      if (r.s) rechte.s = 1;
      /* Linkstand der Listen: der jüngste Link, der ihn kennt */
      if (Array.isArray(f.ma)) ma = f.ma;
      if (Array.isArray(f.gr)) gr = f.gr;
      if (Array.isArray(f.tNr)) tNr = f.tNr;
      if (Array.isArray(f.sKurz)) sKurz = f.sKurz;
    });
    return { maske: maske, rechte: rechte, ma: ma, gr: gr, tNr: tNr, sKurz: sKurz };
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
      rechte: rechteBereinigen(daten.r),
      /* Namen für den Bericht, falls Tür oder Spalte später fehlt */
      tNr: daten.t.map(function (t) { return t[1] || t[2] || ''; }),
      sKurz: daten.s.map(function (s) { return s[1] || s[2] || ''; }),
      /* Stand der Listen im Link: Beim Übernehmen wird je Angabe nur das
         geändert, was der Kunde gegenüber diesem Stand geändert hat. */
      ma: (daten.ma || []).map(function (m) { return [m[0], m[1], (m[2] || []).slice(), (m[3] || []).map(function (x) { return [x[0], x[1]]; })]; }),
      gr: (daten.gr || []).map(function (g) { return [g[0], g[1]]; })
    };
    /* Der Link trägt die Kennung seiner Freigabe; die Antwort bringt sie
       zurück, und beim Einlesen gilt genau diese Freigabe. */
    daten.fid = eintrag.id;
    projekt.freigabenLokal.push(eintrag);
    /* Es bleiben die letzten 100 - zuerst fliegen zurückgezogene, dann die
       ältesten. Ein Kunde mit einem gültigen Link soll nicht „keine Freigabe
       abgelegt“ hören, nur weil später viele Links folgten. */
    var ueberzaehlig = projekt.freigabenLokal.length - 100;
    for (var i = 0; i < projekt.freigabenLokal.length && ueberzaehlig > 0;) {
      if (projekt.freigabenLokal[i] && projekt.freigabenLokal[i].zurueckgezogen) { projekt.freigabenLokal.splice(i, 1); ueberzaehlig--; } else i++;
    }
    if (ueberzaehlig > 0) projekt.freigabenLokal.splice(0, ueberzaehlig);
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
    if (freigabe && freigabe.zurueckgezogen && !optionen.serverGeprueft) {
      var zurueck = new Error('Der Freigabe-Link dieser Rückmeldung wurde am ' + String(freigabe.zurueckgezogen).slice(0, 10) + ' zurückgezogen. ' +
        'Die Rückmeldung wird nicht übernommen - bei Bedarf einen neuen Link senden.');
      zurueck.code = 'zurueckgezogen';
      throw zurueck;
    }
    if (freigabe && freigabe.zurueckgezogen) freigabe = null;
    if (!freigabe && !optionen.serverGeprueft) {
      var fehler = new Error('Zu dieser Rückmeldung ist auf diesem Gerät keine Freigabe abgelegt. ' +
        'Der Link stammt aus einer früheren Fassung oder von einem anderen Gerät. ' +
        'Bitte einen neuen Freigabe-Link erzeugen und dem Kunden senden.');
      fehler.code = 'keine_freigabe';
      throw fehler;
    }
    var rechte = optionen.serverGeprueft ? { m: 1, g: 1, s: 1 } : freigabe.rechte;
    /* Hat der Server die Antwort schon gegen seine Freigabe geprüft, gilt
       dessen Maske - nicht eine zufällig passende, womöglich engere lokale. */
    var maske = optionen.serverGeprueft ? null : (freigabe ? freigabe.maske : null);
    /* Linkstand der Listen (falls bekannt): je Angabe wird nur übernommen,
       was der Kunde gegenüber dem Link geändert hat - was im Werkzeug
       inzwischen anders ist, bleibt. */
    var vorlageMa = nachKennung(optionen.linkMa || (freigabe && freigabe.ma) || null);
    var vorlageGr = nachKennung(optionen.linkGr || (freigabe && freigabe.gr) || null);
    /* Kennungen, die der Kunde vergeben hat, und was im Aufmaß daraus wurde */
    if (!projekt.kundenKennungen || typeof projekt.kundenKennungen !== 'object' || Array.isArray(projekt.kundenKennungen)) projekt.kundenKennungen = {};
    var karte = projekt.kundenKennungen;
    function bekannt(id) { return (id && NEU_ID.test(id) && Object.prototype.hasOwnProperty.call(karte, id) && typeof karte[id] === 'string') ? karte[id] : id; }
    function merken(neuId, echteId) {
      if (!neuId || !NEU_ID.test(neuId) || !echteId) return;
      karte[neuId] = echteId;
      var schluessel = Object.keys(karte);
      if (schluessel.length > 2000) schluessel.slice(0, schluessel.length - 2000).forEach(function (k) { delete karte[k]; });
    }
    /* Schon einmal übernommen? Dann sagt es der Bericht - angelegt wird ohnehin nichts doppelt. */
    var kennzeichen = antwortKennzeichen(antwort);
    if (!Array.isArray(projekt.freigabeAntworten)) projekt.freigabeAntworten = [];
    var frueher = projekt.freigabeAntworten.filter(function (x) { return x && x.id === kennzeichen; })[0];
    e.bereitsUebernommen = frueher ? (frueher.am || '') : null;

    function tuerVon(id) { return projekt.tueren.filter(function (t) { return t.id === id; })[0]; }
    function spalteVon(id) { return projekt.schliessungen.filter(function (s) { return s.id === id; })[0]; }

    /* --- Berechtigungen --- */
    var tNr = (freigabe && freigabe.tNr) || optionen.tNr || null, sKurz = (freigabe && freigabe.sKurz) || optionen.sKurz || null;
    function tuerName(zeile) { var t = tuerVon(tIds[zeile]); return t ? (t.nummer || t.bezeichnung) : ((tNr && tNr[zeile]) || tIds[zeile] || '–'); }
    function spaltenName(spalte) { var s = spalteVon(sIds[spalte]); return s ? (s.kuerzel || s.bezeichnung) : ((sKurz && sKurz[spalte]) || sIds[spalte] || '–'); }
    function uebersprungen(zeile, spalte, wert, grund) {
      e.uebersprungen++;
      e.aenderungen.push({ uebersprungen: true, tuer: tuerName(zeile), schliessung: spaltenName(spalte), nachher: wert, grund: grund });
    }
    var verbundWerte = tabelle();   /* Spalte + Haupttür -> zuerst gesetzter Wert */
    (antwort.a ? String(antwort.a).split(',') : []).forEach(function (eintrag) {
      if (!eintrag) return;
      var teile = eintrag.split(':');
      var index = parseInt(teile[0], 36);
      var wert = zeichenZuWert(teile[1]);
      var zeile = Math.floor(index / spalten), spalte = index % spalten;
      var tuerId = tIds[zeile], schliessungId = sIds[spalte];
      if (!tuerId || !schliessungId) { uebersprungen(zeile, spalte, wert, 'Feld liegt außerhalb des Plans'); return; }
      if (maske && maske[index] !== '1') { uebersprungen(zeile, spalte, wert, 'Feld war nicht freigegeben'); return; }
      var tuer = tuerVon(tuerId), sch = spalteVon(schliessungId);
      if (!tuer || !sch) { uebersprungen(zeile, spalte, wert, !tuer ? 'Tür gibt es im Aufmaß nicht mehr' : 'Spalte gibt es im Aufmaß nicht mehr'); return; }
      /* Widerspruch bei gleichschließenden Türen (nur bei von Hand gebauten
         Rückmeldungen möglich - die Kundenseite setzt sie gemeinsam) */
      if (M.schliessungsTueren) {
        var basis = M.schliessungsTueren(projekt, tuerId)[0];
        if (basis) {
          var schluessel = schliessungId + '|' + basis.id;
          if (verbundWerte[schluessel] !== undefined && verbundWerte[schluessel] !== wert) {
            e.aenderungen.push({ hinweis: true, text: 'Widerspruch bei gleichschließenden Türen (' + (basis.nummer || basis.bezeichnung || '') + ' und ' + (tuer.nummer || tuer.bezeichnung || '') +
              ', Spalte ' + (sch.kuerzel || sch.bezeichnung || '') + '): Die Rückmeldung nennt verschiedene Werte, übernommen wurde der zuletzt genannte.' });
          }
          verbundWerte[schluessel] = wert;
        }
      }
      var vorher = M.getBerechtigung(projekt, tuerId, schliessungId);
      if (vorher === wert) return;
      /* Gleichschließende Türen tragen dasselbe Kreuz - sonst setzte die nächste
         Angleichung die Kundenänderung am Mitläufer still zurück */
      if (M.berechtigungSetzenVerbund) M.berechtigungSetzenVerbund(projekt, tuerId, schliessungId, wert);
      else M.setBerechtigung(projekt, tuerId, schliessungId, wert);
      e.uebernommen++;
      /* Gleichschließende Türen ziehen mit - der Bericht nennt sie */
      var partner = M.schliessungsTueren ? M.schliessungsTueren(projekt, tuerId).filter(function (x) { return x.id !== tuerId; })
        .map(function (x) { return x.nummer || x.bezeichnung || ''; }).filter(Boolean) : [];
      e.aenderungen.push({ tuer: tuer.nummer || tuer.bezeichnung, schliessung: sch.kuerzel || sch.bezeichnung,
                           vorher: vorher, nachher: wert, mit: partner });
    });

    var gruppenNeu = tabelle();   /* Kennung des Kunden -> echte Kennung */
    var maNeu = tabelle();

    /* --- Gruppen --- */
    if (Array.isArray(antwort.gr) || (Array.isArray(antwort.grx) && antwort.grx.length)) {
      if (!rechte.g) { e.listenUebersprungen++; }
      else {
        gruppenBereinigen(antwort.gr).forEach(function (x) {
          var id = x[0], name = x[1];
          var echteId = bekannt(id);
          var da = echteId && !NEU_ID.test(echteId) ? M.gruppeVon(projekt, echteId) : null;
          if (da) {
            if (id !== echteId) gruppenNeu[id] = da.id;
            /* Hat der Kunde den Namen gegenüber dem Link gar nicht geändert, bleibt der im Werkzeug */
            var vorlage = vorlageGr[id];
            if (vorlage && vorlage[1] === name) return;
            if (da.name !== name) {
              e.aenderungen.push({ gruppe: true, art: 'geaendert', name: name, vorher: da.name });
              da.name = name; e.gruppenGeaendert++;
            }
            return;
          }
          if (id && !NEU_ID.test(id)) return;   /* unbekannte Kennung: nicht erfinden */
          if (!id) { e.listenUebersprungen++; return; }   /* ohne Kennung käme der Eintrag bei jeder Übernahme neu */
          var dublette = projekt.gruppen.some(function (v) { return namenGleich(v.name, name); });
          var g = M.neueGruppe({ name: name });
          projekt.gruppen.push(g);
          if (id) { gruppenNeu[id] = g.id; merken(id, g.id); }
          e.gruppenNeu++;
          e.aenderungen.push({ gruppe: true, art: 'neu', name: name, dublette: dublette });
        });
        kennungenBereinigen(antwort.grx).map(bekannt).forEach(function (id) {
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
          var gruppen = x[2].map(function (gid) { return gruppenNeu[gid] || bekannt(gid); })
            .filter(function (gid) { return !!M.gruppeVon(projekt, gid); });
          var medien = x[3].map(function (md) { return { typ: md[0], anzahl: md[1] }; });
          var echteId = bekannt(id);
          var da = echteId && !NEU_ID.test(echteId) ? M.mitarbeiterVon(projekt, echteId) : null;
          if (da) {
            if (id !== echteId) maNeu[id] = da.id;
            var vorher = JSON.stringify([da.name, (da.gruppen || []).slice().sort(), M.medienBereinigen(da.medien)]);
            /* Feldweise: Was der Kunde gegenüber dem Linkstand nicht geändert
               hat, bleibt, wie es im Werkzeug steht. Ohne bekannten Linkstand
               gilt der Eintrag des Kunden ganz. */
            var vorlage = vorlageMa[id];
            var felder = [];
            var gruppenVorlage = vorlage ? vorlage[2].map(function (gid) { return gruppenNeu[gid] || bekannt(gid); }).filter(function (gid) { return !!M.gruppeVon(projekt, gid); }) : null;
            var medienVorlage = vorlage ? M.medienBereinigen(vorlage[3].map(function (md) { return { typ: md[0], anzahl: md[1] }; })) : null;
            if (!vorlage || vorlage[1] !== name) { if (da.name !== name) { da.name = name; felder.push('Name'); } }
            if (!vorlage || JSON.stringify(gruppenVorlage.slice().sort()) !== JSON.stringify(gruppen.slice().sort())) {
              if (JSON.stringify((da.gruppen || []).slice().sort()) !== JSON.stringify(gruppen.slice().sort())) { da.gruppen = gruppen; felder.push('Gruppen'); }
            }
            if (!vorlage || JSON.stringify(medienVorlage) !== JSON.stringify(M.medienBereinigen(medien))) {
              if (JSON.stringify(M.medienBereinigen(da.medien)) !== JSON.stringify(M.medienBereinigen(medien))) { da.medien = M.medienBereinigen(medien); felder.push('Medien'); }
            }
            var nachher = JSON.stringify([da.name, (da.gruppen || []).slice().sort(), M.medienBereinigen(da.medien)]);
            if (vorher !== nachher) {
              e.mitarbeiterGeaendert++;
              e.aenderungen.push({ mitarbeiter: true, art: 'geaendert', name: da.name, gruppen: gruppenNamen(projekt, da.gruppen || []), medien: medienText(da.medien), felder: felder });
            }
            return;
          }
          if (id && !NEU_ID.test(id)) return;
          if (!id) { e.listenUebersprungen++; return; }   /* ohne Kennung käme der Eintrag bei jeder Übernahme neu */
          /* Gleicher Name schon da? Der Kunde legt gern „Herr Baumann“ ein zweites
             Mal an statt den vorhandenen zu ändern - der Bericht sagt es dazu. */
          var dublette = projekt.mitarbeiter.some(function (v) { return namenGleich(v.name, name); });
          var m = M.neuerMitarbeiter({ name: name, gruppen: gruppen, medien: medien });
          projekt.mitarbeiter.push(m);
          if (id) { maNeu[id] = m.id; merken(id, m.id); }
          e.mitarbeiterNeu++;
          e.aenderungen.push({ mitarbeiter: true, art: 'neu', name: name, gruppen: gruppenNamen(projekt, gruppen), medien: medienText(m.medien), dublette: dublette });
        });
        kennungenBereinigen(antwort.max).map(bekannt).forEach(function (id) {
          var m = M.mitarbeiterVon(projekt, id);
          if (!m) return;
          if (projekt.schliessungen.some(function (s) { return s.art === 'mitarbeiter' && s.mitarbeiterId === id; })) { e.listenUebersprungen++; return; }
          /* Träger einer Schließung (Schlüssel) verschwinden nicht über eine Rückmeldung -
             die Schließung verlöre still ihre Stückzahl. */
          var traegt = projekt.schliessungen.filter(function (s) { return Array.isArray(s.traeger) && s.traeger.indexOf(id) !== -1; });
          if (traegt.length) {
            e.listenUebersprungen++;
            e.aenderungen.push({ mitarbeiter: true, art: 'behalten', name: m.name, grund: 'Träger von ' + traegt.map(function (s) { return s.kuerzel || s.bezeichnung || 'Schließung'; }).join(', ') });
            return;
          }
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
          id = (art === 'gruppe' ? gruppenNeu[id] : maNeu[id]) || bekannt(id);
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
            /* wie bei den Berechtigungen: gleichschließende Türen ziehen mit */
            if (M.berechtigungSetzenVerbund) M.berechtigungSetzenVerbund(projekt, tIds[i], sp.id, wert);
            else M.setBerechtigung(projekt, tIds[i], sp.id, wert);
            gesetzt++;
          }
          if (!vorhanden) e.spaltenNeu++;
          e.uebernommen += gesetzt;
          e.aenderungen.push({ spalte: true, art: art, name: ziel.name, zellen: gesetzt, vorhanden: vorhanden });
        });
      }
    }

    /* --- Verbindliche Freigabe: nur, was der Server geprüft hat --- */
    if (antwort.fr && text(antwort.fr.name, 120) && !optionen.serverGeprueft) {
      /* Ein Rückschlüssel ist Text, den jeder schreiben kann. Eine verbindliche
         Freigabe gilt nur über die gemeinsame Ablage, wo Zeitpunkt und
         Herkunft festgehalten sind - der Vermerk im Schlüssel wird nicht übernommen. */
      e.freigabeUebergangen = true;
      e.aenderungen.push({ hinweis: true, text: 'Der Rückschlüssel enthält den Vermerk einer verbindlichen Freigabe (' + text(antwort.fr.name, 120) + '). ' +
        'Er wird nicht übernommen: Verbindliche Freigaben gelten nur über die gemeinsame Ablage (Kurzlink).' });
    }
    if (antwort.fr && text(antwort.fr.name, 120) && optionen.serverGeprueft) {
      var gesendet = String(antwort.gesendet || '');
      projekt.freigabe = {
        am: (/^\d{4}-\d{2}-\d{2}T/.test(gesendet) && !isNaN(Date.parse(gesendet))) ? new Date(gesendet).toISOString() : new Date().toISOString(),
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
    /* Diese Rückmeldung ist jetzt bekannt */
    if (!frueher) {
      projekt.freigabeAntworten.push({ id: kennzeichen, am: new Date().toISOString() });
      if (projekt.freigabeAntworten.length > 100) projekt.freigabeAntworten.splice(0, projekt.freigabeAntworten.length - 100);
    }
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
    namenGleich: namenGleich,
    nurGeaenderte: nurGeaenderte,
    antwortKennzeichen: antwortKennzeichen,
    listenGleich: listenGleich,
    rechteBereinigen: rechteBereinigen,
    _intern: { packen: packen, entpacken: entpacken, textZuAnker: textZuAnker, ankerZuText: ankerZuText, text: text, kennung: kennung }
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Freigabe; }
})(typeof window !== 'undefined' ? window : globalThis);
