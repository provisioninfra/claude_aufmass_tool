/* Mitarbeiter, Gruppen und neue Spalten auf der Kundenfreigabe (Format 2):
 * Daten hin, Daten zurück, Rechte je Link, Übernahme, verbindliche Freigabe. */
const W = __dirname + '/..';
require(W + '/src/js/catalog.js');
const M = require(W + '/src/js/model.js'); global.Model = M;
require(W + '/src/js/freigabe.js'); const F = global.Freigabe;
const { baueTestprojekt } = require(W + '/tests/fixture.js');

let ok = 0, fehler = 0;
function p(b, t, i) { if (b) ok++; else { fehler++; console.log('  FEHL  ' + t + (i ? '\n          -> ' + i : '')); } }
function k(x) { return JSON.parse(JSON.stringify(x)); }

console.log('\n== Der Link bringt Mitarbeiter, Gruppen und die Rechte mit ==');
const q = baueTestprojekt();
const frei = [q.schliessungen[0].id, q.schliessungen[4].id];
const daten = F.erstellen(q, { freigegebeneSchliessungen: frei, rechte: { m: 1, g: 1, s: 1 }, medienArten: ['Transponder', 'Karte'] });
F.freigabeMerken(q, daten);
p(daten.f === 2, 'Format 2');
p(daten.ma.length === q.mitarbeiter.length && daten.gr.length === q.gruppen.length, 'alle Mitarbeiter und Gruppen reisen mit (zur Ansicht und Pflege)');
p(daten.ma.every(x => Array.isArray(x) && x.length === 4 && typeof x[0] === 'string' && Array.isArray(x[2]) && Array.isArray(x[3])),
  'jeder Mitarbeiter steht als [Kennung, Name, Gruppen, Medien]');
p(daten.s.every(s => s.length === 7 && ['schliessung', 'gruppe', 'mitarbeiter'].indexOf(s[4]) !== -1 && Array.isArray(s[6])),
  'jede Spalte nennt ihre Art und die Kennung dahinter');
const gruppenSpalte = daten.s.filter(s => s[4] === 'gruppe')[0];
p(gruppenSpalte && daten.gr.some(g => g[0] === gruppenSpalte[5]), 'eine Gruppenspalte verweist auf eine mitgereiste Gruppe');
p(JSON.stringify(daten.r) === JSON.stringify({ m: 1, g: 1, s: 1 }) && daten.mt.join() === 'Transponder,Karte', 'Rechte und Medienarten sind dabei');
const rund = F.ausAnker(F.alsAnker(daten));
p(JSON.stringify(rund.ma) === JSON.stringify(daten.ma) && JSON.stringify(rund.s) === JSON.stringify(daten.s), 'die Listen überstehen den Anker unverändert');
const ohneRechte = F.erstellen(q, { freigegebeneSchliessungen: [] });
p(JSON.stringify(ohneRechte.r) === JSON.stringify({ m: 0, g: 0, s: 0 }), 'ohne Angabe gibt es keine Rechte');
let alt = null;
try { F.ausAnker(F.alsAnker(Object.assign({}, daten, { f: 1 }))); } catch (e) { alt = e.message; }
p(/anderen Fassung/.test(alt || ''), 'ein Link aus Fassung 1.1 wird abgelehnt', alt);

