/* Der Drei-Wege-Vergleich ist die Stelle, an der ein Fehler still Daten
 * kostet. Entsprechend genau wird hier geprüft. */
const W = __dirname + '/..';
const Z = require(W + '/src/js/zusammenfuehren.js');

let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; } else { fehler++; console.log('  FEHL  ' + t + (i ? '\n          -> ' + i : '')); } }
function k(x) { return JSON.parse(JSON.stringify(x)); }

function tuer(id, zusatz) {
  return Object.assign({ id: id, nummer: id.toUpperCase(), bezeichnung: 'Tür ' + id,
    masseAussen: '30', masseInnen: '35', tuerblattstaerke: '40', fotos: [] }, zusatz || {});
}
function basisProjekt() {
  return {
    id: 'prj', kunde: 'Müller GmbH', objekt: 'Haus A', bemerkung: '',
    standorte: [{ id: 'st1', ebene: 'standort', name: 'Düsseldorf', parentId: null, sort: 0 }],
    tueren: [tuer('t1'), tuer('t2'), tuer('t3')],
    schliessungen: [{ id: 's1', kuerzel: 'GHS', bezeichnung: 'General', personen: [] }],
    matrix: { 't1|s1': 'ja' }
  };
}

console.log('\n== Nichts geändert ==');
let b = basisProjekt();
let e = Z.projekte(b, k(b), k(b));
p(e.konflikte.length === 0, 'ohne Änderung gibt es keinen Konflikt', JSON.stringify(e.konflikte));
p(JSON.stringify(e.ergebnis.tueren) === JSON.stringify(b.tueren), 'die Türen bleiben unverändert');
p(e.ergebnis.kunde === 'Müller GmbH', 'die Stammdaten bleiben unverändert');

console.log('\n== Nur eine Seite hat geändert ==');
b = basisProjekt();
let meins = k(b); meins.tueren[0].tuerblattstaerke = '68';
e = Z.projekte(b, meins, k(b));
p(e.konflikte.length === 0, 'nur ich geändert: kein Konflikt');
p(e.ergebnis.tueren[0].tuerblattstaerke === '68', 'meine Änderung bleibt erhalten');

let server = k(b); server.tueren[1].dornmass = '65';
e = Z.projekte(b, k(b), server);
p(e.konflikte.length === 0, 'nur die Gegenseite geändert: kein Konflikt');
p(e.ergebnis.tueren[1].dornmass === '65', 'deren Änderung kommt an');

console.log('\n== Der Alltag: zwei Leute, verschiedene Türen ==');
b = basisProjekt();
meins = k(b); server = k(b);
meins.tueren[0].tuerblattstaerke = '68';
meins.tueren[0].dornmass = '65';
server.tueren[2].tuerblattstaerke = '45';
server.tueren[2].entfernung = '72';
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 0, 'zwei Leute an verschiedenen Türen: kein Konflikt', JSON.stringify(e.konflikte));
p(e.ergebnis.tueren[0].tuerblattstaerke === '68' && e.ergebnis.tueren[0].dornmass === '65',
  'meine beiden Angaben bleiben');
p(e.ergebnis.tueren[2].tuerblattstaerke === '45' && e.ergebnis.tueren[2].entfernung === '72',
  'deren beide Angaben kommen an');
p(e.bericht.meine >= 2 && e.bericht.fremde >= 2, 'der Bericht zählt beide Seiten',
  JSON.stringify(e.bericht));

console.log('\n== Dieselbe Tür, verschiedene Angaben ==');
b = basisProjekt();
meins = k(b); server = k(b);
meins.tueren[0].tuerblattstaerke = '68';
server.tueren[0].dornmass = '65';
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 0, 'dieselbe Tür, aber verschiedene Felder: kein Konflikt', JSON.stringify(e.konflikte));
p(e.ergebnis.tueren[0].tuerblattstaerke === '68' && e.ergebnis.tueren[0].dornmass === '65',
  'beide Angaben stehen nebeneinander');

