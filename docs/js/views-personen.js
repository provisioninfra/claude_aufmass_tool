/* =============================================================================
 * views-personen.js — Mitarbeiter und Gruppen des Kunden
 *
 * Die beiden Listen stehen im Schließplan unter der Matrix. Sie sind die
 * eine Stelle, an der Namen gepflegt werden: Spalten im Plan verweisen auf
 * eine Gruppe (alle Mitglieder berechtigt) oder einen Mitarbeiter, und die
 * Medien je Mitarbeiter ergeben die Stückzahlen in Plan und Materialliste.
 * ========================================================================== */
(function (global) {
  'use strict';
  var A = global.AppKern, K = global.Katalog, M = global.Model;
  var el = A.el, Zustand = A.Zustand;

  function projekt() { return Zustand.projekt; }
  function medienArten() {
    return M.identmedienAuswahl(projekt(), (Zustand.einstellungen && Zustand.einstellungen.eigeneSysteme) || []);
  }

  /* --- Medien eines Mitarbeiters (oder einer Schließung ohne Träger) -----
   * Mehrere Arten gleichzeitig: 1× Transponder und 1× Smartphone. Die
   * Liste wird direkt in objekt.medien geführt. */
  function medienFeld(objekt, beschriftung, konfig) {
    konfig = konfig || {};
    if (!Array.isArray(objekt.medien)) objekt.medien = [];
    var arten = medienArten();
    var behaelter = el('div', { class: 'feld voll medien-feld', 'data-feld': 'medien' });
    var liste = el('div', { class: 'medien-liste' });

    function melden() {
      A.alsGeaendertMarkieren();
      if (konfig.beiAenderung) konfig.beiAenderung();
    }

    function zeichnen() {
      A.leeren(liste);
      if (!objekt.medien.length) {
        liste.appendChild(el('p', { class: 'zart', style: { margin: '2px 0 6px' },
          text: konfig.leerText || 'Ohne Eintrag gilt: ein Medium, Art noch offen.' }));
      }
      objekt.medien.forEach(function (eintrag, index) {
        var typFeld;
        if (arten.length) {
          typFeld = A.auswahlFeld(eintrag, 'typ', 'Art des Mediums', arten, { leerText: '– noch offen –' });
        } else {
          typFeld = A.textFeld(eintrag, 'typ', 'Art des Mediums', { platzhalter: 'z. B. Schlüssel, Transponder, Karte' });
        }
        liste.appendChild(el('div', { class: 'medien-zeile' }, [
          typFeld,
          A.zahlFeld(eintrag, 'anzahl', 'Anzahl', { min: 1, max: 999, vorgabe: 1, beiAenderung: melden }),
          el('button', { class: 'klein gefahr nur-symbol entfernen', type: 'button', text: '✕',
            title: 'Eintrag entfernen',
            onclick: function () {
              A.schrittMerken('Medium entfernt');
              objekt.medien.splice(index, 1);
              melden(); zeichnen();
            } })
        ]));
      });
    }
    zeichnen();

    behaelter.appendChild(el('label', { html: beschriftung || 'Medien' }));
    behaelter.appendChild(liste);
    behaelter.appendChild(el('div', { class: 'knopfleiste' }, [
      el('button', { class: 'klein', type: 'button', text: objekt.medien.length ? '+ weitere Art' : '+ Medium eintragen',
        onclick: function (ev) {
          A.schrittMerken('Medium hinzugefügt');
          objekt.medien.push({ typ: arten.length === 1 ? arten[0] : '', anzahl: 1 });
          ev.target.textContent = '+ weitere Art';
          melden(); zeichnen();
        } })
    ]));
    return behaelter;
  }

  /* --- Gruppenzugehörigkeit als Chips ------------------------------------ */
  function gruppenChips(m, beiAenderung) {
    var p = projekt();
    var behaelter = el('div', { class: 'feld voll', 'data-feld': 'gruppen' });
    behaelter.appendChild(el('label', { text: 'Abteilung / Gruppe' }));
    var chips = el('div', { class: 'chips' });
    function zeichnen() {
      A.leeren(chips);
      if (!Array.isArray(m.gruppen)) m.gruppen = [];
      (p.gruppen || []).forEach(function (g) {
        var aktiv = m.gruppen.indexOf(g.id) !== -1;
        var chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': aktiv ? 'true' : 'false', text: g.name || '(ohne Namen)',
          onclick: function () {
            var i = m.gruppen.indexOf(g.id);
            A.schrittMerken((i === -1 ? 'Gruppe zugeordnet: ' : 'Gruppe entfernt: ') + g.name);
            if (i === -1) m.gruppen.push(g.id); else m.gruppen.splice(i, 1);
            chip.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
            A.alsGeaendertMarkieren();
            if (beiAenderung) beiAenderung();
          } });
        chips.appendChild(chip);
      });
      chips.appendChild(el('button', { type: 'button', class: 'chip neu', text: '+ neue Gruppe',
        onclick: function () {
          A.textAbfragen('Neue Gruppe', 'Name der Gruppe', '', 'z. B. Verwaltung, Reinigung, EDV').then(function (name) {
            name = String(name || '').trim();
            if (!name) return;
            var g = gruppeAnlegen(name);
            if (m.gruppen.indexOf(g.id) === -1) m.gruppen.push(g.id);
            A.alsGeaendertMarkieren();
            zeichnen();
            if (beiAenderung) beiAenderung();
          });
        } }));
      if (!(p.gruppen || []).length) {
        chips.appendChild(el('span', { class: 'zart', text: 'Noch keine Gruppen - mit „+ neue Gruppe“ anlegen.' }));
      }
    }
    zeichnen();
    behaelter.appendChild(chips);
    return behaelter;
  }

  /* Gruppe mit diesem Namen holen oder anlegen */
  function gruppeAnlegen(name) {
    var p = projekt();
    var da = (p.gruppen || []).filter(function (g) { return String(g.name).trim().toLowerCase() === name.toLowerCase(); })[0];
    if (da) return da;
    A.schrittMerken('Gruppe ' + name + ' angelegt');
    var g = M.neueGruppe({ name: name });
    p.gruppen.push(g);
    return g;
  }

  /* --- Träger einer Schließung (Mitarbeiter-Mehrfachauswahl) ------------- */
  function traegerChips(s, beiAenderung, neuZeichnen) {
    var p = projekt();
    var behaelter = el('div', { class: 'feld voll', 'data-feld': 'traeger' });
    behaelter.appendChild(el('label', { html: 'Wer bekommt diesen Schlüssel? <span class="einheit">(Mitarbeiter antippen)</span>' }));
    var chips = el('div', { class: 'chips' });
    function zeichnen() {
      A.leeren(chips);
      if (!Array.isArray(s.traeger)) s.traeger = [];
      (p.mitarbeiter || []).forEach(function (m) {
        var aktiv = s.traeger.indexOf(m.id) !== -1;
        var chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': aktiv ? 'true' : 'false',
          text: (m.name || '(ohne Namen)') + (M.mitarbeiterMedienAnzahl(m) > 1 ? ' ' + M.mitarbeiterMedienAnzahl(m) + '×' : ''),
          onclick: function () {
            var i = s.traeger.indexOf(m.id);
            A.schrittMerken((i === -1 ? 'Träger zugeordnet: ' : 'Träger entfernt: ') + m.name);
            if (i === -1) s.traeger.push(m.id); else s.traeger.splice(i, 1);
            chip.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
            A.alsGeaendertMarkieren();
            if (beiAenderung) beiAenderung();
          } });
        chips.appendChild(chip);
      });
      chips.appendChild(el('button', { type: 'button', class: 'chip neu', text: '+ Mitarbeiter anlegen',
        onclick: function () {
          mitarbeiterBearbeiten(null, function () {
            zeichnen();
            if (neuZeichnen) neuZeichnen();
          }, { beiAnlegen: function (m) { if (s.traeger.indexOf(m.id) === -1) s.traeger.push(m.id); if (beiAenderung) beiAenderung(); } });
        } }));
      if (!(p.mitarbeiter || []).length) {
        chips.appendChild(el('span', { class: 'zart', text: 'Noch keine Mitarbeiter erfasst.' }));
      }
    }
    zeichnen();
    behaelter.appendChild(chips);
    return behaelter;
  }

  /* =========================================================================
   * Mitarbeiter anlegen / bearbeiten
   * ====================================================================== */
  function mitarbeiterBearbeiten(vorhandener, neuZeichnen, optionen) {
    optionen = optionen || {};
    var p = projekt();
    var istNeu = !vorhandener;
    var m = istNeu ? M.neuerMitarbeiter({ name: optionen.vorgabeName || '' })
                   : JSON.parse(JSON.stringify(vorhandener));
    m.medien = M.medienBereinigen(m.medien);
    var hatSpalte = !istNeu && p.schliessungen.some(function (s) { return s.art === 'mitarbeiter' && s.mitarbeiterId === m.id; });
    var spalteWunsch = { wert: hatSpalte };

    var inhalt = el('div');
    inhalt.appendChild(el('div', { class: 'raster' }, [
      A.textFeld(m, 'name', 'Vorname Nachname', { platzhalter: 'z. B. Max Mustermann', autocapitalize: 'words' }),
      m.funktion ? A.textFeld(m, 'funktion', 'Funktion', { platzhalter: '' }) : null
    ]));
    inhalt.appendChild(gruppenChips(m));
    inhalt.appendChild(medienFeld(m, 'Medien <span class="einheit">(Art und Anzahl - mehrere Arten möglich)</span>'));
    inhalt.appendChild(el('hr', { class: 'trenner' }));
    inhalt.appendChild(A.schalterFeld(spalteWunsch, 'wert', 'Eigene Spalte im Schließplan'));
    inhalt.appendChild(el('p', { class: 'zart', style: { marginLeft: '64px', marginTop: '-6px' },
      text: 'Nur nötig, wenn dieser Mitarbeiter Berechtigungen bekommt, die seine Gruppe nicht hat. Über seine Gruppen ist er ohnehin berechtigt.' }));

    var spalten = istNeu ? [] : M.spaltenVonMitarbeiter(p, m.id);
    if (spalten.length) {
      inhalt.appendChild(el('p', { class: 'hinweis', text: 'Berechtigt über: ' +
        spalten.map(function (s) { return s.kuerzel || s.bezeichnung; }).join(', ') }));
    }

    var knoepfe = [];
    if (!istNeu) {
      knoepfe.push({ text: 'Löschen', klasse: 'gefahr', aktion: function (schliessen) {
        A.bestaetigen('Mitarbeiter löschen?',
          '„' + (m.name || 'Dieser Mitarbeiter') + '“ wird aus allen Gruppen und Trägerlisten entfernt' +
          (hatSpalte ? ', seine Spalte im Plan samt Berechtigungen wird gelöscht' : '') + '.').then(function (ja) {
          if (!ja) return;
          A.schrittMerken('Mitarbeiter ' + (m.name || '') + ' gelöscht');
          M.mitarbeiterLoeschen(p, m.id);
          A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
          A.toast('Mitarbeiter gelöscht.');
          schliessen();
        });
        return false;
      } });
    }
    knoepfe.push({ fuellen: true });
    knoepfe.push({ text: 'Abbrechen' });
    knoepfe.push({ text: istNeu ? 'Anlegen' : 'Übernehmen', klasse: 'haupt', aktion: function (schliessen) {
      m.name = String(m.name || '').trim();
      if (!m.name) { A.toast('Bitte einen Namen eintragen.', 'fehler'); return false; }
      A.schrittMerken(istNeu ? ('Mitarbeiter ' + m.name + ' angelegt') : ('Mitarbeiter ' + m.name + ' geändert'));
      m.medien = M.medienBereinigen(m.medien);
      if (istNeu) p.mitarbeiter.push(m);
      else {
        var i = p.mitarbeiter.findIndex(function (x) { return x.id === m.id; });
        if (i >= 0) p.mitarbeiter[i] = m; else p.mitarbeiter.push(m);
      }
      if (spalteWunsch.wert && !hatSpalte) {
        var s = M.spalteFuer(p, 'mitarbeiter', m.id);
        if (!s.kuerzel) s.kuerzel = M.kuerzelAus(m.name);
      } else if (!spalteWunsch.wert && hatSpalte) {
        p.schliessungen = p.schliessungen.filter(function (s2) { return !(s2.art === 'mitarbeiter' && s2.mitarbeiterId === m.id); });
        M.matrixAufraeumen(p);
      }
      M.spaltenAngleichen(p);
      if (optionen.beiAnlegen && istNeu) optionen.beiAnlegen(m);
      A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
      A.toast('Mitarbeiter gespeichert.', 'ok');
      schliessen();
      return false;
    } });

    A.dialogOeffnen({
      titel: istNeu ? 'Neuer Mitarbeiter' : 'Mitarbeiter bearbeiten',
      inhalt: inhalt, knoepfe: knoepfe
    });
  }

  /* =========================================================================
   * Gruppe anlegen / bearbeiten
   * ====================================================================== */
  function gruppeBearbeiten(vorhandene, neuZeichnen) {
    var p = projekt();
    var istNeu = !vorhandene;
    var g = istNeu ? M.neueGruppe() : JSON.parse(JSON.stringify(vorhandene));
    var hatSpalte = !istNeu && p.schliessungen.some(function (s) { return s.art === 'gruppe' && s.gruppeId === g.id; });
    var spalteWunsch = { wert: istNeu ? true : hatSpalte };
    var mitglieder = istNeu ? [] : M.gruppenMitglieder(p, g.id);
    var zugehoerig = {};
    (p.mitarbeiter || []).forEach(function (m) { zugehoerig[m.id] = (m.gruppen || []).indexOf(g.id) !== -1; });

    var inhalt = el('div');
    inhalt.appendChild(el('div', { class: 'raster' }, [
      A.textFeld(g, 'name', 'Name der Gruppe', { platzhalter: 'z. B. Verwaltung, Reinigung, EDV', autocapitalize: 'words' })
    ]));

    /* Mitglieder direkt hier zuordnen - vor Ort ist das der schnellere Weg
       als jeden Mitarbeiter einzeln zu öffnen. */
    var mitgliederFeld = el('div', { class: 'feld voll', 'data-feld': 'mitglieder' });
    mitgliederFeld.appendChild(el('label', { html: 'Mitglieder <span class="einheit">(Mitarbeiter antippen)</span>' }));
    var chips = el('div', { class: 'chips' });
    function chipsZeichnen() {
      A.leeren(chips);
      (p.mitarbeiter || []).forEach(function (m) {
        var chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': zugehoerig[m.id] ? 'true' : 'false',
          text: m.name || '(ohne Namen)',
          onclick: function () {
            zugehoerig[m.id] = !zugehoerig[m.id];
            chip.setAttribute('aria-pressed', zugehoerig[m.id] ? 'true' : 'false');
          } });
        chips.appendChild(chip);
      });
      chips.appendChild(el('button', { type: 'button', class: 'chip neu', text: '+ Mitarbeiter anlegen',
        onclick: function () {
          mitarbeiterBearbeiten(null, function () { chipsZeichnen(); if (neuZeichnen) neuZeichnen(); },
            { beiAnlegen: function (m) { zugehoerig[m.id] = true; } });
        } }));
      if (!(p.mitarbeiter || []).length) {
        chips.appendChild(el('span', { class: 'zart', text: 'Noch keine Mitarbeiter erfasst.' }));
      }
    }
    chipsZeichnen();
    mitgliederFeld.appendChild(chips);
    inhalt.appendChild(mitgliederFeld);

    inhalt.appendChild(el('hr', { class: 'trenner' }));
    inhalt.appendChild(A.schalterFeld(spalteWunsch, 'wert', 'Spalte im Schließplan'));
    inhalt.appendChild(el('p', { class: 'zart', style: { marginLeft: '64px', marginTop: '-6px' },
      text: 'Alle Mitglieder sind über diese Spalte berechtigt. Die Spalte heißt wie die Gruppe.' }));

    var knoepfe = [];
    if (!istNeu) {
      knoepfe.push({ text: 'Löschen', klasse: 'gefahr', aktion: function (schliessen) {
        A.bestaetigen('Gruppe löschen?',
          'Die Gruppe „' + (g.name || '') + '“ wird bei allen ' + mitglieder.length + ' Mitgliedern entfernt' +
          (hatSpalte ? ', ihre Spalte im Plan samt Berechtigungen wird gelöscht' : '') + '. Die Mitarbeiter bleiben erhalten.').then(function (ja) {
          if (!ja) return;
          A.schrittMerken('Gruppe ' + (g.name || '') + ' gelöscht');
          M.gruppeLoeschen(p, g.id);
          A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
          A.toast('Gruppe gelöscht.');
          schliessen();
        });
        return false;
      } });
    }
    knoepfe.push({ fuellen: true });
    knoepfe.push({ text: 'Abbrechen' });
    knoepfe.push({ text: istNeu ? 'Anlegen' : 'Übernehmen', klasse: 'haupt', aktion: function (schliessen) {
      g.name = String(g.name || '').trim();
      if (!g.name) { A.toast('Bitte einen Namen eintragen.', 'fehler'); return false; }
      var doppelt = (p.gruppen || []).some(function (x) { return x.id !== g.id && String(x.name).trim().toLowerCase() === g.name.toLowerCase(); });
      if (doppelt) { A.toast('Eine Gruppe mit diesem Namen gibt es schon.', 'fehler'); return false; }
      A.schrittMerken(istNeu ? ('Gruppe ' + g.name + ' angelegt') : ('Gruppe ' + g.name + ' geändert'));
      if (istNeu) p.gruppen.push(g);
      else {
        var i = p.gruppen.findIndex(function (x) { return x.id === g.id; });
        if (i >= 0) p.gruppen[i] = g; else p.gruppen.push(g);
      }
      (p.mitarbeiter || []).forEach(function (m) {
        if (!Array.isArray(m.gruppen)) m.gruppen = [];
        var drin = m.gruppen.indexOf(g.id) !== -1;
        if (zugehoerig[m.id] && !drin) m.gruppen.push(g.id);
        if (!zugehoerig[m.id] && drin) m.gruppen = m.gruppen.filter(function (x) { return x !== g.id; });
      });
      if (spalteWunsch.wert && !hatSpalte) {
        var s = M.spalteFuer(p, 'gruppe', g.id);
        if (!s.kuerzel) s.kuerzel = M.kuerzelAus(g.name);
      } else if (!spalteWunsch.wert && hatSpalte) {
        p.schliessungen = p.schliessungen.filter(function (s2) { return !(s2.art === 'gruppe' && s2.gruppeId === g.id); });
        M.matrixAufraeumen(p);
      }
      M.spaltenAngleichen(p);
      A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
      A.toast('Gruppe gespeichert.', 'ok');
      schliessen();
      return false;
    } });

    A.dialogOeffnen({
      titel: istNeu ? 'Neue Gruppe' : 'Gruppe bearbeiten',
      inhalt: inhalt, knoepfe: knoepfe
    });
  }

  /* =========================================================================
   * Die Karte unter der Matrix
   * ====================================================================== */
  function medienKurz(m) {
    var liste = M.medienBereinigen(m.medien);
    if (!liste.length) return '1× (Art offen)';
    return liste.map(function (x) { return x.anzahl + '× ' + (x.typ || 'Art offen'); }).join(', ');
  }

  function listenKarte(neuZeichnen) {
    var p = projekt();
    M.spaltenAngleichen(p);
    var karte = el('div', { class: 'karte personen-karte' });
    karte.appendChild(el('div', { class: 'zeile-verteilt' }, [
      el('div', { class: 'fuellen' }, [
        el('h2', { text: 'Mitarbeiter und Gruppen', style: { marginTop: '0' } }),
        el('p', { class: 'hinweis', text: 'Spalten im Plan sind Gruppen (alle Mitglieder berechtigt) oder einzelne Mitarbeiter. ' +
          'Die Medien je Mitarbeiter ergeben die Stückzahlen - auch wenn jemand einzeln und in einer Gruppe steht, zählt er nur einmal.' })
      ])
    ]));

    /* --- Hinweise --- */
    var doppelt = M.doppelteMitarbeiter(p);
    if (doppelt.length) {
      karte.appendChild(el('div', { class: 'meldung info doppelt-hinweis' }, el('div', {}, [
        el('b', { text: 'Hinweis: ' }),
        doppelt.map(function (d) {
          return d.mitarbeiter.name + ' (' + d.spalten.map(function (s) { return s.kuerzel || s.bezeichnung; }).join(', ') + ')';
        }).join('; ') + (doppelt.length === 1 ? ' steht' : ' stehen') +
        ' in mehreren Spalten - etwa einzeln und über die Gruppe. Das ist zulässig; Medien werden trotzdem nur einmal je Mitarbeiter gezählt.'
      ])));
    }
    var ohneSpalte = M.mitarbeiterOhneSpalte(p);

    /* --- Gruppen --- */
    var gruppenBereich = el('div', { class: 'personen-abschnitt' });
    gruppenBereich.appendChild(el('div', { class: 'zeile-verteilt' }, [
      el('h3', { class: 'fuellen', text: 'Gruppen (' + (p.gruppen || []).length + ')' }),
      el('button', { class: 'klein', text: '+ Gruppe', onclick: function () { gruppeBearbeiten(null, neuZeichnen); } })
    ]));
    var gruppenListe = el('div', { class: 'chips gruppen-liste' });
    (p.gruppen || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'de'); }).forEach(function (g) {
      var leute = M.gruppenMitglieder(p, g.id);
      var spalte = p.schliessungen.filter(function (s) { return s.art === 'gruppe' && s.gruppeId === g.id; })[0];
      gruppenListe.appendChild(el('button', { type: 'button', class: 'chip gruppe' + (spalte ? ' im-plan' : ''),
        title: (spalte ? 'Spalte im Plan · ' : 'ohne Spalte im Plan · ') + leute.length + ' Mitglieder',
        onclick: function () { gruppeBearbeiten(g, neuZeichnen); } }, [
        el('span', { class: 'name', text: g.name || '(ohne Namen)' }),
        el('span', { class: 'zahl', text: leute.length + (leute.length === 1 ? ' Mitglied' : ' Mitglieder') + (spalte ? '' : ' · ohne Spalte') })
      ]));
    });
    if (!(p.gruppen || []).length) {
      gruppenListe.appendChild(el('span', { class: 'zart', text: 'Noch keine Gruppen. Gruppen benennen Sie selbst - zum Beispiel Verwaltung, Reinigung, EDV.' }));
    }
    gruppenBereich.appendChild(gruppenListe);
    karte.appendChild(gruppenBereich);

    /* --- Mitarbeiter --- */
    var maBereich = el('div', { class: 'personen-abschnitt' });
    var schnell = el('input', { type: 'text', placeholder: 'Neuer Mitarbeiter: Vorname Nachname …', autocomplete: 'off', autocapitalize: 'words',
      'aria-label': 'Neuer Mitarbeiter' });
    function schnellAnlegen() {
      var name = schnell.value.trim();
      if (!name) { mitarbeiterBearbeiten(null, neuZeichnen); return; }
      A.schrittMerken('Mitarbeiter ' + name + ' angelegt');
      p.mitarbeiter.push(M.neuerMitarbeiter({ name: name }));
      schnell.value = '';
      A.alsGeaendertMarkieren(); A.speichern(); neuZeichnen();
      A.toast('Mitarbeiter angelegt - Gruppe und Medien über die Zeile zuordnen.', 'ok');
    }
    schnell.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); schnellAnlegen(); } });
    maBereich.appendChild(el('div', { class: 'zeile-verteilt' }, [
      el('h3', { class: 'fuellen', text: 'Mitarbeiter (' + (p.mitarbeiter || []).length + ')' }),
      el('div', { class: 'knopfleiste' }, [
        el('div', { class: 'schnell-eingabe' }, schnell),
        el('button', { class: 'klein', text: '+ Mitarbeiter', onclick: schnellAnlegen })
      ])
    ]));

    var sortiert = (p.mitarbeiter || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'de'); });
    if (!sortiert.length) {
      maBereich.appendChild(el('p', { class: 'zart', text: 'Noch keine Mitarbeiter erfasst. Namen oben eintippen und mit Enter anlegen.' }));
    } else {
      var tab = el('table', { class: 'personen-tabelle' });
      tab.appendChild(el('thead', {}, el('tr', {}, [
        el('th', { text: 'Name' }), el('th', { text: 'Abteilung / Gruppe' }),
        el('th', { text: 'Medien' }), el('th', { text: 'Berechtigt über' }), el('th', { class: 'zahl', text: '' })
      ])));
      var tb = el('tbody');
      sortiert.forEach(function (m) {
        var gruppenNamen = (m.gruppen || []).map(function (id) { var g = M.gruppeVon(p, id); return g ? g.name : ''; }).filter(Boolean);
        var spalten = M.spaltenVonMitarbeiter(p, m.id);
        var mehrfach = spalten.length > 1;
        var oeffnen = function () { mitarbeiterBearbeiten(m, neuZeichnen); };
        tb.appendChild(el('tr', { class: 'anklickbar' + (!spalten.length ? ' ohne-spalte' : '') }, [
          el('td', { onclick: oeffnen }, [
            el('b', { text: m.name || '(ohne Namen)' }),
            m.funktion ? el('span', { class: 'zart', text: '  ' + m.funktion }) : null
          ]),
          el('td', { onclick: oeffnen, text: gruppenNamen.join(', ') || '–' }),
          el('td', { onclick: oeffnen, text: medienKurz(m) }),
          el('td', { onclick: oeffnen, class: mehrfach ? 'mehrfach' : '',
            text: spalten.length ? spalten.map(function (s) { return s.kuerzel || s.bezeichnung; }).join(', ') : 'noch keine Spalte' }),
          el('td', { class: 'zahl' }, el('button', { class: 'klein', text: 'Bearbeiten', onclick: oeffnen }))
        ]));
      });
      tab.appendChild(tb);
      maBereich.appendChild(el('div', { class: 'tabelle-rahmen' }, tab));
      if (ohneSpalte.length) {
        maBereich.appendChild(el('p', { class: 'zart', style: { marginTop: '8px' },
          text: ohneSpalte.length + (ohneSpalte.length === 1 ? ' Mitarbeiter steht' : ' Mitarbeiter stehen') +
                ' in keiner Spalte des Plans - über eine Gruppe oder eine eigene Spalte zuordnen, sonst gibt es kein Medium.' }));
      }
    }
    karte.appendChild(maBereich);
    return karte;
  }

  global.ViewsPersonen = {
    listenKarte: listenKarte,
    mitarbeiterBearbeiten: mitarbeiterBearbeiten,
    gruppeBearbeiten: gruppeBearbeiten,
    medienFeld: medienFeld,
    gruppenChips: gruppenChips,
    traegerChips: traegerChips,
    gruppeAnlegen: gruppeAnlegen
  };
})(typeof window !== 'undefined' ? window : globalThis);
