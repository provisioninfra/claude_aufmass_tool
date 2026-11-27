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
/* Entfernt wird jemand ohne eigene Spalte und ohne Schlüssel - Träger bleiben geschützt (siehe unten) */
const entfernbar = rund.ma.find(m => !q.schliessungen.some(s => (s.traeger || []).indexOf(m[0]) !== -1 || s.mitarbeiterId === m[0]));
antwort = F.antwortErstellen(rund, matrix, {
  ma: ma, max: [entfernbar[0], 'kaputt id!'], gr: gr, grx: [],
  n: [['gruppe', 'neu-g1', '1'.repeat(rund.t.length)], ['mitarbeiter', 'neu-abc12', '0'.repeat(rund.t.length - 1) + '2'], ['gruppe', '', '1']],
  fr: { name: '  Frau Chef ', funktion: 'GF' }
});
p(antwort.ma && antwort.ma.length === 2 && antwort.ma[0][0] === rund.ma[0][0] && antwort.ma[1][0] === 'neu-abc12',
  'nur geänderte und neue Mitarbeiter reisen mit - unveränderte und namenlose nicht', JSON.stringify(antwort.ma && antwort.ma.map(x => x[0])));
const neu = antwort.ma.filter(x => x[0] === 'neu-abc12')[0];
p(neu && JSON.stringify(neu[3]) === JSON.stringify([['Karte', 3], ['Transponder', 1]]), 'Medien werden zusammengezogen und auf mindestens 1 gesetzt', JSON.stringify(neu && neu[3]));
p(antwort.max.length === 1, 'eine unbrauchbare Kennung beim Entfernen fällt heraus', JSON.stringify(antwort.max));
p(antwort.gr.length === 1 && antwort.gr[0][0] === 'neu-g1', 'nur die neue Gruppe reist mit, die ohne Namen fällt heraus', JSON.stringify(antwort.gr));
p(antwort.n.length === 2 && antwort.n[0][2] !== '1'.repeat(rund.t.length), 'neue Spalten reisen lauflängenkodiert mit, ohne Kennung nicht', JSON.stringify(antwort.n));
p(antwort.fr.name === 'Frau Chef' && antwort.fr.funktion === 'GF', 'die Freigabe nennt Name und Funktion, bereinigt');
const rueck = F.antwortAusSchluessel(F.antwortAlsSchluessel(antwort));
p(JSON.stringify(rueck) === JSON.stringify(antwort), 'die Rückmeldung übersteht den Rückschlüssel');
p(/Mitarbeiterliste/.test(F.antwortKurz(rueck)) && /2 neue Spalten/.test(F.antwortKurz(rueck)) && /Frau Chef/.test(F.antwortKurz(rueck)),
  'die Kurzfassung nennt Listen, Spalten und Freigabe', F.antwortKurz(rueck));

console.log('\n== Übernahme ins Projekt ==');
const ziel = k(q);
const vorherMa = ziel.mitarbeiter.length, vorherGr = ziel.gruppen.length, vorherSp = ziel.schliessungen.length;
const entfernterName = M.mitarbeiterVon(ziel, entfernbar[0]).name;
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
/* Ein Rückschlüssel ist Text: eine verbindliche Freigabe darin gilt nicht ohne Server */
p(!bericht.freigabe && !ziel.freigabe && bericht.freigabeUebergangen === true && bericht.aenderungen.some(x => x.hinweis && /nicht übernommen/.test(x.text)),
  'der Freigabe-Vermerk im Rückschlüssel wird ohne Server nicht übernommen - der Bericht sagt es', JSON.stringify(bericht.aenderungen.filter(x => x.hinweis)));
p(/1 Mitarbeiter neu/.test(F.berichtText(bericht)) && /2 neue Spalten/.test(F.berichtText(bericht)) && !/Freigabe durch/.test(F.berichtText(bericht)),
  'der Bericht ist lesbar', F.berichtText(bericht));
