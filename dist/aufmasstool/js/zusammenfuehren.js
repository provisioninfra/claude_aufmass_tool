/* =============================================================================
 * zusammenfuehren.js — Drei-Wege-Vergleich für den Abgleich
 *
 * Zwei Geräte haben dasselbe Aufmaß verändert. Wer gewinnt?
 *
 * Die falsche Antwort wäre "der Letzte". Dann verliert still, wer zuerst
 * gespeichert hat - und bei einem Aufmaß mit vierzig Türen merkt das
 * niemand, bis die Bestellung falsch ist.
 *
 * Die richtige Antwort braucht einen dritten Stand: den letzten, bei dem
 * beide Seiten übereinstimmten (die "Basis"). Damit lässt sich für jede
 * einzelne Angabe sagen, WER sie geändert hat:
 *
 *   - nur ich geändert        -> meine Fassung
 *   - nur die andere Seite    -> deren Fassung
 *   - beide gleich geändert   -> einig, kein Streit
 *   - beide verschieden       -> echter Konflikt, danach wird gefragt
 *
 * In der Praxis arbeiten zwei Personen fast nie an derselben Angabe
 * derselben Tür. Darum läuft fast alles ohne Rückfrage zusammen.
 *
 * Dieses Modul rechnet nur - es kennt weder Netz noch Oberfläche.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* Listen, deren Einträge über ihre id zusammengeführt werden. */
  var LISTEN = {
    tueren: { name: 'Tür', bezeichnung: function (t) { return t.nummer || t.bezeichnung || 'ohne Nummer'; },
              unterlisten: ['fotos'] },
    schliessungen: { name: 'Schließung', bezeichnung: function (s) { return s.kuerzel || s.bezeichnung || 'ohne Kürzel'; },
                     unterlisten: ['personen'] },
    standorte: { name: 'Gliederung', bezeichnung: function (k) { return k.name || 'ohne Namen'; },
                 unterlisten: [] }
  };

  /* Verständliche Namen für die Angaben, über die gestritten werden kann. */
  var FELDNAMEN = {
    nummer: 'Tür-Nr.', bezeichnung: 'Bezeichnung / Raum', kategorie: 'Türkategorie',
    strukturId: 'Standort / Bereich', etage: 'Etage', anzahl: 'Anzahl baugleicher Türen',
    status: 'Status', notiz: 'Bemerkung', nacharbeit: 'Nacharbeit', nacharbeitText: 'Nacharbeit',
    masseAussen: 'Zylinderlänge außen', masseInnen: 'Zylinderlänge innen',
    zylinderBauform: 'Zylinder-Bauform', zylinderAusfuehrung: 'Zylinder-Ausführung',
    zylinderKnaufseite: 'Knaufseite',
    beschlagBauform: 'Beschlag-Bauform', beschlagSicherheit: 'Beschlag-Sicherheit',
    beschlagBestueckung: 'Beschlag-Bestückung',
    schlossBauform: 'Schloss-Bauform', schlossFunktion: 'Schloss-Funktion',
    schlossStulpform: 'Stulpform', schlossStulpbreite: 'Stulpbreite', schlossStulplaenge: 'Stulplänge',
    schlossFallenart: 'Fallenart', schlossVerriegelungspunkte: 'Verriegelungspunkte',
    schlossNorm: 'Schloss-Norm', schlossRiegelausschluss: 'Riegelausschluss',
    tuerblattstaerke: 'Türblattstärke', dornmass: 'Dornmaß', entfernung: 'Entfernung',
    vierkant: 'Nuss / Vierkant', profilbreite: 'Profilbreite',
    tuerbreite: 'Türbreite', tuerhoehe: 'Türhöhe', tuerAnschlag: 'Türanschlag',
    tuermaterial: 'Türmaterial', dinRichtung: 'DIN-Richtung', oeffnungsrichtung: 'Öffnungsrichtung',
    zutrittsseite: 'Zutrittsseite', tueranforderungen: 'Bauliche Anforderungen',
    brauchtZylinder: 'Zylinder nötig', brauchtBeschlag: 'Beschlag nötig',
    brauchtSchloss: 'Schloss nötig', brauchtWandleser: 'Wandleser nötig',
    tuerTechnologie: 'Ausführung', systemNotiz: 'Hinweis zum System',
    elFunkabdeckung: 'Funkabdeckung', elStromversorgung: 'Stromversorgung',
    elVernetzung: 'Vernetzung', elTuerueberwachung: 'Türüberwachung',
    elKabeluebergang: 'Kabelübergang', elLeitungsweg: 'Leitungsweg',
    elTueroeffnerBestand: 'Türöffner im Bestand',
    bestandFabrikat: 'Fabrikat im Bestand', bestandZylinderart: 'Zylinderart im Bestand',
    bestandLaenge: 'Länge im Bestand', bestandLaengeAussen: 'Bestandslänge außen',
    bestandLaengeInnen: 'Bestandslänge innen', bestandAnzahlSchluessel: 'Anzahl Schlüssel',
    bestandBemerkung: 'Bemerkung zum Bestand',
    kunde: 'Kunde', objekt: 'Objekt', kundenNr: 'Kunden-Nr.', anlagenNr: 'Anlagen-Nr.',
    strasse: 'Straße', plz: 'PLZ', ort: 'Ort', ansprechpartner: 'Ansprechpartner',
    telefon: 'Telefon', email: 'E-Mail', bearbeiter: 'Bearbeiter', datum: 'Aufmaßdatum',
    anlagenart: 'Art der Anlage', systemMechanik: 'Mechanisches System',
    systemElektronik: 'Elektronisches System', systemDetail: 'Detail zur Anlage',
    bemerkung: 'Bemerkung', kommission: 'Kommission', lieferAdresse: 'Lieferadresse',
    kuerzel: 'Kürzel', traegerArt: 'Trägerart', gruppenName: 'Gruppenname',
    medienTyp: 'Art des Mediums', anzahlMedien: 'Anzahl Medien',
    name: 'Name', funktion: 'Funktion / Abteilung', typ: 'Rang im Plan',
    sort: 'Reihenfolge', parentId: 'übergeordnet', ebene: 'Ebene',
    beschriftung: 'Bildunterschrift'
  };

  /* Angaben, die das Gerät selbst führt und über die nie gestritten wird. */
  var EGAL = { geaendert: true, schemaVersion: true, statusVonHand: true };

  function feldName(schluessel) {
    if (FELDNAMEN[schluessel]) { return FELDNAMEN[schluessel]; }
    /* Aus "schlossIrgendwas" wird "Schloss irgendwas" - besser als nichts. */
    var text = String(schluessel).replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /* --- Vergleichen --------------------------------------------------------- */
  function norm(wert) {
    if (wert === null || wert === undefined) { return ''; }
    return wert;
  }
  function gleich(a, b) {
    a = norm(a); b = norm(b);
    if (a === b) { return true; }
    if (typeof a === 'object' || typeof b === 'object') {
      try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
    }
    return false;
  }
  function nachId(liste) {
    var aus = {};
    (liste || []).forEach(function (x) { if (x && x.id) { aus[x.id] = x; } });
    return aus;
  }
  function kopie(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

  /* =========================================================================
   * Der Kern: ein einzelner Wert aus drei Ständen
   * ====================================================================== */
  function dreiWege(basis, meins, server) {
    var bm = gleich(basis, meins), bs = gleich(basis, server);
    if (bm && bs) { return { wert: norm(server), herkunft: 'gleich' }; }
    if (bm) { return { wert: norm(server), herkunft: 'fremd' }; }
    if (bs) { return { wert: norm(meins), herkunft: 'meins' }; }
    if (gleich(meins, server)) { return { wert: norm(meins), herkunft: 'einig' }; }
    return { wert: norm(meins), herkunft: 'streit' };
  }

  /* Felder eines Datensatzes zusammenführen. */
  function satz(basis, meins, server, zusammenhang, konflikte, bericht, unterlisten) {
    var b = basis || {}, m = meins || {}, s = server || {};
    var ergebnis = {};
    var schluessel = {};
    [b, m, s].forEach(function (o) { Object.keys(o).forEach(function (k) { schluessel[k] = true; }); });

    Object.keys(schluessel).forEach(function (k) {
      if (EGAL[k]) { ergebnis[k] = norm(m[k] !== undefined ? m[k] : s[k]); return; }

      /* Unterlisten (Fotos, Personen) nach id zusammenführen statt als
         Ganzes zu vergleichen - sonst stritte man über eine Liste, nur
         weil beide Seiten je ein Foto ergänzt haben. */
      if (unterlisten && unterlisten.indexOf(k) !== -1) {
        ergebnis[k] = liste(b[k], m[k], s[k], zusammenhang, k, konflikte, bericht);
        return;
      }

      var e = dreiWege(b[k], m[k], s[k]);
      if (e.herkunft === 'streit') {
        konflikte.push({
          id: zusammenhang.pfad + ':' + k,
          bereich: zusammenhang.bereich,
          gegenstand: zusammenhang.bezeichnung,
          feld: k,
          feldName: feldName(k),
          meins: m[k],
          server: s[k]
        });
        ergebnis[k] = norm(m[k]);      /* vorläufig meine Fassung */
      } else {
        ergebnis[k] = e.wert;
        if (e.herkunft === 'meins') { bericht.meine++; }
        if (e.herkunft === 'fremd') { bericht.fremde++; }
      }
    });
    return ergebnis;
  }

  /* Eine Liste von Datensätzen mit id zusammenführen. */
  function liste(basis, meins, server, zusammenhang, schluessel, konflikte, bericht) {
    var b = nachId(basis), m = nachId(meins), s = nachId(server);
    var ids = {};
    [basis, meins, server].forEach(function (l) {
      (l || []).forEach(function (x) { if (x && x.id) { ids[x.id] = true; } });
    });

    /* Reihenfolge: zuerst wie auf dem Server (der gemeinsame Bezug),
       danach, was nur hier dazugekommen ist. So landen beide Geräte nach
       einem Durchgang bei derselben Reihenfolge. */
    var folge = [];
    (server || []).forEach(function (x) { if (x && x.id && ids[x.id]) { folge.push(x.id); } });
    (meins || []).forEach(function (x) {
      if (x && x.id && ids[x.id] && folge.indexOf(x.id) === -1) { folge.push(x.id); }
    });
    (basis || []).forEach(function (x) {
      if (x && x.id && ids[x.id] && folge.indexOf(x.id) === -1) { folge.push(x.id); }
    });

    var aus = [];
    folge.forEach(function (id) {
      var inB = !!b[id], inM = !!m[id], inS = !!s[id];

      /* Neu auf einer Seite -> übernehmen, darüber gibt es nichts zu streiten */
      if (!inB && inM && !inS) { aus.push(kopie(m[id])); bericht.meine++; return; }
      if (!inB && !inM && inS) { aus.push(kopie(s[id])); bericht.fremde++; return; }

      /* Auf beiden Seiten entfernt */
      if (inB && !inM && !inS) { bericht.entfernt++; return; }

      /* Auf einer Seite entfernt */
      if (inB && !inM && inS) {
        if (gleich(b[id], s[id])) { bericht.entfernt++; return; }   /* drüben unverändert -> weg */
        konflikte.push(geloeschtKonflikt(zusammenhang, schluessel, id, null, s[id]));
        aus.push(kopie(s[id]));
        return;
      }
      if (inB && inM && !inS) {
        if (gleich(b[id], m[id])) { bericht.entfernt++; return; }    /* hier unverändert -> weg */
        konflikte.push(geloeschtKonflikt(zusammenhang, schluessel, id, m[id], null));
        aus.push(kopie(m[id]));
        return;
      }

      /* Auf beiden Seiten vorhanden: Feld für Feld */
      var kennung = beschreiben(schluessel, m[id] || s[id] || b[id], id);
      var unten = {
        bereich: kennung.bereich,
        bezeichnung: kennung.text,
        pfad: zusammenhang.pfad + '/' + schluessel + '/' + id
      };
      aus.push(satz(b[id], m[id], s[id], unten, konflikte, bericht,
        LISTEN[schluessel] ? LISTEN[schluessel].unterlisten : []));
    });
    return aus;
  }

  function beschreiben(schluessel, eintrag, id) {
    var k = LISTEN[schluessel];
    if (k) { return { bereich: k.name, text: k.bezeichnung(eintrag || {}) }; }
    if (schluessel === 'fotos') { return { bereich: 'Foto', text: (eintrag && eintrag.beschriftung) || 'ohne Unterschrift' }; }
    if (schluessel === 'personen') { return { bereich: 'Person', text: (eintrag && eintrag.name) || 'ohne Namen' }; }
    return { bereich: schluessel, text: String(id).slice(0, 12) };
  }

  function geloeschtKonflikt(zusammenhang, schluessel, id, meins, server) {
    var kennung = beschreiben(schluessel, meins || server, id);
    return {
      id: zusammenhang.pfad + '/' + schluessel + '/' + id + ':__geloescht',
      bereich: kennung.bereich,
      gegenstand: kennung.text,
      feld: '__geloescht',
      feldName: meins ? 'auf der anderen Seite gelöscht' : 'hier gelöscht',
      geloescht: true,
      meins: meins ? kennung.text + ' (geändert)' : '(gelöscht)',
      server: server ? kennung.text + ' (geändert)' : '(gelöscht)'
    };
  }

  /* =========================================================================
   * Zwei Fassungen eines Aufmaßes zusammenführen
   * ====================================================================== */
  function projekte(basis, meins, server) {
    var konflikte = [];
    var bericht = { meine: 0, fremde: 0, entfernt: 0 };
    var b = basis || {}, m = meins || {}, s = server || {};
    var ergebnis = {};

    var schluessel = {};
    [b, m, s].forEach(function (o) { Object.keys(o).forEach(function (k) { schluessel[k] = true; }); });

    var oben = { bereich: 'Aufmaß', bezeichnung: m.kunde || s.kunde || 'Aufmaß', pfad: 'projekt' };

    Object.keys(schluessel).forEach(function (k) {
      if (EGAL[k]) { ergebnis[k] = norm(m[k] !== undefined ? m[k] : s[k]); return; }

      if (LISTEN[k]) {
        ergebnis[k] = liste(b[k], m[k], s[k], oben, k, konflikte, bericht);
        return;
      }
      if (k === 'matrix') {
        ergebnis[k] = matrix(b[k], m[k], s[k], konflikte, bericht, ergebnis);
        return;
      }
      var e = dreiWege(b[k], m[k], s[k]);
      if (e.herkunft === 'streit') {
        konflikte.push({
          id: 'projekt:' + k, bereich: 'Aufmaß', gegenstand: 'Stammdaten',
          feld: k, feldName: feldName(k), meins: m[k], server: s[k]
        });
        ergebnis[k] = norm(m[k]);
      } else {
        ergebnis[k] = e.wert;
        if (e.herkunft === 'meins') { bericht.meine++; }
        if (e.herkunft === 'fremd') { bericht.fremde++; }
      }
    });

    /* Die id bleibt immer die des Aufmaßes */
    ergebnis.id = m.id || s.id || b.id;
    return { ergebnis: ergebnis, konflikte: konflikte, bericht: bericht };
  }

  /* Der Kreuzschließplan ist eine Zuordnung Schlüssel -> Wert. */
  function matrix(basis, meins, server, konflikte, bericht) {
    var b = basis || {}, m = meins || {}, s = server || {};
    var aus = {};
    var schluessel = {};
    [b, m, s].forEach(function (o) { Object.keys(o).forEach(function (k) { schluessel[k] = true; }); });

    Object.keys(schluessel).forEach(function (k) {
      var e = dreiWege(b[k], m[k], s[k]);
      if (e.herkunft === 'streit') {
        konflikte.push({
          id: 'matrix:' + k, bereich: 'Schließplan', gegenstand: 'Berechtigung',
          feld: k, feldName: 'Kreuz im Plan', matrix: true,
          meins: m[k], server: s[k]
        });
        if (norm(m[k]) !== '') { aus[k] = m[k]; }
      } else {
        if (norm(e.wert) !== '') { aus[k] = e.wert; }
        if (e.herkunft === 'meins') { bericht.meine++; }
        if (e.herkunft === 'fremd') { bericht.fremde++; }
      }
    });
    return aus;
  }

  /* =========================================================================
   * Entscheidungen des Benutzers nachtragen
   * ====================================================================== */
  function anwenden(ergebnis, konflikte, wahl) {
    var aus = kopie(ergebnis);
    (konflikte || []).forEach(function (k) {
      if ((wahl || {})[k.id] !== 'server') { return; }   /* meine Fassung steht schon */
      setzen(aus, k, k.server);
    });
    return aus;
  }

  function setzen(projekt, konflikt, wert) {
    if (konflikt.matrix) {
      if (norm(wert) === '') { delete projekt.matrix[konflikt.feld]; }
      else { projekt.matrix[konflikt.feld] = wert; }
      return;
    }
    if (konflikt.geloescht) { return; }   /* wird eigens behandelt */

    var teile = String(konflikt.id).split(':')[0].split('/');
    if (teile.length === 1) { projekt[konflikt.feld] = norm(wert); return; }

    /* projekt/<liste>/<id>[/<unterliste>/<id>] */
    var stelle = projekt, i = 1;
    while (i < teile.length) {
      var listenName = teile[i], id = teile[i + 1];
      var ziel = null;
      (stelle[listenName] || []).forEach(function (x) { if (x && x.id === id) { ziel = x; } });
      if (!ziel) { return; }
      stelle = ziel; i += 2;
    }
    stelle[konflikt.feld] = norm(wert);
  }

  global.Zusammenfuehren = {
    projekte: projekte,
    anwenden: anwenden,
    feldName: feldName,
    dreiWege: dreiWege,
    gleich: gleich
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Zusammenfuehren; }
})(typeof window !== 'undefined' ? window : globalThis);
