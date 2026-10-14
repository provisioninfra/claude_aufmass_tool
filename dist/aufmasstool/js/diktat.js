/* =============================================================================
 * diktat.js — Tür einsprechen
 * =============================================================================
 * Der Monteur spricht die Angaben zu einer Tür in einem Stück ein. Das
 * Werkzeug nimmt den Ton auf, der Server lässt ihn bei OpenAI erkennen und
 * den Feldern des Türformulars zuordnen (siehe server/…/inc/diktat.php).
 * Zurück kommt der erkannte Text und je Feld ein Vorschlag. Übernommen wird
 * erst, was der Mensch im Vorschlag bestätigt - das Diktat schreibt nie von
 * allein in die Tür.
 *
 * Das Feldschema entsteht hier aus dem Katalog: Name, Art, Frage, erlaubte
 * Werte und ein Hinweis mit Synonymen („Rosette = Rosettengarnitur“). Der
 * Server reicht es als JSON-Schema an das Modell weiter und prüft dessen
 * Antwort dagegen; hier wird sie noch einmal geprüft, bevor sie in die Tür
 * geschrieben wird. Der OpenAI-Schlüssel liegt nur auf dem Server; dieses
 * Gerät spricht ausschließlich mit dem eigenen Server.
 *
 * Verfügbar ist das Einsprechen nur, wenn der Server es anbietet (Schlüssel
 * hinterlegt), das Gerät angemeldet und online ist und der Browser aufnehmen
 * kann. Sonst gibt es den Knopf nicht - das Formular bleibt wie gewohnt.
 * ========================================================================== */
