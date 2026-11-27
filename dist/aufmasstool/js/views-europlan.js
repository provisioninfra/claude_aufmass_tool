/* =============================================================================
 * views-europlan.js — Der Schließplan in der Schreibweise der Hersteller
 *
 * Zweite Sicht auf denselben Plan (Modell in europlan.js): Zeilen sind
 * Zylinder mit Zyl.Nr., Stückzahl, ESL und Type, Spalten die übergeordneten
 * Schlüssel (X) und die Gruppen (I/Z/M). Jede Änderung hier schreibt in den
 * Kreuzschließplan - beide Ansichten zeigen immer denselben Stand.
 * ========================================================================== */
(function (global) {
  'use strict';
  var A = global.AppKern, K = global.Katalog, M = global.Model, Store = global.Store;
  var el = A.el, Zustand = A.Zustand;

  function E() { return global.Europlan; }

  var ZEICHEN_KLASSE = { X: 'euro-x', I: 'euro-i', Z: 'euro-z', M: 'euro-m', O: 'euro-o' };

  function merken(beschreibung) { A.schrittMerken(beschreibung); }
  function fertig() { A.alsGeaendertMarkieren(); A.speichern(); }

  /* --- kleine Dialoge ------------------------------------------------------ */
  function zahlDialog(titel, text, wert, optionen, beiWert) {
    optionen = optionen || {};
    var o = { wert: wert === null || wert === undefined ? '' : wert };
    var inhalt = el('div', {}, [
      text ? el('p', { class: 'hinweis', text: text }) : null,
      A.zahlFeld(o, 'wert', optionen.beschriftung || 'Anzahl', { min: optionen.min || 0, max: optionen.max || 999, vorgabe: optionen.vorgabe })
    ]);
    var dlg = A.dialogOeffnen({ titel: titel, inhalt: inhalt, klein: true, knoepfe: [
      optionen.leerText ? { text: optionen.leerText, aktion: function (schliessen) { beiWert(null); schliessen(); return false; } } : null,
      { fuellen: true }, { text: 'Abbrechen' },
      { text: 'Übernehmen', klasse: 'haupt', aktion: function (schliessen) {
        var n = parseInt(o.wert, 10);
        if (!isFinite(n)) { A.toast('Bitte eine Zahl eintragen.', 'fehler'); return false; }
        beiWert(n); schliessen(); return false;
      } }
    ].filter(Boolean) });
    setTimeout(function () { var f = dlg.kasten.querySelector('input'); if (f) { f.focus(); f.select(); } }, 60);
  }

  function textDialog(titel, text, wert, beschriftung, beiWert) {
    var o = { wert: wert || '' };
    var inhalt = el('div', {}, [ text ? el('p', { class: 'hinweis', text: text }) : null, A.textFeld(o, 'wert', beschriftung || 'Text') ]);
    var dlg = A.dialogOeffnen({ titel: titel, inhalt: inhalt, klein: true, knoepfe: [
      { fuellen: true }, { text: 'Abbrechen' },
      { text: 'Übernehmen', klasse: 'haupt', aktion: function (schliessen) { beiWert(String(o.wert || '').trim()); schliessen(); return false; } }
    ] });
    setTimeout(function () { var f = dlg.kasten.querySelector('input'); if (f) { f.focus(); f.select(); } }, 60);
  }

  /* Auswahl aus wenigen Möglichkeiten - große Knöpfe, für den Finger */
  function wahlDialog(titel, text, moeglichkeiten, beiWahl) {
    var liste = el('div', { class: 'wahl-liste' });
    moeglichkeiten.forEach(function (m) {
      liste.appendChild(el('button', { type: 'button', class: 'wahl' + (m.aktiv ? ' aktiv' : '') + (m.klasse ? ' ' + m.klasse : ''), onclick: function () { dlg.schliessen(); beiWahl(m.wert, m); } }, [
        el('b', { text: m.zeichen === '' ? '·' : (m.zeichen !== undefined ? m.zeichen : m.text) }),
        el('span', { text: m.zeichen !== undefined ? m.text : (m.untertitel || '') })
      ]));
    });
    var dlg = A.dialogOeffnen({ titel: titel, inhalt: el('div', {}, [ text ? el('p', { class: 'hinweis', text: text }) : null, liste ]), klein: true, knoepfe: [{ fuellen: true }, { text: 'Abbrechen' }] });
    return dlg;
  }

  /* Inhaber des Eigenschlüssels anlegen: Name, Stückzahl, Art des Mediums */
  function inhaberDialog(p, tuer, beiFertig) {
    var arten = M.identmedienAuswahl(p, (Zustand.einstellungen && Zustand.einstellungen.eigeneSysteme) || []);
    var o = { name: String(tuer.bezeichnung || tuer.nummer || ''), anzahl: 3, typ: arten[0] || '' };
    var inhalt = el('div', {}, [
      el('p', { class: 'hinweis', text: 'Tür ' + (tuer.nummer || '') + ' ' + (tuer.bezeichnung || '') + ' bekommt einen Eigenschlüssel. Wer erhält ihn, und wie viele Stück? Der Inhaber erscheint als Mitarbeiter mit eigener Spalte im Kreuzschließplan.' }),
      el('div', { class: 'raster' }, [
        A.textFeld(o, 'name', 'Inhaber (Name)', { platzhalter: 'z. B. Mieter Wohnung 3', autocapitalize: 'words' }),
        A.zahlFeld(o, 'anzahl', 'Stückzahl Schlüssel (ESL)', { min: 1, max: 999, vorgabe: 3 }),
        arten.length ? A.auswahlFeld(o, 'typ', 'Art des Mediums', arten, { leerText: '– noch offen –' }) : A.textFeld(o, 'typ', 'Art des Mediums', { platzhalter: 'z. B. Schlüssel' })
      ])
    ]);
    var dlg = A.dialogOeffnen({ titel: 'Eigenschlüssel vergeben', inhalt: inhalt, knoepfe: [
      { fuellen: true }, { text: 'Abbrechen' },
      { text: 'Anlegen', klasse: 'haupt', aktion: function (schliessen) {
        if (!String(o.name || '').trim()) { A.toast('Bitte einen Namen eintragen.', 'fehler'); return false; }
        beiFertig({ name: o.name, anzahl: o.anzahl, typ: o.typ }); schliessen(); return false;
      } }
    ] });
    setTimeout(function () { var f = dlg.kasten.querySelector('input'); if (f) { f.focus(); f.select(); } }, 60);
  }

  /* --- Der Umschalter zwischen den beiden Sichten -------------------------- */
  function darstellung() {
    if (!Zustand.planDarstellung) {
      var gemerkt = '';
      try { gemerkt = global.localStorage ? (global.localStorage.getItem('aufmass.planDarstellung') || '') : ''; } catch (e) { gemerkt = ''; }
      Zustand.planDarstellung = gemerkt === 'euro' ? 'euro' : 'kreuz';
    }
    return Zustand.planDarstellung;
  }
  function darstellungSetzen(wert) {
    Zustand.planDarstellung = wert === 'euro' ? 'euro' : 'kreuz';
    try { if (global.localStorage) global.localStorage.setItem('aufmass.planDarstellung', Zustand.planDarstellung); } catch (e) {}
  }
  function schalter(neuZeichnen) {
    var jetzt = darstellung();
    function knopf(wert, text) {
      return el('button', { type: 'button', class: 'segment' + (jetzt === wert ? ' aktiv' : ''), 'aria-pressed': jetzt === wert ? 'true' : 'false',
        'data-darstellung': wert, text: text, onclick: function () { if (darstellung() === wert) return; darstellungSetzen(wert); neuZeichnen(); } });
    }
    return el('div', { class: 'segmente plan-schalter', role: 'group', 'aria-label': 'Darstellung des Schließplans' }, [
      knopf('kreuz', 'Kreuzschließplan'), knopf('euro', 'Europlan')
    ]);
  }

  /* --- Excel im EVVA-Formular --------------------------------------------- */
  function excelExport(art) {
    var p = Zustand.projekt;
    if (!p) { A.toast('Kein Aufmaß geöffnet.', 'fehler'); return; }
    var X = global.XLSX;
    if (!X || !E()) { A.toast('Die Excel-Ausgabe steht in dieser Fassung nicht zur Verfügung.', 'fehler'); return; }
    var mappe, name;
    try {
      mappe = E().evvaMappe(p, Zustand.einstellungen || {}, art);
      mappe.titel = (art === 'kreuz' ? 'Kreuzschließplan ' : 'Europlan ') + (p.kunde || p.name || '');
      name = E().dateiName(p, art);
    } catch (fehler) { console.error(fehler); A.toast('Excel-Ausgabe fehlgeschlagen: ' + fehler.message, 'fehler'); return; }
    Store.dateiHerunterladen(X.alsBlob(mappe), name, X.MIME).then(function (stand) {
      if (stand === 'abgelehnt') { A.toast('Speichern abgebrochen.'); return; }
      A.toast('EVVA-Formular erzeugt: ' + mappe.anzahlZeilen + ' Zylinder, ' + mappe.anzahlSpalten + ' Schlüsselspalten.', 'ok');
      /* Hinweise (Kürzungen, ausgelassene Zeilen) gehören in ein Fenster zum
         Nachlesen, nicht in eine Meldung, die nach Sekunden verschwindet und
         bis dahin den halben Bildschirm deckt. */
      if (mappe.warnungen.length) {
        A.dialogOeffnen({
          titel: 'Hinweise zum EVVA-Formular', klein: true,
          inhalt: el('div', {}, [
            el('p', { class: 'hinweis', style: { marginTop: '0' }, text: 'Die Datei „' + name + '“ wurde gespeichert. Beim Übertragen in das Formular fiel Folgendes auf:' }),
            el('ul', { class: 'hinweisliste' }, mappe.warnungen.map(function (w) { return el('li', { text: w }); }))
          ]),
          knoepfe: [{ fuellen: true }, { text: 'Verstanden', klasse: 'haupt' }]
        });
      }
    }).catch(function (fehler) { A.toast(fehler.message || 'Speichern fehlgeschlagen.', 'fehler'); });
  }

  /* --- Die Ansicht ---------------------------------------------------------- */
  function zeichnen(seite, p, neuZeichnen) {
    var VPers = global.ViewsPersonen, VPlan = global.ViewsPlan;
    var plan = E().europlan(p);

    seite.appendChild(el('p', { class: 'hinweis', text:
      'Zeilen sind die Zylinder, Spalten die übergeordneten Schlüssel (X) und die Gruppen der Eigenschlüssel (I = gehört zur Gruppe, ' +
      'Z = Zentralzylinder, M = Mitschließung, O = vorgeplant). Zyl.Nr. ist die Türnummer; gleichschließende Türen tragen dieselbe Zyl.Nr. wie ihre Haupttür. ' +
      'Alles, was Sie hier setzen, steht sofort auch im Kreuzschließplan.' }));

    seite.appendChild(el('div', { class: 'werkzeugleiste links', style: { marginBottom: '12px' } }, [
      el('button', { class: 'haupt', text: '+ Tür / Zylinder', onclick: function () { tuerDialog(p, neuZeichnen); } }),
      el('button', { text: '+ Schlüssel (X-Spalte)', title: 'Übergeordneter Schlüssel: Schließung mit Rang im Plan', onclick: function () { VPlan.schliessungBearbeiten(null, neuZeichnen); } }),
      el('button', { text: '+ Gruppe (I/Z-Spalte)', title: 'Gruppe von Eigenschlüsseln, z. B. alle Mieter', onclick: function () { VPers.gruppeBearbeiten(null, neuZeichnen); } }),
      el('button', { text: 'Excel (EVVA-Formular)', title: 'Europlan als EVVA-Bestellformular (.xlsx)', onclick: function () { excelExport('euro'); } })
    ]));

    var hinweisKnoten = el('div');
    seite.appendChild(hinweisKnoten);
    function hinweiseZeichnen() {
      A.leeren(hinweisKnoten);
      if (plan.hinweise.length) {
        hinweisKnoten.appendChild(el('div', { class: 'meldung info' }, el('div', {}, plan.hinweise.map(function (h) { return el('div', { text: '• ' + h }); }))));
      }
    }
    hinweiseZeichnen();

    if (!p.tueren.length) {
      seite.appendChild(el('div', { class: 'leer' }, [
        el('h3', { text: 'Noch keine Zylinder im Plan' }),
        el('p', { text: 'Legen Sie Türen über „+ Tür / Zylinder“ an oder erfassen Sie sie im Aufmaß. Jede Tür ist eine Zeile des Plans.' })
      ]));
      seite.appendChild(VPers.listenKarte(neuZeichnen));
      return;
    }

    var rahmen = el('div', { class: 'matrix-rahmen europlan-rahmen' });
    var rollLage = { x: 0, y: 0 };
    seite.appendChild(A.scrollHinweis(rahmen));

    function tabelleZeichnen() {
      plan = E().europlan(p);
      hinweiseZeichnen();
      A.leeren(rahmen);
      rahmen.appendChild(tabelleBauen(plan));
      rahmen.scrollLeft = rollLage.x; rahmen.scrollTop = rollLage.y;
    }
    function aendern(beschreibung, aktion) {
      rollLage = { x: rahmen.scrollLeft, y: rahmen.scrollTop };
      merken(beschreibung);
      var e = aktion();
      fertig();
      tabelleZeichnen();
      return e;
    }

    function tabelleBauen(plan) {
      var tabelle = el('table', { class: 'matrix europlan' });
      A.tastenNavigation(tabelle, 'td.zelle');
      var linke = [
        { k: 'zp', t: 'ZP', tip: 'laufende Zeile' }, { k: 'nr', t: 'Tür.Nr.' }, { k: 'raum', t: 'Raumbezeichnung' },
        { k: 'stk', t: 'Stk.', tip: 'Bestellmenge Zylinder' }, { k: 'esl', t: 'ESL', tip: 'Eigenschlüssel: Stückzahl (leer = kein Eigenschlüssel, 0 = vorgeplant)' },
        { k: 'type', t: 'Type (Produktcode)' }, { k: 'zyl', t: 'Zyl.Nr.', tip: 'Zylindernummer = Türnummer der Haupttür; gleichschließende Zylinder tragen dieselbe Nummer' }
      ];
      var kopf1 = el('tr', { class: 'funktion' }), kopf2 = el('tr', { class: 'menge' }), kopf3 = el('tr', { class: 'schlnr' });
      kopf1.appendChild(el('th', { class: 'ecke', colspan: linke.length, rowspan: 2, text: 'Funktion / Menge / Schl.Nr →' }));
      linke.forEach(function (l) { kopf3.appendChild(el('th', { class: 'links ' + l.k, text: l.t, title: l.tip || '' })); });
      var laengster = plan.spalten.reduce(function (max, s) { return Math.max(max, String(s.funktion || '').length); }, 0);
      tabelle.style.setProperty('--kopfhoehe', Math.min(200, Math.max(70, laengster * 7.2 + 30)) + 'px');
      plan.spalten.forEach(function (sp) {
        var s = sp.spalte;
        var titel = sp.funktion || sp.schlNr || '–';
        kopf1.appendChild(el('th', { class: 'spaltenkopf art-' + s.art, title: titel + ' · antippen: Spalte bearbeiten', onclick: function () {
            if (sp.art === 'gruppe') { var g = M.gruppeVon(p, s.gruppeId); if (g) VPers.gruppeBearbeiten(g, neuZeichnen); }
            else VPlan.schliessungBearbeiten(s, neuZeichnen);
          }, style: { cursor: 'pointer' } }, [
          el('span', { class: 'dreh', text: titel }),
          el('span', { class: 'art', text: sp.art === 'gruppe' ? 'Gruppe' : (s.art === 'mitarbeiter' ? 'Mitarb.' : (s.typ ? String(s.typ).toUpperCase() : '')) })
        ]));
        kopf2.appendChild(el('th', { class: 'menge', text: sp.menge > 0 ? String(sp.menge) : '', title: sp.art === 'gruppe' ? 'Stück Gruppenschlüssel (Mitglieder ohne eigene Tür)' : 'Stück Schlüssel' }));
        kopf3.appendChild(el('th', { class: 'schlnr', text: sp.schlNr || '', title: 'Schlüsselnummer' }));
      });
      tabelle.appendChild(el('thead', {}, [kopf1, kopf2, kopf3]));

      var koerper = el('tbody');
      var bereich = null, lfd = 0;
      plan.zeilen.forEach(function (z) {
        if (z.bereich !== bereich) {
          bereich = z.bereich;
          koerper.appendChild(el('tr', { class: 'gruppenzeile' }, [el('td', { colspan: linke.length + plan.spalten.length }, el('span', { class: 'gruppen-titel', text: bereich }))]));
        }
        var t = z.tuer; lfd++;
        var zeile = el('tr', { class: z.mitlaeufer ? 'mitlaeufer' : '' });
        zeile.appendChild(el('td', { class: 'links zp', text: String(lfd) }));
        zeile.appendChild(el('td', { class: 'links nr klickbar', text: t.nummer || '—', title: 'Tür bearbeiten', onclick: function () { global.ViewsTueren.tuerBearbeiten(t, neuZeichnen); } }));
        zeile.appendChild(el('td', { class: 'links raum klickbar', text: t.bezeichnung || '', title: 'Tür bearbeiten', onclick: function () { global.ViewsTueren.tuerBearbeiten(t, neuZeichnen); } }));
        zeile.appendChild(el('td', { class: 'links stk klickbar', text: String(z.stk), title: 'Stückzahl ändern', onclick: function () {
          zahlDialog('Stückzahl Zylinder', 'Wie viele baugleiche Zylinder für ' + (t.nummer || t.bezeichnung) + '?', z.stk, { min: 1, max: 999, vorgabe: 1 }, function (n) {
            aendern('Stückzahl ' + (t.nummer || t.bezeichnung), function () { t.anzahl = Math.max(1, n || 1); });
          });
        } }));
        var eslText = z.esl === null ? '' : String(z.esl);
        zeile.appendChild(el('td', { class: 'links esl' + (z.mitlaeufer ? '' : ' klickbar'), text: eslText,
          title: z.mitlaeufer ? 'Eigenschlüssel wird an der Haupttür ' + (z.basis.nummer || '') + ' geführt' : (z.inhaber.length ? 'Eigenschlüssel von ' + z.inhaber.map(function (i) { return i.m.name; }).join(', ') : 'Eigenschlüssel ohne Inhaber'),
          onclick: function () { if (!z.mitlaeufer) eslDialog(p, z, aendern); } }));
        zeile.appendChild(el('td', { class: 'links type klickbar', text: z.produktcode || '', title: 'Type / Produktcode ändern (leer = aus den Zylinderangaben)', onclick: function () {
          textDialog('Type / Produktcode', 'Leer lassen, dann wird der Code aus Bauform, Längen und Ausführung der Tür gebildet: ' + (M.produktcode(p, Object.assign({}, t, { produktcode: '' })) || '–'), t.produktcode, 'Produktcode', function (w) {
            aendern('Produktcode ' + (t.nummer || t.bezeichnung), function () { t.produktcode = w; });
          });
        } }));
        zeile.appendChild(el('td', { class: 'links zyl klickbar' + (z.mitlaeufer ? ' gleich' : ''), text: z.zylNr,
        title: z.mitlaeufer ? 'Gleichschließend mit Tür ' + (z.basis.nummer || '') + ' (dieselbe Zyl.Nr.) · antippen: Gleichschließung ändern' : 'Gleichschließung festlegen', onclick: function () { zylDialog(p, t, aendern); } }));

        plan.spalten.forEach(function (sp) {
          var zeichen = z.zellen[sp.id] || '';
          var zelle = el('td', { class: 'zelle' + (zeichen ? ' ' + ZEICHEN_KLASSE[zeichen] : ''), text: zeichen, title: (t.nummer || '') + ' / ' + (sp.schlNr || sp.funktion),
            onclick: function () { zelleAntippen(p, z, sp, zeichen, aendern); } });
          zeile.appendChild(zelle);
        });
        koerper.appendChild(zeile);
      });
      tabelle.appendChild(koerper);
      return tabelle;
    }
    tabelleZeichnen();

    var legende = el('div', { class: 'matrix-legende' });
    [['X', 'sperrt'], ['I', 'Eigenschlüssel gehört zur Gruppe'], ['Z', 'Zentralzylinder (alle der Gruppe)'], ['M', 'Mitschließung'], ['O', 'vorgeplant']].forEach(function (x) {
      legende.appendChild(el('span', {}, [el('b', { text: x[0] }), x[1]]));
    });
    legende.appendChild(el('span', { text: 'Zelle antippen: Zeichen wählen · Zyl.Nr. antippen: gleichschließend · ESL antippen: Eigenschlüssel' }));
    seite.appendChild(legende);
    seite.appendChild(VPers.listenKarte(neuZeichnen));
  }

  /* --- Zellen bearbeiten --------------------------------------------------- */
  function zelleAntippen(p, z, sp, zeichen, aendern) {
    var t = z.tuer;
    if (sp.art !== 'gruppe') {
      var folge = ['', 'X', 'O'];
      var naechst = folge[(folge.indexOf(zeichen) + 1) % folge.length];
      aendern('Europlan: ' + (t.nummer || t.bezeichnung) + ' / ' + (sp.schlNr || sp.funktion), function () { return E().zelleSetzen(p, t.id, sp.id, naechst); });
      return;
    }
    var moeglich = E().moeglicheZeichen(p, t.id, sp.id);
    var texte = {
      '': z.mitlaeufer ? 'keine Berechtigung der Gruppe' : (zeichen === 'I' ? 'Eigenschlüssel aus der Gruppe nehmen' : 'keine Berechtigung der Gruppe'),
      I: 'Eigenschlüssel dieser Tür gehört zur Gruppe' + (z.inhaber.length ? ' (' + z.inhaber.map(function (i) { return i.m.name; }).join(', ') + ')' : ' – Inhaber wird angelegt'),
      Z: 'Zentralzylinder: alle Schlüssel der Gruppe sperren' + (z.inhaber.some(function (i) { return i.gruppen.some(function (gg) { return gg.id === sp.id; }); }) ? ' - der Inhaber (' + z.inhaber.map(function (i) { return i.m.name; }).join(', ') + ') bekommt eine eigene Spalte' : ''),
      M: 'Mitschließung: die Gruppe sperrt diesen Zylinder mit eigenem Schlüssel zusätzlich mit',
      O: 'vorgeplant (Reserve): vorbereitet, sperrt noch nicht'
    };
    wahlDialog((t.nummer || '') + ' ' + (t.bezeichnung || '') + ' × ' + (sp.funktion || sp.schlNr), z.mitlaeufer ? 'Gleichschließend mit ' + (z.basis.nummer || '') + ': Der Eigenschlüssel wird dort geführt.' : null,
      moeglich.map(function (m) { return { wert: m, zeichen: m, text: texte[m] || '', aktiv: m === zeichen }; }),
      function (wahl) {
        var e = aendern('Europlan: ' + (t.nummer || t.bezeichnung) + ' / ' + (sp.schlNr || sp.funktion), function () { return E().zelleSetzen(p, t.id, sp.id, wahl); });
        if (e && e.ok && e.hinweis) A.toast(e.hinweis, 'ok');
        if (e && e.braucht === 'inhaber') {
          inhaberDialog(p, t, function (angaben) {
            aendern('Eigenschlüssel ' + (t.nummer || t.bezeichnung), function () { return E().zelleSetzen(p, t.id, sp.id, 'I', { inhaber: angaben }); });
            A.toast('Eigenschlüssel vergeben: ' + angaben.name, 'ok');
          });
        } else if (e && e.ok === false && e.text) {
          A.toast(e.text, 'fehler');
        }
      });
  }

  function eslDialog(p, z, aendern) {
    var t = z.tuer;
    var wer = z.inhaber.length ? ('Inhaber: ' + z.inhaber.map(function (i) { return i.m.name + ' (' + M.mitarbeiterMedienAnzahl(i.m) + '×)'; }).join(', ')) : 'Ohne Inhaber: Der Eigenschlüssel wird als Einzelschließung geführt.';
    zahlDialog('Eigenschlüssel ' + (t.nummer || '') + ' ' + (t.bezeichnung || ''), wer + ' Stückzahl der Eigenschlüssel; 0 heißt vorgeplant ohne Schlüssel.', z.esl, { min: 0, max: 999, vorgabe: 3, beschriftung: 'Stückzahl (ESL)', leerText: z.inhaber.length ? null : 'Kein Eigenschlüssel' }, function (n) {
      var e = aendern('ESL ' + (t.nummer || t.bezeichnung), function () { return E().eslSetzen(p, t.id, n); });
      if (e && e.ok === false && e.text) A.toast(e.text, 'fehler');
    });
  }

  function zylDialog(p, t, aendern) {
    var basis = M.basisTuer(p, t) || t;
    var eigene = M.schliessungsTueren(p, t).map(function (x) { return x.id; });
    var kandidaten = p.tueren.filter(function (x) { return eigene.indexOf(x.id) === -1 && !M.istMitlaeufer(p, x); });
    var moeglichkeiten = [{ wert: '', text: 'Eigene Schließung (Zyl.Nr. ' + (t.nummer || '?') + ')', untertitel: t.gleichschliessendMit ? 'Verbindung lösen' : 'wie bisher', aktiv: !t.gleichschliessendMit }];
    kandidaten.forEach(function (k) {
      moeglichkeiten.push({ wert: k.id, text: 'Gleichschließend mit ' + (k.nummer || '?') + ' ' + (k.bezeichnung || ''), untertitel: 'Zyl.Nr. wird ' + M.zylinderNummerVorschau(p, t, k.id), aktiv: basis.id === k.id && basis.id !== t.id });
    });
    if (!kandidaten.length && !t.gleichschliessendMit) { A.toast('Es gibt keine andere Tür, mit der diese gleichschließend sein könnte.'); return; }
    wahlDialog('Zylindernummer ' + (t.nummer || ''), 'Gleichschließende Türen haben denselben Schlüssel: Ihre Berechtigungen werden automatisch gleich gehalten, und sie tragen dieselbe Zyl.Nr. wie die Haupttür.', moeglichkeiten, function (wahl) {
      aendern('Gleichschließung ' + (t.nummer || t.bezeichnung), function () {
        if (!M.gleichschliessendSetzen(p, t.id, wahl)) A.toast('Diese Verbindung ist nicht möglich.', 'fehler');
      });
    });
  }

  /* Neue Tür für den Plan: Nummer, Raum, Bereich, Stückzahl */
  function tuerDialog(p, neuZeichnen) {
    var VT = global.ViewsTueren;
    var o = { nummer: M.naechsteLaufendeNummer(p), bezeichnung: '', strukturId: '', anzahl: 1 };
    var optionen = VT && VT.strukturOptionen ? VT.strukturOptionen(p) : [];
    var inhalt = el('div', {}, [
      el('p', { class: 'hinweis', text: 'Die Tür entsteht im Aufmaß mit offenen Pflichtangaben; Maße und Bauform tragen Sie später im Türformular nach.' }),
      el('div', { class: 'raster' }, [
        A.textFeld(o, 'nummer', 'Tür.Nr.'),
        A.textFeld(o, 'bezeichnung', 'Raumbezeichnung', { platzhalter: 'z. B. Wohnung 3', autocapitalize: 'sentences' }),
        optionen.length ? A.auswahlFeld(o, 'strukturId', 'Bereich', optionen, { leerText: '– ohne Zuordnung –' }) : null,
        A.zahlFeld(o, 'anzahl', 'Stückzahl', { min: 1, max: 999, vorgabe: 1 })
      ])
    ]);
    var dlg = A.dialogOeffnen({ titel: 'Neue Tür / neuer Zylinder', inhalt: inhalt, knoepfe: [
      { fuellen: true }, { text: 'Abbrechen' },
      { text: 'Anlegen & nächste', klasse: 'weiter', aktion: function (schliessen) { if (!anlegen()) return false; schliessen(); setTimeout(function () { tuerDialog(p, neuZeichnen); }, 60); return false; } },
      { text: 'Anlegen', klasse: 'haupt', aktion: function (schliessen) { if (!anlegen()) return false; schliessen(); return false; } }
    ] });
    function anlegen() {
      if (!String(o.bezeichnung || '').trim() && !String(o.nummer || '').trim()) { A.toast('Bitte Nummer oder Raum eintragen.', 'fehler'); return false; }
      merken('Tür ' + (o.nummer || o.bezeichnung) + ' angelegt');
      E().tuerAnlegen(p, { nummer: o.nummer, bezeichnung: o.bezeichnung, strukturId: o.strukturId || null, anzahl: o.anzahl });
      fertig(); neuZeichnen();
      A.toast('Tür ' + (o.nummer || o.bezeichnung) + ' angelegt.', 'ok');
      return true;
    }
    setTimeout(function () { var f = dlg.kasten.querySelector('input'); if (f) { f.focus(); f.select(); } }, 60);
  }

  global.ViewsEuroplan = { zeichnen: zeichnen, schalter: schalter, darstellung: darstellung, darstellungSetzen: darstellungSetzen, excelExport: excelExport, tuerDialog: tuerDialog };
})(typeof window !== 'undefined' ? window : globalThis);
