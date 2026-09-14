#!/usr/bin/env node
/* Baut aus dem Quellverzeichnis eine einzige, vollständig eigenständige
 * HTML-Datei. Diese lässt sich auf iPad oder Rechner ablegen und ohne
 * Server und ohne Internetverbindung per Doppelklick öffnen. */
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'src');
const ZIEL = path.join(WURZEL, 'dist');

function lies(p) { return fs.readFileSync(path.join(QUELLE, p), 'utf8'); }

function bauen() {
  let html = lies('index.html');
  const css = lies('css/app.css');
  const icon = lies('icon.svg');

  /* Reihenfolge wie in index.html - die Module bauen aufeinander auf */
  const skripte = [
    'js/catalog.js', 'js/model.js', 'js/pdf.js', 'js/reports.js', 'js/store.js', 'js/verlauf.js', 'js/freigabe.js', 'js/pipedrive.js',
    'js/app.js', 'js/views-projekt.js', 'js/views-tueren.js', 'js/views-plan.js', 'js/main.js'
  ];

  /* Stylesheet einbetten */
  html = html.replace(/<link rel="stylesheet" href="css\/app\.css">/,
    '<style>\n' + css + '\n</style>');

  /* Manifest und Service Worker entfallen in der Einzeldatei */
  html = html.replace(/<link rel="manifest"[^>]*>\s*/g, '');
  html = html.replace(/<script>\s*\/\* Offline-Bereitstellung[\s\S]*?<\/script>/, '');

  /* Symbole als Daten-URL einbetten, damit keine Datei danebenliegen muss */
  const iconUrl = 'data:image/svg+xml;base64,' + Buffer.from(icon, 'utf8').toString('base64');
  html = html.replace(/href="icon\.svg"/g, 'href="' + iconUrl + '"');
  ['icon-180.png', 'icon-192.png', 'icon-512.png'].forEach(datei => {
    const pfad = path.join(QUELLE, datei);
    if (!fs.existsSync(pfad)) return;
    const url = 'data:image/png;base64,' + fs.readFileSync(pfad).toString('base64');
    html = html.replace(new RegExp('href="' + datei.replace('.', '\\.') + '"', 'g'), 'href="' + url + '"');
  });

  /* Skripte einbetten */
  let gebuendelt = '';
  skripte.forEach(datei => {
    const quelltext = lies(datei);
    /* </script> im Quelltext würde das umschließende Tag vorzeitig beenden */
    gebuendelt += '\n/* ==== ' + datei + ' ==== */\n' +
      quelltext.replace(/<\/script>/gi, '<\\/script>') + '\n';
  });
  skripte.forEach(datei => {
    html = html.replace(new RegExp('<script src="' + datei.replace(/\//g, '\\/') + '"></script>\\s*'), '');
  });
  html = html.replace('</body>', '<script>' + gebuendelt + '</script>\n</body>');

  /* Die Kundenfreigabe braucht eine Web-Adresse; in der Einzeldatei bleibt
     sie bedienbar, der erzeugte Link funktioniert aber nur mit einer solchen.
     Darauf weist die Anwendung im Dialog selbst hin. */

  /* Hinweis für Anwender, die die Datei lokal öffnen */
  html = html.replace('</head>',
    '<!-- Eigenständige Fassung: enthält Programm und Gestaltung vollständig.\n' +
    '     Kann lokal gespeichert und ohne Internetverbindung geöffnet werden.\n' +
    '     Erzeugt am ' + new Date().toISOString().slice(0, 10) + ' -->\n</head>');

  if (!fs.existsSync(ZIEL)) fs.mkdirSync(ZIEL, { recursive: true });
  const zielDatei = path.join(ZIEL, 'aufmass-tool.html');
  fs.writeFileSync(zielDatei, html, 'utf8');

  /* Prüfen, dass die Datei nichts aus dem Netz nachlädt.
   *
   * Gesucht wird nach Stellen, an denen der Browser beim Öffnen etwas holen
   * würde: script/link/img/iframe-Quellen, CSS-url() und @import. Adressen,
   * die erst zur Laufzeit gebraucht werden - der Aufruf der Pipedrive-
   * Schnittstelle oder ein Link, den der Anwender selbst antippt - zählen
   * nicht dazu: ohne Internet bleibt die Datei trotzdem voll benutzbar. */
  const reste = [];
  const src = html.match(/<script[^>]+src=/gi);
  if (src) reste.push(src.length + '× <script src>');
  const link = html.match(/<link[^>]+href="(?!data:)[^"]+"/gi);
  if (link) reste.push(link.length + '× externer <link>');
  const ladend = (html.match(
    /(?:<(?:img|iframe|video|audio|source|embed)[^>]+(?:src|srcset)\s*=\s*["']|url\(\s*["']?|@import\s+["'])https?:\/\//gi
  ) || []).filter(t => !/www\.w3\.org/.test(t));
  if (ladend.length) reste.push(ladend.length + '× nachgeladene Adresse');

  const groesse = fs.statSync(zielDatei).size;
  console.log('Einzeldatei erzeugt: dist/aufmass-tool.html  (' + Math.round(groesse / 1024) + ' KB)');
  if (reste.length) {
    console.log('WARNUNG - externe Verweise verblieben: ' + reste.join(', '));
    process.exitCode = 1;
  } else {
    console.log('Keine externen Verweise: vollständig eigenständig und offline lauffähig.');
  }
  return zielDatei;
}

if (require.main === module) bauen();
module.exports = { bauen };
