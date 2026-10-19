/* Service Worker: legt die Anwendung im Gerätespeicher ab, damit sie auch
 * ohne Netzverbindung startet (z. B. im Keller oder in der Tiefgarage).
 * Wirkt nur, wenn die Anwendung über http(s) ausgeliefert wird.
 *
 * Die Fassung hier muss mit FASSUNG in js/app.js übereinstimmen (der
 * Prüflauf achtet darauf). Jede neue Fassung bekommt damit eine neue
 * Ablage, und alle Geräte holen beim nächsten Start den neuen Stand. */
var FASSUNG = '1.3.1';
var CACHE = 'aufmass-tool-' + FASSUNG;
var DATEIEN = [
  './', './index.html', './freigabe.html', './css/app.css', './manifest.webmanifest',
  './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png',
  './js/catalog.js', './js/model.js', './js/pdf.js', './js/reports.js',
  './js/store.js', './js/verlauf.js', './js/freigabe.js', './js/pipedrive.js', './js/diktat.js', './js/app.js', './js/views-projekt.js', './js/views-tueren.js',
  './js/views-personen.js', './js/views-plan.js', './js/main.js',
  /* Der Abgleich gehört mit in die Ablage: Sonst stünde das Werkzeug
     beim Start ohne Netz ohne diese Dateien da. */
  './js/zusammenfuehren.js', './js/abgleich.js', './js/abgleich-ui.js',
  './js/aktualisierung.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      /* Am Browser-Cache vorbei (cache: 'reload'): Die Dateinamen bleiben
         von Fassung zu Fassung gleich, und Webserver geben Skripten gern
         lange Haltbarkeiten mit. Ohne diese Anweisung landete beim
         Einspielen einer neuen Fassung die ALTE Datei aus dem Browser-
         Cache in der NEUEN Ablage - und das Gerät blieb auf dem alten
         Stand, obwohl der Server längst den neuen hatte. */
      .then(function (c) {
        return c.addAll(DATEIEN.map(function (d) { return new Request(d, { cache: 'reload' }); }));
      })
      .then(function () { return self.skipWaiting(); })
      /* Kein catch: Schlägt die Installation fehl (eine Datei fehlt, das
         Netz bricht ab), bleibt der alte Worker samt seiner Ablage in
         Kraft und der Versuch wird beim nächsten Laden wiederholt. Würde
         der Fehler verschluckt, gälte die Installation als gelungen, die
         Aktivierung räumte die alte Ablage weg - und zurück bliebe eine
         leere, mit der das Werkzeug ohne Netz nicht mehr startet. */
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (namen) {
      return Promise.all(namen.filter(function (n) { return n !== CACHE; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Zuerst der Zwischenspeicher (die Anwendung ändert sich selten),
 * im Hintergrund wird beim Server nachgefragt, ob es Neueres gibt. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  /* Der Abgleich darf NIEMALS aus dem Zwischenspeicher bedient werden.
   * Sonst bekäme das Gerät die Projektliste von gestern und hielte sie
   * für den aktuellen Stand - der Abgleich wäre still wirkungslos.
   * Die Anfragen gehen deshalb unverändert ans Netz. */
  if (url.pathname.indexOf('/wp-json/') !== -1) return;
  e.respondWith(
    caches.match(e.request).then(function (treffer) {
      /* no-cache: beim Server rückfragen statt dem Browser-Cache glauben.
         Unverändertes kostet so nur eine kurze Rückfrage, Geändertes
         kommt wirklich an. */
      var netz = fetch(new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' })).then(function (antwort) {
        if (antwort && antwort.status === 200) {
          var kopie = antwort.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, kopie); });
        }
        return antwort;
      }).catch(function () { return treffer; });
      /* Weder Ablage noch Netz: ein echter Netzfehler statt „undefined“ */
      return treffer || netz.then(function (a) { return a || Response.error(); });
    })
  );
});
