/* =============================================================================
 * views-tueren.js — Türliste und Aufmaß-Formular
 * ========================================================================== */
(function (global) {
  'use strict';
  var A = global.AppKern, K = global.Katalog, M = global.Model, Store = global.Store;
  var el = A.el, Zustand = A.Zustand;

  /* Katalogliste zuzüglich der in den Einstellungen ergänzten Einträge */
  function eigeneListe(schluessel) {
    var w = Zustand.einstellungen && Zustand.einstellungen[schluessel];
    return Array.isArray(w) ? w : [];
  }
  function liste(name, eigeneSchluessel) {
    return (K[name] || []).concat(eigeneSchluessel ? eigeneListe(eigeneSchluessel) : []);
  }
  function alleSysteme() { return K.SYSTEME.concat(eigeneListe('eigeneSysteme')); }

  /* =========================================================================
   * Maßauswahl
   * ======================================================================
   * Übliche Maße als Liste, abweichende über "anderes Maß …". Vor Ort wird
   * damit in aller Regel nur getippt statt getastet - das ist schneller,
   * mit dem Stift treffsicher und verhindert Zahlendreher.
   *
   * Das Feld für abweichende Maße ist bewusst ein Textfeld: In ein
   * Zahlenfeld schreibt Apples "Kritzeln" nicht hinein. Ein Komma wird
   * angenommen (27,5) und wie ein Punkt behandelt.
   */
  function massFeld(objekt, schluessel, beschriftung, werte, platzhalter, beiAenderung) {
    var behaelter = el('div', { class: 'feld', 'data-feld': schluessel });
    var reinText = String(beschriftung).replace(/<[^>]*>/g, '').trim();
    var einheit = /mm|cm/.test(String(beschriftung)) ? ' mm' : '';

    var freitext = el('input', {
      type: 'text', inputmode: 'decimal',
      placeholder: platzhalter || ('Maß' + (einheit ? ' in mm' : '')),
      value: objekt[schluessel] || '',
      autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
      oninput: function (e) {
        A.eingabeSchrittMerken('Eingabe: ' + reinText);
        /* Nur Ziffern, Komma und Punkt - alles andere wäre kein Maß */
        var roh = String(e.target.value).replace(/[^0-9.,]/g, '');
        if (roh !== e.target.value) e.target.value = roh;
        objekt[schluessel] = roh;
        A.alsGeaendertMarkieren();
        if (beiAenderung) beiAenderung();
      }
    });

    var auswahl = el('select', {
      onchange: function (e) {
        if (e.target.value === K.ANDERES_MASS) {
          freitext.classList.remove('versteckt');
          freitext.focus();
          return;
        }
        A.schrittMerken('Maß: ' + reinText);
        objekt[schluessel] = e.target.value;
        freitext.value = e.target.value;
        freitext.classList.add('versteckt');
        A.alsGeaendertMarkieren();
        if (beiAenderung) beiAenderung();
      }
    });
    auswahl.appendChild(el('option', { value: '', text: '– bitte wählen –' }));
    werte.forEach(function (w) {
      auswahl.appendChild(el('option', { value: w, text: w + einheit }));
    });
    auswahl.appendChild(el('option', { value: K.ANDERES_MASS, text: K.ANDERES_MASS }));

    var vorhanden = objekt[schluessel];
    if (vorhanden && werte.indexOf(String(vorhanden)) === -1) {
      auswahl.value = K.ANDERES_MASS;          /* Maß außerhalb der Liste */
    } else {
      auswahl.value = vorhanden || '';
      freitext.classList.add('versteckt');
    }

    behaelter.appendChild(el('label', { html: beschriftung }));
    behaelter.appendChild(auswahl);
    behaelter.appendChild(freitext);
    return behaelter;
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
    var offeneTueren = M.unvollstaendigeTueren(p);
    /* Ist nach einem Bereich gefiltert, entsteht die neue Tür gleich dort -
     * sonst müsste man den Bereich zweimal angeben. */
    function vorgabenAusFilter() {
      var f2 = Zustand.tuerFilter;
      return (f2 && f2.struktur && f2.struktur !== '__ohne__') ? { strukturId: f2.struktur } : null;
    }
    seite.appendChild(el('div', { class: 'zeile-verteilt', style: { marginBottom: '12px' } }, [
      el('div', { class: 'fuellen' }, [
        el('h1', { text: 'Türen' }),
        el('p', { class: 'hinweis', text: s.tueren + ' Positionen  ·  ' + s.tuerenGesamtAnzahl +
          ' Türen gesamt' + (s.nacharbeit ? '  ·  ' + s.nacharbeit + ' mit Nacharbeit' : '') +
          (offeneTueren.length ? ('  ·  ' + offeneTueren.length + ' unvollständig') : '') })
      ]),
      el('button', { class: 'haupt', text: '+ Neue Tür',
        onclick: function () { tuerBearbeiten(null, neuZeichnen, vorgabenAusFilter()); } })
    ]));

    /* Offene Pflichtangaben sind der häufigste Grund, ins Büro
     * zurückzukommen - deshalb direkt erreichbar. */
    if (offeneTueren.length) {
      seite.appendChild(el('div', { class: 'meldung warn', style: { marginBottom: '12px' } },
        el('div', { class: 'zeile-verteilt' }, [
          el('div', { class: 'fuellen' }, [
            el('b', { text: offeneTueren.length +
              (offeneTueren.length === 1 ? ' Tür ist unvollständig' : ' Türen sind unvollständig') }),
            el('div', { style: { marginTop: '4px', fontSize: '13px' },
              text: 'Es fehlen Pflichtangaben für die Bestellung.' })
          ]),
          el('button', { class: 'klein', text: Zustand.tuerFilter.unvollstaendig
              ? 'Alle Türen zeigen' : 'Nur diese zeigen',
            onclick: function () {
              Zustand.tuerFilter.unvollstaendig = !Zustand.tuerFilter.unvollstaendig;
              neuZeichnen();
            } })
        ])));
    }

    /* --- Filterleiste --- */
    var f = Zustand.tuerFilter;
    var suchfeld = el('input', {
      type: 'search', placeholder: 'Suche: Nr., Raum, System …', title: 'Sucht in Nummer, Bezeichnung, System und Bemerkung', value: f.suche,
      oninput: function (e) { f.suche = e.target.value; listeZeichnen(); }
    });
    var strukturWahl = el('select', {
      'aria-label': 'Bereich filtern',
      onchange: function (e) { f.struktur = e.target.value; listeZeichnen(); }
    });
    strukturWahl.appendChild(el('option', { value: '', text: 'Alle Bereiche' }));
    strukturOptionen().forEach(function (o) {
      strukturWahl.appendChild(el('option', { value: o.id, text: o.label }));
    });
    strukturWahl.appendChild(el('option', { value: '__ohne__', text: 'Ohne Zuordnung' }));
    strukturWahl.value = f.struktur;

    var statusWahl = el('select', {
      'aria-label': 'Status filtern',
      onchange: function (e) { f.status = e.target.value; listeZeichnen(); }
    });
    statusWahl.appendChild(el('option', { value: '', text: 'Alle Status' }));
    K.STATUS.forEach(function (st) { statusWahl.appendChild(el('option', { value: st.id, text: st.label })); });
    statusWahl.value = f.status;

    var systemWahl = el('select', {
      'aria-label': 'System filtern',
      onchange: function (e) { f.system = e.target.value; listeZeichnen(); }
    });
    systemWahl.appendChild(el('option', { value: '', text: 'Alle Systeme' }));
    var verwendete = {};
    p.tueren.forEach(function (t) {
      var sid = M.tuerSystemId(p, t);
      if (sid) verwendete[sid] = true;
    });
    Object.keys(verwendete).forEach(function (id) {
      systemWahl.appendChild(el('option', { value: id, text: K.systemLabel(id, eigeneListe('eigeneSysteme')) }));
    });
    systemWahl.value = f.system;

    seite.appendChild(el('div', { class: 'werkzeuge' }, [
      el('div', { class: 'suche' }, suchfeld),
      strukturWahl, statusWahl, systemWahl,
      el('button', { class: 'klein', text: 'Filter zurücksetzen', onclick: function () {
        Zustand.tuerFilter = { suche: '', struktur: '', status: '', system: '', unvollstaendig: false };
        neuZeichnen();
      } })
    ]));

    var listenBereich = el('div');
    seite.appendChild(listenBereich);
    listeZeichnen();

    function passt(t) {
      if (f.unvollstaendig && M.tuerVollstaendig(p, t)) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.system && M.tuerSystemId(p, t) !== f.system) return false;
      if (f.struktur === '__ohne__' && t.strukturId) return false;
      if (f.struktur && f.struktur !== '__ohne__' && t.strukturId !== f.struktur) return false;
      if (f.suche) {
        var q = f.suche.toLowerCase();
        var heu = [t.nummer, t.bezeichnung, t.kategorie, t.notiz, t.nacharbeitText,
                   K.zylinderText(t), K.beschlagText(t), K.schlossText(t),
                   K.systemLabel(M.tuerSystemId(p, t), eigeneListe('eigeneSysteme')), t.systemNotiz,
                   t.zutrittsseite, (t.tueranforderungen || []).join(' ')].join(' ').toLowerCase();
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
            onclick: function () { tuerBearbeiten(null, neuZeichnen, vorgabenAusFilter()); } })
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
    var p = Zustand.projekt;
    var status = K.statusById(t.status);
    var fehlendeAnzahl = M.pflichtfelder(p, t).length;
    var details = [];
    var sid = M.tuerSystemId(p, t);
    if (sid) details.push(K.systemLabel(sid, eigeneListe('eigeneSysteme')));
    var zyl = K.zylinderText(t);
    if (zyl) details.push(zyl);
    if (t.masseAussen || t.masseInnen) details.push((t.masseAussen || '–') + '/' + (t.masseInnen || '–') + ' mm');
    var bes = K.beschlagText(t);
    if (bes) details.push(bes);
    if (t.kategorie) details.push(t.kategorie);

    return el('div', {
      class: 'tuer-zeile',
      onclick: function () { tuerBearbeiten(t, neuZeichnen); }
    }, [
      /* Die Farbe der Nacharbeit steht im Katalog und nicht ein zweites Mal hier */
      el('div', { class: 'statusbalken', style: {
        background: t.nacharbeit ? K.statusById('nacharbeit').farbe : status.farbe } }),
      el('div', { class: 'inhalt' }, [
        el('div', { class: 'nummer', text: t.nummer || '—' }),
        el('div', { class: 'haupt' }, [
          el('div', { class: 'bez', text: t.bezeichnung || 'Ohne Bezeichnung' }),
          el('div', { class: 'detail', text: details.join('  ·  ') || 'Noch keine Angaben' })
        ]),
        el('div', { class: 'marken' }, [
          (parseInt(t.anzahl, 10) || 1) > 1 ? el('span', { class: 'marke-pille blau', text: t.anzahl + '×' }) : null,
          (t.fotos || []).length ? el('span', { class: 'marke-pille foto', text: String(t.fotos.length) }) : null,
          fehlendeAnzahl ? el('span', { class: 'marke-pille gelb',
            title: 'Fehlt: ' + M.pflichtfelder(p, t).map(function (x) { return x.label; }).join(', '),
            text: fehlendeAnzahl + '× Pflicht offen' }) : null,
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
   * ======================================================================
   * Zwei Ansichten auf dieselben Felder:
   *
   *   "geführt"     - ein Schritt je Bildschirm, nur die Felder, die jetzt
   *                   dran sind, mit Fortschrittsbalken. Gedacht für das
   *                   Aufmaß vor Ort und für Ungeübte.
   *   "alle Felder" - alle Abschnitte untereinander zum Nachbearbeiten.
   *
   * Pflichtangaben sind in beiden Ansichten gekennzeichnet. Sie blockieren
   * nichts: Vor Ort ist ein Maß nicht immer zu bekommen. Eine unvollständige
   * Tür wird gespeichert, erhält aber den Status "Klärung nötig" und
   * erscheint in der Liste der offenen Punkte.
   *
   * vorgaben: { strukturId } - gesetzt, wenn die Tür aus einem Bereich
   * heraus angelegt wird; der Bereich steht dann schon fest.
   */
  function tuerBearbeiten(vorhandene, neuZeichnen, vorgaben) {
    var p = Zustand.projekt;
    var istNeu = !vorhandene;
    /* Auf einer Kopie arbeiten, damit „Abbrechen“ wirklich verwirft */
    var t = istNeu ? M.neueTuer(vorlageFuerNeueTuer(vorgaben))
                   : JSON.parse(JSON.stringify(vorhandene));
    /* Der Stand beim Öffnen: Damit lässt sich beim Speichern erkennen,
     * was dieser Dialog geändert hat - und was in der Zwischenzeit von
     * anderswo (Abgleich mit einem zweiten Gerät) an der Tür geändert
     * wurde und erhalten bleiben muss. */
    var beimOeffnen = istNeu ? null : JSON.stringify(t);

    /* Die gewählte Ansicht überlebt den Dialog - getrennt für neue und
     * vorhandene Türen, weil beide Fälle verschieden benutzt werden. */
    var modusSchluessel = istNeu ? 'tuerModusNeu' : 'tuerModusAlt';
    if (!Zustand[modusSchluessel]) Zustand[modusSchluessel] = istNeu ? 'gefuehrt' : 'alle';

    var inhalt = el('div', { class: 'tuer-formular' });
    var modusLeiste = el('div');
    var statusLeiste = el('div', { class: 'pflicht-leiste' });
    var chipsOffen = null;   /* null = Vorgabe je Ansicht, sonst die Wahl im Dialog */
    var fortschritt = el('div', { class: 'schritt-fortschritt' });
    var koerper = el('div');
    inhalt.appendChild(modusLeiste);
    inhalt.appendChild(statusLeiste);
    inhalt.appendChild(fortschritt);
    inhalt.appendChild(koerper);

    /* --- Die Dateiauswahl für Fotos wird nur einmal erzeugt ------------- */
    var fotoEingabe = el('input', {
      type: 'file', accept: 'image/*', multiple: true, class: 'versteckt',
      onchange: function (e) { fotosHinzufuegen(Array.prototype.slice.call(e.target.files)); e.target.value = ''; }
    });
    var kameraEingabe = el('input', {
      type: 'file', accept: 'image/*', capture: 'environment', class: 'versteckt',
      onchange: function (e) { fotosHinzufuegen(Array.prototype.slice.call(e.target.files)); e.target.value = ''; }
    });

    /* =======================================================================
     * Abschnitte
     * =====================================================================
     * Jeder Abschnitt ist im geführten Ablauf ein Schritt und in der
     * Vollansicht ein aufklappbarer Block - dieselbe Baufunktion für beides.
     */
    function elektronikRelevant() {
      return M.istTuerElektronisch(p, t) || t.brauchtWandleser || K.beschlagIstElektronisch(t);
    }

    var ABSCHNITTE = [
      { id: 'lage',       titel: 'Türkennung und Lage',    schritt: 'Wo ist die Tür?',       immer: true,  bauen: lageBauen },
      { id: 'bauteile',   titel: 'Anlage und Bauteile',    schritt: 'Was wird gebraucht?',   immer: true,  bauen: bauteileBauen },
      { id: 'zylinder',   titel: 'Zylinder',               schritt: 'Zylinder',              wenn: function () { return t.brauchtZylinder; }, bauen: zylinderBauen },
      { id: 'beschlag',   titel: 'Beschlag / Drücker',     schritt: 'Beschlag / Drücker',    wenn: function () { return t.brauchtBeschlag; }, bauen: beschlagBauen },
      { id: 'schloss',    titel: 'Schloss',                schritt: 'Schloss',               wenn: function () { return t.brauchtSchloss; }, bauen: schlossBauen },
      { id: 'zutritt',    titel: 'Zutritt und Anforderungen', schritt: 'Zutritt',            immer: true,  bauen: zutrittBauen },
      { id: 'elektronik', titel: 'Elektronik und Vernetzung', schritt: 'Elektronik',         wenn: elektronikRelevant, bauen: elektronikBauen },
      { id: 'tuerdaten',  titel: 'Türdaten',               schritt: 'Türdaten',              immer: true,  freiwillig: true, bauen: tuerdatenBauen },
      { id: 'bestand',    titel: 'Bestand / Altanlage',    schritt: 'Bestand',               immer: true,  freiwillig: true, bauen: bestandBauen },
      { id: 'abschluss',  titel: 'Bemerkung, Nacharbeit, Fotos', schritt: 'Bemerkung und Fotos', immer: true, bauen: abschlussBauen }
    ];

    function aktive() {
      return ABSCHNITTE.filter(function (a) { return a.immer || (a.wenn && a.wenn()); });
    }

    var schrittId = 'lage';

    /* --- 1. Lage ------------------------------------------------------- */
    function lageBauen(ziel) {
      var optionen = strukturOptionen();
      ziel.appendChild(el('div', { class: 'raster' }, [
        A.textFeld(t, 'nummer', 'Tür-Nr. <span class="einheit">(lfd., änderbar)</span>',
          { platzhalter: '001', inputmode: 'numeric' }),
        A.textFeld(t, 'bezeichnung', 'Bezeichnung / Raum', { platzhalter: 'z. B. Büro Empfang' }),
        A.auswahlFeld(t, 'kategorie', 'Türkategorie', K.TUERKATEGORIEN, { leerText: '– ohne Angabe –' }),
        optionen.length
          ? A.auswahlFeld(t, 'strukturId', 'Standort / Gebäude / Bereich', optionen,
              { leerText: '– bitte wählen –', beiAenderung: markieren })
          : A.textFeld(t, 'etage', 'Etage / Bereich <span class="einheit">(Freitext)</span>',
              { beiAenderung: markieren }),
        A.zahlFeld(t, 'anzahl', 'Anzahl baugleicher Türen', { min: 1, max: 999, vorgabe: 1 })
      ]));
      ziel.appendChild(statusFeldBauen());
    }

    /* Der Status wird aus der Vollständigkeit geführt, solange er nicht
     * selbst gewählt wurde. Das steht ausdrücklich dort, wo er sichtbar
     * ist - sonst wirkt eine Änderung von allein wie ein Fehler. */
    function statusFeldBauen() {
      var kasten = el('div', { style: { marginTop: '12px' } });
      var auswahl = A.auswahlFeld(t, 'status', 'Status', K.STATUS, {
        leerText: '– offen –',
        beiAenderung: function () { t.statusVonHand = true; statusFeldNeu(); }
      });
      kasten.appendChild(el('div', { class: 'raster' }, [auswahl]));
      if (t.statusVonHand) {
        kasten.appendChild(el('div', { class: 'knopfleiste', style: { marginTop: '6px' } },
          el('button', { class: 'klein', text: 'Status wieder automatisch führen',
            title: 'Vollständig = Aufgemessen, unvollständig = Klärung nötig',
            onclick: function () {
              A.schrittMerken('Status wieder automatisch');
              t.statusVonHand = false;
              M.statusAusPruefung(p, t);
              statusFeldNeu();
            } })));
      } else {
        kasten.appendChild(el('p', { class: 'zart', style: { marginTop: '4px' },
          text: 'Wird automatisch geführt: vollständig = Aufgemessen, unvollständig = Klärung nötig.' }));
      }
      return kasten;
    }
    function statusFeldNeu() { abschnittNeu('lage'); markieren(); }

    /* --- 2. Anlage und Bauteile ---------------------------------------- */
    function bauteileBauen(ziel) {
      var eigene = eigeneListe('eigeneSysteme');
      var sid = M.tuerSystemId(p, t);

      if (!p.anlagenart) {
        ziel.appendChild(el('div', { class: 'meldung warn', style: { marginTop: '0' } },
          el('div', {}, [
            el('b', { text: 'Für dieses Projekt ist noch keine Schließanlage festgelegt. ' }),
            'Bitte unter „Stammdaten“ die Art der Anlage und das System wählen.'
          ])));
      } else {
        var marken = el('div', { class: 'zeile-verteilt' }, [
          el('span', { class: 'marke-pille blau',
            text: (K.ANLAGENART.filter(function (a) { return a.id === p.anlagenart; })[0] || {}).label || p.anlagenart }),
          sid ? el('span', { class: 'marke-pille', text: K.systemLabel(sid, eigene) }) : null,
          p.systemDetail ? el('span', { class: 'zart', text: p.systemDetail }) : null
        ]);
        ziel.appendChild(marken);
      }

      /* Nur bei einer Hybridanlage ist an der Tür noch etwas zu entscheiden */
      if (p.anlagenart === 'hybrid') {
        ziel.appendChild(el('div', { class: 'raster', style: { marginTop: '12px' } }, [
          A.auswahlFeld(t, 'tuerTechnologie', 'Diese Tür wird ausgeführt als', [
            { id: 'mechanik',   label: 'Mechanisch' + (p.systemMechanik ? '  –  ' + K.systemLabel(p.systemMechanik, eigene) : '') },
            { id: 'elektronik', label: 'Elektronisch' + (p.systemElektronik ? '  –  ' + K.systemLabel(p.systemElektronik, eigene) : '') }
          ], { leerText: '– bitte wählen –', beiAenderung: function () { ansichtNeu(); } })
        ]));
      } else if (t.tuerTechnologie) {
        t.tuerTechnologie = '';   /* bei reiner Anlage gegenstandslos */
      }

      var sys = K.systemById(sid, eigene);
      if (sys && sys.hinweis) {
        ziel.appendChild(el('p', { class: 'hinweis', style: { marginTop: '8px' }, text: sys.hinweis }));
      }

      ziel.appendChild(el('hr', { class: 'trenner' }));
      ziel.appendChild(el('h3', { text: 'Welche Bauteile hat diese Tür?', style: { marginTop: '0' } }));
      var schalter = el('div', { class: 'raster eng', 'data-feld': 'bauteile' }, [
        A.schalterFeld(t, 'brauchtZylinder', 'Zylinder', function () { ansichtNeu(); }),
        A.schalterFeld(t, 'brauchtBeschlag', 'Beschlag / Drücker', function () { ansichtNeu(); }),
        A.schalterFeld(t, 'brauchtSchloss', 'Schloss', function () { ansichtNeu(); }),
        A.schalterFeld(t, 'brauchtWandleser', 'Wandleser', function () { ansichtNeu(); })
      ]);
      ziel.appendChild(schalter);

      ziel.appendChild(el('div', { class: 'raster', style: { marginTop: '12px' } }, [
        A.textFeld(t, 'systemNotiz', 'Besonderheit zu dieser Tür <span class="einheit">(nur bei Abweichung)</span>',
          { platzhalter: 'z. B. Fremdfabrikat im Bestand, Sonderausführung' })
      ]));
    }

    /* --- 3. Zylinder --------------------------------------------------- */
    var gesamtAnzeige = el('p', { class: 'zart', style: { marginTop: '4px' } });
    function gesamtlaengeZeigen() {
      var gl = gesamtlaenge(t);
      gesamtAnzeige.textContent = gl ? ('Gesamtlänge ' + gl + ' mm') : '';
    }
    function laengenGeaendert() {
      gesamtlaengeZeigen();
      widerspruecheZeigen();
      markieren();
    }

    function zylinderBauen(ziel) {
      var raster = el('div', { class: 'raster' }, [
        A.auswahlFeld(t, 'zylinderBauform', 'Art des Zylinders <span class="einheit">(Bauform)</span>',
          liste('ZYLINDER_BAUFORM', 'eigeneZylinderarten'),
          { leerText: '– bitte wählen –', beiAenderung: function () { abschnittNeu('zylinder'); markieren(); } }),
        massFeld(t, 'masseAussen', 'Länge außen <span class="einheit">mm</span>',
          K.ZYLINDER_LAENGE, 'z. B. 35', laengenGeaendert),
        massFeld(t, 'masseInnen', 'Länge innen <span class="einheit">mm</span>',
          K.ZYLINDER_LAENGE, 'z. B. 40', laengenGeaendert)
      ]);
      /* Knaufseite ist nur beim einfachen Knaufzylinder eine offene Frage */
      if (t.zylinderBauform === 'Knaufzylinder') {
        raster.appendChild(A.auswahlFeld(t, 'zylinderKnaufseite',
          'Knaufseite <span class="einheit">(vom mech. festen Knauf)</span>', K.KNAUFSEITE,
          { leerText: '– bitte wählen –', beiAenderung: markieren }));
      } else if (t.zylinderKnaufseite) {
        t.zylinderKnaufseite = '';
      }
      ziel.appendChild(raster);
      /* Gesamtlänge mitrechnen: danach wird bestellt. Sie wird an Ort und
       * Stelle fortgeschrieben - ein Neuaufbau des Abschnitts würde eine
       * laufende Eingabe zerreißen, und mit dem Stift wäre das fatal. */
      ziel.appendChild(gesamtAnzeige);
      gesamtlaengeZeigen();
      ziel.appendChild(A.chipFeld(t, 'zylinderAusfuehrung',
        'Ausführung <span class="einheit">(nur wenn zutreffend)</span>',
        liste('ZYLINDER_AUSFUEHRUNG')));
      ziel.appendChild(widerspruecheBauen());
    }

    /* --- 4. Beschlag --------------------------------------------------- */
    function beschlagBauen(ziel) {
      var raster = el('div', { class: 'raster' }, [
        A.auswahlFeld(t, 'beschlagBauform', 'Bauform', liste('BESCHLAG_BAUFORM', 'eigeneBeschlagarten'),
          { leerText: '– bitte wählen –', beiAenderung: function () { abschnittNeu('beschlag'); markieren(); } }),
        A.auswahlFeld(t, 'beschlagAusfuehrung', 'Ausführung', K.BESCHLAG_AUSFUEHRUNG,
          { leerText: '– bitte wählen –', beiAenderung: function () { ansichtNeu(); } }),
        A.auswahlFeld(t, 'beschlagBestueckung', 'Bestückung', K.BESCHLAG_BESTUECKUNG,
          { leerText: '– bitte wählen –', beiAenderung: markieren })
      ]);
      /* Sicherheitsklasse nur beim Schutzbeschlag */
      if (t.beschlagBauform === 'Schutzbeschlag') {
        raster.appendChild(A.auswahlFeld(t, 'beschlagSicherheit', 'Sicherheitsklasse', K.BESCHLAG_SICHERHEIT));
      } else if (t.beschlagSicherheit) {
        t.beschlagSicherheit = '';
      }
      ziel.appendChild(raster);
      ziel.appendChild(el('h3', { text: 'Maße für den Beschlag' }));
      ziel.appendChild(masseRasterBauen());
      ziel.appendChild(widerspruecheBauen());
    }

    /* Dornmaß, Entfernung, Vierkant, Türblattstärke und DIN gelten für
     * Beschlag und Schloss gemeinsam. Sie werden deshalb an genau einer
     * Stelle erfasst und in beiden Abschnitten dasselbe Raster gezeigt. */
    function masseRasterBauen() {
      return el('div', { class: 'raster' }, [
        massFeld(t, 'dornmass', 'Dornmaß <span class="einheit">mm</span>', K.DORNMASS, 'z. B. 55', markieren),
        massFeld(t, 'entfernung', 'Entfernung <span class="einheit">mm</span>', K.ENTFERNUNG, 'z. B. 72', markieren),
        massFeld(t, 'vierkant', 'Vierkant / Nuss <span class="einheit">mm</span>', K.VIERKANT, 'z. B. 8', markieren),
        massFeld(t, 'tuerblattstaerke', 'Türblattstärke <span class="einheit">mm</span>',
          K.TUERBLATTSTAERKE, 'z. B. 68', markieren),
        A.auswahlFeld(t, 'dinRichtung', 'DIN-Richtung', K.DIN_RICHTUNG,
          { leerText: '– bitte wählen –', beiAenderung: markieren })
      ]);
    }

    /* --- 5. Schloss ---------------------------------------------------- */
    function schlossBauen(ziel) {
      ziel.appendChild(el('div', { class: 'raster' }, [
        A.auswahlFeld(t, 'schlossBauform', 'Bauform', liste('SCHLOSS_BAUFORM', 'eigeneSchlossarten'),
          { leerText: '– bitte wählen –', beiAenderung: function () { abschnittNeu('schloss'); markieren(); } }),
        A.auswahlFeld(t, 'schlossFunktion', 'Funktion', K.SCHLOSS_FUNKTION,
          { leerText: '– bitte wählen –', beiAenderung: function () { abschnittNeu('schloss'); markieren(); } })
      ]));
      /* Dieselben Maße wie beim Beschlag - nur einmal erfasst */
      if (!t.brauchtBeschlag) {
        ziel.appendChild(el('h3', { text: 'Maße für das Schloss' }));
        ziel.appendChild(masseRasterBauen());
      } else {
        ziel.appendChild(el('p', { class: 'hinweis', style: { marginTop: '10px' },
          text: 'Dornmaß, Entfernung, Vierkant, Türblattstärke und DIN-Richtung stehen beim Beschlag – sie gelten für beide Bauteile und werden nur einmal erfasst.' }));
      }

      /* Einsteckschloss im Detail: freiwillig, aber bestellentscheidend */
      ziel.appendChild(el('details', { class: 'abschnitt', style: { marginTop: '14px' } }, [
        el('summary', {}, [
          el('span', { text: 'Einsteckschloss im Detail' }),
          el('span', { class: 'zusatz', text: K.schlossDetailText(t) ? 'ausgefüllt' : 'freiwillig' })
        ]),
        el('div', { class: 'koerper' }, [
          el('div', { class: 'raster' }, [
            A.auswahlFeld(t, 'schlossStulpform', 'Stulpform', K.STULPFORM, { leerText: '– ohne Angabe –' }),
            massFeld(t, 'schlossStulpbreite', 'Stulpbreite <span class="einheit">mm</span>', K.STULPBREITE, 'z. B. 24'),
            massFeld(t, 'schlossStulplaenge', 'Stulplänge <span class="einheit">mm</span>',
              K.STULPLAENGE, 'z. B. 235'),
            A.auswahlFeld(t, 'schlossFallenart', 'Fallenart', K.FALLENART, { leerText: '– ohne Angabe –' }),
            massFeld(t, 'schlossRiegelausschluss', 'Riegelausschluss <span class="einheit">mm</span>',
              K.RIEGELAUSSCHLUSS, 'z. B. 20'),
            A.auswahlFeld(t, 'schlossVerriegelungspunkte', 'Verriegelungspunkte',
              K.VERRIEGELUNGSPUNKTE, { leerText: '– ohne Angabe –' }),
            A.auswahlFeld(t, 'schlossNorm', 'Norm / Zulassung', K.SCHLOSS_NORM, { leerText: '– ohne Angabe –' }),
            A.textFeld(t, 'stulpmass', 'Stulp: Sonstiges <span class="einheit">(Freitext)</span>')
          ])
        ])
      ]));
      ziel.appendChild(widerspruecheBauen());
    }

    /* --- 6. Zutritt ---------------------------------------------------- */
    function zutrittBauen(ziel) {
      ziel.appendChild(el('div', { class: 'raster' }, [
        A.auswahlFeld(t, 'zutrittsseite', 'Von welcher Seite wird geöffnet?', K.ZUTRITTSSEITE,
          { leerText: '– bitte wählen –', beiAenderung: markieren })
      ]));
      var feld = A.chipFeld(t, 'tueranforderungen',
        'Bauliche Anforderungen <span class="einheit">(mehrere möglich)</span>',
        liste('TUERANFORDERUNG', 'eigeneZutrittsarten'));
      /* Eine Änderung hier kann einen Widerspruch zum Schloss auflösen */
      feld.addEventListener('click', function () { setTimeout(widerspruecheZeigen, 0); });
      ziel.appendChild(feld);
      ziel.appendChild(el('p', { class: 'hinweis', style: { marginTop: '10px' },
        text: 'Bei Flucht- und Rettungswegen sowie Brand- und Rauchschutztüren sind die bauaufsichtlichen Anforderungen zu beachten; die Auswahl hier ersetzt keine Prüfung vor Ort.' }));
      ziel.appendChild(widerspruecheBauen());
    }

    /* --- 7. Elektronik ------------------------------------------------- */
    function elektronikBauen(ziel) {
      ziel.appendChild(el('div', { class: 'raster' }, [
        A.auswahlFeld(t, 'elStromversorgung', 'Stromversorgung',
          ['Batterie', '12V vorhanden', '24V vorhanden', '230V vorhanden', 'PoE', 'muss verlegt werden'],
          { leerText: '– bitte wählen –', beiAenderung: markieren }),
        A.auswahlFeld(t, 'elVernetzung', 'Vernetzung',
          ['offline (Stand-alone)', 'virtuelles Netzwerk', 'online / verkabelt', 'funkvernetzt', 'noch offen'],
          { leerText: '– bitte wählen –', beiAenderung: markieren }),
        A.auswahlFeld(t, 'elFunkabdeckung', 'Funkabdeckung vor Ort',
          ['gut', 'mittel', 'schlecht', 'nicht geprüft'], { leerText: '– ohne Angabe –' }),
        A.auswahlFeld(t, 'elKabeluebergang', 'Kabel / Leerrohr an der Tür', K.KABELUEBERGANG,
          { leerText: '– ohne Angabe –' })
      ]));
      ziel.appendChild(el('div', { style: { marginTop: '10px' } }, [
        A.schalterFeld(t, 'elTuerueberwachung', 'Türüberwachung / Türzustandsmeldung gewünscht'),
        A.schalterFeld(t, 'elTueroeffnerBestand', 'Elektrischer Türöffner ist schon vorhanden')
      ]));
      ziel.appendChild(el('div', { class: 'raster', style: { marginTop: '10px' } }, [
        A.textFeld(t, 'elLeitungsweg', 'Leitungsweg <span class="einheit">(woher kommt das Kabel?)</span>',
          { platzhalter: 'z. B. aus Technikraum UG über Steigschacht' }),
        A.bereichFeld(t, 'elBemerkung', 'Bemerkung Elektronik', { zeilen: 2 })
      ]));
    }

    /* --- 8. Türdaten (freiwillig) -------------------------------------- */
    function tuerdatenBauen(ziel) {
      ziel.appendChild(el('p', { class: 'hinweis', style: { marginTop: '0' },
        text: 'Freiwillig. Türblattstärke und DIN-Richtung stehen beim Bauteil und werden hier nicht erneut gefragt.' }));
      ziel.appendChild(el('div', { class: 'raster' }, [
        massFeld(t, 'tuerbreite', 'Türbreite <span class="einheit">mm</span>',
          K.TUERBREITE, 'z. B. 885'),
        massFeld(t, 'tuerhoehe', 'Türhöhe <span class="einheit">mm</span>',
          K.TUERHOEHE, 'z. B. 2010'),
        A.auswahlFeld(t, 'tuerAnschlag', 'Türanschlag', K.TUER_ANSCHLAG, { leerText: '– ohne Angabe –' }),
        A.auswahlFeld(t, 'tuermaterial', 'Türblattmaterial', K.TUERMATERIAL, { leerText: '– ohne Angabe –' }),
        massFeld(t, 'profilbreite', 'Profilbreite <span class="einheit">mm</span>',
          K.PROFILBREITE, 'z. B. 60'),
        A.auswahlFeld(t, 'oeffnungsrichtung', 'Öffnungsrichtung', K.TUER_OEFFNUNG, { leerText: '– ohne Angabe –' }),
        A.textFeld(t, 'bohrbild', 'Bohrbild / Lochung')
      ]));
      ziel.appendChild(el('div', { class: 'raster', style: { marginTop: '10px' } }, [
        A.bereichFeld(t, 'masseBemerkung', 'Bemerkung zu den Maßen', { zeilen: 2 })
      ]));
    }

    /* --- 9. Bestand (freiwillig) --------------------------------------- */
    function bestandBauen(ziel) {
      ziel.appendChild(el('div', { class: 'raster' }, [
        A.textFeld(t, 'bestandFabrikat', 'Vorhandenes Fabrikat', { platzhalter: 'z. B. EVVA, Kaba, ABUS' }),
        A.auswahlFeld(t, 'bestandZylinderart', 'Vorhandene Zylinderart',
          liste('ZYLINDER_BAUFORM', 'eigeneZylinderarten'), { leerText: '– unbekannt –' }),
        massFeld(t, 'bestandLaengeAussen', 'Vorhandene Länge außen <span class="einheit">mm</span>',
          K.ZYLINDER_LAENGE, 'z. B. 30'),
        massFeld(t, 'bestandLaengeInnen', 'Vorhandene Länge innen <span class="einheit">mm</span>',
          K.ZYLINDER_LAENGE, 'z. B. 35'),
        A.zahlFeld(t, 'bestandAnzahlSchluessel', 'Anzahl vorhandener Schlüssel',
          { min: 0, max: 999, vorgabe: 0 })
      ]));
      if (String(t.bestandLaenge || '').trim()) {
        ziel.appendChild(el('div', { class: 'raster', style: { marginTop: '10px' } }, [
          A.textFeld(t, 'bestandLaenge',
            'Vorhandene Länge <span class="einheit">(Eintrag aus einer früheren Fassung)</span>')
        ]));
      }
      ziel.appendChild(el('div', { class: 'raster', style: { marginTop: '10px' } }, [
        A.bereichFeld(t, 'bestandBemerkung', 'Bemerkung zum Bestand', { zeilen: 2 })
      ]));
    }

    /* --- 10. Bemerkung, Nacharbeit, Fotos ------------------------------ */
    function abschlussBauen(ziel) {
      ziel.appendChild(el('div', { class: 'raster' }, [
        A.bereichFeld(t, 'notiz', 'Bemerkung zur Tür', { zeilen: 3 })
      ]));
      ziel.appendChild(el('div', { style: { marginTop: '10px' } }, [
        A.schalterFeld(t, 'nacharbeit', 'Nacharbeit erforderlich',
          function () { abschnittNeu('abschluss'); })
      ]));
      if (t.nacharbeit) {
        ziel.appendChild(el('div', { class: 'raster', style: { marginTop: '10px' } }, [
          A.bereichFeld(t, 'nacharbeitText', 'Was ist nachzuarbeiten?', {
            zeilen: 3, platzhalter: 'z. B. Maß fehlt, Rücksprache mit Kunde nötig, Tür war verschlossen …'
          })
        ]));
      }
      ziel.appendChild(el('hr', { class: 'trenner' }));
      ziel.appendChild(el('h3', { text: 'Fotos', style: { marginTop: '0' } }));
      ziel.appendChild(el('div', { class: 'knopfleiste', style: { marginBottom: '12px' } }, [
        el('button', { class: 'haupt', text: '📷 Foto aufnehmen',
          onclick: function () { kameraEingabe.click(); } }),
        el('button', { text: 'Aus Mediathek wählen', onclick: function () { fotoEingabe.click(); } }),
        fotoEingabe, kameraEingabe
      ]));
      var raster = el('div', { class: 'foto-raster' });
      (t.fotos || []).forEach(function (foto, index) {
        raster.appendChild(el('div', { class: 'foto-karte' }, [
          el('img', { src: foto.dataUrl, alt: foto.beschriftung || 'Türfoto', loading: 'lazy' }),
          el('div', { class: 'unten' }, [
            el('input', { type: 'text', value: foto.beschriftung || '', placeholder: 'Beschriftung',
              oninput: function (e) { foto.beschriftung = e.target.value; } }),
            el('button', { class: 'gefahr klein', text: 'Entfernen', onclick: function () {
              t.fotos.splice(index, 1); abschnittNeu('abschluss');
            } })
          ])
        ]));
      });
      if (!(t.fotos || []).length) {
        raster.appendChild(el('p', { class: 'zart', text: 'Noch keine Fotos zu dieser Tür.' }));
      }
      ziel.appendChild(raster);
    }

    function fotosHinzufuegen(dateien) {
      if (!dateien.length) return;
      var eins = Zustand.einstellungen || {};
      A.toast(dateien.length === 1 ? 'Foto wird verarbeitet …' : dateien.length + ' Fotos werden verarbeitet …');
      Promise.all(dateien.map(function (d) {
        return Store.fotoVerarbeiten(d, eins.fotoMaxKante || 1280, eins.fotoQualitaet || 0.72)
          .then(function (foto) { t.fotos.push(foto); return true; })
          .catch(function (fehler) { A.toast(fehler.message, 'fehler'); return false; });
      })).then(function (ergebnisse) {
        var erfolgreich = ergebnisse.filter(Boolean).length;
        if (erfolgreich) A.toast(erfolgreich + ' Foto(s) hinzugefügt.', 'ok');
        abschnittNeu('abschluss');
      });
    }

    /* --- Widersprüche --------------------------------------------------
     * Weist auf Angaben hin, die nicht zusammenpassen - statt sie ein
     * zweites Mal abzufragen. */
    function widerspruecheBauen() {
      return el('div', { class: 'widersprueche' });
    }

    /* Die Hinweise werden in den vorhandenen Kästen erneuert, nicht neu
     * aufgebaut: Ein Neuaufbau würde ein Feld, in das gerade geschrieben
     * wird, unter dem Stift wegziehen. */
    function widerspruecheZeigen() {
      var meldungen = [];
      var istFlucht = (t.tueranforderungen || []).indexOf('Flucht- und Rettungsweg') !== -1;

      if (istFlucht && t.brauchtSchloss && t.schlossFunktion && !/Panik/.test(t.schlossFunktion)) {
        meldungen.push('Die Tür ist als Flucht- und Rettungsweg gekennzeichnet, das Schloss hat aber keine Panikfunktion.');
      }
      if (istFlucht && !t.brauchtSchloss) {
        meldungen.push('Flucht- und Rettungsweg: Bitte das Schloss mit erfassen, die Panikfunktion ist bestellrelevant.');
      }
      if (t.brauchtZylinder && (t.zylinderAusfuehrung || []).indexOf('Anti-Panik') !== -1 && !istFlucht) {
        meldungen.push('Zylinder mit Anti-Panik gewählt – gehört diese Tür zum Flucht- und Rettungsweg?');
      }
      if (t.zylinderBauform === 'Halbzylinder' && t.masseInnen &&
          parseInt(String(t.masseInnen).replace(',', '.'), 10) > 15) {
        meldungen.push('Bei einem Halbzylinder ist die Innenlänge üblicherweise 10 mm.');
      }
      Array.prototype.forEach.call(inhalt.querySelectorAll('.widersprueche'), function (kasten) {
        A.leeren(kasten);
        meldungen.forEach(function (m) {
          kasten.appendChild(el('div', { class: 'meldung warn', style: { marginTop: '12px' } },
            el('div', { text: m })));
        });
      });
    }

    /* =======================================================================
     * Pflichtangaben kennzeichnen
     * =====================================================================
     * Eine Quelle für alles: dieselbe Prüfung, die Türliste, Prüfprotokoll
     * und Materialliste verwenden. Gekennzeichnet wird jedes Pflichtfeld,
     * rot umrandet nur die noch offenen.
     */
    function markieren() {
      var pflicht = M.pflichtSchluessel(p, t);
      var offen = {};
      M.pflichtfelder(p, t).forEach(function (f) { offen[f.schluessel] = f.label; });

      Array.prototype.forEach.call(inhalt.querySelectorAll('[data-feld]'), function (knoten) {
        var k = knoten.getAttribute('data-feld');
        var istPflicht = Object.prototype.hasOwnProperty.call(pflicht, k);
        knoten.classList.toggle('pflicht', istPflicht);
        knoten.classList.toggle('pflicht-offen', istPflicht && !!offen[k]);
      });

      A.leeren(statusLeiste);
      var fehlende = M.pflichtfelder(p, t);
      if (!fehlende.length) {
        statusLeiste.className = 'pflicht-leiste fertig';
        statusLeiste.appendChild(el('span', { class: 'zeichen', text: '✓' }));
        statusLeiste.appendChild(el('span', { text: 'Alle Pflichtangaben vorhanden' }));
      } else {
        statusLeiste.className = 'pflicht-leiste offen';
        statusLeiste.appendChild(el('span', { class: 'zeichen', text: '!' }));
        /* Im geführten Ablauf bleibt die Liste der fehlenden Angaben
         * eingeklappt: Der Fortschrittsbalken zeigt ohnehin, in welchen
         * Schritten etwas fehlt, und auf dem Telefon würde die Liste sonst
         * die eigentliche Frage vom Bildschirm schieben. In der Vollansicht
         * ist sie aufgeklappt - dort sind die Chips der schnellste Weg zum
         * Feld. Ein Antippen der Zeile klappt um; die Wahl bleibt, solange
         * der Dialog offen ist. */
        var zeigen = chipsOffen === null ? Zustand[modusSchluessel] !== 'gefuehrt' : chipsOffen;
        statusLeiste.appendChild(el('button', {
          type: 'button', class: 'fuellen pflicht-umschalter',
          'aria-expanded': zeigen ? 'true' : 'false',
          title: zeigen ? 'Liste einklappen' : 'Zeigen, welche Angaben fehlen',
          onclick: function () { chipsOffen = !zeigen; markieren(); }
        }, [
          el('span', { text: fehlende.length +
            (fehlende.length === 1 ? ' Pflichtangabe fehlt' : ' Pflichtangaben fehlen') +
            '  ·  Speichern ist möglich' }),
          el('span', { class: 'pfeil', 'aria-hidden': 'true', text: zeigen ? '▴' : '▾' })
        ]));
        if (zeigen) {
          var chips = el('span', { class: 'chips' });
          fehlende.slice(0, 8).forEach(function (f) {
            chips.appendChild(el('button', {
              type: 'button', class: 'chip klein', text: f.label,
              title: 'Zu dieser Angabe springen',
              onclick: function () { zuAbschnitt(f.abschnitt, f.schluessel); }
            }));
          });
          statusLeiste.appendChild(chips);
        }
      }
      fortschrittZeichnen();
    }

    /* Zu einer fehlenden Angabe springen - im geführten Ablauf wechselt
     * dafür der Schritt, in der Vollansicht wird der Block aufgeklappt. */
    function zuAbschnitt(abschnittId, feldName) {
      var vorhanden = aktive().filter(function (a) { return a.id === abschnittId; })[0];
      if (!vorhanden) return;
      if (Zustand[modusSchluessel] === 'gefuehrt') {
        schrittId = abschnittId;
        ansichtNeu();
      }
      setTimeout(function () {
        var ziel = inhalt.querySelector('[data-abschnitt="' + abschnittId + '"]');
        if (ziel && ziel.tagName === 'DETAILS') ziel.open = true;
        var feldKnoten = feldName ? inhalt.querySelector('[data-feld="' + feldName + '"]') : null;
        var scrollZiel = feldKnoten || ziel;
        if (scrollZiel && scrollZiel.scrollIntoView) {
          scrollZiel.scrollIntoView({ block: 'center' });
        }
        var eingabe = feldKnoten && feldKnoten.querySelector('input, select, textarea');
        if (eingabe) eingabe.focus();
      }, 30);
    }

    /* =======================================================================
     * Aufbau der Ansicht
     * ==================================================================== */
    function modusLeisteZeichnen() {
      A.leeren(modusLeiste);
      var gefuehrt = Zustand[modusSchluessel] === 'gefuehrt';
      modusLeiste.appendChild(el('div', { class: 'modus-leiste' }, [
        el('div', { class: 'umschalter', role: 'tablist' }, [
          el('button', { type: 'button', class: gefuehrt ? 'aktiv' : '', text: 'Schritt für Schritt',
            'aria-pressed': gefuehrt ? 'true' : 'false',
            onclick: function () { Zustand[modusSchluessel] = 'gefuehrt'; ansichtNeu(); } }),
          el('button', { type: 'button', class: gefuehrt ? '' : 'aktiv', text: 'Alle Felder',
            'aria-pressed': gefuehrt ? 'false' : 'true',
            onclick: function () { Zustand[modusSchluessel] = 'alle'; ansichtNeu(); } })
        ])
      ]));
    }

    function fortschrittZeichnen() {
      A.leeren(fortschritt);
      if (Zustand[modusSchluessel] !== 'gefuehrt') return;
      var liste2 = aktive();
      var index = 0;
      liste2.forEach(function (a, i) { if (a.id === schrittId) index = i; });
      fortschritt.appendChild(el('div', { class: 'zeile-verteilt' }, [
        el('div', { class: 'fuellen' }, [
          el('b', { text: 'Schritt ' + (index + 1) + ' von ' + liste2.length }),
          el('span', { class: 'zart', text: '  ·  ' + liste2[index].schritt +
            (liste2[index].freiwillig ? '  (freiwillig)' : '') })
        ])
      ]));
      var balken = el('div', { class: 'balken' });
      liste2.forEach(function (a, i) {
        var fehltHier = M.pflichtfelder(p, t).some(function (f) { return f.abschnitt === a.id; });
        balken.appendChild(el('button', {
          type: 'button',
          class: 'stufe' + (i === index ? ' aktiv' : '') + (fehltHier ? ' offen' : '') +
                 (i < index ? ' erledigt' : ''),
          title: a.schritt + (fehltHier ? ' – Pflichtangabe fehlt' : ''),
          'aria-label': a.schritt,
          onclick: function () { schrittId = a.id; ansichtNeu(); }
        }));
      });
      fortschritt.appendChild(balken);
    }

    /* Einen einzelnen Abschnitt neu aufbauen - ohne den Rest anzurühren,
     * damit laufende Eingaben nicht verloren gehen. */
    function abschnittNeu(id) {
      var huelle = inhalt.querySelector('[data-abschnitt="' + id + '"]');
      if (!huelle) return;
      var ziel = huelle.classList.contains('abschnitt')
        ? huelle.querySelector('.koerper') : huelle;
      if (!ziel) return;
      A.leeren(ziel);
      var def = ABSCHNITTE.filter(function (a) { return a.id === id; })[0];
      if (def) def.bauen(ziel);
      markieren();
    }

    function ansichtNeu() {
      A.leeren(koerper);
      var liste2 = aktive();
      if (!liste2.filter(function (a) { return a.id === schrittId; }).length) {
        schrittId = liste2[0].id;
      }
      if (Zustand[modusSchluessel] === 'gefuehrt') {
        var def = liste2.filter(function (a) { return a.id === schrittId; })[0];
        var huelle = el('div', { class: 'schritt', 'data-abschnitt': def.id }, [
          el('h2', { text: def.schritt, style: { marginTop: '0' } })
        ]);
        var ziel = el('div');
        huelle.appendChild(ziel);
        def.bauen(ziel);
        koerper.appendChild(huelle);
      } else {
        liste2.forEach(function (a) {
          var inner = el('div', { class: 'koerper' });
          var block = el('details', {
            class: 'abschnitt', 'data-abschnitt': a.id,
            open: !a.freiwillig
          }, [
            el('summary', {}, [
              el('span', { text: a.titel }),
              el('span', { class: 'zusatz', text: a.freiwillig ? 'freiwillig' : '' })
            ]),
            inner
          ]);
          a.bauen(inner);
          koerper.appendChild(block);
        });
      }
      widerspruecheZeigen();
      if (!istNeu) {
        koerper.appendChild(el('div', { class: 'weitere-aktionen' }, [
          el('span', { class: 'zart fuellen', text: 'Weitere Aktionen zu dieser Tür' }),
          el('button', { class: 'klein', text: 'Duplizieren', onclick: duplizieren }),
          el('button', { class: 'klein gefahr', text: 'Löschen', onclick: loeschen })
        ]));
      }
      modusLeisteZeichnen();
      markieren();
      fussZeichnen();
    }

    /* =======================================================================
     * Speichern
     * ==================================================================== */
    /* Während der Dialog offen war, kann der Abgleich dieselbe Tür von
     * einem anderen Gerät her verändert haben (eine Bemerkung, ein Foto).
     * Felder, die hier NICHT angefasst wurden, dort aber schon, bleiben
     * erhalten; was hier geändert wurde, gewinnt. */
    function fremdeAenderungenBehalten(aktuell) {
      if (!beimOeffnen || !aktuell) return;
      var alt = JSON.parse(beimOeffnen);
      var schluessel = {};
      Object.keys(alt).concat(Object.keys(aktuell)).forEach(function (k) { schluessel[k] = true; });
      Object.keys(schluessel).forEach(function (k) {
        if (k === 'id' || k === 'geaendert') return;
        var hierUnveraendert = JSON.stringify(t[k]) === JSON.stringify(alt[k]);
        var dortGeaendert = JSON.stringify(aktuell[k]) !== JSON.stringify(alt[k]);
        if (hierUnveraendert && dortGeaendert) {
          if (aktuell[k] === undefined) delete t[k]; else t[k] = aktuell[k];
        }
      });
    }

    function uebernehmen(undWeiter) {
      if (!t.nummer && !t.bezeichnung) {
        A.toast('Bitte mindestens Türnummer oder Bezeichnung angeben.', 'fehler');
        zuAbschnitt('lage', 'bezeichnung');
        return false;
      }
      t.anzahl = Math.max(1, parseInt(t.anzahl, 10) || 1);
      t.geaendert = new Date().toISOString();
      /* Status aus der Vollständigkeit führen, solange er nicht selbst
       * gewählt wurde. */
      M.statusAusPruefung(p, t);
      var fehlende = M.pflichtfelder(p, t);

      A.schrittMerken(istNeu ? ('Tür ' + (t.nummer || t.bezeichnung) + ' angelegt')
                             : ('Tür ' + (t.nummer || t.bezeichnung) + ' geändert'));
      /* Immer in das Projekt schreiben, das JETZT geöffnet ist - nicht in
       * die beim Öffnen gefangene Fassung (die kann ein „Zurück“ oder der
       * Abgleich inzwischen ersetzt haben). */
      var ziel = Zustand.projekt && Zustand.projekt.id === p.id ? Zustand.projekt : p;
      if (istNeu) {
        ziel.tueren.push(t);
      } else {
        var i = ziel.tueren.findIndex(function (x) { return x.id === t.id; });
        if (i >= 0) { fremdeAenderungenBehalten(ziel.tueren[i]); ziel.tueren[i] = t; }
        else ziel.tueren.push(t);
      }
      A.alsGeaendertMarkieren();
      A.speichern();

      var meldung = fehlende.length
        ? ('Gespeichert – ' + fehlende.length +
           (fehlende.length === 1 ? ' Pflichtangabe fehlt noch.' : ' Pflichtangaben fehlen noch.'))
        : 'Tür gespeichert.';
      if (undWeiter) {
        /* Die nächste Tür beginnt leer - nichts von der eben gesicherten
         * wird übernommen. Ein vorbelegter, aber falscher Wert fiele vor
         * Ort weniger auf als ein leeres Pflichtfeld. Nur der Bereich, aus
         * dem heraus angelegt wird (vorgaben), bleibt gesetzt. */
        A.toast(meldung + ' Nächste Tür …', fehlende.length ? 'warn' : 'ok');
        neuZeichnen();
        setTimeout(function () { tuerBearbeiten(null, neuZeichnen, vorgaben); }, 120);
        return true;
      }
      A.toast(meldung, fehlende.length ? 'warn' : 'ok');
      neuZeichnen();
      return true;
    }

    /* =======================================================================
     * Dialog samt Fußzeile
     * ==================================================================== */
    var dlg = A.dialogOeffnen({
      titel: istNeu ? 'Neue Tür aufnehmen'
        : 'Tür bearbeiten: ' + (t.nummer || t.bezeichnung || ''),
      inhalt: inhalt,
      knoepfe: [{ text: 'Abbrechen' }]
    });
    var fuss = dlg.kasten.querySelector('.fuss');

    function fussZeichnen() {
      if (!fuss) return;
      A.leeren(fuss);
      var gefuehrt = Zustand[modusSchluessel] === 'gefuehrt';
      var liste2 = aktive();
      var index = 0;
      liste2.forEach(function (a, i) { if (a.id === schrittId) index = i; });

      function knopf(eigenschaften) { fuss.appendChild(el('button', eigenschaften)); }

      /* Duplizieren und Löschen stehen am Ende des Formulars, nicht in der
       * Daumenzone: Dort ist der Platz für das gedacht, was ständig
       * gebraucht wird - und ein versehentliches Löschen wäre teuer. */
      fuss.appendChild(el('div', { class: 'fuellen' }));

      if (gefuehrt) {
        knopf({ text: '← Zurück', disabled: index === 0,
          onclick: function () { schrittId = liste2[index - 1].id; ansichtNeu(); } });
        if (index < liste2.length - 1) {
          knopf({ class: 'haupt', text: 'Weiter →',
            onclick: function () { schrittId = liste2[index + 1].id; ansichtNeu(); } });
          /* Dieselbe Beschriftung wie am Ende: Wer vor Ort abbrechen muss,
           * soll nicht raten, welcher Knopf die Tür sichert. */
          knopf({ class: 'klein', text: istNeu ? 'Tür speichern' : 'Änderungen übernehmen',
            onclick: function () { if (uebernehmen(false)) dlg.schliessen(); } });
        } else {
          if (istNeu) {
            knopf({ text: 'Speichern & nächste',
              onclick: function () { if (uebernehmen(true)) dlg.schliessen(); } });
          }
          knopf({ class: 'haupt', text: istNeu ? 'Tür speichern' : 'Änderungen übernehmen',
            onclick: function () { if (uebernehmen(false)) dlg.schliessen(); } });
        }
      } else {
        knopf({ text: 'Abbrechen', onclick: function () { dlg.schliessen(); } });
        if (istNeu) {
          knopf({ text: 'Speichern & nächste',
            onclick: function () { if (uebernehmen(true)) dlg.schliessen(); } });
        }
        knopf({ class: 'haupt', text: istNeu ? 'Tür speichern' : 'Änderungen übernehmen',
          onclick: function () { if (uebernehmen(false)) dlg.schliessen(); } });
      }
    }

    function duplizieren() {
      A.schrittMerken('Tür dupliziert');
      var kopie = JSON.parse(JSON.stringify(t));
      kopie.id = M.uid('tur');
      kopie.nummer = naechsteNummer(t.nummer) || M.naechsteLaufendeNummer(p);
      kopie.fotos = [];
      p.tueren.push(kopie);
      A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
      dlg.schliessen();
      setTimeout(function () { tuerBearbeiten(kopie, neuZeichnen, vorgaben); }, 100);
    }

    function loeschen() {
      A.bestaetigen('Tür löschen?', 'Die Tür „' + (t.nummer || t.bezeichnung) +
        '“ wird gelöscht, samt Fotos und Berechtigungen im Schließplan.').then(function (ja) {
        if (!ja) return;
        A.schrittMerken('Tür ' + (t.nummer || t.bezeichnung) + ' gelöscht');
        p.tueren = p.tueren.filter(function (x) { return x.id !== t.id; });
        M.matrixAufraeumen(p);
        A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
        A.toast('Tür gelöscht.');
        dlg.schliessen();
      });
    }

    ansichtNeu();
  }

  /* Gesamtlänge eines Zylinders, sofern beide Maße vorliegen. */
  function gesamtlaenge(t) {
    var a = parseFloat(String(t.masseAussen || '').replace(',', '.'));
    var i = parseFloat(String(t.masseInnen || '').replace(',', '.'));
    if (!isFinite(a) || !isFinite(i)) return '';
    return String(Math.round((a + i) * 10) / 10);
  }

  /* Eine neue Tür beginnt bewusst leer: Es werden keine Angaben der zuvor
   * erfassten Tür übernommen. Vorbelegt wird allein die laufende Nummer und
   * der Status; alles andere wird bewusst gewählt. */
  function vorlageFuerNeueTuer(vorgaben) {
    var v = { nummer: M.naechsteLaufendeNummer(Zustand.projekt), status: 'aufgemessen' };
    /* Wird die Tür aus einem Bereich heraus angelegt, steht der Bereich
     * schon fest und muss nicht erneut gewählt werden. Alles andere beginnt
     * leer - auch nach „Speichern & nächste“. */
    if (vorgaben && vorgaben.strukturId) v.strukturId = vorgaben.strukturId;
    return v;
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
    tuerZeile: tuerZeile,
    strukturOptionen: strukturOptionen,
    naechsteNummer: naechsteNummer,
    vorlageFuerNeueTuer: vorlageFuerNeueTuer,
    eigeneListe: eigeneListe
  };
})(typeof window !== 'undefined' ? window : globalThis);
