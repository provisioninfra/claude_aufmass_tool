/* =============================================================================
 * model.js — Datenmodell, Migration und Validierung
 * ========================================================================== */
(function (global) {
  'use strict';

  var SCHEMA_VERSION = 1;

  /* Der Katalog wird an mehreren Stellen gebraucht (Bezeichnungen, abgeleitete
   * Technologie). Zugriff über eine Funktion, damit die Ladereihenfolge der
   * Dateien keine Rolle spielt. */
  function kat() { return global.Katalog || null; }

  function uid(prefix) {
    return (prefix || 'id') + '-' +
      Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 9);
  }

  function heute() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* --- Projekt ----------------------------------------------------------- */
  function neuesProjekt(name) {
    return {
      id: uid('prj'),
      schemaVersion: SCHEMA_VERSION,
      name: name || 'Neues Aufmaß',
      kunde: '',
      kundenNr: '',
      objekt: '',
      strasse: '',
      plz: '',
      ort: '',
      ansprechpartner: '',
      telefon: '',
      email: '',
      anlagenNr: '',
      bearbeiter: '',

      /* --- Schließsystem der Anlage --------------------------------------
       * Gilt für das gesamte Projekt. Nur bei der Anlagenart "hybrid" wird
       * je Tür entschieden, welches der beiden Systeme zum Einsatz kommt. */
      anlagenart: '',             // 'mechanik' | 'elektronik' | 'hybrid'
      systemMechanik: '',         // bei 'mechanik' und 'hybrid'
      systemElektronik: '',       // bei 'elektronik' und 'hybrid'
      systemDetail: '',           // Freitext zur Anlage

      aufmassDatum: heute(),
      bemerkung: '',

      /* --- Angaben, die allein für die Bestellung gebraucht werden -------
       * Die Lieferadresse wird nur geführt, wenn sie von der Objektadresse
       * abweicht - sonst stünde dieselbe Anschrift zweimal im Dokument. */
      lieferAdresse: '',
      kommission: '',             // Bestellzeichen / Kommission des Lieferanten
      /* Verknüpfung zu Pipedrive, sofern das Projekt von dort stammt.
       * Enthält nur Kennungen und den Link - niemals Zugangsdaten. */
      pipedrive: null,

      erstellt: new Date().toISOString(),
      geaendert: new Date().toISOString(),
      standorte: [],      // Struktur: Standort > Gebäude > Etage/Abteilung
      tueren: [],
      schliessungen: [],  // Spalten des Kreuzschließplans
      matrix: {}          // "tuerId|schliessungId" -> BerechtigungsId
    };
  }

  /* =========================================================================
   * Welches System gilt für eine bestimmte Tür?
   * ======================================================================
   * Bei einer reinen Anlage ergibt es sich unmittelbar aus dem Projekt.
   * Bei einer Hybridanlage entscheidet die Angabe an der Tür.
   */
  function tuerSystemId(projekt, tuer) {
    if (!projekt) return '';
    if (projekt.anlagenart === 'mechanik') return projekt.systemMechanik || '';
    if (projekt.anlagenart === 'elektronik') return projekt.systemElektronik || '';
    if (projekt.anlagenart === 'hybrid') {
      if (tuer && tuer.tuerTechnologie === 'mechanik') return projekt.systemMechanik || '';
      if (tuer && tuer.tuerTechnologie === 'elektronik') return projekt.systemElektronik || '';
      return '';   /* an dieser Tür noch nicht entschieden */
    }
    return '';
  }

  /* Technologie dieser Tür: bei reinen Anlagen aus der Anlagenart,
   * bei Hybrid aus der Entscheidung an der Tür. */
  function tuerTechnologie(projekt, tuer) {
    if (!projekt) return '';
    if (projekt.anlagenart === 'hybrid') return (tuer && tuer.tuerTechnologie) || '';
    return projekt.anlagenart || '';
  }

  function istTuerElektronisch(projekt, tuer) {
    return tuerTechnologie(projekt, tuer) === 'elektronik';
  }

  /* Ist die Anlage überhaupt schon festgelegt? */
  function anlageVollstaendig(projekt) {
    if (!projekt || !projekt.anlagenart) return false;
    if (projekt.anlagenart === 'mechanik') return !!projekt.systemMechanik;
    if (projekt.anlagenart === 'elektronik') return !!projekt.systemElektronik;
    if (projekt.anlagenart === 'hybrid') return !!projekt.systemMechanik && !!projekt.systemElektronik;
    return false;
  }

  /* --- Struktur ----------------------------------------------------------
   * Bewusst flach mit Parent-Referenz: einfacher zu serialisieren, zu
   * sortieren und in Listen/PDF zu gruppieren als ein echter Baum.
   * ebene: 'standort' | 'gebaeude' | 'bereich'
   * -------------------------------------------------------------------- */
  function neuerStrukturknoten(ebene, name, parentId) {
    return {
      id: uid('str'),
      ebene: ebene,
      name: name || '',
      parentId: parentId || null,
      bemerkung: '',
      sort: 0
    };
  }

  /* --- Tür ---------------------------------------------------------------- */
  function neueTuer(vorgabe) {
    var t = {
      id: uid('tur'),
      nummer: '',                 // Türnummer / Kurzbezeichnung, z.B. "EG.01"
      bezeichnung: '',            // Raumname, z.B. "Büro Geschäftsleitung"
      strukturId: null,           // Referenz auf Strukturknoten (tiefste Ebene)
      etage: '',                  // freies Etagenfeld, falls keine Struktur gepflegt
      kategorie: '',
      anzahl: 1,                  // identische Türen zusammenfassen
      status: 'aufgemessen',      // beim Anlegen gilt die Tür als aufgemessen
      statusVonHand: false,       // true, sobald der Status selbst gewählt wurde

      /* --- System ---
       * Das System steht im Projekt. Hier wird nur bei einer Hybridanlage
       * entschieden, ob diese Tür mechanisch oder elektronisch ausgeführt
       * wird; bei reinen Anlagen ergibt sich alles aus dem Projekt. */
      tuerTechnologie: '',        // nur bei Hybridanlage: 'mechanik' | 'elektronik'
      systemNotiz: '',            // Abweichung oder Besonderheit zu dieser Tür

      /* --- Bauteilbedarf ---
       * Jede Angabe wird genau einmal erfasst. Die Technologie steckt im
       * System, nicht noch einmal in der Bauform. */
      brauchtZylinder: true,
      brauchtBeschlag: false,
      brauchtSchloss: false,
      brauchtWandleser: false,

      zylinderBauform: '',        // genau eine Bauform
      zylinderAusfuehrung: [],    // Zusatzfunktionen, mehrere möglich
      zylinderKnaufseite: '',     // nur bei Knaufzylinder

      beschlagBauform: '',
      beschlagBestueckung: '',
      beschlagSicherheit: '',     // nur bei Schutzbeschlag
      beschlagAusfuehrung: '',    // mechanisch oder elektronisch, ein-/beidseitig

      schlossBauform: '',
      schlossFunktion: '',

      /* --- Einsteckschloss im Detail (freiwillig) ---
       * Beim Bestellen eines Einsteckschlosses entscheidend, beim Aufmaß
       * vor Ort aber nicht immer zu ermitteln. Daher nie Pflicht. */
      schlossStulpform: '',
      schlossStulpbreite: '',
      schlossStulplaenge: '',
      schlossFallenart: '',           // stand früher in der Liste der Funktionen
      schlossRiegelausschluss: '',
      schlossVerriegelungspunkte: '',
      schlossNorm: '',

      komponenten: [],            // nur Bauteile, die sonst nirgends erfasst sind

      /* --- Zutritt und Anforderungen --- */
      zutrittsseite: '',          // genau eine Angabe
      tueranforderungen: [],      // bauliche Anforderungen, mehrere möglich

      /* --- Maße --- */
      masseAussen: '',            // Zylinderlänge außen (mm)
      masseInnen: '',             // Zylinderlänge innen (mm)
      tuerblattstaerke: '',
      dornmass: '',
      entfernung: '',             // PZ-Entfernung Drücker->Zylinder
      vierkant: '',
      profilbreite: '',
      bohrbild: '',
      stulpmass: '',
      tuermaterial: '',
      dinRichtung: '',
      oeffnungsrichtung: '',
      masseBemerkung: '',

      /* --- Türmaße (freiwillig) --- */
      tuerbreite: '',
      tuerhoehe: '',
      tuerAnschlag: '',               // gefälzt / stumpf einschlagend

      /* --- Bestand (Altanlage) --- */
      bestandFabrikat: '',
      bestandZylinderart: '',
      bestandLaengeAussen: '',    // getrennt, damit beides auswählbar ist
      bestandLaengeInnen: '',
      bestandLaenge: '',          // früherer Sammeltext, z. B. "30/35"
      bestandAnzahlSchluessel: '',
      bestandBemerkung: '',

      /* --- Elektronik --- */
      elFunkabdeckung: '',        // gut / mittel / schlecht / nicht geprüft
      elStromversorgung: '',      // Batterie / 12V / PoE / vorhanden
      elVernetzung: '',           // offline / virtuelles Netzwerk / online
      elTuerueberwachung: false,
      elBemerkung: '',

      /* --- Strom und Kabel an der Tür (freiwillig) ---
       * Entscheidet bei elektronischen Beschlägen und Motorschlössern,
       * ob zusätzlich verlegt werden muss. */
      elKabeluebergang: '',
      elTueroeffnerBestand: false,
      elLeitungsweg: '',

      /* --- Notizen / Mängel --- */
      notiz: '',
      nacharbeit: false,
      nacharbeitText: '',

      /* --- Medien --- */
      fotos: [],                  // [{id, dataUrl, beschriftung, erstellt}]

      erstellt: new Date().toISOString(),
      geaendert: new Date().toISOString()
    };
    if (vorgabe) { for (var k in vorgabe) { if (Object.prototype.hasOwnProperty.call(vorgabe, k)) t[k] = vorgabe[k]; } }
    return t;
  }

  /* Nächste laufende Türnummer eines Projekts. Gezählt wird bei 001
   * beginnend; vorhandene rein numerische Nummern werden berücksichtigt,
   * damit nach dem Löschen keine Nummer doppelt vergeben wird. */
  function naechsteLaufendeNummer(projekt) {
    var hoechste = 0;
    (projekt && projekt.tueren || []).forEach(function (t) {
      var treffer = /^0*(\d{1,6})$/.exec(String(t.nummer || '').trim());
      if (treffer) {
        var n = parseInt(treffer[1], 10);
        if (n > hoechste) hoechste = n;
      }
    });
    var naechste = String(hoechste + 1);
    while (naechste.length < 3) naechste = '0' + naechste;
    return naechste;
  }

  /* --- Schließung (Spalte im Kreuzschließplan) ---------------------------- */
  function neueSchliessung(vorgabe) {
    var s = {
      id: uid('sch'),
      kuerzel: '',
      bezeichnung: '',
      typ: 'ez',                 // Rang im Plan: GHS, HS, GS, UGS, EZ, extern

      /* --- Träger: wer hält dieses Medium in der Hand? ---
       * 'einzel' = namentlich benannte Personen, 'gruppe' = benannte Gruppe
       * mit Mitgliederliste. Bewusst getrennt vom Rang im Plan. */
      traegerArt: '',
      gruppenName: '',
      personen: [],              // [{ id, name, funktion, anzahlMedien }]

      anzahlMedien: 1,           // Anzahl Schlüssel / Transponder / Karten
      medienTyp: '',             // Art des Mediums - bestellrelevant
      medienVonHand: false,      // true: Zahl wurde selbst eingetragen
      person: '',                // aus früheren Fassungen, wird überführt
      abteilung: '',             // aus früheren Fassungen, wird überführt
      bemerkung: '',
      sort: 0
    };
    if (vorgabe) { for (var k in vorgabe) { if (Object.prototype.hasOwnProperty.call(vorgabe, k)) s[k] = vorgabe[k]; } }
    return s;
  }

  /* --- Person einer Schließung -------------------------------------------- */
  function neuePerson(vorgabe) {
    var x = { id: uid('per'), name: '', funktion: '', anzahlMedien: 1 };
    if (vorgabe) { for (var k in vorgabe) { if (Object.prototype.hasOwnProperty.call(vorgabe, k)) x[k] = vorgabe[k]; } }
    return x;
  }

  /* Anzahl Medien einer Schließung.
   * Sie ergibt sich aus der Summe der Personen - außer die Zahl wurde
   * ausdrücklich selbst eingetragen. Dann gilt die eingetragene Zahl. */
  function medienAnzahl(schliessung) {
    var s = schliessung || {};
    var personen = (s.personen || []).filter(function (x) { return x && String(x.name || '').trim(); });
    if (s.medienVonHand || !personen.length) {
      var n = parseInt(s.anzahlMedien, 10);
      return (!n || n < 0) ? 0 : n;
    }
    return personen.reduce(function (sum, x) {
      var n2 = parseInt(x.anzahlMedien, 10);
      return sum + ((!n2 || n2 < 1) ? 1 : n2);
    }, 0);
  }

  /* Die errechnete Anzahl in die Schließung zurückschreiben, damit
   * Exporte und ältere Auswertungen dieselbe Zahl sehen. */
  function medienAngleichen(schliessung) {
    if (!schliessung) return 0;
    var n = medienAnzahl(schliessung);
    schliessung.anzahlMedien = n;
    return n;
  }

  /* Welche Identmedien kommen in diesem Projekt überhaupt in Frage?
   * Sie ergeben sich aus den gewählten Systemen - ein AirKey-Projekt
   * braucht keine Auswahl über SimonsVoss-Transponder. */
  function identmedienAuswahl(projekt, extraSysteme) {
    var K2 = kat();
    if (!K2) return [];
    var aus = [], gesehen = {};
    [projekt && projekt.systemMechanik, projekt && projekt.systemElektronik]
      .filter(Boolean).forEach(function (sid) {
        var sys = K2.systemById(sid, extraSysteme);
        ((sys && sys.identmedien) || []).forEach(function (m) {
          if (gesehen[m]) return;
          gesehen[m] = true; aus.push(m);
        });
      });
    return aus;
  }

  /* --- Matrix-Zugriff ----------------------------------------------------- */
  function matrixKey(tuerId, schliessungId) { return tuerId + '|' + schliessungId; }

  function getBerechtigung(projekt, tuerId, schliessungId) {
    return projekt.matrix[matrixKey(tuerId, schliessungId)] || 'nein';
  }

  function setBerechtigung(projekt, tuerId, schliessungId, wert) {
    var key = matrixKey(tuerId, schliessungId);
    if (!wert || wert === 'nein') { delete projekt.matrix[key]; }
    else { projekt.matrix[key] = wert; }
    return projekt;
  }

  /* Entfernt Matrixeinträge, deren Tür oder Schließung gelöscht wurde. */
  function matrixAufraeumen(projekt) {
    var tIds = {}, sIds = {}, i;
    for (i = 0; i < projekt.tueren.length; i++) tIds[projekt.tueren[i].id] = true;
    for (i = 0; i < projekt.schliessungen.length; i++) sIds[projekt.schliessungen[i].id] = true;
    var entfernt = 0;
    Object.keys(projekt.matrix).forEach(function (key) {
      var teile = key.split('|');
      if (!tIds[teile[0]] || !sIds[teile[1]]) { delete projekt.matrix[key]; entfernt++; }
    });
    return entfernt;
  }

  /* --- Strukturpfad ------------------------------------------------------- */
  function strukturPfad(projekt, strukturId) {
    var pfad = [], guard = 0;
    var knoten = findeStruktur(projekt, strukturId);
    while (knoten && guard++ < 20) {
      pfad.unshift(knoten);
      knoten = knoten.parentId ? findeStruktur(projekt, knoten.parentId) : null;
    }
    return pfad;
  }

  function strukturPfadText(projekt, strukturId, trenner) {
    return strukturPfad(projekt, strukturId).map(function (k) { return k.name; })
      .join(trenner || ' › ');
  }

  function findeStruktur(projekt, id) {
    if (!id) return null;
    for (var i = 0; i < projekt.standorte.length; i++) {
      if (projekt.standorte[i].id === id) return projekt.standorte[i];
    }
    return null;
  }

  function kinderVon(projekt, parentId) {
    return projekt.standorte.filter(function (k) { return k.parentId === (parentId || null); })
      .sort(function (a, b) { return (a.sort - b.sort) || a.name.localeCompare(b.name, 'de'); });
  }

  /* Ein Knoten und alle seine Unterknoten - als Kennungsliste. */
  function knotenMitUnter(projekt, knotenId) {
    var ids = [knotenId], i = 0;
    while (i < ids.length) {
      var aktuell = ids[i++];
      (projekt.standorte || []).forEach(function (k) {
        if (k.parentId === aktuell && ids.indexOf(k.id) === -1) ids.push(k.id);
      });
    }
    return ids;
  }

  /* Alle Türen eines Bereichs einschließlich seiner Unterbereiche, in der
   * Reihenfolge der Gliederung. */
  function tuerenUnter(projekt, knotenId) {
    var ids = knotenMitUnter(projekt, knotenId);
    var ordnung = strukturReihenfolge(projekt);
    return (projekt.tueren || []).filter(function (t) {
      return ids.indexOf(t.strukturId) !== -1;
    }).sort(function (a, b) {
      var oa = ordnung[a.strukturId] || 0, ob = ordnung[b.strukturId] || 0;
      if (oa !== ob) return oa - ob;
      return String(a.nummer || '').localeCompare(String(b.nummer || ''), 'de', { numeric: true }) ||
             String(a.bezeichnung || '').localeCompare(String(b.bezeichnung || ''), 'de');
    });
  }

  /* Löscht Knoten inkl. aller Unterknoten; Türen werden abgehängt (strukturId=null). */
  function loescheStruktur(projekt, id) {
    var zuLoeschen = [id];
    var i = 0;
    while (i < zuLoeschen.length) {
      var aktuell = zuLoeschen[i++];
      projekt.standorte.forEach(function (k) {
        if (k.parentId === aktuell && zuLoeschen.indexOf(k.id) === -1) zuLoeschen.push(k.id);
      });
    }
    projekt.standorte = projekt.standorte.filter(function (k) { return zuLoeschen.indexOf(k.id) === -1; });
    projekt.tueren.forEach(function (t) {
      if (zuLoeschen.indexOf(t.strukturId) !== -1) t.strukturId = null;
    });
    return zuLoeschen.length;
  }

  /* Reihenfolge der Strukturknoten in Baum-Durchlaufreihenfolge (Tiefensuche).
   * Damit erscheint "Erdgeschoss" vor "1. Obergeschoss", sofern der Anwender
   * die Knoten in dieser Reihenfolge angelegt bzw. sortiert hat. */
  function strukturReihenfolge(projekt) {
    var ordnung = {}, zaehler = 0;
    function lauf(parentId, tiefe) {
      if (tiefe > 10) return;
      kinderVon(projekt, parentId).forEach(function (k) {
        ordnung[k.id] = ++zaehler;
        lauf(k.id, tiefe + 1);
      });
    }
    lauf(null, 0);
    return ordnung;
  }

  /* --- Türen gruppiert nach Struktur (für Listen & PDF) ------------------- */
  function tuerenGruppiert(projekt) {
    var gruppen = [], index = {};
    var ordnung = strukturReihenfolge(projekt);
    projekt.tueren.forEach(function (t) {
      var key = t.strukturId || '__ohne__';
      if (!index[key]) {
        index[key] = {
          key: key,
          titel: t.strukturId ? strukturPfadText(projekt, t.strukturId) : 'Ohne Zuordnung',
          tueren: []
        };
        gruppen.push(index[key]);
      }
      index[key].tueren.push(t);
    });
    gruppen.sort(function (a, b) {
      if (a.key === '__ohne__') return 1;
      if (b.key === '__ohne__') return -1;
      var oa = ordnung[a.key], ob = ordnung[b.key];
      if (oa !== undefined && ob !== undefined) return oa - ob;
      return a.titel.localeCompare(b.titel, 'de', { numeric: true });
    });
    gruppen.forEach(function (g) {
      g.tueren.sort(function (a, b) {
        return String(a.nummer || '').localeCompare(String(b.nummer || ''), 'de', { numeric: true }) ||
               String(a.bezeichnung || '').localeCompare(String(b.bezeichnung || ''), 'de');
      });
    });
    return gruppen;
  }

  /* =========================================================================
   * Blanko-Schließplan aus der Gebäudestruktur
   * ======================================================================
   * Legt die übliche Hierarchie an: ein Generalhauptschlüssel über alles,
   * je Gebäude ein Hauptschlüssel, je Bereich ein Gruppenschlüssel und auf
   * Wunsch je Tür eine Einzelschließung. Die Berechtigungen werden gleich
   * mitgesetzt, sodass ein vollständiger Plan zum Überarbeiten entsteht.
   *
   * optionen: { ghs, proGebaeude, proBereich, proTuer, vorhandeneErsetzen }
   */
  function blankoSchliessplan(projekt, optionen) {
    optionen = optionen || {};
    var neueSchliessungen = [];
    var neueMatrix = optionen.vorhandeneErsetzen ? {} : null;
    var sortZaehler = 0;

    function anlegen(vorgabe, tuerIds) {
      var s = neueSchliessung(vorgabe);
      s.sort = sortZaehler++;
      neueSchliessungen.push(s);
      s.__tueren = tuerIds;
      return s;
    }

    /* Türen je Strukturknoten einschließlich aller Unterknoten */
    function tuerIdsUnter(knotenId) {
      return tuerenUnter(projekt, knotenId).map(function (t) { return t.id; });
    }

    var alleTuerIds = projekt.tueren.map(function (t) { return t.id; });

    if (optionen.ghs !== false && alleTuerIds.length) {
      anlegen({ kuerzel: 'GHS', bezeichnung: 'Generalhauptschlüssel', typ: 'ghs',
                anzahlMedien: 2 }, alleTuerIds);
    }

    /* Je Gebäude ein Hauptschlüssel; gibt es keine Gebäudeebene, greift die
       oberste vorhandene Ebene. */
    if (optionen.proGebaeude !== false) {
      var gebaeude = projekt.standorte.filter(function (k) { return k.ebene === 'gebaeude'; });
      if (!gebaeude.length) gebaeude = kinderVon(projekt, null);
      gebaeude.forEach(function (g) {
        var ids = tuerIdsUnter(g.id);
        if (!ids.length) return;
        anlegen({ kuerzel: 'HS-' + kuerzelAus(g.name), bezeichnung: 'Hauptschlüssel ' + g.name,
                  typ: 'hs', anzahlMedien: 2 }, ids);
      });
    }

    /* Je Bereich bzw. Etage ein Gruppenschlüssel */
    if (optionen.proBereich) {
      projekt.standorte.filter(function (k) { return k.ebene === 'bereich'; }).forEach(function (b) {
        var ids = tuerIdsUnter(b.id);
        if (!ids.length) return;
        /* Ein Gruppenschlüssel gehört einer Gruppe - der Bereichsname ist
         * der naheliegende Gruppenname. Die Mitglieder trägt der Anwender
         * nach; erfunden wird niemand. */
        anlegen({ kuerzel: 'GS-' + kuerzelAus(b.name), bezeichnung: 'Gruppe ' + b.name,
                  typ: 'gs', traegerArt: 'gruppe', gruppenName: b.name,
                  anzahlMedien: 1, medienVonHand: true }, ids);
      });
    }

    /* Je Tür eine Einzelschließung */
    if (optionen.proTuer) {
      tuerenGruppiert(projekt).forEach(function (gruppe) {
        gruppe.tueren.forEach(function (t) {
          var bez = t.nummer || t.bezeichnung || 'Tür';
          anlegen({ kuerzel: 'EZ-' + (t.nummer || kuerzelAus(t.bezeichnung)),
                    bezeichnung: 'Einzelschließung ' + bez, typ: 'ez',
                    anzahlMedien: 1 }, [t.id]);
        });
      });
    }

    /* Übernehmen */
    if (optionen.vorhandeneErsetzen) {
      projekt.schliessungen = [];
      projekt.matrix = {};
    } else {
      var versatz = projekt.schliessungen.length;
      neueSchliessungen.forEach(function (s) { s.sort += versatz; });
    }
    neueSchliessungen.forEach(function (s) {
      var tuerIds = s.__tueren; delete s.__tueren;
      projekt.schliessungen.push(s);
      tuerIds.forEach(function (tid) { setBerechtigung(projekt, tid, s.id, 'ja'); });
    });

    return {
      angelegt: neueSchliessungen.length,
      berechtigungen: Object.keys(projekt.matrix).length
    };
  }

  /* Aus einem Namen ein kurzes, lesbares Kürzel bilden. */
  function kuerzelAus(name) {
    var t = String(name || '').trim();
    if (!t) return 'X';
    /* Führende Zahl beibehalten: "1. Obergeschoss" -> "1OG" */
    var zahl = /^(\d+)/.exec(t);
    var woerter = t.replace(/[^\wäöüÄÖÜß\s]/g, ' ').split(/\s+/).filter(Boolean);
    var buchstaben = woerter.map(function (w) { return w[0]; }).join('').toUpperCase();
    var kurz = (zahl ? zahl[1] : '') + buchstaben.replace(/^\d+/, '');
    return kurz.slice(0, 5) || 'X';
  }

  /* Wie viele Schließungen würde ein Blanko-Plan anlegen? */
  function blankoVorschau(projekt, optionen) {
    optionen = optionen || {};
    var n = 0;
    if (optionen.ghs !== false && projekt.tueren.length) n++;
    if (optionen.proGebaeude !== false) {
      var g = projekt.standorte.filter(function (k) { return k.ebene === 'gebaeude'; });
      if (!g.length) g = kinderVon(projekt, null);
      n += g.filter(function (k) {
        return projekt.tueren.some(function (t) { return t.strukturId === k.id; }) ||
               projekt.standorte.some(function (u) { return u.parentId === k.id; });
      }).length;
    }
    if (optionen.proBereich) {
      n += projekt.standorte.filter(function (k) {
        return k.ebene === 'bereich' &&
               projekt.tueren.some(function (t) { return t.strukturId === k.id; });
      }).length;
    }
    if (optionen.proTuer) n += projekt.tueren.length;
    return n;
  }

  /* --- Materialliste ------------------------------------------------------
   * Aggregiert über alle Türen: System -> Komponente -> Menge.
   * Zylinder werden zusätzlich nach Länge zusammengefasst.
   * -------------------------------------------------------------------- */
  function materialliste(projekt, extraSysteme) {
    var K = kat();
    var proSystem = {};

    function bucket(systemId) {
      if (!proSystem[systemId]) {
        proSystem[systemId] = {
          systemId: systemId,
          label: K ? K.systemLabel(systemId, extraSysteme) : systemId,
          positionen: {},
          tueren: 0
        };
      }
      return proSystem[systemId];
    }

    /* Wohin gehört ein Bauteil?
     *   'schliessanlage' - wird beim Schließanlagen-Hersteller bestellt
     *                      (Zylinder, elektronische Beschläge, Wandleser)
     *   'tuertechnik'    - Baubeschlag bzw. Schlosser (Einsteckschlösser,
     *                      rein mechanische Drücker und Beschläge)
     * und ist es mechanisch oder elektronisch? */
    function einordnen(gruppe, tuer) {
      var K2 = kat();
      if (gruppe === 'Zylinder') {
        return { bereich: 'schliessanlage',
                 technik: istTuerElektronisch(projekt, tuer) ? 'elektronik' : 'mechanik' };
      }
      if (gruppe === 'Beschlag') {
        var elektronisch = K2 && K2.beschlagIstElektronisch(tuer);
        return elektronisch
          ? { bereich: 'schliessanlage', technik: 'elektronik' }
          : { bereich: 'tuertechnik', technik: 'mechanik' };
      }
      if (gruppe === 'Schloss') {
        /* Motorschlösser und elektrische Türöffner sind elektrisch angebunden,
           bleiben aber Türtechnik. */
        var el = /Motorschloss|Türöffner|Haftmagnet/i.test(String(tuer.schlossBauform || ''));
        return { bereich: 'tuertechnik', technik: el ? 'elektronik' : 'mechanik' };
      }
      if (gruppe === 'Zutrittsleser') {
        return { bereich: 'schliessanlage', technik: 'elektronik' };
      }
      return { bereich: 'schliessanlage',
               technik: istTuerElektronisch(projekt, tuer) ? 'elektronik' : 'mechanik' };
    }

    /* Eine Position wird über Bezeichnung UND Ausprägung eindeutig
     * bestimmt. Gleiche Bauteile mit unterschiedlichem Maß bleiben damit
     * getrennt, identische werden zusammengefasst - jede Zeile ist genau
     * einmal vorhanden. */
    /* Die Maßangaben werden strukturiert geführt, damit jede Bauteilart in
     * der Bestellliste ihre eigenen Spalten bekommt (Zylinder: Längen,
     * Beschlag: Türstärke/Dornmaß/Entfernung/Nuss/DIN, Schloss: Dornmaß/
     * Entfernung/Stulp). Der lesbare Text bleibt zusätzlich erhalten. */
    function felderText(felder) {
      var aus = [];
      Object.keys(felder || {}).forEach(function (k) {
        var w = felder[k];
        if (w === undefined || w === null || String(w).trim() === '') return;
        aus.push(k + '=' + String(w).trim());
      });
      return aus.sort().join(';');
    }

    function addPos(b, daten) {
      var vorEin = einordnen(daten.gruppe || 'Sonstiges', daten.tuer || {});
      var schluessel = [daten.bezeichnung, daten.mass, daten.ausfuehrung, daten.hinweis,
                        felderText(daten.felder), vorEin.bereich, vorEin.technik]
        .map(function (x) { return String(x || ''); }).join('||');
      if (!b.positionen[schluessel]) {
        var ein = einordnen(daten.gruppe || 'Sonstiges', daten.tuer || {});
        b.positionen[schluessel] = {
          bezeichnung: daten.bezeichnung,
          mass: daten.mass || '',
          ausfuehrung: daten.ausfuehrung || '',
          hinweis: daten.hinweis || '',
          felder: daten.felder || {},
          gruppe: daten.gruppe || 'Sonstiges',
          bereich: ein.bereich,
          technik: ein.technik,
          menge: 0,
          tueren: []
        };
      }
      var pos = b.positionen[schluessel];
      pos.menge += daten.menge;
      if (daten.tuer && pos.tueren.length < 40) {
        var bez = daten.tuer.nummer || daten.tuer.bezeichnung;
        if (bez && pos.tueren.indexOf(bez) === -1) pos.tueren.push(bez);
      }
    }

    projekt.tueren.forEach(function (t) {
      var anzahl = parseInt(t.anzahl, 10); if (!anzahl || anzahl < 1) anzahl = 1;
      var sysId = tuerSystemId(projekt, t) || 'nicht-zugeordnet';
      var b = bucket(sysId);
      b.tueren += anzahl;

      /* --- Zylinder --- */
      if (K) {
        var zylText = K.zylinderText(t);
        if (zylText) {
          var zylBasis = t.zylinderBauform;
          if (t.zylinderKnaufseite && t.zylinderBauform === 'Knaufzylinder') {
            zylBasis += ' (' + t.zylinderKnaufseite + ')';
          }
          var aussen = String(t.masseAussen || '').trim();
          var innen = String(t.masseInnen || '').trim();
          var gesamt = '';
          if (/^\d+([.,]\d+)?$/.test(aussen) && /^\d+([.,]\d+)?$/.test(innen)) {
            gesamt = String(parseFloat(aussen.replace(',', '.')) + parseFloat(innen.replace(',', '.')));
          }
          addPos(b, {
            gruppe: 'Zylinder',
            bezeichnung: zylBasis,
            mass: (aussen || innen) ? ((aussen || '?') + '/' + (innen || '?') + ' mm') : '',
            ausfuehrung: (t.zylinderAusfuehrung || []).join(', '),
            felder: {
              laengeAussen: aussen,
              laengeInnen: innen,
              gesamtlaenge: gesamt,
              knaufseite: (t.zylinderBauform === 'Knaufzylinder') ? (t.zylinderKnaufseite || '') : ''
            },
            menge: anzahl, tuer: t
          });
        }

        /* --- Beschlag --- */
        if (t.brauchtBeschlag && t.beschlagBauform) {
          var besBez = t.beschlagBauform;
          if (t.beschlagSicherheit && /Schutzbeschlag/.test(t.beschlagBauform)) {
            besBez += ' ' + t.beschlagSicherheit;
          }
          var besFelder = {
            bestueckung: t.beschlagBestueckung || '',
            tuerblattstaerke: t.tuerblattstaerke || '',
            dornmass: t.dornmass || '',
            entfernung: t.entfernung || '',
            vierkant: t.vierkant || '',
            din: t.dinRichtung || ''
          };
          var besMass = [];
          if (besFelder.bestueckung) besMass.push(besFelder.bestueckung);
          if (besFelder.tuerblattstaerke) besMass.push('TS ' + besFelder.tuerblattstaerke);
          if (besFelder.dornmass) besMass.push('DM ' + besFelder.dornmass);
          if (besFelder.entfernung) besMass.push('E ' + besFelder.entfernung);
          if (besFelder.vierkant) besMass.push('VK ' + besFelder.vierkant);
          if (besFelder.din) besMass.push(besFelder.din);
          addPos(b, {
            gruppe: 'Beschlag',
            bezeichnung: besBez,
            mass: besMass.join(' · '),
            ausfuehrung: t.beschlagAusfuehrung || '',
            felder: besFelder,
            menge: anzahl, tuer: t
          });
        }

        /* --- Schloss --- */
        if (t.brauchtSchloss && t.schlossBauform) {
          var schFelder = {
            dornmass: t.dornmass || '',
            entfernung: t.entfernung || '',
            stulp: [t.schlossStulpform || '', t.schlossStulpbreite ? (t.schlossStulpbreite + ' mm') : '',
                    t.schlossStulplaenge ? ('L ' + t.schlossStulplaenge) : '', t.stulpmass || '']
                   .filter(Boolean).join(' '),
            fallenart: t.schlossFallenart || '',
            riegelausschluss: t.schlossRiegelausschluss || '',
            verriegelungspunkte: t.schlossVerriegelungspunkte || '',
            norm: t.schlossNorm || '',
            din: t.dinRichtung || ''
          };
          var schMass = [];
          if (schFelder.dornmass) schMass.push('DM ' + schFelder.dornmass);
          if (schFelder.entfernung) schMass.push('E ' + schFelder.entfernung);
          if (schFelder.stulp) schMass.push(schFelder.stulp);
          if (schFelder.fallenart) schMass.push(schFelder.fallenart);
          if (schFelder.din) schMass.push(schFelder.din);
          addPos(b, {
            gruppe: 'Schloss',
            bezeichnung: t.schlossBauform,
            mass: schMass.join(' · '),
            ausfuehrung: t.schlossFunktion || '',
            felder: schFelder,
            menge: anzahl, tuer: t
          });
        }

        /* --- Wandleser: aus dem Schalter, nicht aus den Komponenten --- */
        if (t.brauchtWandleser) {
          addPos(b, { gruppe: 'Zutrittsleser', bezeichnung: 'Wandleser / Zutrittsleser',
                      menge: anzahl, tuer: t });
        }

        /* --- Weitere Systemkomponenten --- */
        (t.komponenten || []).forEach(function (komp) {
          addPos(b, { gruppe: 'Systemkomponente', bezeichnung: komp, menge: anzahl, tuer: t });
        });
      }
    });

    var GRUPPEN_REIHENFOLGE = ['Zylinder', 'Beschlag', 'Schloss', 'Zutrittsleser',
                              'Systemkomponente', 'Sonstiges'];

    /* --- Identmedien aus dem Schließplan --- */
    var medien = [];
    projekt.schliessungen.forEach(function (s) {
      var n = medienAnzahl(s);
      if (n <= 0) return;
      var personen = (s.personen || []).filter(function (x) { return x && String(x.name || '').trim(); });
      medien.push({
        kuerzel: s.kuerzel || s.bezeichnung,
        bezeichnung: s.bezeichnung,
        typ: s.typ,
        medienTyp: s.medienTyp || '',
        traegerArt: s.traegerArt || '',
        gruppenName: s.gruppenName || '',
        /* Wer das Medium trägt - für die Ausgabe und die Quittierung */
        person: (K && K.traegerText) ? K.traegerText(s) : (s.person || s.abteilung || ''),
        personen: personen.map(function (x) {
          var pn = parseInt(x.anzahlMedien, 10);
          return { name: x.name, funktion: x.funktion || '', menge: (!pn || pn < 1) ? 1 : pn };
        }),
        menge: n
      });
    });

    /* Stehen im selben System zwei Positionen mit gleicher Bezeichnung und
     * gleichem Maß, unterscheiden sie sich allein durch die Ausführung. Damit
     * das beim Bestellen nicht wie eine Doppelung aussieht, wird die Zeile
     * ohne Zusatz ausdrücklich als Standardausführung gekennzeichnet. */
    Object.keys(proSystem).forEach(function (sid) {
      var b = proSystem[sid];
      var nachBasis = {};
      Object.keys(b.positionen).forEach(function (pk) {
        var pos = b.positionen[pk];
        var basis = pos.bezeichnung + '||' + pos.mass;
        (nachBasis[basis] = nachBasis[basis] || []).push(pos);
      });
      Object.keys(nachBasis).forEach(function (basis) {
        var gruppe = nachBasis[basis];
        if (gruppe.length < 2) return;
        gruppe.forEach(function (pos) {
          if (!pos.ausfuehrung) pos.ausfuehrung = 'Standardausführung';
        });
      });
    });

    var listen = Object.keys(proSystem).map(function (k) {
      var b = proSystem[k];
      var positionen = Object.keys(b.positionen).map(function (pk) { return b.positionen[pk]; });
      positionen.sort(function (a, c) {
        var ga = GRUPPEN_REIHENFOLGE.indexOf(a.gruppe), gc = GRUPPEN_REIHENFOLGE.indexOf(c.gruppe);
        if (ga !== gc) return ga - gc;
        return a.bezeichnung.localeCompare(c.bezeichnung, 'de') ||
               String(a.mass).localeCompare(String(c.mass), 'de', { numeric: true });
      });
      return {
        systemId: b.systemId,
        label: b.systemId === 'nicht-zugeordnet' ? 'Ohne Systemzuordnung' : b.label,
        tueren: b.tueren,
        positionen: positionen,
        summe: positionen.reduce(function (sum, pp) { return sum + pp.menge; }, 0)
      };
    }).sort(function (a, c) { return a.label.localeCompare(c.label, 'de'); });

    /* Gliederung für die Bestellung: erst nach Gewerk, darin nach Technik. */
    var alleP = [];
    listen.forEach(function (sy) {
      sy.positionen.forEach(function (pos) {
        alleP.push({ pos: pos, system: sy.label, systemId: sy.systemId });
      });
    });

    function sammeln(bereich, technik) {
      var treffer = alleP.filter(function (e) {
        return e.pos.bereich === bereich && e.pos.technik === technik;
      });
      /* Nach System gruppieren, damit die Bestellung je Hersteller entsteht */
      var proSys = {};
      treffer.forEach(function (e) {
        if (!proSys[e.system]) proSys[e.system] = { label: e.system, systemId: e.systemId, positionen: [] };
        proSys[e.system].positionen.push(e.pos);
      });
      var gruppen = Object.keys(proSys).map(function (k) {
        var g = proSys[k];
        g.summe = g.positionen.reduce(function (sum, x) { return sum + x.menge; }, 0);
        /* Innerhalb einer Systemgruppe nach Bauteilart trennen: jede Art
         * hat andere bestellrelevante Maße und damit andere Spalten. */
        var proArt = {};
        g.positionen.forEach(function (pos) {
          var a2 = pos.gruppe || 'Sonstiges';
          if (!proArt[a2]) proArt[a2] = { art: a2, positionen: [], summe: 0 };
          proArt[a2].positionen.push(pos);
          proArt[a2].summe += pos.menge;
        });
        g.arten = Object.keys(proArt).sort(function (a2, c2) {
          return GRUPPEN_REIHENFOLGE.indexOf(a2) - GRUPPEN_REIHENFOLGE.indexOf(c2);
        }).map(function (a2) { return proArt[a2]; });
        return g;
      }).sort(function (a, c) { return a.label.localeCompare(c.label, 'de'); });
      return {
        gruppen: gruppen,
        summe: gruppen.reduce(function (sum, g) { return sum + g.summe; }, 0)
      };
    }

    var gliederung = [
      { id: 'sa-elektronik', bereich: 'schliessanlage', technik: 'elektronik',
        titel: 'Schließanlage – Elektronik',
        hinweis: 'Elektronische Zylinder, Beschläge und Zutrittsleser' },
      { id: 'sa-mechanik', bereich: 'schliessanlage', technik: 'mechanik',
        titel: 'Schließanlage – Mechanik',
        hinweis: 'Mechanische Zylinder' },
      { id: 'tt-elektronik', bereich: 'tuertechnik', technik: 'elektronik',
        titel: 'Türtechnik – Elektrisch',
        hinweis: 'Motorschlösser, elektrische Türöffner, Haftmagnete' },
      { id: 'tt-mechanik', bereich: 'tuertechnik', technik: 'mechanik',
        titel: 'Türtechnik – Mechanik',
        hinweis: 'Einsteckschlösser sowie rein mechanische Drücker und Beschläge' }
    ].map(function (a) {
      var d = sammeln(a.bereich, a.technik);
      a.gruppen = d.gruppen; a.summe = d.summe;
      return a;
    }).filter(function (a) { return a.summe > 0; });

    return {
      systeme: listen,
      gliederung: gliederung,
      medien: medien,
      gesamtStueck: listen.reduce(function (sum, sy) { return sum + sy.summe; }, 0),
      summeSchliessanlage: gliederung.filter(function (a) { return a.bereich === 'schliessanlage'; })
        .reduce(function (s2, a) { return s2 + a.summe; }, 0),
      summeTuertechnik: gliederung.filter(function (a) { return a.bereich === 'tuertechnik'; })
        .reduce(function (s2, a) { return s2 + a.summe; }, 0),
      gesamtMedien: medien.reduce(function (sum, m) { return sum + m.menge; }, 0)
    };
  }

  /* --- Kennzahlen ---------------------------------------------------------- */
  function statistik(projekt) {
    var s = { tueren: 0, tuerenGesamtAnzahl: 0, fotos: 0, nacharbeit: 0, proStatus: {}, proTechnologie: {} };
    projekt.tueren.forEach(function (t) {
      var a = parseInt(t.anzahl, 10); if (!a || a < 1) a = 1;
      s.tueren++;
      s.tuerenGesamtAnzahl += a;
      s.fotos += (t.fotos || []).length;
      if (t.nacharbeit) s.nacharbeit++;
      s.proStatus[t.status] = (s.proStatus[t.status] || 0) + 1;
      var tech = tuerTechnologie(projekt, t) || 'offen';
      s.proTechnologie[tech] = (s.proTechnologie[tech] || 0) + 1;
    });
    s.schliessungen = projekt.schliessungen.length;
    s.berechtigungen = Object.keys(projekt.matrix).length;
    return s;
  }

  /* =========================================================================
   * Pflichtangaben einer Tür
   * ======================================================================
   * Eine Tür gilt als vollständig, wenn alle Angaben vorliegen, die für die
   * Bestellung zwingend gebraucht werden. Welche das sind, hängt davon ab,
   * welche Bauteile an der Tür überhaupt vorgesehen sind - nach einem
   * Stoßgriff nach dem Dornmaß zu fragen wäre unsinnig.
   *
   * Die Prüfung blockiert nichts: Vor Ort ist ein Maß nicht immer zu
   * bekommen. Eine unvollständige Tür lässt sich speichern, wird aber als
   * solche gekennzeichnet und erscheint in der Liste der offenen Punkte.
   * ====================================================================== */

  /* Bauformen, bei denen die Zylinderlänge nicht zur Bestellung gehört */
  var ZYL_OHNE_LAENGE = ['Vorhangschloss / Bügelschloss', 'Briefkastenzylinder', 'Möbelzylinder'];
  /* Beschlagbauform ohne Drücker: kein Dornmaß, keine Entfernung, kein Vierkant */
  var BESCHLAG_OHNE_DRUECKER = ['Stoßgriff / Ziehgriff'];
  /* Schlossbauformen, bei denen Dornmaß und Entfernung gelten */
  var SCHLOSS_MIT_MASSEN = ['Einsteckschloss', 'Rohrrahmenschloss',
                            'Mehrfachverriegelung', 'Motorschloss'];

  function leer(wert) {
    if (wert === null || wert === undefined) return true;
    return String(wert).trim() === '';
  }

  /* Liefert ALLE Pflichtangaben der Tür, jede mit dem Vermerk, ob sie
   * fehlt. Das Formular braucht beides: welche Felder Pflicht sind (um sie
   * zu kennzeichnen) und welche davon noch offen sind. */
  function pflichtListe(projekt, tuer) {
    var alle = [];
    var t = tuer || {};
    var p = projekt || {};

    function verlangen(schluessel, label, abschnitt) {
      alle.push({ schluessel: schluessel, label: label, abschnitt: abschnitt,
                  fehlt: leer(t[schluessel]) });
    }

    /* --- Immer --- */
    verlangen('bezeichnung', 'Bezeichnung / Raum', 'lage');
    var hatStruktur = (p.standorte || []).length > 0;
    if (hatStruktur) {
      alle.push({ schluessel: 'strukturId', label: 'Standort / Gebäude / Bereich',
                  abschnitt: 'lage', fehlt: !t.strukturId });
    } else {
      verlangen('etage', 'Etage / Bereich', 'lage');
    }
    if (p.anlagenart === 'hybrid') {
      verlangen('tuerTechnologie', 'Ausführung mechanisch oder elektronisch', 'bauteile');
    }
    alle.push({ schluessel: 'bauteile', label: 'mindestens ein Bauteil', abschnitt: 'bauteile',
                fehlt: !t.brauchtZylinder && !t.brauchtBeschlag && !t.brauchtSchloss && !t.brauchtWandleser });

    /* --- Zylinder --- */
    if (t.brauchtZylinder) {
      verlangen('zylinderBauform', 'Art des Zylinders (Bauform)', 'zylinder');
      if (t.zylinderBauform && ZYL_OHNE_LAENGE.indexOf(t.zylinderBauform) === -1) {
        verlangen('masseAussen', 'Länge außen', 'zylinder');
        /* Beim Halbzylinder gibt es innen keine Länge zu bestellen */
        if (t.zylinderBauform !== 'Halbzylinder') {
          verlangen('masseInnen', 'Länge innen', 'zylinder');
        }
      }
      if (t.zylinderBauform === 'Knaufzylinder') {
        verlangen('zylinderKnaufseite', 'Knaufseite', 'zylinder');
      }
      verlangen('zutrittsseite', 'Von welcher Seite wird geöffnet?', 'zutritt');
    }

    /* --- Beschlag --- */
    if (t.brauchtBeschlag) {
      verlangen('beschlagBauform', 'Bauform des Beschlags', 'beschlag');
      verlangen('beschlagAusfuehrung', 'Ausführung (mechanisch / elektronisch)', 'beschlag');
      verlangen('tuerblattstaerke', 'Türblattstärke', 'beschlag');
      var mitDruecker = BESCHLAG_OHNE_DRUECKER.indexOf(t.beschlagBauform || '') === -1;
      if (mitDruecker) {
        verlangen('beschlagBestueckung', 'Bestückung', 'beschlag');
        verlangen('dornmass', 'Dornmaß', 'beschlag');
        verlangen('entfernung', 'Entfernung', 'beschlag');
        verlangen('vierkant', 'Vierkant / Nuss', 'beschlag');
        verlangen('dinRichtung', 'DIN-Richtung', 'beschlag');
      }
    }

    /* --- Schloss --- */
    if (t.brauchtSchloss) {
      verlangen('schlossBauform', 'Bauform des Schlosses', 'schloss');
      if (SCHLOSS_MIT_MASSEN.indexOf(t.schlossBauform || '') !== -1) {
        verlangen('schlossFunktion', 'Funktion des Schlosses', 'schloss');
        verlangen('dornmass', 'Dornmaß', 'schloss');
        verlangen('entfernung', 'Entfernung', 'schloss');
        verlangen('dinRichtung', 'DIN-Richtung', 'schloss');
      }
    }

    /* --- Elektronik ---
     * Stromversorgung und Vernetzung sind bewusst KEINE Pflichtangaben
     * (so festgelegt): Vor Ort ist oft noch nicht geklärt, woher der Strom
     * kommt und wie angebunden wird - das wird später mit der Technik
     * abgestimmt. Die Felder bleiben im Formular, werden aber weder
     * angemahnt noch als fehlend gezählt. */

    /* Dieselbe Angabe kann aus zwei Bauteilen verlangt werden (das Dornmaß
     * gilt für Beschlag und Schloss). Sie wird dann nur einmal geführt. */
    var gesehen = {};
    return alle.filter(function (f) {
      if (gesehen[f.schluessel]) return false;
      gesehen[f.schluessel] = true;
      return true;
    });
  }

  /* Nur die Angaben, die noch fehlen */
  function pflichtfelder(projekt, tuer) {
    return pflichtListe(projekt, tuer).filter(function (f) { return f.fehlt; });
  }

  /* Nachschlagewerk für das Formular: Feldname -> Beschriftung */
  function pflichtSchluessel(projekt, tuer) {
    var aus = {};
    pflichtListe(projekt, tuer).forEach(function (f) { aus[f.schluessel] = f.label; });
    return aus;
  }

  function tuerVollstaendig(projekt, tuer) {
    return pflichtfelder(projekt, tuer).length === 0;
  }

  /* Status aus der Vollständigkeit ableiten.
   * Nur solange der Status nicht selbst gewählt wurde: Eine von Hand
   * gesetzte Freigabe oder Nacharbeit wird nie überschrieben. */
  function statusAusPruefung(projekt, tuer) {
    if (!tuer) return;
    if (tuer.statusVonHand) return tuer.status;
    tuer.status = tuerVollstaendig(projekt, tuer) ? 'aufgemessen' : 'klaerung';
    return tuer.status;
  }

  /* Alle unvollständigen Türen eines Projekts */
  function unvollstaendigeTueren(projekt) {
    return (projekt && projekt.tueren || []).filter(function (t) {
      return pflichtfelder(projekt, t).length > 0;
    });
  }

  /* --- Validierung / Plausibilitätsprüfung -------------------------------- */
  function pruefeProjekt(projekt) {
    var probleme = [];
    var nummern = {};

    /* Die Anlage gilt für das gesamte Projekt und wird zuerst geprüft. */
    if (!projekt.anlagenart) {
      probleme.push({ schwere: 'warn', text: 'Für das Projekt ist keine Art der Anlage festgelegt (Mechanik, Elektronik oder Hybrid)' });
    } else if (!anlageVollstaendig(projekt)) {
      probleme.push({ schwere: 'warn', text: 'Für das Projekt fehlt noch die Auswahl des Schließsystems' });
    }

    projekt.tueren.forEach(function (t) {
      var bez = (t.nummer || t.bezeichnung || 'Tür ohne Bezeichnung');
      if (!t.nummer && !t.bezeichnung) {
        probleme.push({ schwere: 'warn', tuerId: t.id, text: 'Tür ohne Nummer und ohne Bezeichnung' });
      }
      if (t.nummer) {
        if (nummern[t.nummer]) {
          probleme.push({ schwere: 'warn', tuerId: t.id, text: 'Türnummer "' + t.nummer + '" ist doppelt vergeben' });
        }
        nummern[t.nummer] = true;
      }
      /* Fehlende Pflichtangaben kommen aus einer einzigen Quelle, damit
       * Formular, Türliste und Prüfprotokoll nie auseinanderlaufen. Sie
       * werden je Tür in einer Zeile gemeldet statt einzeln aufgezählt -
       * sonst erschlägt das Protokoll den Leser. */
      var fehlende = pflichtfelder(projekt, t);
      if (fehlende.length) {
        probleme.push({ schwere: 'warn', tuerId: t.id, art: 'pflicht',
          text: bez + ': ' + fehlende.length + (fehlende.length === 1 ? ' Pflichtangabe fehlt – ' : ' Pflichtangaben fehlen – ') +
                fehlende.map(function (f) { return f.label; }).join(', ') });
      }
      if (t.nacharbeit && !t.nacharbeitText) {
        probleme.push({ schwere: 'info', tuerId: t.id, text: bez + ': Nacharbeit markiert, aber nicht beschrieben' });
      }
      var istFlucht = (t.tueranforderungen || []).indexOf('Flucht- und Rettungsweg') !== -1;
      if (istFlucht && t.brauchtSchloss && t.schlossFunktion && !/Panik/.test(t.schlossFunktion)) {
        probleme.push({ schwere: 'warn', tuerId: t.id,
          text: bez + ': Flucht- und Rettungsweg gewählt, das Schloss hat aber keine Panikfunktion' });
      }
      if (istFlucht && !t.brauchtSchloss) {
        probleme.push({ schwere: 'warn', tuerId: t.id,
          text: bez + ': Flucht- und Rettungsweg gewählt, aber kein Schloss erfasst' });
      }
      if ((t.zylinderAusfuehrung || []).indexOf('Anti-Panik') !== -1 && !istFlucht) {
        probleme.push({ schwere: 'info', tuerId: t.id,
          text: bez + ': Zylinder mit Anti-Panik, Tür ist aber nicht als Flucht- und Rettungsweg gekennzeichnet' });
      }
    });

    var kuerzel = {};
    projekt.schliessungen.forEach(function (s) {
      var sbez = s.kuerzel || s.bezeichnung || 'Schließung';
      if (!s.kuerzel && !s.bezeichnung) {
        probleme.push({ schwere: 'warn', text: 'Schließung ohne Kürzel und Bezeichnung' });
      }
      if (s.kuerzel) {
        if (kuerzel[s.kuerzel]) probleme.push({ schwere: 'warn', text: 'Kürzel "' + s.kuerzel + '" ist doppelt vergeben' });
        kuerzel[s.kuerzel] = true;
      }
      if (s.traegerArt === 'gruppe' && !String(s.gruppenName || '').trim()) {
        probleme.push({ schwere: 'warn', text: sbez + ': als Gruppe gekennzeichnet, aber ohne Gruppennamen' });
      }
      var benannt = (s.personen || []).filter(function (x) { return x && String(x.name || '').trim(); });
      if (s.traegerArt === 'gruppe' && !benannt.length) {
        probleme.push({ schwere: 'info', text: sbez + ': Gruppe ohne hinterlegte Mitglieder' });
      }
      if (s.traegerArt === 'einzel' && !benannt.length) {
        probleme.push({ schwere: 'info', text: sbez + ': keine Person benannt' });
      }
      if (!s.traegerArt && medienAnzahl(s) > 0) {
        probleme.push({ schwere: 'info', text: sbez + ': noch nicht festgelegt, ob Einzelperson oder Gruppe' });
      }
      /* Zwei Personen mit demselben Namen in einer Gruppe sind fast immer
       * ein Versehen beim Abtippen. */
      var namen = {};
      benannt.forEach(function (x) {
        var n = String(x.name).trim().toLowerCase();
        if (namen[n]) {
          probleme.push({ schwere: 'info', text: sbez + ': "' + x.name + '" steht zweimal in der Liste' });
        }
        namen[n] = true;
      });
    });

    if (projekt.tueren.length && projekt.schliessungen.length) {
      projekt.tueren.forEach(function (t) {
        var hat = projekt.schliessungen.some(function (s) {
          return getBerechtigung(projekt, t.id, s.id) !== 'nein';
        });
        if (!hat) {
          probleme.push({ schwere: 'info', tuerId: t.id,
            text: (t.nummer || t.bezeichnung || 'Tür') + ': keine einzige Berechtigung im Schließplan' });
        }
      });
    }

    return probleme;
  }

  /* =========================================================================
   * Überführung älterer Aufmaße auf die getrennten Angaben
   * ======================================================================
   * Früher steckten Bauform, Ausführung und Technologie in einem einzigen
   * Textfeld ("Elektronikzylinder Freidreh / Komfort"). Diese Funktion
   * zerlegt solche Altwerte, damit vorhandene Aufmaße vollständig erhalten
   * bleiben. Sie ist mehrfach anwendbar, ohne Schaden anzurichten.
   * -------------------------------------------------------------------- */

  /* Bauform aus einem alten Zylindertext ableiten */
  var ZYL_BAUFORM_MUSTER = [
    [/doppelknauf/i,                      'Doppelknaufzylinder'],
    [/halbzylinder/i,                     'Halbzylinder'],
    [/knaufzylinder|knauf\s*\//i,         'Knaufzylinder'],
    [/hebelzylinder/i,                    'Hebelzylinder'],
    [/möbelzylinder/i,                    'Möbelzylinder'],
    [/vorhangschloss|bügelschloss/i,      'Vorhangschloss / Bügelschloss'],
    [/briefkasten/i,                      'Briefkastenzylinder'],
    [/schaltzylinder|schaltschloss/i,     'Schaltzylinder'],
    [/rundzylinder/i,                     'Rundzylinder'],
    [/blindzylinder/i,                    'Blindzylinder'],
    [/doppelzylinder/i,                   'Doppelzylinder']
  ];
  var ZYL_AUSFUEHRUNG_MUSTER = [
    [/not-?\s*und\s*gefahren|n\s*\+\s*g/i, 'Not- und Gefahrenfunktion'],
    [/freidreh/i,                             'Freidreh'],
    [/komfort|comfort/i,                      'Comfort'],
    [/anti-?panik/i,                          'Anti-Panik'],
    [/wetterschutz/i,                         'Wetterschutz'],
    [/bohrschutz/i,                           'erhöhter Bohrschutz'],
    [/ziehschutz/i,                           'Ziehschutz'],
    [/gleichschließend/i,                     'gleichschließend']
  ];

  function zylinderZerlegen(alt, ziel) {
    var text = String(alt || '');
    if (!text) return;
    /* Die frühere Sammelbezeichnung war ein einziger Eintrag. Sie wird auf
     * den geläufigeren Fachbegriff abgebildet, statt zwei Eigenschaften zu
     * erfinden, die so nie erfasst wurden. */
    text = text.replace(/Freidreh\s*\/\s*Komfort/gi, 'Freidreh');
    if (/^kein zylinder/i.test(text)) { ziel.brauchtZylinder = false; return; }

    for (var i = 0; i < ZYL_BAUFORM_MUSTER.length; i++) {
      if (ZYL_BAUFORM_MUSTER[i][0].test(text)) { ziel.zylinderBauform = ZYL_BAUFORM_MUSTER[i][1]; break; }
    }
    /* "Elektronikzylinder" ohne nähere Angabe war faktisch ein Doppelknauf */
    if (!ziel.zylinderBauform && /elektronikzylinder|digitaler zylinder/i.test(text)) {
      ziel.zylinderBauform = 'Doppelknaufzylinder';
    }
    if (!Array.isArray(ziel.zylinderAusfuehrung)) ziel.zylinderAusfuehrung = [];
    ZYL_AUSFUEHRUNG_MUSTER.forEach(function (m) {
      if (m[0].test(text) && ziel.zylinderAusfuehrung.indexOf(m[1]) === -1) {
        ziel.zylinderAusfuehrung.push(m[1]);
      }
    });
    /* Die Knaufseite ist nur beim einfachen Knaufzylinder eine offene Frage;
       beim Doppelknaufzylinder steht sie schon in der Bauform. */
    if (ziel.zylinderBauform === 'Knaufzylinder') {
      if (/knauf\s*außen/i.test(text)) ziel.zylinderKnaufseite = 'Knauf außen';
      else if (/knauf\s*innen/i.test(text)) ziel.zylinderKnaufseite = 'Knauf innen';
    }
  }

  function beschlagZerlegen(alt, ziel) {
    var text = String(alt || '');
    if (!text) return;
    if (/^kein beschlag/i.test(text)) { ziel.brauchtBeschlag = false; return; }

    if (/schutzbeschlag/i.test(text)) ziel.beschlagBauform = 'Schutzbeschlag';
    else if (/langschild/i.test(text)) ziel.beschlagBauform = 'Langschildgarnitur';
    else if (/rosetten/i.test(text)) ziel.beschlagBauform = 'Rosettengarnitur';
    else if (/wechselgarnitur/i.test(text)) ziel.beschlagBauform = 'Wechselgarnitur';
    else if (/panik|flucht/i.test(text)) ziel.beschlagBauform = 'Panikbeschlag / Fluchttürbeschlag';
    else if (/stoßgriff|ziehgriff/i.test(text)) ziel.beschlagBauform = 'Stoßgriff / Ziehgriff';
    else if (/elektronisch/i.test(text)) ziel.beschlagBauform = 'Elektronischer Türbeschlag';

    var es = /\bES([0-3])\b/i.exec(text);
    if (es) ziel.beschlagSicherheit = 'ES' + es[1];

    if (/knauf\s*\/\s*drücker/i.test(text)) ziel.beschlagBestueckung = 'Knauf / Drücker';
    else if (/knauf\s*\/\s*knauf/i.test(text)) ziel.beschlagBestueckung = 'Knauf / Knauf';
    else if (/drücker\s*\/\s*drücker/i.test(text)) ziel.beschlagBestueckung = 'Drücker / Drücker';
  }

  function schlossZerlegen(alt, ziel) {
    var text = String(alt || '');
    if (!text) return;

    if (/rohrrahmen/i.test(text)) ziel.schlossBauform = 'Rohrrahmenschloss';
    else if (/mehrfachverriegelung/i.test(text)) ziel.schlossBauform = 'Mehrfachverriegelung';
    else if (/motorschloss/i.test(text)) ziel.schlossBauform = 'Motorschloss';
    else if (/möbelschloss/i.test(text)) ziel.schlossBauform = 'Möbelschloss';
    else if (/türöffner/i.test(text)) ziel.schlossBauform = 'Elektrischer Türöffner';
    else if (/haftmagnet/i.test(text)) ziel.schlossBauform = 'Haftmagnet';
    else if (/einsteckschloss|panikschloss/i.test(text)) ziel.schlossBauform = 'Einsteckschloss';

    /* "Panik Funktion B", aber auch kurz "Panik B" */
    var panik = /(?:Funktion|Panik)\s*([BEDC])\b/i.exec(text);
    if (panik) {
      var zusatz = { B: 'Panik Funktion B (Umschaltfunktion)', E: 'Panik Funktion E (Wechselfunktion)',
                     D: 'Panik Funktion D (Durchgangsfunktion)', C: 'Panik Funktion C' };
      ziel.schlossFunktion = zusatz[panik[1].toUpperCase()] || '';
    } else if (/automatisch/i.test(text)) ziel.schlossFunktion = 'automatisch verriegelnd';
    else if (/selbstverriegelnd/i.test(text)) ziel.schlossFunktion = 'selbstverriegelnd';
    else if (/buntbart/i.test(text)) ziel.schlossFunktion = 'Buntbart';
    else if (/\bPZ\b|profilzylinder/i.test(text)) ziel.schlossFunktion = 'Profilzylinder (PZ)';

    /* Die Rollfalle ist eine Bauart der Falle, keine Funktion des Schlosses.
     * Sie darf deshalb nicht in das Funktionsfeld geschrieben werden - dort
     * stünde sie außerhalb der Auswahlliste. */
    if (/rollfalle/i.test(text) && !ziel.schlossFallenart) ziel.schlossFallenart = 'Rollfalle';
  }

  /* Die alte gemischte Liste auf ihre drei Bedeutungen verteilen */
  function zutrittsartenVerteilen(alteListe, ziel) {
    if (!Array.isArray(alteListe) || !alteListe.length) return;
    if (!Array.isArray(ziel.tueranforderungen)) ziel.tueranforderungen = [];
    if (!Array.isArray(ziel.zylinderAusfuehrung)) ziel.zylinderAusfuehrung = [];

    function anforderung(w) { if (ziel.tueranforderungen.indexOf(w) === -1) ziel.tueranforderungen.push(w); }
    function ausfuehrung(w) { if (ziel.zylinderAusfuehrung.indexOf(w) === -1) ziel.zylinderAusfuehrung.push(w); }

    alteListe.forEach(function (eintrag) {
      var t = String(eintrag);
      if (/^einseitig/i.test(t))                      ziel.zutrittsseite = ziel.zutrittsseite || 'nur außen';
      else if (/^beidseitig/i.test(t))                ziel.zutrittsseite = ziel.zutrittsseite || 'innen und außen';
      else if (/dauerentriegelt|tagesfreischaltung/i.test(t)) ziel.zutrittsseite = ziel.zutrittsseite || 'Durchgangsfunktion / dauerentriegelt';
      else if (/freidreh/i.test(t))                   ausfuehrung('Freidreh');
      else if (/comfort|komfort/i.test(t))            ausfuehrung('Comfort');
      else if (/not-?\s*und\s*gefahren/i.test(t))     ausfuehrung('Not- und Gefahrenfunktion');
      else if (/flucht|rettungsweg|panik/i.test(t))   anforderung('Flucht- und Rettungsweg');
      else if (/brand-?\s*und\s*rauch/i.test(t))      { anforderung('Brandschutz'); anforderung('Rauchschutz'); }
      else if (/brandschutz/i.test(t))                anforderung('Brandschutz');
      else if (/rauchschutz/i.test(t))                anforderung('Rauchschutz');
      else if (/einbruchhemmend|\bRC\b/i.test(t))     anforderung('einbruchhemmend (RC)');
      else if (/vds/i.test(t))                        anforderung('VdS-Anforderung');
      else if (/zeitgesteuert/i.test(t))              anforderung('Zeitsteuerung vorgesehen');
      /* "Nur mechanische Verriegelung" steckt bereits im gewählten System */
    });
  }

  /* Eine Tür aus einer älteren Fassung überführen. */
  function tuerUeberfuehren(t) {
    if (!t || typeof t !== 'object') return t;

    /* Wandleser standen früher zusätzlich in den Systemkomponenten. Sie
     * werden in den Schalter überführt, damit sie in der Materialliste nicht
     * zweimal erscheinen. */
    if (Array.isArray(t.komponenten)) {
      var vorher = t.komponenten.length;
      t.komponenten = t.komponenten.filter(function (k) {
        return !/wandleser|zutrittsleser/i.test(String(k));
      });
      if (t.komponenten.length < vorher) t.brauchtWandleser = true;
    }

    /* Die frühere Sammelbezeichnung in zwei Ausführungen auflösen */
    if (Array.isArray(t.zylinderAusfuehrung)) {
      var i = t.zylinderAusfuehrung.indexOf('Freidreh / Komfort');
      if (i !== -1) {
        t.zylinderAusfuehrung.splice(i, 1, 'Freidreh');
      }
    }

    /* Die vorhandene Zylinderlänge stand als ein Text da ("30/35"). Getrennt
     * lässt sie sich auswählen statt tippen. Nur eindeutig zerlegbare Werte
     * werden umgeschrieben - alles andere bleibt im alten Feld stehen und
     * ist weiter sichtbar, statt still verloren zu gehen. */
    if (String(t.bestandLaenge || '').trim() && !t.bestandLaengeAussen && !t.bestandLaengeInnen) {
      var teile = /^\s*(\d+(?:[.,]\d+)?)\s*[\/xX\-]\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*$/
        .exec(String(t.bestandLaenge));
      if (teile) {
        t.bestandLaengeAussen = teile[1];
        t.bestandLaengeInnen = teile[2];
        t.bestandLaenge = '';
      }
    }

    /* Die Rollfalle stand früher unter den Schlossfunktionen. Sie ist aber
     * eine Bauart der Falle und keine Funktion des Schlosses - sonst müsste
     * man sich zwischen Panikfunktion und Rollfalle entscheiden, obwohl
     * beides zusammen vorkommt. Sie wandert deshalb zur Fallenart. */
    if (String(t.schlossFunktion || '') === 'Rollfalle') {
      if (!t.schlossFallenart) t.schlossFallenart = 'Rollfalle';
      t.schlossFunktion = '';
    }
    var hatAltfelder = ('zylinderArt' in t) || ('beschlagArt' in t) ||
                       ('schlossArt' in t) || ('zutrittsarten' in t);
    if (!hatAltfelder) return t;   /* die Bereinigungen oben laufen immer */

    if (t.zylinderArt && !t.zylinderBauform) zylinderZerlegen(t.zylinderArt, t);
    if (t.beschlagArt && !t.beschlagBauform) beschlagZerlegen(t.beschlagArt, t);
    if (t.schlossArt  && !t.schlossBauform)  schlossZerlegen(t.schlossArt, t);
    if (Array.isArray(t.zutrittsarten) && !t.zutrittsseite && !(t.tueranforderungen || []).length) {
      zutrittsartenVerteilen(t.zutrittsarten, t);
    }
    /* Altfelder entfernen, damit nichts doppelt geführt wird */
    delete t.zylinderArt; delete t.beschlagArt; delete t.schlossArt;
    delete t.zutrittsarten; delete t.technologie; delete t.identmedien;
    return t;
  }

  /* Aus den Systemen der einzelnen Türen die Anlage des Projekts erschließen.
   * Frühere Fassungen hielten das System an jeder Tür; gesucht wird das je
   * Technologie am häufigsten verwendete. */
  function anlageAusTuerenErschliessen(projekt) {
    if (!projekt || projekt.anlagenart) return projekt;
    var K = kat();
    if (!K || !Array.isArray(projekt.tueren)) return projekt;

    var haeufigkeit = { mechanisch: {}, elektronisch: {} };
    projekt.tueren.forEach(function (t) {
      var sid = t.systemId;
      if (!sid) return;
      var typ = K.systemTechnologie(sid);
      var topf = (typ === 'mechanisch') ? haeufigkeit.mechanisch
               : (typ === 'elektronisch' || typ === 'hybrid') ? haeufigkeit.elektronisch
               : null;
      if (!topf) return;
      var anzahl = parseInt(t.anzahl, 10) || 1;
      topf[sid] = (topf[sid] || 0) + anzahl;
    });

    function haeufigstes(topf) {
      var beste = '', menge = 0;
      Object.keys(topf).forEach(function (id) {
        if (topf[id] > menge) { menge = topf[id]; beste = id; }
      });
      return beste;
    }
    var mech = haeufigstes(haeufigkeit.mechanisch);
    var elek = haeufigstes(haeufigkeit.elektronisch);

    if (mech && elek) { projekt.anlagenart = 'hybrid'; }
    else if (elek)    { projekt.anlagenart = 'elektronik'; }
    else if (mech)    { projekt.anlagenart = 'mechanik'; }
    projekt.systemMechanik = projekt.systemMechanik || mech;
    projekt.systemElektronik = projekt.systemElektronik || elek;

    /* Bei einer Hybridanlage je Tür festhalten, welche Seite gilt; Türen mit
     * einem abweichenden System behalten den Hinweis als Notiz, damit nichts
     * unbemerkt verloren geht. */
    projekt.tueren.forEach(function (t) {
      if (!t.systemId) { delete t.systemId; delete t.systemDetail; return; }
      var typ = K.systemTechnologie(t.systemId);
      var istElek = (typ === 'elektronisch' || typ === 'hybrid');
      if (projekt.anlagenart === 'hybrid' && !t.tuerTechnologie) {
        t.tuerTechnologie = istElek ? 'elektronik' : 'mechanik';
      }
      var anlagenSystem = istElek ? projekt.systemElektronik : projekt.systemMechanik;
      if (t.systemId !== anlagenSystem) {
        var hinweis = 'Abweichendes System laut früherem Aufmaß: ' + K.systemLabel(t.systemId);
        t.systemNotiz = t.systemNotiz ? (t.systemNotiz + ' · ' + hinweis) : hinweis;
      }
      if (t.systemDetail && !t.systemNotiz) t.systemNotiz = t.systemDetail;
      else if (t.systemDetail) t.systemNotiz += ' · ' + t.systemDetail;
      delete t.systemId; delete t.systemDetail;
    });
    return projekt;
  }

  /* --- Migration / Normalisierung beim Import ------------------------------ */
  /* =========================================================================
   * Überführung einer Schließung aus einer früheren Fassung
   * ======================================================================
   * Früher stand im Feld "Typ" teils der Rang im Plan (GHS, HS ...) und
   * teils, wer das Medium trägt ("Person", "Personengruppe"). Das waren
   * zwei verschiedene Fragen in einem Feld. Jetzt trägt "typ" allein den
   * Rang, "traegerArt" allein den Träger.
   *
   * Aus "Person" bzw. "Personengruppe" wird deshalb kein Rang erfunden -
   * der Rang bleibt offen, die Angabe wandert vollständig zum Träger.
   * Die Freitextfelder "person" und "abteilung" werden zur Personenliste.
   * Mehrfach anwendbar, ohne Schaden anzurichten.
   */
  function schliessungUeberfuehren(s) {
    if (!s || typeof s !== 'object') return s;

    if (s.typ === 'person') { s.traegerArt = s.traegerArt || 'einzel'; s.typ = ''; }
    if (s.typ === 'gruppe') {
      s.traegerArt = s.traegerArt || 'gruppe';
      if (!s.gruppenName) s.gruppenName = s.abteilung || s.bezeichnung || '';
      s.typ = '';
    }

    if (!Array.isArray(s.personen)) s.personen = [];
    var name = String(s.person || '').trim();
    if (name && !s.personen.some(function (x) { return x && x.name === name; })) {
      s.personen.push(neuePerson({ name: name, funktion: String(s.abteilung || '').trim() }));
      /* Die bisherige Gesamtzahl bleibt maßgeblich: Sie stand für alle
       * Medien dieser Schließung, nicht für diese eine Person. */
      s.medienVonHand = true;
    }
    if (!s.traegerArt) {
      if (s.personen.length) s.traegerArt = 'einzel';
      else if (String(s.abteilung || '').trim()) {
        s.traegerArt = 'gruppe';
        if (!s.gruppenName) s.gruppenName = String(s.abteilung).trim();
      }
    }
    return s;
  }

  function migriere(projekt) {
    var vorlage = neuesProjekt();
    var out = {};
    Object.keys(vorlage).forEach(function (k) {
      out[k] = (projekt && projekt[k] !== undefined) ? projekt[k] : vorlage[k];
    });
    out.schemaVersion = SCHEMA_VERSION;
    out.standorte = Array.isArray(out.standorte) ? out.standorte : [];
    out.tueren = Array.isArray(out.tueren) ? out.tueren : [];
    out.schliessungen = Array.isArray(out.schliessungen) ? out.schliessungen : [];
    out.matrix = (out.matrix && typeof out.matrix === 'object') ? out.matrix : {};

    anlageAusTuerenErschliessen(out);   /* Anlage aus Alttüren erschließen */

    var tuerVorlage = neueTuer();
    var warSchonBekannt = !!(projekt && projekt.schemaVersion);
    out.tueren = out.tueren.map(function (t) {
      tuerUeberfuehren(t);          /* ältere Fassungen zuerst überführen */
      var neu = {};
      Object.keys(tuerVorlage).forEach(function (k) {
        neu[k] = (t && t[k] !== undefined) ? t[k] : tuerVorlage[k];
      });
      neu.id = t && t.id ? t.id : uid('tur');
      ['zylinderAusfuehrung', 'tueranforderungen', 'komponenten', 'fotos'].forEach(function (k) {
        if (!Array.isArray(neu[k])) neu[k] = [];
      });
      /* Ein bereits vergebener Status wird nie von der neuen
       * Vollständigkeitsprüfung überschrieben. */
      if (warSchonBekannt && (t && t.statusVonHand === undefined)) neu.statusVonHand = true;
      return neu;
    });

    var schlVorlage = neueSchliessung();
    out.schliessungen = out.schliessungen.map(function (s) {
      schliessungUeberfuehren(s);
      var neu = {};
      Object.keys(schlVorlage).forEach(function (k) {
        neu[k] = (s && s[k] !== undefined) ? s[k] : schlVorlage[k];
      });
      neu.id = s && s.id ? s.id : uid('sch');
      if (!Array.isArray(neu.personen)) neu.personen = [];
      neu.personen = neu.personen.filter(function (x) { return x && typeof x === 'object'; })
        .map(function (x) { return neuePerson(x); });
      return neu;
    });

    out.standorte = out.standorte.filter(function (k) { return k && k.id; }).map(function (k) {
      return {
        id: k.id,
        ebene: k.ebene || 'standort',
        name: k.name || '',
        parentId: k.parentId || null,
        bemerkung: k.bemerkung || '',
        sort: typeof k.sort === 'number' ? k.sort : 0
      };
    });

    matrixAufraeumen(out);
    return out;
  }

  global.Model = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    uid: uid,
    heute: heute,
    neuesProjekt: neuesProjekt,
    neuerStrukturknoten: neuerStrukturknoten,
    neueTuer: neueTuer,
    naechsteLaufendeNummer: naechsteLaufendeNummer,
    neueSchliessung: neueSchliessung,
    neuePerson: neuePerson,
    medienAnzahl: medienAnzahl,
    identmedienAuswahl: identmedienAuswahl,
    medienAngleichen: medienAngleichen,
    pflichtfelder: pflichtfelder,
    pflichtListe: pflichtListe,
    pflichtSchluessel: pflichtSchluessel,
    tuerVollstaendig: tuerVollstaendig,
    statusAusPruefung: statusAusPruefung,
    unvollstaendigeTueren: unvollstaendigeTueren,
    tuerSystemId: tuerSystemId,
    tuerTechnologie: tuerTechnologie,
    istTuerElektronisch: istTuerElektronisch,
    anlageVollstaendig: anlageVollstaendig,
    matrixKey: matrixKey,
    getBerechtigung: getBerechtigung,
    setBerechtigung: setBerechtigung,
    matrixAufraeumen: matrixAufraeumen,
    strukturPfad: strukturPfad,
    knotenMitUnter: knotenMitUnter,
    tuerenUnter: tuerenUnter,
    findeStruktur: findeStruktur,
    strukturPfadText: strukturPfadText,
    kinderVon: kinderVon,
    loescheStruktur: loescheStruktur,
    strukturReihenfolge: strukturReihenfolge,
    tuerenGruppiert: tuerenGruppiert,
    blankoSchliessplan: blankoSchliessplan,
    blankoVorschau: blankoVorschau,
    kuerzelAus: kuerzelAus,
    materialliste: materialliste,
    statistik: statistik,
    pruefeProjekt: pruefeProjekt,
    tuerUeberfuehren: tuerUeberfuehren,
    schliessungUeberfuehren: schliessungUeberfuehren,
    anlageAusTuerenErschliessen: anlageAusTuerenErschliessen,
    migriere: migriere
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Model; }
})(typeof window !== 'undefined' ? window : globalThis);
