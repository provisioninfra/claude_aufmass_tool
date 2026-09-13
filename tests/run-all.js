#!/usr/bin/env node
/* Führt alle Testreihen nacheinander aus. */
const { execFileSync } = require('child_process');
const reihen = [
  ['PDF-Writer',      'test-pdf.js'],
  ['Entdoppelung',    'test-entdoppelung.js'],
  ['Robustheit',      'test-robustheit.js'],
  ['Report-Erzeugung','test-reports.js'],
  ['Browser (E2E)',   'test-e2e.js'],
  ['Einzeldatei',     'test-standalone.js'],
  ['Ausgabeweg',      'test-downloads.js'],
  ['Offline-Betrieb', 'test-offline-pwa.js'],
  ['Alle Öffnungswege','test-ueberall.js']
];
let fehlgeschlagen = [];
reihen.forEach(([name, datei]) => {
  process.stdout.write('\n### ' + name + '\n');
  try { execFileSync(process.execPath, [__dirname + '/' + datei], { stdio: 'inherit' }); }
  catch (e) { fehlgeschlagen.push(name); }
});
console.log('\n' + '='.repeat(58));
if (fehlgeschlagen.length) {
  console.log('FEHLGESCHLAGEN: ' + fehlgeschlagen.join(', '));
  process.exit(1);
}
console.log('Alle Testreihen bestanden.');