/* Über den Server geprüft gilt sie - mit dem Stand nach der Übernahme */
const zielS = k(q);
const berichtS = F.antwortUebernehmen(zielS, rueck, { serverGeprueft: true, code: 'c1' });
p(berichtS.freigabe && zielS.freigabe && zielS.freigabe.name === 'Frau Chef' && zielS.freigabe.stand === M.freigabeStand(zielS) && zielS.freigabe.code === 'c1',
  'über den Server ist die verbindliche Freigabe mit dem Stand nach der Übernahme vermerkt', JSON.stringify(zielS.freigabe));
p(/^\d{4}-\d{2}-\d{2}T/.test(zielS.freigabe.am) && !isNaN(Date.parse(zielS.freigabe.am)), 'der Zeitpunkt der Freigabe ist ein gültiger Zeitstempel', zielS.freigabe.am);
p(M.seitFreigabeGeaendert(zielS) === false, 'direkt nach der Übernahme gilt der Plan als unverändert');
zielS.gruppen[0].name += ' x';
p(M.seitFreigabeGeaendert(zielS) === true, 'jede spätere Änderung wird erkannt');
p(/Freigabe durch Frau Chef/.test(F.berichtText(berichtS)), 'der Bericht nennt die Freigabe', F.berichtText(berichtS));
/* Ein unbrauchbarer Zeitstempel in der Antwort wird nicht übernommen */
const zielZ = k(q);
F.antwortUebernehmen(zielZ, Object.assign({}, rueck, { gesendet: 'mitarbeiter' }), { serverGeprueft: true });
p(!isNaN(Date.parse(zielZ.freigabe.am)) && zielZ.freigabe.am !== 'mitarbeiter', 'ein unbrauchbarer Zeitstempel wird durch den Zeitpunkt der Übernahme ersetzt', zielZ.freigabe.am);
/* Träger eines Schlüssels lassen sich nicht über eine Rückmeldung entfernen */
const zielT = k(q);
const traeger = q.schliessungen.filter(s => (s.traeger || []).length)[0];
const bT = F.antwortUebernehmen(zielT, F.antwortErstellen(rund, matrix, { max: [traeger.traeger[0]] }), {});
p(bT.mitarbeiterEntfernt === 0 && M.mitarbeiterVon(zielT, traeger.traeger[0]) && bT.aenderungen.some(x => x.art === 'behalten' && /Träger von/.test(x.grund)),
  'ein Träger einer Schließung bleibt erhalten - der Bericht nennt den Grund', JSON.stringify(bT.aenderungen));

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