console.log('\n== Echter Konflikt ==');
b = basisProjekt();
meins = k(b); server = k(b);
meins.tueren[0].tuerblattstaerke = '68';
server.tueren[0].tuerblattstaerke = '70';
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 1, 'genau ein Konflikt', JSON.stringify(e.konflikte));
const kf = e.konflikte[0];
p(kf.bereich === 'Tür', 'der Konflikt nennt den Bereich', kf.bereich);
p(kf.gegenstand === 'T1', 'der Konflikt nennt die Tür', kf.gegenstand);
p(kf.feldName === 'Türblattstärke', 'der Konflikt nennt das Feld im Klartext', kf.feldName);
p(kf.meins === '68' && kf.server === '70', 'beide Werte liegen bei');
p(e.ergebnis.tueren[0].tuerblattstaerke === '68', 'vorläufig gilt meine Fassung');
let gewaehlt = Z.anwenden(e.ergebnis, e.konflikte, { [kf.id]: 'server' });
p(gewaehlt.tueren[0].tuerblattstaerke === '70', 'die Wahl „deren Fassung“ greift');
gewaehlt = Z.anwenden(e.ergebnis, e.konflikte, { [kf.id]: 'meins' });
p(gewaehlt.tueren[0].tuerblattstaerke === '68', 'die Wahl „meine Fassung“ greift');
gewaehlt = Z.anwenden(e.ergebnis, e.konflikte, {});
p(gewaehlt.tueren[0].tuerblattstaerke === '68', 'ohne Wahl bleibt meine Fassung');

console.log('\n== Beide gleich geändert ==');
b = basisProjekt();
meins = k(b); server = k(b);
meins.tueren[0].tuerblattstaerke = '68';
server.tueren[0].tuerblattstaerke = '68';
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 0, 'dieselbe Änderung auf beiden Seiten ist kein Streit');
p(e.ergebnis.tueren[0].tuerblattstaerke === '68', 'der Wert steht');

console.log('\n== Türen hinzufügen ==');
b = basisProjekt();
meins = k(b); server = k(b);
meins.tueren.push(tuer('t4', { bezeichnung: 'Von mir' }));
server.tueren.push(tuer('t5', { bezeichnung: 'Von drüben' }));
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 0, 'beide fügen Türen hinzu: kein Konflikt');
const ids = e.ergebnis.tueren.map(t => t.id);
p(ids.length === 5, 'alle fünf Türen sind da', JSON.stringify(ids));
p(ids.indexOf('t4') !== -1 && ids.indexOf('t5') !== -1, 'beide neuen Türen überleben');

console.log('\n== Türen löschen ==');
b = basisProjekt();
meins = k(b); server = k(b);
meins.tueren = meins.tueren.filter(t => t.id !== 't2');
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 0, 'eine drüben unveränderte Tür löschen: kein Konflikt');
p(e.ergebnis.tueren.map(t => t.id).join() === 't1,t3', 'die Tür ist weg',
  e.ergebnis.tueren.map(t => t.id).join());

b = basisProjekt();
meins = k(b); server = k(b);
meins.tueren = meins.tueren.filter(t => t.id !== 't2');
server.tueren[1].tuerblattstaerke = '90';
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 1 && e.konflikte[0].geloescht === true,
  'gelöscht hier, geändert drüben: das wird gefragt', JSON.stringify(e.konflikte));
p(e.ergebnis.tueren.map(t => t.id).indexOf('t2') !== -1,
  'im Zweifel bleibt die Tür erhalten statt still zu verschwinden');

b = basisProjekt();
meins = k(b); server = k(b);
meins.tueren = meins.tueren.filter(t => t.id !== 't2');
server.tueren = server.tueren.filter(t => t.id !== 't2');
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 0 && e.ergebnis.tueren.length === 2, 'beide löschen dieselbe Tür: einig');

console.log('\n== Kreuzschließplan ==');
b = basisProjekt();
meins = k(b); server = k(b);
meins.matrix['t2|s1'] = 'ja';
server.matrix['t3|s1'] = 'temp';
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 0, 'verschiedene Kreuze: kein Konflikt');
p(e.ergebnis.matrix['t2|s1'] === 'ja' && e.ergebnis.matrix['t3|s1'] === 'temp' && e.ergebnis.matrix['t1|s1'] === 'ja',
  'alle drei Kreuze stehen', JSON.stringify(e.ergebnis.matrix));