console.log('\n== Die Rückmeldung enthält nur, was sich geändert hat ==');
const matrix = rund.matrix;
let antwort = F.antwortErstellen(rund, matrix, { ma: k(rund.ma), gr: k(rund.gr), n: [] });
p(antwort.ma === undefined && antwort.gr === undefined && antwort.n === undefined, 'unveränderte Listen erzeugen keinen Eintrag', JSON.stringify(Object.keys(antwort)));
const ma = k(rund.ma);
ma[0][1] = ma[0][1] + ' (geändert)';
ma.push(['neu-abc12', 'Frau Neu', [rund.gr[0][0], 'neu-g1'], [['Karte', 2], ['Karte', 1], ['Transponder', 0]]]);
ma.push(['neu-leer1', '   ', [], []]);
const gr = k(rund.gr).concat([['neu-g1', 'Empfang'], ['neu-g2', '']]);
antwort = F.antwortErstellen(rund, matrix, {
  ma: ma, max: [rund.ma[1][0], 'kaputt id!'], gr: gr, grx: [],
  n: [['gruppe', 'neu-g1', '1'.repeat(rund.t.length)], ['mitarbeiter', 'neu-abc12', '0'.repeat(rund.t.length - 1) + '2'], ['gruppe', '', '1']],
  fr: { name: '  Frau Chef ', funktion: 'GF' }
});
p(antwort.ma && antwort.ma.length === ma.length - 1, 'namenlose Mitarbeiter fallen heraus', JSON.stringify(antwort.ma && antwort.ma.length));
const neu = antwort.ma.filter(x => x[0] === 'neu-abc12')[0];
p(neu && JSON.stringify(neu[3]) === JSON.stringify([['Karte', 3], ['Transponder', 1]]), 'Medien werden zusammengezogen und auf mindestens 1 gesetzt', JSON.stringify(neu && neu[3]));
p(antwort.max.length === 1, 'eine unbrauchbare Kennung beim Entfernen fällt heraus', JSON.stringify(antwort.max));
p(antwort.gr.length === rund.gr.length + 1, 'eine Gruppe ohne Namen fällt heraus');
p(antwort.n.length === 2 && antwort.n[0][2] !== '1'.repeat(rund.t.length), 'neue Spalten reisen lauflängenkodiert mit, ohne Kennung nicht', JSON.stringify(antwort.n));
p(antwort.fr.name === 'Frau Chef' && antwort.fr.funktion === 'GF', 'die Freigabe nennt Name und Funktion, bereinigt');
const rueck = F.antwortAusSchluessel(F.antwortAlsSchluessel(antwort));
p(JSON.stringify(rueck) === JSON.stringify(antwort), 'die Rückmeldung übersteht den Rückschlüssel');
p(/Mitarbeiterliste/.test(F.antwortKurz(rueck)) && /2 neue Spalten/.test(F.antwortKurz(rueck)) && /Frau Chef/.test(F.antwortKurz(rueck)),
  'die Kurzfassung nennt Listen, Spalten und Freigabe', F.antwortKurz(rueck));

console.log('\n== Übernahme ins Projekt ==');
const ziel = k(q);
const vorherMa = ziel.mitarbeiter.length, vorherGr = ziel.gruppen.length, vorherSp = ziel.schliessungen.length;
const entfernterName = ziel.mitarbeiter[1].name;
const bericht = F.antwortUebernehmen(ziel, rueck, {});
p(bericht.mitarbeiterNeu === 1 && bericht.mitarbeiterGeaendert === 1 && bericht.mitarbeiterEntfernt === 1,
  'ein Mitarbeiter neu, einer geändert, einer entfernt', JSON.stringify(bericht));
p(ziel.mitarbeiter.length === vorherMa, 'die Liste ist um einen gewachsen und um einen geschrumpft', String(ziel.mitarbeiter.length));
p(!ziel.mitarbeiter.some(m => m.name === entfernterName), 'der entfernte Mitarbeiter ist weg');
p(ziel.mitarbeiter[0].name === rund.ma[0][1] + ' (geändert)' && ziel.mitarbeiter[0].id === rund.ma[0][0], 'der geänderte behält seine Kennung');
const neuMa = ziel.mitarbeiter.filter(m => m.name === 'Frau Neu')[0];
p(neuMa && /^ma-/.test(neuMa.id) && neuMa.gruppen.length === 2, 'der neue Mitarbeiter hat eine frische Kennung und beide Gruppen - auch die neue', JSON.stringify(neuMa));
p(bericht.gruppenNeu === 1 && ziel.gruppen.length === vorherGr + 1 && ziel.gruppen.some(g => g.name === 'Empfang'), 'die neue Gruppe ist angelegt');
p(bericht.spaltenNeu === 2 && ziel.schliessungen.length === vorherSp + 2, 'zwei neue Spalten sind angelegt', String(ziel.schliessungen.length));
const spEmpfang = ziel.schliessungen.filter(s => s.art === 'gruppe' && M.gruppeVon(ziel, s.gruppeId) && M.gruppeVon(ziel, s.gruppeId).name === 'Empfang')[0];
p(spEmpfang && ziel.tueren.every(t => M.getBerechtigung(ziel, t.id, spEmpfang.id) === 'ja'), 'die Gruppenspalte hat an allen Türen ein Kreuz');
const spNeu = ziel.schliessungen.filter(s => s.art === 'mitarbeiter' && s.mitarbeiterId === neuMa.id)[0];
p(spNeu && M.getBerechtigung(ziel, rund.t[rund.t.length - 1][0], spNeu.id) === 'zeit' && spNeu.kuerzel
  && ziel.tueren.filter(t => M.getBerechtigung(ziel, t.id, spNeu.id) !== 'nein').length === 1,
  'die Mitarbeiterspalte hat genau das eine Z (in der Reihenfolge des Links) - und ein Kürzel', JSON.stringify(spNeu));
