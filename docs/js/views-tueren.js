/* =============================================================================
 * views-tueren.js — Türliste und Aufmaß-Formular
 * ========================================================================== */
(function (global) {
  'use strict';
  var A = global.AppKern, K = global.Katalog, M = global.Model, Store = global.Store;
  var el = A.el, Zustand = A.Zustand;

  /* Katalogliste inklusive der in den Einstellungen ergänzten Einträge */
  function katalog(name) {
    var eigene = (Zustand.einstellungen && Zustand.einstellungen['eigene' + name]) || [];
    return (K[name.toUpperCase()] || K[name] || []).concat(eigene);
  }
  function zylinderarten() { return K.ZYLINDERARTEN.concat(eigeneListe('eigeneZylinderarten')); }
  function zutrittsarten() { return K.ZUTRITTSARTEN.concat(eigeneListe('eigeneZutrittsarten')); }
  function beschlagarten() { return K.BESCHLAGARTEN.concat(eigeneListe('eigeneBeschlagarten')); }
  function schlossarten() { return K.SCHLOSSARTEN.concat(eigeneListe('eigeneSchlossarten')); }
  function eigeneListe(schluessel) {
    var w = Zustand.einstellungen && Zustand.einstellungen[schluessel];
    return Array.isArray(w) ? w : [];
  }
  function alleSysteme() {
    return K.SYSTEME.concat(eigeneListe('eigeneSysteme'));
  }

  /* Auswahlliste aller Strukturknoten mit eingerücktem Pfad */
  function strukturOptionen() {
    var p = Zustand.projekt, out = [];
    function lauf(parentId, tiefe) {
      if (tiefe > 8) return;
      M.kinderVon(p, parentId).forEach(function (k) {
        out.push({ id: k.id, label: (tiefe ? '  '.repeat(tiefe) + '└ ' : '') + k.name });
        lauf(k.id, tiefe + 1);
      });
    }
    lauf(null, 0);
    return out;
  }

  /* =========================================================================
   * Türliste
   * ====================================================================== */
  function ansichtTueren(behaelter, neuZeichnen) {
    var p = Zustand.projekt;
    var seite = el('div', { class: 'seite' });
    behaelter.appendChild(seite);

    var s = M.statistik(p);
    seite.appendChild(el('div', { class: 'zeile-verteilt', style: { marginBottom: '12px' } }, [
      el('div', { class: 'fuellen' }, [
        el('h1', { text: 'Türen' }),
        el('p', { class: 'hinweis', text: s.tueren + ' Positionen  ·  ' + s.tuerenGesamtAnzahl +
          ' Türen gesamt' + (s.nacharbeit ? '  ·  ' + s.nacharbeit + ' mit Nacharbeit' : '') })
      ]),
      el('button', { class: 'haupt', text: '+ Neue Tür',
        onclick: function () { tuerBearbeiten(null, neuZeichnen); } })
    ]));

    /* --- Filterleiste --- */
    var f = Zustand.tuerFilter;
    var suchfeld = el('input', {
      type: 'search', placeholder: 'Suche: Nummer, Raum, System, Bemerkung …', value: f.suche,
      oninput: function (e) { f.suche = e.target.value; listeZeichnen(); }
    });
    var strukturWahl = el('select', {
      onchange: function (e) { f.struktur = e.target.value; listeZeichnen(); }
    });
    strukturWahl.appendChild(el('option', { value: '', text: 'Alle Bereiche' }));
    strukturOptionen().forEach(function (o) {
      strukturWahl.appendChild(el('option', { value: o.id, text: o.label }));
    });
    strukturWahl.appendChild(el('option', { value: '__ohne__', text: 'Ohne Zuordnung' }));
    strukturWahl.value = f.struktur;

    var statusWahl = el('select', {
      onchange: function (e) { f.status = e.target.value; listeZeichnen(); }
    });
    statusWahl.appendChild(el('option', { value: '', text: 'Alle Status' }));
    K.STATUS.forEach(function (st) { statusWahl.appendChild(el('option', { value: st.id, text: st.label })); });
    statusWahl.value = f.status;

    var systemWahl = el('select', {
      onchange: function (e) { f.system = e.target.value; listeZeichnen(); }
    });
    systemWahl.appendChild(el('option', { value: '', text: 'Alle Systeme' }));
    var verwendete = {};
    p.tueren.forEach(function (t) { if (t.systemId) verwendete[t.systemId] = true; });
    Object.keys(verwendete).forEach(function (id) {
      systemWahl.appendChild(el('option', { value: id, text: K.systemLabel(id, eigeneListe('eigeneSysteme')) }));
    });
    systemWahl.value = f.system;

    seite.appendChild(el('div', { class: 'werkzeuge' }, [
      el('div', { class: 'suche' }, suchfeld),
      strukturWahl, statusWahl, systemWahl,
      el('button', { class: 'klein', text: 'Filter zurücksetzen', onclick: function () {
        Zustand.tuerFilter = { suche: '', struktur: '', status: '', system: '' };
        neuZeichnen();
      } })
    ]));

    var listenBereich = el('div');
    seite.appendChild(listenBereich);
    listeZeichnen();

    function passt(t) {
      if (f.status && t.status !== f.status) return false;
      if (f.system && t.systemId !== f.system) return false;
      if (f.struktur === '__ohne__' && t.strukturId) return false;
      if (f.struktur && f.struktur !== '__ohne__' && t.strukturId !== f.struktur) return false;
      if (f.suche) {
        var q = f.suche.toLowerCase();
        var heu = [t.nummer, t.bezeichnung, t.kategorie, t.notiz, t.nacharbeitText,
                   t.zylinderArt, t.beschlagArt, t.schlossArt, t.systemDetail,
                   K.systemLabel(t.systemId, eigeneListe('eigeneSysteme')),
                   (t.zutrittsarten || []).join(' ')].join(' ').toLowerCase();
        if (heu.indexOf(q) === -1) return false;
      }
      return true;
    }

    function listeZeichnen() {
      A.leeren(listenBereich);
      var gefiltert = p.tueren.filter(passt);

      if (!p.tueren.length) {
        listenBereich.appendChild(el('div', { class: 'leer' }, [
          el('h3', { text: 'Noch keine Tür erfasst' }),
          el('p', { text: 'Erfassen Sie die erste Tür. Tipp: Gliedern Sie zuerst unter „Struktur“ die Standorte und Etagen – dann lassen sich die Türen direkt zuordnen.' }),
          el('button', { class: 'haupt', text: '+ Erste Tür aufnehmen',
            onclick: function () { tuerBearbeiten(null, neuZeichnen); } })
        ]));
        return;
      }
      if (!gefiltert.length) {
        listenBereich.appendChild(el('div', { class: 'leer' }, [
          el('h3', { text: 'Keine Tür passt zum Filter' }),
          el('p', { text: 'Passen Sie Suche oder Filter an.' })
        ]));
        return;
      }

      /* Gruppierung wie in der PDF-Ausgabe */
      var teilProjekt = { standorte: p.standorte, tueren: gefiltert, schliessungen: p.schliessungen, matrix: p.matrix };
      M.tuerenGruppiert(teilProjekt).forEach(function (g) {
        var anzahl = g.tueren.reduce(function (sum, t) { return sum + (parseInt(t.anzahl, 10) || 1); }, 0);
        var liste = el('div', { class: 'tuer-liste' });
        g.tueren.forEach(function (t) { liste.appendChild(tuerZeile(t, neuZeichnen)); });
        listenBereich.appendChild(el('div', { class: 'tuer-gruppe' }, [
          el('div', { class: 'kopfzeile' }, [
            el('span', { text: g.titel }),
            el('span', { class: 'anzahl', text: g.tueren.length + ' Pos.  ·  ' + anzahl +
              (anzahl === 1 ? ' Tür' : ' Türen') })
          ]),
          liste
        ]));
      });
    }
  }

  function tuerZeile(t, neuZeichnen) {
    var status = K.statusById(t.status);
    var details = [];
    if (t.systemId) details.push(K.systemLabel(t.systemId, eigeneListe('eigeneSysteme')));
    if (t.brauchtZylinder && t.zylinderArt) details.push(t.zylinderArt);
    if (t.masseAussen || t.masseInnen) details.push((t.masseAussen || '–') + '/' + (t.masseInnen || '–') + ' mm');
    if (t.brauchtBeschlag && t.beschlagArt) details.push(t.beschlagArt);
    if (t.kategorie) details.push(t.kategorie);

    return el('div', {
      class: 'tuer-zeile',
      onclick: function () { tuerBearbeiten(t, neuZeichnen); }
    }, [
      el('div', { class: 'statusbalken', style: { background: t.nacharbeit ? '#c62828' : status.farbe } }),
      el('div', { class: 'inhalt' }, [
        el('div', { class: 'nummer', text: t.nummer || '—' }),
        el('div', { class: 'haupt' }, [
          el('div', { class: 'bez', text: t.bezeichnung || 'Ohne Bezeichnung' }),
          el('div', { class: 'detail', text: details.join('  ·  ') || 'Noch keine Angaben' })
        ]),
        el('div', { class: 'marken' }, [
          (parseInt(t.anzahl, 10) || 1) > 1 ? el('span', { class: 'marke-pille blau', text: t.anzahl + '×' }) : null,
          (t.fotos || []).length ? el('span', { class: 'marke-pille foto', text: String(t.fotos.length) }) : null,
          t.nacharbeit ? el('span', { class: 'marke-pille rot', text: 'Nacharbeit' }) : null,
          el('span', {
            class: 'marke-pille ' + (t.status === 'aufgemessen' ? 'gruen'
              : t.status === 'klaerung' ? 'gelb' : t.status === 'nacharbeit' ? 'rot'
              : t.status === 'freigegeben' ? 'blau' : ''),
            text: status.label
          })
        ])
      ])
    ]);
  }

  /* =========================================================================
   * Aufmaß-Formular
   * ====================================================================== */
  function tuerBearbeiten(vorhandene, neuZeichnen) {
    var p = Zustand.projekt;
    var istNeu = !vorhandene;
    /* Auf einer Kopie arbeiten, damit „Abbrechen“ wirklich verwirft */
    var t = istNeu ? M.neueTuer(vorlageAusLetzterTuer()) : JSON.parse(JSON.stringify(vorhandene));

    var inhalt = el('div');
    var abschnitte = [];

    function abschnitt(titel, offen, kinder, zusatzGeber) {
      var koerper = el('div', { class: 'koerper' }, kinder);
      var zusatz = el('span', { class: 'zusatz' });
      var d = el('details', { class: 'abschnitt', open: offen }, [
        el('summary', {}, [el('span', { text: titel }), zusatz]),
        koerper
      ]);
      abschnitte.push({ knoten: d, zusatz: zusatz, geber: zusatzGeber });
      return d;
    }
    function zusammenfassungenAktualisieren() {
      abschnitte.forEach(function (a) { if (a.geber) a.zusatz.textContent = a.geber() || ''; });
    }

    /* --- 1. Identifikation --- */
    var strukturAuswahl = A.auswahlFeld(t, 'strukturId', 'Standort / Gebäude / Bereich',
      strukturOptionen(), { leerText: '– ohne Zuordnung –' });

    inhalt.appendChild(abschnitt('Türkennung und Lage', true, [
      el('div', { class: 'raster' }, [
        A.textFeld(t, 'nummer', 'Türnummer', { platzhalter: 'z. B. A-EG-01' }),
        A.textFeld(t, 'bezeichnung', 'Bezeichnung / Raum', { platzhalter: 'z. B. Büro Empfang' }),
        A.auswahlFeld(t, 'kategorie', 'Türkategorie', K.TUERKATEGORIEN),
        strukturAuswahl,
        A.textFeld(t, 'etage', 'Etage (Freitext, falls keine Struktur gepflegt)'),
        A.textFeld(t, 'anzahl', 'Anzahl baugleicher Türen', { typ: 'number', inputmode: 'numeric' }),
        A.auswahlFeld(t, 'status', 'Status', K.STATUS, { leerText: '– offen –' })
      ])
    ]));

    /* --- 2. System --- */
    var systemHinweis = el('p', { class: 'hinweis', style: { margin: '8px 0 0' } });
    var komponentenBereich = el('div');
    var identBereich = el('div');

    function systemAbhaengigesZeichnen() {
      var sys = K.systemById(t.systemId, eigeneListe('eigeneSysteme'));
      systemHinweis.textContent = sys && sys.hinweis ? sys.hinweis : '';
      A.leeren(komponentenBereich);
      A.leeren(identBereich);
      if (sys && sys.komponenten && sys.komponenten.length) {
        komponentenBereich.appendChild(A.chipFeld(t, 'komponenten', 'Benötigte Systemkomponenten', sys.komponenten));
      }
      if (sys && sys.identmedien && sys.identmedien.length) {
        identBereich.appendChild(A.chipFeld(t, 'identmedien', 'Identmedien', sys.identmedien));
      }
      zusammenfassungenAktualisieren();
    }

    var systemOptionen = alleSysteme().map(function (s) {
      return { id: s.id, label: K.systemLabel(s.id, eigeneListe('eigeneSysteme')) +
        (s.typ === 'mechanisch' ? '  (Mechanik)' : s.typ === 'elektronisch' ? '  (Elektronik)' : '') };
    });

    inhalt.appendChild(abschnitt('Schließsystem', true, [
      el('div', { class: 'raster' }, [
        A.auswahlFeld(t, 'technologie', 'Technologie', K.TECHNOLOGIE, { leerText: '– noch offen –' }),
        A.auswahlFeld(t, 'systemId', 'System', systemOptionen, {
          leerText: '– kein System gewählt –',
          beiAenderung: function (wert) {
            var sys = K.systemById(wert, eigeneListe('eigeneSysteme'));
            if (sys && sys.typ && sys.typ !== 'offen') t.technologie = sys.typ;
            systemAbhaengigesZeichnen();
            neuZeichnenFormular();
          }
        }),
        A.textFeld(t, 'systemDetail', 'Systemdetail / Variante', { platzhalter: 'z. B. Profilzylinder, Sonderfarbe' })
      ]),
      systemHinweis, komponentenBereich, identBereich
    ], function () {
      return t.systemId ? K.systemLabel(t.systemId, eigeneListe('eigeneSysteme')) : 'kein System gewählt';
    }));
    systemAbhaengigesZeichnen();

    /* --- 3. Bauteile --- */
    var zylinderFelder = el('div', { class: 'raster' });
    var beschlagFelder = el('div', { class: 'raster' });
    var schlossFelder = el('div', { class: 'raster' });

    function bauteilFelderZeichnen() {
      A.leeren(zylinderFelder); A.leeren(beschlagFelder); A.leeren(schlossFelder);
      if (t.brauchtZylinder) {
        zylinderFelder.appendChild(A.auswahlFeld(t, 'zylinderArt', 'Zylinderart', zylinderarten()));
        zylinderFelder.appendChild(A.textFeld(t, 'masseAussen', 'Zylinderlänge <span class="einheit">außen, mm</span>',
          { typ: 'number', inputmode: 'numeric', platzhalter: 'z. B. 35' }));
        zylinderFelder.appendChild(A.textFeld(t, 'masseInnen', 'Zylinderlänge <span class="einheit">innen, mm</span>',
          { typ: 'number', inputmode: 'numeric', platzhalter: 'z. B. 40' }));
      }
      if (t.brauchtBeschlag) {
        beschlagFelder.appendChild(A.auswahlFeld(t, 'beschlagArt', 'Beschlag / Drücker', beschlagarten()));
        beschlagFelder.appendChild(A.textFeld(t, 'vierkant', 'Vierkant <span class="einheit">mm</span>',
          { typ: 'number', inputmode: 'numeric', platzhalter: 'z. B. 8' }));
      }
      if (t.brauchtSchloss) {
        schlossFelder.appendChild(A.auswahlFeld(t, 'schlossArt', 'Schlossart', schlossarten()));
        schlossFelder.appendChild(A.textFeld(t, 'dornmass', 'Dornmaß <span class="einheit">mm</span>',
          { typ: 'number', inputmode: 'numeric', platzhalter: 'z. B. 55' }));
        schlossFelder.appendChild(A.textFeld(t, 'entfernung', 'Entfernung <span class="einheit">mm</span>',
          { typ: 'number', inputmode: 'numeric', platzhalter: 'z. B. 72' }));
        schlossFelder.appendChild(A.textFeld(t, 'stulpmass', 'Stulpmaß / Stulpform'));
      }
      zusammenfassungenAktualisieren();
    }

    inhalt.appendChild(abschnitt('Benötigte Bauteile', true, [
      el('div', { class: 'raster eng' }, [
        A.schalterFeld(t, 'brauchtZylinder', 'Zylinder', function () { bauteilFelderZeichnen(); }),
        A.schalterFeld(t, 'brauchtBeschlag', 'Beschlag / Drücker', function () { bauteilFelderZeichnen(); }),
        A.schalterFeld(t, 'brauchtSchloss', 'Schloss', function () { bauteilFelderZeichnen(); }),
        A.schalterFeld(t, 'brauchtWandleser', 'Wandleser / Zutrittsleser', function () { zusammenfassungenAktualisieren(); })
      ]),
      el('hr', { class: 'trenner' }),
      zylinderFelder, beschlagFelder, schlossFelder
    ], function () {
      var teile = [];
      if (t.brauchtZylinder) teile.push('Zylinder');
      if (t.brauchtBeschlag) teile.push('Beschlag');
      if (t.brauchtSchloss) teile.push('Schloss');
      if (t.brauchtWandleser) teile.push('Wandleser');
      return teile.join(', ') || 'keine Bauteile gewählt';
    }));
    bauteilFelderZeichnen();

    /* --- 4. Zutritts- und Funktionsart --- */
    inhalt.appendChild(abschnitt('Zutritts- und Funktionsart', true, [
      A.chipFeld(t, 'zutrittsarten', 'Mehrfachauswahl möglich', zutrittsarten()),
      el('p', { class: 'hinweis', style: { marginTop: '10px' },
        text: 'Bei Flucht- und Rettungswegen sowie Brandschutztüren sind die bauaufsichtlichen Anforderungen zu beachten; die Auswahl hier ersetzt keine Prüfung vor Ort.' })
    ], function () {
      return (t.zutrittsarten || []).length ? t.zutrittsarten.length + ' gewählt' : 'nichts gewählt';
    }));

    /* --- 5. Maße und Türblatt --- */
    inhalt.appendChild(abschnitt('Maße und Türblatt', false, [
      el('div', { class: 'raster' }, [
        A.textFeld(t, 'tuerblattstaerke', 'Türblattstärke <span class="einheit">mm</span>', { typ: 'number', inputmode: 'numeric' }),
        A.textFeld(t, 'profilbreite', 'Profilbreite <span class="einheit">mm</span>', { typ: 'number', inputmode: 'numeric' }),
        A.auswahlFeld(t, 'tuermaterial', 'Türblattmaterial', K.TUERMATERIAL),
        A.auswahlFeld(t, 'dinRichtung', 'DIN-Richtung', K.DIN_RICHTUNG),
        A.auswahlFeld(t, 'oeffnungsrichtung', 'Öffnungsrichtung', K.TUER_OEFFNUNG),
        A.textFeld(t, 'bohrbild', 'Bohrbild / Lochung')
      ]),
      el('div', { class: 'raster', style: { marginTop: '10px' } }, [
        A.bereichFeld(t, 'masseBemerkung', 'Bemerkung zu den Maßen', { zeilen: 2 })
      ])
    ], function () {
      var v = [t.tuerblattstaerke && t.tuerblattstaerke + ' mm Blatt', t.dinRichtung].filter(Boolean);
      return v.join(', ');
    }));

    /* --- 6. Bestand --- */
    inhalt.appendChild(abschnitt('Bestand / Altanlage', false, [
      el('div', { class: 'raster' }, [
        A.textFeld(t, 'bestandFabrikat', 'Vorhandenes Fabrikat', { platzhalter: 'z. B. EVVA, Kaba, ABUS' }),
        A.textFeld(t, 'bestandZylinderart', 'Vorhandene Zylinderart'),
        A.textFeld(t, 'bestandLaenge', 'Vorhandene Länge', { platzhalter: 'z. B. 30/35' }),
        A.textFeld(t, 'bestandAnzahlSchluessel', 'Anzahl vorhandener Schlüssel', { typ: 'number', inputmode: 'numeric' })
      ]),
      el('div', { class: 'raster', style: { marginTop: '10px' } }, [
        A.bereichFeld(t, 'bestandBemerkung', 'Bemerkung zum Bestand', { zeilen: 2 })
      ])
    ], function () { return t.bestandFabrikat || ''; }));

    /* --- 7. Elektronik --- */
    inhalt.appendChild(abschnitt('Elektronik und Vernetzung', false, [
      el('div', { class: 'raster' }, [
        A.auswahlFeld(t, 'elFunkabdeckung', 'Funkabdeckung vor Ort',
          ['gut', 'mittel', 'schlecht', 'nicht geprüft', 'nicht erforderlich']),
        A.auswahlFeld(t, 'elStromversorgung', 'Stromversorgung',
          ['Batterie', '12V vorhanden', '24V vorhanden', '230V vorhanden', 'PoE', 'muss verlegt werden', 'nicht erforderlich']),
        A.auswahlFeld(t, 'elVernetzung', 'Vernetzung',
          ['offline (Stand-alone)', 'virtuelles Netzwerk', 'online / verkabelt', 'funkvernetzt', 'noch offen'])
      ]),
      el('div', { style: { marginTop: '10px' } }, [
        A.schalterFeld(t, 'elTuerueberwachung', 'Türüberwachung / Türzustandsmeldung gewünscht')
      ]),
      el('div', { class: 'raster', style: { marginTop: '10px' } }, [
        A.bereichFeld(t, 'elBemerkung', 'Bemerkung Elektronik', { zeilen: 2 })
      ])
    ], function () { return t.elVernetzung || ''; }));

    /* --- 8. Bemerkungen und Nacharbeit --- */
    var nacharbeitFeld = el('div');
    function nacharbeitZeichnen() {
      A.leeren(nacharbeitFeld);
      if (t.nacharbeit) {
        nacharbeitFeld.appendChild(el('div', { class: 'raster' }, [
          A.bereichFeld(t, 'nacharbeitText', 'Was ist nachzuarbeiten?', {
            zeilen: 3, platzhalter: 'z. B. Maß fehlt, Rücksprache mit Kunde nötig, Tür war verschlossen …'
          })
        ]));
      }
      zusammenfassungenAktualisieren();
    }
    inhalt.appendChild(abschnitt('Bemerkungen und Nacharbeit', true, [
      el('div', { class: 'raster' }, [
        A.bereichFeld(t, 'notiz', 'Bemerkung zur Tür', { zeilen: 3 })
      ]),
      el('div', { style: { marginTop: '10px' } }, [
        A.schalterFeld(t, 'nacharbeit', 'Nacharbeit erforderlich', function () { nacharbeitZeichnen(); })
      ]),
      nacharbeitFeld
    ], function () { return t.nacharbeit ? 'Nacharbeit offen' : ''; }));
    nacharbeitZeichnen();

    /* --- 9. Fotos --- */
    var fotoRaster = el('div', { class: 'foto-raster' });
    var fotoEingabe = el('input', {
      type: 'file', accept: 'image/*', multiple: true, class: 'versteckt',
      onchange: function (e) { fotosHinzufuegen(Array.prototype.slice.call(e.target.files)); e.target.value = ''; }
    });
    var kameraEingabe = el('input', {
      type: 'file', accept: 'image/*', capture: 'environment', class: 'versteckt',
      onchange: function (e) { fotosHinzufuegen(Array.prototype.slice.call(e.target.files)); e.target.value = ''; }
    });

    function fotosHinzufuegen(dateien) {
      if (!dateien.length) return;
      var eins = Zustand.einstellungen || {};
      A.toast(dateien.length === 1 ? 'Foto wird verarbeitet …' : dateien.length + ' Fotos werden verarbeitet …');
      var aufgaben = dateien.map(function (d) {
        return Store.fotoVerarbeiten(d, eins.fotoMaxKante || 1280, eins.fotoQualitaet || 0.72)
          .then(function (foto) { t.fotos.push(foto); return true; })
          .catch(function (fehler) { A.toast(fehler.message, 'fehler'); return false; });
      });
      Promise.all(aufgaben).then(function (ergebnisse) {
        var erfolgreich = ergebnisse.filter(Boolean).length;
        if (erfolgreich) A.toast(erfolgreich + ' Foto(s) hinzugefügt.', 'ok');
        fotosZeichnen();
      });
    }

    function fotosZeichnen() {
      A.leeren(fotoRaster);
      (t.fotos || []).forEach(function (foto, index) {
        var beschriftung = el('input', {
          type: 'text', value: foto.beschriftung || '', placeholder: 'Beschriftung',
          oninput: function (e) { foto.beschriftung = e.target.value; }
        });
        fotoRaster.appendChild(el('div', { class: 'foto-karte' }, [
          el('img', { src: foto.dataUrl, alt: foto.beschriftung || 'Türfoto', loading: 'lazy' }),
          el('div', { class: 'unten' }, [
            beschriftung,
            el('button', { class: 'gefahr klein', text: 'Entfernen', onclick: function () {
              t.fotos.splice(index, 1); fotosZeichnen();
            } })
          ])
        ]));
      });
      if (!t.fotos.length) {
        fotoRaster.appendChild(el('p', { class: 'zart', text: 'Noch keine Fotos zu dieser Tür.' }));
      }
      zusammenfassungenAktualisieren();
    }

    inhalt.appendChild(abschnitt('Fotos', false, [
      el('div', { class: 'knopfleiste', style: { marginBottom: '12px' } }, [
        el('button', { class: 'haupt', text: '📷 Foto aufnehmen',
          onclick: function () { kameraEingabe.click(); } }),
        el('button', { text: 'Aus Mediathek wählen', onclick: function () { fotoEingabe.click(); } }),
        fotoEingabe, kameraEingabe
      ]),
      fotoRaster
    ], function () { return (t.fotos || []).length ? t.fotos.length + ' Foto(s)' : ''; }));
    fotosZeichnen();

    zusammenfassungenAktualisieren();

    /* --- Dialog --- */
    function neuZeichnenFormular() { /* Platzhalter: gezielte Teilaktualisierungen genügen */ }

    function uebernehmen(undWeiter) {
      if (!t.nummer && !t.bezeichnung) {
        A.toast('Bitte mindestens Türnummer oder Bezeichnung angeben.', 'fehler');
        return false;
      }
      t.anzahl = Math.max(1, parseInt(t.anzahl, 10) || 1);
      t.geaendert = new Date().toISOString();
      if (istNeu) {
        p.tueren.push(t);
      } else {
        var i = p.tueren.findIndex(function (x) { return x.id === t.id; });
        if (i >= 0) p.tueren[i] = t; else p.tueren.push(t);
      }
      A.alsGeaendertMarkieren();
      A.speichern();
      letzteTuerMerken(t);
      if (undWeiter) {
        A.toast('Tür gespeichert. Nächste Tür …', 'ok');
        neuZeichnen();
        setTimeout(function () { tuerBearbeiten(null, neuZeichnen); }, 120);
        return true;
      }
      A.toast('Tür gespeichert.', 'ok');
      neuZeichnen();
      return true;
    }

    var knoepfe = [];
    if (!istNeu) {
      knoepfe.push({ text: 'Duplizieren', aktion: function (schliessen) {
        var kopie = JSON.parse(JSON.stringify(t));
        kopie.id = M.uid('tur');
        kopie.nummer = naechsteNummer(t.nummer);
        kopie.fotos = [];
        p.tueren.push(kopie);
        A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
        schliessen();
        setTimeout(function () { tuerBearbeiten(kopie, neuZeichnen); }, 100);
        return false;
      } });
      knoepfe.push({ text: 'Löschen', klasse: 'gefahr', aktion: function (schliessen) {
        A.bestaetigen('Tür löschen?', 'Die Tür „' + (t.nummer || t.bezeichnung) +
          '“ wird gelöscht, samt Fotos und Berechtigungen im Schließplan.').then(function (ja) {
          if (!ja) return;
          p.tueren = p.tueren.filter(function (x) { return x.id !== t.id; });
          M.matrixAufraeumen(p);
          A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
          A.toast('Tür gelöscht.');
          schliessen();
        });
        return false;
      } });
    }
    knoepfe.push({ fuellen: true });
    knoepfe.push({ text: 'Abbrechen' });
    if (istNeu) {
      knoepfe.push({ text: 'Speichern & nächste', aktion: function (schliessen) {
        if (uebernehmen(true)) schliessen();
        return false;
      } });
    }
    knoepfe.push({ text: istNeu ? 'Tür speichern' : 'Änderungen übernehmen', klasse: 'haupt',
      aktion: function (schliessen) { if (uebernehmen(false)) schliessen(); return false; } });

    A.dialogOeffnen({
      titel: istNeu ? 'Neue Tür aufnehmen'
        : 'Tür bearbeiten: ' + (t.nummer || t.bezeichnung || ''),
      inhalt: inhalt, knoepfe: knoepfe
    });
  }

  /* Übernimmt wiederkehrende Angaben der zuletzt erfassten Tür als Vorbelegung. */
  var letzteTuer = null;
  function letzteTuerMerken(t) {
    letzteTuer = {
      strukturId: t.strukturId, etage: t.etage, technologie: t.technologie,
      systemId: t.systemId, brauchtZylinder: t.brauchtZylinder,
      brauchtBeschlag: t.brauchtBeschlag, brauchtSchloss: t.brauchtSchloss,
      zylinderArt: t.zylinderArt, beschlagArt: t.beschlagArt, schlossArt: t.schlossArt,
      kategorie: t.kategorie, identmedien: (t.identmedien || []).slice(),
      zutrittsarten: (t.zutrittsarten || []).slice(), nummer: t.nummer
    };
  }
  function vorlageAusLetzterTuer() {
    var v = letzteTuer ? JSON.parse(JSON.stringify(letzteTuer)) : {};
    if (letzteTuer) v.nummer = naechsteNummer(letzteTuer.nummer);
    /* Ist in der Liste ein Bereich gefiltert, wird die neue Tür dort eingeordnet -
       beim Aufmaß arbeitet man Etage für Etage ab. */
    var f = Zustand.tuerFilter;
    if (f && f.struktur && f.struktur !== '__ohne__') v.strukturId = f.struktur;
    else if (!v.strukturId) {
      /* Gibt es genau einen Bereich, ist die Zuordnung eindeutig. */
      var blaetter = strukturOptionen();
      if (blaetter.length === 1) v.strukturId = blaetter[0].id;
    }
    return Object.keys(v).length ? v : null;
  }
  /* "A-EG-01" -> "A-EG-02"; ohne Ziffer am Ende bleibt das Feld leer. */
  function naechsteNummer(nummer) {
    if (!nummer) return '';
    var treffer = /^(.*?)(\d+)(\D*)$/.exec(String(nummer));
    if (!treffer) return '';
    var ziffern = treffer[2];
    var naechste = String(parseInt(ziffern, 10) + 1);
    while (naechste.length < ziffern.length) naechste = '0' + naechste;
    return treffer[1] + naechste + treffer[3];
  }

  global.ViewsTueren = {
    ansichtTueren: ansichtTueren,
    tuerBearbeiten: tuerBearbeiten,
    strukturOptionen: strukturOptionen,
    naechsteNummer: naechsteNummer,
    eigeneListe: eigeneListe
  };
})(typeof window !== 'undefined' ? window : globalThis);
