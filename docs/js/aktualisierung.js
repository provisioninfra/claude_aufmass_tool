/* =============================================================================
 * aktualisierung.js — Eine neue Fassung erkennen und sauber übernehmen
 *
 * Nur in der Fassung für den Webserver. Der Service Worker (sw.js) hält das
 * Werkzeug für den Betrieb ohne Netz vor und holt eine neue Fassung im
 * Hintergrund. Sobald die neue Fassung die Seite übernommen hat
 * (controllerchange), sagt dieses Modul der Oberfläche Bescheid: Auf der
 * Projektübersicht startet sie sofort neu, bei geöffnetem Aufmaß zeigt sie
 * einen Hinweis mit Knopf - der Neustart speichert und schließt zuerst.
 *
 * Die Einzeldatei (Doppelklick, ohne Server) bekommt diese Datei nicht.
 * ========================================================================== */
(function (global) {
  'use strict';

  var A = global.AppKern;
  var sw = global.navigator && global.navigator.serviceWorker;
  var imNetz = /^https?:/.test(global.location.protocol);

  /* Hatte die Seite beim Laden schon einen Service Worker? Dann ist ein
     späterer Wechsel eine neue Fassung. Beim allerersten Besuch ist der
     Wechsel nur die Ersteinrichtung - da gibt es nichts zu melden. */
  var hatteSteuerung = !!(sw && sw.controller);

  function neueFassung() {
    if (global.App && typeof global.App.neueFassung === 'function') { global.App.neueFassung(); return; }
    global.location.reload();
  }

  /** Speichern, schließen, neu laden - in dieser Reihenfolge. */
  function neuStarten() {
    var schliessen = (A && typeof A.projektSchliessen === 'function') ? A.projektSchliessen() : Promise.resolve();
    return schliessen.catch(function () {}).then(function () { global.location.reload(); });
  }

  /** Von Hand nachsehen, ob der Server eine neue Fassung hat. */
  function pruefen() {
    if (!sw || !imNetz) { return Promise.resolve(false); }
    return sw.getRegistration().then(function (r) {
      if (!r) { return false; }
      return r.update().then(function () { return true; });
    }).catch(function () { return false; });
  }

  /** Läuft das Werkzeug aus der Offline-Ablage? */
  function eingerichtet() { return !!(sw && sw.controller); }

  if (sw && imNetz) {
    sw.addEventListener('controllerchange', function () {
      if (!hatteSteuerung) { hatteSteuerung = true; return; }
      neueFassung();
    });
    global.addEventListener('load', function () {
      sw.register('sw.js').catch(function () { /* ohne Offline-Ablage weiterarbeiten */ });
    });
  }

  global.Aktualisierung = { neuStarten: neuStarten, pruefen: pruefen, eingerichtet: eingerichtet };
})(window);
