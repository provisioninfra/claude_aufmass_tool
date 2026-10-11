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
    if (!z.angemeldet) { art = 'aus'; text = 'Nicht angemeldet'; }
    else if (z.konflikte.length) { art = 'frage'; text = z.konflikte.length + ' Rückfrage' + (z.konflikte.length > 1 ? 'n' : ''); }
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
    A.dialogOeffnen({ titel: 'Abgleich', klein: true, inhalt: inhalt, knoepfe: knoepfe });
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
    zustaendigeKarte: zustaendigeKarte,
    uebersichtZeigen: uebersichtZeigen
  };
})(window);
