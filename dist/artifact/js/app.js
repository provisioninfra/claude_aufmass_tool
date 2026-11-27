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
  var FASSUNG = '1.5.4';

  /* =========================================================================
   * DOM-Hilfsmittel
   * ====================================================================== */
  /* Elemente mit onclick, die keine Knöpfe sind (Türzeilen, Zellen, Köpfe,
     Karten, Gliederungsknoten), bekommen hier Tastaturbedienung: tabindex,
     Rolle und Enter/Leertaste. Sonst sind sie ohne Maus oder Finger
     unerreichbar. Knöpfe, Links und Felder können das von selbst. */
  var TASTEN_EIGENE = { BUTTON: 1, A: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, LABEL: 1, SUMMARY: 1, DETAILS: 1 };
  function tastaturNachruesten(knoten, eigenschaften) {
    var tag = knoten.tagName;
    var anklickbareZeile = tag === 'TR' && /\banklickbar\b/.test(knoten.className);
    if (!anklickbareZeile) {
      if (!eigenschaften || typeof eigenschaften.onclick !== 'function') return;
      if (TASTEN_EIGENE[tag]) return;
      /* In Tabellen nur die eigentlichen Zellen, nicht jede Zelle einer
         anklickbaren Zeile (die Zeile selbst wird ein Ziel) */
      if (/^(TD|TH)$/.test(tag) && !/\b(zelle|klickbar|spaltenkopf)\b/.test(knoten.className)) return;
    }
    if (knoten.hasAttribute('tabindex')) return;
    knoten.setAttribute('tabindex', '0');
    if (!knoten.hasAttribute('role') && !/^(TD|TH|TR)$/.test(tag)) knoten.setAttribute('role', 'button');
    knoten.addEventListener('keydown', function (e) {
      if (e.target !== knoten) return;                /* Enter in einem inneren Feld bleibt dort */
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (anklickbareZeile) { var ersteZelle = knoten.querySelector('td'); if (ersteZelle) ersteZelle.click(); }
      else knoten.click();
    });
  }

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
    tastaturNachruesten(knoten, eigenschaften);
    return knoten;
  }

  /* Pfeiltasten in einer Matrix: von Zelle zu Zelle, auch über Gruppenzeilen hinweg */
  function tastenNavigation(tabelle, selektor) {
    selektor = selektor || 'td.zelle';
    tabelle.addEventListener('keydown', function (e) {
      var z = e.target;
      if (!z || !z.matches || !z.matches(selektor)) return;
      var schritt = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
      if (!schritt) return;
      e.preventDefault();
      var zeile = z.parentNode;
      var zellen = Array.prototype.slice.call(zeile.querySelectorAll(selektor));
      var i = zellen.indexOf(z), ziel = null;
      if (schritt[1]) { ziel = zellen[i + schritt[1]]; }
      else {
        var zeilen = Array.prototype.slice.call(tabelle.querySelectorAll('tr')).filter(function (r) { return r.querySelector(selektor); });
        var naechste = zeilen[zeilen.indexOf(zeile) + schritt[0]];
        if (naechste) ziel = naechste.querySelectorAll(selektor)[i];
      }
      if (ziel) { ziel.focus(); if (ziel.scrollIntoView) ziel.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    });
  }

  /* Ein Scrollrahmen bekommt eine Hülle mit Schatten links und rechts, sobald
     dort noch etwas liegt - iOS zeigt sonst nicht, dass man wischen kann. */
  function scrollHinweis(rahmen) {
    var huelle = el('div', { class: 'matrix-huelle' }, rahmen);
    function nachsehen() {
      /* Der linke Schatten sitzt hinter der festen ersten Spalte, nicht am Rand */
      var ecke = rahmen.querySelector('th.ecke');
      huelle.style.setProperty('--ecke', (ecke ? Math.round(ecke.getBoundingClientRect().width) : 0) + 'px');
      huelle.classList.toggle('kann-links', rahmen.scrollLeft > 2);
      huelle.classList.toggle('kann-rechts', rahmen.scrollLeft + rahmen.clientWidth < rahmen.scrollWidth - 2);
    }
    rahmen.addEventListener('scroll', nachsehen, { passive: true });
    if (typeof ResizeObserver !== 'undefined') { new ResizeObserver(nachsehen).observe(rahmen); }
    setTimeout(nachsehen, 0);
    return huelle;
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
    /* Eine Meldung ist ein Satz, kein Bericht: Überlanges wird gekürzt (der
       volle Text steht in der Konsole), und mehr als drei Meldungen stapeln
       sich nicht - die älteste geht. Sonst deckt der Stapel die Ansicht zu. */
    text = String(text == null ? '' : text);
    if (text.length > 220) { try { console.info('Meldung (voll): ' + text); } catch (e) {} text = text.slice(0, 217).replace(/\s+\S*$/, '') + ' …'; }
    while (bereich.children.length >= 3) { bereich.removeChild(bereich.firstChild); }
    var t = el('div', { class: 'toast' + (art ? ' ' + art : ''), text: text, role: art === 'fehler' ? 'alert' : 'status' });
    bereich.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .25s'; t.style.opacity = '0';
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }, art === 'fehler' ? 5200 : 2600);
  }

  /* --- Dialoge ------------------------------------------------------------ */
  var offeneDialoge = [];
  var dialogZaehler = 0;

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
    /* Ein Dialog ist ein Dialog: Rolle und Titel für Hilfstechnik, der
       Hintergrund ist gesperrt (inert), Tab bleibt im Dialog, und beim
       Schließen kehrt der Fokus zum Auslöser zurück. Ohne das lief Tab
       durch die Seite dahinter, und Enter auf dem Reiter „Projekte“ schloss
       das Aufmaß bei offenem Türformular - die Tür war dann verloren. */
    kasten.setAttribute('role', 'dialog'); kasten.setAttribute('aria-modal', 'true');
    var titelKnoten = kasten.querySelector('h2');
    titelKnoten.id = 'dialog-titel-' + (++dialogZaehler);
    kasten.setAttribute('aria-labelledby', titelKnoten.id);
    kasten.tabIndex = -1;
    var ausloeser = document.activeElement;
    var app = document.getElementById('app');
    if (app && offeneDialoge.length === 0) { app.inert = true; app.setAttribute('aria-hidden', 'true'); }
    kasten.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(kasten.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        function (k) { return k.offsetParent !== null; });
      if (!f.length) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === f[0] || document.activeElement === kasten)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });

    function schliessen(ergebnis) {
      if (hinter.parentNode) hinter.parentNode.removeChild(hinter);
      var i = offeneDialoge.indexOf(schliessen);
      if (i >= 0) offeneDialoge.splice(i, 1);
      document.removeEventListener('keydown', beiTaste);
      if (app && offeneDialoge.length === 0) { app.inert = false; app.removeAttribute('aria-hidden'); }
      if (ausloeser && ausloeser.isConnected && typeof ausloeser.focus === 'function' && !document.querySelector('.dialog-hinter')) {
        try { ausloeser.focus({ preventScroll: true }); } catch (e2) { /* ältere Browser */ }
      }
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
    setTimeout(function () {
      if (!kasten.isConnected) return;
      if (erstesFeld && !('ontouchstart' in window)) erstesFeld.focus();
      else { try { kasten.focus({ preventScroll: true }); } catch (e3) { /* ältere Browser */ } }
    }, 60);
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
      return true;
    }).catch(function (e) {
      Zustand.speichertGerade = false;
      nochmalSpeichern = false;
      statusAnzeigen('fehler');
      toast(e.message || 'Speichern fehlgeschlagen.', 'fehler');
      /* Kein Wurf nach außen (viele Aufrufer warten nicht), aber ein klares
         „nicht gelungen“ - wer schließen oder neu laden will, muss es prüfen. */
      return false;
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
    knoten.setAttribute('role', 'status'); knoten.setAttribute('aria-live', 'polite');
    leeren(knoten);
    if (e[0]) {
      knoten.appendChild(el('span', { class: 'punkt' }));
      knoten.appendChild(document.createTextNode(e[0]));
      knoten.title = e[0]; knoten.setAttribute('aria-label', e[0]);
    } else { knoten.removeAttribute('title'); knoten.removeAttribute('aria-label'); }
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
    } else if (eingabeKnoten && eingabeKnoten.querySelectorAll) {
      /* Mehrere Bedienelemente (Auswahl plus Freitext): jedes bekommt die
         Beschriftung, sonst liest Hilfstechnik nur „Eingabefeld“ vor. */
      var mehrere = eingabeKnoten.querySelectorAll('input, select, textarea');
      if (mehrere.length > 1) {
        if (!marke.id) marke.id = 'l' + (++feldZaehler) + '-' + (schluessel || 'feld');
        Array.prototype.forEach.call(mehrere, function (k) {
          if (!k.getAttribute('aria-label') && !k.getAttribute('aria-labelledby')) k.setAttribute('aria-labelledby', marke.id);
        });
      }
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
        /* „flüchtig“: Angaben, die nicht zum Aufmaß gehören (etwa der Hinweis
           im Freigabe-Dialog) - kein Verlaufsschritt, kein „geändert“. */
        if (!optionen.fluechtig) eingabeSchrittMerken('Eingabe: ' + String(beschriftung).replace(/<[^>]*>/g, '').trim());
        objekt[schluessel] = e.target.value;
        if (optionen.beiAenderung) optionen.beiAenderung(e.target.value);
        if (!optionen.fluechtig) alsGeaendertMarkieren();
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
    return (offen ? speichern() : Promise.resolve(true)).then(function (gelungen) {
      if (gelungen === false) {
        /* Nicht gespeichert, also nicht schließen: Sonst wären alle Eingaben seit
           dem letzten gelungenen Speichern weg, und die Oberfläche sagte „geschlossen“. */
        var f = new Error('Das Aufmaß konnte nicht gespeichert werden und bleibt geöffnet. Bitte Speicherplatz prüfen oder das Projekt exportieren.');
        f.nichtGespeichert = true;
        throw f;
      }
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
    tastenNavigation: tastenNavigation, scrollHinweis: scrollHinweis,
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