meins = k(b); server = k(b);
meins.matrix['t1|s1'] = 'nein';
server.matrix['t1|s1'] = 'temp';
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 1 && e.konflikte[0].matrix === true, 'dasselbe Kreuz verschieden: Konflikt');
p(e.ergebnis.matrix['t1|s1'] === 'nein', 'vorläufig meine Fassung');
gewaehlt = Z.anwenden(e.ergebnis, e.konflikte, { [e.konflikte[0].id]: 'server' });
p(gewaehlt.matrix['t1|s1'] === 'temp', 'die Wahl greift auch im Plan');

meins = k(b); server = k(b);
delete meins.matrix['t1|s1'];
e = Z.projekte(b, meins, server);
p(e.ergebnis.matrix['t1|s1'] === undefined, 'ein entferntes Kreuz bleibt entfernt');

console.log('\n== Fotos und Personen ==');
b = basisProjekt();
meins = k(b); server = k(b);
meins.tueren[0].fotos.push({ id: 'f1', beschriftung: 'Außen', dataUrl: 'x' });
server.tueren[0].fotos.push({ id: 'f2', beschriftung: 'Schloss', dataUrl: 'y' });
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 0, 'beide ergänzen ein Foto an derselben Tür: kein Konflikt',
  JSON.stringify(e.konflikte));
p(e.ergebnis.tueren[0].fotos.length === 2, 'beide Fotos überleben',
  JSON.stringify(e.ergebnis.tueren[0].fotos.map(f => f.id)));

meins = k(b); server = k(b);
meins.schliessungen[0].personen.push({ id: 'p1', name: 'Frau A', anzahlMedien: 1 });
server.schliessungen[0].personen.push({ id: 'p2', name: 'Herr B', anzahlMedien: 2 });
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 0, 'beide ergänzen eine Person: kein Konflikt');
p(e.ergebnis.schliessungen[0].personen.length === 2, 'beide Personen überleben');

meins = k(b); server = k(b);
meins.schliessungen[0].personen.push({ id: 'p1', name: 'Frau A', anzahlMedien: 1 });
server.schliessungen[0].personen.push({ id: 'p1', name: 'Frau A', anzahlMedien: 3 });
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 1 && e.konflikte[0].bereich === 'Person',
  'dieselbe Person mit verschiedener Medienzahl: Konflikt', JSON.stringify(e.konflikte));

console.log('\n== Stammdaten ==');
b = basisProjekt();
meins = k(b); server = k(b);
meins.bemerkung = 'Von mir ergänzt';
server.kundenNr = 'K-1';
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 0, 'verschiedene Stammdatenfelder: kein Konflikt');
p(e.ergebnis.bemerkung === 'Von mir ergänzt' && e.ergebnis.kundenNr === 'K-1', 'beide stehen');
meins = k(b); server = k(b);
meins.kunde = 'Müller & Söhne GmbH'; server.kunde = 'Müller und Söhne';
e = Z.projekte(b, meins, server);
p(e.konflikte.length === 1 && e.konflikte[0].gegenstand === 'Stammdaten', 'derselbe Kundenname: Konflikt');
p(e.konflikte[0].feldName === 'Kunde', 'mit verständlichem Feldnamen', e.konflikte[0].feldName);

console.log('\n== Nichts geht verloren ==');
/* Der wichtigste Test: jede Tür, die auf einer Seite lebt und auf der
   anderen nicht gelöscht wurde, muss im Ergebnis stehen. */
