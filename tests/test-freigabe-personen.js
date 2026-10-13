/* Inhaberlisten auf der Kundenfreigabe: Daten hin, Daten zurück, Übernahme. */
const W = __dirname + '/..';
require(W + '/src/js/catalog.js');
const M = require(W + '/src/js/model.js'); global.Model = M;
require(W + '/src/js/freigabe.js'); const F = global.Freigabe;
const { baueTestprojekt } = require(W + '/tests/fixture.js');

let ok = 0, fehler = 0;
function p(b, t, i) { if (b) ok++; else { fehler++; console.log('  FEHL  ' + t + (i ? '\n          -> ' + i : '')); } }

console.log('\n== Der Link bringt die Inhaber mit - aber nur für freigegebene Schließungen ==');
const q = baueTestprojekt();
const frei = [q.schliessungen[0].id, q.schliessungen[4].id];
const daten = F.erstellen(q, { freigegebeneSchliessungen: frei });
/* Wie beim Erzeugen des Links im Werkzeug: Das Projekt merkt sich die Freigabe */
F.freigabeMerken(q, daten);
const mit = daten.s.filter(s => s[4]), ohne = daten.s.filter(s => !s[4]);
p(mit.length === 2, 'genau die zwei freigegebenen tragen eine Inhaberliste', mit.length);
p(ohne.length === daten.s.length - 2, 'alle anderen nicht');
p(mit[0][4].p.length === q.schliessungen[0].personen.length, 'die Liste ist vollständig',
  JSON.stringify(mit[0][4].p));
p(mit[0][4].p.every(x => Array.isArray(x) && x.length === 3 && typeof x[0] === 'string'),
  'jede Person steht als [Name, Funktion, Anzahl]');
p(JSON.stringify(daten).indexOf('"id":"per-') === -1 && !/per-[a-z0-9]+-/.test(JSON.stringify(mit[0][4])),
  'interne Personen-Kennungen reisen nicht mit zum Kunden');
const grp = daten.s.filter(s => s[4] && s[4].a === 'gruppe')[0];
p(grp ? grp[4].g !== '' : true, 'bei einer Gruppe reist der Gruppenname mit');
const rund = F.ausAnker(F.alsAnker(daten));
p(JSON.stringify(rund.s) === JSON.stringify(daten.s), 'die Inhaberlisten überstehen den Anker unverändert');
const ohneFrei = F.erstellen(q, { freigegebeneSchliessungen: [] });
p(ohneFrei.s.every(s => !s[4]), 'ohne Freigabe reist keine Inhaberliste mit');
const laengeOhne = F.alsAnker(F.erstellen(q, {})).length, laengeMit = F.alsAnker(daten).length;
p(laengeMit - laengeOhne < 800, 'die Inhaberlisten kosten wenig Platz (+' + (laengeMit - laengeOhne) + ' Zeichen)');

console.log('\n== Die Rückmeldung enthält nur geänderte Listen ==');
const matrix = rund.matrix;
const unveraendert = rund.s.map(s => s[4] ? s[4].p.map(x => x.slice()) : null);
let antwort = F.antwortErstellen(rund, matrix, unveraendert);
p(antwort.p === undefined, 'unveränderte Listen erzeugen keinen Eintrag');
const bearbeitet = rund.s.map(s => s[4] ? s[4].p.map(x => x.slice()) : null);
bearbeitet[0].push(['Frau Neu', 'Empfang', 2]);
bearbeitet[0][0][2] = 5;                                    /* Anzahl geändert */
antwort = F.antwortErstellen(rund, matrix, bearbeitet);
p(antwort.p && Object.keys(antwort.p).length === 1, 'genau eine geänderte Liste in der Rückmeldung',
  JSON.stringify(antwort.p));
