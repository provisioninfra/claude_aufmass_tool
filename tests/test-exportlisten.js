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
M.blankoSchliessplan(blanko, { proBereich: true, vorhandeneErsetzen: true });
const bk = blanko.schliessungen.map(s => s.kuerzel);
pruefe(bk.length === new Set(bk).size, 'Blanko-Plan vergibt eindeutige Kürzel', bk.join(', '));
const matrixSchluessel = Object.keys(blanko.matrix);
pruefe(matrixSchluessel.length === new Set(matrixSchluessel).size,
  'Blanko-Plan setzt jede Berechtigung nur einmal');
/* Zweimal anwenden darf nicht verdoppeln */
const vorher = blanko.schliessungen.length;
M.blankoSchliessplan(blanko, { proBereich: true, vorhandeneErsetzen: true });
pruefe(blanko.schliessungen.length === vorher,
  'erneutes Erzeugen mit "ersetzen" verdoppelt nichts',
  vorher + ' -> ' + blanko.schliessungen.length);

console.log(`\nErgebnis Exportlisten: ${ok} ok, ${fehler} Fehler`);
process.exit(fehler ? 1 : 0);
