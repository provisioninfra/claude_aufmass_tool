/* Prüft die Exportlisten auf Doppelungen und darauf, dass die Materialliste
 * als Bestellgrundlage vollständig ist. */
const K = require('../src/js/catalog.js');
const M = require('../src/js/model.js');
const { baueTestprojekt } = require('./fixture.js');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

console.log('\n== Materialliste: keine Doppelungen ==');
const p = baueTestprojekt();
const ml = M.materialliste(p);

/* --- 1. Jede Positionszeile ist eindeutig --- */
const doppelte = [];
ml.systeme.forEach(sys => {
  const gesehen = new Map();
  sys.positionen.forEach(pos => {
    const schluessel = [pos.bezeichnung, pos.mass, pos.ausfuehrung].join('|');
    if (gesehen.has(schluessel)) doppelte.push(sys.label + ': ' + schluessel);
    gesehen.set(schluessel, true);
  });
});
pruefe(doppelte.length === 0, 'keine Position erscheint zweimal in derselben Liste', doppelte.join('\n         -> '));

/* --- 2. Dasselbe Bauteil darf nicht über zwei Wege in die Liste kommen --- */
const wegeDoppelt = [];
ml.systeme.forEach(sys => {
  const komponenten = sys.positionen.filter(x => x.gruppe === 'Systemkomponente');
  const bauteile = sys.positionen.filter(x => x.gruppe !== 'Systemkomponente');
  komponenten.forEach(k => {
    const kn = k.bezeichnung.toLowerCase();
    bauteile.forEach(b => {
      const bn = b.bezeichnung.toLowerCase();
      /* Wandleser, Zylinder, Beschlag oder Schloss dürfen nicht zusätzlich
         als Systemkomponente geführt werden */
      if (/wandleser|zutrittsleser/.test(kn) && /wandleser|zutrittsleser/.test(bn)) {
        wegeDoppelt.push(sys.label + ': "' + k.bezeichnung + '" neben "' + b.bezeichnung + '"');
      }
      if (/zylinder/.test(kn) && /zylinder/.test(bn)) {
        wegeDoppelt.push(sys.label + ': "' + k.bezeichnung + '" neben "' + b.bezeichnung + '"');
      }
    });
  });
});
pruefe(wegeDoppelt.length === 0, 'kein Bauteil kommt über zwei Wege in die Liste', wegeDoppelt.join('\n         -> '));

/* --- 3. Mengen stimmen mit dem Aufmaß überein --- */
let erwarteteZylinder = 0;
p.tueren.forEach(t => {
  if (K.zylinderText(t)) erwarteteZylinder += (parseInt(t.anzahl, 10) || 1);
});
const gezaehlteZylinder = ml.systeme.reduce((sum, sys) =>
  sum + sys.positionen.filter(x => x.gruppe === 'Zylinder').reduce((s2, x) => s2 + x.menge, 0), 0);
pruefe(gezaehlteZylinder === erwarteteZylinder,
  `Zylindermenge stimmt mit dem Aufmaß überein (${gezaehlteZylinder})`,
  'erwartet ' + erwarteteZylinder + ', gezählt ' + gezaehlteZylinder);

/* Mehrfachpositionen werden mit ihrer Anzahl gerechnet */
const briefkasten = ml.systeme.flatMap(s => s.positionen).find(x => /Briefkasten/.test(x.bezeichnung));
pruefe(briefkasten && briefkasten.menge === 12,
  'eine Position mit 12 baugleichen Türen erscheint als 12 Stück',
  briefkasten ? String(briefkasten.menge) : 'nicht gefunden');

/* --- 4. Gleiche Bauteile mit verschiedenem Maß bleiben getrennt --- */
const doppelzylinder = ml.systeme.flatMap(s => s.positionen)
  .filter(x => x.bezeichnung === 'Doppelzylinder');
/* Bestellrelevant ist die Kombination aus Maß UND Ausführung: ein Zylinder
   mit Not- und Gefahrenfunktion ist ein anderer Artikel. */
const ausprägungen = new Set(doppelzylinder.map(x => x.mass + '|' + x.ausfuehrung));
pruefe(doppelzylinder.length === ausprägungen.size,
  'Zylinder mit gleicher Länge, aber anderer Ausführung bleiben getrennt',
  doppelzylinder.map(x => x.mass + ' / ' + (x.ausfuehrung || '–') + ' = ' + x.menge + 'x').join(' | '));