for (let lauf = 0; lauf < 200; lauf++) {
  const basis = basisProjekt();
  const m = k(basis), s = k(basis);
  const zufall = n => Math.floor(Math.random() * n);
  for (let i = 0; i < 4; i++) {
    const ziel = zufall(2) ? m : s;
    const art = zufall(4);
    if (art === 0) { ziel.tueren.push(tuer('neu' + lauf + '-' + i)); }
    else if (art === 1 && ziel.tueren.length > 1) { ziel.tueren.splice(zufall(ziel.tueren.length), 1); }
    else if (art === 2 && ziel.tueren.length) { ziel.tueren[zufall(ziel.tueren.length)].dornmass = String(50 + zufall(40)); }
    else { ziel.matrix['t' + (1 + zufall(3)) + '|s1'] = ['ja', 'nein', 'temp'][zufall(3)]; }
  }
  const r = Z.projekte(basis, m, s);
  const da = new Set(r.ergebnis.tueren.map(t => t.id));
  const bIds = new Set(basis.tueren.map(t => t.id));
  let verloren = null;
  m.tueren.forEach(t => {
    /* Nur lokal neu -> muss da sein. Sonst: nur weg, wenn drüben gelöscht. */
    const drueben = s.tueren.some(x => x.id === t.id);
    if (!bIds.has(t.id) && !da.has(t.id)) { verloren = 'neu bei mir, fehlt: ' + t.id; }
    if (bIds.has(t.id) && drueben && !da.has(t.id)) { verloren = 'beiderseits da, fehlt: ' + t.id; }
  });
  s.tueren.forEach(t => {
    const hier = m.tueren.some(x => x.id === t.id);
    if (!bIds.has(t.id) && !da.has(t.id)) { verloren = 'neu drüben, fehlt: ' + t.id; }
    if (bIds.has(t.id) && hier && !da.has(t.id)) { verloren = 'beiderseits da, fehlt: ' + t.id; }
  });
  if (verloren) { p(false, 'Zufallslauf ' + lauf + ': nichts geht verloren', verloren); break; }
  if (lauf === 199) { p(true, '200 Zufallsläufe: keine Tür geht verloren'); }
}

console.log('\n== Wiederholbarkeit ==');
b = basisProjekt();
meins = k(b); server = k(b);
meins.tueren[0].tuerblattstaerke = '68';
server.tueren[1].dornmass = '65';
e = Z.projekte(b, meins, server);
const nochmal = Z.projekte(e.ergebnis, k(e.ergebnis), k(e.ergebnis));
p(nochmal.konflikte.length === 0, 'das Ergebnis erneut zusammengeführt ergibt keinen Konflikt');
p(JSON.stringify(nochmal.ergebnis) === JSON.stringify(e.ergebnis), 'und verändert nichts mehr');

console.log('\n== Beide Geräte kommen zum selben Ergebnis ==');
b = basisProjekt();
meins = k(b); server = k(b);
meins.tueren[0].tuerblattstaerke = '68';
meins.tueren.push(tuer('tA'));
server.tueren[2].dornmass = '65';
server.tueren.push(tuer('tB'));
const hier = Z.projekte(b, k(meins), k(server));
const dort = Z.projekte(b, k(server), k(meins));
p(hier.ergebnis.tueren.map(t => t.id).sort().join() === dort.ergebnis.tueren.map(t => t.id).sort().join(),
  'beide Seiten erhalten dieselben Türen',
  hier.ergebnis.tueren.map(t => t.id).join() + '  vs  ' + dort.ergebnis.tueren.map(t => t.id).join());
p(JSON.stringify(hier.ergebnis.matrix) === JSON.stringify(dort.ergebnis.matrix), 'und denselben Plan');

console.log('\n== Grenzfälle ==');
p(Z.projekte(null, null, null).konflikte.length === 0, 'drei leere Stände stürzen nicht ab');
p(Z.projekte(undefined, { id: 'x', kunde: 'A' }, undefined).ergebnis.kunde === 'A',
  'ohne Basis und ohne Server bleibt meine Fassung');
e = Z.projekte({}, { id: 'x', tueren: [tuer('t1')] }, { id: 'x', tueren: [] });
p(e.ergebnis.tueren.length === 1, 'ohne Basis gilt eine neue Tür als neu, nicht als gelöscht');
p(Z.feldName('tuerblattstaerke') === 'Türblattstärke', 'bekannte Feldnamen werden übersetzt');
p(Z.feldName('irgendeinNeuesFeld') === 'Irgendein neues feld', 'unbekannte Felder werden lesbar gemacht',
  Z.feldName('irgendeinNeuesFeld'));

console.log('\nErgebnis Zusammenführen: ' + ok + ' ok, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
