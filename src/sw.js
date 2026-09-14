/* Service Worker: legt die Anwendung im Gerätespeicher ab, damit sie auch
 * ohne Netzverbindung startet (z. B. im Keller oder in der Tiefgarage).
 * Wirkt nur, wenn die Anwendung über http(s) ausgeliefert wird. */
var CACHE = 'aufmass-tool-v3';
var DATEIEN = [
  './', './index.html', './freigabe.html', './css/app.css', './manifest.webmanifest',
  './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png',
  './js/catalog.js', './js/model.js', './js/pdf.js', './js/reports.js',
  './js/store.js', './js/verlauf.js', './js/freigabe.js', './js/app.js', './js/views-projekt.js', './js/views-tueren.js',
  './js/views-plan.js', './js/main.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(DATEIEN); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* einzelne Datei nicht erreichbar: Start trotzdem zulassen */ })
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
 * im Hintergrund wird auf eine neuere Fassung geprüft. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(function (treffer) {
      var netz = fetch(e.request).then(function (antwort) {
        if (antwort && antwort.status === 200) {
          var kopie = antwort.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, kopie); });
        }
        return antwort;
      }).catch(function () { return treffer; });
      return treffer || netz;
    })
  );
});
