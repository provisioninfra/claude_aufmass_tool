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

  /* Maßauswahl: übliche Werte als Liste, abweichende Maße über "anderes Maß".
   * Vor Ort wird so in der Regel nur getippt statt getastet. */
  function massFeld(objekt, schluessel, beschriftung, werte, platzhalter) {
    var behaelter = el('div', { class: 'feld' });
    var reinText = String(beschriftung).replace(/<[^>]*>/g, '').trim();
    var freitext = el('input', {
      type: 'number', inputmode: 'numeric', placeholder: platzhalter || 'Maß in mm',
      value: objekt[schluessel] || '',
      oninput: function (e) {
        A.eingabeSchrittMerken('Eingabe: ' + reinText);
        objekt[schluessel] = e.target.value; A.alsGeaendertMarkieren();
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
      }
    });
    auswahl.appendChild(el('option', { value: '', text: '– bitte wählen –' }));
    werte.forEach(function (w) { auswahl.appendChild(el('option', { value: w, text: w + ' mm' })); });
    auswahl.appendChild(el('option', { value: K.ANDERES_MASS, text: K.ANDERES_MASS }));

    var vorhanden = objekt[schluessel];
    if (vorhanden && werte.indexOf(String(vorhanden)) === -1) {
      auswahl.value = K.ANDERES_MASS;          /* Altwert außerhalb der Liste */
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
        Zustand.tuerFilter = { suche: '', struktur: '', status: '', system: '' };
        neuZeichnen();
      } })
    ]));

    var listenBereich = el('div');
    seite.appendChild(listenBereich);
    listeZeichnen();

    function passt(t) {
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
    var p = Zustand.projekt;
    var status = K.statusById(t.status);
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
        A.auswahlFeld(t, 'kategorie', 'Türkategorie', K.TUERKATEGORIEN, {
          leerText: '– ohne Angabe –' }),
        strukturAuswahl,
        strukturOptionen().length ? null
          : A.textFeld(t, 'etage', 'Etage / Bereich <span class="einheit">(Freitext)</span>'),
        A.textFeld(t, 'anzahl', 'Anzahl baugleicher Türen', { typ: 'number', inputmode: 'numeric' }),
        A.auswahlFeld(t, 'status', 'Status', K.STATUS, { leerText: '– offen –' })
      ])
    ]));

    /* --- 2. Anlage --------------------------------------------------------
     * Das System steht im Projekt. Hier wird nur bei einer Hybridanlage
     * entschieden, welche Seite für diese Tür gilt. */
    var systemHinweis = el('p', { class: 'hinweis', style: { margin: '8px 0 0' } });
    var komponentenBereich = el('div');
    var anlageAnzeige = el('div', { class: 'zeile-verteilt' });
    var hybridWahl = el('div');

    function systemAbhaengigesZeichnen() {
      var eigene = eigeneListe('eigeneSysteme');
      var sid = M.tuerSystemId(p, t);
      var sys = K.systemById(sid, eigene);

      A.leeren(anlageAnzeige);
      if (!p.anlagenart) {
        anlageAnzeige.appendChild(el('div', { class: 'meldung warn', style: { margin: '0', width: '100%' } },
          el('div', {}, [
            el('b', { text: 'Für dieses Projekt ist noch keine Schließanlage festgelegt. ' }),
            'Bitte unter „Stammdaten“ die Art der Anlage und das System wählen.'
          ])));
      } else {
        anlageAnzeige.appendChild(el('span', { class: 'marke-pille blau',
          text: (K.ANLAGENART.filter(function (a) { return a.id === p.anlagenart; })[0] || {}).label || p.anlagenart }));
        if (sid) {
          anlageAnzeige.appendChild(el('span', { class: 'marke-pille', text: K.systemLabel(sid, eigene) }));
        }
        if (p.systemDetail) {
          anlageAnzeige.appendChild(el('span', { class: 'zart', text: p.systemDetail }));
        }
      }

      /* Nur bei Hybrid ist an der Tür noch etwas zu entscheiden */
      A.leeren(hybridWahl);
      if (p.anlagenart === 'hybrid') {
        hybridWahl.appendChild(el('div', { class: 'raster', style: { marginTop: '12px' } }, [
          A.auswahlFeld(t, 'tuerTechnologie', 'Diese Tür wird ausgeführt als', [
            { id: 'mechanik',   label: 'Mechanisch' + (p.systemMechanik ? '  –  ' + K.systemLabel(p.systemMechanik, eigene) : '') },
            { id: 'elektronik', label: 'Elektronisch' + (p.systemElektronik ? '  –  ' + K.systemLabel(p.systemElektronik, eigene) : '') }
          ], { leerText: '– bitte wählen –', beiAenderung: function () { systemAbhaengigesZeichnen(); } })
        ]));
      } else if (t.tuerTechnologie) {
        t.tuerTechnologie = '';   /* bei reiner Anlage gegenstandslos */
      }

      systemHinweis.textContent = sys && sys.hinweis ? sys.hinweis : '';

      A.leeren(komponentenBereich);
      if (sys && sys.komponenten && sys.komponenten.length) {
        komponentenBereich.appendChild(A.chipFeld(t, 'komponenten',
          'Zusätzliche Systemkomponenten <span class="einheit">(Zylinder, Beschlag und Schloss werden unten erfasst)</span>',
          sys.komponenten));
      }
      elektronikSichtbarkeit();
      zusammenfassungenAktualisieren();
    }

    inhalt.appendChild(abschnitt('Anlage', true, [
      anlageAnzeige,
      hybridWahl,
      systemHinweis,
      komponentenBereich,
      el('div', { class: 'raster', style: { marginTop: '12px' } }, [
        A.textFeld(t, 'systemNotiz', 'Besonderheit zu dieser Tür <span class="einheit">(nur bei Abweichung)</span>',
          { platzhalter: 'z. B. Fremdfabrikat im Bestand, Sonderausführung' })
      ])
    ], function () {
      var sid = M.tuerSystemId(p, t);
      if (!p.anlagenart) return 'Anlage noch nicht festgelegt';
      if (p.anlagenart === 'hybrid' && !t.tuerTechnologie) return 'Ausführung noch offen';
      return sid ? K.systemLabel(sid, eigeneListe('eigeneSysteme')) : '';
    }));

    /* --- 3. Bauteile -------------------------------------------------------
     * Je Bauteil werden Bauform, Ausführung und Maße an genau einer Stelle
     * erfasst. Angaben, die sich aus einer anderen ergeben, werden nicht
     * erneut gefragt (z. B. Knaufseite nur beim Knaufzylinder). */
    var zylinderFelder = el('div');
    var beschlagFelder = el('div');
    var schlossFelder = el('div');
    var bauteilHinweis = el('div');

    function bauteilFelderZeichnen() {
      A.leeren(zylinderFelder); A.leeren(beschlagFelder); A.leeren(schlossFelder);

      /* ---- Zylinder ---- */
      if (t.brauchtZylinder) {
        var zylRaster = el('div', { class: 'raster' }, [
          A.auswahlFeld(t, 'zylinderBauform', 'Bauform', liste('ZYLINDER_BAUFORM', 'eigeneZylinderarten'), {
            beiAenderung: function () { bauteilFelderZeichnen(); }
          }),
          A.textFeld(t, 'masseAussen', 'Länge außen <span class="einheit">mm</span>',
            { typ: 'number', inputmode: 'numeric', platzhalter: 'z. B. 35' }),
          A.textFeld(t, 'masseInnen', 'Länge innen <span class="einheit">mm</span>',
            { typ: 'number', inputmode: 'numeric', platzhalter: 'z. B. 40' })
        ]);
        /* Knaufseite ist nur beim einfachen Knaufzylinder eine offene Frage */
        if (t.zylinderBauform === 'Knaufzylinder') {
          zylRaster.appendChild(A.auswahlFeld(t, 'zylinderKnaufseite',
            'Knaufseite <span class="einheit">(vom mech. festen Knauf)</span>', K.KNAUFSEITE));
        } else if (t.zylinderKnaufseite) {
          t.zylinderKnaufseite = '';
        }
        zylinderFelder.appendChild(el('h3', { text: 'Zylinder', style: { marginTop: '0' } }));
        zylinderFelder.appendChild(zylRaster);
        zylinderFelder.appendChild(A.chipFeld(t, 'zylinderAusfuehrung',
          'Ausführung <span class="einheit">(nur wenn zutreffend)</span>',
          liste('ZYLINDER_AUSFUEHRUNG')));
      }

      /* ---- Beschlag ---- */
      if (t.brauchtBeschlag) {
        var besRaster = el('div', { class: 'raster' }, [
          A.auswahlFeld(t, 'beschlagBauform', 'Bauform', liste('BESCHLAG_BAUFORM', 'eigeneBeschlagarten'), {
            beiAenderung: function () { bauteilFelderZeichnen(); }
          }),
          A.auswahlFeld(t, 'beschlagAusfuehrung', 'Ausführung', K.BESCHLAG_AUSFUEHRUNG, {
            beiAenderung: function () { bauteilFelderZeichnen(); elektronikSichtbarkeit(); }
          }),
          A.auswahlFeld(t, 'beschlagBestueckung', 'Bestückung', K.BESCHLAG_BESTUECKUNG),
          massFeld(t, 'vierkant', 'Vierkant <span class="einheit">mm</span>', K.VIERKANT, 'z. B. 8')
        ]);
        /* Sicherheitsklasse nur beim Schutzbeschlag */
        if (t.beschlagBauform === 'Schutzbeschlag') {
          besRaster.appendChild(A.auswahlFeld(t, 'beschlagSicherheit', 'Sicherheitsklasse', K.BESCHLAG_SICHERHEIT));
        } else if (t.beschlagSicherheit) {
          t.beschlagSicherheit = '';
        }
        beschlagFelder.appendChild(el('h3', { text: 'Beschlag / Drücker' }));
        beschlagFelder.appendChild(besRaster);
      }

      /* ---- Schloss ---- */
      if (t.brauchtSchloss) {
        schlossFelder.appendChild(el('h3', { text: 'Schloss' }));
        schlossFelder.appendChild(el('div', { class: 'raster' }, [
          A.auswahlFeld(t, 'schlossBauform', 'Bauform', liste('SCHLOSS_BAUFORM', 'eigeneSchlossarten')),
          A.auswahlFeld(t, 'schlossFunktion', 'Funktion', K.SCHLOSS_FUNKTION),
          A.textFeld(t, 'stulpmass', 'Stulpmaß / Stulpform')
        ]));
      }

      /* ---- Dornmaß und Entfernung: gelten für Beschlag und Schloss
             gemeinsam und werden deshalb nur einmal abgefragt. ---- */
      if (t.brauchtBeschlag || t.brauchtSchloss) {
        var wofuer = (t.brauchtBeschlag && t.brauchtSchloss) ? 'Beschlag und Schloss'
                   : t.brauchtBeschlag ? 'Beschlag' : 'Schloss';
        schlossFelder.appendChild(el('h3', { text: 'Maße für ' + wofuer }));
        schlossFelder.appendChild(el('div', { class: 'raster' }, [
          massFeld(t, 'dornmass', 'Dornmaß <span class="einheit">mm</span>', K.DORNMASS, 'z. B. 55'),
          massFeld(t, 'entfernung', 'Entfernung <span class="einheit">mm</span>', K.ENTFERNUNG, 'z. B. 72')
        ]));
      }

      widerspruecheZeichnen();
      zusammenfassungenAktualisieren();
    }

    /* Weist auf Angaben hin, die nicht zusammenpassen - statt sie ein
     * zweites Mal abzufragen. */
    function widerspruecheZeichnen() {
      A.leeren(bauteilHinweis);
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
      if (t.zylinderBauform === 'Halbzylinder' && t.masseInnen && parseInt(t.masseInnen, 10) > 15) {
        meldungen.push('Bei einem Halbzylinder ist die Innenlänge üblicherweise 10 mm.');
      }
      if (!t.brauchtZylinder && !t.brauchtBeschlag && !t.brauchtSchloss && !t.brauchtWandleser) {
        meldungen.push('Für diese Tür ist noch kein Bauteil vorgesehen.');
      }
      if (!meldungen.length) return;
      meldungen.forEach(function (m) {
        bauteilHinweis.appendChild(el('div', { class: 'meldung warn', style: { marginTop: '12px' } },
          el('div', { text: m })));
      });
    }

    inhalt.appendChild(abschnitt('Bauteile', true, [
      el('div', { class: 'raster eng' }, [
        A.schalterFeld(t, 'brauchtZylinder', 'Zylinder', function () { bauteilFelderZeichnen(); }),
        A.schalterFeld(t, 'brauchtBeschlag', 'Beschlag / Drücker', function () { bauteilFelderZeichnen(); }),
        A.schalterFeld(t, 'brauchtSchloss', 'Schloss', function () { bauteilFelderZeichnen(); }),
        A.schalterFeld(t, 'brauchtWandleser', 'Wandleser', function () {
          bauteilFelderZeichnen(); elektronikSichtbarkeit();
        })
      ]),
      el('hr', { class: 'trenner' }),
      zylinderFelder, beschlagFelder, schlossFelder, bauteilHinweis
    ], function () {
      var teile = [];
      if (t.brauchtZylinder) teile.push(K.zylinderText(t) || 'Zylinder');
      if (t.brauchtBeschlag) teile.push(K.beschlagText(t) || 'Beschlag');
      if (t.brauchtSchloss) teile.push(K.schlossText(t) || 'Schloss');
      if (t.brauchtWandleser) teile.push('Wandleser');
      return teile.join('  ·  ') || 'kein Bauteil gewählt';
    }));

    /* --- 4. Zutritt und bauliche Anforderungen -----------------------------
     * Zwei getrennte Fragen. Zylinderfunktionen wie Freidreh oder
     * Not- und Gefahrenfunktion stehen allein bei der Zylinderausführung. */
    inhalt.appendChild(abschnitt('Zutritt und Anforderungen', true, [
      el('div', { class: 'raster' }, [
        A.auswahlFeld(t, 'zutrittsseite', 'Von welcher Seite wird geöffnet?', K.ZUTRITTSSEITE)
      ]),
      (function () {
        var feld = A.chipFeld(t, 'tueranforderungen',
          'Bauliche Anforderungen <span class="einheit">(mehrere möglich)</span>',
          liste('TUERANFORDERUNG', 'eigeneZutrittsarten'));
        /* Änderungen hier können einen Widerspruch zum Schloss auflösen */
        feld.addEventListener('click', function () { setTimeout(widerspruecheZeichnen, 0); });
        return feld;
      })(),
      el('p', { class: 'hinweis', style: { marginTop: '10px' },
        text: 'Bei Flucht- und Rettungswegen sowie Brand- und Rauchschutztüren sind die bauaufsichtlichen Anforderungen zu beachten; die Auswahl hier ersetzt keine Prüfung vor Ort.' })
    ], function () {
      var teile = [];
      if (t.zutrittsseite) teile.push(t.zutrittsseite);
      if ((t.tueranforderungen || []).length) teile.push(t.tueranforderungen.length + ' Anforderung(en)');
      return teile.join('  ·  ');
    }));

    /* --- 5. Türblatt und Rahmen --------------------------------------------
     * Dornmaß, Entfernung und Vierkant stehen beim jeweiligen Bauteil und
     * werden hier nicht wiederholt. */
    inhalt.appendChild(abschnitt('Türblatt und Rahmen', false, [
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
      var v = [t.tuerblattstaerke && t.tuerblattstaerke + ' mm', t.dinRichtung].filter(Boolean);
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

    /* --- 7. Elektronik -----------------------------------------------------
     * Wird nur angezeigt, wenn das gewählte System überhaupt elektronisch
     * ist - bei reiner Mechanik gäbe es hier nichts zu entscheiden. */
    var elektronikAbschnitt = abschnitt('Elektronik und Vernetzung', false, [
      el('div', { class: 'raster' }, [
        A.auswahlFeld(t, 'elFunkabdeckung', 'Funkabdeckung vor Ort',
          ['gut', 'mittel', 'schlecht', 'nicht geprüft']),
        A.auswahlFeld(t, 'elStromversorgung', 'Stromversorgung',
          ['Batterie', '12V vorhanden', '24V vorhanden', '230V vorhanden', 'PoE', 'muss verlegt werden']),
        A.auswahlFeld(t, 'elVernetzung', 'Vernetzung',
          ['offline (Stand-alone)', 'virtuelles Netzwerk', 'online / verkabelt', 'funkvernetzt', 'noch offen'])
      ]),
      el('div', { style: { marginTop: '10px' } }, [
        A.schalterFeld(t, 'elTuerueberwachung', 'Türüberwachung / Türzustandsmeldung gewünscht')
      ]),
      el('div', { class: 'raster', style: { marginTop: '10px' } }, [
        A.bereichFeld(t, 'elBemerkung', 'Bemerkung Elektronik', { zeilen: 2 })
      ])
    ], function () { return t.elVernetzung || ''; });
    inhalt.appendChild(elektronikAbschnitt);

    function elektronikSichtbarkeit() {
      if (!elektronikAbschnitt) return;   /* wird beim Aufbau noch nicht gebraucht */
      var zeigen = M.istTuerElektronisch(p, t) || t.brauchtWandleser ||
                   K.beschlagIstElektronisch(t);
      elektronikAbschnitt.style.display = zeigen ? '' : 'none';
    }

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

    /* Erstaufbau: erst jetzt stehen alle Abschnitte bereit */
    systemAbhaengigesZeichnen();
    bauteilFelderZeichnen();
    elektronikSichtbarkeit();
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
      A.schrittMerken(istNeu ? ('Tür ' + (t.nummer || t.bezeichnung) + ' angelegt')
                             : ('Tür ' + (t.nummer || t.bezeichnung) + ' geändert'));
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
        A.schrittMerken('Tür dupliziert');
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
          A.schrittMerken('Tür ' + (t.nummer || t.bezeichnung) + ' gelöscht');
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
    /* Angaben, die sich beim Abarbeiten einer Etage meist wiederholen */
    letzteTuer = {
      strukturId: t.strukturId, etage: t.etage, tuerTechnologie: t.tuerTechnologie,
      kategorie: t.kategorie, nummer: t.nummer,
      brauchtZylinder: t.brauchtZylinder, brauchtBeschlag: t.brauchtBeschlag,
      brauchtSchloss: t.brauchtSchloss, brauchtWandleser: t.brauchtWandleser,
      zylinderBauform: t.zylinderBauform,
      zylinderAusfuehrung: (t.zylinderAusfuehrung || []).slice(),
      zylinderKnaufseite: t.zylinderKnaufseite,
      beschlagBauform: t.beschlagBauform, beschlagBestueckung: t.beschlagBestueckung,
      beschlagSicherheit: t.beschlagSicherheit,
      schlossBauform: t.schlossBauform, schlossFunktion: t.schlossFunktion,
      zutrittsseite: t.zutrittsseite,
      tueranforderungen: (t.tueranforderungen || []).slice(),
      dinRichtung: t.dinRichtung, tuermaterial: t.tuermaterial
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