console.log('\n== Zweimal eingelesen legt nichts doppelt an ==');
{
  const w = k(q);
  const d = F.erstellen(w, { freigegebeneSchliessungen: [w.schliessungen[0].id], rechte: { m: 1, g: 1, s: 1 } });
  F.freigabeMerken(w, d);
  const r = F.ausAnker(F.alsAnker(d));
  const a = F.antwortErstellen(r, r.matrix, {
    ma: k(r.ma).concat([['neu-m1', 'Frau Doppelt', [], [['Karte', 1]]]]), gr: k(r.gr).concat([['neu-g1', 'Neue Gruppe']]),
    n: [['gruppe', 'neu-g1', '1'.repeat(r.t.length)], ['mitarbeiter', 'neu-m1', '1' + '0'.repeat(r.t.length - 1)]] });
  const b1 = F.antwortUebernehmen(w, a, {});
  const stand1 = JSON.stringify([w.mitarbeiter.length, w.gruppen.length, w.schliessungen.length]);
  const b2 = F.antwortUebernehmen(w, a, {});
  p(JSON.stringify([w.mitarbeiter.length, w.gruppen.length, w.schliessungen.length]) === stand1, 'zweimal dieselbe Rückmeldung: weder Mitarbeiter noch Gruppen noch Spalten doppelt', stand1);
  p(b2.mitarbeiterNeu === 0 && b2.gruppenNeu === 0 && b2.spaltenNeu === 0, 'der zweite Bericht meldet nichts Neues', JSON.stringify(b2));
  p(!!b2.bereitsUebernommen && !b1.bereitsUebernommen, 'der zweite Bericht weiß, dass die Rückmeldung schon übernommen war');
  p(/^ma-/.test(w.kundenKennungen['neu-m1'] || '') && /^grp-/.test(w.kundenKennungen['neu-g1'] || ''), 'die Kennungen des Kunden sind den echten zugeordnet', JSON.stringify(w.kundenKennungen));
  /* Nachbesserung des Kunden mit denselben Kennungen (so kommt sie über den Server) */
  const a2 = F.antwortErstellen(r, r.matrix, { ma: k(r.ma).concat([['neu-m1', 'Frau Doppelt-Korrigiert', ['neu-g1'], [['Karte', 2]]]]), n: [['mitarbeiter', 'neu-m1', '11' + '0'.repeat(r.t.length - 2)]] });
  const b3 = F.antwortUebernehmen(w, a2, { serverGeprueft: true });
  const doppelt = w.mitarbeiter.filter(m => /Doppelt/.test(m.name));
  p(doppelt.length === 1 && doppelt[0].name === 'Frau Doppelt-Korrigiert' && doppelt[0].medien[0].anzahl === 2 && doppelt[0].gruppen.length === 1 && M.gruppeVon(w, doppelt[0].gruppen[0]).name === 'Neue Gruppe',
    'eine Nachbesserung ändert den vorhandenen Eintrag (Name, Medien, neue Gruppe) statt einen zweiten anzulegen', JSON.stringify(doppelt));
  p(b3.spaltenNeu === 0 && b3.aenderungen.some(x => x.spalte && x.vorhanden) && w.schliessungen.filter(s => s.mitarbeiterId === doppelt[0].id).length === 1,
    'die Spalte des Kunden gibt es schon - sie wird ergänzt, nicht verdoppelt', JSON.stringify(b3.aenderungen.filter(x => x.spalte)));
  /* Auch über ein zweites Gerät, das die Zuordnung mitbekommen hat (Projekt synchronisiert) */
  const w2 = JSON.parse(JSON.stringify(w));
  const b4 = F.antwortUebernehmen(w2, a, {});
  p(b4.mitarbeiterNeu === 0 && b4.gruppenNeu === 0 && w2.mitarbeiter.length === w.mitarbeiter.length, 'auf einem zweiten Gerät mit demselben Aufmaß passiert ebenfalls nichts doppelt');
}

console.log('\n== Änderungen im Werkzeug überleben die Rückmeldung ==');
{
  const w = k(q);
  const d = F.erstellen(w, { freigegebeneSchliessungen: [], rechte: { m: 1, g: 1, s: 0 } });
  F.freigabeMerken(w, d);
  const r = F.ausAnker(F.alsAnker(d));
  /* Inzwischen im Werkzeug: Name von ma[0], Gruppen von ma[1], Medien von ma[2], Name von gr[0] */
  w.mitarbeiter[0].name = 'Umbenannt im Werkzeug';
  w.mitarbeiter[1].gruppen = [w.gruppen[1].id];
  w.mitarbeiter[2].medien = [{ typ: 'Karte', anzahl: 7 }];
  w.gruppen[0].name = 'Gruppe umbenannt';
  /* Der Kunde ändert anderes: Medien von ma[0], Name von ma[1], Name von gr[1] */
  const ma = k(r.ma); ma[0][3] = [['Transponder', 5]]; ma[1][1] = 'Vom Kunden umbenannt';
  const gr = k(r.gr); gr[1][1] = 'Vom Kunden benannt';
  const a = F.antwortErstellen(r, r.matrix, { ma: ma, gr: gr });
  p(a.ma.length === 2 && a.gr.length === 1, 'die Rückmeldung enthält nur die angefassten Einträge', JSON.stringify([a.ma.map(x => x[0]), a.gr]));
  const b = F.antwortUebernehmen(w, a, {});
  p(w.mitarbeiter[0].name === 'Umbenannt im Werkzeug' && w.mitarbeiter[0].medien.length === 1 && w.mitarbeiter[0].medien[0].typ === 'Transponder' && w.mitarbeiter[0].medien[0].anzahl === 5,
    'beim selben Mitarbeiter bleibt der Name aus dem Werkzeug, die Medien des Kunden kommen', JSON.stringify(w.mitarbeiter[0]));
  p(w.mitarbeiter[1].name === 'Vom Kunden umbenannt' && w.mitarbeiter[1].gruppen.length === 1 && w.mitarbeiter[1].gruppen[0] === w.gruppen[1].id,
    'der Name des Kunden kommt, die im Werkzeug gesetzte Gruppe bleibt', JSON.stringify(w.mitarbeiter[1]));
  p(w.mitarbeiter[2].medien[0].anzahl === 7, 'ein unberührter Mitarbeiter behält die im Werkzeug geänderten Medien');
  p(w.gruppen[0].name === 'Gruppe umbenannt' && w.gruppen[1].name === 'Vom Kunden benannt', 'die im Werkzeug umbenannte Gruppe bleibt, die vom Kunden benannte kommt', JSON.stringify(w.gruppen.map(g => g.name)));
  const ge = b.aenderungen.filter(x => x.mitarbeiter && x.art === 'geaendert');
  p(ge.length === 2 && ge.every(x => x.felder && x.felder.length === 1) && ge.map(x => x.felder[0]).sort().join() === 'Medien,Name',
    'der Bericht nennt je Mitarbeiter genau das geänderte Feld', JSON.stringify(ge.map(x => x.felder)));
}

