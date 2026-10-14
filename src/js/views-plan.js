/* =============================================================================
 * views-plan.js — Kreuzschließplan, Kundenfreigabe, Export und Einstellungen
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
    M.spaltenAngleichen(p);
    var VPers = global.ViewsPersonen;
    var seite = el('div', { class: 'seite breit' });
    behaelter.appendChild(seite);

    seite.appendChild(el('div', { class: 'zeile-verteilt', style: { marginBottom: '12px' } }, [
      el('div', { class: 'fuellen' }, [
        el('h1', { text: 'Kreuzschließplan / Zutrittsmatrix' }),
        el('p', { class: 'hinweis', text: 'Zeilen sind die aufgemessenen Türen, Spalten die Gruppen, Mitarbeiter und Schließungen. ' +
          'Zelle antippen schaltet die Berechtigung weiter. Spaltenkopf zwei Sekunden gedrückt halten und ziehen verschiebt die Spalte samt Kreuzen.' })
      ]),
      el('button', { class: 'haupt', text: 'Blanko-Plan erzeugen',
        onclick: function () { blankoDialog(neuZeichnen); } }),
      el('button', { text: '+ Spalte',
        onclick: function () { schliessungBearbeiten(null, neuZeichnen); } }),
      el('button', { text: 'Verwalten',
        onclick: function () { schliessungenVerwalten(neuZeichnen); } }),
      el('button', { text: '→ Kundenfreigabe',
        title: 'Plan zur Bearbeitung oder zur verbindlichen Freigabe an den Kunden senden',
        onclick: function () { freigabeDialog(neuZeichnen); } }),
      el('button', { text: '← Rückmeldung',
        title: 'Rückmeldung des Kunden einlesen',
        onclick: function () { antwortDialog(neuZeichnen); } })
    ]));

    /* Wartet zu diesem Aufmaß eine Kundenrückmeldung vom Server? */
    if (global.AbgleichUI && global.AbgleichUI.antwortenHinweis) {
      var hinweis = global.AbgleichUI.antwortenHinweis(p.id, neuZeichnen);
      if (hinweis) seite.appendChild(hinweis);
    }

    /* Verbindliche Freigabe des Kunden - und ob seitdem etwas geändert wurde */
    if (p.freigabe && p.freigabe.am) {
      var geaendert = M.seitFreigabeGeaendert(p);
      var wer = [p.freigabe.name, p.freigabe.funktion].filter(Boolean).join(', ');
      seite.appendChild(el('div', { class: 'meldung ' + (geaendert ? 'warn' : 'ok') + ' freigabe-vermerk' },
        el('div', { class: 'zeile-verteilt', style: { width: '100%', gap: '10px' } }, [
          el('div', { class: 'fuellen' }, [
            el('b', { text: 'Vom Kunden verbindlich freigegeben am ' + datumZeit(p.freigabe.am) + (wer ? ' durch ' + wer : '') + '.' }),
            el('div', { style: { marginTop: '3px', fontSize: '13px' }, text: geaendert
              ? 'Seit der Freigabe wurde der Plan geändert. Gegenüber dem Kunden gilt der freigegebene Stand - bei Bedarf erneut zur Freigabe vorlegen.'
              : 'Der Kunde kann über seinen Link nichts mehr ändern. Hier bleibt der Plan weiterhin änderbar.' })
          ]),
          geaendert ? el('button', { class: 'klein', text: 'Erneut zur Freigabe vorlegen',
            onclick: function () { freigabeDialog(neuZeichnen); } }) : null
        ])));
    }

    if (!p.tueren.length) {
      seite.appendChild(el('div', { class: 'leer' }, [
        el('h3', { text: 'Noch keine Türen erfasst' }),
        el('p', { text: 'Der Schließplan baut auf dem Aufmaß auf. Erfassen Sie zuerst die Türen.' })
      ]));
      seite.appendChild(VPers.listenKarte(neuZeichnen));
      return;
    }
    if (!p.schliessungen.length) {
      seite.appendChild(el('div', { class: 'leer' }, [
        el('h3', { text: 'Noch keine Spalten im Plan' }),
        el('p', { text: 'Der Blanko-Plan legt einen Generalhauptschlüssel an, der an allen Türen berechtigt ist, und auf Wunsch je Gruppe ' +
                        'und je Mitarbeiter eine leere Spalte. Alle weiteren Gruppen und Schließungen benennen Sie selbst.' }),
        el('div', { class: 'knopfleiste', style: { justifyContent: 'center' } }, [
          el('button', { class: 'haupt', text: 'Blanko-Plan erzeugen',
            onclick: function () { blankoDialog(neuZeichnen); } }),
          el('button', { text: '+ Spalte anlegen',
            onclick: function () { schliessungBearbeiten(null, neuZeichnen); } })
        ])
      ]));
      seite.appendChild(VPers.listenKarte(neuZeichnen));
      return;
    }

    var schliessungen = M.spaltenSortiert(p);

    /* Entfernen ist ein eigener Modus: Auf dem Tablett soll niemand beim
     * Setzen von Berechtigungen versehentlich eine Zeile löschen. */
    var entfernenAn = { wert: false };
    var werkzeuge = el('div', { class: 'werkzeuge', style: { marginBottom: '12px' } }, [
      A.schalterFeld(entfernenAn, 'wert', 'Türen und Spalten entfernen', function () {
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
      A.bestaetigen('Spalte entfernen?',
        'Die Spalte „' + (sch.kuerzel || sch.bezeichnung) + '“ und alle zugehörigen ' +
        'Berechtigungen werden gelöscht. Gruppe oder Mitarbeiter dahinter bleiben erhalten. ' +
        'Das lässt sich über den Zurück-Knopf rückgängig machen.')
        .then(function (ja) {
          if (!ja) return;
          A.schrittMerken('Spalte ' + (sch.kuerzel || sch.bezeichnung) + ' entfernt');
          p.schliessungen = p.schliessungen.filter(function (x) { return x.id !== sch.id; });
          M.matrixAufraeumen(p);
          A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
          A.toast('Spalte entfernt.');
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
      Math.min(220, Math.max(84, laengsterTitel * 7.6 + 44)) + 'px');

    /* --- Spalten verschieben: Kopf zwei Sekunden halten, dann ziehen -----
     * Die Reihenfolge wird während des Ziehens direkt in der Tabelle
     * umgebaut - Kopf, jede Türzeile und die Summenzeile rücken mit. Beim
     * Loslassen wird sie in den Sortierwerten festgeschrieben. */
    var reihenfolge = schliessungen.slice();
    var ziehen = null;
    var HALTEN_MS = 2000;

    function spalteVerschieben(von, nach) {
      if (von === nach || nach < 0 || nach >= reihenfolge.length) return;
      var s = reihenfolge.splice(von, 1)[0];
      reihenfolge.splice(nach, 0, s);
      Array.prototype.forEach.call(tabelle.querySelectorAll('tr'), function (tr) {
        if (tr.classList.contains('gruppenzeile')) return;
        var zelle = tr.children[von + 1];
        if (!zelle) return;
        tr.removeChild(zelle);
        tr.insertBefore(zelle, tr.children[nach + 1] || null);
      });
    }

    function langDruckVerschieben(th, s) {
      var zeitgeber = null, startX = 0, startY = 0, aktiv = false, zeigerId = null;
      function abbrechen() { if (zeitgeber) { clearTimeout(zeitgeber); zeitgeber = null; } }
      th.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      th.addEventListener('pointerdown', function (e) {
        if (entfernenAn.wert || e.button > 0) return;
        startX = e.clientX; startY = e.clientY; aktiv = false; zeigerId = e.pointerId;
        abbrechen();
        zeitgeber = setTimeout(function () {
          zeitgeber = null;
          aktiv = true;
          ziehen = { s: s, th: th };
          try { th.setPointerCapture(zeigerId); } catch (f) {}
          th.classList.add('greifen');
          tabelle.classList.add('verschieben');
          if (navigator.vibrate) { try { navigator.vibrate(30); } catch (f2) {} }
          A.toast('Spalte „' + (s.kuerzel || s.bezeichnung) + '“ nach links oder rechts ziehen.', 'info');
        }, HALTEN_MS);
      });
      th.addEventListener('pointermove', function (e) {
        if (!aktiv) {
          if (zeitgeber && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) abbrechen();
          return;
        }
        var koepfe = kopfZeile.querySelectorAll('th.spaltenkopf');
        var von = reihenfolge.indexOf(s), nach = von;
        for (var i = 0; i < koepfe.length; i++) {
          var r = koepfe[i].getBoundingClientRect();
          if (i < von && e.clientX < r.left + r.width / 2) { nach = i; break; }
          if (i > von && e.clientX > r.left + r.width / 2) { nach = i; }
        }
        if (nach !== von) spalteVerschieben(von, nach);
      });
      function beenden(e) {
        abbrechen();
        if (!aktiv) return;
        aktiv = false;
        th.klickUnterdruecken = true;
        setTimeout(function () { th.klickUnterdruecken = false; }, 400);
        th.classList.remove('greifen');
        tabelle.classList.remove('verschieben');
        try { th.releasePointerCapture(e.pointerId); } catch (f) {}
        ziehen = null;
        var geaendert = reihenfolge.some(function (x, i) { return x.sort !== i; });
        if (geaendert) {
          A.schrittMerken('Spalte ' + (s.kuerzel || s.bezeichnung) + ' verschoben');
          reihenfolge.forEach(function (x, i) { x.sort = i; });
          A.alsGeaendertMarkieren(); A.speichern();
          A.toast('Spalte verschoben.', 'ok');
        }
      }
      th.addEventListener('pointerup', beenden);
      th.addEventListener('pointercancel', beenden);
    }
    /* Während des Ziehens darf der Finger die Matrix nicht rollen */
    tabelle.addEventListener('touchmove', function (e) { if (ziehen) e.preventDefault(); }, { passive: false });

    var kopfZeile = el('tr', {}, [el('th', { class: 'ecke', text: 'Tür / Spalte' })]);
    schliessungen.forEach(function (s) {
      var titel = (s.kuerzel ? s.kuerzel + ' ' : '') + (s.bezeichnung || '');
      var traeger = M.traegerText(p, s);
      var artKurz = s.art === 'gruppe' ? 'Gruppe' : (s.art === 'mitarbeiter' ? 'Mitarb.' : '');
      var th = el('th', {
        class: 'spaltenkopf art-' + (s.art || 'schliessung') + (entfernenAn.wert ? ' entfernbar' : ''),
        'data-id': s.id,
        title: entfernenAn.wert ? ('Spalte „' + titel + '“ entfernen')
                                : (titel + (traeger ? ' – ' + traeger : '') + ' · lange drücken zum Verschieben'),
        onclick: function () {
          if (th.klickUnterdruecken) { th.klickUnterdruecken = false; return; }
          if (entfernenAn.wert) schliessungEntfernen(s);
          else schliessungBearbeiten(s, neuZeichnen);
        },
        style: { cursor: 'pointer' }
      }, [
        el('span', { class: 'dreh', text: titel || '–' }),
        entfernenAn.wert
          ? el('span', { class: 'entfernen-zeichen', text: '✕' })
          : el('span', { class: 'medien', text: M.medienAnzahl(p, s) + '×' }),
        (!entfernenAn.wert && artKurz) ? el('span', { class: 'art', text: artKurz }) : null
      ]);
      langDruckVerschieben(th, s);
      kopfZeile.appendChild(th);
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
              if (entfernenAn.wert || ziehen) return;   /* im Entfernen-Modus nicht schalten */
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
    legende.appendChild(el('span', { text: 'Spaltenkopf antippen: Spalte bearbeiten · lange drücken und ziehen: verschieben' }));
    seite.appendChild(legende);

    /* Schnellaktionen */
    seite.appendChild(el('div', { class: 'knopfleiste', style: { marginTop: '14px' } }, [
      el('button', { class: 'klein', text: 'Alle Türen für eine Spalte freigeben',
        onclick: function () { sammelAktion(schliessungen, 'ja', neuZeichnen); } }),
      el('button', { class: 'klein', text: 'Eine Spalte komplett leeren',
        onclick: function () { sammelAktion(schliessungen, 'nein', neuZeichnen); } })
    ]));

    /* Die Listen, aus denen die Spalten entstehen */
    seite.appendChild(VPers.listenKarte(neuZeichnen));
  }

  function sammelAktion(schliessungen, wert, neuZeichnen) {
    var p = Zustand.projekt;
    var auswahl = el('select');
    schliessungen.forEach(function (s) {
      auswahl.appendChild(el('option', { value: s.id, text: (s.kuerzel || '') + ' ' + (s.bezeichnung || '') }));
    });
    A.dialogOeffnen({
      titel: wert === 'ja' ? 'Alle Türen freigeben' : 'Spalte leeren', klein: true,
      inhalt: el('div', { class: 'feld' }, [
        el('label', { text: 'Spalte' }), auswahl,
        el('p', { class: 'hinweis', style: { marginTop: '10px' }, text: wert === 'ja'
          ? 'Die gewählte Spalte erhält an allen ' + p.tueren.length + ' Türen die Berechtigung „X“.'
          : 'Alle Berechtigungen dieser Spalte werden entfernt.' })
      ]),
      knoepfe: [
        { fuellen: true }, { text: 'Abbrechen' },
        { text: 'Ausführen', klasse: 'haupt', aktion: function () {
          A.schrittMerken(wert === 'ja' ? 'Alle Türen freigegeben' : 'Spalte geleert');
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
   * Berechtigungen ein. Je Link wird festgelegt, was er außerdem darf:
   * Mitarbeiter pflegen, Gruppen pflegen, neue Spalten aufnehmen. Zwei Wege:
   *  - Mit gemeinsamer Ablage (angemeldet, online): Die Freigabe liegt auf
   *    dem Server, der Kunde bekommt einen kurzen Link. Er sendet eine
   *    Rückmeldung oder gibt den Plan verbindlich frei. Beides wartet dann
   *    im Werkzeug auf die Prüfung (siehe abgleich-ui.js). Ein fertiger
   *    Plan lässt sich außerdem zur nachträglichen Freigabe vorlegen.
   *  - Ohne Server (Einzeldatei, ohne Netz): Die Plandaten stehen im Anker
   *    der Adresse, die Rückmeldung kommt als Rückschlüssel zurück und wird
   *    unten im antwortDialog eingelesen. Eine verbindliche Freigabe gibt
   *    es nur über den Server.
   * -------------------------------------------------------------------- */
  /* Steht die gemeinsame Ablage bereit? Dann entsteht ein Kurzlink über
     den Server; sonst der lange Link mit den Daten im Anker. */
  function abgleichBereit() {
    var Ab = global.Abgleich;
    if (!Ab) return false;
    var z = Ab.zustand();
    return !!(z.angemeldet && z.erreichbar !== false);
  }

  function datumKurz(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch (e) { return String(iso).slice(0, 10); }
  }
  function datumZeit(iso) {
    if (!iso) return '–';
    try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return String(iso).slice(0, 16).replace('T', ' '); }
  }

  function inZwischenablage(feld, text, knopf) {
    feld.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        knopf.textContent = 'Kopiert ✓';
      }).catch(function () { knopf.textContent = 'Bitte von Hand markieren'; });
    } else {
      try { document.execCommand('copy'); knopf.textContent = 'Kopiert ✓'; }
      catch (err) { knopf.textContent = 'Bitte von Hand markieren'; }
    }
  }

  /* Lesbare Zusammenfassung dessen, was ein Link dem Kunden erlaubt */
  function rechteText(r) {
    if (!r) return '';
    var teile = [];
    if (r.m) teile.push('Mitarbeiter');
    if (r.g) teile.push('Gruppen');
    if (r.s) teile.push('neue Spalten');
    return teile.length ? 'Kunde darf: ' + teile.join(', ') : 'nur Berechtigungen';
  }

  function freigabeDialog(neuZeichnen) {
    var p = Zustand.projekt;
    var eins = Zustand.einstellungen || {};
    var gewaehlt = {};
    p.schliessungen.forEach(function (s) { gewaehlt[s.id] = false; });
    var einstellungenFreigabe = { nurLeereFelder: false, hinweis: '', frist: '',
                                  mitarbeiter: true, gruppen: true, spalten: false };
    var online = abgleichBereit();

    var auswahlBereich = el('div', { class: 'chips', style: { marginBottom: '10px' } });
    var vorschau = el('div', { class: 'meldung info' });
    var ergebnisBereich = el('div');
    var listeBereich = el('div');

    function anzahlGewaehlt() {
      return Object.keys(gewaehlt).filter(function (k) { return gewaehlt[k]; }).length;
    }

    function vorschauAktualisieren() {
      A.leeren(vorschau);
      var spalten = anzahlGewaehlt();
      var felder = spalten * p.tueren.length;
      var rechte = rechteText({ m: einstellungenFreigabe.mitarbeiter, g: einstellungenFreigabe.gruppen, s: einstellungenFreigabe.spalten });
      if (!spalten) {
        vorschau.className = 'meldung warn';
        vorschau.appendChild(el('div', {}, [
          el('b', { text: 'Keine Spalte zur Bearbeitung freigegeben.' }),
          el('div', { style: { marginTop: '4px', fontSize: '13px' },
            text: 'Der Kunde sieht den Plan dann nur. ' + rechte + '.' })
        ]));
        return;
      }
      vorschau.className = 'meldung info';
      vorschau.appendChild(el('div', {}, [
        el('b', { text: spalten + (spalten === 1 ? ' Spalte' : ' Spalten') +
                        ' mit ' + felder + ' Feldern werden freigegeben.' }),
        el('div', { style: { marginTop: '4px', fontSize: '13px' },
          text: 'Alle übrigen Felder sieht der Kunde, kann sie aber nicht ändern. ' + rechte + '.' })
      ]));
    }

    function auswahlZeichnen() {
      A.leeren(auswahlBereich);
      M.spaltenSortiert(p).forEach(function (s) {
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

    /* Adresse der Freigabeseite neben der Anwendung */
    var seite = location.href.replace(/[^\/]*(\?.*)?(#.*)?$/, '') + 'freigabe.html';

    function freigabeDaten(nurVorlegen) {
      var ids = nurVorlegen ? [] : Object.keys(gewaehlt).filter(function (k) { return gewaehlt[k]; });
      return global.Freigabe.erstellen(p, {
        freigegebeneSchliessungen: ids,
        nurLeereFelder: einstellungenFreigabe.nurLeereFelder,
        hinweis: einstellungenFreigabe.hinweis,
        frist: einstellungenFreigabe.frist,
        firma: eins.firma || '',
        rechte: nurVorlegen ? { m: 0, g: 0, s: 0 }
                            : { m: einstellungenFreigabe.mitarbeiter ? 1 : 0,
                                g: einstellungenFreigabe.gruppen ? 1 : 0,
                                s: einstellungenFreigabe.spalten ? 1 : 0 },
        medienArten: M.identmedienAuswahl(p, eins.eigeneSysteme || [])
      });
    }

    function linkErzeugen() {
      var daten = freigabeDaten(false);
      if (abgleichBereit()) { kurzlinkErzeugen(daten, false); return; }
      /* Ohne Server merkt sich das Projekt selbst, was freigegeben war -
         damit beim Einlesen der Rückmeldung nur diese Felder gelten. */
      global.Freigabe.freigabeMerken(p, daten);
      A.alsGeaendertMarkieren();
      langenLinkZeigen(daten);
    }

    function mailText(f, vorlegen) {
      var betreff = (vorlegen ? 'Freigabe des Schließplans ' : 'Zutrittsberechtigungen ') + (p.objekt || p.kunde || '');
      var text = vorlegen
        ? 'Guten Tag,\n\nbitte prüfen Sie den Schließplan unter folgendem Link und geben Sie ihn verbindlich frei. '
          + 'Mit der Freigabe ist die Abstimmung abgeschlossen - Änderungen sind danach nur noch gegen Mehraufwand möglich.\n\n'
        : 'Guten Tag,\n\nbitte tragen Sie unter folgendem Link ein, wer welche Türen öffnen darf. '
          + 'Am Ende auf „Rückmeldung senden“ klicken - oder, wenn alles passt, auf „Rückmeldung senden und Plan freigeben“.\n\n';
      text += f.kurzlink + '\n\n'
        + (f.gueltigBis ? 'Der Link gilt bis ' + datumKurz(f.gueltigBis) + '.\n\n' : '')
        + 'Mit freundlichen Grüßen\n' + (eins.firma || '');
      return { betreff: betreff, text: text };
    }

    /* --- Kurzlink: die Freigabe liegt auf dem Server ----------------- */
    function kurzlinkErzeugen(daten, vorlegen) {
      A.leeren(ergebnisBereich);
      ergebnisBereich.appendChild(el('hr', { class: 'trenner' }));
      ergebnisBereich.appendChild(el('p', { class: 'zart', text: 'Freigabe wird auf dem Server abgelegt …' }));

      global.Abgleich.freigabeErstellen(p.id, daten, seite, { vorlegen: vorlegen }).then(function (f) {
        A.leeren(ergebnisBereich);
        ergebnisBereich.appendChild(el('hr', { class: 'trenner' }));
        ergebnisBereich.appendChild(el('h3', { text: vorlegen ? 'Link zur verbindlichen Freigabe' : 'Freigabe-Link für den Kunden', style: { marginTop: '0' } }));
        var feld = el('input', { type: 'text', class: 'kurzlink-feld', readonly: true, value: f.kurzlink,
          'aria-label': 'Freigabe-Link' });
        ergebnisBereich.appendChild(feld);
        var mail = mailText(f, vorlegen);
        ergebnisBereich.appendChild(el('div', { class: 'knopfleiste', style: { marginTop: '10px' } }, [
          el('button', { class: 'haupt', text: 'Link kopieren', onclick: function (e) {
            inZwischenablage(feld, f.kurzlink, e.target);
          } }),
          el('button', { text: 'Per E-Mail senden', onclick: function () {
            location.href = 'mailto:?subject=' + encodeURIComponent(mail.betreff) + '&body=' + encodeURIComponent(mail.text);
          } })
        ]));
        ergebnisBereich.appendChild(el('p', { class: 'hinweis', text:
          (f.gueltigBis ? 'Gültig bis ' + datumKurz(f.gueltigBis) + '. ' : 'Gültig, bis er zurückgezogen wird. ')
          + (vorlegen
            ? 'Der Kunde sieht den fertigen Plan und klickt auf „Plan verbindlich freigeben“. Die Freigabe erscheint dann hier im Werkzeug '
              + 'und wird mit „Übernehmen“ im Aufmaß vermerkt. Danach kann der Kunde über den Link nichts mehr ändern.'
            : 'Der Kunde trägt ein und klickt auf „Rückmeldung senden“ - oder auf „Rückmeldung senden und Plan freigeben“, wenn alles passt. '
              + 'Seine Rückmeldung erscheint dann hier im Werkzeug (in der Kopfzeile und im Schließplan) und wird erst übernommen, '
              + 'wenn eine zuständige Person sie geprüft hat. Ersteller und Zuständige werden per E-Mail benachrichtigt.') }));
        listeLaden();
      }).catch(function (f) {
        A.leeren(ergebnisBereich);
        ergebnisBereich.appendChild(el('hr', { class: 'trenner' }));
        var text;
        if (f && f.status === 404) {
          text = 'Dieses Aufmaß liegt noch nicht auf dem Server. Der Abgleich sendet es gleich - '
               + 'bitte in ein paar Sekunden erneut tippen.';
          global.Abgleich.jetzt();
        } else if (f && f.status === 403) {
          text = f.message;
        } else if (f && f.status) {
          text = f.message || 'Die Freigabe ließ sich nicht anlegen.';
        } else {
          text = 'Keine Verbindung zum Server. Ohne Verbindung gibt es nur den langen Link mit den Daten im Anker.';
        }
        ergebnisBereich.appendChild(el('div', { class: 'meldung fehler' }, el('div', { text: text })));
        if (!(f && f.status) && !vorlegen) {
          ergebnisBereich.appendChild(el('div', { class: 'knopfleiste', style: { marginTop: '10px' } }, [
            el('button', { text: 'Langen Link stattdessen erzeugen', onclick: function () { langenLinkZeigen(daten); } })
          ]));
        }
      });
    }

    /* --- Bisherige Freigaben dieses Aufmaßes -------------------------- */
    function freigabeWer(f) {
      return f.freigabe ? [f.freigabe.name, f.freigabe.funktion].filter(Boolean).join(', ') : '';
    }
    function statusText(f) {
      switch (f.status) {
        case 'offen': return 'Offen – noch keine Rückmeldung';
        case 'beantwortet':
          return (f.freigabe ? 'Rückmeldung mit verbindlicher Freigabe' : 'Rückmeldung') + ' von ' + (f.antwortName || 'dem Kunden')
               + ' am ' + datumZeit(f.antwortAm) + ' wartet auf Prüfung';
        case 'uebernommen': return 'Übernommen am ' + datumZeit(f.uebernommenAm) + (f.uebernommenVon ? ' von ' + f.uebernommenVon : '');
        case 'vorgelegt': return 'Zur verbindlichen Freigabe vorgelegt am ' + datumZeit(f.vorgelegtAm) + ' – wartet auf den Kunden';
        case 'freigegeben': return 'Verbindlich freigegeben am ' + datumZeit(f.freigabe && f.freigabe.am) + (freigabeWer(f) ? ' durch ' + freigabeWer(f) : '') + ' – für den Kunden gesperrt';
        case 'verworfen': return 'Rückmeldung geprüft und verworfen';
        case 'zurueckgezogen': return 'Zurückgezogen';
        case 'abgelaufen': return 'Abgelaufen';
        default: return f.status;
      }
    }

    function listeLaden() {
      if (!abgleichBereit()) { A.leeren(listeBereich); return; }
      global.Abgleich.freigabenListe(p.id).then(function (liste) {
        A.leeren(listeBereich);
        if (!liste.length) return;
        listeBereich.appendChild(el('hr', { class: 'trenner' }));
        listeBereich.appendChild(el('h3', { text: 'Bisherige Freigabe-Links', style: { marginTop: '0' } }));
        var behaelter = el('div', { class: 'freigabe-liste' });
        liste.forEach(function (f) {
          var zeile = el('div', { class: 'freigabe-eintrag status-' + f.status + (f.status === 'beantwortet' ? ' wartet' : '') });
          zeile.appendChild(el('div', { class: 'code', text: f.kurzlink.replace(/^https?:\/\//, '') }));
          zeile.appendChild(el('div', { class: 'stand', text:
            'Erstellt am ' + datumZeit(f.erstelltAm) + (f.erstelltVon ? ' von ' + f.erstelltVon : '') + '  ·  ' + statusText(f)
            + (f.rechte && f.status !== 'vorgelegt' && f.status !== 'freigegeben' ? '  ·  ' + rechteText(f.rechte) : '') }));
          var knoepfe = el('div', { class: 'knopfleiste' });
          var tot = f.status === 'zurueckgezogen' || f.status === 'abgelaufen';
          if (!tot) {
            knoepfe.appendChild(el('button', { class: 'klein', text: 'Kopieren', onclick: function (e) {
              var feld = el('input', { type: 'text', value: f.kurzlink, style: { position: 'absolute', left: '-9999px' } });
              document.body.appendChild(feld);
              inZwischenablage(feld, f.kurzlink, e.target);
              setTimeout(function () { if (feld.parentNode) feld.parentNode.removeChild(feld); }, 500);
            } }));
          }
          if (f.status === 'beantwortet' && global.AbgleichUI && global.AbgleichUI.antwortDialog) {
            var wartend = (global.Abgleich.antwortenFuer(p.id) || []).filter(function (a) { return a.code === f.code; })[0];
            if (wartend) {
              knoepfe.appendChild(el('button', { class: 'haupt klein', text: 'Rückmeldung prüfen', onclick: function () {
                global.AbgleichUI.antwortDialog(wartend, listeLaden);
              } }));
            }
          }
          /* Den fertigen Plan über diesen Link zur verbindlichen Freigabe
             vorlegen - der Kunde sieht dann den aktuellen Stand, ohne etwas
             ändern zu können, und gibt frei. */
          if (!tot && f.status !== 'beantwortet') {
            knoepfe.appendChild(el('button', { class: 'klein', text: f.status === 'vorgelegt' ? 'Erneut vorlegen (aktueller Stand)' : 'Zur Freigabe vorlegen',
              title: 'Der Kunde sieht den aktuellen Plan und kann ihn verbindlich freigeben',
              onclick: function (e) {
                e.target.disabled = true;
                global.Abgleich.freigabeVorlegen(f.code, freigabeDaten(true)).then(function () {
                  A.toast('Der aktuelle Plan liegt dem Kunden jetzt zur Freigabe vor.', 'ok');
                  listeLaden();
                }).catch(function (fehler) {
                  e.target.disabled = false;
                  A.toast(fehler.message || 'Das ging gerade nicht.', 'fehler');
                });
              } }));
          }
          if (!tot) {
            knoepfe.appendChild(el('button', { class: 'klein gefahr', text: 'Zurückziehen', onclick: function () {
              A.bestaetigen('Freigabe-Link zurückziehen?',
                'Der Link funktioniert danach nicht mehr. Eine bereits übertragene Rückmeldung bleibt zur Prüfung erhalten.',
                'Zurückziehen').then(function (ja) {
                if (!ja) return;
                global.Abgleich.freigabeZurueckziehen(f.code).then(function () {
                  A.toast('Freigabe-Link zurückgezogen.', 'ok');
                  listeLaden();
                }).catch(function (fehler) { A.toast(fehler.message || 'Das ging gerade nicht.', 'fehler'); });
              });
            } }));
          }
          zeile.appendChild(knoepfe);
          behaelter.appendChild(zeile);
        });
        listeBereich.appendChild(behaelter);
      }).catch(function () { A.leeren(listeBereich); });
    }

    /* --- Langer Link: alles im Anker, ohne Server ---------------------- */
    function langenLinkZeigen(daten) {
      var anker = global.Freigabe.alsAnker(daten);
      var basis = seite;
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
              'Rautezeichen und werden dabei an keinen Server übertragen. Eine verbindliche Freigabe ist ' +
              'nur über die gemeinsame Ablage möglich. Länge: ' +
              link.length.toLocaleString('de-DE') + ' Zeichen.' }));
      if (link.length > 20000) {
        ergebnisBereich.appendChild(el('div', { class: 'meldung warn' }, el('div', {}, [
          el('b', { text: 'Der Link ist sehr lang. ' }),
          'Manche E-Mail-Programme brechen lange Links um. Geben Sie im Zweifel weniger ' +
          'Spalten frei oder senden Sie die Datei unten.'
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
        text: online
          ? 'Der Kunde öffnet den kurzen Link im Browser, trägt in den freigegebenen Feldern seine ' +
            'Berechtigungen ein und sendet seine Rückmeldung - auf Wunsch gleich mit verbindlicher Freigabe. ' +
            'Beides erscheint hier im Werkzeug und wird erst nach Ihrer Prüfung übernommen.'
          : 'Der Kunde öffnet den Link im Browser und trägt in den freigegebenen Feldern ' +
            'seine Berechtigungen ein. Seine Rückmeldung lesen Sie anschließend hier wieder ein.' }),
      /* Nur wenn es die gemeinsame Ablage überhaupt gibt und sie gerade
         nicht erreichbar ist - in der Einzeldatei gibt es keinen Server,
         da wäre der Hinweis nur verwirrend. */
      (global.Abgleich && global.Abgleich.zustand().eingerichtet && !online) ? el('div', { class: 'meldung warn' }, el('div', { text:
        'Ohne Verbindung zur gemeinsamen Ablage entsteht nur der lange Link mit den Daten im Anker. ' +
        'Für den kurzen Link und die verbindliche Freigabe bitte anmelden und online gehen.' })) : null,
      el('h3', { text: 'Welche Spalten darf der Kunde bearbeiten?' }),
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
      el('h3', { text: 'Was darf der Kunde außerdem?' }),
      el('p', { class: 'zart', style: { marginTop: '-6px' },
        text: 'Das legen Sie je Link fest. Was der Kunde ändert, kommt mit der Rückmeldung zurück und wird erst nach Ihrer Prüfung übernommen.' }),
      A.schalterFeld(einstellungenFreigabe, 'mitarbeiter', 'Mitarbeiter pflegen (Namen, Gruppenzuordnung, Medien)', function () { vorschauAktualisieren(); }),
      A.schalterFeld(einstellungenFreigabe, 'gruppen', 'Gruppen anlegen und umbenennen', function () { vorschauAktualisieren(); }),
      A.schalterFeld(einstellungenFreigabe, 'spalten', 'Neue Spalten für Gruppen oder Mitarbeiter aufnehmen', function () { vorschauAktualisieren(); }),
      el('p', { class: 'zart', style: { marginLeft: '64px', marginTop: '-6px' },
        text: 'Neue Spalten des Kunden sind für ihn vollständig bearbeitbar. Welche vorhandenen Spalten er bearbeiten darf, bestimmen Sie oben.' }),
      el('div', { class: 'raster', style: { marginTop: '12px' } }, [
        A.textFeld(einstellungenFreigabe, 'hinweis', 'Hinweis für den Kunden',
          { platzhalter: 'z. B. Bitte nur die Reinigungszeiten eintragen' }),
        A.textFeld(einstellungenFreigabe, 'frist', 'Rückmeldung erbeten bis',
          { platzhalter: 'z. B. 30.09.2026' })
      ]),
      vorschau,
      el('div', { class: 'knopfleiste' }, [
        el('button', { class: 'haupt', text: 'Freigabe-Link erzeugen', onclick: function () {
          if (!anzahlGewaehlt() && !einstellungenFreigabe.mitarbeiter && !einstellungenFreigabe.gruppen && !einstellungenFreigabe.spalten) {
            A.toast('Bitte mindestens eine Spalte freigeben oder ein Recht einräumen.', 'fehler'); return;
          }
          linkErzeugen();
        } }),
        online ? el('button', { text: 'Plan zur verbindlichen Freigabe vorlegen',
          title: 'Der Kunde sieht den fertigen Plan ohne Bearbeitung und gibt ihn verbindlich frei',
          onclick: function () { kurzlinkErzeugen(freigabeDaten(true), true); } }) : null
      ]),
      ergebnisBereich,
      listeBereich
    ]);

    A.dialogOeffnen({
      titel: 'Plan an den Kunden senden', inhalt: inhalt,
      knoepfe: [{ fuellen: true }, { text: 'Schließen' }]
    });
    listeLaden();
  }

  /* --- Rückmeldung des Kunden einlesen ------------------------------------ */
  function antwortDialog(neuZeichnen) {
    var p = Zustand.projekt;
    var feld = el('textarea', { class: 'schluessel-feld', rows: 6,
      placeholder: 'Rückschlüssel des Kunden hier einfügen …',
      style: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '12px' } });
    var bericht = el('div');

    var dateiEingabe = el('input', {
      type: 'file', accept: '.txt,text/plain', class: 'versteckt',
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
      var ueberschrift = global.Freigabe.antwortKurz(gelesen) + ' in der Rückmeldung';
      bericht.appendChild(el('div', { class: 'meldung ' + (fremd ? 'warn' : 'ok') }, el('div', {}, [
        el('b', { text: ueberschrift }),
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
                'Übernommen wird ausschließlich, was Sie für diesen Link freigegeben haben.' }),
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
          /* Maßstab ist die beim Erzeugen des Links abgelegte Freigabe. Ist
             keine bekannt, wird die Rückmeldung abgelehnt - ungeprüft kommt
             nichts ins Aufmaß. */
          try { ergebnis = global.Freigabe.antwortUebernehmen(p, gelesen, {}); }
          catch (fehler) { A.toast(fehler.message, 'fehler'); return false; }
          A.alsGeaendertMarkieren(); A.speichern();
          A.toast(global.Freigabe.berichtText(ergebnis) + '.', 'ok');
          schliessen(); neuZeichnen();
          return false;
        } }
      ]
    });
  }

  /* --- Blanko-Plan ------------------------------------------------------ */
  function blankoDialog(neuZeichnen) {
    var p = Zustand.projekt;
    var hatGhs = p.schliessungen.some(function (s) { return s.typ === 'ghs'; });
    var optionen = { ghs: !hatGhs, proGruppe: (p.gruppen || []).length > 0, proMitarbeiter: false,
                     vorhandeneErsetzen: false };
    var vorschau = el('div', { class: 'meldung info', style: { marginTop: '4px' } });

    function grundlage() {
      return optionen.vorhandeneErsetzen ? Object.assign({}, p, { schliessungen: [] }) : p;
    }
    function vorschauAktualisieren() {
      A.leeren(vorschau);
      var anzahl = M.blankoVorschau(grundlage(), optionen);
      vorschau.appendChild(el('div', {}, [
        el('b', { text: anzahl + (anzahl === 1 ? ' Spalte wird' : ' Spalten werden') + ' angelegt' }),
        el('div', { style: { marginTop: '4px', fontSize: '13px' },
          text: optionen.vorhandeneErsetzen && p.schliessungen.length
            ? 'Die vorhandenen ' + p.schliessungen.length + ' Spalten und ihre Berechtigungen werden dabei entfernt.'
            : 'Vorhandene Spalten bleiben erhalten, die neuen kommen hinzu.' })
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
        text: 'Als Grundlage wird ein Generalhauptschlüssel angelegt, der an allen Türen berechtigt ist. Dazu auf Wunsch je Gruppe ' +
              'und je Mitarbeiter eine noch leere Spalte - die Berechtigungen tippen Sie danach an. Alle weiteren Schließungen ' +
              'und Gruppen benennen Sie selbst.' }),
      schalter('ghs', 'Generalhauptschlüssel (GHS)', hatGhs ? 'Es gibt schon einen GHS im Plan.' : 'Eine Schließung, die an allen Türen berechtigt ist - mit zwei Medien.'),
      schalter('proGruppe', 'Spalte je Gruppe (' + (p.gruppen || []).length + ')', 'Alle Mitglieder einer Gruppe sind über ihre Spalte berechtigt.'),
      schalter('proMitarbeiter', 'Spalte je Mitarbeiter (' + (p.mitarbeiter || []).length + ')', 'Nur sinnvoll für Mitarbeiter mit eigenen Berechtigungen - sonst viele Spalten.'),
      el('hr', { class: 'trenner' }),
      schalter('vorhandeneErsetzen', 'Vorhandene Spalten vorher entfernen',
        'Ohne diesen Schalter werden die neuen Spalten ergänzt.'),
      vorschau
    ]);
    vorschauAktualisieren();

    A.dialogOeffnen({
      titel: 'Blanko-Plan erzeugen', inhalt: inhalt,
      knoepfe: [
        { fuellen: true },
        { text: 'Abbrechen' },
        { text: 'Plan erzeugen', klasse: 'haupt', aktion: function (schliessen) {
          var anzahl = M.blankoVorschau(grundlage(), optionen);
          if (!anzahl) { A.toast('Mit dieser Auswahl entsteht keine Spalte.', 'fehler'); return false; }
          function ausfuehren() {
            A.schrittMerken('Blanko-Plan erzeugt');
            if (optionen.vorhandeneErsetzen) { p.schliessungen = []; p.matrix = {}; }
            var ergebnis = M.blankoSchliessplan(p, optionen);
            A.alsGeaendertMarkieren(); A.speichern();
            A.toast(ergebnis.angelegt + (ergebnis.angelegt === 1 ? ' Spalte' : ' Spalten') + ' und ' + ergebnis.berechtigungen +
                    ' Berechtigungen angelegt.', 'ok');
            schliessen(); neuZeichnen();
          }
          if (optionen.vorhandeneErsetzen && p.schliessungen.length) {
            A.bestaetigen('Vorhandene Spalten entfernen?',
              'Die bestehenden ' + p.schliessungen.length + ' Spalten und alle gesetzten ' +
              'Berechtigungen werden gelöscht und durch den neuen Plan ersetzt. Mitarbeiter und Gruppen bleiben erhalten.',
              'Ersetzen').then(function (ja) { if (ja) ausfuehren(); });
          } else { ausfuehren(); }
          return false;
        } }
      ]
    });
  }

  /* =========================================================================
   * Spalte anlegen / bearbeiten
   * ======================================================================
   * Eine Spalte ist eine Gruppe, ein einzelner Mitarbeiter oder eine
   * Schließung mit Rang im Plan. Bei Gruppe und Mitarbeiter verweist die
   * Spalte auf die Liste unter der Matrix; Name und Mitglieder werden dort
   * gepflegt. Bei einer Schließung stehen die Träger (Mitarbeiter) oder -
   * ohne benannte Träger - Art und Anzahl der Medien direkt an der Spalte.
   */
  function naechsteSort(p) {
    return (p.schliessungen || []).reduce(function (max, s) { return Math.max(max, (s.sort || 0) + 1); }, 0);
  }

  function schliessungBearbeiten(vorhandene, neuZeichnen) {
    var p = Zustand.projekt;
    var VPers = global.ViewsPersonen;
    var istNeu = !vorhandene;
    var s = istNeu ? M.neueSchliessung({ sort: naechsteSort(p) })
                   : JSON.parse(JSON.stringify(vorhandene));
    s.medien = M.medienBereinigen(s.medien);
    var wahl = { art: s.art || 'schliessung', gruppeId: '', mitarbeiterId: '', neuerName: '' };

    var inhalt = el('div');
    var formular = el('div');
    var medienBereich = el('div');

    if (istNeu) {
      var artChips = el('div', { class: 'chips' });
      K.SPALTEN_ART.forEach(function (a) {
        var chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': wahl.art === a.id ? 'true' : 'false', text: a.label,
          onclick: function () {
            wahl.art = a.id;
            Array.prototype.forEach.call(artChips.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
            chip.setAttribute('aria-pressed', 'true');
            formularZeichnen();
          } });
        artChips.appendChild(chip);
      });
      inhalt.appendChild(el('div', { class: 'feld voll', 'data-feld': 'art' }, [el('label', { text: 'Was soll die Spalte sein?' }), artChips]));
    }
    inhalt.appendChild(formular);

    function artHinweis(id) {
      var a = K.SPALTEN_ART.filter(function (x) { return x.id === id; })[0];
      return a ? a.hinweis : '';
    }

    function medienZeichnen() {
      A.leeren(medienBereich);
      var leute = M.spaltenMitglieder(p, s);
      medienBereich.appendChild(el('hr', { class: 'trenner' }));
      if (leute.length) {
        medienBereich.appendChild(el('p', { class: 'hinweis', text:
          M.medienAnzahl(p, s) + (M.medienAnzahl(p, s) === 1 ? ' Medium' : ' Medien') + ' - aus den Angaben der Mitarbeiter (' +
          leute.map(function (m) { return m.name; }).join(', ') + '). Art und Anzahl stehen beim jeweiligen Mitarbeiter.' }));
      } else {
        medienBereich.appendChild(VPers.medienFeld(s, 'Medien ohne benannten Träger <span class="einheit">(z. B. zwei Generalhauptschlüssel im Tresor)</span>',
          { leerText: 'Noch keine Medien eingetragen - oder oben Mitarbeiter als Träger wählen.' }));
      }
    }

    function formularZeichnen() {
      A.leeren(formular);
      if (wahl.art === 'gruppe') {
        if (istNeu) {
          var frei = (p.gruppen || []).filter(function (g) {
            return !p.schliessungen.some(function (s2) { return s2.art === 'gruppe' && s2.gruppeId === g.id; });
          });
          formular.appendChild(el('p', { class: 'hinweis', text: artHinweis('gruppe') }));
          formular.appendChild(el('div', { class: 'raster' }, [
            A.auswahlFeld(wahl, 'gruppeId', 'Vorhandene Gruppe', frei.map(function (g) { return { id: g.id, label: g.name }; }),
              { leerText: frei.length ? '– Gruppe wählen –' : '– alle Gruppen haben schon eine Spalte –' }),
            A.textFeld(wahl, 'neuerName', 'oder neue Gruppe anlegen', { platzhalter: 'Name der neuen Gruppe', autocapitalize: 'words' })
          ]));
          formular.appendChild(el('div', { class: 'raster', style: { marginTop: '12px' } }, [
            A.textFeld(s, 'kuerzel', 'Kürzel', { platzhalter: 'leer = aus dem Namen' })
          ]));
        } else {
          var g = M.gruppeVon(p, s.gruppeId);
          formular.appendChild(el('p', { class: 'hinweis', text: 'Spalte der Gruppe „' + (g ? g.name : s.bezeichnung) + '“ - ' +
            M.traegerText(p, s) + '. Name und Mitglieder werden in der Gruppe gepflegt.' }));
          if (g) {
            formular.appendChild(el('div', { class: 'knopfleiste' }, el('button', { text: 'Gruppe bearbeiten', onclick: function () {
              dialog.schliessen(); VPers.gruppeBearbeiten(g, neuZeichnen);
            } })));
          }
          formular.appendChild(el('div', { class: 'raster', style: { marginTop: '12px' } }, [
            A.textFeld(s, 'kuerzel', 'Kürzel', { platzhalter: 'z. B. VW, EDV' }),
            A.bereichFeld(s, 'bemerkung', 'Bemerkung', { zeilen: 2 })
          ]));
        }
      } else if (wahl.art === 'mitarbeiter') {
        if (istNeu) {
          var freieLeute = (p.mitarbeiter || []).filter(function (m) {
            return !p.schliessungen.some(function (s2) { return s2.art === 'mitarbeiter' && s2.mitarbeiterId === m.id; });
          });
          formular.appendChild(el('p', { class: 'hinweis', text: artHinweis('mitarbeiter') }));
          formular.appendChild(el('div', { class: 'raster' }, [
            A.auswahlFeld(wahl, 'mitarbeiterId', 'Vorhandener Mitarbeiter', freieLeute.map(function (m) { return { id: m.id, label: m.name }; }),
              { leerText: freieLeute.length ? '– Mitarbeiter wählen –' : '– alle Mitarbeiter haben schon eine Spalte –' }),
            A.textFeld(wahl, 'neuerName', 'oder neuen Mitarbeiter anlegen', { platzhalter: 'Vorname Nachname', autocapitalize: 'words' })
          ]));
          formular.appendChild(el('div', { class: 'raster', style: { marginTop: '12px' } }, [
            A.textFeld(s, 'kuerzel', 'Kürzel', { platzhalter: 'leer = aus dem Namen' })
          ]));
        } else {
          var m = M.mitarbeiterVon(p, s.mitarbeiterId);
          formular.appendChild(el('p', { class: 'hinweis', text: 'Spalte des Mitarbeiters „' + (m ? m.name : s.bezeichnung) + '“. ' +
            'Name, Gruppen und Medien werden beim Mitarbeiter gepflegt.' }));
          if (m) {
            formular.appendChild(el('div', { class: 'knopfleiste' }, el('button', { text: 'Mitarbeiter bearbeiten', onclick: function () {
              dialog.schliessen(); VPers.mitarbeiterBearbeiten(m, neuZeichnen);
            } })));
          }
          formular.appendChild(el('div', { class: 'raster', style: { marginTop: '12px' } }, [
            A.textFeld(s, 'kuerzel', 'Kürzel', { platzhalter: 'z. B. HM' }),
            A.bereichFeld(s, 'bemerkung', 'Bemerkung', { zeilen: 2 })
          ]));
        }
      } else {
        formular.appendChild(el('div', { class: 'raster' }, [
          A.textFeld(s, 'kuerzel', 'Kürzel', { platzhalter: 'z. B. GHS, HS-A' }),
          A.textFeld(s, 'bezeichnung', 'Bezeichnung', { platzhalter: 'z. B. Generalhauptschlüssel' }),
          A.auswahlFeld(s, 'typ', 'Rang im Plan', K.SCHLIESSUNG_TYPEN, { leerText: '– ohne Angabe –' })
        ]));
        formular.appendChild(el('hr', { class: 'trenner' }));
        formular.appendChild(VPers.traegerChips(s, medienZeichnen, neuZeichnen));
        formular.appendChild(medienBereich);
        medienZeichnen();
        formular.appendChild(el('div', { class: 'raster', style: { marginTop: '14px' } }, [
          A.bereichFeld(s, 'bemerkung', 'Bemerkung', { zeilen: 2 })
        ]));
      }
    }
    formularZeichnen();

    var knoepfe = [];
    if (!istNeu) {
      knoepfe.push({ text: 'Löschen', klasse: 'gefahr', aktion: function (schliessen) {
        A.bestaetigen('Spalte löschen?',
          'Die Spalte „' + (s.kuerzel || s.bezeichnung) +
          '“ und alle zugehörigen Berechtigungen werden entfernt. Gruppe oder Mitarbeiter dahinter bleiben erhalten.').then(function (ja) {
          if (!ja) return;
          A.schrittMerken('Spalte ' + (s.kuerzel || s.bezeichnung) + ' gelöscht');
          p.schliessungen = p.schliessungen.filter(function (x) { return x.id !== s.id; });
          M.matrixAufraeumen(p);
          A.alsGeaendertMarkieren(); neuZeichnen();
          A.toast('Spalte gelöscht.');
          schliessen();
        });
        return false;
      } });
    }
    knoepfe.push({ fuellen: true });
    knoepfe.push({ text: 'Abbrechen' });
    knoepfe.push({ text: istNeu ? 'Anlegen' : 'Übernehmen', klasse: 'haupt', aktion: function (schliessen) {
      if (istNeu && (wahl.art === 'gruppe' || wahl.art === 'mitarbeiter')) {
        var neuerName = String(wahl.neuerName || '').trim();
        var id = wahl.art === 'gruppe' ? wahl.gruppeId : wahl.mitarbeiterId;
        if (!id && !neuerName) { A.toast('Bitte auswählen oder einen Namen eintragen.', 'fehler'); return false; }
        if (neuerName) {
          if (wahl.art === 'gruppe') { id = VPers.gruppeAnlegen(neuerName).id; }
          else {
            var daMa = (p.mitarbeiter || []).filter(function (x) { return String(x.name).trim().toLowerCase() === neuerName.toLowerCase(); })[0];
            if (daMa) id = daMa.id;
            else { A.schrittMerken('Mitarbeiter ' + neuerName + ' angelegt'); var neu = M.neuerMitarbeiter({ name: neuerName }); p.mitarbeiter.push(neu); id = neu.id; }
          }
        }
        if (p.schliessungen.some(function (s2) { return s2.art === wahl.art && (wahl.art === 'gruppe' ? s2.gruppeId === id : s2.mitarbeiterId === id); })) {
          A.toast('Dafür gibt es schon eine Spalte im Plan.', 'fehler'); return false;
        }
        A.schrittMerken('Spalte angelegt');
        var sp = M.spalteFuer(p, wahl.art, id);
        if (String(s.kuerzel || '').trim()) sp.kuerzel = String(s.kuerzel).trim();
        M.spaltenAngleichen(p);
        A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
        A.toast('Spalte angelegt.', 'ok');
        schliessen();
        return false;
      }
      if (wahl.art === 'schliessung' && !s.kuerzel && !s.bezeichnung) {
        A.toast('Bitte Kürzel oder Bezeichnung angeben.', 'fehler'); return false;
      }
      A.schrittMerken(istNeu ? ('Spalte ' + (s.kuerzel || s.bezeichnung) + ' angelegt')
                             : ('Spalte ' + (s.kuerzel || s.bezeichnung) + ' geändert'));
      s.medien = M.medienBereinigen(s.medien);
      if (s.art !== 'schliessung') { s.typ = ''; s.traeger = []; }
      if (istNeu) p.schliessungen.push(s);
      else {
        var i = p.schliessungen.findIndex(function (x) { return x.id === s.id; });
        if (i >= 0) p.schliessungen[i] = s; else p.schliessungen.push(s);
      }
      M.spaltenAngleichen(p);
      A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
      A.toast('Spalte gespeichert.', 'ok');
      schliessen();
      return false;
    } });

    var dialog = A.dialogOeffnen({
      titel: istNeu ? 'Neue Spalte im Plan' : 'Spalte bearbeiten',
      klein: false, inhalt: inhalt, knoepfe: knoepfe
    });
  }

  function schliessungenVerwalten(neuZeichnen) {
    var p = Zustand.projekt;
    var inhalt = el('div');
    function zeichnen() {
      A.leeren(inhalt);
      var sortiert = M.spaltenSortiert(p);
      if (!sortiert.length) { inhalt.appendChild(el('p', { class: 'zart', text: 'Keine Spalten vorhanden.' })); return; }
      inhalt.appendChild(el('p', { class: 'hinweis', style: { marginTop: '0' },
        text: 'Die Reihenfolge lässt sich auch direkt im Plan ändern: Spaltenkopf zwei Sekunden halten und ziehen.' }));
      var tab = el('table');
      tab.appendChild(el('thead', {}, el('tr', {}, [
        el('th', { text: 'Kürzel' }), el('th', { text: 'Bezeichnung' }),
        el('th', { text: 'Art' }), el('th', { text: 'Träger / Mitglieder' }),
        el('th', { class: 'zahl', text: 'Medien' }), el('th', { text: 'Reihenfolge' })
      ])));
      var tb = el('tbody');
      sortiert.forEach(function (s, index) {
        var oeffnen = function () { schliessungBearbeiten(s, neuZeichnen); };
        tb.appendChild(el('tr', { class: 'anklickbar' }, [
          el('td', { onclick: oeffnen, text: s.kuerzel || '—' }),
          el('td', { onclick: oeffnen, text: s.bezeichnung || '' }),
          el('td', { onclick: oeffnen, text: M.spaltenArtText(s) }),
          el('td', { onclick: oeffnen, text: M.traegerText(p, s) || (M.medienBereinigen(s.medien).length ? 'ohne benannten Träger' : '– noch offen –') }),
          el('td', { class: 'zahl', text: String(M.medienAnzahl(p, s)) }),
          el('td', {}, el('div', { class: 'knopfleiste reihenfolge' }, [
            el('button', { class: 'klein nur-symbol', text: '↑', disabled: index === 0, 'aria-label': 'nach links', onclick: function () {
              A.schrittMerken('Reihenfolge der Spalten geändert');
              sortiert.forEach(function (x, i) { x.sort = i; });
              sortiert[index].sort = index - 1; sortiert[index - 1].sort = index;
              A.alsGeaendertMarkieren(); zeichnen(); neuZeichnen();
            } }),
            el('button', { class: 'klein nur-symbol', text: '↓', disabled: index === sortiert.length - 1, 'aria-label': 'nach rechts', onclick: function () {
              A.schrittMerken('Reihenfolge der Spalten geändert');
              sortiert.forEach(function (x, i) { x.sort = i; });
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
      titel: 'Spalten verwalten', inhalt: inhalt,
      knoepfe: [
        { text: '+ Neue Spalte', aktion: function (schliessen) {
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
    /* Standardmäßig aus: ohne die Türspalte bleibt mehr Platz für die
     * Maßspalten, und das ist beim Bestellen das Wichtigere. */
    var materialMitTueren = { wert: false };
    var tuerSchalter = A.schalterFeld(materialMitTueren, 'wert',
      'Türnummern je Position mit ausgeben');

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
          'Bestellgrundlage, gegliedert nach Gewerk und Hersteller. Jede Bauteilart mit ' +
          'ihren eigenen Maßspalten; Artikelnummer und Preis bleiben zum Ausfüllen frei.',
          function () { pdfErzeugen(function () {
            return Reports.materialliste(p, eins, { mitTueren: materialMitTueren.wert });
          }, 'Materialliste'); }, tuerSchalter),
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
          /* Weiß ist hier Absicht: Logos sind für weißen Grund gemacht und
             wären auf dunklem Untergrund oft nicht zu erkennen. */
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

    /* --- Erscheinungsbild --------------------------------------------- */
    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Erscheinungsbild' }),
      el('p', { class: 'hinweis',
        text: 'Die dunkle Darstellung entspricht dem Auftritt von provision-infra.de. ' +
              'Bei Sonne auf der Baustelle ist die helle oft besser abzulesen.' }),
      el('div', { class: 'raster' }, [
        A.auswahlFeld(e, 'erscheinungsbild', 'Darstellung', [
          { id: 'dunkel', label: 'Dunkel  (wie unsere Website)' },
          { id: 'hell',   label: 'Hell  (bei Sonne besser lesbar)' },
          { id: 'geraet', label: 'Wie das Gerät' }
        ], { leerText: '– Dunkel –', beiAenderung: function (wert) {
          merken();
          global.App.darstellungAnwenden(wert || 'dunkel');
        } })
      ]),
      el('p', { class: 'zart', style: { marginTop: '8px' },
        text: 'Die PDF-Ausgaben bleiben davon unberührt – gedruckt wird auf Weiß.' })
    ]));

    /* --- Apple Pencil und Handschrift --------------------------------- */
    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Apple Pencil und Handschrift' }),
      el('p', { class: 'hinweis',
        text: 'Handschrift wird auf dem iPad von „Kritzeln“ umgesetzt – einer Funktion von ' +
              'iPadOS, nicht dieses Werkzeugs. Sie ist in jedem Schreibfeld aktiv: ' +
              'einfach mit dem Stift hineinschreiben, die Schrift wird in Druckschrift ' +
              'umgewandelt. Einzuschalten unter Einstellungen → Apple Pencil → Kritzeln.' }),
      el('div', { style: { marginTop: '6px' } }, [
        A.schalterFeld(e, 'stiftModus', 'Stiftmodus: größere Schreibflächen', function () {
          merken();
          document.body.classList.toggle('stift', e.stiftModus !== false);
        })
      ]),
      el('p', { class: 'zart', style: { marginLeft: '64px', marginTop: '-6px' },
        text: 'Handschrift braucht mehr Platz als eine Tastatureingabe. Im Büro lässt sich ' +
              'der Modus abschalten; die Ansicht wird dann kompakter.' }),
      el('div', { class: 'meldung info', style: { marginTop: '12px' } }, el('div', {}, [
        el('b', { text: 'Ohne Tastatur bedienbar: ' }),
        'Alle festen Maße – Zylinderlängen, Dornmaß, Entfernung, Nuss, Türblattstärke, ' +
        'Stulpmaße, Türmaße – stehen als Auswahl bereit. Stückzahlen werden über – und + ' +
        'gestellt. Getippt oder geschrieben werden muss nur noch, was wirklich frei ist: ' +
        'Bezeichnungen, Namen und Bemerkungen.'
      ]))
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
    var pdDiagnose = el('div', { style: { marginTop: '12px' } });
    seite.appendChild(pdBereich);
    pdZeichnen();

    function pdZeichnen(pruefErgebnis) {
      A.leeren(pdBereich);
      A.leeren(pdDiagnose);
      pdBereich.appendChild(el('h2', { text: 'Pipedrive' }));
      pdBereich.appendChild(el('p', { class: 'hinweis',
        text: 'Mit einer Verbindung zu Pipedrive lässt sich ein Aufmaß direkt aus einem Deal anlegen. ' +
              'Das Werkzeug liest dabei ausschließlich – es verändert in Pipedrive nichts.' }));

      /* Liegt der Schlüssel auf dem Server, braucht dieses Gerät keinen -
         und soll auch keinen mehr haben. */
      var ueberServer = global.Pipedrive.quelle(e) === 'server';
      if (ueberServer) {
        pdBereich.appendChild(el('div', { class: 'meldung ok', style: { marginTop: '4px' } },
          el('div', {}, [
            el('b', { text: 'Über den Server verbunden.' }),
            el('div', { style: { marginTop: '4px', fontSize: '13.5px' },
              text: 'Der Pipedrive-Schlüssel liegt in WordPress (Einstellungen → Aufmaß-Abgleich) und ' +
                    'verlässt den Server nicht. Auf diesem Gerät ist kein Schlüssel nötig.' +
                    (global.Pipedrive.hostAus(e) !== global.Pipedrive.STANDARD_HOST
                      ? ('  ·  Adresse: ' + global.Pipedrive.hostAus(e)) : '') })
          ])));
        if (e.pipedriveToken) {
          pdBereich.appendChild(el('div', { class: 'meldung warn' }, el('div', {}, [
            el('b', { text: 'Auf diesem Gerät liegt noch ein Schlüssel. ' }),
            'Er wird nicht mehr gebraucht - der Server hat Vorrang. ',
            el('button', { class: 'klein', style: { marginLeft: '8px' }, text: 'Vom Gerät entfernen',
              onclick: function () {
                e.pipedriveToken = ''; e.pipedriveHost = '';
                merken(); pdZeichnen();
                A.toast('Schlüssel von diesem Gerät entfernt.', 'ok');
              } })
          ])));
        }
      }

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

      if (!ueberServer) {
        pdBereich.appendChild(el('div', { class: 'raster' }, [
          /* Über A.feld, damit die Beschriftung auf das Feld zeigt - sonst
             setzt ein Tippen darauf den Cursor nicht hinein. */
          A.feld('Zugriffsschlüssel <span class="einheit">(API-Token)</span>',
            el('div', { class: 'feld-mit-knopf' }, [
              tokenFeld,
              el('div', { class: 'knopfleiste', style: { marginTop: '6px' } }, [zeigen])
            ])),
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
            'abhandenkommt. Sie finden ihn unter: Einstellungen → Persönliche Einstellungen → API. ' +
            'In der gemeinsamen Fassung lässt sich der Schlüssel stattdessen einmal in WordPress ' +
            'hinterlegen - dann braucht kein Gerät einen.'
          ])));
      }

      pdBereich.appendChild(el('div', { class: 'knopfleiste', style: { marginTop: '12px' } }, [
        el('button', { class: 'haupt', text: 'Verbindung prüfen', onclick: function (ev) {
          if (!global.Pipedrive.quelle(e)) { A.toast('Bitte zuerst den Schlüssel eintragen.', 'fehler'); return; }
          ev.target.disabled = true; ev.target.textContent = 'Prüfe …';
          global.Pipedrive.verbindungPruefen(e).then(function (benutzer) {
            return global.Pipedrive.pipelines(e).then(function (liste) {
              pdZeichnen({ gut: true, benutzer: benutzer, pipelines: liste });
            });
          }).catch(function (fehler) {
            pdZeichnen({ gut: false, fehler: fehler });
          });
        } }),
        (e.pipedriveToken && !ueberServer) ? el('button', { class: 'gefahr', text: 'Verbindung entfernen', onclick: function () {
          A.bestaetigen('Verbindung entfernen?',
            'Der Zugriffsschlüssel wird von diesem Gerät gelöscht. In Pipedrive selbst ändert sich nichts.',
            'Entfernen').then(function (ja) {
            if (!ja) return;
            e.pipedriveToken = ''; e.pipedrivePipelineId = ''; e.pipedrivePipelineName = '';
            e.pipedrivePhaseId = ''; e.pipedrivePhaseName = '';
            merken(); pdZeichnen();
            A.toast('Verbindung entfernt.');
          });
        } }) : null,
        global.Pipedrive.quelle(e) ? el('button', { text: 'Deals prüfen',
          title: 'Zeigt, welche Deals Pipedrive liefert und warum sie angeboten werden oder nicht',
          onclick: function (ev) {
            global.ViewsProjekt.diagnoseLaufenLassen(ev.target, pdDiagnose);
          } }) : null
      ]));
      pdBereich.appendChild(pdDiagnose);

      if (!pruefErgebnis) {
        if (e.pipedrivePipelineName) {
          pdBereich.appendChild(el('p', { class: 'zart', style: { marginTop: '10px' },
            text: 'Gewählt: ' + e.pipedrivePipelineName +
                  (e.pipedrivePhaseName ? ('  ·  Phase ' + e.pipedrivePhaseName) : '') }));
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
          e.pipedrivePhaseId = ''; e.pipedrivePhaseName = '';   /* Phase gehört zur Pipeline */
          merken();
          phasenLaden();
        }
      });
      auswahl.appendChild(el('option', { value: '', text: '– alle Pipelines –' }));
      (pruefErgebnis.pipelines || []).forEach(function (pl) {
        auswahl.appendChild(el('option', { value: pl.id, text: pl.name }));
      });
      auswahl.value = e.pipedrivePipelineId || '';

      var phasenBereich = el('div');
      pdBereich.appendChild(el('div', { class: 'raster', style: { marginTop: '12px' } }, [
        A.feld('Pipeline <span class="einheit">(z. B. Neukunden Funnel)</span>', auswahl)
      ]));
      pdBereich.appendChild(phasenBereich);
      phasenLaden();

      function phasenLaden() {
        A.leeren(phasenBereich);
        if (!e.pipedrivePipelineId) {
          phasenBereich.appendChild(el('p', { class: 'zart', style: { marginTop: '8px' },
            text: 'Wählen Sie eine Pipeline, um die Phase festzulegen.' }));
          return;
        }
        phasenBereich.appendChild(el('p', { class: 'zart', text: 'Phasen werden geladen …' }));
        global.Pipedrive.phasen(e, e.pipedrivePipelineId).then(function (liste) {
          A.leeren(phasenBereich);
          var pa = el('select', {
            onchange: function (ev) {
              e.pipedrivePhaseId = ev.target.value;
              var gew = liste.filter(function (ph) { return String(ph.id) === String(ev.target.value); })[0];
              e.pipedrivePhaseName = gew ? gew.name : '';
              merken();
              regelAnzeigen();
            }
          });
          pa.appendChild(el('option', { value: '', text: '– alle Phasen –' }));
          liste.forEach(function (ph) { pa.appendChild(el('option', { value: ph.id, text: ph.name })); });
          pa.value = e.pipedrivePhaseId || '';
          phasenBereich.appendChild(el('div', { class: 'raster' }, [
            A.feld('Phase <span class="einheit">(z. B. Workshop / Aufmaß v.O.)</span>', pa)
          ]));
          regelAnzeigen();

          function regelAnzeigen() {
            var alt2 = phasenBereich.querySelector('.regel-anzeige');
            if (alt2) alt2.remove();
            var kasten = el('div', { class: 'meldung info regel-anzeige', style: { marginTop: '12px' } });
            kasten.appendChild(el('div', {}, [
              el('b', { text: 'Wann ein Aufmaß entsteht' }),
              el('div', { style: { marginTop: '6px', fontSize: '13.5px' }, text:
                'Ein Deal wird zur Übernahme angeboten, wenn er in der Pipeline „' +
                (e.pipedrivePipelineName || 'alle') + '“' +
                (e.pipedrivePhaseName ? (' in der Phase „' + e.pipedrivePhaseName + '“') : '') +
                ' steht, offen ist und noch kein Aufmaß dazu vorliegt. Ob er dort neu angelegt ' +
                'oder hineingeschoben wurde, spielt keine Rolle – maßgeblich ist, wo er jetzt steht.' }),
              el('div', { style: { marginTop: '8px', fontSize: '13.5px' }, text:
                'Angelegt wird das Aufmaß dabei nicht von selbst: Öffnen Sie „Projekte“, tippen Sie ' +
                'auf „Aus Pipedrive“ und wählen Sie den Deal aus. Erst dieser Schritt erzeugt das ' +
                'Aufmaß. Eine Anlage ohne Zutun setzt einen Zwischendienst voraus, der ständig ' +
                'erreichbar ist – den gibt es hier bewusst noch nicht.' }),
              !e.pipedrivePhaseId ? el('div', { style: { marginTop: '6px', fontSize: '13px' },
                text: 'Ohne gewählte Phase werden alle offenen Deals der Pipeline angeboten.' }) : null
            ]));
            phasenBereich.appendChild(kasten);
          }
        }).catch(function (fehler) {
          A.leeren(phasenBereich);
          phasenBereich.appendChild(el('div', { class: 'meldung fehler', style: { marginTop: '8px' } },
            el('div', { text: fehler.message || 'Die Phasen konnten nicht geladen werden.' })));
        });
      }
    }

    /* --- Eigene Katalogeinträge --- */
    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Eigene Katalogeinträge' }),
      el('p', { class: 'hinweis', text: 'Ergänzen Sie hier Bauformen, die in den mitgelieferten Listen fehlen. Ausführungen wie Freidreh oder Anti-Panik werden getrennt gewählt und müssen nicht in die Bauform geschrieben werden.' }),
      listenPflege('eigeneZylinderarten', 'Zylinder-Bauformen', e, merken),
      listenPflege('eigeneBeschlagarten', 'Beschlag-Bauformen', e, merken),
      listenPflege('eigeneSchlossarten', 'Schloss-Bauformen', e, merken)
    ]));

    /* --- Über --- */
    var Ab = global.Abgleich ? global.Abgleich.zustand() : null;
    var Akt = global.Aktualisierung;
    var ablage = Akt && Akt.eingerichtet()
      ? 'eingerichtet - das Werkzeug startet auch ohne Netz'
      : (location.protocol.indexOf('http') === 0 ? 'noch nicht eingerichtet' : 'nicht nötig (lokale Datei)');
    var pruefKnopf = Akt ? el('button', { class: 'klein', text: 'Auf neue Fassung prüfen', onclick: function (ev) {
      ev.target.disabled = true;
      Akt.pruefen().then(function (ging) {
        ev.target.disabled = false;
        A.toast(ging ? 'Geprüft. Liegt eine neue Fassung vor, erscheint oben ein Hinweis oder das Werkzeug startet neu.'
                     : 'Prüfen ist hier nicht möglich (keine Offline-Ablage).', ging ? 'ok' : 'fehler');
      });
    } }) : null;
    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Über dieses Werkzeug' }),
      el('p', { class: 'hinweis', text:
        'Aufmaß-Tool für Schließanlagen und Zutrittslösungen. Läuft vollständig im Browser; ' +
        'alle Daten verbleiben auf diesem Gerät und werden nirgendwohin übertragen. ' +
        'Die PDF-Erzeugung erfolgt lokal und benötigt keine Internetverbindung.' }),
      /* Welche Fassung läuft auf diesem Gerät? Nach einer Aktualisierung
         sieht man hier in einer Sekunde, ob sie angekommen ist. */
      el('ul', { class: 'liste-schlicht' }, [
        el('li', { id: 'fassung-werkzeug', text: 'Fassung des Werkzeugs: ' + A.FASSUNG }),
        Ab ? el('li', { text: 'Server-Plugin: ' + (Ab.angemeldet && Ab.serverVersion ? Ab.serverVersion
                                                   : (Ab.angemeldet ? 'unbekannt' : 'erst nach Anmeldung sichtbar')) }) : null,
        el('li', { text: 'Offline-Ablage: ' + ablage }),
        el('li', { text: 'Speicherart: ' + (Store.nutztFallback() ? 'Browserspeicher (eingeschränkt)' : 'IndexedDB') })
      ]),
      Akt ? el('p', { class: 'hinweis', text: 'Nach dem Einspielen einer neuen Fassung holt das Werkzeug sie beim nächsten Start mit Netz von selbst. ' +
        'Erscheint oben der Hinweis „Neue Fassung“, einmal auf „Jetzt neu starten“ tippen.' }) : null,
      el('div', { class: 'knopfleiste', style: { marginTop: '10px' } }, [
        pruefKnopf,
        el('button', { class: 'gefahr', text: 'Einstellungen zurücksetzen', onclick: function () {
          A.bestaetigen('Einstellungen zurücksetzen?',
            'Firmenkopf, Logo und eigene Katalogeinträge werden entfernt. Projekte bleiben erhalten.',
            'Zurücksetzen').then(function (ja) {
            if (!ja) return;
            Zustand.einstellungen = Store.einstellungenStandard();
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
