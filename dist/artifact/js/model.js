/* =============================================================================
 * model.js — Datenmodell, Migration und Validierung
 * ========================================================================== */
(function (global) {
  'use strict';

  var SCHEMA_VERSION = 1;

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

      /* --- System --- */
      technologie: 'offen',
      systemId: '',
      systemDetail: '',           // Freitext, z.B. Profil/Variante
      identmedien: [],

      /* --- Bauteilbedarf --- */
      brauchtZylinder: true,
      brauchtBeschlag: false,
      brauchtSchloss: false,
      brauchtWandleser: false,
      zylinderArt: '',
      beschlagArt: '',
      schlossArt: '',
      komponenten: [],            // ausgewählte System-Komponenten

      /* --- Zutritts-/Funktionsart --- */
      zutrittsarten: [],          // Mehrfachauswahl aus Katalog.ZUTRITTSARTEN

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
    var K = global.Katalog;
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
      var sysId = t.systemId || 'nicht-zugeordnet';
      var b = bucket(sysId);
      b.tueren += anzahl;

      if (t.brauchtZylinder && t.zylinderArt && t.zylinderArt !== 'Kein Zylinder') {
        var laenge = '';
        if (t.masseAussen || t.masseInnen) {
          laenge = (t.masseAussen || '?') + '/' + (t.masseInnen || '?') + ' mm';
        }
        addPos(b, t.zylinderArt, anzahl, laenge);
      }
      if (t.brauchtBeschlag && t.beschlagArt && t.beschlagArt !== 'Kein Beschlag erforderlich') {
        addPos(b, t.beschlagArt, anzahl, t.vierkant ? ('VK ' + t.vierkant) : '');
      }
      if (t.brauchtSchloss && t.schlossArt) {
        var sDetail = [];
        if (t.dornmass) sDetail.push('DM ' + t.dornmass);
        if (t.entfernung) sDetail.push('E ' + t.entfernung);
        addPos(b, t.schlossArt, anzahl, sDetail.join(' / '));
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
      s.proTechnologie[t.technologie] = (s.proTechnologie[t.technologie] || 0) + 1;
    });
    s.schliessungen = projekt.schliessungen.length;
    s.berechtigungen = Object.keys(projekt.matrix).length;
    return s;
  }

  /* --- Validierung / Plausibilitätsprüfung -------------------------------- */
  function pruefeProjekt(projekt) {
    var probleme = [];
    var nummern = {};

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
      if (!t.systemId) {
        probleme.push({ schwere: 'warn', tuerId: t.id, text: bez + ': kein Schließsystem ausgewählt' });
      }
      if (t.brauchtZylinder && !t.zylinderArt) {
        probleme.push({ schwere: 'warn', tuerId: t.id, text: bez + ': Zylinder benötigt, aber keine Zylinderart gewählt' });
      }
      if (t.brauchtZylinder && t.zylinderArt && t.zylinderArt !== 'Kein Zylinder' &&
          !t.masseAussen && !t.masseInnen) {
        probleme.push({ schwere: 'warn', tuerId: t.id, text: bez + ': keine Zylinderlänge erfasst' });
      }
      if (t.brauchtBeschlag && !t.beschlagArt) {
        probleme.push({ schwere: 'info', tuerId: t.id, text: bez + ': Beschlag benötigt, aber keine Beschlagsart gewählt' });
      }
      if (t.nacharbeit && !t.nacharbeitText) {
        probleme.push({ schwere: 'info', tuerId: t.id, text: bez + ': Nacharbeit markiert, aber nicht beschrieben' });
      }
      var zuPanik = (t.zutrittsarten || []).some(function (z) { return /Panik|Flucht/.test(z); });
      if (zuPanik && t.schlossArt && !/Panik/.test(t.schlossArt)) {
        probleme.push({ schwere: 'warn', tuerId: t.id, text: bez + ': Flucht-/Rettungsweg gewählt, Schlossart ist aber kein Panikschloss' });
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

    var tuerVorlage = neueTuer();
    out.tueren = out.tueren.map(function (t) {
      var neu = {};
      Object.keys(tuerVorlage).forEach(function (k) {
        neu[k] = (t && t[k] !== undefined) ? t[k] : tuerVorlage[k];
      });
      neu.id = t && t.id ? t.id : uid('tur');
      ['identmedien', 'zutrittsarten', 'komponenten', 'fotos'].forEach(function (k) {
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
    migriere: migriere
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Model; }
})(typeof window !== 'undefined' ? window : globalThis);
