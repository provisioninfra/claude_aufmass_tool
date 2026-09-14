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
      el('button', { class: 'haupt', text: 'Blanko-Plan erzeugen',
        onclick: function () { blankoDialog(neuZeichnen); } }),
      el('button', { text: '+ Schließung',
        onclick: function () { schliessungBearbeiten(null, neuZeichnen); } }),
      el('button', { text: 'Verwalten',
        onclick: function () { schliessungenVerwalten(neuZeichnen); } }),
      el('button', { text: '→ Kundenfreigabe',
        title: 'Matrix zur Bearbeitung an den Kunden senden',
        onclick: function () { freigabeDialog(neuZeichnen); } }),
      el('button', { text: '← Rückmeldung',
        title: 'Rückmeldung des Kunden einlesen',
        onclick: function () { antwortDialog(neuZeichnen); } })
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
        el('p', { text: 'Aus Ihrer Gliederung lässt sich ein vollständiger Plan als Arbeitsgrundlage erzeugen: Generalhauptschlüssel, Hauptschlüssel je Gebäude und Gruppenschlüssel je Bereich – mit bereits gesetzten Berechtigungen.' }),
        el('div', { class: 'knopfleiste', style: { justifyContent: 'center' } }, [
          el('button', { class: 'haupt', text: 'Blanko-Plan aus der Struktur erzeugen',
            onclick: function () { blankoDialog(neuZeichnen); } }),
          el('button', { text: '+ Einzelne Schließung anlegen',
            onclick: function () { schliessungBearbeiten(null, neuZeichnen); } })
        ])
      ]));
      return;
    }

    var schliessungen = p.schliessungen.slice().sort(function (a, b) {
      return (a.sort - b.sort) || String(a.kuerzel).localeCompare(String(b.kuerzel), 'de', { numeric: true });
    });

    /* Entfernen ist ein eigener Modus: Auf dem Tablett soll niemand beim
     * Setzen von Berechtigungen versehentlich eine Zeile löschen. */
    var entfernenAn = { wert: false };
    var werkzeuge = el('div', { class: 'werkzeuge', style: { marginBottom: '12px' } }, [
      A.schalterFeld(entfernenAn, 'wert', 'Türen und Schließungen entfernen', function () {
        neuZeichnen();
      }),
      el('span', { class: 'zart', text: entfernenAn.wert
        ? 'Zum Beenden den Schalter wieder ausschalten.'
        : 'Einschalten, um einzelne Zeilen oder Spalten aus dem Plan zu nehmen.' })
    ]);
    /* Der Modus überlebt das Neuzeichnen */
    if (Zustand.planEntfernen) { entfernenAn.wert = true; }
    werkzeuge.querySelector('input').checked = entfernenAn.wert;
    werkzeuge.querySelector('input').addEventListener('change', function (e) {
      Zustand.planEntfernen = e.target.checked;
    });
    seite.appendChild(werkzeuge);

    function tuerEntfernen(t) {
      A.bestaetigen('Tür aus dem Projekt entfernen?',
        'Die Tür „' + (t.nummer || t.bezeichnung) + '“ wird mit allen Angaben, Fotos und ' +
        'Berechtigungen gelöscht. Das lässt sich über den Zurück-Knopf rückgängig machen.')
        .then(function (ja) {
          if (!ja) return;
          A.schrittMerken('Tür ' + (t.nummer || t.bezeichnung) + ' entfernt');
          p.tueren = p.tueren.filter(function (x) { return x.id !== t.id; });
          M.matrixAufraeumen(p);
          A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
          A.toast('Tür entfernt.');
        });
    }

    function schliessungEntfernen(sch) {
      A.bestaetigen('Schließung entfernen?',
        'Die Schließung „' + (sch.kuerzel || sch.bezeichnung) + '“ und alle zugehörigen ' +
        'Berechtigungen werden gelöscht. Das lässt sich über den Zurück-Knopf rückgängig machen.')
        .then(function (ja) {
          if (!ja) return;
          A.schrittMerken('Schließung ' + (sch.kuerzel || sch.bezeichnung) + ' entfernt');
          p.schliessungen = p.schliessungen.filter(function (x) { return x.id !== sch.id; });
          M.matrixAufraeumen(p);
          A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
          A.toast('Schließung entfernt.');
        });
    }

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
        class: 'spaltenkopf' + (entfernenAn.wert ? ' entfernbar' : ''),
        title: entfernenAn.wert ? ('Schließung „' + titel + '“ entfernen')
                                : (titel + (s.person ? ' – ' + s.person : '')),
        onclick: function () {
          if (entfernenAn.wert) schliessungEntfernen(s);
          else schliessungBearbeiten(s, neuZeichnen);
        },
        style: { cursor: 'pointer' }
      }, [
        el('span', { class: 'dreh', text: titel || '–' }),
        entfernenAn.wert
          ? el('span', { class: 'entfernen-zeichen', text: '✕' })
          : el('span', { class: 'medien', text: (parseInt(s.anzahlMedien, 10) || 0) + '×' })
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
        zeile.appendChild(el('td', { class: 'tuername' + (entfernenAn.wert ? ' entfernbar' : '') }, [
          entfernenAn.wert
            ? el('button', {
                class: 'entfernen-knopf', text: '✕',
                title: 'Tür „' + (t.nummer || t.bezeichnung) + '“ entfernen',
                onclick: function (e) { e.stopPropagation(); tuerEntfernen(t); }
              })
            : null,
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
              if (entfernenAn.wert) return;   /* im Entfernen-Modus nicht schalten */
              A.schrittMerken('Berechtigung: ' + (t.nummer || t.bezeichnung) +
                              ' / ' + (s.kuerzel || s.bezeichnung));
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
          A.schrittMerken(wert === 'ja' ? 'Alle Türen freigegeben' : 'Schließung geleert');
          p.tueren.forEach(function (t) { M.setBerechtigung(p, t.id, auswahl.value, wert); });
          A.alsGeaendertMarkieren(); neuZeichnen();
          A.toast('Berechtigungen aktualisiert.', 'ok');
        } }
      ]
    });
  }

  /* =========================================================================
   * Kunden-Freigabe der Matrix
   * ======================================================================
   * Der Kunde erhält einen Link und trägt in den freigegebenen Feldern seine
   * Berechtigungen ein. Es gibt keinen Server: Die Plandaten stehen im Anker
   * der Adresse und werden von Browsern nie an einen Server gesendet.
   * -------------------------------------------------------------------- */
  function freigabeDialog(neuZeichnen) {
    var p = Zustand.projekt;
    var eins = Zustand.einstellungen || {};
    var gewaehlt = {};
    p.schliessungen.forEach(function (s) { gewaehlt[s.id] = false; });
    var einstellungenFreigabe = { nurLeereFelder: false, hinweis: '', frist: '' };

    var auswahlBereich = el('div', { class: 'chips', style: { marginBottom: '10px' } });
    var vorschau = el('div', { class: 'meldung info' });
    var ergebnisBereich = el('div');

    function anzahlGewaehlt() {
      return Object.keys(gewaehlt).filter(function (k) { return gewaehlt[k]; }).length;
    }

    function vorschauAktualisieren() {
      A.leeren(vorschau);
      var spalten = anzahlGewaehlt();
      var felder = spalten * p.tueren.length;
      if (!spalten) {
        vorschau.className = 'meldung warn';
        vorschau.appendChild(el('div', { text: 'Bitte mindestens eine Schließung freigeben.' }));
        return;
      }
      vorschau.className = 'meldung info';
      vorschau.appendChild(el('div', {}, [
        el('b', { text: spalten + (spalten === 1 ? ' Schließung' : ' Schließungen') +
                        ' mit ' + felder + ' Feldern werden freigegeben.' }),
        el('div', { style: { marginTop: '4px', fontSize: '13px' },
          text: 'Alle übrigen Felder sieht der Kunde, kann sie aber nicht ändern.' })
      ]));
    }

    function auswahlZeichnen() {
      A.leeren(auswahlBereich);
      p.schliessungen.slice().sort(function (a, b) { return a.sort - b.sort; }).forEach(function (s) {
        var titel = (s.kuerzel ? s.kuerzel + ' ' : '') + (s.bezeichnung || '');
        var chip = el('button', {
          type: 'button', class: 'chip',
          'aria-pressed': gewaehlt[s.id] ? 'true' : 'false', text: titel || '–',
          onclick: function () {
            gewaehlt[s.id] = !gewaehlt[s.id];
            chip.setAttribute('aria-pressed', gewaehlt[s.id] ? 'true' : 'false');
            vorschauAktualisieren();
          }
        });
        auswahlBereich.appendChild(chip);
      });
    }
    auswahlZeichnen();
    vorschauAktualisieren();

    function linkErzeugen() {
      var ids = Object.keys(gewaehlt).filter(function (k) { return gewaehlt[k]; });
      var daten = global.Freigabe.erstellen(p, {
        freigegebeneSchliessungen: ids,
        nurLeereFelder: einstellungenFreigabe.nurLeereFelder,
        hinweis: einstellungenFreigabe.hinweis,
        frist: einstellungenFreigabe.frist,
        firma: eins.firma || ''
      });
      var anker = global.Freigabe.alsAnker(daten);

      /* Adresse der Freigabeseite neben der Anwendung */
      var basis = location.href.replace(/[^\/]*(\?.*)?(#.*)?$/, '') + 'freigabe.html';
      var link = basis + '#plan=' + anker;
      var lokal = location.protocol === 'file:';

      A.leeren(ergebnisBereich);
      var feld = el('textarea', { class: 'schluessel-feld', readonly: true,
        style: { minHeight: '110px', fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                 fontSize: '12px', wordBreak: 'break-all' } });
      feld.value = link;

      ergebnisBereich.appendChild(el('hr', { class: 'trenner' }));
      ergebnisBereich.appendChild(el('h3', { text: 'Freigabe-Link', style: { marginTop: '0' } }));

      if (lokal) {
        ergebnisBereich.appendChild(el('div', { class: 'meldung warn' }, el('div', {}, [
          el('b', { text: 'Diese Anwendung läuft als lokale Datei. ' }),
          'Der Link funktioniert nur, wenn der Kunde dieselbe Datei auf seinem Gerät hat. ' +
          'Für den Versand an Kunden die Anwendung über eine Web-Adresse aufrufen.'
        ])));
      }
      ergebnisBereich.appendChild(el('p', { class: 'hinweis',
        text: 'Diesen Link vollständig in eine E-Mail einfügen. Die Plandaten stehen hinter dem ' +
              'Rautezeichen und werden dabei an keinen Server übertragen. Länge: ' +
              link.length.toLocaleString('de-DE') + ' Zeichen.' }));
      if (link.length > 20000) {
        ergebnisBereich.appendChild(el('div', { class: 'meldung warn' }, el('div', {}, [
          el('b', { text: 'Der Link ist sehr lang. ' }),
          'Manche E-Mail-Programme brechen lange Links um. Geben Sie im Zweifel weniger ' +
          'Schließungen frei oder senden Sie die Datei unten.'
        ])));
      }
      ergebnisBereich.appendChild(feld);
      ergebnisBereich.appendChild(el('div', { class: 'knopfleiste', style: { marginTop: '10px' } }, [
        el('button', { class: 'haupt', text: 'Link kopieren', onclick: function (e) {
          feld.select();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(function () {
              e.target.textContent = 'Kopiert ✓';
            }).catch(function () { e.target.textContent = 'Bitte von Hand markieren'; });
          } else {
            try { document.execCommand('copy'); e.target.textContent = 'Kopiert ✓'; }
            catch (err) { e.target.textContent = 'Bitte von Hand markieren'; }
          }
        } }),
        el('button', { text: 'Als Datei speichern', onclick: function () {
          var name = 'Freigabe_' + (p.objekt || p.kunde || 'Matrix')
            .replace(/[^\wäöüÄÖÜß \-]/g, '').trim().replace(/\s+/g, '-') + '.txt';
          Store.dateiHerunterladen(link, name, 'text/plain').catch(function (f) {
            A.toast(f.message, 'fehler');
          });
        } })
      ]));
    }

    var inhalt = el('div', {}, [
      el('p', { class: 'hinweis', style: { marginTop: '0' },
        text: 'Der Kunde öffnet den Link im Browser und trägt in den freigegebenen Feldern ' +
              'seine Berechtigungen ein. Seine Rückmeldung lesen Sie anschließend hier wieder ein.' }),
      el('h3', { text: 'Welche Schließungen darf der Kunde bearbeiten?' }),
      auswahlBereich,
      el('div', { class: 'knopfleiste', style: { marginBottom: '12px' } }, [
        el('button', { class: 'klein', text: 'Alle auswählen', onclick: function () {
          p.schliessungen.forEach(function (s) { gewaehlt[s.id] = true; });
          auswahlZeichnen(); vorschauAktualisieren();
        } }),
        el('button', { class: 'klein', text: 'Auswahl aufheben', onclick: function () {
          p.schliessungen.forEach(function (s) { gewaehlt[s.id] = false; });
          auswahlZeichnen(); vorschauAktualisieren();
        } })
      ]),
      A.schalterFeld(einstellungenFreigabe, 'nurLeereFelder',
        'Nur noch leere Felder freigeben', function () { vorschauAktualisieren(); }),
      el('p', { class: 'zart', style: { marginLeft: '64px', marginTop: '-6px' },
        text: 'Bereits gesetzte Berechtigungen kann der Kunde dann nicht mehr ändern.' }),
      el('div', { class: 'raster', style: { marginTop: '12px' } }, [
        A.textFeld(einstellungenFreigabe, 'hinweis', 'Hinweis für den Kunden',
          { platzhalter: 'z. B. Bitte nur die Reinigungszeiten eintragen' }),
        A.textFeld(einstellungenFreigabe, 'frist', 'Rückmeldung erbeten bis',
          { platzhalter: 'z. B. 30.09.2026' })
      ]),
      vorschau,
      el('div', { class: 'knopfleiste' }, [
        el('button', { class: 'haupt', text: 'Freigabe-Link erzeugen', onclick: function () {
          if (!anzahlGewaehlt()) { A.toast('Bitte mindestens eine Schließung freigeben.', 'fehler'); return; }
          linkErzeugen();
        } })
      ]),
      ergebnisBereich
    ]);

    A.dialogOeffnen({
      titel: 'Matrix zur Freigabe an den Kunden senden', inhalt: inhalt,
      knoepfe: [{ fuellen: true }, { text: 'Schließen' }]
    });
  }

  /* --- Rückmeldung des Kunden einlesen ------------------------------------ */
  function antwortDialog(neuZeichnen) {
    var p = Zustand.projekt;
    var feld = el('textarea', { class: 'schluessel-feld', rows: 6,
      placeholder: 'Rückschlüssel des Kunden hier einfügen …',
      style: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '12px' } });
    var bericht = el('div');

    var dateiEingabe = el('input', {
      type: 'file', accept: '.txt,text/plain',
      onchange: function (e) {
        var datei = e.target.files && e.target.files[0];
        if (!datei) return;
        var leser = new FileReader();
        leser.onload = function () { feld.value = String(leser.result).trim(); pruefen(); };
        leser.onerror = function () { A.toast('Die Datei konnte nicht gelesen werden.', 'fehler'); };
        leser.readAsText(datei);
        e.target.value = '';
      }
    });

    var gelesen = null;
    function pruefen() {
      A.leeren(bericht);
      gelesen = null;
      var text = feld.value.trim();
      if (!text) return;
      try { gelesen = global.Freigabe.antwortAusSchluessel(text); }
      catch (fehler) {
        bericht.appendChild(el('div', { class: 'meldung fehler' }, el('div', { text: fehler.message })));
        return;
      }
      var fremd = gelesen.pid !== p.id;
      var anzahl = (gelesen.a ? gelesen.a.split(',').filter(Boolean).length : 0);
      bericht.appendChild(el('div', { class: 'meldung ' + (fremd ? 'warn' : 'ok') }, el('div', {}, [
        el('b', { text: anzahl + (anzahl === 1 ? ' Änderung' : ' Änderungen') + ' in der Rückmeldung' }),
        el('div', { style: { marginTop: '4px', fontSize: '13px' },
          text: fremd ? 'Achtung: Die Rückmeldung gehört zu einem anderen Projekt. Ein Übernehmen '
                      + 'ist nicht möglich.'
                      : 'Matrixgröße zum Zeitpunkt der Freigabe: ' + (gelesen.anzahl || '–') })
      ])));
    }
    feld.addEventListener('input', pruefen);

    A.dialogOeffnen({
      titel: 'Rückmeldung des Kunden einlesen',
      inhalt: el('div', {}, [
        el('p', { class: 'hinweis', style: { marginTop: '0' },
          text: 'Die Rückmeldung kam als Datei oder als Text in einer E-Mail. Beides wird hier eingelesen. ' +
                'Übernommen werden ausschließlich Felder, die Sie zuvor freigegeben haben.' }),
        el('div', { class: 'knopfleiste', style: { marginBottom: '12px' } }, [
          el('button', { text: 'Datei auswählen', onclick: function () { dateiEingabe.click(); } }),
          dateiEingabe
        ]),
        feld, bericht
      ]),
      knoepfe: [
        { fuellen: true },
        { text: 'Abbrechen' },
        { text: 'Änderungen übernehmen', klasse: 'haupt', aktion: function (schliessen) {
          if (!gelesen) { A.toast('Bitte zuerst eine gültige Rückmeldung einfügen.', 'fehler'); return false; }
          var ergebnis;
          A.schrittMerken('Kundenrückmeldung übernommen');
          try { ergebnis = global.Freigabe.antwortUebernehmen(p, gelesen); }
          catch (fehler) { A.toast(fehler.message, 'fehler'); return false; }
          A.alsGeaendertMarkieren(); A.speichern();
          A.toast(ergebnis.uebernommen + ' Berechtigung(en) übernommen' +
                  (ergebnis.uebersprungen ? (', ' + ergebnis.uebersprungen + ' übersprungen') : '') + '.',
                  'ok');
          schliessen(); neuZeichnen();
          return false;
        } }
      ]
    });
  }

  /* --- Blanko-Plan aus der Gebäudestruktur -------------------------------- */
  function blankoDialog(neuZeichnen) {
    var p = Zustand.projekt;
    var optionen = { ghs: true, proGebaeude: true, proBereich: true, proTuer: false,
                     vorhandeneErsetzen: p.schliessungen.length === 0 };
    var vorschau = el('div', { class: 'meldung info', style: { marginTop: '4px' } });

    function vorschauAktualisieren() {
      A.leeren(vorschau);
      var anzahl = M.blankoVorschau(p, optionen);
      vorschau.appendChild(el('div', {}, [
        el('b', { text: anzahl + (anzahl === 1 ? ' Schließung' : ' Schließungen') + ' werden angelegt' }),
        el('div', { style: { marginTop: '4px', fontSize: '13px' },
          text: optionen.vorhandeneErsetzen
            ? 'Die vorhandenen ' + p.schliessungen.length + ' Schließungen werden dabei ersetzt.'
            : 'Die vorhandenen Schließungen bleiben erhalten, die neuen kommen hinzu.' })
      ]));
    }

    function schalter(schluessel, beschriftung, zusatz) {
      return el('div', { style: { marginBottom: '4px' } }, [
        A.schalterFeld(optionen, schluessel, beschriftung, function () { vorschauAktualisieren(); }),
        zusatz ? el('div', { class: 'zart', style: { marginLeft: '55px', marginTop: '-6px' }, text: zusatz }) : null
      ]);
    }

    var inhalt = el('div', {}, [
      el('p', { class: 'hinweis', style: { marginTop: '0' },
        text: 'Erzeugt aus Standorten, Gebäuden und Bereichen einen vollständigen Plan als Arbeitsgrundlage. Die Berechtigungen werden gleich mitgesetzt und lassen sich danach frei anpassen.' }),
      schalter('ghs', 'Generalhauptschlüssel', 'Eine Schließung, die überall berechtigt ist.'),
      schalter('proGebaeude', 'Hauptschlüssel je Gebäude', 'Berechtigt für alle Türen des jeweiligen Gebäudes.'),
      schalter('proBereich', 'Gruppenschlüssel je Bereich / Etage', 'Berechtigt für alle Türen des Bereichs.'),
      schalter('proTuer', 'Einzelschließung je Tür', 'Für jede Tür eine eigene Schließung – bei großen Objekten viele Spalten.'),
      el('hr', { class: 'trenner' }),
      schalter('vorhandeneErsetzen', 'Vorhandene Schließungen ersetzen',
        'Ohne diesen Schalter werden die neuen Schließungen ergänzt.'),
      vorschau
    ]);
    vorschauAktualisieren();

    A.dialogOeffnen({
      titel: 'Blanko-Plan erzeugen', inhalt: inhalt,
      knoepfe: [
        { fuellen: true },
        { text: 'Abbrechen' },
        { text: 'Plan erzeugen', klasse: 'haupt', aktion: function (schliessen) {
          var anzahl = M.blankoVorschau(p, optionen);
          if (!anzahl) { A.toast('Mit dieser Auswahl entsteht keine Schließung.', 'fehler'); return false; }
          function ausfuehren() {
            A.schrittMerken('Blanko-Plan erzeugt');
            var ergebnis = M.blankoSchliessplan(p, optionen);
            A.alsGeaendertMarkieren(); A.speichern();
            A.toast(ergebnis.angelegt + ' Schließungen und ' + ergebnis.berechtigungen +
                    ' Berechtigungen angelegt.', 'ok');
            schliessen(); neuZeichnen();
          }
          if (optionen.vorhandeneErsetzen && p.schliessungen.length) {
            A.bestaetigen('Vorhandene Schließungen ersetzen?',
              'Die bestehenden ' + p.schliessungen.length + ' Schließungen und alle gesetzten ' +
              'Berechtigungen werden gelöscht und durch den neuen Plan ersetzt.',
              'Ersetzen').then(function (ja) { if (ja) ausfuehren(); });
          } else { ausfuehren(); }
          return false;
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
          A.schrittMerken('Schließung ' + (s.kuerzel || s.bezeichnung) + ' gelöscht');
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
      A.schrittMerken(istNeu ? ('Schließung ' + (s.kuerzel || s.bezeichnung) + ' angelegt')
                             : ('Schließung ' + (s.kuerzel || s.bezeichnung) + ' geändert'));
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
              A.schrittMerken('Reihenfolge der Schließungen geändert');
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
      var daten, text;
      try {
        daten = Store.exportDaten(p, eins, mitFotos);
        text = JSON.stringify(daten, null, 1);
      } catch (e) { A.toast('Export fehlgeschlagen: ' + e.message, 'fehler'); return; }
      Store.dateiHerunterladen(text, Store.exportDateiname(p), 'application/json').then(function (stand) {
        if (stand === 'abgelehnt') { A.toast('Speichern abgebrochen.'); return; }
        A.toast('Projektdatei erzeugt (' + global.ViewsProjekt.kb(text.length) + ').', 'ok');
      }).catch(function (fehler) { A.toast(fehler.message, 'fehler'); });
    }

    function sicherungExport() {
      Store.alleProjekte().then(function (alle) {
        var daten = {
          typ: 'schliessanlagen-aufmass-sicherung', version: 1,
          exportiert: new Date().toISOString(), projekte: alle
        };
        Store.dateiHerunterladen(JSON.stringify(daten), 'Aufmass-Sicherung_' + M.heute() + '.json',
          'application/json').then(function (stand) {
          if (stand === 'abgelehnt') { A.toast('Speichern abgebrochen.'); return; }
          A.toast(alle.length + ' Projekte gesichert.', 'ok');
        }).catch(function (fehler) { A.toast(fehler.message, 'fehler'); });
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
      var doc, name;
      try {
        doc = bauen();
        name = Reports.dateiName(Zustand.projekt, suffix);
      } catch (fehler) {
        console.error(fehler);
        A.toast('PDF-Erzeugung fehlgeschlagen: ' + fehler.message, 'fehler');
        return;
      }
      Store.dateiHerunterladen(doc.blob(), name, 'application/pdf').then(function (stand) {
        if (stand === 'abgelehnt') { A.toast('Speichern abgebrochen.'); return; }
        A.toast(doc.seitenAnzahl() + ' Seiten erzeugt: ' + name, 'ok');
      }).catch(function (fehler) {
        A.toast(fehler.message || 'Speichern fehlgeschlagen.', 'fehler');
      });
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

    /* --- Pipedrive ------------------------------------------------------- */
    var pdBereich = el('div', { class: 'karte' });
    seite.appendChild(pdBereich);
    pdZeichnen();

    function pdZeichnen(pruefErgebnis) {
      A.leeren(pdBereich);
      pdBereich.appendChild(el('h2', { text: 'Pipedrive' }));
      pdBereich.appendChild(el('p', { class: 'hinweis',
        text: 'Mit einer Verbindung zu Pipedrive lässt sich ein Aufmaß direkt aus einem Deal anlegen. ' +
              'Das Werkzeug liest dabei ausschließlich – es verändert in Pipedrive nichts.' }));

      var tokenFeld = el('input', {
        type: 'password', value: e.pipedriveToken || '',
        placeholder: 'Zugriffsschlüssel aus Pipedrive',
        autocomplete: 'off', spellcheck: 'false',
        oninput: function (ev) { e.pipedriveToken = ev.target.value.trim(); merken(); }
      });
      var zeigen = el('button', { class: 'klein', text: 'Anzeigen', onclick: function (ev) {
        var versteckt = tokenFeld.type === 'password';
        tokenFeld.type = versteckt ? 'text' : 'password';
        ev.target.textContent = versteckt ? 'Verbergen' : 'Anzeigen';
      } });

      pdBereich.appendChild(el('div', { class: 'raster' }, [
        el('div', { class: 'feld' }, [
          el('label', { html: 'Zugriffsschlüssel <span class="einheit">(API-Token)</span>' }),
          tokenFeld,
          el('div', { class: 'knopfleiste', style: { marginTop: '6px' } }, [zeigen])
        ]),
        textE('pipedriveHost', 'Pipedrive-Adresse',
              'z. B. meinefirma.pipedrive.com – leer lassen für die Standardadresse')
      ]));

      pdBereich.appendChild(el('div', { class: 'meldung warn', style: { marginTop: '4px' } },
        el('div', {}, [
          el('b', { text: 'Zum Schlüssel: ' }),
          'Er gilt in Pipedrive mit allen Rechten Ihres Benutzerkontos und lässt sich dort nicht ' +
          'auf reines Lesen beschränken. Er verbleibt ausschließlich auf diesem Gerät, wird in ' +
          'keinen Export und keinen Freigabe-Link geschrieben. Legen Sie ihn nur auf Geräten ab, ' +
          'die Sie selbst kontrollieren, und ziehen Sie ihn in Pipedrive zurück, wenn ein Gerät ' +
          'abhandenkommt. Sie finden ihn unter: Einstellungen → Persönliche Einstellungen → API.'
        ])));

      pdBereich.appendChild(el('div', { class: 'knopfleiste', style: { marginTop: '12px' } }, [
        el('button', { class: 'haupt', text: 'Verbindung prüfen', onclick: function (ev) {
          if (!e.pipedriveToken) { A.toast('Bitte zuerst den Schlüssel eintragen.', 'fehler'); return; }
          ev.target.disabled = true; ev.target.textContent = 'Prüfe …';
          global.Pipedrive.verbindungPruefen(e).then(function (benutzer) {
            return global.Pipedrive.pipelines(e).then(function (liste) {
              pdZeichnen({ gut: true, benutzer: benutzer, pipelines: liste });
            });
          }).catch(function (fehler) {
            pdZeichnen({ gut: false, fehler: fehler });
          });
        } }),
        e.pipedriveToken ? el('button', { class: 'gefahr', text: 'Verbindung entfernen', onclick: function () {
          A.bestaetigen('Verbindung entfernen?',
            'Der Zugriffsschlüssel wird von diesem Gerät gelöscht. In Pipedrive selbst ändert sich nichts.',
            'Entfernen').then(function (ja) {
            if (!ja) return;
            e.pipedriveToken = ''; e.pipedrivePipelineId = ''; e.pipedrivePipelineName = '';
            merken(); pdZeichnen();
            A.toast('Verbindung entfernt.');
          });
        } }) : null
      ]));

      if (!pruefErgebnis) {
        if (e.pipedrivePipelineName) {
          pdBereich.appendChild(el('p', { class: 'zart', style: { marginTop: '10px' },
            text: 'Gewählte Pipeline: ' + e.pipedrivePipelineName }));
        }
        return;
      }

      if (!pruefErgebnis.gut) {
        var f = pruefErgebnis.fehler || {};
        pdBereich.appendChild(el('div', { class: 'meldung fehler', style: { marginTop: '12px' } },
          el('div', {}, [
            el('b', { text: f.message || 'Die Verbindung ist fehlgeschlagen.' }),
            f.zusatz ? el('div', { style: { marginTop: '6px', fontSize: '13px' }, text: f.zusatz }) : null,
            f.art === 'verbindung' ? el('div', { style: { marginTop: '8px', fontSize: '13px' },
              text: 'Hinweis: Wenn Pipedrive Abfragen aus dem Browser grundsätzlich ablehnt, ' +
                    'lässt sich das nur über einen kleinen Zwischendienst lösen. Die Projektanlage ' +
                    'funktioniert davon unabhängig weiter – nur eben ohne Übernahme aus Pipedrive.' }) : null
          ])));
        return;
      }

      var b = pruefErgebnis.benutzer;
      pdBereich.appendChild(el('div', { class: 'meldung ok', style: { marginTop: '12px' } },
        el('div', {}, [
          el('b', { text: 'Verbindung steht.' }),
          el('div', { style: { marginTop: '4px', fontSize: '13.5px' },
            text: 'Angemeldet als ' + (b.name || '–') + (b.firma ? (' · ' + b.firma) : '') })
        ])));

      var auswahl = el('select', {
        onchange: function (ev) {
          e.pipedrivePipelineId = ev.target.value;
          var gewaehlt = (pruefErgebnis.pipelines || []).filter(function (pl) {
            return String(pl.id) === String(ev.target.value); })[0];
          e.pipedrivePipelineName = gewaehlt ? gewaehlt.name : '';
          merken();
        }
      });
      auswahl.appendChild(el('option', { value: '', text: '– alle Pipelines –' }));
      (pruefErgebnis.pipelines || []).forEach(function (pl) {
        auswahl.appendChild(el('option', { value: pl.id, text: pl.name }));
      });
      auswahl.value = e.pipedrivePipelineId || '';
      pdBereich.appendChild(el('div', { class: 'raster', style: { marginTop: '12px' } }, [
        A.feld('Pipeline für neue Aufmaße <span class="einheit">(z. B. Neukunden-Funnel)</span>', auswahl)
      ]));
    }

    /* --- Eigene Katalogeinträge --- */
    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Eigene Katalogeinträge' }),
      el('p', { class: 'hinweis', text: 'Ergänzen Sie hier Bauformen, die in den mitgelieferten Listen fehlen. Ausführungen wie Freidreh oder Anti-Panik werden getrennt gewählt und müssen nicht in die Bauform geschrieben werden.' }),
      listenPflege('eigeneZylinderarten', 'Zylinder-Bauformen', e, merken),
      listenPflege('eigeneBeschlagarten', 'Beschlag-Bauformen', e, merken),
      listenPflege('eigeneSchlossarten', 'Schloss-Bauformen', e, merken),
      listenPflege('eigeneZutrittsarten', 'Bauliche Anforderungen', e, merken)
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
    freigabeDialog: freigabeDialog,
    antwortDialog: antwortDialog,
    ansichtPlan: ansichtPlan,
    ansichtExport: ansichtExport,
    ansichtEinstellungen: ansichtEinstellungen,
    schliessungBearbeiten: schliessungBearbeiten
  };
})(typeof window !== 'undefined' ? window : globalThis);
