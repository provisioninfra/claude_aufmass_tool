/* =============================================================================
 * app.js — Oberfläche und Ablaufsteuerung
 * ========================================================================== */
(function (global) {
  'use strict';

  var K = global.Katalog, M = global.Model, Store = global.Store, Reports = global.Reports;

  /* Die Fassung des Werkzeugs. Steht in den Einstellungen, auf der
     Anmeldeseite und in der Abgleich-Übersicht, damit man auf jedem Gerät
     in einer Sekunde sieht, welcher Stand dort läuft. Muss mit FASSUNG in
     sw.js übereinstimmen - der Prüflauf achtet darauf. */
  var FASSUNG = '1.3.1';

  /* =========================================================================
   * DOM-Hilfsmittel
   * ====================================================================== */
  function el(tag, eigenschaften, kinder) {
    var knoten = document.createElement(tag);
    if (eigenschaften) {
      Object.keys(eigenschaften).forEach(function (schluessel) {
        var wert = eigenschaften[schluessel];
        if (wert === null || wert === undefined || wert === false) return;
        if (schluessel === 'class') knoten.className = wert;
        else if (schluessel === 'text') knoten.textContent = wert;
        else if (schluessel === 'html') knoten.innerHTML = wert;
        else if (schluessel === 'style' && typeof wert === 'object') Object.assign(knoten.style, wert);
        else if (schluessel.indexOf('on') === 0 && typeof wert === 'function') {
          knoten.addEventListener(schluessel.slice(2).toLowerCase(), wert);
        }
        else if (schluessel === 'value') knoten.value = wert;
        else if (schluessel === 'checked') knoten.checked = !!wert;
        else if (wert === true) knoten.setAttribute(schluessel, '');
        else knoten.setAttribute(schluessel, wert);
      });
    }
    (Array.isArray(kinder) ? kinder : (kinder ? [kinder] : [])).forEach(function (kind) {
      if (kind === null || kind === undefined || kind === false) return;
      knoten.appendChild(typeof kind === 'string' ? document.createTextNode(kind) : kind);
    });
    return knoten;
  }
  function leeren(knoten) { while (knoten.firstChild) knoten.removeChild(knoten.firstChild); }
  function $(sel, wurzel) { return (wurzel || document).querySelector(sel); }

  /* Kurzmeldung unten am Bildschirm.
   * Der Meldungsbereich hängt am Dokument und nicht an der Ansicht, damit
   * Meldungen einen Neuaufbau der Seite überstehen. */
  function toastBereich() {
    var bereich = document.getElementById('toast-bereich');
    if (!bereich) {
      bereich = document.createElement('div');
      bereich.id = 'toast-bereich';
      document.body.appendChild(bereich);
    } else if (bereich.parentNode !== document.body) {
      document.body.appendChild(bereich);
    }
    return bereich;
  }

  function toast(text, art) {
    var bereich = toastBereich();
    var t = el('div', { class: 'toast' + (art ? ' ' + art : ''), text: text });
    bereich.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .25s'; t.style.opacity = '0';
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }, art === 'fehler' ? 5200 : 2600);
  }

  /* --- Dialoge ------------------------------------------------------------ */
  var offeneDialoge = [];

  function dialogOeffnen(optionen) {
    var koerper = el('div', { class: 'koerper' }, optionen.inhalt);
    var fuss = el('div', { class: 'fuss' });
    var hinter = el('div', { class: 'dialog-hinter' });
    var kasten = el('div', { class: 'dialog' + (optionen.klein ? ' klein' : '') }, [
      el('div', { class: 'kopf' }, [
        el('h2', { text: optionen.titel || '' }),
        el('button', { class: 'nur-symbol', 'aria-label': 'Schließen', text: '✕',
          onclick: function () { schliessen(); } })
      ]),
      koerper, fuss
    ]);
    hinter.appendChild(kasten);

    function schliessen(ergebnis) {
      if (hinter.parentNode) hinter.parentNode.removeChild(hinter);
      var i = offeneDialoge.indexOf(schliessen);
      if (i >= 0) offeneDialoge.splice(i, 1);
      document.removeEventListener('keydown', beiTaste);
      if (optionen.beimSchliessen) optionen.beimSchliessen(ergebnis);
    }
    function beiTaste(e) {
      if (e.key === 'Escape' && offeneDialoge[offeneDialoge.length - 1] === schliessen) {
        e.preventDefault(); schliessen();
      }
    }
    document.addEventListener('keydown', beiTaste);
    hinter.addEventListener('click', function (e) { if (e.target === hinter) schliessen(); });

    (optionen.knoepfe || []).forEach(function (kn) {
      if (kn.fuellen) { fuss.appendChild(el('div', { class: 'fuellen' })); return; }
      fuss.appendChild(el('button', {
        class: kn.klasse || '', text: kn.text,
        onclick: function () { if (!kn.aktion || kn.aktion(schliessen) !== false) { if (kn.schliesst !== false) schliessen(kn.wert); } }
      }));
    });
    if (!fuss.children.length) fuss.remove();

    document.body.appendChild(hinter);
    offeneDialoge.push(schliessen);
    var erstesFeld = kasten.querySelector('input:not([type=file]), select, textarea');
    if (erstesFeld && !('ontouchstart' in window)) setTimeout(function () { erstesFeld.focus(); }, 60);
    return { schliessen: schliessen, kasten: kasten, koerper: koerper };
  }

  function bestaetigen(titel, text, knopfText) {
    return new Promise(function (resolve) {
      dialogOeffnen({
        titel: titel, klein: true,
        inhalt: el('p', { text: text, style: { margin: '0', fontSize: '14.5px', lineHeight: '1.5' } }),
        knoepfe: [
          { fuellen: true },
          { text: 'Abbrechen', wert: false },
          { text: knopfText || 'Löschen', klasse: 'gefahr', wert: true }
        ],
        beimSchliessen: function (w) { resolve(w === true); }
      });
    });
  }

  function textAbfragen(titel, beschriftung, vorgabe, platzhalter) {
    return new Promise(function (resolve) {
      var eingabe = el('input', { type: 'text', value: vorgabe || '', placeholder: platzhalter || '' });
      eingabe.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); fertig(); }
      });
      var dlg = dialogOeffnen({
        titel: titel, klein: true,
        inhalt: el('div', { class: 'feld' }, [el('label', { text: beschriftung }), eingabe]),
        knoepfe: [
          { fuellen: true },
          { text: 'Abbrechen', wert: null },
          { text: 'Übernehmen', klasse: 'haupt', aktion: function (schliessen) { schliessen(eingabe.value.trim()); return false; } }
        ],
        beimSchliessen: function (w) { resolve(w || null); }
      });
      function fertig() { dlg.schliessen(eingabe.value.trim()); }
      setTimeout(function () { eingabe.focus(); eingabe.select(); }, 60);
    });
  }

  /* =========================================================================
   * Anwendungszustand
   * ====================================================================== */
  var Zustand = {
    projekt: null,
    einstellungen: null,
    ansicht: 'projekte',
    bereichId: null,      // gewählter Bereich in der Bereichsansicht
    tuerFilter: { suche: '', struktur: '', status: '', system: '', unvollstaendig: false },
    ungesichert: false,
    speichertGerade: false
  };

  var speicherTimer = null;
  var eingabeTimer = null;

  /* Laufende Texteingaben werden zu einem Schritt zusammengefasst: Nach
   * kurzer Pause gilt die Eingabe als abgeschlossen. Sonst entstünde je
   * Tastendruck ein eigener Schritt. */
  function eingabeSchrittMerken(beschreibung) {
    if (!Zustand.projekt || !global.Verlauf) return;
    if (eingabeTimer) return;                 /* läuft bereits */
    global.Verlauf.merken(Zustand.projekt, beschreibung || 'Eingabe');
    eingabeTimer = setTimeout(function () { eingabeTimer = null; }, 1600);
  }

  function alsGeaendertMarkieren() {
    if (!Zustand.projekt) return;
    Zustand.ungesichert = true;
    statusAnzeigen('ungesichert');
    clearTimeout(speicherTimer);
    speicherTimer = setTimeout(speichern, 700);
  }

  /* Läuft gerade eine Speicherung (bei vielen Fotos dauert sie auch mal
     eine Sekunde), wird eine Eingabe in dieser Zeit nicht verworfen,
     sondern danach noch einmal gesichert. Wer auf das Ergebnis wartet
     (Schließen, Seitenwechsel), bekommt erst die letzte Speicherung. */
  var laufendeSpeicherung = null;
  var nochmalSpeichern = false;

  function speichern() {
    if (!Zustand.projekt) return Promise.resolve();
    if (Zustand.speichertGerade) {
      nochmalSpeichern = true;
      return laufendeSpeicherung || Promise.resolve();
    }
    Zustand.speichertGerade = true;
    statusAnzeigen('speichert');
    laufendeSpeicherung = Store.projektSpeichern(Zustand.projekt).then(function () {
      Zustand.speichertGerade = false;
      if (nochmalSpeichern) { nochmalSpeichern = false; return speichern(); }
      Zustand.ungesichert = false;
      statusAnzeigen('gesichert');
      /* Die Meldung an den Abgleich geschieht in Store.projektSpeichern -
         dort laufen alle Speicherwege zusammen. */
    }).catch(function (e) {
      Zustand.speichertGerade = false;
      nochmalSpeichern = false;
      statusAnzeigen('fehler');
      toast(e.message || 'Speichern fehlgeschlagen.', 'fehler');
    });
    return laufendeSpeicherung;
  }

  function statusAnzeigen(art) {
    var knoten = $('#speicher-status');
    if (!knoten) return;
    var texte = {
      ungesichert: ['Änderungen offen', ''],
      speichert:   ['Speichert …', ''],
      gesichert:   ['Gespeichert', 'aktiv'],
      fehler:      ['Speicherfehler', '']
    };
    var e = texte[art] || ['', ''];
    knoten.className = 'speicher-status ' + e[1];
    leeren(knoten);
    if (e[0]) {
      knoten.appendChild(el('span', { class: 'punkt' }));
      knoten.appendChild(document.createTextNode(e[0]));
    }
  }

  /* Verhindert Datenverlust beim Schließen des Browsers */
  window.addEventListener('beforeunload', function (e) {
    if (Zustand.ungesichert) { e.preventDefault(); e.returnValue = ''; }
  });
  /* Auf iOS ist "pagehide" verlässlicher als "beforeunload" */
  window.addEventListener('pagehide', function () { if (Zustand.ungesichert) speichern(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && Zustand.ungesichert) speichern();
  });

  /* =========================================================================
   * Formularbausteine
   * ====================================================================== */
  /* Ein Formularfeld. Der Feldname wird als data-feld hinterlegt: Daran
   * erkennt das Türformular, welche Felder Pflicht sind, ohne jedes Feld
   * einzeln zu kennen. */
  var feldZaehler = 0;
  /* Welches Bedienelement gehört zu dieser Beschriftung? Entweder der
   * übergebene Knoten selbst oder - bei einer Reihe wie dem Zählfeld - das
   * einzige Eingabefeld darin. Bei mehreren wäre die Zuordnung geraten,
   * darum bleibt es dann bei der reinen Beschriftung. */
  function zugehoerigesFeld(knoten) {
    if (!knoten || !knoten.tagName) return null;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(knoten.tagName)) return knoten;
    var drin = knoten.querySelectorAll ? knoten.querySelectorAll('input, select, textarea') : [];
    return drin.length === 1 ? drin[0] : null;
  }

  function feld(beschriftung, eingabeKnoten, breit, schluessel) {
    var marke = el('label', { html: beschriftung });
    /* Die Beschriftung steht neben dem Feld, nicht darum herum. Ohne
     * ausdrückliche Verknüpfung setzt ein Tippen auf den Text den Cursor
     * nicht ins Feld - mit dem Stift ist der Text aber das größere Ziel. */
    var ziel = zugehoerigesFeld(eingabeKnoten);
    if (ziel) {
      if (!ziel.id) ziel.id = 'f' + (++feldZaehler) + '-' + (schluessel || 'feld');
      marke.setAttribute('for', ziel.id);
    }
    var knoten = el('div', { class: 'feld' + (breit ? ' voll' : '') }, [marke, eingabeKnoten]);
    if (schluessel) knoten.setAttribute('data-feld', schluessel);
    return knoten;
  }

  /* Ein Zahlenfeld (<input type="number">) nimmt auf dem iPad keine
   * Handschrift an: Apples "Kritzeln" schreibt nur in Textfelder. Weil die
   * Maße vor Ort mit dem Stift eingetragen werden sollen, wird daraus ein
   * Textfeld mit numerischer Tastatur - dieselbe Eingabe, aber beschreibbar.
   * Nebeneffekt: die winzigen Pfeilchen am Rand verschwinden. */
  function eingabeTyp(optionen) {
    if (optionen.typ === 'number') {
      return { typ: 'text', modus: optionen.inputmode || 'numeric' };
    }
    return { typ: optionen.typ || 'text', modus: optionen.inputmode || null };
  }

  function textFeld(objekt, schluessel, beschriftung, optionen) {
    optionen = optionen || {};
    var art = eingabeTyp(optionen);
    var eingabe = el('input', {
      type: art.typ,
      value: objekt[schluessel] === null || objekt[schluessel] === undefined ? '' : objekt[schluessel],
      placeholder: optionen.platzhalter || '',
      inputmode: art.modus,
      autocomplete: optionen.autocomplete || 'off',
      /* Handschrift wird sonst "verbessert" - bei Türnummern und Maßen
       * wäre das falsch. */
      autocorrect: optionen.autocorrect || 'off',
      autocapitalize: optionen.autocapitalize || 'sentences',
      spellcheck: 'false',
      oninput: function (e) {
        eingabeSchrittMerken('Eingabe: ' + String(beschriftung).replace(/<[^>]*>/g, '').trim());
        objekt[schluessel] = e.target.value;
        if (optionen.beiAenderung) optionen.beiAenderung(e.target.value);
        alsGeaendertMarkieren();
      }
    });
    return feld(beschriftung, eingabe, optionen.breit, schluessel);
  }

  function bereichFeld(objekt, schluessel, beschriftung, optionen) {
    optionen = optionen || {};
    var eingabe = el('textarea', {
      placeholder: optionen.platzhalter || '',
      rows: optionen.zeilen || 3,
      /* Fließtext: hier ist die Rechtschreibhilfe beim Kritzeln nützlich */
      autocorrect: 'on', autocapitalize: 'sentences', spellcheck: 'true',
      oninput: function (e) {
        eingabeSchrittMerken('Eingabe: ' + String(beschriftung).replace(/<[^>]*>/g, '').trim());
        objekt[schluessel] = e.target.value; alsGeaendertMarkieren();
      }
    });
    eingabe.value = objekt[schluessel] || '';
    return feld(beschriftung, eingabe, optionen.breit !== false, schluessel);
  }

  function auswahlFeld(objekt, schluessel, beschriftung, optionen, konfig) {
    konfig = konfig || {};
    var auswahl = el('select', {
      onchange: function (e) {
        schrittMerken('Auswahl: ' + String(beschriftung).replace(/<[^>]*>/g, '').trim());
        objekt[schluessel] = e.target.value;
        if (konfig.beiAenderung) konfig.beiAenderung(e.target.value);
        alsGeaendertMarkieren();
      }
    });
    auswahl.appendChild(el('option', { value: '', text: konfig.leerText || '– bitte wählen –' }));
    var bekannt = {};
    optionen.forEach(function (o) {
      var wert = (typeof o === 'string') ? o : o.id;
      var text = (typeof o === 'string') ? o : o.label;
      bekannt[String(wert)] = true;
      auswahl.appendChild(el('option', { value: wert, text: text }));
    });
    /* Ein gespeicherter Wert, der nicht (mehr) in der Liste steht, bliebe
     * sonst beim Öffnen des Formulars stillschweigend leer und wäre beim
     * nächsten Speichern verloren. Er wird deshalb mit aufgenommen. */
    var vorhanden = objekt[schluessel];
    if (vorhanden && !bekannt[String(vorhanden)]) {
      auswahl.appendChild(el('option', { value: vorhanden,
        text: vorhanden + '  (aus dem Bestand)' }));
    }
    auswahl.value = vorhanden || '';
    return feld(beschriftung, auswahl, konfig.breit, schluessel);
  }

  function schalterFeld(objekt, schluessel, beschriftung, beiAenderung) {
    var eingabe = el('input', {
      type: 'checkbox', checked: !!objekt[schluessel],
      onchange: function (e) {
        schrittMerken((e.target.checked ? 'Eingeschaltet: ' : 'Ausgeschaltet: ') + beschriftung);
        objekt[schluessel] = e.target.checked;
        if (beiAenderung) beiAenderung(e.target.checked);
        alsGeaendertMarkieren();
      }
    });
    return el('label', { class: 'schalter', 'data-feld': schluessel }, [
      eingabe, el('span', { class: 'bahn' }), el('span', { class: 'beschriftung', text: beschriftung })
    ]);
  }

  /* =========================================================================
   * Zähler: Anzahl mit - und + einstellen
   * ======================================================================
   * Für kleine Stückzahlen (baugleiche Türen, Schlüssel, Medien). Mit dem
   * Stift oder einem Finger bedienbar, ganz ohne Tastatur; das Feld in der
   * Mitte bleibt beschreibbar, damit auch 48 schnell eingetragen werden
   * kann.
   */
  function zahlFeld(objekt, schluessel, beschriftung, optionen) {
    optionen = optionen || {};
    var min = (optionen.min === undefined) ? 0 : optionen.min;
    var max = (optionen.max === undefined) ? 999 : optionen.max;
    var reinText = String(beschriftung).replace(/<[^>]*>/g, '').trim();

    /* Ein leeres Feld bleibt leer: "0 vorhandene Schlüssel" wäre eine
     * Aussage, "noch nicht erfasst" ist etwas anderes. */
    function istLeer() {
      var w = objekt[schluessel];
      return w === '' || w === null || w === undefined ||
             !isFinite(parseInt(w, 10));
    }
    function lesen() {
      var n = parseInt(objekt[schluessel], 10);
      if (!isFinite(n)) n = (optionen.vorgabe === undefined) ? min : optionen.vorgabe;
      return Math.min(max, Math.max(min, n));
    }
    function schreiben(n, vonHand) {
      var begrenzt = Math.min(max, Math.max(min, n));
      objekt[schluessel] = begrenzt;
      anzeige.value = String(begrenzt);
      if (optionen.beiAenderung) optionen.beiAenderung(begrenzt);
      alsGeaendertMarkieren();
      return begrenzt;
    }

    var anzeige = el('input', {
      type: 'text', inputmode: 'numeric', value: istLeer() ? '' : String(lesen()),
      placeholder: optionen.platzhalter || '–',
      autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
      class: 'zahl-anzeige',
      oninput: function (e) {
        eingabeSchrittMerken('Eingabe: ' + reinText);
        /* Während der Eingabe nicht gegen die Grenzen laufen - sonst ließe
         * sich keine zweistellige Zahl tippen. */
        var roh = String(e.target.value).replace(/[^0-9]/g, '');
        e.target.value = roh;
        var n = parseInt(roh, 10);
        objekt[schluessel] = isFinite(n) ? n : '';
        if (optionen.beiAenderung) optionen.beiAenderung(objekt[schluessel]);
        alsGeaendertMarkieren();
      },
      /* Beim Verlassen nur in die Grenzen rücken, wenn überhaupt etwas
       * dasteht - sonst würde bloßes Antippen eine 0 erzeugen. */
      onblur: function () { if (!istLeer()) schreiben(lesen()); }
    });

    function stufe(richtung, zeichen) {
      return el('button', {
        type: 'button', class: 'zahl-knopf', text: zeichen,
        'aria-label': (richtung > 0 ? 'Mehr' : 'Weniger') + ': ' + reinText,
        onclick: function () {
          schrittMerken((richtung > 0 ? 'Erhöht: ' : 'Verringert: ') + reinText);
          schreiben(lesen() + richtung);
        }
      });
    }

    var reihe = el('div', { class: 'zahl-feld' }, [
      stufe(-1, '−'), anzeige, stufe(1, '+'),
      optionen.einheit ? el('span', { class: 'einheit-rechts', text: optionen.einheit }) : null
    ]);
    return feld(beschriftung, reihe, optionen.breit, schluessel);
  }

  /* Mehrfachauswahl als anklickbare Chips */
  function chipFeld(objekt, schluessel, beschriftung, optionen, konfig) {
    konfig = konfig || {};
    if (!Array.isArray(objekt[schluessel])) objekt[schluessel] = [];
    var behaelter = el('div', { class: 'chips' });
    optionen.forEach(function (o) {
      var aktiv = objekt[schluessel].indexOf(o) !== -1;
      var chip = el('button', {
        type: 'button', class: 'chip', 'aria-pressed': aktiv ? 'true' : 'false', text: o,
        onclick: function () {
          var i = objekt[schluessel].indexOf(o);
          schrittMerken((i === -1 ? 'Gewählt: ' : 'Abgewählt: ') + o);
          if (i === -1) objekt[schluessel].push(o); else objekt[schluessel].splice(i, 1);
          chip.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
          alsGeaendertMarkieren();
          if (konfig.beiAenderung) konfig.beiAenderung(o, i === -1);
        }
      });
      behaelter.appendChild(chip);
    });
    /* Beschriftung als HTML, damit Zusätze wie <span class="einheit"> wirken */
    return el('div', { class: 'feld voll', 'data-feld': schluessel },
      [el('label', { html: beschriftung }), behaelter]);
  }

  /* Ein Projekt zum Bearbeiten öffnen. Erst damit ist ein Projekt aktiv;
   * auf der Projektübersicht ist bewusst keines geöffnet. */
  function projektOeffnenIntern(projekt, ansicht) {
    Zustand.projekt = projekt;
    Zustand.ungesichert = false;
    Zustand.bereichId = null;
    if (ansicht) Zustand.ansicht = ansicht;
    Zustand.tuerFilter = { suche: '', struktur: '', status: '', system: '', unvollstaendig: false };
    if (global.Verlauf) global.Verlauf.beginnen(projekt);
  }

  /* Projekt sichern und schließen. Danach ist kein Projekt mehr aktiv. */
  function projektSchliessen() {
    if (!Zustand.projekt) return Promise.resolve();
    var offen = Zustand.ungesichert;
    return (offen ? speichern() : Promise.resolve()).then(function () {
      Zustand.projekt = null;
      Zustand.ungesichert = false;
      Zustand.bereichId = null;
      clearTimeout(speicherTimer);
      if (global.Verlauf) global.Verlauf.beenden();
      return offen;
    });
  }

  /* Einen Arbeitsschritt festhalten, bevor er ausgeführt wird. */
  function schrittMerken(beschreibung) {
    if (Zustand.projekt && global.Verlauf) {
      global.Verlauf.merken(Zustand.projekt, beschreibung);
    }
  }

  /* Letzten Arbeitsschritt zurücknehmen. */
  function schrittZurueck() {
    if (!Zustand.projekt || !global.Verlauf) return null;
    var ergebnis = global.Verlauf.zurueck();
    if (!ergebnis) return null;
    ergebnis.projekt.id = Zustand.projekt.id;
    Zustand.projekt = ergebnis.projekt;
    alsGeaendertMarkieren();
    return ergebnis;
  }

  global.AppKern = {
    FASSUNG: FASSUNG,
    el: el, leeren: leeren, $: $, toast: toast,
    toastBereich: toastBereich,
    dialogOeffnen: dialogOeffnen, bestaetigen: bestaetigen, textAbfragen: textAbfragen,
    Zustand: Zustand, alsGeaendertMarkieren: alsGeaendertMarkieren, speichern: speichern,
    projektOeffnenIntern: projektOeffnenIntern,
    projektSchliessen: projektSchliessen,
    schrittMerken: schrittMerken,
    eingabeSchrittMerken: eingabeSchrittMerken,
    schrittZurueck: schrittZurueck,
    statusAnzeigen: statusAnzeigen,
    feld: feld, textFeld: textFeld, bereichFeld: bereichFeld,
    auswahlFeld: auswahlFeld, schalterFeld: schalterFeld, chipFeld: chipFeld,
    zahlFeld: zahlFeld
  };
})(typeof window !== 'undefined' ? window : globalThis);
