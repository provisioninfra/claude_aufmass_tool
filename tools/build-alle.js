#!/usr/bin/env node
/* Baut alle vier Ausgabewege in einem Durchgang.
 *
 * Es gibt vier Fassungen, und sie sind leicht auseinanderzuhalten:
 *   dist/aufmass-tool.html   Einzeldatei für den Doppelklick, ohne Server
 *   dist/aufmasstool/        für den eigenen Webserver, MIT Abgleich
 *   dist/artifact/           gehostete Vorschau, ohne Abgleich
 *   docs/                    GitHub Pages, Spiegelung von src/
 *
 * Wer eine davon von Hand vergisst, merkt es erst beim Kunden. Darum
 * dieser eine Befehl. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'src');
const DOCS = path.join(WURZEL, 'docs');

function lauf(datei) {
  execFileSync(process.execPath, [path.join(__dirname, datei)], { stdio: 'inherit' });
}

/* 0: Die Prüfwerte der eingebetteten Skripte in der Content-Security-Policy
      nachziehen - sonst sperrte die Richtlinie ein eben geändertes Skript aus. */
execFileSync(process.execPath, [path.join(__dirname, 'csp.js'), '--schreiben',
  path.join(QUELLE, 'index.html'), path.join(QUELLE, 'freigabe.html')], { stdio: 'inherit' });

/* 1 + 2 + 3: die erzeugten Fassungen */
lauf('build.js');
lauf('build-online.js');
lauf('build-artifact.js');

/* 4: docs/ ist eine vollständige Spiegelung von src/ plus der Einzeldatei.
      Vollständig heißt vollständig - ein fehlender Service Worker fiele
      sonst nur dadurch auf, dass der Offline-Betrieb still ausbleibt. */
function spiegeln(von, nach) {
  fs.mkdirSync(nach, { recursive: true });
  fs.readdirSync(von, { withFileTypes: true }).forEach(e => {
    const q = path.join(von, e.name), z = path.join(nach, e.name);
    if (e.isDirectory()) { spiegeln(q, z); } else { fs.copyFileSync(q, z); }
  });
}
spiegeln(QUELLE, DOCS);
fs.copyFileSync(path.join(WURZEL, 'dist', 'aufmass-tool.html'),
                path.join(DOCS, 'aufmass-tool-einzeldatei.html'));
if (!fs.existsSync(path.join(DOCS, '.nojekyll'))) {
  fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');
}
/* 5: Das Plugin als ZIP - so lässt es sich in WordPress unter
      "Plugins -> Installieren -> Plugin hochladen" einspielen, ohne dass
      jemand ein FTP-Programm bedienen muss. */
const { packen } = require('./zip.js');
const zip = packen(path.join(WURZEL, 'server', 'aufmass-sync'),
                   path.join(WURZEL, 'dist', 'aufmass-abgleich-plugin.zip'));
console.log('Plugin zum Hochladen: dist/aufmass-abgleich-plugin.zip  ('
  + zip.dateien + ' Dateien, ' + Math.round(zip.groesse / 1024) + ' KB)');

/* 6: Die Webserver-Fassung ebenfalls als ZIP - ein Ordner mit 25 Dateien
      lässt sich so in einem Stück weitergeben und per SFTP entpacken. */
const zipOnline = packen(path.join(WURZEL, 'dist', 'aufmasstool'),
                         path.join(WURZEL, 'dist', 'aufmasstool.zip'));
console.log('Webserver-Fassung als ZIP: dist/aufmasstool.zip  ('
  + zipOnline.dateien + ' Dateien, ' + Math.round(zipOnline.groesse / 1024) + ' KB)');

const zahl = (function zaehlen(ordner) {
  return fs.readdirSync(ordner, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? zaehlen(path.join(ordner, e.name)) : 1), 0);
})(DOCS);
console.log('GitHub Pages: docs/  (' + zahl + ' Dateien, Spiegelung von src/)');
console.log('\nAlle vier Fassungen sind erzeugt.');
