/* Grenzfälle und fehlerhafte Eingaben: die Anwendung darf nirgends abstürzen. */
require('../src/js/catalog.js');
const M = require('../src/js/model.js');
const PDF = require('../src/js/pdf.js');
const Reports = require('../src/js/reports.js');
const Store = require('../src/js/store.js');
const K = require('../src/js/catalog.js');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? ' -> ' + i : '')); } }
function ohneAbsturz(t, fn) {
  try { const r = fn(); pruefe(true, t); return r; }
  catch (e) { pruefe(false, t, e.message + ' | ' + (e.stack||'').split('\n')[1]); return null; }
}

console.log('\n== Robustheit ==');

// --- Leeres und minimales Projekt ---
ohneAbsturz('PDF aus komplett leerem Projekt', () => Reports.tuerliste(M.neuesProjekt(''), {}, {}).build());
ohneAbsturz('Schließplan ohne Schließungen', () => Reports.schliessplan(M.neuesProjekt(''), {}, {}).build());
ohneAbsturz('Materialliste ohne Türen', () => Reports.materialliste(M.neuesProjekt(''), {}).build());
ohneAbsturz('Prüfprotokoll bei leerem Projekt', () => Reports.pruefprotokoll(M.neuesProjekt(''), {}).build());

// --- Extreme und ungültige Werte ---
const p = M.neuesProjekt('Grenzfälle');
p.kunde = 'A'.repeat(400);
p.objekt = 'Ω≈ç√∫˜µ≤≥÷ 日本語 🔑 Emoji-Test';
p.bemerkung = 'Zeile1\nZeile2\r\nZeile3\t\tTabs';
const st = M.neuerStrukturknoten('standort', 'X'.repeat(250));
p.standorte.push(st);
p.tueren.push(M.neueTuer({
  nummer: '', bezeichnung: '', strukturId: st.id, anzahl: 'keine Zahl',
  masseAussen: -5, masseInnen: 'abc', zylinderBauform: 'Z'.repeat(200),
  notiz: 'N'.repeat(3000), systemId: 'gibt-es-nicht',
  zylinderAusfuehrung: 'kein Array', tueranforderungen: null, komponenten: undefined, fotos: 'kaputt'
}));
p.tueren.push(M.neueTuer({ nummer: 'ok-1', bezeichnung: 'Normale Tür', strukturId: st.id,
  systemId: 'evva-4ks', zylinderBauform: 'Doppelzylinder', masseAussen: '30', masseInnen: '35' }));
p.schliessungen.push(M.neueSchliessung({ kuerzel: '', bezeichnung: '', anzahlMedien: 'viele' }));
p.schliessungen.push(M.neueSchliessung({ kuerzel: 'K'.repeat(120), bezeichnung: 'Sehr langes Kürzel', anzahlMedien: -3 }));

const bereinigt = ohneAbsturz('Migration repariert kaputte Felder', () => M.migriere(p));
if (bereinigt) {
  pruefe(Array.isArray(bereinigt.tueren[0].zylinderAusfuehrung), 'zylinderAusfuehrung wird zu einem Array repariert');
  pruefe(Array.isArray(bereinigt.tueren[0].fotos), 'fotos wird zu einem Array repariert');
  pruefe(Array.isArray(bereinigt.tueren[0].tueranforderungen), 'tueranforderungen wird zu einem Array repariert');
  ohneAbsturz('Türliste mit Grenzwerten', () => Reports.tuerliste(bereinigt, {}, { modus: 'kompakt' }).build());
  ohneAbsturz('Datenblatt mit Grenzwerten', () => Reports.tuerliste(bereinigt, {}, { modus: 'detail' }).build());
  ohneAbsturz('Schließplan mit Grenzwerten', () => Reports.schliessplan(bereinigt, {}).build());
  ohneAbsturz('Materialliste mit Grenzwerten', () => Reports.materialliste(bereinigt, {}).build());
  const ml = M.materialliste(bereinigt);
  const negativ = ml.systeme.some(s => s.positionen.some(x => x.menge < 0));
  pruefe(!negativ, 'keine negativen Mengen in der Materialliste');
  const medienNeg = ml.medien.some(m => m.menge < 0);
  pruefe(!medienNeg, 'keine negativen Medienmengen');
}

// --- Emoji und CJK im PDF ---
const emojiDoc = ohneAbsturz('PDF mit Emoji/CJK erzeugbar', () => {
  const d = new PDF.Doc(); d.neueSeite();
  d.text('🔑 Schlüssel 日本語 Größe', 10, 10);
  return d.build();
});
if (emojiDoc) {
  const txt = Buffer.from(emojiDoc).toString('latin1');
  pruefe(/Schl\\374ssel|Schlüssel/.test(txt) || txt.includes('Schl'), 'lesbarer Text bleibt trotz Emoji erhalten');
}