console.log('\n== Der Link kennt gleichschließende Türen, die Daten sind Text ==');
{
  const w = k(q);
  const mit = M.gleichschliessendSetzen(w, w.tueren[2].id, w.tueren[0].id);
  const d = F.erstellen(w, { freigegebeneSchliessungen: [w.schliessungen[0].id] });
  p(mit === true && Array.isArray(d.vb) && d.vb.length === 1 && d.vb[0][0] === w.tueren[0].id && d.vb[0].indexOf(w.tueren[2].id) !== -1,
    'gleichschließende Türen stehen als Verbund im Link, Haupttür zuerst', JSON.stringify(d.vb));
  const r = F.ausAnker(F.alsAnker(d));
  p(JSON.stringify(r.vb) === JSON.stringify(d.vb), 'der Verbund übersteht den Anker');
  const kaputt = F.ausAnker(F.alsAnker(Object.assign({}, d, { vb: [['fremd', w.tueren[0].id], [w.tueren[1].id], 'x', null, [w.tueren[0].id, w.tueren[0].id, w.tueren[2].id]], hinweis: { g: '__proto__' }, kunde: ['a'], frist: 7, firma: null, objekt: 'Bleibt' })));
  p(JSON.stringify(kaputt.vb) === JSON.stringify([[w.tueren[0].id, w.tueren[2].id]]), 'unbekannte Türen, Einzelne und Doppelte fallen aus dem Verbund', JSON.stringify(kaputt.vb));
  p(kaputt.hinweis === '' && kaputt.kunde === '' && kaputt.frist === '7' && kaputt.firma === '' && kaputt.objekt === 'Bleibt',
    'Anzeigetexte sind nach dem Lesen immer Text - ein Objekt im Hinweis ließ die Kundenseite abstürzen', JSON.stringify([kaputt.hinweis, kaputt.kunde, kaputt.frist, kaputt.firma]));
}

