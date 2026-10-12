/* =============================================================================
 * abgleich-ui.js — Anmeldung, Zustandsanzeige und Rückfragen
 *
 * Wichtigste Eigenschaft: Diese Oberfläche hält niemals jemanden auf. Wer
 * sich nicht anmelden kann - kein Netz, Google gerade nicht erreichbar,
 * Konto noch nicht freigegeben - arbeitet trotzdem weiter. Die Anmeldung
 * ist der Weg zur gemeinsamen Ablage, nicht die Eintrittskarte in das
 * Werkzeug.
 * ========================================================================== */
(function (global) {
  'use strict';

  var A = global.AppKern, Abgleich = global.Abgleich;
  var el = A.el;
  var GOOGLE_SKRIPT = 'https://accounts.google.com/gsi/client';

  var neuZeichnen = null;
  var googleGeladen = false;
  var uebersprungen = false;      /* "ohne Abgleich weiterarbeiten" gewählt */

  /* ---------------------------------------------------------------- */
  /* Google-Anmeldeknopf                                               */
  /* ---------------------------------------------------------------- */
  function googleLaden() {
    if (googleGeladen) { return Promise.resolve(true); }
    return new Promise(function (fertig) {
      var s = document.createElement('script');
      s.src = GOOGLE_SKRIPT;
      s.async = true; s.defer = true;
      s.onload = function () { googleGeladen = true; fertig(true); };
      s.onerror = function () { fertig(false); };
      document.head.appendChild(s);
      /* Nicht ewig warten - ohne Netz kommt nichts. */
      setTimeout(function () { fertig(googleGeladen); }, 8000);
    });
  }

  function knopfZeichnen(ziel, beiAusweis) {
    var z = Abgleich.zustand();
    A.leeren(ziel);
    if (!z.clientId) {
      ziel.appendChild(el('p', { class: 'meldung warn', text:
        'Der Abgleich ist auf dem Server noch nicht eingerichtet: Es fehlt die Google-Client-ID.' }));
      return;
    }
    var platz = el('div', { class: 'google-knopf' });
    ziel.appendChild(platz);

    googleLaden().then(function (da) {
      if (!da || !global.google || !global.google.accounts) {
        A.leeren(platz);
        platz.appendChild(el('p', { class: 'meldung warn', text:
          'Die Anmeldeseite von Google ist nicht erreichbar. Ohne Netz ist das normal - '
          + 'das Werkzeug arbeitet weiter, der Abgleich holt später nach.' }));
        return;
      }
      try {
        global.google.accounts.id.initialize({
          client_id: z.clientId,
          callback: function (antwort) { beiAusweis(antwort.credential); },
          auto_select: false,
          cancel_on_tap_outside: true,
          /* Nur Konten der Organisation anbieten - der Server prüft es
             ohnehin noch einmal, aber so sieht man es schon hier. */
          hd: z.domaene || undefined
        });
        global.google.accounts.id.renderButton(platz, {
          type: 'standard', theme: 'filled_blue', size: 'large',
          text: 'signin_with', shape: 'pill', locale: 'de', width: 280
        });
      } catch (e) {
        platz.appendChild(el('p', { class: 'meldung fehler', text:
          'Die Google-Anmeldung ließ sich nicht aufbauen: ' + (e.message || e) }));
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Anmeldeseite                                                      */
  /* ---------------------------------------------------------------- */
  function anmeldeSeite(ziel, eins) {
    var z = Abgleich.zustand();
    var seite = el('div', { class: 'anmelde-seite' });

    seite.appendChild(el('div', { class: 'anmelde-karte' }, [
      eins && eins.logoDataUrl
        ? el('img', { class: 'logo', src: eins.logoDataUrl, alt: eins.firma || '' })
        : null,
      el('h1', { text: (eins && eins.firma) || 'Aufmaß-Tool' }),
      el('p', { class: 'zart', text: (eins && eins.firmaZusatz) || 'Schließanlagen & Zutritt' }),
      el('hr', { class: 'trenner' }),
      el('h2', { style: { marginTop: '0' }, text: 'Anmelden' }),
      el('p', { text: z.domaene
        ? 'Mit dem Google-Konto von ' + z.domaene + '. Danach stehen alle Aufmaße auf jedem Gerät zur Verfügung.'
        : 'Mit dem Google-Konto der Organisation. Danach stehen alle Aufmaße auf jedem Gerät zur Verfügung.' }),
      (function () { var k = el('div', { style: { margin: '18px 0' } });
                     knopfZeichnen(k, anmelden); return k; })(),
      z.letzterFehler ? el('p', { class: 'meldung fehler', text: z.letzterFehler }) : null,
      el('hr', { class: 'trenner' }),
      el('p', { class: 'zart', text:
        'Das Werkzeug arbeitet auch ohne Anmeldung vollständig auf diesem Gerät. '
        + 'Ohne Anmeldung bleiben die Aufmaße aber nur hier.' }),
      el('button', { class: 'klein', text: 'Ohne Abgleich weiterarbeiten',
        onclick: function () { uebersprungen = true; if (neuZeichnen) { neuZeichnen(); } } })
    ]));
    ziel.appendChild(seite);
  }

  function anmelden(token) {
    A.toast('Anmeldung wird geprüft …');
    Abgleich.anmelden(token).then(function () {
      var z = Abgleich.zustand();
      A.toast('Angemeldet als ' + (z.benutzer ? z.benutzer.name : '') + '.', 'ok');
      uebersprungen = false;
      Abgleich.start();
      if (neuZeichnen) { neuZeichnen(); }
    }).catch(function (f) {
      A.toast(f.message || 'Die Anmeldung ist gescheitert.', 'fehler');
      if (neuZeichnen) { neuZeichnen(); }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Zustandsanzeige in der Kopfzeile                                  */
  /* ---------------------------------------------------------------- */
  function statusKnoten() {
    var z = Abgleich.zustand();
    var knoten = el('button', { class: 'abgleich-status', title: 'Abgleich',
      onclick: function () { uebersichtZeigen(); } });

    var art, text;
    var antworten = (z.antworten || []).length;
    if (!z.angemeldet) { art = 'aus'; text = 'Nicht angemeldet'; }
    else if (z.konflikte.length) { art = 'frage'; text = z.konflikte.length + ' Rückfrage' + (z.konflikte.length > 1 ? 'n' : ''); }
    else if (antworten) { art = 'antwort'; text = antworten + (antworten === 1 ? ' Rückmeldung' : ' Rückmeldungen'); }
    else if (z.erreichbar === false) { art = 'offline'; text = z.offen ? z.offen + ' wartet' : 'Offline'; }
    else if (z.laeuft) { art = 'laeuft'; text = 'Gleicht ab …'; }
    else if (z.offen) { art = 'offen'; text = z.offen + ' wartet'; }
    else { art = 'fertig'; text = 'Abgeglichen'; }

    knoten.className = 'abgleich-status ' + art;
    knoten.appendChild(el('span', { class: 'punkt' }));
    knoten.appendChild(el('span', { class: 'text', text: text }));
    return knoten;
  }

  function uebersichtZeigen() {
    var z = Abgleich.zustand();
    if (z.konflikte.length) { konfliktDialog(z.konflikte[0]); return; }

    var inhalt = el('div');
    if (z.angemeldet && z.benutzer) {
      inhalt.appendChild(el('p', {}, [
        'Angemeldet als ', el('b', { text: z.benutzer.name }),
        el('span', { class: 'zart', text: '  ·  ' + z.benutzer.email })
      ]));
    } else {
      inhalt.appendChild(el('p', { text: 'Dieses Gerät ist nicht angemeldet. Die Aufmaße bleiben hier.' }));
    }
    /* Wartende Kundenrückmeldungen zuerst - das ist der Grund, warum man
       meist hier hineinschaut. */
    if ((z.antworten || []).length) {
      var liste = el('div', { class: 'antworten-liste' });
      inhalt.appendChild(el('h3', { text: 'Rückmeldungen von Kunden', style: { marginBottom: '2px' } }));
      inhalt.appendChild(el('p', { class: 'zart', style: { marginTop: '0' },
        text: 'Warten auf Ihre Prüfung. Übernommen wird erst, wenn Sie es bestätigen.' }));
      z.antworten.forEach(function (a) {
        liste.appendChild(el('div', { class: 'eintrag' }, [
          el('div', { class: 'fuellen' }, [
            el('b', { text: (a.kunde || 'Aufmaß') + (a.objekt ? ' – ' + a.objekt : '') }),
            el('div', { class: 'zart', style: { fontSize: '13px' },
              text: 'von ' + (a.antwortName || 'dem Kunden') + ' am ' + datum(a.antwortAm) + '  ·  ' + zusammenfassung(a) })
          ]),
          el('button', { class: 'haupt klein', text: 'Prüfen', onclick: function () {
            dlg.schliessen();
            antwortDialog(a);
          } })
        ]));
      });
      inhalt.appendChild(liste);
      inhalt.appendChild(el('hr', { class: 'trenner' }));
    }
    inhalt.appendChild(el('ul', { class: 'liste-schlicht' }, [
      el('li', { text: 'Verbindung: ' + (z.erreichbar === false ? 'nicht erreichbar' : 'in Ordnung') }),
      el('li', { text: 'Noch nicht gesendet: ' + z.offen + (z.offen === 1 ? ' Aufmaß' : ' Aufmaße') }),
      el('li', { text: 'Zuletzt abgeglichen: ' + (z.letzterAbgleich
        ? new Date(z.letzterAbgleich).toLocaleString('de-DE') : 'noch nie') })
    ]));
    if (z.letzterFehler) {
      inhalt.appendChild(el('p', { class: 'meldung warn', text: z.letzterFehler }));
    }
    if (z.erreichbar === false) {
      inhalt.appendChild(el('p', { class: 'hinweis', text:
        'Ohne Verbindung wird alles auf dem Gerät gespeichert und später nachgeholt. '
        + 'Es geht nichts verloren.' }));
    }

    var knoepfe = [{ text: 'Schließen' }];
    if (z.angemeldet) {
      knoepfe.unshift({ text: 'Jetzt abgleichen', klasse: 'haupt', schliesst: false,
        aktion: function () { Abgleich.jetzt().then(function () { if (neuZeichnen) { neuZeichnen(); } }); } });
      knoepfe.unshift({ text: 'Abmelden', klasse: 'gefahr', aktion: function () {
        Abgleich.abmelden().then(function () { if (neuZeichnen) { neuZeichnen(); } });
      } });
      knoepfe.splice(2, 0, { fuellen: true });
    }
    var dlg = A.dialogOeffnen({ titel: 'Abgleich', klein: !(z.antworten || []).length, inhalt: inhalt, knoepfe: knoepfe });
  }

  /* ---------------------------------------------------------------- */
  /* Kundenrückmeldung prüfen und übernehmen                           */
  /* ---------------------------------------------------------------- */
  function datum(iso) {
    if (!iso) { return '–'; }
    try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return String(iso).slice(0, 16).replace('T', ' '); }
  }

  function zusammenfassung(a) {
    var n = a.antwortAnzahl || 0, m = a.antwortListen || 0;
    var teile = [n + (n === 1 ? ' Berechtigung' : ' Berechtigungen')];
    if (m) { teile.push(m + (m === 1 ? ' Inhaberliste' : ' Inhaberlisten')); }
    return teile.join(', ');
  }

  function wertText(w) {
    var K = global.Katalog;
    var zeichen = K && K.berechtigungZeichen ? K.berechtigungZeichen(w) : '';
    var namen = { nein: 'keine Berechtigung', ja: 'berechtigt', zeit: 'zeitlich begrenzt', temp: 'vorübergehend', sperr: 'gesperrt' };
    return (zeichen ? zeichen + '  ' : '') + (namen[w] || w || '–');
  }

  function berichtZeichnen(ziel, b) {
    A.leeren(ziel);
    var zellen = b.aenderungen.filter(function (x) { return !x.personen; });
    var listen = b.aenderungen.filter(function (x) { return x.personen; });
    if (!zellen.length && !listen.length) {
      ziel.appendChild(el('div', { class: 'meldung warn' }, el('div', { text:
        'Diese Rückmeldung enthält keine Änderungen gegenüber dem aktuellen Stand des Aufmaßes'
        + (b.uebersprungen || b.personenUebersprungen ? ' – ' + ((b.uebersprungen || 0) + (b.personenUebersprungen || 0))
          + ' Einträge betreffen Türen oder Schließungen, die es nicht mehr gibt.' : '.') })));
      return;
    }
    if (zellen.length) {
      ziel.appendChild(el('h3', { text: zellen.length + (zellen.length === 1 ? ' Berechtigung' : ' Berechtigungen') }));
      var tabelle = el('table');
      tabelle.appendChild(el('thead', {}, el('tr', {}, [
        el('th', { text: 'Tür' }), el('th', { text: 'Schließung' }), el('th', { text: 'Bisher' }), el('th', { text: 'Neu' })
      ])));
      var koerper = el('tbody');
      zellen.forEach(function (x) {
        koerper.appendChild(el('tr', {}, [
          el('td', { text: x.tuer || '–' }), el('td', { text: x.schliessung || '–' }),
          el('td', { text: wertText(x.vorher) }), el('td', { class: 'neu', text: wertText(x.nachher) })
        ]));
      });
      tabelle.appendChild(koerper);
      ziel.appendChild(tabelle);
    }
    if (listen.length) {
      ziel.appendChild(el('h3', { text: listen.length + (listen.length === 1 ? ' Inhaberliste' : ' Inhaberlisten') }));
      listen.forEach(function (x) {
        ziel.appendChild(el('div', { class: 'liste' }, [
          el('b', { text: x.schliessung || '–' }),
          el('span', { class: 'zart', text: '  ' + x.vorher + ' → ' + x.nachher + (x.nachher === 1 ? ' Person' : ' Personen') }),
          el('div', { class: 'namen', text: (x.namen || []).join(', ') || 'niemand' })
        ]));
      });
    }
    if (b.uebersprungen || b.personenUebersprungen) {
      ziel.appendChild(el('p', { class: 'hinweis', text:
        ((b.uebersprungen || 0) + (b.personenUebersprungen || 0)) + ' Einträge betreffen Türen oder Schließungen, '
        + 'die es im Aufmaß nicht mehr gibt - sie werden übersprungen.' }));
    }
  }

  function antwortDialog(eintrag, beiFertig) {
    var inhalt = el('div');
    inhalt.appendChild(el('div', { class: 'meldung info' }, el('div', {}, [
      el('b', { text: (eintrag.kunde || 'Aufmaß') + (eintrag.objekt ? ' – ' + eintrag.objekt : '') }),
      el('div', { style: { marginTop: '4px', fontSize: '13.5px' },
        text: 'Übertragen von ' + (eintrag.antwortName || 'dem Kunden') + ' am ' + datum(eintrag.antwortAm)
              + (eintrag.antwortNr > 1 ? '  ·  Rückmeldung Nr. ' + eintrag.antwortNr : '') }),
      eintrag.antwortAnmerkung ? el('div', { style: { marginTop: '6px', fontSize: '13.5px', whiteSpace: 'pre-wrap' } }, [
        el('b', { text: 'Anmerkung: ' }), eintrag.antwortAnmerkung
      ]) : null
    ])));
    var bericht = el('div', { class: 'antwort-bericht' }, el('p', { class: 'zart', text: 'Bericht wird erstellt …' }));
    inhalt.appendChild(bericht);
    inhalt.appendChild(el('p', { class: 'hinweis', text:
      'Am Aufmaß ändert sich erst etwas, wenn Sie unten auf „Übernehmen“ tippen. '
      + '„Verwerfen“ legt die Rückmeldung ab, ohne sie zu übernehmen - der Kunde kann jederzeit erneut übertragen.' }));

    var laeuft = false;
    function fertig(schliessen, text) {
      A.toast(text, 'ok');
      schliessen();
      if (beiFertig) { try { beiFertig(); } catch (e) {} }
      if (neuZeichnen) { neuZeichnen(); }
    }
    A.dialogOeffnen({
      titel: 'Rückmeldung des Kunden prüfen', inhalt: inhalt,
      knoepfe: [
        { text: 'Später' },
        { text: 'Verwerfen', klasse: 'gefahr', schliesst: false, aktion: function (schliessen) {
          if (laeuft) { return false; }
          A.bestaetigen('Rückmeldung verwerfen?',
            'Die Rückmeldung wird abgelegt, ohne das Aufmaß zu ändern. Der Kunde kann jederzeit erneut übertragen.',
            'Verwerfen').then(function (ja) {
            if (!ja) { return; }
            laeuft = true;
            Abgleich.antwortVerwerfen(eintrag.code).then(function () {
              fertig(schliessen, 'Rückmeldung verworfen.');
            }).catch(function (f) {
              laeuft = false;
              A.toast(fehlerText(f, 'Das ließ sich gerade nicht ablegen.'), 'fehler');
              if (f && f.status === 409) { schliessen(); if (neuZeichnen) { neuZeichnen(); } }
            });
          });
          return false;
        } },
        { fuellen: true },
        { text: 'Übernehmen', klasse: 'haupt', schliesst: false, aktion: function (schliessen) {
          if (laeuft) { return false; }
          laeuft = true;
          Abgleich.antwortUebernehmen(eintrag.code).then(function (b) {
            var text = b.uebernommen + (b.uebernommen === 1 ? ' Berechtigung' : ' Berechtigungen') + ' übernommen';
            if (b.personenListen) { text += ', ' + b.personenListen + (b.personenListen === 1 ? ' Inhaberliste' : ' Inhaberlisten') + ' aktualisiert'; }
            fertig(schliessen, text + '.');
          }).catch(function (f) {
            laeuft = false;
            A.toast(fehlerText(f, 'Die Übernahme ist gescheitert.'), 'fehler');
            if (f && f.status === 409) { schliessen(); if (neuZeichnen) { neuZeichnen(); } }
          });
          return false;
        } }
      ]
    });
    Abgleich.antwortVorschau(eintrag.code).then(function (v) {
      berichtZeichnen(bericht, v.bericht);
    }).catch(function (f) {
      A.leeren(bericht);
      bericht.appendChild(el('div', { class: 'meldung warn' }, el('div', { text: f.message || 'Der Bericht ließ sich nicht erstellen.' })));
    });
  }

  /* Hinweis im Schließplan, wenn zu diesem Aufmaß eine Rückmeldung wartet. */
  function antwortenHinweis(projektId, beiFertig) {
    var liste = Abgleich.antwortenFuer ? Abgleich.antwortenFuer(projektId) : [];
    if (!liste.length) { return null; }
    var kasten = el('div', { class: 'meldung info antworten-hinweis' });
    liste.forEach(function (a) {
      kasten.appendChild(el('div', { class: 'zeile-verteilt', style: { width: '100%', gap: '10px' } }, [
        el('div', { class: 'fuellen' }, [
          el('b', { text: 'Rückmeldung des Kunden liegt vor' }),
          el('div', { style: { fontSize: '13px', marginTop: '2px' },
            text: 'von ' + (a.antwortName || 'dem Kunden') + ' am ' + datum(a.antwortAm) + '  ·  ' + zusammenfassung(a) })
        ]),
        el('button', { class: 'haupt klein', text: 'Prüfen und übernehmen',
          onclick: function () { antwortDialog(a, beiFertig); } })
      ]));
    });
    return kasten;
  }

  /* ---------------------------------------------------------------- */
  /* Rückfrage bei echtem Konflikt                                     */
  /* ---------------------------------------------------------------- */
  function konfliktDialog(satz) {
    var wahl = {};
    satz.konflikte.forEach(function (k) { wahl[k.id] = 'meins'; });

    var liste = el('div', { class: 'konflikt-liste' });

    function zeichnen() {
      A.leeren(liste);
      satz.konflikte.forEach(function (k) {
        var zeile = el('div', { class: 'konflikt' });
        zeile.appendChild(el('div', { class: 'wo' }, [
          el('span', { class: 'bereich', text: k.bereich }),
          el('b', { text: k.gegenstand }),
          el('span', { class: 'zart', text: ' · ' + k.feldName })
        ]));
        [['meins', 'Deine Fassung', k.meins], ['server', satz.wer + ': ', k.server]].forEach(function (x) {
          var gewaehlt = wahl[k.id] === x[0];
          zeile.appendChild(el('button', {
            class: 'fassung' + (gewaehlt ? ' gewaehlt' : ''),
            'aria-pressed': gewaehlt ? 'true' : 'false',
            onclick: function () { wahl[k.id] = x[0]; zeichnen(); }
          }, [
            el('span', { class: 'herkunft', text: x[1] }),
            el('span', { class: 'wert', text: anzeige(x[2]) })
          ]));
        });
        liste.appendChild(zeile);
      });
    }
    zeichnen();

    var inhalt = el('div', {}, [
      el('p', {}, [
        'Dieses Aufmaß wurde auch von ', el('b', { text: satz.wer }),
        ' geändert. Alles Übrige wurde bereits zusammengeführt – nur bei diesen ',
        el('b', { text: String(satz.konflikte.length) }),
        satz.konflikte.length === 1 ? ' Angabe' : ' Angaben',
        ' wurde beidseitig etwas anderes eingetragen.'
      ]),
      el('div', { class: 'knopfleiste', style: { marginBottom: '12px' } }, [
        el('button', { class: 'klein', text: 'Überall meine Fassung', onclick: function () {
          satz.konflikte.forEach(function (k) { wahl[k.id] = 'meins'; }); zeichnen();
        } }),
        el('button', { class: 'klein', text: 'Überall ' + satz.wer, onclick: function () {
          satz.konflikte.forEach(function (k) { wahl[k.id] = 'server'; }); zeichnen();
        } })
      ]),
      liste
    ]);

    A.dialogOeffnen({
      titel: 'Rückfrage zu „' + satz.name + '“',
      inhalt: inhalt,
      knoepfe: [
        { text: 'Später entscheiden' },
        { fuellen: true },
        { text: 'Übernehmen', klasse: 'haupt', aktion: function () {
            Abgleich.konfliktAufloesen(satz.projektId, wahl).then(function () {
              A.toast('Zusammengeführt.', 'ok');
              if (neuZeichnen) { neuZeichnen(); }
            });
          } }
      ]
    });
  }

  /* Eine Netzstörung heißt im Browser „Failed to fetch“ - das sagt
     niemandem etwas. */
  function fehlerText(f, sonst) {
    if (f && !f.status) { return 'Keine Verbindung zum Server. Bitte später erneut versuchen.'; }
    return (f && f.message) || sonst;
  }

  function anzeige(wert) {
    if (wert === '' || wert === null || wert === undefined) { return '(leer)'; }
    if (wert === true) { return 'ja'; }
    if (wert === false) { return 'nein'; }
    if (typeof wert === 'object') { try { return JSON.stringify(wert); } catch (e) { return '…'; } }
    return String(wert);
  }

  /* ---------------------------------------------------------------- */
  /* Zuständige je Aufmaß                                              */
  /* ---------------------------------------------------------------- */
  function zustaendigeKarte(projekt, beiAenderung) {
    var z = Abgleich.zustand();
    if (!z.angemeldet) { return null; }

    var karte = el('div', { class: 'karte' });
    karte.appendChild(el('h2', { style: { marginTop: '0' }, text: 'Zuständig für dieses Aufmaß' }));
    var bereich = el('div');
    karte.appendChild(bereich);
    karte.appendChild(el('p', { class: 'hinweis', text:
      'Alle sehen jedes Aufmaß. Ändern darf nur, wer hier eingetragen ist.' }));

    bereich.appendChild(el('p', { class: 'zart', text: 'Wird geladen …' }));
    Promise.all([Abgleich.benutzerListe(), Abgleich.zustaendigeLesen(projekt.id)])
      .then(function (beides) {
        var alle = beides[0], antwort = beides[1];
        var gesetzt = antwort.zustaendige;
        A.leeren(bereich);
        if (!antwort.abgeglichen) {
          bereich.appendChild(el('p', { class: 'hinweis', text:
            'Dieses Aufmaß ist noch nicht abgeglichen. Sobald es auf dem Server liegt, '
            + 'lässt sich hier festlegen, wer es ändern darf.' }));
          return;
        }
        if (!alle.length) {
          bereich.appendChild(el('p', { class: 'zart', text: 'Noch keine weiteren Zugänge vorhanden.' }));
          return;
        }
        var gewaehlt = {};
        gesetzt.forEach(function (x) { gewaehlt[x.id] = true; });
        var chips = el('div', { class: 'chips' });
        alle.forEach(function (b) {
          var knopf = el('button', {
            class: 'chip' + (gewaehlt[b.id] ? ' gesetzt' : ''),
            'aria-pressed': gewaehlt[b.id] ? 'true' : 'false',
            text: b.name,
            onclick: function () {
              gewaehlt[b.id] = !gewaehlt[b.id];
              knopf.classList.toggle('gesetzt', !!gewaehlt[b.id]);
              knopf.setAttribute('aria-pressed', gewaehlt[b.id] ? 'true' : 'false');
              var ids = Object.keys(gewaehlt).filter(function (k) { return gewaehlt[k]; });
              Abgleich.zustaendigeSetzen(projekt.id, ids).then(function () {
                A.toast('Zuständigkeit gespeichert.', 'ok');
                if (beiAenderung) { beiAenderung(); }
              }).catch(function (f) {
                A.toast(f.message || 'Die Zuständigkeit ließ sich nicht ändern.', 'fehler');
              });
            }
          });
          chips.appendChild(knopf);
        });
        bereich.appendChild(chips);
      })
      .catch(function () {
        A.leeren(bereich);
        bereich.appendChild(el('p', { class: 'zart', text: 'Die Zuständigkeiten sind gerade nicht abrufbar.' }));
      });
    return karte;
  }

  /* ---------------------------------------------------------------- */
  /* Einhängen                                                         */
  /* ---------------------------------------------------------------- */
  function starten(zeichnen) {
    neuZeichnen = zeichnen;
    return Abgleich.einrichten({
      basisUrl: location.origin,
      beiAenderung: function () { statusAktualisieren(); }
    }).then(function (z) {
      if (z.angemeldet) { Abgleich.start(); }
      return z;
    });
  }

  /* Nur den Statusknopf austauschen, statt die ganze Ansicht neu zu
     bauen - sonst zuckt die Oberfläche bei jedem Abgleich. */
  function statusAktualisieren() {
    var alt = document.querySelector('.abgleich-status');
    if (!alt || !alt.parentNode) { return; }
    alt.parentNode.replaceChild(statusKnoten(), alt);
    hinweisAktualisieren();
  }

  /* Der Hinweis im Schließplan zieht ebenfalls mit, ohne die Ansicht neu
     zu bauen: Trifft eine Rückmeldung ein, während der Plan offen ist,
     erscheint er; ist sie erledigt, verschwindet er. */
  function hinweisAktualisieren() {
    if (!A.Zustand || A.Zustand.ansicht !== 'plan' || !A.Zustand.projekt) { return; }
    var haupt = document.querySelector('main.inhalt .seite');
    if (!haupt) { return; }
    var alt = haupt.querySelector('.antworten-hinweis');
    var neu = antwortenHinweis(A.Zustand.projekt.id, neuZeichnen);
    if (alt && neu) {
      if (alt.textContent !== neu.textContent) { alt.parentNode.replaceChild(neu, alt); }
      return;
    }
    if (alt && !neu) { alt.parentNode.removeChild(alt); return; }
    if (!alt && neu) {
      var kopf = haupt.querySelector('.zeile-verteilt');
      if (kopf && kopf.nextSibling) { haupt.insertBefore(neu, kopf.nextSibling); }
      else { haupt.appendChild(neu); }
    }
  }

  function brauchtAnmeldung() {
    var z = Abgleich.zustand();
    if (uebersprungen) { return false; }
    if (!z.eingerichtet) { return false; }       /* Server kennt keine Anmeldung */
    if (z.erreichbar === false) { return false; } /* ohne Netz nicht im Weg stehen */
    return !z.angemeldet;
  }

  global.AbgleichUI = {
    starten: starten,
    anmeldeSeite: anmeldeSeite,
    statusKnoten: statusKnoten,
    statusAktualisieren: statusAktualisieren,
    brauchtAnmeldung: brauchtAnmeldung,
    konfliktDialog: konfliktDialog,
    antwortDialog: antwortDialog,
    antwortenHinweis: antwortenHinweis,
    zustaendigeKarte: zustaendigeKarte,
    uebersichtZeigen: uebersichtZeigen
  };
})(window);