/* Damit das beim Bestellen nicht wie eine Doppelung wirkt, muss die Zeile
   ohne Zusatzfunktion ausdrücklich benannt sein. */
const gleicheMasse = {};
doppelzylinder.forEach(x => { (gleicheMasse[x.mass] = gleicheMasse[x.mass] || []).push(x); });
const unklar = Object.values(gleicheMasse).filter(g => g.length > 1)
  .flat().filter(x => !x.ausfuehrung);
pruefe(unklar.length === 0,
  'bei gleichem Maß ist jede Zeile durch ihre Ausführung unterscheidbar',
  unklar.map(x => x.bezeichnung + ' ' + x.mass).join(', '));

/* --- 5. Bestellrelevante Angaben sind vorhanden --- */
console.log('\n== Materialliste: vollständig als Bestellgrundlage ==');
const alleZylinder = ml.systeme.flatMap(s => s.positionen).filter(x => x.gruppe === 'Zylinder');
const ohneMass = alleZylinder.filter(x => !x.mass && !/Briefkasten|Vorhang|Möbel/.test(x.bezeichnung));
pruefe(ohneMass.length === 0, 'jeder Zylinder trägt seine Länge',
  ohneMass.map(x => x.bezeichnung).join(', '));

const beschlaege = ml.systeme.flatMap(s => s.positionen).filter(x => x.gruppe === 'Beschlag');
pruefe(beschlaege.every(x => x.mass), 'jeder Beschlag trägt Bestückung und Maße',
  beschlaege.filter(x => !x.mass).map(x => x.bezeichnung).join(', '));

const schloesser = ml.systeme.flatMap(s => s.positionen).filter(x => x.gruppe === 'Schloss');
pruefe(schloesser.every(x => x.mass), 'jedes Schloss trägt Dornmaß bzw. Entfernung',
  schloesser.filter(x => !x.mass).map(x => x.bezeichnung).join(', '));

pruefe(ml.systeme.flatMap(s => s.positionen).every(x => x.tueren && x.tueren.length),
  'jede Position nennt die zugehörigen Türen');
pruefe(typeof ml.gesamtStueck === 'number' && ml.gesamtStueck > 0,
  'Gesamtsumme wird ausgewiesen (' + ml.gesamtStueck + ' Stück)');
pruefe(ml.gesamtMedien > 0, 'Identmedien werden getrennt summiert (' + ml.gesamtMedien + ' Stück)');

/* Summen sind in sich stimmig */
const summeAusPositionen = ml.systeme.reduce((s, sy) =>
  s + sy.positionen.reduce((s2, x) => s2 + x.menge, 0), 0);
pruefe(summeAusPositionen === ml.gesamtStueck, 'Gesamtsumme entspricht der Summe aller Positionen',
  summeAusPositionen + ' vs ' + ml.gesamtStueck);

/* --- 6. Türliste: keine Tür doppelt --- */
console.log('\n== Türliste und Schließplan ==');
const gruppen = M.tuerenGruppiert(p);
const alleIds = gruppen.flatMap(g => g.tueren.map(t => t.id));
pruefe(alleIds.length === new Set(alleIds).size, 'keine Tür erscheint in zwei Gruppen');
pruefe(alleIds.length === p.tueren.length,
  'jede Tür erscheint genau einmal in der Türliste',
  alleIds.length + ' von ' + p.tueren.length);

/* --- 7. Schließplan: keine Schließung doppelt --- */
const kuerzel = p.schliessungen.map(s => s.kuerzel).filter(Boolean);
pruefe(kuerzel.length === new Set(kuerzel).size, 'kein Kürzel doppelt vergeben',
  kuerzel.filter((k, i) => kuerzel.indexOf(k) !== i).join(', '));

/* --- 8. Blanko-Plan erzeugt keine Doppelungen --- */
const blanko = baueTestprojekt();
blanko.schliessungen = []; blanko.matrix = {};
M.blankoSchliessplan(blanko, { ghs: true, proGruppe: true, proMitarbeiter: true });
const bk = blanko.schliessungen.map(s => s.kuerzel);
pruefe(bk.length === new Set(bk).size, 'Blanko-Plan vergibt eindeutige Kürzel', bk.join(', '));
const matrixSchluessel = Object.keys(blanko.matrix);
pruefe(matrixSchluessel.length === new Set(matrixSchluessel).size,
  'Blanko-Plan setzt jede Berechtigung nur einmal');