p(antwort.p && antwort.p['0'] && antwort.p['0'].length === bearbeitet[0].length, 'mit allen Personen');
/* Reihenfolge-Tausch allein gilt als Änderung? Ja - die Liste ist anders. */
const getauscht = rund.s.map(s => s[4] ? s[4].p.map(x => x.slice()) : null);
if (getauscht[0].length > 1) { const t = getauscht[0][0]; getauscht[0][0] = getauscht[0][1]; getauscht[0][1] = t; }
antwort = F.antwortErstellen(rund, matrix, getauscht);
p(getauscht[0].length < 2 || (antwort.p && antwort.p['0']), 'eine andere Reihenfolge zählt als Änderung');
/* Leere Namen fallen heraus, Unsinn wird begrenzt */
const unsinn = rund.s.map(s => s[4] ? s[4].p.map(x => x.slice()) : null);
unsinn[0] = [['   ', 'leer', 1], ['Herr Lang', 'x'.repeat(500), 999], ['Frau Null', '', 0], ['Frau Minus', '', -3]];
antwort = F.antwortErstellen(rund, matrix, unsinn);
const liste0 = antwort.p['0'];
p(liste0.length === 3, 'Personen ohne Namen fallen heraus', JSON.stringify(liste0));
p(liste0[0][1].length === 120, 'überlange Angaben werden gekappt');
p(liste0[0][2] === 99 && liste0[1][2] === 1 && liste0[2][2] === 1, 'Anzahl bleibt zwischen 1 und 99',
  JSON.stringify(liste0.map(x => x[2])));
/* Eine nicht freigegebene Schließung lässt sich auch mit Vorsatz nicht beschreiben */
const frech = rund.s.map(() => [['Eindringling', 'Hacker', 1]]);
antwort = F.antwortErstellen(rund, matrix, frech);
p(Object.keys(antwort.p).length === 2, 'nicht freigegebene Schließungen werden verworfen', JSON.stringify(Object.keys(antwort.p)));
const rueck = F.antwortAusSchluessel(F.antwortAlsSchluessel(antwort));
p(JSON.stringify(rueck.p) === JSON.stringify(antwort.p), 'die Listen überstehen den Rückschlüssel');

console.log('\n== Übernahme ins Projekt ==');
const ziel = JSON.parse(JSON.stringify(q));
const s0 = ziel.schliessungen[0];
const idVorher = s0.personen[0].id, nameVorher = s0.personen[0].name;
const vorherZahl = s0.personen.length;
const neuListe = rund.s.map(s => s[4] ? s[4].p.map(x => x.slice()) : null);
neuListe[0] = [[nameVorher, 'Geschäftsführung', 4], ['Frau Neu', 'Empfang', 2]];   /* eine bleibt (anders), eine neu, Rest weg */
const a2 = F.antwortErstellen(rund, matrix, neuListe);
const bericht = F.antwortUebernehmen(ziel, a2, {});
p(bericht.personenListen === 1, 'eine Inhaberliste wurde übernommen', JSON.stringify(bericht));
p(s0.personen.length === 2, 'die Liste hat jetzt zwei Personen', s0.personen.length);
p(s0.personen[0].id === idVorher, 'die bekannte Person behält ihre Kennung', s0.personen[0].id + ' vs ' + idVorher);
p(s0.personen[0].anzahlMedien === 4, 'und bekommt die neue Anzahl');
p(/^per-/.test(s0.personen[1].id) && s0.personen[1].name === 'Frau Neu', 'die neue Person hat eine frische Kennung');
p(M.medienAnzahl(s0) === 6 || s0.medienVonHand, 'die Medienzahl wurde nachgerechnet (' + M.medienAnzahl(s0) + ')');
const eintrag = bericht.aenderungen.filter(x => x.personen)[0];
p(eintrag && eintrag.vorher === vorherZahl && eintrag.nachher === 2, 'der Bericht nennt vorher/nachher',
  JSON.stringify(eintrag));
p(eintrag && eintrag.namen.join() === nameVorher + ',Frau Neu', 'und die Namen');

