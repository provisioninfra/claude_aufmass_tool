#!/usr/bin/env node
/* Baut das Paket „Anbindung“: MCP-Server für Claude Code, Kommandozeile und
 * Bibliothek samt der benötigten Bausteine des Werkzeugs, als Ordner
 * dist/aufmass-anbindung/ und als dist/aufmass-anbindung.zip. Die ZIP wird
 * zusätzlich in die Webserver-Fassung gelegt, damit sie im Werkzeug unter
 * Einstellungen heruntergeladen werden kann. */
const fs = require('fs');
const path = require('path');
const { packen } = require('./zip.js');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'tools', 'mcp');
const ZIEL = path.join(WURZEL, 'dist', 'aufmass-anbindung');
const ZIP = path.join(WURZEL, 'dist', 'aufmass-anbindung.zip');
const ONLINE = path.join(WURZEL, 'dist', 'aufmasstool');

const PROGRAMME = ['aufmass-mcp.js', 'aufmass-client.js', 'aufmass-cli.js', 'README.md'];
const BAUSTEINE = ['catalog.js', 'model.js', 'pdf.js', 'reports.js', 'zusammenfuehren.js'];

fs.rmSync(ZIEL, { recursive: true, force: true });
fs.mkdirSync(path.join(ZIEL, 'lib'), { recursive: true });
PROGRAMME.forEach(d => fs.copyFileSync(path.join(QUELLE, d), path.join(ZIEL, d)));
BAUSTEINE.forEach(d => fs.copyFileSync(path.join(WURZEL, 'src', 'js', d), path.join(ZIEL, 'lib', d)));

const fassung = require(path.join(WURZEL, 'package.json')).version;
const clientFassung = (/FASSUNG = '([^']+)'/.exec(fs.readFileSync(path.join(QUELLE, 'aufmass-client.js'), 'utf8')) || [])[1];
if (clientFassung !== fassung) {
  console.error('FEHLER - aufmass-client.js nennt Fassung ' + clientFassung + ', package.json ' + fassung + '.');
  process.exit(1);
}
fs.writeFileSync(path.join(ZIEL, 'package.json'), JSON.stringify({
  name: 'aufmass-anbindung', version: fassung, private: true, description: 'Anbindung des Aufmaß-Werkzeugs für Claude Code (MCP), Kommandozeile und eigene Programme',
  bin: { 'aufmass-mcp': './aufmass-mcp.js', 'aufmass-cli': './aufmass-cli.js' }, engines: { node: '>=18' }, license: 'UNLICENSED'
}, null, 2) + '\n');

/* Gegenprobe: Das Paket muss aus sich heraus laden - mit lib/, nicht mit src/. */
const geladen = require(path.join(ZIEL, 'aufmass-client.js'));
if (geladen.LIB !== path.join(ZIEL, 'lib')) {
  console.error('FEHLER - das Paket greift nicht auf sein eigenes lib/ zu: ' + geladen.LIB);
  process.exit(1);
}
const mcp = require(path.join(ZIEL, 'aufmass-mcp.js'));
if (!mcp.WERKZEUGE || mcp.WERKZEUGE.length < 10) {
  console.error('FEHLER - der MCP-Server im Paket meldet keine Werkzeuge.');
  process.exit(1);
}

const zip = packen(ZIEL, ZIP);
fs.copyFileSync(ZIP, path.join(ONLINE, 'aufmass-anbindung.zip'));
console.log('Anbindung für Claude Code: dist/aufmass-anbindung/ + dist/aufmass-anbindung.zip  ('
  + zip.dateien + ' Dateien, ' + Math.round(zip.groesse / 1024) + ' KB, ' + mcp.WERKZEUGE.length + ' Werkzeuge) - auch in dist/aufmasstool/');
