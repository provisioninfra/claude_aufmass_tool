#!/usr/bin/env node
/* Führt alle Testreihen nacheinander aus. */
const { execFileSync } = require('child_process');
const reihen = [
  ['PDF-Writer',      'test-pdf.js'],
  ['Zusammenführen',  'test-zusammenfuehren.js'],
  ['Entdoppelung',    'test-entdoppelung.js'],
  ['Exportlisten',    'test-exportlisten.js'],
  ['Testfoto',        'make-jpeg.js'],
  ['Bedienung',       'test-bedienung.js'],
  ['Verlauf',         'test-verlauf.js'],
  ['Kundenfreigabe',  'test-freigabe.js'],
  ['Freigabe: Inhaber', 'test-freigabe-personen.js'],
  ['Pipedrive',       'test-pipedrive.js'],
  ['Robustheit',      'test-robustheit.js'],
  ['Report-Erzeugung','test-reports.js'],
  ['Browser (E2E)',   'test-e2e.js'],
  ['Bereich & Gruppen','test-bereich-gruppen.js'],
  ['Stiftbedienung',  'test-stift.js'],
  ['Erscheinungsbild','test-erscheinungsbild.js'],
  ['Einzeldatei',     'test-standalone.js'],
  ['Ausgabeweg',      'test-downloads.js'],
  ['Fassungen',       'test-fassungen.js'],
  ['Abgleich (2 Geräte)', 'test-abgleich.js'],
  ['Abgleich-Oberfläche', 'test-abgleich-oberflaeche.js'],
  ['Pipedrive über Server', 'test-pipedrive-server.js'],
  ['Freigabe über Server', 'test-freigabe-server.js'],
  ['Angriffsproben',   'test-angriffe.js'],
  ['Gleichlauf PHP↔JS','test-gleichlauf.js'],
  ['Offline-Betrieb', 'test-offline-pwa.js'],
  ['Aktualisierung',  'test-aktualisierung.js'],
  ['Alle Öffnungswege','test-ueberall.js']
];
/* Der Serverteil ist in PHP geschrieben und wird mit PHP geprüft. Fehlt
   PHP auf diesem Rechner, werden diese Reihen gemeldet und übersprungen -
   sie dürfen den Rest nicht blockieren. */
const phpReihen = [
  ['Google-Ausweis (PHP)', '../server/tests/test-jwt.php'],
  ['Server-Logik (PHP)',   '../server/tests/test-server.php'],
  ['Pipedrive-Server (PHP)', '../server/tests/test-pipedrive.php'],
  ['Freigaben-Server (PHP)', '../server/tests/test-freigaben.php']
];
let phpDa = true;
try { execFileSync('php', ['--version'], { stdio: 'ignore' }); } catch (e) { phpDa = false; }

let fehlgeschlagen = [];
reihen.forEach(([name, datei]) => {
  process.stdout.write('\n### ' + name + '\n');
  try { execFileSync(process.execPath, [__dirname + '/' + datei], { stdio: 'inherit' }); }
  catch (e) { fehlgeschlagen.push(name); }
});
phpReihen.forEach(([name, datei]) => {
  process.stdout.write('\n### ' + name + '\n');
  if (!phpDa) { console.log('  übersprungen: PHP ist auf diesem Rechner nicht vorhanden.'); return; }
  try { execFileSync('php', [__dirname + '/' + datei], { stdio: 'inherit' }); }
  catch (e) { fehlgeschlagen.push(name); }
});
console.log('\n' + '='.repeat(58));
if (fehlgeschlagen.length) {
  console.log('FEHLGESCHLAGEN: ' + fehlgeschlagen.join(', '));
  process.exit(1);
}
console.log('Alle Testreihen bestanden.');