console.log('\n== Der Link kennt seine Freigabe; zurückgezogene gelten nicht ==');
{
  const w = k(q); w.freigabenLokal = [];
  const d1 = F.erstellen(w, { freigegebeneSchliessungen: [w.schliessungen[0].id], rechte: { m: 0, g: 0, s: 0 } });
  F.freigabeMerken(w, d1);
  const d2 = F.erstellen(w, { freigegebeneSchliessungen: [w.schliessungen[0].id], rechte: { m: 1, g: 1, s: 1 } });
  F.freigabeMerken(w, d2);
  p(d1.fid && d2.fid && d1.fid !== d2.fid && w.freigabenLokal.some(f => f.id === d1.fid), 'jeder Link trägt die Kennung seiner Freigabe');
  const r1 = F.ausAnker(F.alsAnker(d1));
  const a1 = F.antwortErstellen(r1, r1.matrix, { ma: k(r1.ma).concat([['neu-m7', 'Über Link 1', [], []]]) });
  p(a1.fid === d1.fid, 'die Antwort bringt die Kennung zurück');
  const b1 = F.antwortUebernehmen(w, a1, {});
  p(b1.mitarbeiterNeu === 0 && b1.listenUebersprungen === 1, 'eine Antwort auf den engen Link erbt nicht die Rechte des weiten Links', JSON.stringify(b1));
  const r2 = F.ausAnker(F.alsAnker(d2));
  const a2 = F.antwortErstellen(r2, r2.matrix, { ma: k(r2.ma).concat([['neu-m8', 'Über Link 2', [], []]]) });
  w.freigabenLokal.filter(f => f.id === d2.fid)[0].zurueckgezogen = '2026-11-20T10:00:00.000Z';
  let fz = null;
  try { F.antwortUebernehmen(w, a2, {}); } catch (e) { fz = e; }
  p(fz && fz.code === 'zurueckgezogen' && /2026-11-20/.test(fz.message), 'eine Antwort auf einen zurückgezogenen Link wird mit Datum abgelehnt', fz && fz.message);
  const alt = F.antwortErstellen(r2, r2.matrix, { ma: k(r2.ma).concat([['neu-m9', 'Ohne Kennung', [], []]]) });
  delete alt.fid;
  const bAlt = F.antwortUebernehmen(w, alt, {});
  p(bAlt.mitarbeiterNeu === 0 && bAlt.listenUebersprungen === 1, 'ohne Kennung (ältere Links) gilt die Vereinigung der nicht zurückgezogenen Links - hier nur der enge', JSON.stringify(bAlt));
  /* Gesperrte und befristete Vorgaben bleiben auf Wunsch gesperrt */
  const v = k(q);
  const s0 = v.schliessungen[0].id;
  M.setBerechtigung(v, v.tueren[0].id, s0, 'sperr'); M.setBerechtigung(v, v.tueren[1].id, s0, 'temp'); M.setBerechtigung(v, v.tueren[2].id, s0, 'plan'); M.setBerechtigung(v, v.tueren[3].id, s0, 'ja');
  const dv = F.ausAnker(F.alsAnker(F.erstellen(v, { freigegebeneSchliessungen: [s0], vorgabenSchuetzen: true })));
  const sp = dv.s.findIndex(s => s[0] === s0);
  const maskeVon = id => dv.maske[dv.t.findIndex(t => t[0] === id) * dv.s.length + sp];
  p(maskeVon(v.tueren[0].id) === '0' && maskeVon(v.tueren[1].id) === '0' && maskeVon(v.tueren[2].id) === '1' && maskeVon(v.tueren[3].id) === '1',
    'mit Schutz bleiben – und T gesperrt, O und X sind frei', [maskeVon(v.tueren[0].id), maskeVon(v.tueren[1].id), maskeVon(v.tueren[2].id), maskeVon(v.tueren[3].id)].join(''));
  const dv2 = F.ausAnker(F.alsAnker(F.erstellen(v, { freigegebeneSchliessungen: [s0], vorgabenSchuetzen: false })));
  p(dv2.maske[dv2.t.findIndex(t => t[0] === v.tueren[0].id) * dv2.s.length + sp] === '1', 'ohne Schutz ist auch – frei');
  /* Übersprungene Felder stehen mit Tür, Spalte, Wunsch und Grund im Bericht */
  const u = k(q);
  const du = F.erstellen(u, { freigegebeneSchliessungen: [u.schliessungen[0].id, u.schliessungen[1].id] });
  F.freigabeMerken(u, du);
  const ru = F.ausAnker(F.alsAnker(du));
  const geaendert = ru.matrix.split('');
  const z0 = 0 * ru.s.length + ru.s.findIndex(s => s[0] === u.schliessungen[0].id);
  const z1 = 1 * ru.s.length + ru.s.findIndex(s => s[0] === u.schliessungen[1].id);
  geaendert[z0] = ru.matrix[z0] === '1' ? '2' : '1'; geaendert[z1] = ru.matrix[z1] === '1' ? '2' : '1';
  const au = F.antwortErstellen(ru, geaendert.join(''), {});
  const tuerWeg = ru.t[0][1], spalteWeg = ru.s.find(s => s[0] === u.schliessungen[1].id)[1];
  u.tueren = u.tueren.filter(t => t.id !== ru.t[0][0]);
  u.schliessungen = u.schliessungen.filter(s => s.id !== du.s.find(s => s[0] === u.schliessungen[1].id)[0]);
  const bu = F.antwortUebernehmen(u, au, {});
  const aus = bu.aenderungen.filter(x => x.uebersprungen);
  p(bu.uebersprungen === 2 && aus.length === 2 && aus.some(x => x.tuer === tuerWeg && /Tür gibt es/.test(x.grund) && (x.nachher === 'ja' || x.nachher === 'zeit'))
    && aus.some(x => x.schliessung === spalteWeg && /Spalte gibt es/.test(x.grund)),
    'übersprungene Felder nennen Tür, Spalte, gewünschten Wert und Grund', JSON.stringify(aus));
  /* Widerspruch bei gleichschließenden Türen in einer von Hand gebauten Antwort */
  const g = k(q);
  M.gleichschliessendSetzen(g, g.tueren[1].id, g.tueren[0].id);
  const dg = F.erstellen(g, { freigegebeneSchliessungen: [g.schliessungen[0].id] });
  F.freigabeMerken(g, dg);
  const rg = F.ausAnker(F.alsAnker(dg));
  const spg = rg.s.findIndex(s => s[0] === g.schliessungen[0].id);
  const i0 = rg.t.findIndex(t => t[0] === g.tueren[0].id) * rg.s.length + spg, i1 = rg.t.findIndex(t => t[0] === g.tueren[1].id) * rg.s.length + spg;
  const ag = Object.assign(F.antwortErstellen(rg, rg.matrix, {}), { a: i0.toString(36) + ':1,' + i1.toString(36) + ':2' });
  const bg = F.antwortUebernehmen(g, ag, {});
  p(bg.aenderungen.some(x => x.hinweis && /Widerspruch bei gleichschließenden Türen/.test(x.text)), 'ein Widerspruch zwischen Haupttür und Mitläufer steht im Bericht', JSON.stringify(bg.aenderungen.filter(x => x.hinweis)));
  p(bg.aenderungen.some(x => x.tuer !== undefined && !x.uebersprungen && x.mit && x.mit.length === 1), 'die Zeile im Bericht nennt die gleichschließende Partnertür', JSON.stringify(bg.aenderungen.filter(x => x.mit)));
}

