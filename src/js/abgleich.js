/* =============================================================================
 * abgleich.js — Gemeinsame Ablage für alle Geräte
 *
 * Grundsatz: Die Ablage auf dem Gerät bleibt die führende. Das Werkzeug
 * arbeitet unverändert weiter, wenn kein Netz da ist - im Keller, in der
 * Tiefgarage, im Neubau. Der Abgleich läuft nebenher und holt nach, sobald
 * wieder Empfang da ist. Er darf das Speichern niemals aufhalten und nie
 * eine Fehlermeldung in den Weg stellen.
 *
 * Je Projekt merkt sich das Gerät drei Dinge (siehe store.js):
 *   version    - die zuletzt vom Server bestätigte Fassung
 *   basis      - der Stand, bei dem beide Seiten zuletzt übereinstimmten
 *   schmutzig  - hier liegt etwas, das noch nicht gesendet wurde
 *
 * Aus Basis, eigenem Stand und Serverstand entsteht bei Bedarf der
 * Drei-Wege-Vergleich (siehe zusammenfuehren.js).
 * ========================================================================== */
(function (global) {
  'use strict';

  var Store = global.Store;
  var Z = global.Zusammenfuehren;

  var WEG = '/wp-json/aufmass/v1';
  var KOPFFELD = 'X-Aufmass-Abgleich';
  var TAKT_NORMAL = 15000;      /* regelmäßig nachsehen */
  var TAKT_RUHE = 60000;        /* wenn das Fenster im Hintergrund liegt */
  var TAKT_FEHLER = 60000;      /* nach einem Fehler nicht hämmern */
  var VERZUG_SENDEN = 2500;     /* nach einer Änderung kurz sammeln */

  var zustand = {
    eingerichtet: false,
    erreichbar: null,        /* null = noch nicht versucht */
    angemeldet: false,
    benutzer: null,
    clientId: '',
    domaene: '',
    /* Liegt ein Pipedrive-Schlüssel auf dem Server? Dann läuft die
       Pipedrive-Anbindung dort, und dieses Gerät braucht keinen. */
    pipedrive: false,
    pipedriveHost: '',
    /* Bietet der Server das Einsprechen an (OpenAI-Schlüssel hinterlegt)? */
    diktat: false,
    serverVersion: '',       /* Fassung des Plugins - nennt der Server nur Angemeldeten */
    laeuft: false,
    offen: 0,                /* noch nicht gesendete Projekte */
    letzterAbgleich: null,
    letzterFehler: '',
    konflikte: [],           /* [{ projektId, name, konflikte, ergebnis, server }] */
    /* Rückmeldungen von Kunden, die auf die Prüfung durch diese Person
       warten. Der Server liefert sie mit jedem Abgleich vollständig mit;
       übernommen wird erst nach ausdrücklicher Bestätigung. */
    antworten: []            /* [{ code, projektId, kunde, objekt, antwortNr, antwortName, antwortAm, antwort, ... }] */
  };

  var marke = '';
  var basisUrl = '';
  var uhr = null, sendeUhr = null;
  var beiAenderung = null;
  var amLaufen = false;

  /* ---------------------------------------------------------------- */
  /* Anfragen                                                          */
  /* ---------------------------------------------------------------- */
  function anfrage(weg, optionen) {
    optionen = optionen || {};
    var kopf = {};
    kopf[KOPFFELD] = '1';
    if (optionen.json !== undefined) { kopf['Content-Type'] = 'application/json'; }
    if (optionen.typ) { kopf['Content-Type'] = optionen.typ; }

    return fetch(basisUrl + WEG + weg, {
      method: optionen.methode || 'GET',
      credentials: 'same-origin',
      headers: kopf,
      body: optionen.json !== undefined ? JSON.stringify(optionen.json) : (optionen.koerper || undefined),
      signal: optionen.signal || undefined
    }).then(function (antwort) {
      if (optionen.roh) {
        if (!antwort.ok) { return fehlerAus(antwort); }
        return antwort.blob();
      }
      return antwort.text().then(function (text) {
        var daten = null;
        try { daten = text ? JSON.parse(text) : null; } catch (e) { daten = null; }
        if (!antwort.ok) {
          var f = new Error((daten && daten.message) || ('Der Server antwortete mit ' + antwort.status + '.'));
          f.status = antwort.status;
          f.code = daten && daten.code;
          f.daten = daten && daten.data;
          throw f;
        }
        return daten;
      });
    });
  }
  function fehlerAus(antwort) {
    var f = new Error('Der Server antwortete mit ' + antwort.status + '.');
    f.status = antwort.status;
    throw f;
  }

  /* ---------------------------------------------------------------- */
  /* Einrichten und Anmeldung                                          */
  /* ---------------------------------------------------------------- */
  function einrichten(optionen) {
    optionen = optionen || {};
    basisUrl = (optionen.basisUrl || '').replace(/\/+$/, '');
    beiAenderung = optionen.beiAenderung || null;

    /* Wird die Datei lokal geöffnet (Doppelklick, file://), gibt es keinen
     * Server, den man fragen könnte. Dann wird gar nicht erst angefragt:
     * Der Browser würde die Anfrage ohnehin abweisen und dabei eine
     * Fehlermeldung in die Entwicklerkonsole schreiben, die wie ein
     * Defekt aussieht - es ist aber der vorgesehene Fall. */
    if (!/^https?:/i.test(basisUrl)) {
      zustand.eingerichtet = false;
      zustand.erreichbar = false;
      zustand.angemeldet = false;
      zustand.letzterFehler = '';
      melden();
      return Promise.resolve(zustand);
    }

    return anfrage('/start').then(function (d) {
      zustand.eingerichtet = !!(d && d.eingerichtet);
      zustand.clientId = (d && d.clientId) || '';
      zustand.domaene = (d && d.domaene) || '';
      zustand.erreichbar = true;
      /* Der Server sagt in derselben Antwort, ob dieses Gerät angemeldet
         ist - eine zweite, absehbar abgewiesene Anfrage erübrigt sich. */
      zustand.angemeldet = !!(d && d.angemeldet);
      zustand.benutzer = (d && d.benutzer) || null;
      zustand.serverVersion = (d && d.version) || '';
      pipedriveMerken(d);
      diktatMerken(d);
      melden();
      return zustand;
    }).catch(function (f) {
      /* Kein Server erreichbar: Das Werkzeug läuft trotzdem weiter. */
      zustand.erreichbar = false;
      zustand.letzterFehler = f && f.message ? f.message : 'Der Abgleich ist nicht erreichbar.';
      melden();
      return zustand;
    });
  }

  /* Der Server sagt bei jedem Abgleich mit, ob Pipedrive dort eingerichtet
     ist. So wirkt ein in WordPress hinterlegter Schlüssel auf allen Geräten,
     ohne dass jemand das Werkzeug neu laden müsste. */
  function pipedriveMerken(d) {
    if (!d || d.pipedrive === undefined) { return; }
    var neu = !!d.pipedrive, host = d.pipedriveHost || '';
    if (neu !== zustand.pipedrive || host !== zustand.pipedriveHost) {
      zustand.pipedrive = neu;
      zustand.pipedriveHost = host;
      melden();
    }
  }

  /* Ebenso das Einsprechen: Ein in WordPress hinterlegter OpenAI-Schlüssel
     schaltet den Knopf im Türformular auf allen Geräten frei. */
  function diktatMerken(d) {
    if (!d || d.diktat === undefined) { return; }
    var neu = !!d.diktat;
    if (neu !== zustand.diktat) { zustand.diktat = neu; melden(); }
  }

  /** Tür einsprechen: Aufnahme oder Text samt Feldschema an den Server. */
  function diktat(formular, signal) {
    return anfrage('/diktat', { methode: 'POST', koerper: formular, signal: signal });
  }

  /* Wartende Kundenrückmeldungen kommen bei jedem Abgleich vollständig
     mit. Gemeldet wird nur, wenn sich etwas geändert hat - sonst zuckte
     die Oberfläche alle fünfzehn Sekunden. */
  function antwortenMerken(d) {
    if (!d || d.antworten === undefined) { return; }
    var neu = Array.isArray(d.antworten) ? d.antworten.filter(function (a) { return a && a.code; }) : [];
    function kurz(a) { return a.code + ':' + a.antwortNr; }
    var vorher = zustand.antworten.map(kurz).join(','), nachher = neu.map(kurz).join(',');
    zustand.antworten = neu;
    if (vorher !== nachher) { melden(); }
  }

  function anmelden(googleToken) {
    return anfrage('/anmelden', { methode: 'POST', json: { token: googleToken } })
      .then(function (d) {
        zustand.angemeldet = true;
        zustand.benutzer = d.benutzer;
        zustand.letzterFehler = '';
        melden();
        /* Beim ersten Anmelden alles holen, was es gibt. */
        marke = '';
        return jetzt();
      });
  }

  function abmelden() {
    return anfrage('/abmelden', { methode: 'POST' }).catch(function () { /* egal */ })
      .then(function () {
        zustand.angemeldet = false;
        zustand.benutzer = null;
        zustand.antworten = [];
        stopp();
        melden();
      });
  }

  function benutzerListe() {
    return anfrage('/benutzer').then(function (d) { return (d && d.benutzer) || []; })
      .catch(function () { return []; });
  }

  /* ---------------------------------------------------------------- */
  /* Der Abgleich                                                      */
  /* ---------------------------------------------------------------- */
  function jetzt() {
    if (amLaufen) { return Promise.resolve(zustand); }
    if (!zustand.angemeldet) { return Promise.resolve(zustand); }
    if (global.navigator && global.navigator.onLine === false) {
      zustand.erreichbar = false; melden(); return Promise.resolve(zustand);
    }
    amLaufen = true;
    zustand.laeuft = true;
    melden();

    return holen()
      .then(senden)
      .then(function () {
        zustand.erreichbar = true;
        zustand.letzterFehler = '';
        zustand.letzterAbgleich = new Date().toISOString();
      })
      .catch(function (f) {
        zustand.erreichbar = (f && f.status) ? true : false;
        zustand.letzterFehler = (f && f.message) || 'Der Abgleich ist gescheitert.';
        if (f && f.status === 401) { zustand.angemeldet = false; zustand.benutzer = null; zustand.antworten = []; }
      })
      .then(function () {
        amLaufen = false;
        zustand.laeuft = false;
        return offeneZaehlen();
      })
      .then(function () { melden(); return zustand; });
  }

  /* --- Was gibt es Neues? --- */
  function holen() {
    return anfrage('/projekte?seit=' + encodeURIComponent(marke)).then(function (d) {
      pipedriveMerken(d);
      diktatMerken(d);
      antwortenMerken(d);
      var reihe = Promise.resolve();
      (d.projekte || []).forEach(function (eintrag) {
        reihe = reihe.then(function () { return eintragVerarbeiten(eintrag); });
      });
      return reihe.then(function () { marke = d.marke || marke; });
    });
  }

  /* Das gerade geöffnete Aufmaß, falls es dieses ist. Es ist der frischeste
     eigene Stand: Eine Eingabe, die noch nicht gesichert wurde, liegt nur
     dort. In Prüfläufen ohne Oberfläche gibt es das nicht. */
  function offenesProjekt(id) {
    var Kern = global.AppKern;
    var q = Kern && Kern.Zustand && Kern.Zustand.projekt;
    return (q && q.id === id) ? q : null;
  }
  function offenUngesichert(id) {
    var Kern = global.AppKern;
    return !!(offenesProjekt(id) && Kern.Zustand && (Kern.Zustand.ungesichert || Kern.Zustand.speichertGerade));
  }

  function eintragVerarbeiten(eintrag) {
    return Promise.all([Store.projektLaden(eintrag.id), Store.abgleichLesen(eintrag.id)])
      .then(function (beides) {
        var hier = beides[0], satz = beides[1];

        /* Auf dem Server gelöscht */
        if (eintrag.geloescht) {
          /* Hier liegt noch ungesendete Arbeit: nicht wegwerfen. (Ein eigener
             Grabstein ist keine Arbeit - der ist damit erledigt.) */
          if (satz && satz.schmutzig && !satz.geloescht) { return; }
          return (hier ? Store.projektLoeschen(eintrag.id) : Promise.resolve())
            .then(function () { return Store.abgleichLoeschen(eintrag.id); });
        }
        /* Hier gelöscht, drüben noch nicht angekommen: nicht wiederbeleben */
        if (satz && satz.geloescht) { return; }

        /* Schon auf dem Stand */
        if (satz && satz.version === eintrag.version && !satz.schmutzig) { return; }
        if (satz && satz.version === eintrag.version && satz.schmutzig) { return; }  /* wird gesendet */

        /* Vollständig holen */
        return anfrage('/projekte/' + encodeURIComponent(eintrag.id)).then(function (voll) {
          if (!hier) {
            /* Ganz neu für dieses Gerät */
            return Store.projektSpeichern(voll.daten, { vomAbgleich: true }).then(function () {
              return satzSchreiben(eintrag.id, voll.version, voll.daten, false);
            }).then(function () { return fotosHolen(eintrag.id, voll.daten); })
              .then(function () { return offenesMitziehen(eintrag.id); });
          }
          /* Eine Eingabe, die gerade erst gemacht und noch nicht gesichert
             wurde, zählt als eigene Arbeit - auch wenn die Datenbank noch
             nichts davon weiß. Sonst würde der Serverstand die Datenbank
             überschreiben, der Autosave kurz darauf den alten Speicherstand
             zurückschreiben, und die fremde Änderung wäre ohne Rückfrage
             verloren. Der Prüflauf im Browser hat genau das gezeigt. */
          var ungesendet = (satz && satz.schmutzig) || offenUngesichert(eintrag.id);
          /* Ein geöffnetes Aufmaß nimmt immer den Zusammenführungsweg -
             auch ohne eigene Änderungen. Der Direktweg schreibt erst die
             Datenbank und zieht dann den Speicher nach; wird genau in
             dieser Lücke getippt, bliebe der Speicher auf dem alten Stand
             und der Autosave schriebe ihn über den Serverstand zurück.
             Die Zusammenführung arbeitet dagegen mit dem Speicherstand und
             bringt das Ergebnis in einem Zug hinein. */
          if (!ungesendet && !offenesProjekt(eintrag.id)) {
            /* Hier liegt nichts Ungesendetes: Serverstand übernehmen */
            return Store.projektSpeichern(voll.daten, { vomAbgleich: true }).then(function () {
              return satzSchreiben(eintrag.id, voll.version, voll.daten, false);
            }).then(function () { return fotosHolen(eintrag.id, voll.daten); })
              .then(function () { return offenesMitziehen(eintrag.id); });
          }
          /* Beide Seiten haben gearbeitet: gegen den frischesten eigenen Stand */
          var offen = offenesProjekt(eintrag.id);
          var lokal = offen ? JSON.parse(JSON.stringify(offen)) : hier;
          return zusammenfuehren(lokal, satz || { basis: null, version: 0 }, voll);
        });
      });
  }

  function zusammenfuehren(hier, satz, voll) {
    var e = Z.projekte(satz.basis || {}, hier, voll.daten);
    if (e.konflikte.length) {
      konfliktMerken(hier, e, voll);
      return;
    }
    /* Sauber zusammengeführt: lokal sichern und zum Senden vormerken.
     *
     * Als Basis gilt ab jetzt der Serverstand, gegen den zusammengeführt
     * wurde - nicht mehr die alte Basis. Sonst sähen die eben übernommenen
     * fremden Änderungen beim nächsten Vergleich wie eigene aus, und wenn
     * die andere Seite dieselbe Angabe gleich noch einmal ändert, gäbe es
     * eine Rückfrage zu etwas, das man nie angefasst hat. Der Prüflauf mit
     * zwei Geräten hat genau das gezeigt. */
    e.ergebnis.id = hier.id;
    /* Gab es hier gar keine eigene Arbeit (nur ein geöffnetes Aufmaß), ist
       das Ergebnis der Serverstand - dann gibt es nichts zu senden. */
    var eigeneArbeit = JSON.stringify(hier) !== JSON.stringify(satz.basis || {});
    return Store.projektSpeichern(e.ergebnis, { vomAbgleich: true }).then(function () {
      return satzSchreiben(hier.id, voll.version, voll.daten, eigeneArbeit);
    })
      /* Das Ergebnis enthält die eigenen - auch die noch ungesicherten -
         Eingaben: Es darf und muss in den Speicher, selbst mitten in einer
         Eingabe. Und zwar jetzt, nicht erst nach dem Fotodownload: Der
         dauert Sekunden, und was in der Zeit getippt wird, steckt nicht
         mehr im Ergebnis. */
      .then(function () { return offenesMitziehen(hier.id, eigeneArbeit, e.ergebnis); })
      .then(function () { return fotosHolen(hier.id, voll.daten); });
  }

  function konfliktMerken(hier, e, voll) {
    var vorhanden = -1;
    zustand.konflikte.forEach(function (x, i) { if (x.projektId === hier.id) { vorhanden = i; } });
    var satz = {
      projektId: hier.id,
      name: hier.kunde || hier.name || 'Aufmaß',
      konflikte: e.konflikte,
      ergebnis: e.ergebnis,
      serverVersion: voll.version,
      serverDaten: voll.daten,
      wer: voll.geaendertVon || 'eine andere Stelle'
    };
    if (vorhanden >= 0) { zustand.konflikte[vorhanden] = satz; }
    else { zustand.konflikte.push(satz); }
    melden();
  }

  /** Die Entscheidungen des Benutzers übernehmen und senden. */
  function konfliktAufloesen(projektId, wahl) {
    var satz = null;
    zustand.konflikte.forEach(function (x) { if (x.projektId === projektId) { satz = x; } });
    if (!satz) { return Promise.resolve(false); }

    var fertig = Z.anwenden(satz.ergebnis, satz.konflikte, wahl || {});
    fertig.id = projektId;
    return Store.projektSpeichern(fertig, { vomAbgleich: true })
      .then(function () {
        /* Als Basis gilt jetzt der Serverstand: Darauf baut das Senden auf. */
        return satzSchreiben(projektId, satz.serverVersion, satz.serverDaten, true);
      })
      .then(function () {
        zustand.konflikte = zustand.konflikte.filter(function (x) { return x.projektId !== projektId; });
        melden();
        /* Die Auflösung ist die eben getroffene Entscheidung - sie gehört
           in den Speicher, auch wenn gerade eine Eingabe aussteht. Sonst
           überschriebe der nächste Autosave sie mit dem alten Stand. */
        return offenesMitziehen(projektId, true, fertig);
      })
      .then(function () { return jetzt(); })
      .then(function () { return true; });
  }

  /* --- Was muss hier weg? --- */
  function senden() {
    return Store.abgleichAlle().then(function (saetze) {
      var reihe = Promise.resolve();
      (saetze || []).filter(function (s) { return s && s.schmutzig; }).forEach(function (s) {
        reihe = reihe.then(function () { return s.geloescht ? loeschungSenden(s.id) : einesSenden(s); });
      });
      return reihe;
    });
  }

  /* Ein lokal gelöschtes Aufmaß drüben löschen. Scheitert es am Netz,
     bleibt der Grabstein liegen und es wird beim nächsten Durchgang
     erneut versucht - wie bei jeder anderen Änderung. */
  function loeschungSenden(id) {
    return anfrage('/projekte/' + encodeURIComponent(id), { methode: 'DELETE' })
      .then(function () { return Store.abgleichLoeschen(id); })
      .catch(function (f) {
        /* Drüben nie angekommen: dort gibt es nichts zu löschen. */
        if (f && f.status === 404) { return Store.abgleichLoeschen(id); }
        /* Nicht erlaubt - nur Zuständige dürfen löschen. Dann kommt das
           Aufmaß hierher ZURÜCK, und zwar sofort: Sonst wäre es auf diesem
           Gerät weg und auf allen anderen da, und tauchte irgendwann still
           wieder auf. So sieht man gleich, dass man es nicht löschen darf. */
        if (f && f.status === 403) {
          return Store.abgleichLoeschen(id).then(function () { return zurueckholen(id); });
        }
        throw f;   /* Netz: beim nächsten Durchgang erneut */
      });
  }

  /* Den Serverstand eines Aufmaßes wiederherstellen (samt Fotos). */
  function zurueckholen(id) {
    return anfrage('/projekte/' + encodeURIComponent(id)).then(function (voll) {
      if (!voll || !voll.daten || voll.geloescht) { return; }
      return Store.projektSpeichern(voll.daten, { vomAbgleich: true })
        .then(function () { return satzSchreiben(id, voll.version, voll.daten, false); })
        .then(function () { return fotosHolen(id, voll.daten); });
    }).catch(function () { /* dann beim nächsten Abholen */ });
  }

  function einesSenden(satz) {
    /* Für dieses Projekt steht eine Frage offen: erst klären lassen. */
    var offen = zustand.konflikte.some(function (x) { return x.projektId === satz.id; });
    if (offen) { return Promise.resolve(); }

    /* Für ein geöffnetes Aufmaß zählt der Speicher, nicht die Datenbank:
       Dort steht die neueste Eingabe, gesichert oder noch nicht. */
    var offen = offenesProjekt(satz.id);
    return (offen ? Promise.resolve(JSON.parse(JSON.stringify(offen))) : Store.projektLaden(satz.id)).then(function (projekt) {
      /* Kein Projekt mehr, aber auch kein Grabstein: Altlast, aufräumen */
      if (!projekt) { return Store.abgleichLoeschen(satz.id); }

      /* Erst das Aufmaß, dann die Fotos - nicht umgekehrt.
       *
       * Ein Foto gehört immer zu einem Aufmaß, und der Server nimmt nur
       * Fotos zu einem Aufmaß an, das er kennt. Ein neu angelegtes Aufmaß
       * mit Fotos (der Normalfall vor Ort) muss also zuerst ankommen. */
      return anfrage('/projekte/' + encodeURIComponent(satz.id), {
        methode: 'PUT',
        json: { daten: ohneBilddaten(projekt), basisVersion: satz.version || 0 }
      }).then(function (antwort) {
        return fotosSenden(satz.id, projekt).then(function () { return antwort; });
      }).then(function (antwort) {
        return satzSchreiben(satz.id, antwort.version, ohneBilddaten(projekt), false);
      }).catch(function (f) {
        if (f && f.status === 409 && f.daten && f.daten.server) {
          /* In der Zwischenzeit hat jemand anderes gespeichert */
          return zusammenfuehren(projekt, satz, f.daten.server);
        }
        if (f && f.status === 403) {
          return satzSchreiben(satz.id, satz.version, satz.basis, true, f.message);
        }
        throw f;
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Fotos                                                             */
  /* ---------------------------------------------------------------- */
  function fotoListe(projekt) {
    var aus = [];
    (projekt.tueren || []).forEach(function (t) {
      (t.fotos || []).forEach(function (f) { if (f && f.id) { aus.push({ foto: f, tuerId: t.id }); } });
    });
    return aus;
  }

  function ohneBilddaten(projekt) {
    var kopie = JSON.parse(JSON.stringify(projekt));
    (kopie.tueren || []).forEach(function (t) {
      (t.fotos || []).forEach(function (f) { if (f) { f.dataUrl = ''; } });
    });
    return kopie;
  }

  function fotosSenden(projektId, projekt) {
    var hier = fotoListe(projekt).filter(function (x) { return x.foto.dataUrl; });
    if (!hier.length) { return Promise.resolve(); }

    return anfrage('/projekte/' + encodeURIComponent(projektId) + '/fotos')
      .catch(function () { return { fotos: [] }; })
      .then(function (d) {
        var dort = {};
        ((d && d.fotos) || []).forEach(function (id) { dort[id] = true; });
        var reihe = Promise.resolve();
        hier.filter(function (x) { return !dort[x.foto.id]; }).forEach(function (x) {
          reihe = reihe.then(function () { return einFotoSenden(projektId, x); });
        });
        return reihe;
      });
  }

  function einFotoSenden(projektId, x) {
    var teile = /^data:([^;]+);base64,(.*)$/.exec(x.foto.dataUrl || '');
    if (!teile) { return Promise.resolve(); }
    var roh = atob(teile[2]);
    var bytes = new Uint8Array(roh.length);
    for (var i = 0; i < roh.length; i++) { bytes[i] = roh.charCodeAt(i); }
    return anfrage('/fotos/' + encodeURIComponent(x.foto.id)
        + '?projekt=' + encodeURIComponent(projektId) + '&tuer=' + encodeURIComponent(x.tuerId || ''), {
      methode: 'PUT', typ: teile[1], koerper: bytes
    }).catch(function (f) {
      /* Ein einzelnes Foto darf den ganzen Abgleich nicht aufhalten. */
      if (f && f.status && f.status < 500) { return null; }
      throw f;
    });
  }

  function fotosHolen(projektId, daten) {
    return Store.projektLaden(projektId).then(function (projekt) {
      if (!projekt) { return; }
      var fehlend = fotoListe(projekt).filter(function (x) { return !x.foto.dataUrl; });
      if (!fehlend.length) { return; }

      var geholt = {};
      var reihe = Promise.resolve();
      fehlend.forEach(function (x) {
        reihe = reihe.then(function () {
          return anfrage('/fotos/' + encodeURIComponent(x.foto.id), { roh: true })
            .then(function (blob) { return blobAlsDataUrl(blob); })
            .then(function (url) { geholt[x.foto.id] = url; })
            .catch(function () { /* Foto fehlt serverseitig: Eintrag bleibt ohne Bild */ });
        });
      });
      return reihe.then(function () {
        if (!Object.keys(geholt).length) { return; }
        /* Der Download dauert; in der Zeit kann ein Autosave gelaufen sein.
           Deshalb erst jetzt den Stand aus der Datenbank nehmen und nur die
           Bilddaten nachtragen - und dasselbe im Speicher, falls das Aufmaß
           gerade offen ist. */
        return Store.projektLaden(projektId).then(function (frisch) {
          if (!frisch) { return; }
          fotosEintragen(frisch, geholt);
          var Kern = global.AppKern;
          if (Kern && Kern.Zustand && Kern.Zustand.projekt && Kern.Zustand.projekt.id === projektId) {
            fotosEintragen(Kern.Zustand.projekt, geholt);
            if (!Kern.Zustand.ungesichert && global.App && global.App.zeichnen) {
              try { global.App.zeichnen(); } catch (e) {}
            }
          }
          return Store.projektSpeichern(frisch, { vomAbgleich: true });
        });
      });
    });
  }

  function fotosEintragen(projekt, geholt) {
    fotoListe(projekt).forEach(function (x) {
      if (!x.foto.dataUrl && geholt[x.foto.id]) { x.foto.dataUrl = geholt[x.foto.id]; }
    });
  }

  function blobAlsDataUrl(blob) {
    return new Promise(function (fertig, schief) {
      var leser = new FileReader();
      leser.onload = function () { fertig(leser.result); };
      leser.onerror = schief;
      leser.readAsDataURL(blob);
    });
  }

  /* ----------------------------------------------------------------
   * Ein gerade geöffnetes Aufmaß mitziehen
   *
   * Der Abgleich schreibt in die Datenbank. Ist dasselbe Aufmaß aber
   * gerade geöffnet, hält die Oberfläche eine eigene Fassung im Speicher.
   * Würde die nicht mitgezogen, sähe man weiter den alten Stand - und die
   * nächste Speicherung würde das Zusammengeführte wieder überschreiben.
   *
   * Die Übernahme geschieht AN ORT UND STELLE: Die Oberfläche hält auch
   * Verweise auf einzelne Türen (ein offener Türdialog zum Beispiel).
   * Würde das Projekt als Ganzes ersetzt, zeigten diese Verweise ins
   * Leere und Eingaben liefen ins Nichts.
   * ---------------------------------------------------------------- */
  /* Schlüssel, die nie aus Daten kommen dürfen: Sie würden nicht in das
     Objekt, sondern in dessen Bauplan schreiben. (Bewusst als Vergleich,
     nicht als Nachschlagetabelle: In einem Objekt-Literal setzt
     "__proto__:" den Bauplan, statt einen Eintrag anzulegen.) */
  function schluesselErlaubt(k) { return k !== '__proto__' && k !== 'constructor' && k !== 'prototype'; }

  function inPlatzUebernehmen(ziel, quelle) {
    if (!ziel || !quelle || typeof ziel !== 'object' || typeof quelle !== 'object') { return; }
    Object.keys(ziel).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(quelle, k)) { delete ziel[k]; }
    });
    Object.keys(quelle).forEach(function (k) {
      if (!schluesselErlaubt(k)) { return; }
      var q = quelle[k], z = ziel[k];
      if (Array.isArray(q) && Array.isArray(z) && q.length && q[0] && q[0].id) {
        var bekannt = {};
        z.forEach(function (x) { if (x && x.id) { bekannt[x.id] = x; } });
        var neueFolge = q.map(function (x) {
          if (x && x.id && bekannt[x.id]) { inPlatzUebernehmen(bekannt[x.id], x); return bekannt[x.id]; }
          return x;
        });
        z.length = 0;
        neueFolge.forEach(function (x) { z.push(x); });
        return;
      }
      if (q && typeof q === 'object' && !Array.isArray(q) && z && typeof z === 'object' && !Array.isArray(z)) {
        inPlatzUebernehmen(z, q);
        return;
      }
      ziel[k] = q;
    });
  }

  /**
   * @param erzwingen  auch bei ungesicherter Eingabe übernehmen - nur dann,
   *                   wenn 'daten' diese Eingabe bereits enthält (Ergebnis
   *                   einer Zusammenführung mit dem Speicherstand)
   * @param daten      der zu übernehmende Stand; fehlt er, die Datenbank
   */
  function offenesMitziehen(id, erzwingen, daten) {
    var Kern = global.AppKern;
    if (!Kern || !Kern.Zustand || !Kern.Zustand.projekt) { return Promise.resolve(); }
    if (Kern.Zustand.projekt.id !== id) { return Promise.resolve(); }
    /* Nicht mitten in eine laufende Eingabe hineinschreiben - außer das
       Ergebnis enthält sie schon. */
    if (!erzwingen && (Kern.Zustand.ungesichert || Kern.Zustand.speichertGerade)) { return Promise.resolve(); }
    return (daten ? Promise.resolve(daten) : Store.projektLaden(id)).then(function (frisch) {
      if (!frisch) { return; }
      inPlatzUebernehmen(Kern.Zustand.projekt, frisch);
      /* Der Verlauf beginnt neu: Seine Stände stammen von vor der
         Zusammenführung. Ein „Zurück“ dorthin nähme fremde Änderungen
         zurück - und sendete das als eigene Arbeit an den Server. */
      if (global.Verlauf && global.Verlauf.beginnen) {
        try { global.Verlauf.beginnen(Kern.Zustand.projekt); } catch (e) {}
      }
      /* Was jetzt im Speicher steht, muss auch in die Datenbank - der
         nächste Autosave erledigt das. */
      if (erzwingen && typeof Kern.alsGeaendertMarkieren === 'function') {
        try { Kern.alsGeaendertMarkieren(); } catch (e) {}
      }
      if (global.App && global.App.zeichnen) {
        try { global.App.zeichnen(); } catch (e) {}
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Zustand und Takt                                                  */
  /* ---------------------------------------------------------------- */
  function satzSchreiben(id, version, basis, schmutzig, fehler) {
    return Store.abgleichSchreiben({
      id: id,
      version: version || 0,
      basis: basis ? JSON.parse(JSON.stringify(basis)) : null,
      schmutzig: !!schmutzig,
      fehler: fehler || '',
      zuletzt: new Date().toISOString()
    });
  }

  /** Vom Werkzeug nach jedem Speichern aufzurufen. */
  function projektGeaendert(projekt) {
    if (!projekt || !projekt.id) { return Promise.resolve(); }
    return Store.abgleichLesen(projekt.id).then(function (satz) {
      return Store.abgleichSchreiben({
        id: projekt.id,
        version: satz ? satz.version : 0,
        basis: satz ? satz.basis : null,
        schmutzig: true,
        fehler: '',
        zuletzt: new Date().toISOString()
      });
    }).then(function () {
      return offeneZaehlen();
    }).then(function () {
      melden();
      if (!zustand.angemeldet) { return; }
      if (sendeUhr) { clearTimeout(sendeUhr); }
      sendeUhr = setTimeout(function () { sendeUhr = null; jetzt(); }, VERZUG_SENDEN);
    });
  }

  /**
   * Ein lokal gelöschtes Projekt auch drüben löschen.
   *
   * Zuerst wird ein Grabstein abgelegt, dann gesendet. Ohne Netz bleibt
   * der Grabstein liegen und geht mit dem nächsten Durchgang raus. Vorher
   * ging die Löschung ohne Netz verloren - und das Aufmaß kam beim
   * nächsten Abgleich sogar zurück. Der Prüflauf mit zwei Geräten hat es
   * gezeigt.
   */
  function projektGeloescht(id) {
    return Store.abgleichLesen(id).then(function (satz) {
      /* Nie auf dem Server gewesen: drüben gibt es nichts zu löschen */
      if (!satz || !satz.version) { return Store.abgleichLoeschen(id).then(function () { return false; }); }
      return Store.abgleichSchreiben({
        id: id, version: satz.version, basis: null, schmutzig: true, geloescht: true,
        fehler: '', zuletzt: new Date().toISOString()
      }).then(function () { return true; });
    }).then(function (offen) {
      if (!offen || !zustand.angemeldet) { return; }
      return loeschungSenden(id).catch(function () { /* bleibt als Grabstein liegen */ });
    }).then(function () { return offeneZaehlen(); })
      .then(function () { melden(); });
  }

  function offeneZaehlen() {
    return Store.abgleichAlle().then(function (s) {
      zustand.offen = (s || []).filter(function (x) { return x && x.schmutzig; }).length;
      return zustand.offen;
    });
  }

  /**
   * Wer ist für dieses Aufmaß zuständig?
   *
   * Gefragt wird nur, wenn das Aufmaß überhaupt schon auf dem Server
   * liegt. Sonst gäbe es eine Fehlantwort auf eine Frage, deren Antwort
   * man schon kennt: Es ist eben noch nicht abgeglichen.
   */
  function zustaendigeLesen(projektId) {
    return Store.abgleichLesen(projektId).then(function (satz) {
      if (!satz || !satz.version) {
        return { abgeglichen: false, zustaendige: [] };
      }
      return anfrage('/projekte/' + encodeURIComponent(projektId)).then(function (d) {
        return { abgeglichen: true, zustaendige: (d && d.zustaendige) || [] };
      });
    }).catch(function () { return { abgeglichen: false, zustaendige: [] }; });
  }

  function zustaendigeSetzen(projektId, benutzerIds) {
    return anfrage('/projekte/' + encodeURIComponent(projektId) + '/zustaendige', {
      methode: 'PUT', json: { benutzer: benutzerIds }
    });
  }

  /* ----------------------------------------------------------------
   * Kundenfreigabe über Kurzlink
   *
   * Die Freigabe liegt auf dem Server (siehe server/.../freigaben.php);
   * der Kunde bekommt nur den Code. Seine Rückmeldung wartet dort und
   * kommt mit dem Abgleich hierher - übernommen wird sie erst, wenn ein
   * Zuständiger den Bericht gesehen und bestätigt hat.
   * ---------------------------------------------------------------- */
  function freigabeErstellen(projektId, daten, seite, optionen) {
    return anfrage('/freigaben', { methode: 'POST', json: { projektId: projektId, daten: daten, seite: seite || '',
      vorlegen: !!(optionen && optionen.vorlegen) } });
  }
  /* Den aktuellen Plan über einen bestehenden Link zur verbindlichen
     Freigabe vorlegen: Der Kunde sieht dann den neuen Stand ohne
     Bearbeitung und kann ihn freigeben. */
  function freigabeVorlegen(code, daten) {
    return anfrage('/freigaben/' + encodeURIComponent(code) + '/vorlegen', { methode: 'POST', json: { daten: daten } })
      .then(function (d) { return d && d.freigabe; });
  }

  function freigabenListe(projektId) {
    return anfrage('/freigaben?projekt=' + encodeURIComponent(projektId))
      .then(function (d) { return (d && d.freigaben) || []; });
  }

  function freigabeZurueckziehen(code) {
    return anfrage('/freigaben/' + encodeURIComponent(code) + '/zurueckziehen', { methode: 'POST', json: {} })
      .then(function (d) { return d && d.freigabe; });
  }

  function antwortFinden(code) {
    var aus = null;
    zustand.antworten.forEach(function (a) { if (a.code === code) { aus = a; } });
    return aus;
  }

  function antwortenFuer(projektId) {
    return zustand.antworten.filter(function (a) { return a.projektId === projektId; });
  }

  function antwortEntfernen(code) {
    zustand.antworten = zustand.antworten.filter(function (a) { return a.code !== code; });
    melden();
  }

  /* Der frischeste eigene Stand als Kopie: das geöffnete Aufmaß, sonst
     die Datenbank. Null, wenn das Aufmaß hier (noch) nicht liegt. */
  function projektKopie(id) {
    var offen = offenesProjekt(id);
    if (offen) { return Promise.resolve(JSON.parse(JSON.stringify(offen))); }
    return Store.projektLaden(id).then(function (p) { return p ? JSON.parse(JSON.stringify(p)) : null; });
  }

  function nichtDa() {
    return new Error('Das Aufmaß liegt auf diesem Gerät noch nicht vor. Bitte kurz warten, bis der Abgleich es geholt hat.');
  }


  /** Was würde die Übernahme ändern? Ein Bericht, ohne etwas zu ändern. */
  function antwortVorschau(code) {
    var eintrag = antwortFinden(code);
    if (!eintrag) { return Promise.reject(new Error('Diese Rückmeldung liegt nicht mehr vor.')); }
    return projektKopie(eintrag.projektId).then(function (kopie) {
      if (!kopie) { throw nichtDa(); }
      var bericht = global.Freigabe.antwortUebernehmen(kopie, eintrag.antwort || {}, { serverGeprueft: true, code: code });
      return { eintrag: eintrag, bericht: bericht, projekt: kopie };
    });
  }

  /**
   * Übernehmen - in dieser Reihenfolge:
   *  1. hier auf einer Kopie eintragen (zeigt, ob die Antwort passt)
   *  2. drüben als übernommen markieren (lehnt ab, wenn jemand schneller
   *     war oder der Kunde inzwischen erneut übertragen hat)
   *  3. erst dann die Kopie zum eigenen Stand machen und speichern
   * Scheitert Schritt 2, bleibt hier alles unverändert.
   */
  function antwortUebernehmen(code) {
    var eintrag = antwortFinden(code);
    if (!eintrag) { return Promise.reject(new Error('Diese Rückmeldung liegt nicht mehr vor.')); }
    var Kern = global.AppKern;
    return projektKopie(eintrag.projektId).then(function (kopie) {
      if (!kopie) { throw nichtDa(); }
      var bericht = global.Freigabe.antwortUebernehmen(kopie, eintrag.antwort || {}, { serverGeprueft: true, code: code });
      return anfrage('/freigaben/' + encodeURIComponent(code) + '/uebernommen',
          { methode: 'POST', json: { antwortNr: eintrag.antwortNr } })
        .catch(function (f) {
          /* Nicht mehr offen: Der nächste Abgleich bringt den neuen Stand. */
          if (f && f.status === 409) { antwortEntfernen(code); setTimeout(jetzt, 0); }
          throw f;
        })
        .then(function () {
          antwortEntfernen(code);
          var offen = offenesProjekt(eintrag.projektId);
          if (offen) {
            if (Kern && typeof Kern.schrittMerken === 'function') {
              try { Kern.schrittMerken('Kundenrückmeldung übernommen'); } catch (e) {}
            }
            inPlatzUebernehmen(offen, kopie);
            if (Kern && typeof Kern.alsGeaendertMarkieren === 'function') {
              try { Kern.alsGeaendertMarkieren(); } catch (e) {}
            }
            if (global.App && global.App.zeichnen) { try { global.App.zeichnen(); } catch (e) {} }
            return (Kern && typeof Kern.speichern === 'function') ? Kern.speichern() : Promise.resolve();
          }
          /* Nicht geöffnet: in die Datenbank - das meldet sich von selbst
             beim Abgleich und geht mit dem nächsten Durchgang raus. */
          return Store.projektSpeichern(kopie);
        })
        .then(function () { return bericht; });
    });
  }

  /** Geprüft und NICHT übernommen. */
  function antwortVerwerfen(code) {
    var eintrag = antwortFinden(code);
    if (!eintrag) { return Promise.resolve(false); }
    return anfrage('/freigaben/' + encodeURIComponent(code) + '/verwerfen',
        { methode: 'POST', json: { antwortNr: eintrag.antwortNr } })
      .catch(function (f) {
        if (f && f.status === 409) { antwortEntfernen(code); setTimeout(jetzt, 0); }
        throw f;
      })
      .then(function () { antwortEntfernen(code); return true; });
  }

  /* Einmal angelegt und wiederverwendet: Würde bei jedem start() ein
     neuer Empfänger angemeldet, liefen nach mehrfachem Ab- und Anmelden
     mehrere Abgleiche gleichzeitig los. */
  function beiNetzAn() { jetzt(); }
  function beiNetzAus() { zustand.erreichbar = false; melden(); }
  var empfaengerAngemeldet = false;

  function start() {
    stopp();
    uhr = setInterval(function () {
      if (!zustand.angemeldet) { return; }
      var ruht = global.document && global.document.hidden;
      if (ruht && Math.random() > 0.25) { return; }   /* im Hintergrund seltener */
      jetzt();
    }, TAKT_NORMAL);
    if (global.addEventListener && !empfaengerAngemeldet) {
      global.addEventListener('online', beiNetzAn);
      global.addEventListener('offline', beiNetzAus);
      empfaengerAngemeldet = true;
    }
    return jetzt();
  }

  function stopp() {
    if (uhr) { clearInterval(uhr); uhr = null; }
    if (sendeUhr) { clearTimeout(sendeUhr); sendeUhr = null; }
  }

  function melden() { if (beiAenderung) { try { beiAenderung(zustand); } catch (e) {} } }

  global.Abgleich = {
    einrichten: einrichten,
    anmelden: anmelden,
    abmelden: abmelden,
    benutzerListe: benutzerListe,
    start: start,
    stopp: stopp,
    jetzt: jetzt,
    projektGeaendert: projektGeaendert,
    projektGeloescht: projektGeloescht,
    konfliktAufloesen: konfliktAufloesen,
    zustaendigeLesen: zustaendigeLesen,
    zustaendigeSetzen: zustaendigeSetzen,
    freigabeErstellen: freigabeErstellen,
    freigabenListe: freigabenListe,
    freigabeZurueckziehen: freigabeZurueckziehen,
    freigabeVorlegen: freigabeVorlegen,
    antwortenFuer: antwortenFuer,
    antwortVorschau: antwortVorschau,
    antwortUebernehmen: antwortUebernehmen,
    antwortVerwerfen: antwortVerwerfen,
    diktat: diktat,
    zustand: function () { return zustand; },
    /* für Tests */
    _intern: { ohneBilddaten: ohneBilddaten, fotoListe: fotoListe,
               inPlatzUebernehmen: inPlatzUebernehmen,
               holen: holen, senden: senden,
               markeSetzen: function (m) { marke = m; }, markeLesen: function () { return marke; } }
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Abgleich; }
})(typeof window !== 'undefined' ? window : globalThis);
