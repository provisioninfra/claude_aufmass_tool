/* Gliederung: sichtbar nach einer Zusammenführung, verwaiste Bereiche
 * erkennen und wiederherstellen, Gliederung aus einer Sicherung übernehmen.
 *
 * Hintergrund: Verschwindet die Gliederung durch einen Abgleich, behalten
 * die Türen ihre Verweise. Außerdem schreibt die Zusammenführung null als
 * leeren Text - der Baum muss seine Wurzeln trotzdem finden.
 *
 * Teil 1 rechnet ohne Browser (Model), Teil 2 prüft die Oberfläche. */
const path = require('path'), fs = require('fs'), os = require('os');
const { starte, ersteProjektOeffnen, istUmgebungsGeraeusch } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');
const M = require('../src/js/model.js');
const Z = require('../src/js/zusammenfuehren.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }
const namen = p => M.kinderVon(p, null).map(k => k.name).join(' | ');

/* =======================================================================
 * Teil 1: Model
 * ==================================================================== */
console.log('\n== Baum nach einer Zusammenführung ==');
const basis = { id: 'p', standorte: [
  { id: 'st1', ebene: 'standort', name: 'Ibsen', parentId: null, sort: 0 },
  { id: 'g1', ebene: 'gebaeude', name: 'Haus 1', parentId: 'st1', sort: 0 }],
  tueren: [{ id: 't1', strukturId: 'g1' }] };
const meins = JSON.parse(JSON.stringify(basis)); meins.tueren.push({ id: 't2', strukturId: 'g1' });
const server = JSON.parse(JSON.stringify(basis)); server.bemerkung = 'vom Büro';
const e = Z.projekte(basis, meins, server);
pruefe(e.konflikte.length === 0 && e.ergebnis.standorte[0].parentId === '', 'die Zusammenführung schreibt null als leeren Text', JSON.stringify(e.ergebnis.standorte[0]));
pruefe(M.kinderVon(e.ergebnis, null).length === 1 && M.kinderVon(e.ergebnis, 'st1').length === 1, 'der Baum findet seine Wurzel trotzdem', namen(e.ergebnis));
pruefe(M.strukturReihenfolge(e.ergebnis).g1 === 2, 'die Reihenfolge der Gliederung steht', JSON.stringify(M.strukturReihenfolge(e.ergebnis)));
pruefe(M.tuerenUnter(e.ergebnis, 'st1').length === 2, 'beide Türen hängen unter dem Standort');
pruefe(M.kinderVon({ standorte: [{ id: 'x', ebene: 'standort', name: null, parentId: undefined, sort: 0 }] }, null).length === 1,
  'auch ein Eintrag ohne Namen und ohne parentId stürzt den Baum nicht');

console.log('\n== Verwaiste Bereiche ==');
const original = baueTestprojekt();
const sicherung = JSON.parse(JSON.stringify(original));     /* die Sicherung von vorher */
const p = JSON.parse(JSON.stringify(original));
const egA = p.standorte.find(k => k.name === 'Erdgeschoss');
const hausA = p.standorte.find(k => /Haus A/.test(k.name));
const ogA = p.standorte.find(k => k.name === '1. Obergeschoss');
p.tueren.filter(t => t.strukturId === ogA.id).forEach(t => { t.etage = '1. OG'; });
const vorherTueren = JSON.stringify(p.tueren);
/* So lässt ein Abgleich die Gliederung zurück: Einträge weg, Türen behalten ihren Verweis */
p.standorte = p.standorte.filter(k => [egA.id, hausA.id, ogA.id].indexOf(k.id) === -1);
const verwaist = M.verwaisteBereiche(p);
pruefe(verwaist.length === 2, 'zwei Bereiche fehlen, auf die Türen verweisen', verwaist.map(v => v.id).join());
const betroffen = p.tueren.filter(t => t.strukturId === egA.id || t.strukturId === ogA.id).length;
pruefe(verwaist.reduce((n, v) => n + v.tueren.length, 0) === betroffen, 'mit allen betroffenen Türen (' + betroffen + ')');
pruefe(M.tuerenGruppiert(p).some(g => g.titel === 'Bereich nicht mehr vorhanden'), 'die Türliste nennt den fehlenden Bereich beim Namen',
  M.tuerenGruppiert(p).map(g => g.titel).join(' | '));
const neu = M.bereicheWiederherstellen(p);
pruefe(neu.length === 4, 'Wiederherstellen legt Standort, Gebäude und die zwei Bereiche an', neu.map(k => k.ebene + ':' + k.name).join(' | '));
pruefe(M.verwaisteBereiche(p).length === 0, 'danach ist nichts mehr verwaist');
pruefe(JSON.stringify(p.tueren) === vorherTueren, 'keine Tür wurde angefasst');
pruefe(M.tuerenUnter(p, neu[0].id).length === betroffen, 'alle betroffenen Türen hängen unter dem wiederhergestellten Standort');
pruefe(M.strukturPfad(p, egA.id).map(k => k.ebene).join('>') === 'standort>gebaeude>bereich', 'die Hierarchie ist vollständig: Standort › Gebäude › Bereich',
  M.strukturPfadText(p, egA.id));
pruefe(/\(wiederhergestellt\)$/.test(neu[0].name) && /\(wiederhergestellt\)$/.test(neu[1].name), 'Standort und Gebäude sind als wiederhergestellt gekennzeichnet', neu[0].name + ' / ' + neu[1].name);
pruefe(M.findeStruktur(p, ogA.id).name === '1. OG', 'nennen alle Türen dieselbe Etage, heißt der Bereich so', M.findeStruktur(p, ogA.id).name);
pruefe(/^Bereich \d+ \(wiederhergestellt\)$/.test(M.findeStruktur(p, egA.id).name), 'sonst bekommt er einen Platzhalternamen', M.findeStruktur(p, egA.id).name);
pruefe(M.bereicheWiederherstellen(p).length === 0, 'ein zweites Wiederherstellen legt nichts mehr an');
pruefe(M.tuerenGruppiert(p).every(g => g.titel !== 'Bereich nicht mehr vorhanden'), 'die Türliste gruppiert wieder nach Bereichen');

console.log('\n== Gliederung aus einer Sicherung übernehmen ==');
const anzahl = M.gliederungUebernehmen(p, sicherung);
pruefe(anzahl === 3, 'Haus A kommt dazu, die zwei Platzhalter bekommen Name und Platz zurück (3)', String(anzahl));
pruefe(M.strukturPfadText(p, egA.id) === 'Standort Düsseldorf › Haus A (Verwaltung) › Erdgeschoss', 'das Erdgeschoss hängt wieder richtig', M.strukturPfadText(p, egA.id));
pruefe(M.strukturPfadText(p, ogA.id) === 'Standort Düsseldorf › Haus A (Verwaltung) › 1. Obergeschoss', 'das Obergeschoss ebenso', M.strukturPfadText(p, ogA.id));
pruefe(!p.standorte.some(k => /wiederhergestellt/.test(k.name)), 'die leeren Platzhalter sind weg', p.standorte.map(k => k.name).join(' | '));
pruefe(p.standorte.length === sicherung.standorte.length, 'die Gliederung ist wieder vollständig', p.standorte.length + ' von ' + sicherung.standorte.length);
pruefe(JSON.stringify(p.tueren) === vorherTueren, 'und wieder wurde keine Tür angefasst');
pruefe(M.gliederungUebernehmen(p, sicherung) === 0, 'ein zweites Übernehmen ändert nichts');
const leer = { id: original.id, standorte: [], tueren: JSON.parse(JSON.stringify(original.tueren)) };
const ausMerge = JSON.parse(JSON.stringify(sicherung)); ausMerge.standorte.forEach(k => { if (k.parentId === null) k.parentId = ''; });
pruefe(M.gliederungUebernehmen(leer, ausMerge) === sicherung.standorte.length && M.kinderVon(leer, null).length === 1,
  'auch eine Sicherung nach Zusammenführung (leere statt null) ergibt einen sauberen Baum', namen(leer));
pruefe(M.verwaisteBereiche(leer).length === 0, 'alle Türen finden ihren Bereich');

/* =======================================================================
 * Teil 2: Oberfläche
 * ==================================================================== */
(async () => {
  console.log('\n== Oberfläche: Hinweis und Wiederherstellen ==');
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const konsolenFehler = [];
  page.on('pageerror', e => { if (!istUmgebungsGeraeusch(e.message, e.stack)) konsolenFehler.push(e.message); });

  const orig2 = baueTestprojekt();
  const verloren = JSON.parse(JSON.stringify(orig2));
  const wegIds = verloren.standorte.filter(k => /Haus A|Erdgeschoss|1\. Obergeschoss/.test(k.name)).map(k => k.id);
  verloren.standorte = verloren.standorte.filter(k => wegIds.indexOf(k.id) === -1);

  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  await page.evaluate(async ([pr, e]) => {
    await window.Store.projektSpeichern(pr);
    await window.Store.einstellungenSpeichern(Object.assign({}, e, { letztesProjekt: pr.id }));
  }, [verloren, einstellungen]);
  await page.reload({ waitUntil: 'load' });
  await ersteProjektOeffnen(page, 10000);
  await page.click('nav.reiter button:has-text("Struktur")');
  await page.waitForSelector('.verwaist-hinweis', { timeout: 8000 });
  /* Der Stand der Türen, wie das Werkzeug ihn geöffnet hat (mit allen Vorgabefeldern) */
  const tuerenVorher = await page.evaluate(() => JSON.stringify(window.AppKern.Zustand.projekt.tueren));
  const hinweis = await page.textContent('.verwaist-hinweis');
  pruefe(/Gliederung fehlt/.test(hinweis) && /Türen verweisen auf 2 Bereiche/.test(hinweis), 'die Strukturansicht meldet die verwaisten Bereiche', hinweis.slice(0, 120));
  const baumVorher = await page.$$eval('.knoten .name', n => n.map(x => x.textContent));
  pruefe(baumVorher.join('|') === 'Standort Düsseldorf|Haus B (Lager & Technik)|Untergeschoss / Technik', 'der Rest der Gliederung steht weiter da', baumVorher.join('|'));

  await page.click('.verwaist-hinweis button:has-text("Bereiche wiederherstellen")');
  await page.waitForTimeout(600);
  pruefe(await page.$('.verwaist-hinweis') === null, 'nach dem Wiederherstellen ist der Hinweis weg');
  const baum = await page.$$eval('.knoten', n => n.map(x => x.querySelector('.name').textContent + ' [' + (x.querySelector('.tuerzahl') || {}).textContent + ']'));
  pruefe(baum.some(x => /\(wiederhergestellt\) \[undefined\]|\(wiederhergestellt\)/.test(x)), 'der wiederhergestellte Standort steht im Baum', baum.join(' | '));
  pruefe(baum.filter(x => /^Bereich \d \(wiederhergestellt\) \[\d+ Türen\]/.test(x)).length === 2, 'die zwei Bereiche stehen darunter - mit ihren Türen', baum.join(' | '));
  const danach = await page.evaluate(() => ({ tueren: JSON.stringify(window.AppKern.Zustand.projekt.tueren),
    verwaist: window.Model.verwaisteBereiche(window.AppKern.Zustand.projekt).length }));
  pruefe(danach.tueren === tuerenVorher, 'keine Tür wurde angefasst');
  pruefe(danach.verwaist === 0, 'nichts ist mehr verwaist');

  await page.click('nav.reiter button:has-text("Türen")');
  await page.waitForTimeout(400);
  const gruppen = await page.$$eval('.tuer-gruppe .kopfzeile span:first-child', n => n.map(x => x.textContent));
  pruefe(gruppen.some(x => /Bereich 1 \(wiederhergestellt\)/.test(x)), 'die Türliste gruppiert wieder nach dem Bereich', gruppen.join(' | '));

  /* Umbenennen geht wie gewohnt */
  await page.click('nav.reiter button:has-text("Struktur")');
  await page.waitForTimeout(400);
  await page.click('.knoten:has-text("Bereich 1 (wiederhergestellt)") button[title="Umbenennen"]');
  await page.waitForSelector('.dialog input');
  await page.fill('.dialog input', 'Erdgeschoss');
  await page.click('.dialog .fuss button.haupt');
  await page.waitForTimeout(400);
  pruefe((await page.$$eval('.knoten .name', n => n.map(x => x.textContent))).indexOf('Erdgeschoss') !== -1, 'ein wiederhergestellter Bereich lässt sich umbenennen');

  console.log('\n== Oberfläche: Gliederung aus einer Sicherung übernehmen ==');
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'aufmass-gliederung-'));
  const jsonPfad = path.join(ordner, 'sicherung.json');
  fs.writeFileSync(jsonPfad, JSON.stringify({ typ: 'schliessanlagen-aufmass', projekt: orig2 }));
  await page.click('nav.reiter button:has-text("Projekte")');
  await page.waitForTimeout(700);
  await page.click('button:has-text("Projekt importieren")');
  await page.setInputFiles('.dialog input[type=file]', jsonPfad);
  await page.waitForSelector('.dialog button:has-text("Nur Gliederung übernehmen")', { timeout: 8000 });
  const wahlText = await page.textContent('.dialog-hinter:last-of-type .dialog');
  pruefe(/Projekt bereits vorhanden/.test(wahlText) && /Überschreiben/.test(wahlText) && /Als Kopie anlegen/.test(wahlText), 'bei gleicher Kennung stehen drei Wege zur Wahl');
  await page.click('.dialog button:has-text("Nur Gliederung übernehmen")');
  await page.waitForSelector('nav.reiter button[aria-selected=true]:has-text("Struktur")', { timeout: 8000 });
  await page.waitForTimeout(500);
  const baumNachher = await page.$$eval('.knoten .name', n => n.map(x => x.textContent));
  pruefe(baumNachher.join('|') === 'Standort Düsseldorf|Haus A (Verwaltung)|Erdgeschoss|1. Obergeschoss|Haus B (Lager & Technik)|Untergeschoss / Technik',
    'die Gliederung ist vollständig zurück - mit den richtigen Namen und ohne Platzhalter', baumNachher.join('|'));
  const nachImport = await page.evaluate(() => ({ tueren: JSON.stringify(window.AppKern.Zustand.projekt.tueren),
    id: window.AppKern.Zustand.projekt.id, anzahl: window.AppKern.Zustand.projekt.standorte.length }));
  pruefe(nachImport.tueren === tuerenVorher, 'die Türen sind unverändert - auch ihre Verweise');
  pruefe(nachImport.id === orig2.id && nachImport.anzahl === orig2.standorte.length, 'es ist dasselbe Projekt, keine Kopie', nachImport.id + ' / ' + nachImport.anzahl);
  const gespeichert = await page.evaluate(async id => { const q = await window.Store.projektLaden(id); return q.standorte.length; }, orig2.id);
  pruefe(gespeichert === orig2.standorte.length, 'und so ist es auch gespeichert');

  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler', konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  try { fs.rmSync(ordner, { recursive: true, force: true }); } catch (e) {}
  console.log(`\nErgebnis Gliederung: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