/* Zweimal anwenden darf nicht verdoppeln */
const vorher = blanko.schliessungen.length;
M.blankoSchliessplan(blanko, { ghs: true, proGruppe: true, proMitarbeiter: true });
pruefe(blanko.schliessungen.length === vorher,
  'erneutes Erzeugen verdoppelt nichts - vorhandene Spalten werden erkannt',
  vorher + ' -> ' + blanko.schliessungen.length);
pruefe(vorher === 1 + blanko.gruppen.length + blanko.mitarbeiter.length,
  'GHS plus je eine Spalte für jede Gruppe und jeden Mitarbeiter', String(vorher));

/* --- 9. Materialliste als Dokument: Spalten und Leerfelder --------------- */
console.log('\n== Materialliste als Bestelldokument ==');
require('../src/js/pdf.js');
const Reports = require('../src/js/reports.js');
const { einstellungen } = require('./fixture.js');
const mp = M.migriere(baueTestprojekt());
function pdfText(optionen) {
  return Buffer.from(Reports.materialliste(mp, einstellungen, optionen).build()).toString('latin1');
}
const ohneTueren = pdfText({});
const mitTueren = pdfText({ mitTueren: true });

/* Jede Bauteilart hat ihre eigenen Maßspalten */
[['Knaufseite', 'Zylinder'], ['gesamt', 'Zylinder'], ['Nuss', 'Beschlag'],
 ['Stulp', 'Schloss'], ['Falle', 'Schloss']].forEach(([kopf, art]) => {
  pruefe(ohneTueren.indexOf(kopf) !== -1,
    'die Spalte „' + kopf + '“ (' + art + ') steht im Dokument');
});

/* Artikelnummer und Preis bleiben leer - sie werden beim Lieferanten ergänzt */
pruefe(ohneTueren.indexOf('Art.-Nr.') !== -1 && ohneTueren.indexOf('Preis') !== -1,
  'Leerspalten für Art.-Nr. und Preis sind vorhanden');
pruefe(/absichtlich leer/.test(ohneTueren),
  'das Dokument sagt, warum die Spalten leer sind');

/* Türzuordnung ist standardmäßig aus, bleibt aber zuschaltbar */
pruefe(ohneTueren.indexOf('A-EG-01') === -1,
  'ohne Zuschaltung nennt die Bestellliste keine Türnummern');
pruefe(mitTueren.indexOf('A-EG-01') !== -1,
  'zugeschaltet stehen die Türnummern je Position dabei');

/* Ohne die Art des Mediums lässt sich nicht bestellen */
pruefe(ohneTueren.indexOf('Art des Mediums') !== -1,
  'die Identmedien nennen die Art des Mediums');
const offeneMedien = ml.medien.filter(m => !m.medienTyp);
pruefe(ohneTueren.indexOf('offen') !== -1 || offeneMedien.length === 0,
  'fehlt die Art, steht das ausdrücklich da statt leer zu bleiben',
  offeneMedien.length + ' ohne Angabe');

/* Was oben im Kopf steht, wird unten nicht wiederholt */
const bestellteil = ohneTueren.slice(ohneTueren.indexOf('Bestellangaben'));
pruefe(bestellteil.indexOf('Kommission') !== -1,
  'die Bestellangaben nennen das Bestellzeichen');
pruefe(!/Ansprechpartner vor Ort/.test(bestellteil),
  'Angaben aus dem Dokumentenkopf werden unten nicht wiederholt');

console.log('\n== Gesamtlänge ohne Gleitkomma-Rest ==');
{
  const p2 = JSON.parse(JSON.stringify(p));
  const z = p2.tueren.find(t => t.brauchtZylinder) || p2.tueren[0];
  z.brauchtZylinder = true; z.masseAussen = '35.1'; z.masseInnen = '40.2';
  const text = JSON.stringify(M.materialliste(p2));
  pruefe(!/\d\.\d{5,}/.test(text), 'eine Summe wie 35,1 + 40,2 erscheint gerundet (75.3)', (text.match(/\d+\.\d{5,}/) || [''])[0]);
  pruefe(text.indexOf('75.3') !== -1, 'und steht als 75.3 in der Liste');
}

console.log(`\nErgebnis Exportlisten: ${ok} ok, ${fehler} Fehler`);
process.exit(fehler ? 1 : 0);