(function (global) {
  'use strict';

  var HOECHSTDAUER = 180;      /* Sekunden je Aufnahme */
  var WARTEZEIT = 120000;      /* ms, bis eine Antwort des Servers als ausgeblieben gilt */
  var MIME_KANDIDATEN = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mpeg'];
  /* Textfelder, bei denen ein Diktat ergänzt statt ersetzt */
  var ANHAENGEN = { notiz: true, nacharbeitText: true, systemNotiz: true };
  var GANZZAHL = { anzahl: { min: 1 }, bestandAnzahlSchluessel: { min: 0 } };

  function katalog() { return global.Katalog; }

  /* ---------------------------------------------------------------------
   * Das Feldschema aus dem Katalog
   * ------------------------------------------------------------------- */
  function eigene(einstellungen, schluessel) {
    var w = einstellungen && einstellungen[schluessel];
    return Array.isArray(w) ? w : [];
  }
  function liste(name, einstellungen, eigeneSchluessel) {
    var K = katalog();
    return (K[name] || []).concat(eigeneSchluessel ? eigene(einstellungen, eigeneSchluessel) : []);
  }

  function felder(projekt, einstellungen) {
    var K = katalog();
    var f = [];
    function text(name, frage, hinweis) { f.push({ name: name, typ: 'text', frage: frage, hinweis: hinweis || '' }); }
    function zahl(name, frage, hinweis) { f.push({ name: name, typ: 'zahl', frage: frage, hinweis: hinweis || '' }); }
    function wahl(name, frage, werte, hinweis) {
      f.push({ name: name, typ: 'wahl', frage: frage, werte: werte.map(String), hinweis: hinweis || '' });
    }
    function mehrfach(name, frage, werte, hinweis) {
      f.push({ name: name, typ: 'mehrfach', frage: frage, werte: werte.map(String), hinweis: hinweis || '' });
    }
    function jaNein(name, frage, hinweis) { f.push({ name: name, typ: 'ja_nein', frage: frage, hinweis: hinweis || '' }); }

    /* Lage */
    text('nummer', 'Türnummer', 'nur wenn eine Nummer der Tür genannt wird');
    text('bezeichnung', 'Bezeichnung oder Raum der Tür', 'z. B. Büro Empfang, Haupteingang, Lager hinten');
    wahl('kategorie', 'Türkategorie', K.TUERKATEGORIEN, 'nur wenn die Art der Tür erkennbar genannt wird');
    zahl('anzahl', 'Anzahl baugleicher Türen', 'nur wenn ausdrücklich genannt („drei gleiche Türen“)');
    if (projekt && projekt.anlagenart === 'hybrid') {
      wahl('tuerTechnologie', 'Diese Tür wird ausgeführt als', ['mechanik', 'elektronik'],
        'mechanisch = mechanik, elektronisch = elektronik');
    }
    text('systemNotiz', 'Besonderheit zu dieser Tür', 'nur bei einer Abweichung vom System, etwa Fremdfabrikat');
    /* Bauteile */
    jaNein('brauchtZylinder', 'Zylinder wird gebraucht', 'true, sobald ein Zylinder genannt wird');
    jaNein('brauchtBeschlag', 'Beschlag oder Drücker wird gebraucht', 'true, sobald Beschlag, Garnitur oder Drücker genannt wird');
    jaNein('brauchtSchloss', 'Schloss wird gebraucht', 'true, sobald ein Schloss genannt wird');
    jaNein('brauchtWandleser', 'Wandleser wird gebraucht', 'true, sobald ein Wandleser oder Leser genannt wird');
    /* Zylinder */
    wahl('zylinderBauform', 'Bauform des Zylinders', liste('ZYLINDER_BAUFORM', einstellungen, 'eigeneZylinderarten'),
      'Profilzylinder ohne weitere Angabe = Doppelzylinder');
    zahl('masseAussen', 'Zylinderlänge außen in mm', 'von zwei genannten Längen die erste');
    zahl('masseInnen', 'Zylinderlänge innen in mm', 'von zwei genannten Längen die zweite; Halbzylinder = 10');
    wahl('zylinderKnaufseite', 'Knaufseite beim Knaufzylinder', K.KNAUFSEITE);
    mehrfach('zylinderAusfuehrung', 'Ausführung des Zylinders', K.ZYLINDER_AUSFUEHRUNG,
      'beidseitig schließbar, Not- und Gefahrenfunktion oder Gefahrenfunktion = BSZ (beidseitig schließbar); bei SKG zusätzlich die Stufe');
    wahl('zylinderSkgStufe', 'SKG-Stufe des Zylinders', K.SKG_STUFE, 'ein Stern = SKG *, zwei Sterne = SKG **, drei Sterne = SKG ***');
    /* Beschlag */
    wahl('beschlagBauform', 'Bauform des Beschlags', liste('BESCHLAG_BAUFORM', einstellungen, 'eigeneBeschlagarten'),
      'Rosette = Rosettengarnitur, Langschild = Langschildgarnitur, Panikstange = Panikbeschlag / Fluchttürbeschlag');
    wahl('beschlagAusfuehrung', 'Ausführung des Beschlags', K.BESCHLAG_AUSFUEHRUNG, 'nur wenn mechanisch oder elektronisch genannt wird');
    wahl('beschlagBestueckung', 'Bestückung des Beschlags außen / innen', K.BESCHLAG_BESTUECKUNG, 'Drücker Drücker = Drücker / Drücker, Knauf Drücker = Knauf / Drücker');
    wahl('beschlagSicherheit', 'Sicherheitsklasse des Schutzbeschlags', K.BESCHLAG_SICHERHEIT, 'nur beim Schutzbeschlag, ES null bis ES drei');
    mehrfach('beschlagOptionen', 'Optionen des Beschlags', K.BESCHLAG_OPTIONEN, 'nur wenn ausdrücklich für den Beschlag genannt');
    wahl('beschlagSkgStufe', 'SKG-Stufe des Beschlags', K.SKG_STUFE);
    /* Maße für Beschlag und Schloss */
    zahl('dornmass', 'Dornmaß in mm');
    zahl('entfernung', 'Entfernung in mm', 'Abstand Drücker zu Zylinder, meist 72 oder 92');
    zahl('vierkant', 'Vierkant oder Nuss in mm', 'meist 8 oder 9');
    zahl('tuerblattstaerke', 'Türblattstärke in mm');
    wahl('dinRichtung', 'DIN-Richtung', K.DIN_RICHTUNG, '„DIN links“ oder „DIN rechts“');
    /* Schloss */
    wahl('schlossBauform', 'Bauform des Schlosses', liste('SCHLOSS_BAUFORM', einstellungen, 'eigeneSchlossarten'));
    wahl('schlossFunktion', 'Funktion des Schlosses', K.SCHLOSS_FUNKTION,
      'Panik B = Panik Funktion B (Umschaltfunktion), Panik E = Panik Funktion E (Wechselfunktion), Panik D = Panik Funktion D (Durchgangsfunktion), PZ = Profilzylinder (PZ)');
    wahl('schlossStulpform', 'Stulpform', K.STULPFORM);
    zahl('schlossStulpbreite', 'Stulpbreite in mm');
    zahl('schlossStulplaenge', 'Stulplänge in mm');
    wahl('schlossFallenart', 'Fallenart', K.FALLENART);
    zahl('schlossRiegelausschluss', 'Riegelausschluss in mm');
    wahl('schlossVerriegelungspunkte', 'Anzahl der Verriegelungspunkte', K.VERRIEGELUNGSPUNKTE);
    wahl('schlossNorm', 'Norm oder Zulassung des Schlosses', K.SCHLOSS_NORM);
    /* Elektronik */
    wahl('elStromversorgung', 'Stromversorgung', ['Batterie', '12V vorhanden', '24V vorhanden', '230V vorhanden', 'PoE', 'muss verlegt werden']);
    wahl('elVernetzung', 'Vernetzung', ['offline (Stand-alone)', 'virtuelles Netzwerk', 'online / verkabelt', 'funkvernetzt', 'noch offen']);
    wahl('elFunkabdeckung', 'Funkabdeckung vor Ort', ['gut', 'mittel', 'schlecht', 'nicht geprüft']);
    wahl('elKabeluebergang', 'Kabel oder Leerrohr an der Tür', K.KABELUEBERGANG,
      'Kabel liegt = Kabelübergang vorhanden, Leerrohr liegt = Leerrohr vorhanden');
    jaNein('elTuerueberwachung', 'Türüberwachung oder Türzustandsmeldung gewünscht');
    jaNein('elTueroeffnerBestand', 'Elektrischer Türöffner ist schon vorhanden');
    text('elLeitungsweg', 'Leitungsweg - woher kommt das Kabel');
    /* Türdaten */
    zahl('tuerbreite', 'Türbreite in mm');
    zahl('tuerhoehe', 'Türhöhe in mm');
    wahl('tuerAnschlag', 'Türanschlag', K.TUER_ANSCHLAG);
    wahl('tuermaterial', 'Türblattmaterial', K.TUERMATERIAL,
      'Holztür = Holz, Stahltür = Stahl / Metall, Alutür = Alu (Rohrrahmen), Glastür = Glas / Ganzglastür');
    zahl('profilbreite', 'Profilbreite in mm');
    wahl('oeffnungsrichtung', 'Öffnungsrichtung', K.TUER_OEFFNUNG);
    text('bohrbild', 'Bohrbild oder Lochung');
    /* Bestand */
    text('bestandFabrikat', 'Vorhandenes Fabrikat im Bestand', 'z. B. EVVA, Kaba, ABUS');
    wahl('bestandZylinderart', 'Vorhandene Zylinderart im Bestand', liste('ZYLINDER_BAUFORM', einstellungen, 'eigeneZylinderarten'));
    zahl('bestandLaengeAussen', 'Vorhandene Zylinderlänge außen in mm');
    zahl('bestandLaengeInnen', 'Vorhandene Zylinderlänge innen in mm');
    zahl('bestandAnzahlSchluessel', 'Anzahl vorhandener Schlüssel');
    /* Abschluss */
    jaNein('nacharbeit', 'Nacharbeit erforderlich', 'true, wenn etwas nachzuarbeiten, zu klären oder nicht möglich war');
    text('nacharbeitText', 'Was ist nachzuarbeiten');
    text('notiz', 'Bemerkung zur Tür', 'alles Sonstige, was zur Tür gesagt wird');
    return f;
  }

  /** Eigene Begriffe, die die Erkennung kennen soll: eigene Systeme und
   *  eigene Listeneinträge aus den Einstellungen. */
  function woerter(einstellungen) {
    var aus = [];
    eigene(einstellungen, 'eigeneSysteme').forEach(function (s) {
      if (s && s.name) aus.push(String(s.name));
    });
    ['eigeneZylinderarten', 'eigeneBeschlagarten', 'eigeneSchlossarten'].forEach(function (k) {
      eigene(einstellungen, k).forEach(function (w) { aus.push(String(w)); });
    });
    return aus.filter(function (w, i) { return w.trim() && aus.indexOf(w) === i; }).slice(0, 40);
  }

  /* ---------------------------------------------------------------------
   * Vorschlag anwenden
   * ------------------------------------------------------------------- */
  function zahlText(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    var r = Math.round(n * 10) / 10;
    return String(r).replace('.', ',');
  }
  function textVon(wert) {
    if (wert === null || wert === undefined || wert === '') return '';
    if (Array.isArray(wert)) return wert.join(', ');
    if (typeof wert === 'boolean') return wert ? 'ja' : 'nein';
    if (typeof wert === 'number') return zahlText(wert);
    return String(wert);
  }
  function schemaNach(schema) {
    var m = {};
    (schema || []).forEach(function (f) { m[f.name] = f; });
    return m;
  }

  /** Den neuen Wert für die Tür berechnen - ohne zu schreiben. Gibt
   *  undefined zurück, wenn der Wert nicht passt. */
  function neuerWert(tuer, feld, wert) {
    if (!feld || wert === null || wert === undefined) return undefined;
    switch (feld.typ) {
      case 'text':
        var t = String(wert).trim();
        if (!t) return undefined;
        if (ANHAENGEN[feld.name] && String(tuer[feld.name] || '').trim()) {
          var alt = String(tuer[feld.name]).trim();
          return alt.indexOf(t) !== -1 ? alt : (alt + '\n' + t);
        }
        return t;
      case 'zahl':
        var n = typeof wert === 'number' ? wert : parseFloat(String(wert).replace(',', '.'));
        if (!isFinite(n)) return undefined;
        if (GANZZAHL[feld.name]) return Math.max(GANZZAHL[feld.name].min, Math.round(n));
        return zahlText(n);
      case 'ja_nein':
        return typeof wert === 'boolean' ? wert : undefined;
      case 'wahl':
        return feld.werte.indexOf(String(wert)) !== -1 ? String(wert) : undefined;
      case 'mehrfach':
        if (!Array.isArray(wert)) return undefined;
        var vorhanden = Array.isArray(tuer[feld.name]) ? tuer[feld.name].slice() : [];
        wert.forEach(function (w) {
          if (feld.werte.indexOf(String(w)) !== -1 && vorhanden.indexOf(String(w)) === -1) vorhanden.push(String(w));
        });
        return vorhanden;
    }
    return undefined;
  }

  /** Die Zeilen für den Vorschlag: was erkannt wurde, was bisher steht,
   *  was daraus würde. */
  function zeilen(tuer, werte, schema) {
    var nach = schemaNach(schema), aus = [];
    (schema || []).forEach(function (f) {
      if (!werte || !Object.prototype.hasOwnProperty.call(werte, f.name)) return;
      var neu = neuerWert(tuer, nach[f.name], werte[f.name]);
      if (neu === undefined) return;
      var alt = tuer[f.name];
      var altText = textVon(alt), neuText = textVon(neu);
      aus.push({ name: f.name, frage: f.frage, alt: altText, neu: neuText,
        gleich: altText === neuText, wert: neu });
    });
    return aus;
  }

  /** Schreibt die gewählten Felder in die Tür (eine Kopie wird nicht
   *  gemacht - das Türformular arbeitet ohnehin auf seiner Kopie). Gibt
   *  die Namen der geänderten Felder zurück. */
  function anwenden(tuer, werte, schema, nurDiese) {
    var nach = schemaNach(schema), geaendert = [];
    Object.keys(werte || {}).forEach(function (name) {
      if (nurDiese && nurDiese.indexOf(name) === -1) return;
      var neu = neuerWert(tuer, nach[name], werte[name]);
      if (neu === undefined) return;
      if (textVon(tuer[name]) === textVon(neu)) return;
      tuer[name] = neu;
      geaendert.push(name);
    });
    /* Folgen: Wer einen Zylinder beschreibt, braucht einen. Eine
       SKG-Stufe setzt den Chip voraus; eine Nacharbeit den Schalter. */
    var hat = function (praefix) {
      return geaendert.some(function (n) { return n.indexOf(praefix) === 0; });
    };
    if (hat('zylinder') || hat('masse')) tuer.brauchtZylinder = true;
    if (hat('beschlag')) tuer.brauchtBeschlag = true;
    if (hat('schloss')) tuer.brauchtSchloss = true;
    if (tuer.zylinderSkgStufe && (geaendert.indexOf('zylinderSkgStufe') !== -1)) {
      if (!Array.isArray(tuer.zylinderAusfuehrung)) tuer.zylinderAusfuehrung = [];
      if (tuer.zylinderAusfuehrung.indexOf('SKG') === -1) tuer.zylinderAusfuehrung.push('SKG');
    }
    if (tuer.beschlagSkgStufe && (geaendert.indexOf('beschlagSkgStufe') !== -1)) {
      if (!Array.isArray(tuer.beschlagOptionen)) tuer.beschlagOptionen = [];
      if (tuer.beschlagOptionen.indexOf('SKG') === -1) tuer.beschlagOptionen.push('SKG');
    }
    if (geaendert.indexOf('nacharbeitText') !== -1 && tuer.nacharbeitText) tuer.nacharbeit = true;
    return geaendert;
  }

  /* ---------------------------------------------------------------------
   * Verfügbarkeit und Server
   * ------------------------------------------------------------------- */
  function kannAufnehmen() {
    var n = global.navigator;
    return !!(global.MediaRecorder && n && n.mediaDevices && typeof n.mediaDevices.getUserMedia === 'function');
  }
  function online() { return !(global.navigator && global.navigator.onLine === false); }
  function verfuegbar() {
    var Ab = global.Abgleich;
    var z = Ab && typeof Ab.zustand === 'function' ? Ab.zustand() : null;
    return !!(z && z.diktat && z.angemeldet && kannAufnehmen());
  }

  /** Aufnahme starten. Liefert ein Objekt mit stopp() -> Promise<Blob>. */
  function aufnahmeStarten() {
    return global.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(function (strom) {
        var typ = '';
        for (var i = 0; i < MIME_KANDIDATEN.length; i++) {
          try { if (global.MediaRecorder.isTypeSupported(MIME_KANDIDATEN[i])) { typ = MIME_KANDIDATEN[i]; break; } } catch (e) {}
        }
        function spurenAus() { strom.getTracks().forEach(function (s) { try { s.stop(); } catch (e) {} }); }
        var rec;
        try {
          try { rec = typ ? new global.MediaRecorder(strom, { mimeType: typ, audioBitsPerSecond: 48000 }) : new global.MediaRecorder(strom); }
          catch (e) { rec = new global.MediaRecorder(strom); }
          var stuecke = [];
          rec.addEventListener('dataavailable', function (e) { if (e.data && e.data.size) stuecke.push(e.data); });
          rec.start(1000);
        } catch (f) {
          /* Kein Recorder: Das Mikrofon darf nicht offen bleiben. */
          spurenAus();
          throw f;
        }
        var typFertig = function () { return rec.mimeType || typ || 'audio/webm'; };
        return {
          mime: typFertig(),
          stopp: function () {
            return new Promise(function (loesen) {
              var erledigt = false;
              function fertig() {
                if (erledigt) return;
                erledigt = true;
                spurenAus();
                loesen(new Blob(stuecke, { type: typFertig() }));
              }
              rec.addEventListener('stop', fertig);
              /* Bleibt das Stopp-Ereignis aus, nach kurzer Zeit mit dem
                 nehmen, was da ist. */
              setTimeout(fertig, 3000);
              try { rec.stop(); } catch (e) { fertig(); }
            });
          },
          abbrechen: function () { try { rec.stop(); } catch (e) {} spurenAus(); }
        };
      });
  }

  /** Aufnahme oder Text an den Server geben. */
  function senden(aufnahme, text, projekt, einstellungen, signal) {
    var Ab = global.Abgleich;
    if (!Ab || typeof Ab.diktat !== 'function') return Promise.reject(new Error('Der Abgleich ist nicht eingerichtet.'));
    var schema = felder(projekt, einstellungen);
    var formular = new FormData();
    if (aufnahme) {
      var typ = (aufnahme.type || 'audio/webm').split(';')[0].trim().toLowerCase();
      var endung = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
                     'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' }[typ] || 'webm';
      formular.append('ton', aufnahme, 'aufnahme.' + endung);
    } else {
      formular.append('text', text || '');
    }
    formular.append('felder', JSON.stringify(schema));
    formular.append('woerter', JSON.stringify(woerter(einstellungen)));
    return Ab.diktat(formular, signal).then(function (d) {
      return { text: (d && d.text) || '', felder: (d && d.felder) || {}, offen: (d && d.offen) || [], schema: schema };
    });
  }

  /* ---------------------------------------------------------------------
   * Der Dialog
   * ------------------------------------------------------------------- */
  function zeit(s) { return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }

  /**
   * optionen: tuer (die Arbeitskopie des Formulars), projekt, einstellungen,
   *           beiUebernahme(namen) - wird nach dem Schreiben gerufen.
   */
  function dialog(optionen) {
    var A = global.AppKern, el = A.el;
    var tuer = optionen.tuer, projekt = optionen.projekt, einstellungen = optionen.einstellungen;
    var inhalt = el('div', { class: 'diktat' });
    var dlg = A.dialogOeffnen({ titel: 'Tür einsprechen', inhalt: inhalt, knoepfe: [{ text: 'Abbrechen' }],
      beimSchliessen: function () { aufraeumen(); } });
    var fuss = dlg.kasten.querySelector('.fuss');
    var laufend = null, uhr = null, sekunden = 0, letzteAufnahme = null, ergebnis = null;
    var abbruch = null, warteUhr = null;   /* laufende Anfrage an den Server */

    function anfrageBeenden() {
      if (warteUhr) { clearTimeout(warteUhr); warteUhr = null; }
      if (abbruch) { try { abbruch.abort(); } catch (e) {} abbruch = null; }
    }
    function aufraeumen() {
      if (uhr) { clearInterval(uhr); uhr = null; }
      if (laufend) { try { laufend.abbrechen(); } catch (e) {} laufend = null; }
      anfrageBeenden();
    }
    function fussSetzen(knoepfe) {
      if (!fuss) return;
      A.leeren(fuss);
      fuss.appendChild(el('div', { class: 'fuellen' }));
      knoepfe.forEach(function (k) { fuss.appendChild(el('button', k)); });
    }

    /* --- bereit --- */
    function bereit() {
      aufraeumen();
      A.leeren(inhalt);
      inhalt.appendChild(el('p', { class: 'hinweis', style: { marginTop: '0' },
        text: 'Einfach in ganzen Sätzen oder Stichworten alles zur Tür sagen - Bezeichnung, Bauteile, Maße, Besonderheiten. Das Werkzeug holt die Angaben heraus und zeigt einen Vorschlag; erst mit „Übernehmen“ landet etwas in der Tür.' }));
      inhalt.appendChild(el('p', { class: 'diktat-beispiel',
        text: '„Das ist die Tür zum Büro Empfang, DIN links. Da kommt ein Halbzylinder rein, außen fünfunddreißig. Beschlag Rosettengarnitur mit Drücker innen und außen, Dornmaß 55. Der Wandleser sitzt rechts außen, Kabel liegt schon.“' }));
      if (!online()) {
        inhalt.appendChild(el('div', { class: 'meldung warn' }, el('div', { text: 'Zum Einsprechen braucht das Gerät Netz - die Erkennung läuft über den Server.' })));
      }
      inhalt.appendChild(el('div', { class: 'diktat-mitte' },
        el('button', { type: 'button', class: 'haupt diktat-aufnahme', text: '🎤 Aufnahme starten', disabled: !online(),
          onclick: starten })));
      fussSetzen([{ text: 'Abbrechen', onclick: function () { dlg.schliessen(); } }]);
    }

    /* --- läuft --- */
    function starten() {
      A.leeren(inhalt);
      inhalt.appendChild(el('p', { class: 'zart', text: 'Mikrofon wird geöffnet …' }));
      fussSetzen([]);
      aufnahmeStarten().then(function (rec) {
        laufend = rec; sekunden = 0;
        A.leeren(inhalt);
        var anzeige = el('div', { class: 'diktat-laeuft' }, [
          el('span', { class: 'punkt', 'aria-hidden': 'true' }),
          el('span', { text: 'Aufnahme läuft' }),
          el('span', { class: 'dauer', text: zeit(0) })
        ]);
        inhalt.appendChild(anzeige);
        inhalt.appendChild(el('p', { class: 'hinweis', text: 'Jetzt sprechen. Mit „Aufnahme beenden“ geht die Aufnahme an den Server.' }));
        var dauer = anzeige.querySelector('.dauer');
        uhr = setInterval(function () {
          sekunden++;
          dauer.textContent = zeit(sekunden);
          if (sekunden >= HOECHSTDAUER) beenden();
        }, 1000);
        fussSetzen([
          { text: 'Verwerfen', onclick: function () { bereit(); } },
          { class: 'haupt', text: '■ Aufnahme beenden', onclick: beenden }
        ]);
      }).catch(function (f) {
        fehler((f && (f.name === 'NotAllowedError' || f.name === 'SecurityError'))
          ? 'Das Mikrofon ist für diese Seite nicht freigegeben. Bitte in den Browser-Einstellungen den Zugriff erlauben.'
          : (f && f.name === 'NotFoundError') ? 'Es wurde kein Mikrofon gefunden.'
          : 'Die Aufnahme konnte nicht gestartet werden' + (f && f.message ? ': ' + f.message : '.'));
      });
    }

    function beenden() {
      if (!laufend) return;
      var rec = laufend; laufend = null;
      if (uhr) { clearInterval(uhr); uhr = null; }
      if (sekunden < 1) { bereit(); A.toast('Die Aufnahme war zu kurz.', 'warn'); return; }
      rec.stopp().then(function (blob) {
        if (!blob || !blob.size) {
          letzteAufnahme = null;
          fehler('Die Aufnahme ist leer geblieben. Bitte prüfen, ob das Mikrofon funktioniert und für diese Seite erlaubt ist.', false);
          return;
        }
        letzteAufnahme = blob;
        verarbeiten(blob, null);
      });
    }

    /* --- sendet --- */
    function verarbeiten(blob, text) {
      anfrageBeenden();
      A.leeren(inhalt);
      inhalt.appendChild(el('div', { class: 'diktat-wartet' }, [
        el('span', { class: 'punkt wartet', 'aria-hidden': 'true' }),
        el('span', { text: blob ? 'Aufnahme wird erkannt und zugeordnet … das dauert einige Sekunden.' : 'Text wird zugeordnet …' })
      ]));
      /* Abbrechen bleibt möglich - und nach zwei Minuten gilt die Antwort
         als ausgeblieben, statt ewig zu warten. */
      var meine = (typeof AbortController === 'function') ? new AbortController() : null;
      abbruch = meine;
      var zuSpaet = false;
      warteUhr = setTimeout(function () { zuSpaet = true; if (meine) meine.abort(); }, WARTEZEIT);
      fussSetzen([{ text: 'Abbrechen', onclick: function () { anfrageBeenden(); if (blob) { letzteAufnahme = blob; } fehler('Abgebrochen.', !!blob); } }]);
      senden(blob, text, projekt, einstellungen, meine ? meine.signal : undefined).then(function (e) {
        if (abbruch !== meine) return;   /* inzwischen abgebrochen oder ersetzt */
        anfrageBeenden();
        ergebnis = e;
        vorschlag();
      }).catch(function (f) {
        if (abbruch !== meine && !zuSpaet) return;   /* bewusst abgebrochen - die Meldung steht schon */
        anfrageBeenden();
        var abgebrochen = f && (f.name === 'AbortError' || /abort/i.test(String(f.message || '')));
        fehler(zuSpaet ? 'Der Server hat nicht rechtzeitig geantwortet. Bitte erneut versuchen - die Aufnahme ist noch da.'
          : abgebrochen ? 'Abgebrochen.' : ((f && f.message) || 'Der Server hat nicht geantwortet.'), !!blob);
      });
    }

    /* --- Fehler --- */
    function fehler(meldung, nochmalMoeglich) {
      aufraeumen();
      A.leeren(inhalt);
      inhalt.appendChild(el('div', { class: 'meldung fehler' }, el('div', { text: meldung })));
      var knoepfe = [{ text: 'Abbrechen', onclick: function () { dlg.schliessen(); } }];
      if (nochmalMoeglich && letzteAufnahme) {
        knoepfe.push({ text: 'Aufnahme erneut senden', onclick: function () { verarbeiten(letzteAufnahme, null); } });
      }
      knoepfe.push({ class: 'haupt', text: 'Neu aufnehmen', onclick: bereit });
      fussSetzen(knoepfe);
    }

    /* --- Vorschlag --- */
    function vorschlag() {
      A.leeren(inhalt);
      var e = ergebnis;
      var reihen = zeilen(tuer, e.felder, e.schema);
      var gewaehlt = {};
      reihen.forEach(function (r) { gewaehlt[r.name] = !r.gleich; });
      var offenGewaehlt = e.offen.length > 0;

      /* Der verstandene Text - änderbar, dann wird neu zugeordnet */
      var textKasten = el('div', { class: 'diktat-text' });
      var textFeld = null;
      function textZeigen() {
        A.leeren(textKasten);
        textKasten.appendChild(el('div', { class: 'zart', text: 'Verstanden:' }));
        textKasten.appendChild(el('blockquote', { text: e.text || '(nichts)' }));
        textKasten.appendChild(el('button', { type: 'button', class: 'klein', text: 'Text ändern und neu zuordnen', onclick: function () {
          A.leeren(textKasten);
          textFeld = el('textarea', { rows: 4, value: e.text || '' });
          textKasten.appendChild(el('div', { class: 'zart', text: 'Verstandenen Text berichtigen:' }));
          textKasten.appendChild(textFeld);
          textKasten.appendChild(el('div', { class: 'knopfleiste', style: { marginTop: '6px' } }, [
            el('button', { type: 'button', class: 'klein', text: 'Verwerfen', onclick: textZeigen }),
            el('button', { type: 'button', class: 'klein haupt', text: 'Neu zuordnen', onclick: function () {
              var t = (textFeld.value || '').trim();
              if (!t) { A.toast('Der Text ist leer.', 'warn'); return; }
              verarbeiten(null, t);
            } })
          ]));
          textFeld.focus();
        } }));
      }
      textZeigen();
      inhalt.appendChild(textKasten);

      if (!reihen.length && !e.offen.length) {
        inhalt.appendChild(el('div', { class: 'meldung warn' }, el('div', { text: 'Daraus ließ sich keiner Angabe ein Feld zuordnen. Bitte den Text berichtigen oder neu aufnehmen.' })));
      }
      if (reihen.length) {
        var tabelle = el('table', { class: 'diktat-tabelle' });
        tabelle.appendChild(el('thead', {}, el('tr', {}, [
          el('th', { text: '' }), el('th', { text: 'Angabe' }), el('th', { text: 'Bisher' }), el('th', { text: 'Neu' })
        ])));
        var tb = el('tbody');
        reihen.forEach(function (r) {
          var kasten = el('input', { type: 'checkbox', checked: gewaehlt[r.name], 'aria-label': r.frage,
            onchange: function (ev) { gewaehlt[r.name] = ev.target.checked; zaehlen(); } });
          tb.appendChild(el('tr', { class: r.gleich ? 'gleich' : '', 'data-feld': r.name,
            onclick: function (ev) { if (ev.target !== kasten) { kasten.checked = !kasten.checked; gewaehlt[r.name] = kasten.checked; zaehlen(); } } }, [
            el('td', {}, kasten),
            el('td', { class: 'frage', text: r.frage }),
            el('td', { class: 'alt', text: r.alt || '–' }),
            el('td', { class: 'neu', text: r.gleich ? (r.neu + '  (unverändert)') : r.neu })
          ]));
        });
        tabelle.appendChild(tb);
        inhalt.appendChild(tabelle);
      }
      if (e.offen.length) {
        var offenKasten = el('input', { type: 'checkbox', checked: true, onchange: function (ev) { offenGewaehlt = ev.target.checked; zaehlen(); } });
        inhalt.appendChild(el('div', { class: 'diktat-offen' }, [
          el('label', {}, [offenKasten, el('span', { text: ' Nicht zugeordnet - in die Bemerkung übernehmen:' })]),
          el('ul', {}, e.offen.map(function (o) { return el('li', { text: o }); }))
        ]));
      }

      var uebernehmenKnopf = { class: 'haupt', text: 'Übernehmen', onclick: uebernehmen };
      fussSetzen([
        { text: 'Abbrechen', onclick: function () { dlg.schliessen(); } },
        { text: 'Neu aufnehmen', onclick: bereit },
        uebernehmenKnopf
      ]);
      function zaehlen() {
        var n = Object.keys(gewaehlt).filter(function (k) { return gewaehlt[k]; }).length + (offenGewaehlt && e.offen.length ? 1 : 0);
        var knopf = fuss && fuss.querySelector('button.haupt');
        if (knopf) { knopf.textContent = n ? ('Übernehmen (' + n + ')') : 'Übernehmen'; knopf.disabled = !n; }
      }
      zaehlen();

      function uebernehmen() {
        var namen = Object.keys(gewaehlt).filter(function (k) { return gewaehlt[k]; });
        var werte = {};
        namen.forEach(function (n) { werte[n] = e.felder[n]; });
        if (offenGewaehlt && e.offen.length) {
          var zusatz = e.offen.join('; ');
          werte.notiz = werte.notiz ? (werte.notiz + '\n' + zusatz) : zusatz;
          if (namen.indexOf('notiz') === -1) namen.push('notiz');
        }
        var geaendert = anwenden(tuer, werte, e.schema, namen);
        dlg.schliessen();
        if (optionen.beiUebernahme) optionen.beiUebernahme(geaendert);
      }
    }

    bereit();
    return dlg;
  }

  global.Diktat = {
    felder: felder,
    woerter: woerter,
    zeilen: zeilen,
    anwenden: anwenden,
    neuerWert: neuerWert,
    textVon: textVon,
    verfuegbar: verfuegbar,
    kannAufnehmen: kannAufnehmen,
    aufnahmeStarten: aufnahmeStarten,
    senden: senden,
    dialog: dialog,
    HOECHSTDAUER: HOECHSTDAUER
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Diktat; }
})(typeof window !== 'undefined' ? window : globalThis);
