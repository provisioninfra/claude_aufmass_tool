/* =============================================================================
 * europlan.js — Der Schließplan in der Schreibweise der Hersteller
 *
 * Der Kreuzschließplan (model.js: Spalten × Türen, Werte ja/zeit/temp/sperr/
 * plan) bleibt die einzige Wahrheit. Der Europlan ist eine zweite Sicht
 * darauf, wie sie EVVA, Winkhaus und die Fachhändler im Bestellformular
 * verwenden:
 *
 *   X  übergeordneter Schlüssel (Spalte) sperrt diesen Zylinder (Zeile)
 *   I  Einzelschließung: der Eigenschlüssel dieser Tür gehört zur Gruppe der Spalte
 *   Z  Zentralzylinder: alle Eigenschlüssel der Gruppe sperren ihn
 *   M  Mitschließung: ein Zylinder mit eigenem Schlüssel, den die Gruppe mitsperrt
 *   O  vorgeplant (Reserve): vorbereitet, sperrt noch nicht
 *
 * Zuordnung zum Werkzeug: Schließungen und nicht faltbare Mitarbeiter sind
 * X-Spalten, Gruppen sind I/Z/M-Spalten. Ein Mitarbeiter ist „Inhaber“ einer
 * Schließung, wenn seine eigene Spalte genau diese eine Schließung sperrt;
 * sein I steht an der Haupttür in jeder Gruppenspalte, der er angehört, seine
 * Medienzahl ist die ESL (Eigenschlüssel-Stückzahl). Eigenschlüssel ohne
 * Person sind Einzelschließungen (EZ) und erscheinen nur als ESL.
 *
 * Gleichschließend: Mitläufer tragen die Zylindernummer der Haupttür mit .1,
 * .2 … und zeigen nie ein I - der Eigenschlüssel wird an der Haupttür geführt.
 * ========================================================================== */