console.log('\n== Kennungen wie „constructor“ und „__proto__“ stören nicht ==');
['constructor', '__proto__', 'hasOwnProperty'].forEach(bose => {
  const w = k(q); w.freigabenLokal = [];
  const g = M.neueGruppe({ name: 'Gruppe ' + bose }); g.id = bose; w.gruppen.push(g);
  const m = M.neuerMitarbeiter({ name: 'Herr ' + bose, gruppen: [bose], medien: [] }); m.id = bose; w.mitarbeiter.push(m);
  const d = F.erstellen(w, { freigegebeneSchliessungen: [w.schliessungen[0].id], rechte: { m: 1, g: 1, s: 1 } });
  F.freigabeMerken(w, d);
  const r = F.ausAnker(F.alsAnker(d));
  p(r.gr.some(x => x[0] === bose) && r.ma.some(x => x[0] === bose), 'Gruppe und Mitarbeiter mit Kennung „' + bose + '“ reisen im Link mit', JSON.stringify([r.gr.map(x => x[0]), r.ma.map(x => x[0])]));
  const gr = k(r.gr); gr.find(x => x[0] === bose)[1] = 'Umbenannt';
  const ma = k(r.ma); ma.find(x => x[0] === bose)[1] = 'Herr Umbenannt';
  const a = F.antwortErstellen(r, r.matrix, { gr: gr, ma: ma, n: [['gruppe', bose, '1'.repeat(r.t.length)]] });
  const b = F.antwortUebernehmen(w, a, {});
  p(b.gruppenGeaendert === 1 && b.mitarbeiterGeaendert === 1 && b.spaltenNeu === 1 && M.gruppeVon(w, bose).name === 'Umbenannt' && M.mitarbeiterVon(w, bose).name === 'Herr Umbenannt',
    'Umbenennen und neue Spalte funktionieren auch mit Kennung „' + bose + '“', JSON.stringify(b));
  p(Object.prototype.toString.call({}) === '[object Object]' && typeof ({}).hasOwnProperty === 'function', 'Object.prototype ist unversehrt');
});
{
  /* 101 Links: der erste, nicht zurückgezogene bleibt bekannt, wenn zurückgezogene weichen können */
  const w = k(q); w.freigabenLokal = [];
  const erste = F.erstellen(w, { freigegebeneSchliessungen: [w.schliessungen[0].id] });
  F.freigabeMerken(w, erste);
  for (let i = 0; i < 100; i++) { const d = F.erstellen(w, { freigegebeneSchliessungen: [w.schliessungen[0].id] }); F.freigabeMerken(w, d); if (i < 60) w.freigabenLokal[w.freigabenLokal.length - 1].zurueckgezogen = '2026-01-01T00:00:00.000Z'; }
  p(w.freigabenLokal.length === 100 && w.freigabenLokal.some(f => f.id === erste.fid), 'bei über 100 Links weichen zuerst zurückgezogene - der erste gültige Link bleibt bekannt', String(w.freigabenLokal.length));
}

