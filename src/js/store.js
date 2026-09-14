/* =============================================================================
 * store.js — Persistenz (IndexedDB mit localStorage-Rückfallebene),
 *            Export/Import und Bildverarbeitung.
 * Alles läuft ausschließlich auf dem Gerät; es werden keine Daten übertragen.
 * ========================================================================== */
(function (global) {
  'use strict';

  var DB_NAME = 'aufmass-tool';
  var DB_VERSION = 1;
  var STORE_PROJEKTE = 'projekte';
  var STORE_META = 'meta';
  var LS_PRAEFIX = 'aufmass.';

  var db = null;
  var nutztFallback = false;

  /* --- IndexedDB öffnen ---------------------------------------------------- */
  function oeffnen() {
    return new Promise(function (resolve) {
      if (db) return resolve(db);
      if (!global.indexedDB) { nutztFallback = true; return resolve(null); }
      var anfrage;
      try { anfrage = global.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { nutztFallback = true; return resolve(null); }

      anfrage.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_PROJEKTE)) {
          d.createObjectStore(STORE_PROJEKTE, { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains(STORE_META)) {
          d.createObjectStore(STORE_META, { keyPath: 'schluessel' });
        }
      };
      anfrage.onsuccess = function (e) { db = e.target.result; resolve(db); };
      anfrage.onerror = function () {
        /* Bei privatem Modus in Safari kann IndexedDB blockiert sein. */
        nutztFallback = true; resolve(null);
      };
      /* Safari im privaten Modus blockiert gelegentlich ohne Event */
      setTimeout(function () { if (!db && !nutztFallback) { nutztFallback = true; resolve(null); } }, 3000);
    });
  }

  function tx(store, modus) {
    return db.transaction(store, modus).objectStore(store);
  }
  function alsPromise(anfrage) {
    return new Promise(function (resolve, reject) {
      anfrage.onsuccess = function () { resolve(anfrage.result); };
      anfrage.onerror = function () { reject(anfrage.error); };
    });
  }

  /* --- localStorage-Rückfallebene ----------------------------------------- */
  function lsSchluesselListe() {
    var out = [];
    for (var i = 0; i < global.localStorage.length; i++) {
      var k = global.localStorage.key(i);
      if (k && k.indexOf(LS_PRAEFIX + 'projekt.') === 0) out.push(k);
    }
    return out;
  }

  /* --- Projekte ------------------------------------------------------------ */
  function alleProjekte() {
    return oeffnen().then(function (d) {
      if (!d) {
        return lsSchluesselListe().map(function (k) {
          try { return JSON.parse(global.localStorage.getItem(k)); } catch (e) { return null; }
        }).filter(Boolean);
      }
      return alsPromise(tx(STORE_PROJEKTE, 'readonly').getAll());
    }).then(function (liste) {
      return (liste || []).sort(function (a, b) {
        return String(b.geaendert || '').localeCompare(String(a.geaendert || ''));
      });
    });
  }

  function projektLaden(id) {
    return oeffnen().then(function (d) {
      if (!d) {
        var roh = global.localStorage.getItem(LS_PRAEFIX + 'projekt.' + id);
        return roh ? JSON.parse(roh) : null;
      }
      return alsPromise(tx(STORE_PROJEKTE, 'readonly').get(id));
    });
  }

  function projektSpeichern(projekt) {
    projekt.geaendert = new Date().toISOString();
    return oeffnen().then(function (d) {
      if (!d) {
        try {
          global.localStorage.setItem(LS_PRAEFIX + 'projekt.' + projekt.id, JSON.stringify(projekt));
        } catch (e) {
          return Promise.reject(new Error('Speicher voll. Bitte Fotos reduzieren oder Projekte exportieren und löschen.'));
        }
        return projekt;
      }
      return alsPromise(tx(STORE_PROJEKTE, 'readwrite').put(projekt)).then(function () { return projekt; });
    });
  }

  function projektLoeschen(id) {
    return oeffnen().then(function (d) {
      if (!d) { global.localStorage.removeItem(LS_PRAEFIX + 'projekt.' + id); return true; }
      return alsPromise(tx(STORE_PROJEKTE, 'readwrite').delete(id)).then(function () { return true; });
    });
  }

  /* --- Einstellungen (Firmenkopf, Logo, eigene Systeme) -------------------- */
  var EINSTELLUNGEN_STANDARD = {
    firma: '',
    firmaZusatz: '',
    firmaTelefon: '',
    firmaEmail: '',
    logoDataUrl: '',
    standardBearbeiter: '',
    eigeneSysteme: [],
    eigeneZylinderarten: [],
    eigeneZutrittsarten: [],
    eigeneBeschlagarten: [],
    eigeneSchlossarten: [],
    /* Pipedrive: Der Schlüssel verbleibt auf diesem Gerät und wird weder
     * exportiert noch in Projekte oder Freigabe-Links geschrieben. */
    pipedriveToken: '',
    pipedriveHost: '',
    pipedrivePipelineId: '',
    pipedrivePipelineName: '',
    pipedrivePhaseId: '',
    pipedrivePhaseName: '',
    fotoQualitaet: 0.72,
    fotoMaxKante: 1280,
    letztesProjekt: ''
  };

  function einstellungenLaden() {
    return oeffnen().then(function (d) {
      if (!d) {
        var roh = global.localStorage.getItem(LS_PRAEFIX + 'einstellungen');
        return roh ? JSON.parse(roh) : {};
      }
      return alsPromise(tx(STORE_META, 'readonly').get('einstellungen')).then(function (e) {
        return e ? e.wert : {};
      });
    }).then(function (gespeichert) {
      var out = {};
      Object.keys(EINSTELLUNGEN_STANDARD).forEach(function (k) {
        out[k] = (gespeichert && gespeichert[k] !== undefined) ? gespeichert[k] : EINSTELLUNGEN_STANDARD[k];
      });
      return out;
    }).catch(function () { return Object.assign({}, EINSTELLUNGEN_STANDARD); });
  }

  function einstellungenSpeichern(werte) {
    return oeffnen().then(function (d) {
      if (!d) {
        global.localStorage.setItem(LS_PRAEFIX + 'einstellungen', JSON.stringify(werte));
        return werte;
      }
      return alsPromise(tx(STORE_META, 'readwrite').put({ schluessel: 'einstellungen', wert: werte }))
        .then(function () { return werte; });
    });
  }

  /* --- Export / Import ----------------------------------------------------- */
  function exportDaten(projekt, einstellungen, mitFotos) {
    var kopie = JSON.parse(JSON.stringify(projekt));
    if (mitFotos === false) {
      kopie.tueren.forEach(function (t) { t.fotos = []; });
    }
    return {
      typ: 'schliessanlagen-aufmass',
      version: 1,
      exportiert: new Date().toISOString(),
      /* Ausdrücklich nur diese vier Angaben: Zugangsdaten und Schlüssel
         dürfen eine Projektdatei niemals verlassen. */
      einstellungen: einstellungen ? {
        firma: einstellungen.firma, firmaZusatz: einstellungen.firmaZusatz,
        firmaTelefon: einstellungen.firmaTelefon, firmaEmail: einstellungen.firmaEmail
      } : null,
      projekt: kopie
    };
  }

  function exportDateiname(projekt) {
    var basis = (projekt.kunde || projekt.name || 'Aufmass')
      .replace(/[^\wäöüÄÖÜß \-]/g, '').trim().replace(/\s+/g, '-');
    return basis + '_Aufmass_' + (global.Model ? global.Model.heute() : '') + '.json';
  }

  /* Liest eine exportierte Datei und gibt ein migriertes Projekt zurück. */
  function importParsen(text) {
    var daten;
    try { daten = JSON.parse(text); }
    catch (e) { throw new Error('Die Datei ist keine gültige JSON-Datei.'); }

    var projekt = null;
    if (daten && daten.typ === 'schliessanlagen-aufmass' && daten.projekt) projekt = daten.projekt;
    else if (daten && Array.isArray(daten.tueren)) projekt = daten;          /* blankes Projekt */
    else throw new Error('Die Datei enthält kein Aufmaß-Projekt.');

    var migriert = global.Model.migriere(projekt);
    return { projekt: migriert, einstellungen: daten.einstellungen || null };
  }

  /* Vergibt neue IDs, damit ein Import ein bestehendes Projekt nicht überschreibt. */
  function projektKlonen(projekt, neuerName) {
    var kopie = JSON.parse(JSON.stringify(projekt));
    var M = global.Model;
    var idMap = {};
    kopie.id = M.uid('prj');
    kopie.name = neuerName || (kopie.name + ' (Kopie)');
    kopie.erstellt = new Date().toISOString();
    kopie.geaendert = kopie.erstellt;

    kopie.standorte.forEach(function (k) { idMap[k.id] = M.uid('str'); });
    kopie.standorte.forEach(function (k) {
      k.id = idMap[k.id];
      if (k.parentId) k.parentId = idMap[k.parentId] || null;
    });
    var tuerMap = {}, schlMap = {};
    kopie.tueren.forEach(function (t) {
      tuerMap[t.id] = M.uid('tur'); t.id = tuerMap[t.id];
      if (t.strukturId) t.strukturId = idMap[t.strukturId] || null;
    });
    kopie.schliessungen.forEach(function (s) { schlMap[s.id] = M.uid('sch'); s.id = schlMap[s.id]; });

    var neueMatrix = {};
    Object.keys(kopie.matrix).forEach(function (key) {
      var teile = key.split('|');
      var nt = tuerMap[teile[0]], ns = schlMap[teile[1]];
      if (nt && ns) neueMatrix[nt + '|' + ns] = kopie.matrix[key];
    });
    kopie.matrix = neueMatrix;
    return kopie;
  }

  /* --- Dateiausgabe -------------------------------------------------------
   * Zwei Wege, je nachdem wie die Anwendung ausgeliefert wird:
   *  - lokal geöffnet oder von einem Webserver: klassischer Download-Link
   *  - in einer eingebetteten Umgebung, die eigene Downloads unterbindet:
   *    die dort bereitgestellte Speicherfunktion
   * ---------------------------------------------------------------------- */
  var speicherFunktion;          // undefined = noch nicht geprüft, null = nicht vorhanden

  function ausgabeVorbereiten() {
    if (speicherFunktion !== undefined) return Promise.resolve(speicherFunktion);
    if (!global.claude || typeof global.claude.use !== 'function') {
      speicherFunktion = null;
      return Promise.resolve(null);
    }
    return global.claude.use('downloads').then(function (d) {
      speicherFunktion = (d && typeof d.save === 'function') ? d : null;
      return speicherFunktion;
    }).catch(function () { speicherFunktion = null; return null; });
  }

  /* Gibt ein Promise auf 'gespeichert' | 'abgelehnt' zurück bzw. wird
   * mit einer verständlichen Meldung abgelehnt. */
  function dateiHerunterladen(inhalt, dateiname, mimeTyp) {
    var blob = (inhalt instanceof Blob) ? inhalt
      : new Blob([inhalt], { type: mimeTyp || 'application/json' });

    return ausgabeVorbereiten().then(function (speichern) {
      if (speichern) {
        return speichern.save({ filename: dateiname, data: blob })
          .then(function () { return 'gespeichert'; })
          .catch(function (fehler) {
            var code = fehler && fehler.code;
            if (code === 'declined') return 'abgelehnt';
            if (code === 'rate_limited') {
              throw new Error('Es ist bereits eine Abfrage offen. Bitte kurz warten und erneut versuchen.');
            }
            if (code === 'too_large') {
              throw new Error('Die Datei ist zu groß. Bitte den Export ohne Fotos wählen.');
            }
            throw new Error('Speichern nicht möglich (' + (code || 'unbekannt') + ').');
          });
      }
      /* Klassischer Weg */
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = dateiname; a.rel = 'noopener';
      document.body.appendChild(a); a.click();
      setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
      }, 4000);
      return 'gespeichert';
    });
  }

  /* --- Fotos: verkleinern und als JPEG ablegen ----------------------------
   * Der PDF-Writer bettet JPEG direkt ein, deshalb wird hier immer nach
   * JPEG konvertiert - unabhängig davon, was die Kamera liefert (auch HEIC,
   * sofern der Browser es dekodieren kann).
   * ---------------------------------------------------------------------- */
  function fotoVerarbeiten(datei, maxKante, qualitaet) {
    maxKante = maxKante || 1280;
    qualitaet = qualitaet || 0.72;
    return new Promise(function (resolve, reject) {
      if (!datei) return reject(new Error('Keine Datei übergeben.'));
      if (datei.size > 40 * 1024 * 1024) return reject(new Error('Die Bilddatei ist zu groß (über 40 MB).'));
      var leser = new FileReader();
      leser.onerror = function () { reject(new Error('Die Datei konnte nicht gelesen werden.')); };
      leser.onload = function () {
        var bild = new Image();
        bild.onerror = function () {
          reject(new Error('Das Bildformat wird von diesem Browser nicht unterstützt. Bitte als JPEG aufnehmen.'));
        };
        bild.onload = function () {
          var b = bild.naturalWidth, h = bild.naturalHeight;
          if (!b || !h) return reject(new Error('Das Bild hat keine lesbaren Abmessungen.'));
          var faktor = Math.min(1, maxKante / Math.max(b, h));
          var zb = Math.max(1, Math.round(b * faktor)), zh = Math.max(1, Math.round(h * faktor));
          var c = document.createElement('canvas');
          c.width = zb; c.height = zh;
          var g = c.getContext('2d');
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, zb, zh);   /* Transparenz -> weiß */
          g.drawImage(bild, 0, 0, zb, zh);
          var dataUrl;
          try { dataUrl = c.toDataURL('image/jpeg', qualitaet); }
          catch (e) { return reject(new Error('Das Bild konnte nicht umgewandelt werden.')); }
          resolve({
            id: global.Model.uid('foto'),
            dataUrl: dataUrl,
            breite: zb, hoehe: zh,
            groesse: Math.round(dataUrl.length * 0.75),
            beschriftung: '',
            erstellt: new Date().toISOString()
          });
        };
        bild.src = leser.result;
      };
      leser.readAsDataURL(datei);
    });
  }

  /* --- Speicherbedarf abschätzen ------------------------------------------- */
  function speicherInfo() {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (e) {
        return { benutzt: e.usage || 0, verfuegbar: e.quota || 0, unterstuetzt: true };
      }).catch(function () { return { unterstuetzt: false }; });
    }
    return Promise.resolve({ unterstuetzt: false });
  }

  function projektGroesse(projekt) {
    try { return JSON.stringify(projekt).length; } catch (e) { return 0; }
  }

  global.Store = {
    oeffnen: oeffnen,
    alleProjekte: alleProjekte,
    projektLaden: projektLaden,
    projektSpeichern: projektSpeichern,
    projektLoeschen: projektLoeschen,
    einstellungenLaden: einstellungenLaden,
    einstellungenSpeichern: einstellungenSpeichern,
    EINSTELLUNGEN_STANDARD: EINSTELLUNGEN_STANDARD,
    exportDaten: exportDaten,
    exportDateiname: exportDateiname,
    importParsen: importParsen,
    projektKlonen: projektKlonen,
    dateiHerunterladen: dateiHerunterladen,
    ausgabeVorbereiten: ausgabeVorbereiten,
    fotoVerarbeiten: fotoVerarbeiten,
    speicherInfo: speicherInfo,
    projektGroesse: projektGroesse,
    nutztFallback: function () { return nutztFallback; }
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Store; }
})(typeof window !== 'undefined' ? window : globalThis);
