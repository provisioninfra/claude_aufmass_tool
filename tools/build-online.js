#!/usr/bin/env node
/* Baut die Fassung für den Webserver: dist/aufmasstool/
 *
 * Diese Fassung kennt - als einzige - den Abgleich mit der gemeinsamen
 * Ablage. Sie wird unter www.<domäne>/aufmasstool/ abgelegt und läuft
 * dank Service Worker auch dort ohne Netz weiter.
 *
 * Die Einzeldatei (tools/build.js) bleibt davon unberührt: Sie ist und
 * bleibt die Fassung für den Doppelklick ohne Server. */
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'src');
const ZIEL = path.join(WURZEL, 'dist', 'aufmasstool');

/* Genau die Dateien, die die Seiten auch anfordern. */
const DATEIEN = [
  'index.html', 'freigabe.html', 'manifest.webmanifest', 'sw.js',
  'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'css/app.css',
  'js/catalog.js', 'js/model.js', 'js/pdf.js', 'js/reports.js', 'js/store.js',
  'js/verlauf.js', 'js/freigabe.js', 'js/pipedrive.js',
  'js/zusammenfuehren.js', 'js/abgleich.js',
  'js/app.js', 'js/views-projekt.js', 'js/views-tueren.js', 'js/views-personen.js', 'js/views-plan.js',
  'js/abgleich-ui.js', 'js/main.js', 'js/aktualisierung.js'
];

function bauen() {
  fs.rmSync(ZIEL, { recursive: true, force: true });
  fs.mkdirSync(path.join(ZIEL, 'js'), { recursive: true });
  fs.mkdirSync(path.join(ZIEL, 'css'), { recursive: true });

  const fehlend = [];
  DATEIEN.forEach(rel => {
    const von = path.join(QUELLE, rel);
    if (!fs.existsSync(von)) { fehlend.push(rel); return; }
    fs.copyFileSync(von, path.join(ZIEL, rel));
  });
  if (fehlend.length) {
    console.error('FEHLER - diese Dateien fehlen in src/: ' + fehlend.join(', '));
    process.exitCode = 1;
    return;
  }

  /* Gegenprobe: Jede Datei, die index.html anfordert, muss auch dort liegen.
     Ein vergessenes Skript fiele sonst erst beim Kunden auf. */
  const html = fs.readFileSync(path.join(ZIEL, 'index.html'), 'utf8');
  const verlangt = [];
  let t;
  const muster = /<(?:script|link)[^>]+(?:src|href)="(?!https?:|data:)([^"]+)"/gi;
  while ((t = muster.exec(html)) !== null) { verlangt.push(t[1].replace(/^\.\//, '')); }
  const nichtDa = verlangt.filter(d => !fs.existsSync(path.join(ZIEL, d)));
  if (nichtDa.length) {
    console.error('FEHLER - index.html fordert Dateien an, die nicht mitgeliefert werden: ' + nichtDa.join(', '));
    process.exitCode = 1;
    return;
  }

  /* Und umgekehrt: Was der Service Worker ablegen will, muss vorhanden sein. */
  const sw = fs.readFileSync(path.join(ZIEL, 'sw.js'), 'utf8');
  const liste = (/DATEIEN\s*=\s*\[([\s\S]*?)\]/.exec(sw) || [, ''])[1];
  const swDateien = (liste.match(/'([^']+)'/g) || []).map(x => x.slice(1, -1).replace(/^\.\//, ''))
    .filter(x => x && x !== '');
  const swFehlt = swDateien.filter(d => !fs.existsSync(path.join(ZIEL, d)));
  if (swFehlt.length) {
    console.error('FEHLER - der Service Worker will Dateien ablegen, die es nicht gibt: ' + swFehlt.join(', '));
    process.exitCode = 1;
    return;
  }

  /* Hinweis für den, der die Dateien hochlädt */
  fs.writeFileSync(path.join(ZIEL, 'LIESMICH.txt'),
    'Aufmaß-Werkzeug — Fassung für den Webserver\n' +
    '==========================================\n\n' +
    'Diesen gesamten Ordner als "aufmasstool" in das Wurzelverzeichnis der\n' +
    'Website legen. Danach ist das Werkzeug erreichbar unter:\n\n' +
    '    https://<ihre-domäne>/aufmasstool/\n\n' +
    'Voraussetzung ist das WordPress-Plugin "Aufmaß-Abgleich" aus dem\n' +
    'Ordner server/aufmass-sync (siehe server/EINRICHTUNG.md).\n\n' +
    'Erzeugt am ' + new Date().toISOString().slice(0, 10) + '\n', 'utf8');

  let bytes = 0;
  DATEIEN.forEach(rel => { bytes += fs.statSync(path.join(ZIEL, rel)).size; });
  console.log('Fassung für den Webserver: dist/aufmasstool/  ('
    + DATEIEN.length + ' Dateien, ' + Math.round(bytes / 1024) + ' KB)');
  console.log('Alle angeforderten Dateien sind vorhanden.');
}

bauen();
