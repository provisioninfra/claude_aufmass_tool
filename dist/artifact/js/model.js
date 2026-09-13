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
      status: 'offen',

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

      schlossBauform: '',
      schlossFunktion: '',

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

      /* --- Bestand (Altanlage) --- */
      bestandFabrikat: '',
      bestandZylinderart: '',
      bestandLaenge: '',
      bestandAnzahlSchluessel: '',
      bestandBemerkung: '',

      /* --- Elektronik --- */
      elFunkabdeckung: '',        // gut / mittel / schlecht / nicht geprüft
      elStromversorgung: '',      // Batterie / 12V / PoE / vorhanden
      elVernetzung: '',           // offline / virtuelles Netzwerk / online
      elTuerueberwachung: false,
      elBemerkung: '',

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

  /* --- Schließung (Spalte im Kreuzschließplan) ---------------------------- */
  function neueSchliessung(vorgabe) {
    var s = {
      id: uid('sch'),
      kuerzel: '',
      bezeichnung: '',
      typ: 'ez',
      anzahlMedien: 1,           // Anzahl Schlüssel / Transponder / Karten
      person: '',
      abteilung: '',
      bemerkung: '',
      sort: 0
    };
    if (vorgabe) { for (var k in vorgabe) { if (Object.prototype.hasOwnProperty.call(vorgabe, k)) s[k] = vorgabe[k]; } }
    return s;
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
    function addPos(b, bezeichnung, menge, detail) {
      var key = bezeichnung + '||' + (detail || '');
      if (!b.positionen[key]) b.positionen[key] = { bezeichnung: bezeichnung, detail: detail || '', menge: 0 };
      b.positionen[key].menge += menge;
    }

    projekt.tueren.forEach(function (t) {
      var anzahl = parseInt(t.anzahl, 10); if (!anzahl || anzahl < 1) anzahl = 1;
      var sysId = tuerSystemId(projekt, t) || 'nicht-zugeordnet';
      var b = bucket(sysId);
      b.tueren += anzahl;

      var zylText = K ? K.zylinderText(t) : '';
      if (zylText) {
        var laenge = '';
        if (t.masseAussen || t.masseInnen) {
          laenge = (t.masseAussen || '?') + '/' + (t.masseInnen || '?') + ' mm';
        }
        addPos(b, zylText, anzahl, laenge);
      }
      var besText = K ? K.beschlagText(t) : '';
      if (besText) addPos(b, besText, anzahl, t.vierkant ? ('VK ' + t.vierkant) : '');
      var schText = K ? K.schlossText(t) : '';
      if (schText) {
        var sDetail = [];
        if (t.dornmass) sDetail.push('DM ' + t.dornmass);
        if (t.entfernung) sDetail.push('E ' + t.entfernung);
        addPos(b, schText, anzahl, sDetail.join(' / '));
      }
      if (t.brauchtWandleser && !(t.komponenten || []).some(function (k) { return /leser/i.test(k); })) {
        addPos(b, 'Wandleser / Zutrittsleser', anzahl, '');
      }
      (t.komponenten || []).forEach(function (komp) { addPos(b, komp, anzahl, ''); });
    });

    /* Identmedien aus dem Schließplan aggregieren */
    var medien = [];
    projekt.schliessungen.forEach(function (s) {
      var n = parseInt(s.anzahlMedien, 10); if (!n || n < 0) n = 0;
      if (n > 0) {
        medien.push({
          kuerzel: s.kuerzel || s.bezeichnung,
          bezeichnung: s.bezeichnung,
          typ: s.typ,
          menge: n
        });
      }
    });

    var listen = Object.keys(proSystem).map(function (k) {
      var b = proSystem[k];
      return {
        systemId: b.systemId,
        label: b.label,
        tueren: b.tueren,
        positionen: Object.keys(b.positionen).map(function (p) { return b.positionen[p]; })
          .sort(function (a, b2) { return a.bezeichnung.localeCompare(b2.bezeichnung, 'de'); })
      };
    }).sort(function (a, b) { return a.label.localeCompare(b.label, 'de'); });

    return { systeme: listen, medien: medien };
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
      if (!t.strukturId) {
        probleme.push({ schwere: 'info', tuerId: t.id, text: bez + ': keinem Standort/Gebäude zugeordnet' });
      }
      if (projekt.anlagenart === 'hybrid' && !t.tuerTechnologie) {
        probleme.push({ schwere: 'warn', tuerId: t.id,
          text: bez + ': Hybridanlage – Ausführung (mechanisch oder elektronisch) noch nicht festgelegt' });
      }
      if (t.brauchtZylinder && !t.zylinderBauform) {
        probleme.push({ schwere: 'warn', tuerId: t.id, text: bez + ': Zylinder benötigt, aber keine Bauform gewählt' });
      }
      if (t.brauchtZylinder && t.zylinderBauform && !t.masseAussen && !t.masseInnen) {
        probleme.push({ schwere: 'warn', tuerId: t.id, text: bez + ': keine Zylinderlänge erfasst' });
      }
      if (t.brauchtBeschlag && !t.beschlagBauform) {
        probleme.push({ schwere: 'info', tuerId: t.id, text: bez + ': Beschlag benötigt, aber keine Bauform gewählt' });
      }
      if (t.brauchtSchloss && !t.schlossBauform) {
        probleme.push({ schwere: 'info', tuerId: t.id, text: bez + ': Schloss benötigt, aber keine Bauform gewählt' });
      }
      if (t.brauchtZylinder && !t.zutrittsseite) {
        probleme.push({ schwere: 'info', tuerId: t.id, text: bez + ': Zutrittsseite nicht angegeben' });
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
      if (!s.kuerzel && !s.bezeichnung) {
        probleme.push({ schwere: 'warn', text: 'Schließung ohne Kürzel und Bezeichnung' });
      }
      if (s.kuerzel) {
        if (kuerzel[s.kuerzel]) probleme.push({ schwere: 'warn', text: 'Kürzel "' + s.kuerzel + '" ist doppelt vergeben' });
        kuerzel[s.kuerzel] = true;
      }
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

    var panik = /Funktion\s*([BEDC])\b/i.exec(text);
    if (panik) {
      var zusatz = { B: 'Panik Funktion B (Umschaltfunktion)', E: 'Panik Funktion E (Wechselfunktion)',
                     D: 'Panik Funktion D (Durchgangsfunktion)', C: 'Panik Funktion C' };
      ziel.schlossFunktion = zusatz[panik[1].toUpperCase()] || '';
    } else if (/automatisch/i.test(text)) ziel.schlossFunktion = 'automatisch verriegelnd';
    else if (/selbstverriegelnd/i.test(text)) ziel.schlossFunktion = 'selbstverriegelnd';
    else if (/buntbart/i.test(text)) ziel.schlossFunktion = 'Buntbart';
    else if (/\bPZ\b|profilzylinder/i.test(text)) ziel.schlossFunktion = 'Profilzylinder (PZ)';
    else if (/rollfalle/i.test(text)) ziel.schlossFunktion = 'Rollfalle';
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

    /* Die frühere Sammelbezeichnung in zwei Ausführungen auflösen */
    if (Array.isArray(t.zylinderAusfuehrung)) {
      var i = t.zylinderAusfuehrung.indexOf('Freidreh / Komfort');
      if (i !== -1) {
        t.zylinderAusfuehrung.splice(i, 1, 'Freidreh');
      }
    }
    var hatAltfelder = ('zylinderArt' in t) || ('beschlagArt' in t) ||
                       ('schlossArt' in t) || ('zutrittsarten' in t);
    if (!hatAltfelder) return t;

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
      return neu;
    });

    var schlVorlage = neueSchliessung();
    out.schliessungen = out.schliessungen.map(function (s) {
      var neu = {};
      Object.keys(schlVorlage).forEach(function (k) {
        neu[k] = (s && s[k] !== undefined) ? s[k] : schlVorlage[k];
      });
      neu.id = s && s.id ? s.id : uid('sch');
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
    neueSchliessung: neueSchliessung,
    tuerSystemId: tuerSystemId,
    tuerTechnologie: tuerTechnologie,
    istTuerElektronisch: istTuerElektronisch,
    anlageVollstaendig: anlageVollstaendig,
    matrixKey: matrixKey,
    getBerechtigung: getBerechtigung,
    setBerechtigung: setBerechtigung,
    matrixAufraeumen: matrixAufraeumen,
    strukturPfad: strukturPfad,
    strukturPfadText: strukturPfadText,
    findeStruktur: findeStruktur,
    kinderVon: kinderVon,
    loescheStruktur: loescheStruktur,
    strukturReihenfolge: strukturReihenfolge,
    tuerenGruppiert: tuerenGruppiert,
    materialliste: materialliste,
    statistik: statistik,
    pruefeProjekt: pruefeProjekt,
    tuerUeberfuehren: tuerUeberfuehren,
    anlageAusTuerenErschliessen: anlageAusTuerenErschliessen,
    migriere: migriere
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Model; }
})(typeof window !== 'undefined' ? window : globalThis);