/* Großschreibung darf die Wiedererkennung nicht stören */
const ziel2 = JSON.parse(JSON.stringify(q));
const l2 = rund.s.map(s => s[4] ? s[4].p.map(x => x.slice()) : null);
l2[0] = [[nameVorher.toUpperCase(), '', 1]];
F.antwortUebernehmen(ziel2, F.antwortErstellen(rund, matrix, l2), {});
p(ziel2.schliessungen[0].personen[0].id === idVorher, 'Großschreibung stört die Wiedererkennung nicht');

/* Leere Liste = der Kunde hat alle entfernt */
const ziel3 = JSON.parse(JSON.stringify(q));
const l3 = rund.s.map(s => s[4] ? s[4].p.map(x => x.slice()) : null);
l3[0] = [];
const b3 = F.antwortUebernehmen(ziel3, F.antwortErstellen(rund, matrix, l3), {});
p(ziel3.schliessungen[0].personen.length === 0 && b3.personenListen === 1, 'eine geleerte Liste wird übernommen');

/* Eine Schließung ohne Trägerart wird zu Einzelpersonen - eine Gruppe bleibt Gruppe */
const ziel4 = JSON.parse(JSON.stringify(q));
ziel4.schliessungen[0].traegerArt = '';
const grpIndex = rund.s.findIndex(s => s[4] && s[4].a === 'gruppe');
const l4 = rund.s.map(s => s[4] ? s[4].p.map(x => x.slice()) : null);
l4[0] = [['Jemand', '', 1]];
if (grpIndex >= 0) l4[grpIndex] = [['Mitglied A', '', 1], ['Mitglied B', '', 1]];
F.antwortUebernehmen(ziel4, F.antwortErstellen(rund, matrix, l4), {});
p(ziel4.schliessungen[0].traegerArt === 'einzel', 'ohne Trägerart wird es „einzel“');
if (grpIndex >= 0) {
  const g = ziel4.schliessungen.filter(s => s.id === rund.s[grpIndex][0])[0];
  p(g.traegerArt === 'gruppe' && g.personen.length === 2, 'eine Gruppe bleibt Gruppe und bekommt die Mitglieder');
}

/* Rückmeldung zu einer Schließung, die es inzwischen nicht mehr gibt */
const ziel5 = JSON.parse(JSON.stringify(q));
ziel5.schliessungen = ziel5.schliessungen.slice(1);
const b5 = F.antwortUebernehmen(ziel5, a2, {});
p(b5.personenListen === 0 && b5.personenUebersprungen === 1, 'eine gelöschte Schließung wird übersprungen, nicht erfunden',
  JSON.stringify(b5));

/* Kaputte Rückmeldungen */
[{ p: 'quatsch' }, { p: null }, { p: { zz: 'x' } }, { p: { '0': 'kein array' } }, { p: { '0': [null, 5, 'x'] } }].forEach(k => {
  const z = JSON.parse(JSON.stringify(q));
  const vor = JSON.stringify(z.schliessungen);
  let f = null;
  try { F.antwortUebernehmen(z, Object.assign({ pid: z.id, tIds: rund.t.map(t => t[0]), sIds: rund.s.map(s => s[0]), a: '' }, k), {}); }
  catch (e) { f = e.message; }
  p(f === null && JSON.stringify(z.schliessungen) === vor, 'Unsinn ' + JSON.stringify(k).slice(0, 24) + ' richtet nichts an', f);
});

/* Alte Rückmeldungen ohne p funktionieren weiter */
const ziel6 = JSON.parse(JSON.stringify(q));
const alt6 = { f: 1, pid: ziel6.id, typ: 'antwort', tIds: rund.t.map(t => t[0]), sIds: rund.s.map(s => s[0]), a: '0:1' };
const b6 = F.antwortUebernehmen(ziel6, alt6, {});
p(b6.personenListen === 0 && typeof b6.uebernommen === 'number', 'eine Rückmeldung aus der alten Fassung läuft weiter');

