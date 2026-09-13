/* =============================================================================
 * main.js — Navigation und Start der Anwendung
 * ========================================================================== */
(function (global) {
  'use strict';
  var A = global.AppKern, M = global.Model, Store = global.Store;
  var el = A.el, Zustand = A.Zustand;
  var VP = global.ViewsProjekt, VT = global.ViewsTueren, VPL = global.ViewsPlan;

  var REITER = [
    { id: 'projekte',     label: 'Projekte',     immer: true },
    { id: 'stammdaten',   label: 'Stammdaten' },
    { id: 'struktur',     label: 'Struktur' },
    { id: 'tueren',       label: 'Türen' },
    { id: 'plan',         label: 'Schließplan' },
    { id: 'export',       label: 'Export' },
    { id: 'einstellungen',label: 'Einstellungen', immer: true }
  ];

  function zeichnen() {
    var wurzel = A.$('#app');
    var scrollPos = 0;
    var altesHaupt = A.$('main.inhalt');
    if (altesHaupt) scrollPos = altesHaupt.scrollTop;
    A.leeren(wurzel);

    var p = Zustand.projekt;

    /* --- Kopfzeile --- */
    var eins = Zustand.einstellungen || {};
    wurzel.appendChild(el('header', { class: 'kopf' }, [
      eins.logoDataUrl
        ? el('img', { class: 'logo', src: eins.logoDataUrl, alt: eins.firma || 'Firmenlogo' })
        : null,
      el('div', { class: 'marke' }, [
        eins.firma || 'Aufmaß-Tool',
        el('small', { text: eins.firmaZusatz || 'Schließanlagen & Zutritt' })
      ]),
      el('div', { class: 'projekt-titel' }, p ? [
        (p.kunde || p.name || 'Ohne Namen'),
        el('span', { text: [p.objekt, p.anlagenNr && ('Anlage ' + p.anlagenNr)].filter(Boolean).join('  ·  ') })
      ] : [el('span', { class: 'zart', text: 'Kein Projekt geöffnet' })]),
      p ? zurueckKnopfBauen() : (function () { zurueckKnopf = null; return null; })(),
      el('div', { class: 'speicher-status', id: 'speicher-status' })
    ]));

    /* --- Reiter --- */
    var reiterLeiste = el('nav', { class: 'reiter', role: 'tablist' });
    REITER.forEach(function (r) {
      var gesperrt = !r.immer && !p;
      var zahl = null;
      if (p) {
        if (r.id === 'tueren') zahl = p.tueren.length;
        if (r.id === 'plan') zahl = p.schliessungen.length;
        if (r.id === 'struktur') zahl = p.standorte.length;
      }
      reiterLeiste.appendChild(el('button', {
        role: 'tab', 'aria-selected': Zustand.ansicht === r.id ? 'true' : 'false',
        disabled: gesperrt,
        onclick: function () { wechseln(r.id); }
      }, [
        r.label,
        zahl ? el('span', { class: 'zahl', text: String(zahl) }) : null
      ]));
    });
    wurzel.appendChild(reiterLeiste);

    /* --- Inhalt --- */
    var haupt = el('main', { class: 'inhalt' });
    wurzel.appendChild(haupt);
    wurzel.appendChild(el('div', { id: 'toast-bereich' }));

    /* Die häufigste Aktion der jeweiligen Ansicht liegt als schwebender
     * Knopf in der Daumenzone - so ist sie mit einer Hand erreichbar. */
    var HAUPTAKTION = {
      projekte:  { text: '+ Neues Aufmaß', tun: function () { VP.neuesProjektAnlegen(zeichnen); } },
      tueren:    { text: '+ Neue Tür',     tun: function () { VT.tuerBearbeiten(null, zeichnen); } },
      struktur:  { text: '+ Standort',     tun: function () { VP.standortAnlegen(zeichnen); } },
      plan:      { text: '+ Schließung',   tun: function () { VPL.schliessungBearbeiten(null, zeichnen); } }
    };

    if (!p && ['projekte', 'einstellungen'].indexOf(Zustand.ansicht) === -1) {
      Zustand.ansicht = 'projekte';
    }

    try {
      switch (Zustand.ansicht) {
        case 'projekte':      VP.ansichtProjekte(haupt, zeichnen); break;
        case 'stammdaten':    VP.ansichtStammdaten(haupt); break;
        case 'struktur':      VP.ansichtStruktur(haupt, zeichnen); break;
        case 'tueren':        VT.ansichtTueren(haupt, zeichnen); break;
        case 'plan':          VPL.ansichtPlan(haupt, zeichnen); break;
        case 'export':        VPL.ansichtExport(haupt, zeichnen); break;
        case 'einstellungen': VPL.ansichtEinstellungen(haupt, zeichnen); break;
        default:              VP.ansichtProjekte(haupt, zeichnen);
      }
    } catch (fehler) {
      console.error(fehler);
      haupt.appendChild(el('div', { class: 'meldung fehler' }, [
        el('div', {}, [
          el('b', { text: 'Die Ansicht konnte nicht aufgebaut werden.' }),
          el('div', { style: { marginTop: '6px', fontSize: '13px' }, text: String(fehler.message || fehler) }),
          el('button', { class: 'klein', style: { marginTop: '10px' }, text: 'Zur Projektübersicht',
            onclick: function () { Zustand.ansicht = 'projekte'; zeichnen(); } })
        ])
      ]));
    }

    var aktion = HAUPTAKTION[Zustand.ansicht];
    if (aktion && (p || Zustand.ansicht === 'projekte')) {
      haupt.classList.add('mit-schwebe');
      wurzel.appendChild(el('button', {
        class: 'schwebe-aktion', text: aktion.text,
        title: aktion.text, onclick: aktion.tun
      }));
    }

    A.statusAnzeigen(Zustand.ungesichert ? 'ungesichert' : (p ? 'gesichert' : ''));
    haupt.scrollTop = scrollPos;
  }

  /* Knopf zum Zurücknehmen des letzten Arbeitsschritts. Steht überall
   * innerhalb eines Projekts zur Verfügung und lässt sich beliebig oft
   * betätigen, solange Schritte vorliegen. */
  var zurueckKnopf = null;

  function zurueckKnopfBauen() {
    zurueckKnopf = el('button', {
      class: 'zurueck-knopf',
      'aria-label': 'Letzten Schritt zurücknehmen',
      onclick: function () { schrittZurueckNehmen(); }
    });
    zurueckKnopfAktualisieren();
    return zurueckKnopf;
  }

  /* Der Zähler muss sich auch dann ändern, wenn die Seite nicht neu
   * aufgebaut wird - etwa beim Antippen einer Matrixzelle. */
  function zurueckKnopfAktualisieren() {
    if (!zurueckKnopf || !zurueckKnopf.isConnected && !zurueckKnopf.parentNode) {
      /* Knopf wurde beim Neuaufbau ersetzt */
    }
    if (!zurueckKnopf) return;
    var V = global.Verlauf;
    var moeglich = !!(V && V.moeglich());
    var was = moeglich ? V.naechsteBeschreibung() : '';
    zurueckKnopf.className = 'zurueck-knopf' + (moeglich ? '' : ' leer');
    zurueckKnopf.disabled = !moeglich;
    zurueckKnopf.title = moeglich
      ? ('Zurücknehmen: ' + was + '  (' + V.anzahl() + ' Schritte möglich)')
      : 'Nichts zurückzunehmen';
    A.leeren(zurueckKnopf);
    zurueckKnopf.appendChild(el('span', { class: 'pfeil', text: '↶' }));
    zurueckKnopf.appendChild(el('span', { class: 'beschriftung', text: 'Zurück' }));
    if (moeglich) zurueckKnopf.appendChild(el('span', { class: 'zahl', text: String(V.anzahl()) }));
  }

  function schrittZurueckNehmen() {
    var ergebnis = A.schrittZurueck();
    if (!ergebnis) { A.toast('Es gibt nichts zurückzunehmen.'); return; }
    A.speichern();
    zeichnen();
    A.toast('Zurückgenommen: ' + ergebnis.beschreibung, 'ok');
  }

  /* Tastatur: im Büro ist Strg/Cmd+Z gewohnt */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      var imFeld = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '');
      if (imFeld) return;                 /* im Eingabefeld gilt die Textrücknahme */
      if (!Zustand.projekt) return;
      e.preventDefault();
      schrittZurueckNehmen();
    }
  });

  function wechseln(ansicht) {
    /* Die Projektübersicht ist bewusst kein Arbeitsplatz: Beim Wechsel
     * dorthin wird gesichert und das Projekt geschlossen. */
    if (ansicht === 'projekte' && Zustand.projekt) {
      var name = Zustand.projekt.kunde || Zustand.projekt.name || 'Projekt';
      A.projektSchliessen().then(function (warOffen) {
        Zustand.ansicht = 'projekte';
        zeichnen();
        A.toast(warOffen ? ('Gespeichert und geschlossen: ' + name)
                         : ('Geschlossen: ' + name));
      });
      return;
    }
    Zustand.ansicht = ansicht;
    zeichnen();
    var haupt = A.$('main.inhalt');
    if (haupt) haupt.scrollTop = 0;
  }

  /* --- Start -------------------------------------------------------------- */
  function starten() {
    if (global.Verlauf) global.Verlauf.aufAenderung(zurueckKnopfAktualisieren);
    Store.einstellungenLaden().then(function (e) {
      Zustand.einstellungen = e;
      /* Die Anwendung startet auf der Projektübersicht, ohne ein Projekt
       * zu öffnen. So wird nie versehentlich im falschen Projekt gearbeitet. */
      Zustand.ansicht = 'projekte';
      Zustand.projekt = null;
    }).catch(function () {
      Zustand.einstellungen = Object.assign({}, Store.EINSTELLUNGEN_STANDARD);
    }).then(function () {
      zeichnen();
      if (Store.nutztFallback()) {
        A.toast('Hinweis: Dieser Browser erlaubt keine Datenbank. Es wird der einfache Speicher genutzt – bitte häufiger exportieren.', 'fehler');
      }
    });
  }

  global.App = { zeichnen: zeichnen, wechseln: wechseln, starten: starten };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', starten);
  } else { starten(); }
})(typeof window !== 'undefined' ? window : globalThis);
