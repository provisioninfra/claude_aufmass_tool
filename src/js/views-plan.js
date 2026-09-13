/* =============================================================================
 * views-plan.js — Kreuzschließplan, Export und Einstellungen
 * ========================================================================== */
(function (global) {
  'use strict';
  var A = global.AppKern, K = global.Katalog, M = global.Model,
      Store = global.Store, Reports = global.Reports;
  var el = A.el, Zustand = A.Zustand;

  /* Reihenfolge beim Antippen einer Matrixzelle */
  var ZELL_FOLGE = ['nein', 'ja', 'zeit', 'temp', 'sperr'];

  /* =========================================================================
   * Kreuzschließplan / Zutrittsmatrix
   * ====================================================================== */
  function ansichtPlan(behaelter, neuZeichnen) {
    var p = Zustand.projekt;
    var seite = el('div', { class: 'seite breit' });
    behaelter.appendChild(seite);

    seite.appendChild(el('div', { class: 'zeile-verteilt', style: { marginBottom: '12px' } }, [
      el('div', { class: 'fuellen' }, [
        el('h1', { text: 'Kreuzschließplan / Zutrittsmatrix' }),
        el('p', { class: 'hinweis', text: 'Zeilen sind die aufgemessenen Türen, Spalten die Schließungen bzw. Personen und Gruppen. Zelle antippen schaltet die Berechtigung weiter.' })
      ]),
      el('button', { class: 'haupt', text: '+ Schließung',
        onclick: function () { schliessungBearbeiten(null, neuZeichnen); } }),
      el('button', { text: 'Schließungen verwalten',
        onclick: function () { schliessungenVerwalten(neuZeichnen); } })
    ]));

    if (!p.tueren.length) {
      seite.appendChild(el('div', { class: 'leer' }, [
        el('h3', { text: 'Noch keine Türen erfasst' }),
        el('p', { text: 'Der Schließplan baut auf dem Aufmaß auf. Erfassen Sie zuerst die Türen.' })
      ]));
      return;
    }
    if (!p.schliessungen.length) {
      seite.appendChild(el('div', { class: 'leer' }, [
        el('h3', { text: 'Noch keine Schließungen angelegt' }),
        el('p', { text: 'Legen Sie Schließungen an – etwa GHS, Hauptschlüssel je Gebäude, Abteilungen oder einzelne Personen.' }),
        el('div', { class: 'knopfleiste', style: { justifyContent: 'center' } }, [
          el('button', { class: 'haupt', text: '+ Erste Schließung anlegen',
            onclick: function () { schliessungBearbeiten(null, neuZeichnen); } }),
          el('button', { text: 'Vorschlag übernehmen (GHS, HS, Hausmeister)',
            onclick: function () {
              [['GHS', 'Generalhauptschlüssel', 'ghs', 2],
               ['HS', 'Hauptschlüssel', 'hs', 2],
               ['HM', 'Hausmeister', 'person', 2]].forEach(function (v, i) {
                p.schliessungen.push(M.neueSchliessung({
                  kuerzel: v[0], bezeichnung: v[1], typ: v[2], anzahlMedien: v[3], sort: i
                }));
              });
              A.alsGeaendertMarkieren(); neuZeichnen();
              A.toast('Drei Schließungen angelegt.', 'ok');
            } })
        ])
      ]));
      return;
    }

    var schliessungen = p.schliessungen.slice().sort(function (a, b) {
      return (a.sort - b.sort) || String(a.kuerzel).localeCompare(String(b.kuerzel), 'de', { numeric: true });
    });

    /* --- Tabelle aufbauen --- */
    var tabelle = el('table', { class: 'matrix' });
    /* Kopfhöhe am längsten Spaltentitel ausrichten: kurze Kürzel sollen keinen
       übergroßen Tabellenkopf erzwingen, lange Namen nicht abgeschnitten werden. */
    var laengsterTitel = schliessungen.reduce(function (max, s) {
      var t = ((s.kuerzel ? s.kuerzel + ' ' : '') + (s.bezeichnung || '')).length;
      return t > max ? t : max;
    }, 0);
    tabelle.style.setProperty('--kopfhoehe',
      Math.min(210, Math.max(70, laengsterTitel * 7.6 + 30)) + 'px');

    var kopfZeile = el('tr', {}, [el('th', { class: 'ecke', text: 'Tür / Schließung' })]);
    schliessungen.forEach(function (s) {
      var titel = (s.kuerzel ? s.kuerzel + ' ' : '') + (s.bezeichnung || '');
      kopfZeile.appendChild(el('th', {
        class: 'spaltenkopf', title: titel + (s.person ? ' – ' + s.person : ''),
        onclick: function () { schliessungBearbeiten(s, neuZeichnen); },
        style: { cursor: 'pointer' }
      }, [
        el('span', { class: 'dreh', text: titel || '–' }),
        el('span', { class: 'medien', text: (parseInt(s.anzahlMedien, 10) || 0) + '×' })
      ]));
    });
    tabelle.appendChild(el('thead', {}, kopfZeile));

    var koerper = el('tbody');
    var gruppen = M.tuerenGruppiert(p);
    gruppen.forEach(function (g) {
      koerper.appendChild(el('tr', { class: 'gruppenzeile' }, [
        el('td', { colspan: schliessungen.length + 1, text: g.titel })
      ]));
      g.tueren.forEach(function (t) {
        var zeile = el('tr');
        zeile.appendChild(el('td', { class: 'tuername' }, [
          el('span', { class: 'nr', text: t.nummer || '—' }),
          el('span', { class: 'bez', text: t.bezeichnung || '' }),
          (parseInt(t.anzahl, 10) || 1) > 1 ? el('span', { class: 'zart', text: '  (' + t.anzahl + '×)' }) : null
        ]));
        schliessungen.forEach(function (s) {
          var wert = M.getBerechtigung(p, t.id, s.id);
          var zelle = el('td', {
            class: 'zelle' + (wert !== 'nein' ? ' gesetzt-' + wert : ''),
            text: K.berechtigungZeichen(wert),
            title: t.nummer + ' / ' + (s.kuerzel || s.bezeichnung),
            onclick: function () {
              var jetzt = M.getBerechtigung(p, t.id, s.id);
              var naechst = ZELL_FOLGE[(ZELL_FOLGE.indexOf(jetzt) + 1) % ZELL_FOLGE.length];
              M.setBerechtigung(p, t.id, s.id, naechst);
              zelle.textContent = K.berechtigungZeichen(naechst);
              zelle.className = 'zelle' + (naechst !== 'nein' ? ' gesetzt-' + naechst : '');
              A.alsGeaendertMarkieren();
              summenAktualisieren();
            }
          });
          zeile.appendChild(zelle);
        });
        koerper.appendChild(zeile);
      });
    });
    tabelle.appendChild(koerper);

    /* --- Summenzeile --- */
    var summenZellen = [];
    var summenZeile = el('tr', {}, [el('td', { class: 'tuername', text: 'Summe berechtigter Türen' })]);
    schliessungen.forEach(function (s) {
      var td = el('td', { text: '0' });
      summenZellen.push({ knoten: td, schliessung: s });
      summenZeile.appendChild(td);
    });
    tabelle.appendChild(el('tfoot', {}, summenZeile));

    function summenAktualisieren() {
      summenZellen.forEach(function (e) {
        var summe = 0;
        p.tueren.forEach(function (t) {
          var w = M.getBerechtigung(p, t.id, e.schliessung.id);
          if (w !== 'nein' && w !== 'sperr') summe += (parseInt(t.anzahl, 10) || 1);
        });
        e.knoten.textContent = String(summe);
      });
    }
    summenAktualisieren();

    seite.appendChild(el('div', { class: 'matrix-rahmen' }, tabelle));

    var legende = el('div', { class: 'matrix-legende' });
    K.BERECHTIGUNG.forEach(function (b) {
      if (!b.zeichen) return;
      legende.appendChild(el('span', {}, [el('b', { text: b.zeichen }), b.label]));
    });
    legende.appendChild(el('span', { text: 'Spaltenkopf antippen: Schließung bearbeiten' }));
    seite.appendChild(legende);

    /* Schnellaktionen */
    seite.appendChild(el('div', { class: 'knopfleiste', style: { marginTop: '14px' } }, [
      el('button', { class: 'klein', text: 'Alle Türen für eine Schließung freigeben',
        onclick: function () { sammelAktion(schliessungen, 'ja', neuZeichnen); } }),
      el('button', { class: 'klein', text: 'Eine Schließung komplett leeren',
        onclick: function () { sammelAktion(schliessungen, 'nein', neuZeichnen); } })
    ]));
  }

  function sammelAktion(schliessungen, wert, neuZeichnen) {
    var p = Zustand.projekt;
    var auswahl = el('select');
    schliessungen.forEach(function (s) {
      auswahl.appendChild(el('option', { value: s.id, text: (s.kuerzel || '') + ' ' + (s.bezeichnung || '') }));
    });
    A.dialogOeffnen({
      titel: wert === 'ja' ? 'Alle Türen freigeben' : 'Schließung leeren', klein: true,
      inhalt: el('div', { class: 'feld' }, [
        el('label', { text: 'Schließung' }), auswahl,
        el('p', { class: 'hinweis', style: { marginTop: '10px' }, text: wert === 'ja'
          ? 'Die gewählte Schließung erhält an allen ' + p.tueren.length + ' Türen die Berechtigung „X“.'
          : 'Alle Berechtigungen dieser Schließung werden entfernt.' })
      ]),
      knoepfe: [
        { fuellen: true }, { text: 'Abbrechen' },
        { text: 'Ausführen', klasse: 'haupt', aktion: function () {
          p.tueren.forEach(function (t) { M.setBerechtigung(p, t.id, auswahl.value, wert); });
          A.alsGeaendertMarkieren(); neuZeichnen();
          A.toast('Berechtigungen aktualisiert.', 'ok');
        } }
      ]
    });
  }

  /* --- Schließung anlegen / bearbeiten ------------------------------------ */
  function schliessungBearbeiten(vorhandene, neuZeichnen) {
    var p = Zustand.projekt;
    var istNeu = !vorhandene;
    var s = istNeu ? M.neueSchliessung({ sort: p.schliessungen.length })
                   : JSON.parse(JSON.stringify(vorhandene));

    var inhalt = el('div', { class: 'raster' }, [
      A.textFeld(s, 'kuerzel', 'Kürzel', { platzhalter: 'z. B. GHS, HS-A, VW' }),
      A.textFeld(s, 'bezeichnung', 'Bezeichnung', { platzhalter: 'z. B. Generalhauptschlüssel' }),
      A.auswahlFeld(s, 'typ', 'Typ', K.SCHLIESSUNG_TYPEN, { leerText: '– bitte wählen –' }),
      A.textFeld(s, 'anzahlMedien', 'Anzahl Schlüssel / Medien', { typ: 'number', inputmode: 'numeric' }),
      A.textFeld(s, 'person', 'Person'),
      A.textFeld(s, 'abteilung', 'Abteilung / Bereich'),
      A.bereichFeld(s, 'bemerkung', 'Bemerkung', { zeilen: 2 })
    ]);

    var knoepfe = [];
    if (!istNeu) {
      knoepfe.push({ text: 'Löschen', klasse: 'gefahr', aktion: function (schliessen) {
        A.bestaetigen('Schließung löschen?',
          'Die Schließung „' + (s.kuerzel || s.bezeichnung) +
          '“ und alle zugehörigen Berechtigungen werden entfernt.').then(function (ja) {
          if (!ja) return;
          p.schliessungen = p.schliessungen.filter(function (x) { return x.id !== s.id; });
          M.matrixAufraeumen(p);
          A.alsGeaendertMarkieren(); neuZeichnen();
          A.toast('Schließung gelöscht.');
          schliessen();
        });
        return false;
      } });
    }
    knoepfe.push({ fuellen: true });
    knoepfe.push({ text: 'Abbrechen' });
    knoepfe.push({ text: istNeu ? 'Anlegen' : 'Übernehmen', klasse: 'haupt', aktion: function (schliessen) {
      if (!s.kuerzel && !s.bezeichnung) { A.toast('Bitte Kürzel oder Bezeichnung angeben.', 'fehler'); return false; }
      s.anzahlMedien = Math.max(0, parseInt(s.anzahlMedien, 10) || 0);
      if (istNeu) p.schliessungen.push(s);
      else {
        var i = p.schliessungen.findIndex(function (x) { return x.id === s.id; });
        if (i >= 0) p.schliessungen[i] = s;
      }
      A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
      A.toast('Schließung gespeichert.', 'ok');
      schliessen();
      return false;
    } });

    A.dialogOeffnen({
      titel: istNeu ? 'Neue Schließung' : 'Schließung bearbeiten',
      klein: false, inhalt: inhalt, knoepfe: knoepfe
    });
  }

  function schliessungenVerwalten(neuZeichnen) {
    var p = Zustand.projekt;
    var inhalt = el('div');
    function zeichnen() {
      A.leeren(inhalt);
      var sortiert = p.schliessungen.slice().sort(function (a, b) { return a.sort - b.sort; });
      if (!sortiert.length) { inhalt.appendChild(el('p', { class: 'zart', text: 'Keine Schließungen vorhanden.' })); return; }
      var tab = el('table');
      tab.appendChild(el('thead', {}, el('tr', {}, [
        el('th', { text: 'Kürzel' }), el('th', { text: 'Bezeichnung' }), el('th', { text: 'Typ' }),
        el('th', { class: 'zahl', text: 'Medien' }), el('th', { text: 'Reihenfolge' })
      ])));
      var tb = el('tbody');
      sortiert.forEach(function (s, index) {
        var typ = K.SCHLIESSUNG_TYPEN.filter(function (x) { return x.id === s.typ; })[0];
        tb.appendChild(el('tr', { class: 'anklickbar' }, [
          el('td', { onclick: function () { schliessungBearbeiten(s, neuZeichnen); }, text: s.kuerzel || '—' }),
          el('td', { onclick: function () { schliessungBearbeiten(s, neuZeichnen); }, text: s.bezeichnung || '' }),
          el('td', { text: typ ? typ.label : (s.typ || '') }),
          el('td', { class: 'zahl', text: String(s.anzahlMedien || 0) }),
          el('td', {}, el('div', { class: 'knopfleiste' }, [
            el('button', { class: 'klein nur-symbol', text: '↑', disabled: index === 0, onclick: function () {
              sortiert[index].sort = index - 1; sortiert[index - 1].sort = index;
              A.alsGeaendertMarkieren(); zeichnen(); neuZeichnen();
            } }),
            el('button', { class: 'klein nur-symbol', text: '↓', disabled: index === sortiert.length - 1, onclick: function () {
              sortiert[index].sort = index + 1; sortiert[index + 1].sort = index;
              A.alsGeaendertMarkieren(); zeichnen(); neuZeichnen();
            } })
          ]))
        ]));
      });
      tab.appendChild(tb);
      inhalt.appendChild(el('div', { class: 'tabelle-rahmen' }, tab));
    }
    zeichnen();
    A.dialogOeffnen({
      titel: 'Schließungen verwalten', inhalt: inhalt,
      knoepfe: [
        { text: '+ Neue Schließung', aktion: function (schliessen) {
          schliessen(); setTimeout(function () { schliessungBearbeiten(null, neuZeichnen); }, 100); return false;
        } },
        { fuellen: true }, { text: 'Schließen' }
      ]
    });
  }

  /* =========================================================================
   * Export
   * ====================================================================== */
  function ansichtExport(behaelter, neuZeichnen) {
    var p = Zustand.projekt;
    var eins = Zustand.einstellungen || {};
    var seite = el('div', { class: 'seite' });
    behaelter.appendChild(seite);

    seite.appendChild(el('h1', { text: 'Export' }));
    seite.appendChild(el('p', { class: 'hinweis', text: 'PDF-Ausgaben werden direkt auf dem Gerät erzeugt – auch ohne Internetverbindung.' }));

    var s = M.statistik(p);
    seite.appendChild(el('div', { class: 'kennzahlen', style: { marginBottom: '18px' } }, [
      kennzahl(s.tueren, 'Positionen'), kennzahl(s.tuerenGesamtAnzahl, 'Türen'),
      kennzahl(s.schliessungen, 'Schließungen'), kennzahl(s.berechtigungen, 'Berechtigungen'),
      kennzahl(s.fotos, 'Fotos'), kennzahl(s.nacharbeit, 'Nacharbeit')
    ]));

    /* --- Plausibilitätsprüfung --- */
    var probleme = M.pruefeProjekt(p);
    if (probleme.length) {
      var warnungen = probleme.filter(function (x) { return x.schwere === 'warn'; });
      seite.appendChild(el('div', { class: 'meldung ' + (warnungen.length ? 'warn' : 'info') }, [
        el('div', {}, [
          el('b', { text: probleme.length + ' Hinweis(e) zur Vollständigkeit' }),
          el('div', { style: { marginTop: '6px', fontSize: '13px' } },
            probleme.slice(0, 6).map(function (x) { return el('div', { text: '• ' + x.text }); })),
          probleme.length > 6 ? el('div', { class: 'zart', style: { marginTop: '4px' },
            text: '… und ' + (probleme.length - 6) + ' weitere. Vollständige Liste im Prüfprotokoll.' }) : null
        ])
      ]));
    } else {
      seite.appendChild(el('div', { class: 'meldung ok' },
        el('b', { text: 'Das Aufmaß ist vollständig – keine Auffälligkeiten.' })));
    }

    /* --- PDF-Ausgaben --- */
    var detailMitFotos = { wert: true };
    var fotoSchalter = A.schalterFeld(detailMitFotos, 'wert', 'Fotos in das Datenblatt übernehmen');

    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'PDF-Ausgaben' }),
      el('div', { class: 'raster zwei' }, [
        exportKarte('Türliste kompakt',
          'Tabellarisches Aufmaßprotokoll im Querformat, gruppiert nach Standort und Gebäude. Das übliche Arbeitsdokument.',
          function () { pdfErzeugen(function () { return Reports.tuerliste(p, eins, { modus: 'kompakt' }); }, 'Tuerliste'); }),
        exportKarte('Türliste ausführlich',
          'Ein Datenblatt je Tür mit allen erfassten Feldern, Bemerkungen und Fotos.',
          function () { pdfErzeugen(function () {
            return Reports.tuerliste(p, eins, { modus: 'detail', mitFotos: detailMitFotos.wert });
          }, 'Tuerliste-ausfuehrlich'); }, fotoSchalter),
        exportKarte('Kreuzschließplan',
          'Zutrittsmatrix Türen × Schließungen im Querformat, inklusive Legende und Schließungsübersicht.',
          function () { pdfErzeugen(function () { return Reports.schliessplan(p, eins); }, 'Kreuzschliessplan'); }),
        exportKarte('Materialliste',
          'Aggregierte Stückliste je System als Grundlage für Angebot und Bestellung.',
          function () { pdfErzeugen(function () { return Reports.materialliste(p, eins); }, 'Materialliste'); }),
        exportKarte('Prüfprotokoll',
          'Alle Vollständigkeitshinweise als Abarbeitungsliste für das Büro.',
          function () { pdfErzeugen(function () { return Reports.pruefprotokoll(p, eins); }, 'Pruefprotokoll'); })
      ])
    ]));

    /* --- Datenaustausch --- */
    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Projektdatei (iPad ↔ Büro)' }),
      el('p', { class: 'hinweis', text: 'Exportieren Sie das Projekt als Datei und öffnen Sie es am anderen Gerät über „Projekte → Projekt importieren“. Ohne Fotos wird die Datei deutlich kleiner.' }),
      el('div', { class: 'knopfleiste' }, [
        el('button', { class: 'haupt', text: 'Projekt exportieren (mit Fotos)', onclick: function () {
          jsonExport(true);
        } }),
        el('button', { text: 'Projekt exportieren (ohne Fotos)', onclick: function () { jsonExport(false); } }),
        el('button', { text: 'Alle Projekte sichern', onclick: function () { sicherungExport(); } })
      ]),
      el('p', { class: 'zart', style: { marginTop: '10px' },
        text: 'Aktuelle Projektgröße: ' + global.ViewsProjekt.kb(Store.projektGroesse(p)) })
    ]));

    function jsonExport(mitFotos) {
      try {
        var daten = Store.exportDaten(p, eins, mitFotos);
        Store.dateiHerunterladen(JSON.stringify(daten, null, 1), Store.exportDateiname(p), 'application/json');
        A.toast('Projektdatei erzeugt.', 'ok');
      } catch (e) { A.toast('Export fehlgeschlagen: ' + e.message, 'fehler'); }
    }

    function sicherungExport() {
      Store.alleProjekte().then(function (alle) {
        var daten = {
          typ: 'schliessanlagen-aufmass-sicherung', version: 1,
          exportiert: new Date().toISOString(), projekte: alle
        };
        Store.dateiHerunterladen(JSON.stringify(daten), 'Aufmass-Sicherung_' + M.heute() + '.json', 'application/json');
        A.toast(alle.length + ' Projekte gesichert.', 'ok');
      });
    }
  }

  function kennzahl(wert, bezeichnung) {
    return el('div', { class: 'kennzahl' }, [
      el('div', { class: 'wert', text: String(wert) }),
      el('div', { class: 'bez', text: bezeichnung })
    ]);
  }

  function exportKarte(titel, beschreibung, aktion, zusatz) {
    return el('div', { class: 'karte schmal', style: { margin: '0' } }, [
      el('h3', { text: titel, style: { marginTop: '0' } }),
      el('p', { class: 'hinweis', text: beschreibung }),
      zusatz || null,
      el('button', { class: 'haupt', text: 'PDF erzeugen', style: { marginTop: '8px' }, onclick: aktion })
    ]);
  }

  function pdfErzeugen(bauen, suffix) {
    A.toast('PDF wird erzeugt …');
    /* Kurz warten, damit die Meldung erscheint, bevor der Aufbau blockiert */
    setTimeout(function () {
      try {
        var doc = bauen();
        var name = Reports.dateiName(Zustand.projekt, suffix);
        doc.speichern(name);
        A.toast(doc.seitenAnzahl() + ' Seiten erzeugt: ' + name, 'ok');
      } catch (fehler) {
        console.error(fehler);
        A.toast('PDF-Erzeugung fehlgeschlagen: ' + fehler.message, 'fehler');
      }
    }, 60);
  }

  /* =========================================================================
   * Einstellungen
   * ====================================================================== */
  function ansichtEinstellungen(behaelter, neuZeichnen) {
    var e = Zustand.einstellungen;
    var seite = el('div', { class: 'seite' });
    behaelter.appendChild(seite);

    seite.appendChild(el('h1', { text: 'Einstellungen' }));
    seite.appendChild(el('p', { class: 'hinweis', text: 'Diese Angaben gelten geräteweit für alle Projekte.' }));

    function merken() {
      Store.einstellungenSpeichern(e);
      A.statusAnzeigen('gesichert');
    }
    function textE(schluessel, beschriftung, platzhalter) {
      var eingabe = el('input', {
        type: 'text', value: e[schluessel] || '', placeholder: platzhalter || '',
        oninput: function (ev) { e[schluessel] = ev.target.value; merken(); }
      });
      return A.feld(beschriftung, eingabe);
    }

    /* --- Firmenkopf --- */
    var logoVorschau = el('div');
    function logoZeichnen() {
      A.leeren(logoVorschau);
      if (e.logoDataUrl) {
        logoVorschau.appendChild(el('img', {
          src: e.logoDataUrl, alt: 'Firmenlogo',
          style: { maxHeight: '70px', maxWidth: '220px', border: '1px solid var(--rand)',
                   borderRadius: '6px', padding: '6px', background: '#fff' }
        }));
        logoVorschau.appendChild(el('div', { class: 'knopfleiste', style: { marginTop: '8px' } },
          el('button', { class: 'klein gefahr', text: 'Logo entfernen', onclick: function () {
            e.logoDataUrl = ''; merken(); logoZeichnen();
          } })));
      } else {
        logoVorschau.appendChild(el('p', { class: 'zart', text: 'Kein Logo hinterlegt.' }));
      }
    }
    var logoEingabe = el('input', {
      type: 'file', accept: 'image/*', class: 'versteckt',
      onchange: function (ev) {
        var datei = ev.target.files && ev.target.files[0];
        if (!datei) return;
        Store.fotoVerarbeiten(datei, 600, 0.88).then(function (bild) {
          e.logoDataUrl = bild.dataUrl; merken(); logoZeichnen();
          A.toast('Logo übernommen.', 'ok');
        }).catch(function (f) { A.toast(f.message, 'fehler'); });
        ev.target.value = '';
      }
    });
    logoZeichnen();

    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Firmenkopf für die PDF-Ausgaben' }),
      el('div', { class: 'raster' }, [
        textE('firma', 'Firmenname', 'Provision Infra GmbH'),
        textE('firmaZusatz', 'Zusatz', 'Schließsysteme & Zutrittslösungen'),
        textE('firmaTelefon', 'Telefon'),
        textE('firmaEmail', 'E-Mail'),
        textE('standardBearbeiter', 'Standard-Bearbeiter', 'Name für neue Projekte')
      ]),
      el('hr', { class: 'trenner' }),
      el('h3', { text: 'Logo', style: { marginTop: '0' } }),
      el('div', { class: 'knopfleiste', style: { marginBottom: '10px' } }, [
        el('button', { text: 'Logo hochladen', onclick: function () { logoEingabe.click(); } }), logoEingabe
      ]),
      logoVorschau
    ]));

    /* --- Fotoqualität --- */
    var qualitaetAnzeige = el('span', { class: 'zart' });
    function qualitaetText() {
      qualitaetAnzeige.textContent = 'Längste Kante ' + e.fotoMaxKante + ' px, Qualität ' +
        Math.round(e.fotoQualitaet * 100) + ' %';
    }
    qualitaetText();
    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Fotos' }),
      el('p', { class: 'hinweis', text: 'Fotos werden beim Aufnehmen verkleinert, damit auch umfangreiche Aufmaße auf dem iPad Platz finden.' }),
      el('div', { class: 'raster' }, [
        A.feld('Maximale Kantenlänge', el('select', {
          onchange: function (ev) { e.fotoMaxKante = parseInt(ev.target.value, 10); merken(); qualitaetText(); }
        }, [800, 1024, 1280, 1600, 2048].map(function (v) {
          return el('option', { value: v, text: v + ' px', selected: e.fotoMaxKante === v });
        }))),
        A.feld('Bildqualität', el('select', {
          onchange: function (ev) { e.fotoQualitaet = parseFloat(ev.target.value); merken(); qualitaetText(); }
        }, [[0.6, 'sparsam'], [0.72, 'normal'], [0.85, 'hoch']].map(function (v) {
          return el('option', { value: v[0], text: v[1], selected: Math.abs(e.fotoQualitaet - v[0]) < 0.01 });
        })))
      ]),
      el('p', { style: { marginTop: '8px' } }, qualitaetAnzeige)
    ]));

    /* --- Eigene Katalogeinträge --- */
    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Eigene Katalogeinträge' }),
      el('p', { class: 'hinweis', text: 'Ergänzen Sie hier Einträge, die in den mitgelieferten Listen fehlen. Sie erscheinen zusätzlich in den Auswahlfeldern.' }),
      listenPflege('eigeneZylinderarten', 'Zylinderarten', e, merken),
      listenPflege('eigeneZutrittsarten', 'Zutritts-/Funktionsarten', e, merken),
      listenPflege('eigeneBeschlagarten', 'Beschlagsarten', e, merken),
      listenPflege('eigeneSchlossarten', 'Schlossarten', e, merken)
    ]));

    /* --- Über --- */
    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Über dieses Werkzeug' }),
      el('p', { class: 'hinweis', text:
        'Aufmaß-Tool für Schließanlagen und Zutrittslösungen. Läuft vollständig im Browser; ' +
        'alle Daten verbleiben auf diesem Gerät und werden nirgendwohin übertragen. ' +
        'Die PDF-Erzeugung erfolgt lokal und benötigt keine Internetverbindung.' }),
      el('p', { class: 'zart', text: 'Speicherart: ' +
        (Store.nutztFallback() ? 'Browserspeicher (eingeschränkt)' : 'IndexedDB') }),
      el('div', { class: 'knopfleiste', style: { marginTop: '10px' } }, [
        el('button', { class: 'gefahr', text: 'Einstellungen zurücksetzen', onclick: function () {
          A.bestaetigen('Einstellungen zurücksetzen?',
            'Firmenkopf, Logo und eigene Katalogeinträge werden entfernt. Projekte bleiben erhalten.',
            'Zurücksetzen').then(function (ja) {
            if (!ja) return;
            Zustand.einstellungen = Object.assign({}, Store.EINSTELLUNGEN_STANDARD);
            Store.einstellungenSpeichern(Zustand.einstellungen).then(function () {
              A.toast('Einstellungen zurückgesetzt.'); neuZeichnen();
            });
          });
        } })
      ])
    ]));
  }

  function listenPflege(schluessel, beschriftung, einstellungen, merken) {
    if (!Array.isArray(einstellungen[schluessel])) einstellungen[schluessel] = [];
    var liste = el('div', { class: 'chips', style: { marginBottom: '10px' } });
    function zeichnen() {
      A.leeren(liste);
      einstellungen[schluessel].forEach(function (wert, i) {
        liste.appendChild(el('span', { class: 'chip' }, [
          el('span', { text: wert }),
          el('button', { class: 'nur-symbol klein', text: '✕', title: 'Entfernen',
            style: { minHeight: '24px', padding: '0 5px', border: '0', background: 'transparent' },
            onclick: function () { einstellungen[schluessel].splice(i, 1); merken(); zeichnen(); } })
        ]));
      });
      if (!einstellungen[schluessel].length) {
        liste.appendChild(el('span', { class: 'zart', text: 'Keine eigenen Einträge.' }));
      }
    }
    zeichnen();
    var eingabe = el('input', { type: 'text', placeholder: 'Neuer Eintrag …' });
    function hinzufuegen() {
      var wert = eingabe.value.trim();
      if (!wert) return;
      if (einstellungen[schluessel].indexOf(wert) === -1) einstellungen[schluessel].push(wert);
      eingabe.value = ''; merken(); zeichnen();
    }
    eingabe.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); hinzufuegen(); }
    });
    return el('div', { style: { marginBottom: '16px' } }, [
      el('h3', { text: beschriftung }), liste,
      el('div', { class: 'zeile-verteilt' }, [
        el('div', { class: 'fuellen' }, eingabe),
        el('button', { text: 'Hinzufügen', onclick: hinzufuegen })
      ])
    ]);
  }

  global.ViewsPlan = {
    ansichtPlan: ansichtPlan,
    ansichtExport: ansichtExport,
    ansichtEinstellungen: ansichtEinstellungen,
    schliessungBearbeiten: schliessungBearbeiten
  };
})(typeof window !== 'undefined' ? window : globalThis);
