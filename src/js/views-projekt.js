/* =============================================================================
 * views-projekt.js — Ansichten: Projektübersicht, Stammdaten, Struktur
 * ========================================================================== */
(function (global) {
  'use strict';
  var A = global.AppKern, K = global.Katalog, M = global.Model, Store = global.Store;
  var el = A.el, Zustand = A.Zustand;

  function datumKurz(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 10);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  function kb(bytes) {
    if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
  }

  /* =========================================================================
   * Projektübersicht
   * ====================================================================== */
  function ansichtProjekte(behaelter, neuLaden) {
    var seite = el('div', { class: 'seite' });
    behaelter.appendChild(seite);

    seite.appendChild(el('div', { class: 'zeile-verteilt', style: { marginBottom: '14px' } }, [
      el('div', { class: 'fuellen' }, [
        el('h1', { text: 'Aufmaß-Projekte' }),
        el('p', { class: 'hinweis', text: 'Zum Bearbeiten ein Projekt öffnen. Alle Daten liegen ausschließlich auf diesem Gerät; zum Austausch mit dem Büro das Projekt exportieren.' })
      ]),
      el('button', {
        class: 'haupt', text: '+ Neues Aufmaß',
        onclick: function () { neuesProjektAnlegen(neuLaden); }
      }),
      (Zustand.einstellungen && Zustand.einstellungen.pipedriveToken)
        ? el('button', { text: 'Aus Pipedrive', title: 'Aufmaß aus einem Deal anlegen',
            onclick: function () { pipedriveDialog(neuLaden); } })
        : null,
      el('button', {
        text: 'Projekt importieren',
        onclick: function () { importDialog(neuLaden); }
      })
    ]));

    var listenBereich = el('div');
    seite.appendChild(listenBereich);
    listenBereich.appendChild(el('p', { class: 'zart', text: 'Projekte werden geladen …' }));

    Store.alleProjekte().then(function (projekte) {
      A.leeren(listenBereich);
      if (!projekte.length) {
        listenBereich.appendChild(el('div', { class: 'leer' }, [
          el('h3', { text: 'Noch kein Aufmaß vorhanden' }),
          el('p', { text: 'Legen Sie ein neues Aufmaß an oder importieren Sie eine Projektdatei aus dem Büro.' }),
          el('button', { class: 'haupt', text: '+ Neues Aufmaß anlegen',
            onclick: function () { neuesProjektAnlegen(neuLaden); } })
        ]));
        return;
      }
      var raster = el('div', { class: 'projekt-raster' });
      projekte.forEach(function (p) {
        var s = M.statistik(p);
        raster.appendChild(el('div', {
          class: 'projekt-karte',
          onclick: function (e) { if (!e.target.closest('button')) projektOeffnen(p.id, neuLaden); }
        }, [
          el('div', { class: 'titel', text: p.kunde || p.name || 'Ohne Namen' }),
          el('div', { class: 'zeile', text: p.objekt || '—' }),
          el('div', { class: 'zeile zart', text:
            [p.anlagenNr ? 'Anlage ' + p.anlagenNr : '', 'geändert ' + datumKurz(p.geaendert)]
            .filter(Boolean).join('  ·  ') }),
          el('div', { class: 'zahlen' }, [
            el('span', {}, [el('b', { text: String(s.tuerenGesamtAnzahl) }), ' Türen']),
            el('span', {}, [el('b', { text: String(s.schliessungen) }), ' Schließungen']),
            s.fotos ? el('span', {}, [el('b', { text: String(s.fotos) }), ' Fotos']) : null,
            s.nacharbeit ? el('span', { class: 'marke-pille rot', text: s.nacharbeit + '× Nacharbeit' }) : null
          ]),
          el('div', { class: 'aktionen' }, [
            el('button', { class: 'haupt klein', text: 'Öffnen',
              onclick: function () { projektOeffnen(p.id, neuLaden); } }),
            el('button', { class: 'klein', text: 'Kopieren',
              onclick: function () {
                var klon = Store.projektKlonen(p);
                Store.projektSpeichern(klon).then(function () {
                  A.toast('Projekt kopiert.', 'ok'); neuLaden();
                });
              } }),
            el('button', { class: 'klein gefahr', text: 'Löschen',
              onclick: function () {
                A.bestaetigen('Projekt löschen?',
                  'Das Aufmaß „' + (p.kunde || p.name) + '“ mit ' + s.tueren +
                  ' Türen wird endgültig gelöscht. Dieser Schritt kann nicht rückgängig gemacht werden.')
                  .then(function (ja) {
                    if (!ja) return;
                    Store.projektLoeschen(p.id).then(function () {
                      if (Zustand.projekt && Zustand.projekt.id === p.id) {
                        Zustand.projekt = null; Zustand.ansicht = 'projekte';
                        if (global.Verlauf) global.Verlauf.beenden();
                      }
                      A.toast('Projekt gelöscht.'); neuLaden();
                    });
                  });
              } })
          ])
        ]));
      });
      listenBereich.appendChild(raster);

      Store.speicherInfo().then(function (info) {
        if (!info.unterstuetzt) return;
        listenBereich.appendChild(el('p', {
          class: 'zart', style: { marginTop: '16px' },
          text: 'Belegter Gerätespeicher: ' + kb(info.benutzt) +
                (info.verfuegbar ? ' von rund ' + kb(info.verfuegbar) : '') +
                (Store.nutztFallback() ? '  ·  Hinweis: Es wird der einfache Browserspeicher genutzt (begrenzte Kapazität).' : '')
        }));
      });
    });
  }

  /* =========================================================================
   * Aufmaß aus einem Pipedrive-Deal anlegen
   * ======================================================================
   * Das Werkzeug holt die Deals ab; es wird nichts nach Pipedrive geschrieben.
   */
  function pipedriveDialog(neuLaden) {
    var e = Zustand.einstellungen || {};
    var PD = global.Pipedrive;

    if (!e.pipedriveToken) {
      A.dialogOeffnen({
        titel: 'Pipedrive ist noch nicht verbunden', klein: true,
        inhalt: el('div', {}, [
          el('p', { class: 'hinweis', style: { marginTop: '0' },
            text: 'Hinterlegen Sie zuerst unter Einstellungen den Zugriffsschlüssel aus Pipedrive. ' +
                  'Danach lassen sich Aufmaße direkt aus einem Deal anlegen.' })
        ]),
        knoepfe: [
          { fuellen: true },
          { text: 'Abbrechen' },
          { text: 'Zu den Einstellungen', klasse: 'haupt', aktion: function (schliessen) {
            schliessen();
            global.App.wechseln('einstellungen');
            return false;
          } }
        ]
      });
      return;
    }

    var liste = el('div');
    var dlg = A.dialogOeffnen({
      titel: 'Aufmaß aus einem Pipedrive-Deal anlegen',
      inhalt: el('div', {}, [
        el('p', { class: 'hinweis', style: { marginTop: '0' },
          text: e.pipedrivePipelineName
            ? ('Offene Deals aus der Pipeline „' + e.pipedrivePipelineName + '“.')
            : 'Offene Deals aus allen Pipelines. Unter Einstellungen lässt sich eine Pipeline festlegen.' }),
        liste
      ]),
      knoepfe: [{ fuellen: true }, { text: 'Schließen' }]
    });

    liste.appendChild(el('p', { class: 'zart', text: 'Deals werden abgerufen …' }));

    PD.deals(e, e.pipedrivePipelineId || undefined, { status: 'open', limit: 100 })
      .then(function (deals) {
        A.leeren(liste);
        if (!deals.length) {
          liste.appendChild(el('div', { class: 'leer' }, [
            el('h3', { text: 'Keine offenen Deals gefunden' }),
            el('p', { text: e.pipedrivePipelineName
              ? ('In der Pipeline „' + e.pipedrivePipelineName + '“ steht derzeit kein offener Deal.')
              : 'Es wurde kein offener Deal gefunden.' })
          ]));
          return;
        }

        /* Bereits übernommene Deals kennzeichnen */
        Store.alleProjekte().then(function (vorhandene) {
          var schonDa = {};
          vorhandene.forEach(function (pr) {
            if (pr.pipedrive && pr.pipedrive.dealId) schonDa[pr.pipedrive.dealId] = pr;
          });

          A.leeren(liste);
          var box = el('div', { class: 'tuer-liste', style: { border: '1px solid var(--rand)',
            borderRadius: 'var(--radius)' } });
          deals.forEach(function (deal) {
            var bekannt = schonDa[deal.id];
            box.appendChild(el('div', {
              class: 'tuer-zeile',
              onclick: function () { dealUebernehmen(deal, bekannt, dlg, neuLaden); }
            }, [
              el('div', { class: 'statusbalken',
                style: { background: bekannt ? 'var(--text-zart)' : 'var(--gruen)' } }),
              el('div', { class: 'inhalt' }, [
                el('div', { class: 'haupt' }, [
                  el('div', { class: 'bez', text: deal.titel || ('Deal ' + deal.id) }),
                  el('div', { class: 'detail', text:
                    ['Deal-Nr. ' + deal.id,
                     deal.wert ? (Number(deal.wert).toLocaleString('de-DE') + ' ' + deal.waehrung) : '',
                     deal.geaendert ? ('geändert ' + datumKurz(deal.geaendert)) : ''
                    ].filter(Boolean).join('  ·  ') })
                ]),
                el('div', { class: 'marken' }, [
                  bekannt ? el('span', { class: 'marke-pille', text: 'bereits übernommen' })
                          : el('span', { class: 'marke-pille gruen', text: 'übernehmen' })
                ])
              ])
            ]));
          });
          liste.appendChild(box);
        });
      })
      .catch(function (fehler) {
        A.leeren(liste);
        liste.appendChild(el('div', { class: 'meldung fehler' }, el('div', {}, [
          el('b', { text: fehler.message || 'Die Deals konnten nicht abgerufen werden.' }),
          fehler.zusatz ? el('div', { style: { marginTop: '6px', fontSize: '13px' }, text: fehler.zusatz }) : null
        ])));
      });
  }

  function dealUebernehmen(deal, bekannt, dlg, neuLaden) {
    var e = Zustand.einstellungen || {};
    var PD = global.Pipedrive;

    if (bekannt) {
      A.bestaetigen('Deal bereits übernommen',
        'Zu diesem Deal gibt es schon das Aufmaß „' + (bekannt.kunde || bekannt.name) +
        '“. Soll trotzdem ein weiteres angelegt werden?', 'Weiteres anlegen')
        .then(function (ja) { if (ja) holenUndAnlegen(); });
      return;
    }
    holenUndAnlegen();

    function holenUndAnlegen() {
      A.toast('Stammdaten werden aus Pipedrive geholt …');
      PD.dealVollstaendig(e, deal).then(function (daten) {
        var projekt = M.neuesProjekt(deal.titel || 'Aufmaß aus Pipedrive');
        if (e.standardBearbeiter) projekt.bearbeiter = e.standardBearbeiter;
        var ergebnis = PD.aufProjektAbbilden(projekt, daten, e);

        return Store.projektSpeichern(projekt).then(function () {
          if (dlg) dlg.schliessen();
          A.projektOeffnenIntern(projekt, 'stammdaten');
          neuLaden();
          var n = ergebnis.uebernommen.length;
          A.toast(n ? (n + ' Angaben aus Pipedrive übernommen: ' + ergebnis.uebernommen.join(', '))
                    : 'Aufmaß angelegt. In Pipedrive waren keine Stammdaten hinterlegt.', 'ok');
        });
      }).catch(function (fehler) {
        A.toast(fehler.message || 'Die Übernahme ist fehlgeschlagen.', 'fehler');
      });
    }
  }

  function neuesProjektAnlegen(neuLaden) {
    A.textAbfragen('Neues Aufmaß', 'Kunde oder Objektbezeichnung', '', 'z. B. Müller GmbH – Verwaltung')
      .then(function (name) {
        if (name === null) return;
        var p = M.neuesProjekt(name || 'Neues Aufmaß');
        p.kunde = name || '';
        if (Zustand.einstellungen && Zustand.einstellungen.standardBearbeiter) {
          p.bearbeiter = Zustand.einstellungen.standardBearbeiter;
        }
        Store.projektSpeichern(p).then(function () {
          A.projektOeffnenIntern(p, 'stammdaten');
          neuLaden();
          A.toast('Aufmaß angelegt. Bitte Stammdaten ergänzen.', 'ok');
        });
      });
  }

  function projektOeffnen(id, neuLaden) {
    Store.projektLaden(id).then(function (p) {
      if (!p) { A.toast('Projekt nicht gefunden.', 'fehler'); return; }
      var geladen = M.migriere(p);
      geladen.id = p.id;
      A.projektOeffnenIntern(geladen, 'tueren');
      neuLaden();
    });
  }

  function importDialog(neuLaden) {
    var dateiEingabe = el('input', {
      type: 'file', accept: '.json,application/json',
      onchange: function (e) {
        var datei = e.target.files && e.target.files[0];
        if (!datei) return;
        var leser = new FileReader();
        leser.onerror = function () { A.toast('Die Datei konnte nicht gelesen werden.', 'fehler'); };
        leser.onload = function () {
          var ergebnis;
          try { ergebnis = Store.importParsen(leser.result); }
          catch (fehler) { A.toast(fehler.message, 'fehler'); return; }
          Store.alleProjekte().then(function (vorhandene) {
            var gleich = vorhandene.filter(function (v) { return v.id === ergebnis.projekt.id; })[0];
            var fortsetzen = function (projekt) {
              Store.projektSpeichern(projekt).then(function () {
                A.projektOeffnenIntern(projekt, 'tueren');
                A.toast('Projekt importiert: ' + projekt.tueren.length + ' Türen.', 'ok');
                dlg.schliessen(); neuLaden();
              });
            };
            if (gleich) {
              A.bestaetigen('Projekt bereits vorhanden',
                'Ein Projekt mit derselben Kennung existiert bereits („' + (gleich.kunde || gleich.name) +
                '“). Soll es überschrieben werden? Andernfalls wird eine Kopie angelegt.',
                'Überschreiben').then(function (ueberschreiben) {
                  fortsetzen(ueberschreiben ? ergebnis.projekt
                    : Store.projektKlonen(ergebnis.projekt, (ergebnis.projekt.name || 'Import') + ' (Import)'));
                });
            } else { fortsetzen(ergebnis.projekt); }
          });
        };
        leser.readAsText(datei);
      }
    });
    var dlg = A.dialogOeffnen({
      titel: 'Projekt importieren', klein: true,
      inhalt: el('div', {}, [
        el('p', { class: 'hinweis', text: 'Wählen Sie eine zuvor exportierte Aufmaß-Datei (.json) aus.' }),
        dateiEingabe
      ]),
      knoepfe: [{ fuellen: true }, { text: 'Abbrechen' }]
    });
  }

  /* =========================================================================
   * Stammdaten
   * ====================================================================== */
  function ansichtStammdaten(behaelter) {
    var p = Zustand.projekt;
    var seite = el('div', { class: 'seite' });
    behaelter.appendChild(seite);

    seite.appendChild(el('h1', { text: 'Projekt-Stammdaten' }));
    seite.appendChild(el('p', { class: 'hinweis', text: 'Diese Angaben erscheinen im Kopf jeder PDF-Ausgabe.' }));

    /* Verknüpfung zu Pipedrive, sofern das Aufmaß von dort stammt */
    if (p.pipedrive && p.pipedrive.dealId) {
      seite.appendChild(el('div', { class: 'meldung info' }, el('div', {}, [
        el('b', { text: 'Verknüpft mit Pipedrive' }),
        el('div', { style: { marginTop: '4px', fontSize: '13.5px' }, text:
          'Deal-Nr. ' + p.pipedrive.dealId +
          (p.pipedrive.dealTitel ? ('  ·  ' + p.pipedrive.dealTitel) : '') +
          (p.pipedrive.orgId ? ('  ·  Organisation ' + p.pipedrive.orgId) : '') }),
        p.pipedrive.dealLink ? el('div', { style: { marginTop: '8px' } },
          el('a', { class: 'knopf klein', href: p.pipedrive.dealLink, target: '_blank',
                    rel: 'noopener noreferrer', text: 'Deal in Pipedrive öffnen ↗' })) : null
      ])));
    }

    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Kunde und Objekt' }),
      el('div', { class: 'raster' }, [
        A.textFeld(p, 'kunde', 'Kunde / Firma'),
        A.textFeld(p, 'kundenNr', 'Kunden-Nr.'),
        A.textFeld(p, 'objekt', 'Objekt / Liegenschaft'),
        A.textFeld(p, 'strasse', 'Straße und Hausnummer'),
        A.textFeld(p, 'plz', 'PLZ', { inputmode: 'numeric' }),
        A.textFeld(p, 'ort', 'Ort'),
        A.textFeld(p, 'anlagenNr', 'Anlagen-Nr. / Schließanlagen-Nr.')
      ])
    ]));

    /* --- Schließanlage: gilt für das gesamte Projekt --------------------- */
    var anlageKarte = el('div', { class: 'karte' });
    seite.appendChild(anlageKarte);
    anlageZeichnen();

    function anlageZeichnen() {
      A.leeren(anlageKarte);
      var eigene = (Zustand.einstellungen && Zustand.einstellungen.eigeneSysteme) || [];
      function systemOptionen(typ) {
        return K.systemeNachTyp(typ, eigene).map(function (sy) {
          return { id: sy.id, label: K.systemLabel(sy.id, eigene) };
        });
      }

      anlageKarte.appendChild(el('h2', { text: 'Schließanlage' }));
      anlageKarte.appendChild(el('p', { class: 'hinweis',
        text: 'Diese Angaben gelten für das gesamte Projekt. An der einzelnen Tür muss das System nicht erneut gewählt werden.' }));

      var artFelder = el('div', { class: 'raster' }, [
        A.auswahlFeld(p, 'anlagenart', 'Art der Anlage', K.ANLAGENART, {
          leerText: '– bitte wählen –',
          beiAenderung: function () { anlageZeichnen(); }
        })
      ]);
      anlageKarte.appendChild(artFelder);

      var art = K.ANLAGENART.filter(function (a) { return a.id === p.anlagenart; })[0];
      if (art) {
        anlageKarte.appendChild(el('p', { class: 'hinweis', style: { marginTop: '8px' }, text: art.hinweis }));
      }

      if (!p.anlagenart) {
        anlageKarte.appendChild(el('div', { class: 'meldung info', style: { marginTop: '12px' } },
          el('div', { text: 'Bitte zuerst die Art der Anlage festlegen – davon hängt ab, welche Angaben an den Türen überhaupt nötig sind.' })));
        return;
      }

      var systemFelder = el('div', { class: 'raster', style: { marginTop: '14px' } });
      if (p.anlagenart === 'mechanik' || p.anlagenart === 'hybrid') {
        systemFelder.appendChild(A.auswahlFeld(p, 'systemMechanik',
          'Mechanisches System', systemOptionen('mechanisch'),
          { leerText: '– bitte wählen –', beiAenderung: function () { anlageZeichnen(); } }));
      }
      if (p.anlagenart === 'elektronik' || p.anlagenart === 'hybrid') {
        systemFelder.appendChild(A.auswahlFeld(p, 'systemElektronik',
          'Elektronisches System', systemOptionen('elektronisch'),
          { leerText: '– bitte wählen –', beiAenderung: function () { anlageZeichnen(); } }));
      }
      systemFelder.appendChild(A.textFeld(p, 'systemDetail', 'Detail / Variante zur Anlage',
        { platzhalter: 'z. B. Profil, Sonderfarbe, Schließfolge' }));
      anlageKarte.appendChild(systemFelder);

      /* Hinweise der gewählten Systeme anzeigen */
      [p.systemMechanik, p.systemElektronik].filter(Boolean).forEach(function (sid) {
        var sys = K.systemById(sid, eigene);
        if (sys && sys.hinweis) {
          anlageKarte.appendChild(el('p', { class: 'zart', style: { marginTop: '6px' },
            text: K.systemLabel(sid, eigene) + ': ' + sys.hinweis }));
        }
      });

      if (!M.anlageVollstaendig(p)) {
        anlageKarte.appendChild(el('div', { class: 'meldung warn', style: { marginTop: '12px' } },
          el('div', { text: 'Es fehlt noch ein System. Solange es nicht gewählt ist, bleiben die Türangaben unvollständig.' })));
      } else if (p.anlagenart === 'hybrid') {
        anlageKarte.appendChild(el('div', { class: 'meldung info', style: { marginTop: '12px' } },
          el('div', { text: 'Hybridanlage: An jeder Tür wird nur noch angegeben, ob sie mechanisch oder elektronisch ausgeführt wird.' })));
      }
    }

    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Ansprechpartner vor Ort' }),
      el('div', { class: 'raster' }, [
        A.textFeld(p, 'ansprechpartner', 'Name'),
        A.textFeld(p, 'telefon', 'Telefon', { typ: 'tel' }),
        A.textFeld(p, 'email', 'E-Mail', { typ: 'email' })
      ])
    ]));

    seite.appendChild(el('div', { class: 'karte' }, [
      el('h2', { text: 'Aufmaß' }),
      el('div', { class: 'raster' }, [
        A.textFeld(p, 'aufmassDatum', 'Aufmaßdatum', { typ: 'date' }),
        A.textFeld(p, 'bearbeiter', 'Bearbeiter / Monteur'),
        A.textFeld(p, 'name', 'Interne Projektbezeichnung')
      ]),
      el('div', { class: 'raster', style: { marginTop: '12px' } }, [
        A.bereichFeld(p, 'bemerkung', 'Projektbemerkung', {
          zeilen: 4,
          platzhalter: 'Besonderheiten, Absprachen, Bauabschnitte, offene Punkte …'
        })
      ])
    ]));
  }

  /* =========================================================================
   * Struktur: Standorte → Gebäude → Bereiche/Etagen
   * ====================================================================== */
  var EBENEN = {
    standort: { label: 'Standort', kind: 'gebaeude', kindLabel: 'Gebäude' },
    gebaeude: { label: 'Gebäude', kind: 'bereich',  kindLabel: 'Bereich / Etage' },
    bereich:  { label: 'Bereich', kind: 'bereich',  kindLabel: 'Unterbereich' }
  };

  function ansichtStruktur(behaelter, neuZeichnen) {
    var p = Zustand.projekt;
    var seite = el('div', { class: 'seite' });
    behaelter.appendChild(seite);

    seite.appendChild(el('div', { class: 'zeile-verteilt', style: { marginBottom: '6px' } }, [
      el('div', { class: 'fuellen' }, [
        el('h1', { text: 'Standorte, Gebäude und Bereiche' }),
        el('p', { class: 'hinweis', text: 'Die Gliederung bestimmt die Gruppierung in Türliste und Kreuzschließplan. Die Reihenfolge hier ist auch die Reihenfolge in der PDF-Ausgabe.' })
      ]),
      el('button', { class: 'haupt', text: '+ Standort',
        onclick: function () { knotenAnlegen('standort', null, neuZeichnen); } })
    ]));

    var wurzeln = M.kinderVon(p, null);
    if (!wurzeln.length) {
      seite.appendChild(el('div', { class: 'leer' }, [
        el('h3', { text: 'Noch keine Gliederung angelegt' }),
        el('p', { text: 'Legen Sie zuerst einen Standort an, darunter Gebäude und Etagen. Türen ohne Zuordnung erscheinen in der PDF unter „Ohne Zuordnung“.' }),
        el('button', { class: 'haupt', text: '+ Ersten Standort anlegen',
          onclick: function () { knotenAnlegen('standort', null, neuZeichnen); } })
      ]));
      return;
    }

    var liste = el('ul', { class: 'baum' });
    wurzeln.forEach(function (k) { liste.appendChild(knotenZeichnen(k, neuZeichnen)); });
    seite.appendChild(el('div', { class: 'karte' }, liste));
  }

  function tuerenImKnoten(knotenId) {
    var p = Zustand.projekt;
    var ids = [knotenId], i = 0;
    while (i < ids.length) {
      var aktuell = ids[i++];
      p.standorte.forEach(function (k) { if (k.parentId === aktuell) ids.push(k.id); });
    }
    return p.tueren.filter(function (t) { return ids.indexOf(t.strukturId) !== -1; }).length;
  }

  function knotenZeichnen(knoten, neuZeichnen) {
    var p = Zustand.projekt;
    var kinder = M.kinderVon(p, knoten.id);
    var konfig = EBENEN[knoten.ebene] || EBENEN.bereich;
    var anzahl = tuerenImKnoten(knoten.id);
    var geschwister = M.kinderVon(p, knoten.parentId);
    var index = geschwister.indexOf(geschwister.filter(function (g) { return g.id === knoten.id; })[0]);

    function verschieben(richtung) {
      var ziel = index + richtung;
      if (ziel < 0 || ziel >= geschwister.length) return;
      /* Sortierwerte neu vergeben und die beiden Knoten tauschen */
      A.schrittMerken('Reihenfolge geändert');
      geschwister.forEach(function (g, i) { g.sort = i; });
      geschwister[index].sort = ziel;
      geschwister[ziel].sort = index;
      A.alsGeaendertMarkieren();
      neuZeichnen();
    }

    var eintrag = el('li', {}, [
      el('div', { class: 'knoten' }, [
        el('span', { class: 'ebene-marke', text: konfig.label }),
        el('span', { class: 'name', text: knoten.name || '(ohne Namen)' }),
        anzahl ? el('span', { class: 'tuerzahl', text: anzahl + (anzahl === 1 ? ' Tür' : ' Türen') }) : null,
        el('div', { class: 'aktionen' }, [
          el('button', { class: 'klein nur-symbol', title: 'Nach oben', text: '↑',
            disabled: index <= 0, onclick: function () { verschieben(-1); } }),
          el('button', { class: 'klein nur-symbol', title: 'Nach unten', text: '↓',
            disabled: index >= geschwister.length - 1, onclick: function () { verschieben(1); } }),
          el('button', { class: 'klein', text: '+ ' + konfig.kindLabel,
            onclick: function () { knotenAnlegen(konfig.kind, knoten.id, neuZeichnen); } }),
          el('button', { class: 'klein nur-symbol', title: 'Umbenennen', text: '✎',
            onclick: function () {
              A.textAbfragen('Umbenennen', konfig.label + 'sbezeichnung', knoten.name).then(function (neu) {
                if (neu === null) return;
                A.schrittMerken('Umbenannt: ' + (knoten.name || 'Eintrag'));
                knoten.name = neu; A.alsGeaendertMarkieren(); neuZeichnen();
              });
            } }),
          el('button', { class: 'klein nur-symbol gefahr', title: 'Löschen', text: '🗑',
            onclick: function () {
              var text = anzahl
                ? 'Dieser Eintrag und alle Unterbereiche werden gelöscht. ' + anzahl +
                  ' zugeordnete Tür(en) bleiben erhalten, verlieren aber ihre Zuordnung.'
                : 'Dieser Eintrag und alle Unterbereiche werden gelöscht.';
              A.bestaetigen('„' + (knoten.name || 'Eintrag') + '“ löschen?', text).then(function (ja) {
                if (!ja) return;
                A.schrittMerken('Gelöscht: ' + (knoten.name || 'Eintrag'));
                M.loescheStruktur(p, knoten.id);
                A.alsGeaendertMarkieren(); neuZeichnen();
                A.toast('Eintrag gelöscht.');
              });
            } })
        ])
      ])
    ]);

    if (kinder.length) {
      var unterliste = el('ul');
      kinder.forEach(function (k) { unterliste.appendChild(knotenZeichnen(k, neuZeichnen)); });
      eintrag.appendChild(unterliste);
    }
    return eintrag;
  }

  function knotenAnlegen(ebene, parentId, neuZeichnen) {
    var konfig = EBENEN[ebene] || EBENEN.bereich;
    A.textAbfragen('Neuer Eintrag', konfig.label + 'sbezeichnung', '',
      ebene === 'standort' ? 'z. B. Standort Düsseldorf'
        : ebene === 'gebaeude' ? 'z. B. Haus A (Verwaltung)' : 'z. B. Erdgeschoss')
      .then(function (name) {
        if (name === null) return;
        var p = Zustand.projekt;
        A.schrittMerken((konfig.label) + ' angelegt: ' + (name || konfig.label));
        var knoten = M.neuerStrukturknoten(ebene, name || konfig.label, parentId);
        knoten.sort = M.kinderVon(p, parentId).length;
        p.standorte.push(knoten);
        A.alsGeaendertMarkieren();
        neuZeichnen();
      });
  }

  /* Von der schwebenden Hauptaktion aus aufrufbar */
  function standortAnlegen(neuZeichnen) { knotenAnlegen('standort', null, neuZeichnen); }

  global.ViewsProjekt = {
    ansichtProjekte: ansichtProjekte,
    neuesProjektAnlegen: neuesProjektAnlegen,
    pipedriveDialog: pipedriveDialog,
    standortAnlegen: standortAnlegen,
    ansichtStammdaten: ansichtStammdaten,
    ansichtStruktur: ansichtStruktur,
    datumKurz: datumKurz, kb: kb
  };
})(typeof window !== 'undefined' ? window : globalThis);