p(bericht.freigabe && ziel.freigabe && ziel.freigabe.name === 'Frau Chef' && ziel.freigabe.stand === M.freigabeStand(ziel),
  'die verbindliche Freigabe ist mit dem Stand nach der Übernahme vermerkt', JSON.stringify(ziel.freigabe));
p(M.seitFreigabeGeaendert(ziel) === false, 'direkt nach der Übernahme gilt der Plan als unverändert');
ziel.gruppen[0].name += ' x';
p(M.seitFreigabeGeaendert(ziel) === true, 'jede spätere Änderung wird erkannt');
p(/1 Mitarbeiter neu/.test(F.berichtText(bericht)) && /2 neue Spalten/.test(F.berichtText(bericht)) && /Freigabe durch Frau Chef/.test(F.berichtText(bericht)),
  'der Bericht ist lesbar', F.berichtText(bericht));

console.log('\n== Nur, was der Link erlaubt ==');
const eng = k(q); eng.freigabenLokal = [];
const datenEng = F.erstellen(eng, { freigegebeneSchliessungen: [eng.schliessungen[0].id], rechte: { m: 1, g: 0, s: 0 } });
F.freigabeMerken(eng, datenEng);
const rundEng = F.ausAnker(F.alsAnker(datenEng));
const aEng = F.antwortErstellen(rundEng, rundEng.matrix, {
  ma: k(rundEng.ma).concat([['neu-x1', 'Herr Erlaubt', [], []]]), gr: k(rundEng.gr).concat([['neu-g9', 'Verboten']]),
  n: [['gruppe', 'neu-g9', '1'.repeat(rundEng.t.length)]]
});
const vorEng = JSON.stringify([eng.gruppen, eng.schliessungen.length]);
const bEng = F.antwortUebernehmen(eng, aEng, {});
p(bEng.mitarbeiterNeu === 1 && eng.mitarbeiter.some(m => m.name === 'Herr Erlaubt'), 'Mitarbeiter dürfen - das Recht war eingeräumt');
p(bEng.gruppenNeu === 0 && bEng.spaltenNeu === 0 && bEng.listenUebersprungen === 2 && JSON.stringify([eng.gruppen, eng.schliessungen.length]) === vorEng,
  'Gruppen und neue Spalten werden übersprungen - ohne Recht', JSON.stringify(bEng));
/* Der Serverweg hat selbst geprüft - er bringt nur, was erlaubt war */
const srv = k(q);
const bSrv = F.antwortUebernehmen(srv, aEng, { serverGeprueft: true, code: 'abc' });
p(bSrv.gruppenNeu === 1 && bSrv.spaltenNeu === 1, 'serverseitig geprüfte Rückmeldungen gelten ohne lokale Freigabe');

console.log('\n== Was nicht geht ==');
/* Eine Gruppe mit Spalte lässt sich nicht löschen */
const fest = k(q);
const datenFest = F.erstellen(fest, { freigegebeneSchliessungen: [], rechte: { m: 1, g: 1, s: 1 } });
F.freigabeMerken(fest, datenFest);
const rundFest = F.ausAnker(F.alsAnker(datenFest));
const gruppeMitSpalte = fest.schliessungen.filter(s => s.art === 'gruppe')[0].gruppeId;
const maMitSpalte = fest.schliessungen.filter(s => s.art === 'mitarbeiter')[0].mitarbeiterId;
const bFest = F.antwortUebernehmen(fest, F.antwortErstellen(rundFest, rundFest.matrix, { grx: [gruppeMitSpalte], max: [maMitSpalte] }), {});
p(bFest.gruppenEntfernt === 0 && bFest.mitarbeiterEntfernt === 0 && M.gruppeVon(fest, gruppeMitSpalte) && M.mitarbeiterVon(fest, maMitSpalte),
  'Gruppen und Mitarbeiter mit eigener Spalte bleiben erhalten', JSON.stringify(bFest));
/* Eine erfundene Kennung legt niemanden an */
const erf = k(q);
F.freigabeMerken(erf, datenFest);
const bErf = F.antwortUebernehmen(erf, { f: 2, pid: erf.id, typ: 'antwort', tIds: rundFest.t.map(t => t[0]), sIds: rundFest.s.map(s => s[0]), a: '',
  ma: [['ma-erfunden', 'Eindringling', [], []]], gr: [['grp-erfunden', 'Fremd']], n: [['gruppe', 'grp-erfunden', '1']] }, {});
