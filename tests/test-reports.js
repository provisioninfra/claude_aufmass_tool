/* Erzeugt alle PDF-Ausgaben aus dem Testprojekt und legt sie in tests/out ab. */
const fs = require('fs');
require('../src/js/catalog.js');
require('../src/js/model.js');
require('../src/js/pdf.js');
const Reports = require('../src/js/reports.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');

const out = __dirname + '/out';
const fotoDataUrl = fs.existsSync(out + '/foto.txt') ? fs.readFileSync(out + '/foto.txt', 'utf8') : null;
const p = baueTestprojekt({ fotoDataUrl });
/* Logo simulieren (gleiches JPEG) */
const eins = Object.assign({}, einstellungen, { logoDataUrl: fotoDataUrl });

const ausgaben = [
  ['tuerliste-kompakt.pdf', () => Reports.tuerliste(p, eins, { modus: 'kompakt' })],
  ['tuerliste-detail.pdf',  () => Reports.tuerliste(p, eins, { modus: 'detail', mitFotos: true })],
  ['schliessplan.pdf',      () => Reports.schliessplan(p, eins)],
  ['materialliste.pdf',     () => Reports.materialliste(p, eins)],
  ['pruefprotokoll.pdf',    () => Reports.pruefprotokoll(p, eins)],
  /* Randfälle */
  ['leer-tuerliste.pdf',    () => Reports.tuerliste(require('../src/js/model.js').neuesProjekt('Leer'), {}, {})],
  ['leer-schliessplan.pdf', () => Reports.schliessplan(require('../src/js/model.js').neuesProjekt('Leer'), {}, {})]
];

let fehler = 0;
ausgaben.forEach(([name, fn]) => {
  try {
    const t0 = Date.now();
    const doc = fn();
    const bytes = doc.build();
    fs.writeFileSync(out + '/' + name, Buffer.from(bytes));
    console.log(`  ${name.padEnd(26)} ${String(doc.seitenAnzahl()).padStart(2)} Seiten  ${String(Math.round(bytes.length/1024)).padStart(4)} KB  ${Date.now()-t0} ms`);
  } catch (e) {
    fehler++;
    console.log(`  FEHLER bei ${name}: ${e.message}\n${e.stack.split('\n').slice(1,4).join('\n')}`);
  }
});

/* Viele Schließungen -> Spaltenblock-Umbruch prüfen */
const gross = baueTestprojekt();
const M = require('../src/js/model.js');
for (let i = 0; i < 48; i++) {
  gross.schliessungen.push(M.neueSchliessung({ kuerzel: 'MP-' + (i+20), bezeichnung: 'Mietpartei Nr. ' + (i+20), typ: 'ez', anzahlMedien: 3, sort: 100+i }));
}
for (let i = 0; i < 60; i++) {
  gross.tueren.push(M.neueTuer({ nummer: 'X-' + i, bezeichnung: 'Zusatztür Nummer ' + i + ' Langer Raumname Verwaltung', systemId: 'evva-4ks', zylinderArt: 'Doppelzylinder', masseAussen:'30', masseInnen:'35', strukturId: gross.standorte[3].id }));
}
try {
  const d = Reports.schliessplan(gross, eins);
  fs.writeFileSync(out + '/schliessplan-gross.pdf', Buffer.from(d.build()));
  console.log(`  schliessplan-gross.pdf     ${d.seitenAnzahl()} Seiten (60 Schließungen x 72 Türen)`);
  const d2 = Reports.tuerliste(gross, eins, { modus: 'kompakt' });
  fs.writeFileSync(out + '/tuerliste-gross.pdf', Buffer.from(d2.build()));
  console.log(`  tuerliste-gross.pdf        ${d2.seitenAnzahl()} Seiten`);
} catch (e) { fehler++; console.log('  FEHLER gross:', e.message, e.stack.split('\n')[1]); }

process.exit(fehler ? 1 : 0);