(function (global) {
  'use strict';
  var M = global.Model, K = global.Katalog;

  var ZEICHEN = ['X', 'I', 'Z', 'M', 'O'];
  var ZEICHEN_TEXT = {
    X: 'sperrt (Schlüssel der Spalte sperrt diesen Zylinder)',
    I: 'Eigenschlüssel dieser Tür gehört zur Gruppe',
    Z: 'Zentralzylinder: alle Schlüssel der Gruppe sperren',
    M: 'Mitschließung: die Gruppe sperrt diesen Zylinder mit eigenem Schlüssel mit',
    O: 'vorgeplant (Reserve): vorbereitet, sperrt noch nicht'
  };

  function istGruppe(s) { return s && s.art === 'gruppe'; }

  /* --- Analyse: Inhaber, faltbare Spalten, Schließungen ------------------- */
  function analyse(p) {
    M.spaltenAngleichen(p);
    var spalten = M.spaltenSortiert(p);
    var tueren = (p.tueren || []).filter(Boolean);
    var basisVon = Object.create(null), basen = [], basisIds = Object.create(null);
    tueren.forEach(function (t) {
      var b = M.basisTuer(p, t) || t;
      basisVon[t.id] = b;
      if (!basisIds[b.id]) { basisIds[b.id] = true; basen.push(b); }
    });
    function wert(b, s) { return M.getBerechtigung(p, b.id, s.id); }

    var gruppenSpalten = spalten.filter(istGruppe);
    var inhaber = Object.create(null);        /* basisId -> [{ m, spalte, gruppen }] - faltbare Inhaber (I in der Gruppenspalte) */
    var eigentuemer = Object.create(null);    /* basisId -> [{ m, spalte, gruppen }] - alle Mitarbeiter, deren Spalte genau diese Schließung sperrt */
    var heimVon = Object.create(null);        /* Spaltenkennung eines Mitarbeiters -> seine Schließung (Haupttür) */
    var gefaltet = Object.create(null);       /* Spaltenkennung -> true, wenn die Spalte im Europlan nicht erscheint */
    var ezJeBasis = Object.create(null);      /* basisId -> [EZ-Schließungen] */
    var hinweise = [];

    spalten.forEach(function (s) {
      if (s.art === 'mitarbeiter') {
        var m = M.mitarbeiterVon(p, s.mitarbeiterId);
        if (!m) return;
        var berechtigt = basen.filter(function (b) { return M.istBerechtigt(wert(b, s)); });
        var sonst = basen.filter(function (b) { var w = wert(b, s); return w === 'plan' || w === 'sperr'; });
        var gruppen = gruppenSpalten.filter(function (g) { return (m.gruppen || []).indexOf(g.gruppeId) !== -1; });
        if (!berechtigt.length && !sonst.length) {
          hinweise.push('Die Spalte „' + (m.name || s.kuerzel) + '“ hat keine einzige Berechtigung - sie steht leer im Plan.');
        } else if (berechtigt.length === 1 && sonst.length) {
          hinweise.push('„' + (m.name || s.kuerzel) + '“ hat neben seiner Tür noch vorgeplante oder gesperrte Felder - sein Schlüssel steht als eigene Spalte im Plan.');
        } else if (berechtigt.length > 1 && gruppen.length) {
          hinweise.push('„' + (m.name || s.kuerzel) + '“ sperrt mehr als eine Schließung - sein Schlüssel steht als eigene Spalte im Plan, nicht als I in der Gruppe.');
        }
        if (berechtigt.length === 1 && !sonst.length) {
          var b = berechtigt[0];
          heimVon[s.id] = b;
          (eigentuemer[b.id] = eigentuemer[b.id] || []).push({ m: m, spalte: s, gruppen: gruppen });
          if (gruppen.length) {
            var konflikt = gruppen.some(function (g) { return wert(b, g) !== 'nein'; });
            if (!konflikt) {
              gefaltet[s.id] = true;
              (inhaber[b.id] = inhaber[b.id] || []).push({ m: m, spalte: s, gruppen: gruppen });
              return;
            }
            hinweise.push('„' + (m.name || s.kuerzel) + '“: Die eigene Tür wird auch von seiner Gruppe gesperrt - er steht deshalb als eigene Spalte im Plan.');
          } else {
            hinweise.push('„' + (m.name || s.kuerzel) + '“ gehört keiner Gruppe mit Spalte an - sein Schlüssel steht als eigene Spalte im Plan.');
          }
        }
      } else if (s.art === 'schliessung' && s.typ === 'ez') {
        var ber = basen.filter(function (b) { return M.istBerechtigt(wert(b, s)); });
        var son = basen.filter(function (b) { var w = wert(b, s); return w === 'plan' || w === 'sperr'; });
        if (ber.length === 1 && !son.length) {
          gefaltet[s.id] = true;
          (ezJeBasis[ber[0].id] = ezJeBasis[ber[0].id] || []).push(s);
        }
      }
    });
    return { spalten: spalten, tueren: tueren, basen: basen, basisVon: basisVon, gruppenSpalten: gruppenSpalten,
             inhaber: inhaber, eigentuemer: eigentuemer, heimVon: heimVon, gefaltet: gefaltet, ezJeBasis: ezJeBasis, hinweise: hinweise, wert: wert };
  }

  /* Hat ein Mitarbeiter eine eigene Spalte im Plan? */
  function eigeneSpalte(p, m) {
    return (p.schliessungen || []).filter(function (s) { return s.art === 'mitarbeiter' && s.mitarbeiterId === m.id; })[0] || null;
  }

  /* Menge einer Gruppenspalte: die Medien der Mitglieder ohne eigene Spalte -
   * sie bekommen reine Gruppenschlüssel (sperren nur Z und M der Gruppe). */
  function gruppenMenge(p, g) {
    var mitglieder = M.gruppenMitglieder(p, g.gruppeId);
    if (!mitglieder.length) return M.medienBereinigen(g.medien).reduce(function (sum, x) { return sum + x.anzahl; }, 0);
    return mitglieder.filter(function (m) { return !eigeneSpalte(p, m); })
      .reduce(function (sum, m) { return sum + M.mitarbeiterMedienAnzahl(m); }, 0);
  }

  function eslVon(p, a, basis) {
    var summe = 0, da = false;
    (a.inhaber[basis.id] || []).forEach(function (i) { summe += M.mitarbeiterMedienAnzahl(i.m); da = true; });
    (a.ezJeBasis[basis.id] || []).forEach(function (s) { summe += M.medienAnzahl(p, s); da = true; });
    if (da) return summe;
    return basis.eigenschluesselVorgeplant ? 0 : null;
  }

  /* --- Der Europlan ------------------------------------------------------- */
  function europlan(p) {
    var a = analyse(p);
    var spalten = a.spalten.filter(function (s) { return !a.gefaltet[s.id]; }).map(function (s) {
      var gruppe = istGruppe(s);
      var heim = a.heimVon[s.id];
      return {
        id: s.id, spalte: s, art: gruppe ? 'gruppe' : 'schluessel',
        schlNr: (heim && M.zylinderNummer(p, heim)) || s.kuerzel || '', funktion: s.bezeichnung || '',
        menge: gruppe ? gruppenMenge(p, s) : M.medienAnzahl(p, s),
        mitglieder: gruppe ? M.gruppenMitglieder(p, s.gruppeId) : M.spaltenMitglieder(p, s)
      };
    });
    var zeilen = [];
    M.tuerenGruppiert(p).forEach(function (g) {
      g.tueren.forEach(function (t) {
        var basis = a.basisVon[t.id] || t;
        var mitlaeufer = basis.id !== t.id;
        var inh = a.inhaber[basis.id] || [];
        var zellen = Object.create(null);
        spalten.forEach(function (sp) {
          var w = M.getBerechtigung(p, t.id, sp.id), z = '';
          if (sp.art === 'gruppe') {
            if (M.istBerechtigt(w)) z = (inh.length || (a.ezJeBasis[basis.id] || []).length) ? 'M' : 'Z';
            else if (w === 'plan') z = 'O';
            else if (!mitlaeufer && inh.some(function (i) { return i.gruppen.some(function (gg) { return gg.id === sp.id; }); })) z = 'I';
          } else {
            if (M.istBerechtigt(w)) z = 'X';
            else if (w === 'plan') z = 'O';
          }
          zellen[sp.id] = z;
        });
        zeilen.push({
          tuer: t, basis: basis, mitlaeufer: mitlaeufer, bereich: g.titel,
          zylNr: M.zylinderNummer(p, t), stk: Math.max(1, parseInt(t.anzahl, 10) || 1),
          esl: mitlaeufer ? null : eslVon(p, a, basis),
          inhaber: inh, eigenschluessel: a.ezJeBasis[basis.id] || [],
          produktcode: M.produktcode(p, t), zellen: zellen
        });
      });
    });
    return { spalten: spalten, zeilen: zeilen, hinweise: a.hinweise, analyse: a };
  }

  /* --- Der Kreuzschließplan als Schlüsselliste („oldschool“) ---------------
   * Jeder Schlüssel eine Spalte, Gruppen aufgelöst in die Schlüssel ihrer
   * Mitglieder. X, wo der Schlüssel tatsächlich sperrt. */
  function kreuzplan(p) {
    var a = analyse(p);
    var spalten = [];
    a.spalten.forEach(function (s) {
      var direkt = (s.art === 'schliessung' && !a.gefaltet[s.id])
        || (s.art === 'gruppe' && !M.gruppenMitglieder(p, s.gruppeId).length)          /* Gruppe ohne Mitglieder: ein Gruppenschlüssel */
        || (s.art === 'mitarbeiter' && !M.mitarbeiterVon(p, s.mitarbeiterId));          /* Mitarbeiter gelöscht, Spalte bewusst behalten */
      if (direkt) {
        spalten.push({ id: s.id, spalte: s, art: 'schluessel', schlNr: s.kuerzel || '', funktion: s.bezeichnung || '',
                       menge: M.medienAnzahl(p, s), zelle: function (t) { return M.getBerechtigung(p, t.id, s.id); } });
      }
    });
    (p.mitarbeiter || []).forEach(function (m) {
      var eigene = eigeneSpalte(p, m);
      var gruppenSp = a.gruppenSpalten.filter(function (g) { return (m.gruppen || []).indexOf(g.gruppeId) !== -1; });
      if (!eigene && !gruppenSp.length) return;    /* bekommt nichts */
      var heimTuer = eigene ? (a.heimVon[eigene.id] || null) : null;
      spalten.push({
        id: 'ma:' + m.id, mitarbeiter: m, art: 'schluessel',
        schlNr: (heimTuer && M.zylinderNummer(p, heimTuer)) || (eigene && eigene.kuerzel) || M.kuerzelAus(m.name || ''),
        funktion: m.name || '', menge: M.mitarbeiterMedienAnzahl(m),
        zelle: function (t) {
          var beste = 'nein';
          var werte = [];
          if (eigene) werte.push(M.getBerechtigung(p, t.id, eigene.id));
          gruppenSp.forEach(function (g) { werte.push(M.getBerechtigung(p, t.id, g.id)); });
          werte.forEach(function (w) {
            if (M.istBerechtigt(w)) beste = 'ja';
            else if (w === 'plan' && beste === 'nein') beste = 'plan';
          });
          return beste;
        }
      });
    });
    var zeilen = [];
    M.tuerenGruppiert(p).forEach(function (g) {
      g.tueren.forEach(function (t) {
        var basis = a.basisVon[t.id] || t, mitlaeufer = basis.id !== t.id;
        var zellen = Object.create(null);
        spalten.forEach(function (sp) {
          var w = sp.zelle(t);
          zellen[sp.id] = M.istBerechtigt(w) ? 'X' : (w === 'plan' ? 'O' : '');
        });
        var ez = a.ezJeBasis[basis.id] || [];
        var esl = mitlaeufer ? null : (ez.length ? ez.reduce(function (sum, s) { return sum + M.medienAnzahl(p, s); }, 0) : (basis.eigenschluesselVorgeplant ? 0 : null));
        zeilen.push({ tuer: t, basis: basis, mitlaeufer: mitlaeufer, bereich: g.titel, zylNr: M.zylinderNummer(p, t),
                      stk: Math.max(1, parseInt(t.anzahl, 10) || 1), esl: esl, produktcode: M.produktcode(p, t), zellen: zellen });
      });
    });
    return { spalten: spalten, zeilen: zeilen, hinweise: a.hinweise, analyse: a };
  }

  /* --- Bearbeiten im Europlan --------------------------------------------- */
  /* Welche Zeichen sind in dieser Zelle möglich? */
  function moeglicheZeichen(p, tuerId, spalteId) {
    var s = (p.schliessungen || []).filter(function (x) { return x.id === spalteId; })[0];
    var t = M.tuerVon(p, tuerId);
    if (!s || !t) return [];
    if (!istGruppe(s)) return ['', 'X', 'O'];
    return M.istMitlaeufer(p, t) ? ['', 'Z', 'M', 'O'] : ['', 'I', 'Z', 'M', 'O'];
  }

  /**
   * Zeichen einer Zelle setzen. Rückgabe { ok, braucht, text }:
   * braucht === 'inhaber' heißt: Für ein I an einer Tür ohne Inhaber muss
   * ein Mitarbeiter angelegt werden - optionen.inhaber = { name, anzahl, typ }.
   */
  function zelleSetzen(p, tuerId, spalteId, zeichen, optionen) {
    optionen = optionen || {};
    var s = (p.schliessungen || []).filter(function (x) { return x.id === spalteId; })[0];
    var t = M.tuerVon(p, tuerId);
    if (!s || !t) return { ok: false, text: 'Tür oder Spalte nicht gefunden.' };
    zeichen = String(zeichen || '').toUpperCase();
    if (!istGruppe(s)) {
      M.berechtigungSetzenVerbund(p, t.id, s.id, zeichen === 'X' ? 'ja' : (zeichen === 'O' ? 'plan' : 'nein'));
      return { ok: true };
    }
    var basis = M.basisTuer(p, t) || t;
    var a = analyse(p);
    var inh = a.eigentuemer[basis.id] || [];
    if (zeichen === 'Z' || zeichen === 'M') {
      M.berechtigungSetzenVerbund(p, t.id, s.id, 'ja');
      /* Inhaber, die dieser Gruppe angehören, würden I und M in einer Zelle
         brauchen - sie bleiben Inhaber, verlassen aber diese Gruppe. */
      inh.forEach(function (i) { i.m.gruppen = (i.m.gruppen || []).filter(function (g) { return g !== s.gruppeId; }); });
      return { ok: true };
    }
    if (zeichen === 'O') { M.berechtigungSetzenVerbund(p, t.id, s.id, 'plan'); return { ok: true }; }
    if (zeichen === 'I') {
      if (basis.id !== t.id) return { ok: false, text: 'Der Eigenschlüssel wird an der Haupttür ' + (basis.nummer || '') + ' geführt.' };
      if (!inh.length && !optionen.inhaber) return { ok: false, braucht: 'inhaber' };
      M.berechtigungSetzenVerbund(p, t.id, s.id, 'nein');
      if (inh.length) {
        inh.forEach(function (i) { if ((i.m.gruppen || []).indexOf(s.gruppeId) === -1) i.m.gruppen.push(s.gruppeId); });
        return { ok: true };
      }
      inhaberAnlegen(p, t, s.gruppeId, optionen.inhaber);
      return { ok: true };
    }
    /* leer */
    var jetzt = M.getBerechtigung(p, t.id, s.id);
    if (jetzt !== 'nein') { M.berechtigungSetzenVerbund(p, t.id, s.id, 'nein'); return { ok: true }; }
    inh.forEach(function (i) { i.m.gruppen = (i.m.gruppen || []).filter(function (g) { return g !== s.gruppeId; }); });
    return { ok: true };
  }

  /* Inhaber des Eigenschlüssels einer Tür anlegen: Mitarbeiter mit Medien,
   * Gruppenzugehörigkeit, eigener Spalte und Berechtigung an der Schließung. */
  function inhaberAnlegen(p, tuer, gruppeId, angaben) {
    angaben = angaben || {};
    var basis = M.basisTuer(p, tuer) || tuer;
    var anzahl = parseInt(angaben.anzahl, 10);
    if (!isFinite(anzahl) || anzahl < 1) anzahl = 1;
    var m = M.neuerMitarbeiter({
      name: String(angaben.name || ('Inhaber ' + (basis.nummer || basis.bezeichnung || ''))).trim(),
      funktion: String(angaben.funktion || ''),
      gruppen: gruppeId ? [gruppeId] : [],
      medien: [{ typ: String(angaben.typ || ''), anzahl: anzahl }]
    });
    p.mitarbeiter.push(m);
    var s = M.spalteFuer(p, 'mitarbeiter', m.id);
    s.kuerzel = M.kuerzelEindeutig(p, String(basis.nummer || '').trim() || s.kuerzel, s.id);
    M.berechtigungSetzenVerbund(p, basis.id, s.id, 'ja');
    return m;
  }

  /* ESL (Eigenschlüssel-Stückzahl) einer Tür setzen. null = kein Eigenschlüssel,
   * 0 = vorgeplant. Gibt es Inhaber, wird ihre Medienzahl gesetzt (bei mehreren
   * der erste, oder optionen.mitarbeiterId); sonst eine Einzelschließung (EZ). */
  function eslSetzen(p, tuerId, anzahl, optionen) {
    optionen = optionen || {};
    var t = M.tuerVon(p, tuerId);
    if (!t) return { ok: false };
    var basis = M.basisTuer(p, t) || t;
    var a = analyse(p);
    var inh = a.eigentuemer[basis.id] || [], ez = a.ezJeBasis[basis.id] || [];
    var n = anzahl === null || anzahl === undefined || anzahl === '' ? null : parseInt(anzahl, 10);
    if (n !== null && !isFinite(n)) return { ok: false, text: 'Die Stückzahl muss eine Zahl sein.' };
    if (n !== null) n = Math.max(0, Math.min(999, n));
    if (inh.length + ez.length > 1 && !optionen.mitarbeiterId) {
      return { ok: false, text: 'Mehrere Schlüsselquellen an dieser Tür (' + inh.map(function (i) { return i.m.name; }).concat(ez.map(function (s) { return s.kuerzel; })).join(', ') + ') - bitte die Stückzahl beim jeweiligen Mitarbeiter oder bei der Schließung ändern.' };
    }
    var typ = String(optionen.typ || (ez[0] && ez[0].medien[0] && ez[0].medien[0].typ) || '');
    basis.eigenschluesselVorgeplant = false;
    if (inh.length) {
      var ziel = inh.filter(function (i) { return i.m.id === optionen.mitarbeiterId; })[0] || inh[0];
      if (n === null) { return { ok: false, text: 'Der Eigenschlüssel gehört ' + ziel.m.name + ' - Inhaber in der Mitarbeiterliste entfernen.' }; }
      if (n === 0) { return { ok: false, text: 'Mit Inhaber ist mindestens ein Schlüssel nötig.' }; }
      var da = M.medienBereinigen(ziel.m.medien);
      /* Weitere Medienarten bleiben erhalten; der erste Eintrag trägt den Rest */
      var andere = da.slice(1), summeAndere = andere.reduce(function (sum, x) { return sum + x.anzahl; }, 0);
      while (andere.length && summeAndere >= n) { var weg = andere.pop(); summeAndere -= weg.anzahl; }
      ziel.m.medien = [{ typ: da[0] ? da[0].typ : typ, anzahl: Math.max(1, n - summeAndere) }].concat(andere);
      return { ok: true };
    }
    if (n === null || n === 0) {
      ez.forEach(function (s) { p.schliessungen = p.schliessungen.filter(function (x) { return x.id !== s.id; }); });
      M.matrixAufraeumen(p);
      basis.eigenschluesselVorgeplant = (n === 0);
      return { ok: true };
    }
    var s = ez[0];
    if (!s) {
      var sort = (p.schliessungen || []).reduce(function (max, x) { return Math.max(max, (x.sort || 0) + 1); }, 0);
      s = M.neueSchliessung({ typ: 'ez', kuerzel: String(basis.nummer || 'EZ').trim(), bezeichnung: 'Eigenschlüssel ' + (basis.bezeichnung || basis.nummer || ''), sort: sort });
      p.schliessungen.push(s);
      M.berechtigungSetzenVerbund(p, basis.id, s.id, 'ja');
    }
    s.medien = [{ typ: typ, anzahl: n }];
    return { ok: true };
  }

  /* Neue Tür für den Plan - mit laufender Nummer, Raum und Bereich */
  function tuerAnlegen(p, angaben) {
    angaben = angaben || {};
    var t = M.neueTuer({
      nummer: String(angaben.nummer || M.naechsteLaufendeNummer(p)).trim(),
      bezeichnung: String(angaben.bezeichnung || '').trim(),
      strukturId: angaben.strukturId || null,
      anzahl: parseInt(angaben.anzahl, 10) > 0 ? parseInt(angaben.anzahl, 10) : 1,
      status: 'offen'
    });
    if (M.statusAusPruefung) M.statusAusPruefung(p, t);
    p.tueren.push(t);
    return t;
  }

  /* --- EVVA-Bestellformular: Zellen des Blattes „Plan“ ---------------------
   * Zeile 1 Funktion, 2 Menge, 3 Schl.Nr (ab Spalte H); Zeile 4 Kopf der
   * Zylindertabelle; ab Zeile 5 die Zylinder. Genau das Layout der Vorlage. */
  var SPALTEN_MAX = 95;      /* H bis CX */
  function spaltenName(n) { var s = ''; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
  function mehrzeilig() { return Array.prototype.slice.call(arguments).filter(function (x) { return x !== undefined && x !== null && String(x).trim() !== ''; }).join('\n'); }
  /* Zeilenhöhe in Punkt für einen umbrechenden Text: je Zeile etwa so viele
     Zeichen wie die Spalte breit ist (Excel-Einheit), 12,75 pt je Zeile. */
  function hoeheFuer(text, spaltenBreite, mindest, hoechstens) {
    var zeilen = 0;
    String(text || '').split('\n').forEach(function (z) { zeilen += Math.max(1, Math.ceil(z.length / Math.max(1, spaltenBreite))); });
    return Math.min(hoechstens, Math.max(mindest, Math.round(zeilen * 12.75 + 3)));
  }

  function evvaBlatt(p, einstellungen, art) {
    einstellungen = einstellungen || {};
    var plan = art === 'kreuz' ? kreuzplan(p) : europlan(p);
    var spalten = plan.spalten.slice(0, SPALTEN_MAX);
    var warnungen = plan.hinweise.slice();
    if (plan.spalten.length > SPALTEN_MAX) warnungen.push('Das Formular fasst ' + SPALTEN_MAX + ' Schlüsselspalten; ' + (plan.spalten.length - SPALTEN_MAX) + ' weitere wurden nicht übernommen.');
    var systemName = p.systemMechanik ? ((K && K.systemLabel && K.systemLabel(p.systemMechanik)) || p.systemMechanik) : '';
    var besteller = mehrzeilig(einstellungen.firma, einstellungen.firmaZusatz, einstellungen.strasse, [einstellungen.plz, einstellungen.ort].filter(Boolean).join(' '));
    var besitzer = mehrzeilig(p.kunde, p.ansprechpartner, p.strasse, [p.plz, p.ort].filter(Boolean).join(' '));
    var datum = p.aufmassDatum ? String(p.aufmassDatum).split('-').reverse().join('.') : '';
    var z = {};
    z.G1 = { v: 'Funktion', s: 'fett' };
    z.B2 = { v: 'Besteller', s: 'fett' }; z.C2 = { v: besteller, s: 'umbruch' };
    z.D2 = { v: 'Anlage: ', s: 'fett' }; z.F2 = { v: String(p.anlagenNr || '') }; z.G2 = { v: 'Menge', s: 'fett' };
    z.B3 = { v: 'Besitzer', s: 'fett' }; z.C3 = { v: besitzer, s: 'umbruch' };
    z.D3 = { v: 'System:\nOberfläche:\nDatum:\nObjekt:', s: 'umbruch' };
    z.F3 = { v: [systemName, p.oberflaeche, datum, p.objekt].map(function (x) { return x === null || x === undefined ? '' : String(x); }).join('\n'), s: 'umbruch' };
    z.G3 = { v: 'Schl.Nr', s: 'fett' };
    ['ZP', 'Tür.Nr.', 'Raumbezeichnung', 'Stk.', 'ESL', 'Type (Produktcode)', 'Zyl.Nr.'].forEach(function (k, i) {
      z[spaltenName(i + 1) + '4'] = { v: k, s: 'kopf' };
    });
    /* Die Schlüsselspalten sind 2,1 Zeichen schmal: Funktion und Schl.Nr
       stehen senkrecht (wie in der EVVA-Vorlage), die Menge in Schrift 8
       auf Zellbreite verkleinert. */
    var schlGekuerzt = [];
    spalten.forEach(function (sp, i) {
      var c = spaltenName(8 + i);
      z[c + '1'] = { v: String(sp.funktion || ''), s: 'senkrecht' };
      if (sp.menge > 0) z[c + '2'] = { v: sp.menge, s: 'zahlKlein' };
      var schlNr = String(sp.schlNr || '');
      if (schlNr.length > 10) schlGekuerzt.push('„' + schlNr + '“ → „' + schlNr.slice(0, 10) + '“ (' + (sp.funktion || c) + ')');
      z[c + '3'] = { v: schlNr.slice(0, 10), s: 'senkrechtFett' };
    });
    if (schlGekuerzt.length) warnungen.push('Schl.Nr. auf 10 Zeichen gekürzt: ' + schlGekuerzt.slice(0, 6).join('; ') + (schlGekuerzt.length > 6 ? '; …' : '') + '.');
    var ohneZylinder = plan.zeilen.filter(function (zeile) { return zeile.tuer.brauchtZylinder === false; });
    if (ohneZylinder.length) warnungen.push(ohneZylinder.length + (ohneZylinder.length === 1 ? ' Tür ohne Zylinderbedarf wurde' : ' Türen ohne Zylinderbedarf wurden') + ' nicht als Bestellzeile übernommen (' + ohneZylinder.slice(0, 5).map(function (zeile) { return zeile.tuer.nummer || zeile.tuer.bezeichnung; }).join(', ') + (ohneZylinder.length > 5 ? ', …' : '') + ').');
    var zeilen = plan.zeilen.filter(function (zeile) { return zeile.tuer.brauchtZylinder !== false; });
    var gekuerzt = [];
    function kuerzen(text, max, was, tuer) { text = String(text || ''); if (text.length <= max) return text; gekuerzt.push(was + ' „' + text + '“ (' + (tuer.nummer || tuer.bezeichnung) + ')'); return text.slice(0, max); }
    function zylKuerzen(zylNr, tuer) {
      zylNr = String(zylNr || ''); if (zylNr.length <= 10) return zylNr;
      var m = /^(.*?)(\.\d+)$/.exec(zylNr);
      var kurz = m ? m[1].slice(0, Math.max(1, 10 - m[2].length)) + m[2] : zylNr.slice(0, 10);
      gekuerzt.push('Zyl.Nr. „' + zylNr + '“ → „' + kurz + '“ (' + (tuer.nummer || tuer.bezeichnung) + ')');
      return kurz;
    }
    /* Ohne Türnummer gibt es keine Zylindernummer: Die Zelle bleibt leer,
       die Warnung nennt die Zeilen, damit die Nummer nachgetragen wird. */
    var ohneZylNr = [];
    zeilen.slice(0, 500).forEach(function (zeile, i) {
      var r = 5 + i;
      if (!String(zeile.zylNr || '').trim()) ohneZylNr.push(r);
      z['A' + r] = { v: i + 1 };
      z['B' + r] = { v: kuerzen(zeile.tuer.nummer, 10, 'Tür.Nr.', zeile.tuer) };
      z['C' + r] = { v: kuerzen(zeile.tuer.bezeichnung, 20, 'Raumbezeichnung', zeile.tuer) };
      z['D' + r] = { v: zeile.stk };
      if (zeile.esl !== null && zeile.esl !== undefined) z['E' + r] = { v: zeile.esl };
      if (zeile.produktcode) z['F' + r] = { v: zeile.produktcode };
      z['G' + r] = { v: zylKuerzen(zeile.zylNr, zeile.tuer) };
      spalten.forEach(function (sp, j) {
        var zeichen = zeile.zellen[sp.id];
        if (zeichen) z[spaltenName(8 + j) + r] = { v: zeichen, s: 'mitte' };
      });
    });
    for (var leer = zeilen.length; leer < 500; leer++) z['A' + (5 + leer)] = { v: leer + 1 };
    if (zeilen.length > 500) warnungen.push('Das Formular fasst 500 Zylinderzeilen; ' + (zeilen.length - 500) + ' weitere wurden nicht übernommen.');
    if (ohneZylNr.length) warnungen.push((ohneZylNr.length === 1 ? 'Eine Tür ohne Türnummer hat keine Zyl.Nr. (Zeile ' : ohneZylNr.length + ' Türen ohne Türnummer haben keine Zyl.Nr. (Zeilen ') + ohneZylNr.slice(0, 8).join(', ') + (ohneZylNr.length > 8 ? ', …' : '') + '); bitte die Türnummern nachtragen.');
    if (gekuerzt.length) warnungen.push('Auf die Längen des Formulars gekürzt: ' + gekuerzt.slice(0, 6).join('; ') + (gekuerzt.length > 6 ? '; …' : '') + '.');
    /* Zeilenhöhen: Zeile 1 nach dem längsten Funktionsnamen (senkrecht, Schrift 8,
       etwa 4,6 pt je Zeichen), Zeilen 2 und 3 nach dem Umbruch von Besteller,
       Besitzer und Anlagedaten. Die Vorlage gibt die Mindesthöhen vor. Nach
       oben sind die Höhen begrenzt: Die Zeilen 1 bis 4 wiederholen sich auf
       jeder Druckseite und müssen zusammen deutlich unter einer Seite bleiben. */
    var laengsteFunktion = spalten.reduce(function (m, sp) { return Math.max(m, String(sp.funktion || '').length); }, 0);
    var hoehen = {
      1: Math.max(84, Math.min(130, Math.round(laengsteFunktion * 4.6 + 10))),
      2: hoeheFuer(besteller, 18.7, 49.5, 90),
      3: Math.max(hoeheFuer(besitzer, 18.7, 60, 100), hoeheFuer(z.F3.v, 16.7, 60, 100)),
      4: 10.8
    };
    return { zellen: z, warnungen: warnungen, anzahlSpalten: spalten.length, anzahlZeilen: Math.min(zeilen.length, 500), hoehen: hoehen, plan: plan };
  }

  /* Vollständige Arbeitsmappe im EVVA-Layout (für xlsx.js) */
  function evvaMappe(p, einstellungen, art) {
    var blatt = evvaBlatt(p, einstellungen, art);
    var breiten = { A: 3.5, B: 8.1, C: 18.7, D: 4.0, E: 6.7, F: 16.7, G: 8.9, CY: 11.6 };
    for (var i = 8; i < 8 + SPALTEN_MAX; i++) breiten[spaltenName(i)] = 2.1;
    var vorlagen = {
      A1: { v: 'Mustereinträge', s: 'fett' }, B1: { v: 'System\nDatum\nObjekt', s: 'fettUmbruch' }, C1: { v: 'Anlage', s: 'fett' }, D1: { v: 'Besteller', s: 'fett' }, E1: { v: 'Besitzer', s: 'fett' },
      B2: { v: '4KS\nNI\n1.2.2017\nHauptbahnhof', s: 'muster' }, C2: { v: '171MU', s: 'muster' }, D2: { v: 'Firma MusterMax\nMax Mustermann\n3100 St.Pölten', s: 'muster' }, E2: { v: 'Wohnhaus\nEVVA GmbH\n1120 Wien\nWienerbergstraße 59-65', s: 'muster' },
      A6: { v: 'erlaubte Werte', s: 'fett' }, B6: { v: 'mögliche Zeichen Zylindernummer', s: 'fett' }, C6: { v: 'mögliche Zeichen Schlüsselnummer', s: 'fett' }, D6: { v: 'mögliche Zeichen Sperrkombination', s: 'fett' },
      B7: { v: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.-', s: 'muster' }, C7: { v: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.-', s: 'muster' }, D7: { v: 'XOZIMxozim', s: 'muster' },
      A10: { v: 'Längen', s: 'fett' }, B10: { v: 'Maximale Länge Türnummer', s: 'fett' }, C10: { v: 'Maximale Länge Schlüsselnummer', s: 'fett' }, D10: { v: 'Maximale Länge Zylindernummer', s: 'fett' }, E10: { v: 'Maximale Länge Raumbezeichnung', s: 'fett' },
      B11: { v: 10, s: 'muster' }, C11: { v: 10, s: 'muster' }, D11: { v: 10, s: 'muster' }, E11: { v: 20, s: 'muster' }
    };
    /* Druck: Tür- und Schlüsselbezeichnung auf jeder Seite wiederholen, nur
       den belegten Bereich drucken (mindestens 10 Zeilen für Nachträge von
       Hand), Querformat auf eine Seitenbreite. */
    var letzteSpalte = spaltenName(Math.max(8, 7 + blatt.anzahlSpalten));
    var letzteZeile = 4 + Math.max(10, blatt.anzahlZeilen);
    return {
      blaetter: [
        { name: 'Plan', zellen: blatt.zellen, breiten: breiten, hoehen: blatt.hoehen,
          verbund: ['D2:E2', 'D3:E3'], fixierung: { spalten: 7, zeilen: 4 },
          druck: { titel: '$A:$G,$1:$4', bereich: '$A$1:$' + letzteSpalte + '$' + letzteZeile, quer: true, einpassen: true },
          validierungen: [
            { bereich: 'H2:CX' + 2, typ: 'whole', op: 'greaterThanOrEqual', f1: '0', fehler: 'Hier die Anzahl der Schlüssel (als ganze Zahl) eintragen' },
            { bereich: 'H3:CX3', typ: 'textLength', op: 'lessThanOrEqual', f1: 'maxSlNr', fehler: 'Maximal 10 Zeichen!' },
            { bereich: 'H5:CX504', typ: 'list', f1: '"X,O,Z,I,M"', fehler: 'Erlaubt sind nur X, O, Z, I und M (Sperrkombination).' },
            { bereich: 'D5:D504', typ: 'whole', op: 'greaterThanOrEqual', f1: '0', fehler: 'Bestellmenge für Zylinder angeben!' },
            { bereich: 'E5:E504', typ: 'whole', op: 'greaterThanOrEqual', f1: '0', hinweis: 'Wenn "0" Stück ESL bestellt werden, wird die Sperrfunktion für den Eigenschlüssel im Zylinder vorgesehen.\n\nWenn dieses Feld leer gelassen wird gibt es für diesen Zylinder keinen Eigenschlüssel. Nur Zahlenwerte erlaubt!' },
            { bereich: 'B5:B504', typ: 'textLength', op: 'lessThanOrEqual', f1: 'maxTNr', fehler: 'Hier sind nur 10 Zeichen möglich' },
            { bereich: 'C5:C504', typ: 'textLength', op: 'lessThanOrEqual', f1: 'maxRaum', fehler: 'Hier sind nur 20 Zeichen möglich!' },
            { bereich: 'G5:G504', typ: 'textLength', op: 'lessThanOrEqual', f1: 'maxZylNr', fehler: 'Maximal 10 Zeichen!' }
          ] },
        { name: 'Vorlagen', zellen: vorlagen, breiten: { A: 3.3, B: 69.3, D: 34.5, E: 34.4, F: 11.4 }, hoehen: { 1: 39.6, 2: 52.8, 6: 37.5, 7: 37.5, 10: 22.5 },
          verbund: ['A1:A2', 'A6:A7', 'A10:A11'], versteckt: true }
      ],
      namen: { maxRaum: 'Vorlagen!$E$11', maxSlNr: 'Vorlagen!$C$11', maxTNr: 'Vorlagen!$B$11', maxZylNr: 'Vorlagen!$D$11',
               MusterAn: 'Vorlagen!$C$2', MusterBesitzer: 'Vorlagen!$E$2', MusterBesteller: 'Vorlagen!$D$2', MusterSDO: 'Vorlagen!$B$2',
               SlNrmgl: 'Vorlagen!$C$7', Sperrmgl: 'Vorlagen!$D$7', ZylNrmgl: 'Vorlagen!$B$7' },
      warnungen: blatt.warnungen, anzahlSpalten: blatt.anzahlSpalten, anzahlZeilen: blatt.anzahlZeilen
    };
  }

  /* Dateiname: wie die PDFs, aber .xlsx */
  function dateiName(p, art) {
    var basis = global.Reports && global.Reports.dateiName ? global.Reports.dateiName(p, art === 'kreuz' ? 'Kreuzschliessplan-EVVA' : 'Europlan-EVVA') : 'Schliessplan.pdf';
    return basis.replace(/\.pdf$/i, '.xlsx');
  }

  /* Lesbare Tabelle (für MCP, Tests und Prüfungen) */
  function alsText(plan) {
    var kopf = ['Zyl.Nr', 'Tür', 'ESL'].concat(plan.spalten.map(function (s) { return s.schlNr || '?'; }));
    var reihen = [kopf];
    plan.zeilen.forEach(function (z) {
      reihen.push([z.zylNr, (z.tuer.nummer || '') + ' ' + (z.tuer.bezeichnung || ''), z.esl === null ? '' : String(z.esl)]
        .concat(plan.spalten.map(function (s) { return z.zellen[s.id] || '·'; })));
    });
    var breiten = kopf.map(function (_, i) { return Math.max.apply(null, reihen.map(function (r) { return String(r[i] || '').length; })); });
    return reihen.map(function (r) { return r.map(function (x, i) { return String(x || '').padEnd(breiten[i]); }).join('  ').trimEnd(); }).join('\n');
  }

  global.Europlan = {
    ZEICHEN: ZEICHEN, ZEICHEN_TEXT: ZEICHEN_TEXT, SPALTEN_MAX: SPALTEN_MAX,
    analyse: analyse, europlan: europlan, kreuzplan: kreuzplan,
    moeglicheZeichen: moeglicheZeichen, zelleSetzen: zelleSetzen, inhaberAnlegen: inhaberAnlegen,
    eslSetzen: eslSetzen, tuerAnlegen: tuerAnlegen, gruppenMenge: gruppenMenge, eigeneSpalte: eigeneSpalte,
    evvaBlatt: evvaBlatt, evvaMappe: evvaMappe, dateiName: dateiName, alsText: alsText, spaltenName: spaltenName
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Europlan; }
})(typeof window !== 'undefined' ? window : globalThis);