console.log('\n== Bereinigungen wie der Server: Rechte, Kennungen, Anzahl, Zeichenpaare ==');
{
  const R = F.rechteBereinigen;
  p(JSON.stringify(R({ m: '0', g: [], s: {} })) === JSON.stringify({ m: 0, g: 0, s: 0 }), '„0“, leere Liste und leeres Objekt sind kein Recht (wie !empty auf dem Server)', JSON.stringify(R({ m: '0', g: [], s: {} })));
  p(JSON.stringify(R({ m: '1', g: 1, s: true })) === JSON.stringify({ m: 1, g: 1, s: 1 }) && JSON.stringify(R([1, 1, 1])) === JSON.stringify({ m: 0, g: 0, s: 0 }), '„1“, 1 und true sind Rechte, eine Liste statt Objekt nicht');
  p(F._intern.kennung(['m1']) === '' && F._intern.kennung(true) === '' && F._intern.kennung('m1') === 'm1' && F._intern.kennung(12) === '12', 'nur Text und Zahl sind Kennungen - keine Listen, kein true');
  const halb = F._intern.text('x'.repeat(119) + '🙂', 120);
  p(halb.length === 119 && !/[\uD800-\uDBFF]$/.test(halb) && JSON.stringify(halb).indexOf('\\ud83d') === -1, 'ein Emoji an der Längengrenze wird nicht halbiert');
  p(F._intern.text({ a: 1 }, 50) === '' && F._intern.text(['a'], 50) === '' && F._intern.text(7, 50) === '7', 'Objekte und Listen sind kein Text, Zahlen schon');
  const mb = F.medienBereinigen([['Karte', '1e3'], ['Karte', '12abc'], ['Transponder', 1.9]]);
  p(JSON.stringify(mb) === JSON.stringify([['Karte', 13], ['Transponder', 1]]), 'Anzahlen zählen führende Ziffern: 1e3 ist 1, 12abc ist 12, 1,9 ist 1', JSON.stringify(mb));
  /* Einträge ohne Kennung werden nicht angelegt - sie kämen bei jeder Übernahme neu */
  const w = k(q); w.freigabenLokal = [];
  const d = F.erstellen(w, { freigegebeneSchliessungen: [], rechte: { m: 1, g: 1, s: 0 } });
  F.freigabeMerken(w, d);
  const r = F.ausAnker(F.alsAnker(d));
  const vorMa = w.mitarbeiter.length, vorGr = w.gruppen.length;
  const b = F.antwortUebernehmen(w, Object.assign(F.antwortErstellen(r, r.matrix, {}), { ma: [['', 'Ohne Kennung', [], []]], gr: [['', 'Gruppe ohne Kennung']] }), {});
  p(w.mitarbeiter.length === vorMa && w.gruppen.length === vorGr && b.listenUebersprungen === 2, 'Mitarbeiter und Gruppen ohne Kennung werden übersprungen statt angelegt', JSON.stringify(b));
}