p(bErf.mitarbeiterNeu === 0 && bErf.gruppenNeu === 0 && bErf.spaltenNeu === 0 && !erf.mitarbeiter.some(m => m.name === 'Eindringling'),
  'erfundene Kennungen legen weder Mitarbeiter noch Gruppen noch Spalten an', JSON.stringify(bErf));
/* Kaputte Rückmeldungen richten nichts an */
[{ ma: 'quatsch' }, { gr: null }, { n: { zz: 'x' } }, { n: [null, 5, 'x', ['gruppe']] }, { fr: 'x' }, { max: 'x' }].forEach(kaputt => {
  const z = k(q);
  F.freigabeMerken(z, datenFest);
  const vor = JSON.stringify([z.schliessungen, z.mitarbeiter, z.gruppen]);
  let f = null;
  try { F.antwortUebernehmen(z, Object.assign({ f: 2, pid: z.id, typ: 'antwort', tIds: rundFest.t.map(t => t[0]), sIds: rundFest.s.map(s => s[0]), a: '' }, kaputt), {}); }
  catch (e) { f = e.message; }
  p(f === null && JSON.stringify([z.schliessungen, z.mitarbeiter, z.gruppen]) === vor, 'Unsinn ' + JSON.stringify(kaputt).slice(0, 24) + ' richtet nichts an', f);
});
/* Alte Rückmeldungen (Format 1) werden abgelehnt */
let altAntwort = null;
try { F.antwortAusSchluessel(F.antwortAlsSchluessel({ f: 1, pid: q.id, typ: 'antwort', a: '0:1' })); } catch (e) { altAntwort = e.message; }
p(/anderen Fassung/.test(altAntwort || ''), 'eine Rückmeldung aus Fassung 1.1 wird abgelehnt', altAntwort);

console.log('\n== Die Rückmeldung wird gegen die abgelegte Freigabe geprüft ==');
{
  const tIds = rund.t.map(t => t[0]), sIds = rund.s.map(s => s[0]);
  const spalten = sIds.length;
  const freiSpalte = sIds.indexOf(frei[0]);
  const gesperrteSpalte = sIds.findIndex(id => frei.indexOf(id) === -1);
  const manipuliert = { f: 2, pid: q.id, typ: 'antwort', tIds, sIds,
    a: (0 * spalten + freiSpalte).toString(36) + ':1,' + (1 * spalten + gesperrteSpalte).toString(36) + ':1' };
  const z = k(q);
  const vorherGesperrt = M.getBerechtigung(z, tIds[1], sIds[gesperrteSpalte]);
  const b = F.antwortUebernehmen(z, manipuliert, {});
  p(b.uebersprungen === 1, 'ein gesperrtes Feld wird übersprungen', JSON.stringify(b));
  p(M.getBerechtigung(z, tIds[1], sIds[gesperrteSpalte]) === vorherGesperrt, 'das gesperrte Feld bleibt, wie es war');
  p(M.getBerechtigung(z, tIds[0], sIds[freiSpalte]) === 'ja' || b.uebernommen === 0, 'das freigegebene Feld wird übernommen');

  /* Ohne abgelegte Freigabe: Ablehnung, nichts ändert sich */
  const ohne = k(q); ohne.freigabenLokal = [];
  const vorOhne = JSON.stringify([ohne.matrix, ohne.schliessungen]);
  let code = null;
  try { F.antwortUebernehmen(ohne, manipuliert, {}); } catch (e) { code = e.code; }
  p(code === 'keine_freigabe', 'ohne bekannte Freigabe wird die Rückmeldung abgelehnt', code);
  p(JSON.stringify([ohne.matrix, ohne.schliessungen]) === vorOhne, 'und am Aufmaß ändert sich nichts');

  /* Zwei Links zum selben Plan: die Vereinigung gilt - auch bei den Rechten */
  const zwei = k(q);
  F.freigabeMerken(zwei, F.erstellen(zwei, { freigegebeneSchliessungen: [sIds[gesperrteSpalte]], rechte: { g: 1 } }));
  const b3 = F.antwortUebernehmen(zwei, Object.assign({}, manipuliert, { gr: k(rund.gr).concat([['neu-g5', 'Dazu']]) }), {});
  p(b3.uebersprungen === 0 && b3.gruppenNeu === 1, 'was in irgendeinem Link freigegeben war, darf der Kunde eintragen', JSON.stringify(b3));
  p(zwei.freigabenLokal.length === 2 && zwei.freigabenLokal.every(f => f.id && f.maske && f.rechte), 'jeder Link hinterlässt einen Eintrag mit Maske und Rechten');
}

console.log('\nErgebnis Freigabe-Listen: ' + ok + ' ok, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