// --- Sehr großes Projekt ---
const gross = M.neuesProjekt('Last');
const wurzel = M.neuerStrukturknoten('standort', 'Campus'); gross.standorte.push(wurzel);
for (let g = 0; g < 12; g++) {
  const geb = M.neuerStrukturknoten('gebaeude', 'Gebäude ' + g, wurzel.id);
  geb.sort = g; gross.standorte.push(geb);
  for (let t = 0; t < 25; t++) {
    gross.tueren.push(M.neueTuer({
      nummer: g + '.' + String(t).padStart(3,'0'), bezeichnung: 'Raum ' + g + '-' + t,
      strukturId: geb.id, systemId: t % 3 === 0 ? 'sv-ax' : 'evva-4ks',
      zylinderBauform: 'Doppelzylinder', masseAussen: '30', masseInnen: '35',
      status: 'aufgemessen', anzahl: (t % 4) + 1
    }));
  }
}
for (let i = 0; i < 40; i++) {
  gross.schliessungen.push(M.neueSchliessung({ kuerzel: 'S' + i, bezeichnung: 'Schließung ' + i, typ: 'ez', anzahlMedien: 2, sort: i }));
}
gross.tueren.forEach((t, i) => gross.schliessungen.forEach((s, j) => {
  if ((i + j) % 5 === 0) M.setBerechtigung(gross, t.id, s.id, 'ja');
}));
pruefe(gross.tueren.length === 300, '300 Türen × 40 Schließungen aufgebaut');

let t0 = Date.now();
const grossListe = ohneAbsturz('Türliste für 300 Türen', () => Reports.tuerliste(gross, {}, { modus: 'kompakt' }));
const dauerListe = Date.now() - t0;
t0 = Date.now();
const grossPlan = ohneAbsturz('Kreuzschließplan 300 × 40', () => Reports.schliessplan(gross, {}));
const dauerPlan = Date.now() - t0;
if (grossListe && grossPlan) {
  const b1 = grossListe.build(), b2 = grossPlan.build();
  console.log(`         Türliste: ${grossListe.seitenAnzahl()} Seiten in ${dauerListe} ms (${Math.round(b1.length/1024)} KB)`);
  console.log(`         Plan:     ${grossPlan.seitenAnzahl()} Seiten in ${dauerPlan} ms (${Math.round(b2.length/1024)} KB)`);
  pruefe(dauerListe < 6000 && dauerPlan < 6000, 'Erzeugung bleibt unter 6 Sekunden');
  pruefe(grossPlan.seitenAnzahl() > 1, 'Spaltenblöcke werden auf mehrere Seiten umbrochen');
}

// --- Import fehlerhafter Dateien ---
[['leerer Text', ''], ['kein JSON', '<html>'], ['falscher Typ', '{"typ":"anderes"}'],
 ['null', 'null'], ['Array', '[1,2,3]'], ['verstümmelt', '{"typ":"schliessanlagen-aufmass"']
].forEach(([name, inhalt]) => {
  let gefangen = false;
  try { Store.importParsen(inhalt); } catch (e) { gefangen = !!e.message; }
  pruefe(gefangen, 'Import lehnt "' + name + '" mit Meldung ab');
});
// Gültiger Import mit fehlenden Feldern
const halb = ohneAbsturz('Import mit unvollständigem Projekt', () =>
  Store.importParsen(JSON.stringify({ typ: 'schliessanlagen-aufmass', projekt: { tueren: [{ nummer: 'X' }] } })));
if (halb) {
  pruefe(halb.projekt.tueren.length === 1 && halb.projekt.tueren[0].id, 'fehlende IDs werden ergänzt');
  pruefe(Array.isArray(halb.projekt.standorte) && halb.projekt.matrix, 'fehlende Strukturen werden angelegt');
}

// --- Matrix-Konsistenz ---
const mp = M.neuesProjekt('Matrix');
const mt = M.neueTuer({ nummer: 'T1' }); mp.tueren.push(mt);
const ms = M.neueSchliessung({ kuerzel: 'S1' }); mp.schliessungen.push(ms);
M.setBerechtigung(mp, mt.id, ms.id, 'ja');
M.setBerechtigung(mp, 'geloescht', ms.id, 'ja');
M.setBerechtigung(mp, mt.id, 'weg', 'ja');
const entfernt = M.matrixAufraeumen(mp);
pruefe(entfernt === 2 && Object.keys(mp.matrix).length === 1, 'verwaiste Matrixeinträge werden entfernt');
M.setBerechtigung(mp, mt.id, ms.id, 'nein');
pruefe(Object.keys(mp.matrix).length === 0, '"nicht berechtigt" wird nicht gespeichert (spart Platz)');

// --- Strukturzyklus darf nicht hängen ---
const zp = M.neuesProjekt('Zyklus');
const a = M.neuerStrukturknoten('standort', 'A'); const b = M.neuerStrukturknoten('gebaeude', 'B', a.id);
a.parentId = b.id;                          // künstlich erzeugter Ring
zp.standorte.push(a, b);
ohneAbsturz('Strukturzyklus führt nicht zur Endlosschleife', () => M.strukturPfadText(zp, a.id));
ohneAbsturz('Gruppierung bei Strukturzyklus', () => M.tuerenGruppiert(zp));

// --- Türnummern-Fortzählung ---
const VT = { naechste: (n) => {
  const tr = /^(.*?)(\d+)(\D*)$/.exec(String(n||'')); if (!tr) return '';
  let z = String(parseInt(tr[2],10)+1); while (z.length < tr[2].length) z = '0'+z;
  return tr[1]+z+tr[3];
}};
[['A-EG-01','A-EG-02'], ['009','010'], ['T5','T6'], ['EG.99','EG.100'], ['Tür','' ], ['','']]
  .forEach(([ein, erwartet]) => {
    pruefe(VT.naechste(ein) === erwartet, `Fortzählung "${ein}" -> "${erwartet}"`, 'ergab: ' + VT.naechste(ein));
  });

console.log(`\nErgebnis Robustheit: ${ok} ok, ${fehler} Fehler`);
process.exit(fehler ? 1 : 0);