console.log('\n== Gleiche Namen werden im Bericht genannt ==');
{
  const w = k(q);
  F.freigabeMerken(w, daten);
  const vorhandener = w.mitarbeiter[0].name;
  const a = F.antwortErstellen(rund, rund.matrix, { ma: k(rund.ma).concat([['neu-m9', vorhandener.toUpperCase() + '  ', [], []], ['neu-m8', 'Ganz Neu', [], []]]),
    gr: k(rund.gr).concat([['neu-g9', ' ' + w.gruppen[0].name.toLowerCase()]]) });
  const b = F.antwortUebernehmen(w, a, {});
  const ma = b.aenderungen.filter(x => x.mitarbeiter && x.art === 'neu');
  const gr = b.aenderungen.filter(x => x.gruppe && x.art === 'neu');
  p(ma.length === 2 && ma.filter(x => x.dublette).length === 1 && ma.find(x => x.dublette).name.trim().toLowerCase() === vorhandener.toLowerCase(),
    'ein neuer Mitarbeiter mit vorhandenem Namen (anders geschrieben) wird als Dublette gekennzeichnet, ein wirklich neuer nicht', JSON.stringify(ma));
  p(gr.length === 1 && gr[0].dublette === true, 'dasselbe für Gruppen', JSON.stringify(gr));
  p(F.namenGleich('Herr  Baumann', 'herr baumann ') && !F.namenGleich('', '') && !F.namenGleich('A', 'B'), 'Namensvergleich ohne Groß/Klein und Leerraum, leer zählt nie gleich');
}

console.log('\n== Der Rückschlüssel kommt aus einer E-Mail ==');
{
  const w = k(q);
  F.freigabeMerken(w, daten);
  const antwort = F.antwortErstellen(rund, rund.matrix.split('').map((z, i) => (rund.maske[i] === '1' && i < 3) ? '1' : z), {});
  const schluessel = F.antwortAlsSchluessel(antwort);
  const erwartet = JSON.stringify(F.antwortAusSchluessel(schluessel));
  function liest(text, name) { try { p(JSON.stringify(F.antwortAusSchluessel(text)) === erwartet, name); } catch (e) { p(false, name, e.message); } }
  liest('https://beispiel.example/aufmasstool/freigabe.html#antwort=' + schluessel, 'als vollständige Adresse mit #antwort=');
  liest(schluessel.replace(/(.{76})/g, '$1\r\n'), 'vom Mailprogramm alle 76 Zeichen umbrochen');
  liest(schluessel.replace(/(.{40})/g, '$1 '), 'mit eingestreuten Leerzeichen');
  liest('  ' + schluessel.replace(/(.{60})/g, '$1\n   ') + '\n', 'eingerückt mit Zeilenumbrüchen und Rändern');
  liest('Guten Tag,\n\nanbei meine Rückmeldung zum Schließplan Bürogebäude.\n\nRückschlüssel:\n' + schluessel + '\n\nMit freundlichen Grüßen\nK. Müller', 'als ganzer Mailtext mit dem Schlüssel auf eigener Zeile');
  liest('Rückschlüssel: ' + schluessel + ' - bitte übernehmen. Danke, Müller', 'im Fließtext mit Satzzeichen davor und danach');
  liest('> ' + schluessel.replace(/(.{70})/g, '$1\n> '), 'als zitierte Antwort mit > am Zeilenanfang');
  const kaputt = [];
  try { F.antwortAusSchluessel(schluessel.slice(0, Math.floor(schluessel.length / 2))); kaputt.push('halb'); } catch (e) { p(/nicht lesbar/.test(e.message), 'ein halber Schlüssel wird als nicht lesbar gemeldet', e.message); }
  try { F.antwortAusSchluessel('Guten Tag, hier ist nichts drin.'); kaputt.push('leer'); } catch (e) { p(/nicht lesbar/.test(e.message), 'ein Text ohne Schlüssel wird als nicht lesbar gemeldet', e.message); }
  try { F.antwortAusSchluessel(F.alsAnker(daten)); kaputt.push('plan'); } catch (e) { p(/keine Kundenantwort/.test(e.message), 'der Plan-Link selbst ist keine Kundenantwort', e.message); }
  p(kaputt.length === 0, 'nichts Unlesbares wird angenommen', kaputt.join(','));
}

console.log('\nErgebnis Freigabe-Listen: ' + ok + ' ok, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