console.log('\n== Die Rückmeldung wird gegen die abgelegte Freigabe geprüft ==');
{
  const tIds = rund.t.map(t => t[0]), sIds = rund.s.map(s => s[0]);
  const spalten = sIds.length;
  const freiSpalte = sIds.indexOf(frei[0]);
  const gesperrteSpalte = sIds.findIndex(id => frei.indexOf(id) === -1);
  /* Eine „veränderte“ Antwort: ein freigegebenes und ein gesperrtes Feld, eine Inhaberliste für eine gesperrte Schließung */
  const manipuliert = { f: 1, pid: q.id, typ: 'antwort', tIds, sIds,
    a: (0 * spalten + freiSpalte).toString(36) + ':1,' + (1 * spalten + gesperrteSpalte).toString(36) + ':1',
    p: { [gesperrteSpalte.toString(36)]: [['Eindringling', 'Fremd', 1]] } };
  const z = JSON.parse(JSON.stringify(q));
  const vorherGesperrt = M.getBerechtigung(z, tIds[1], sIds[gesperrteSpalte]);
  const vorherPersonen = JSON.stringify(z.schliessungen.find(s => s.id === sIds[gesperrteSpalte]).personen || []);
  const b = F.antwortUebernehmen(z, manipuliert, {});
  p(b.uebersprungen === 1 && b.personenUebersprungen === 1, 'gesperrtes Feld und gesperrte Liste werden übersprungen', JSON.stringify(b));
  p(M.getBerechtigung(z, tIds[1], sIds[gesperrteSpalte]) === vorherGesperrt, 'das gesperrte Feld bleibt, wie es war');
  p(JSON.stringify(z.schliessungen.find(s => s.id === sIds[gesperrteSpalte]).personen || []) === vorherPersonen, 'die gesperrte Inhaberliste bleibt unberührt');
  p(M.getBerechtigung(z, tIds[0], sIds[freiSpalte]) === 'ja' || b.uebernommen === 0, 'das freigegebene Feld wird übernommen');

  /* Ohne abgelegte Freigabe: Ablehnung, nichts ändert sich */
  const ohne = JSON.parse(JSON.stringify(q)); ohne.freigabenLokal = [];
  const vorOhne = JSON.stringify([ohne.matrix, ohne.schliessungen]);
  let code = null;
  try { F.antwortUebernehmen(ohne, manipuliert, {}); } catch (e) { code = e.code; }
  p(code === 'keine_freigabe', 'ohne bekannte Freigabe wird die Rückmeldung abgelehnt', code);
  p(JSON.stringify([ohne.matrix, ohne.schliessungen]) === vorOhne, 'und am Aufmaß ändert sich nichts');
  /* Nur der Serverweg darf ohne lokale Freigabe - dort hat der Server geprüft */
  const b2 = F.antwortUebernehmen(ohne, manipuliert, { serverGeprueft: true });
  p(typeof b2.uebernommen === 'number', 'serverseitig geprüfte Rückmeldungen laufen ohne lokale Freigabe');

  /* Zwei Links zum selben Plan: die Vereinigung gilt */
  const zwei = JSON.parse(JSON.stringify(q));
  F.freigabeMerken(zwei, F.erstellen(zwei, { freigegebeneSchliessungen: [sIds[gesperrteSpalte]] }));
  const b3 = F.antwortUebernehmen(zwei, manipuliert, {});
  p(b3.uebersprungen === 0 && b3.personenUebersprungen === 0, 'was in irgendeinem Link freigegeben war, darf der Kunde eintragen', JSON.stringify(b3));
  p(zwei.freigabenLokal.length === 2 && zwei.freigabenLokal.every(f => f.id && f.maske && Array.isArray(f.sFrei)), 'jeder Link hinterlässt einen Eintrag mit Maske');
}

console.log('\nErgebnis Freigabe-Inhaber: ' + ok + ' ok, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
