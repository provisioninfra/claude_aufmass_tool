/* Speichern unter Druck: eine Eingabe während einer laufenden Speicherung,
 * Strg+Z bei offenem Türdialog und eine fremde Änderung an derselben Tür,
 * während ihr Dialog offen ist. Jeder Fall hat früher Daten verloren. */
const path = require('path');
const { starte, ersteProjektOeffnen } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');

let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

(async () => {
  const projekt = baueTestprojekt();
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  const seitenFehler = [];
  page.on('pageerror', e => seitenFehler.push(e.message));

  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  await page.evaluate(async ([pr, e]) => {
    await window.Store.projektSpeichern(pr);
    await window.Store.einstellungenSpeichern(e);
  }, [projekt, Object.assign({}, einstellungen, { letztesProjekt: projekt.id })]);
  await page.reload({ waitUntil: 'load' });
  await ersteProjektOeffnen(page, 8000);
  await page.waitForSelector('.tuer-zeile', { timeout: 8000 });

  console.log('\n== Eingabe während einer laufenden Speicherung ==');
  const r1 = await page.evaluate(async () => {
    const K = window.AppKern, S = window.Store;
    const echt = S.projektSpeichern;
    /* Eine langsame Datenbank nachstellen (fotoreiches Projekt auf dem iPad) */
    S.projektSpeichern = function (pr, o) {
      return new Promise(r => setTimeout(r, 900)).then(() => echt.call(S, pr, o));
    };
    K.Zustand.projekt.kunde = 'Eingabe A';
    const erste = K.speichern();
    await new Promise(r => setTimeout(r, 100));
    K.Zustand.projekt.kunde = 'Eingabe B';
    K.alsGeaendertMarkieren();                 /* Autosave trifft auf die laufende Speicherung */
    await erste;
    await new Promise(r => setTimeout(r, 2600));
    S.projektSpeichern = echt;
    const db = await S.projektLaden(K.Zustand.projekt.id);
    return { db: db.kunde, speicher: K.Zustand.projekt.kunde, ungesichert: K.Zustand.ungesichert,
             status: (document.querySelector('#speicher-status') || {}).textContent || '' };
  });
  p(r1.db === 'Eingabe B', 'die Eingabe während der Speicherung steht danach in der Datenbank', JSON.stringify(r1));
  p(r1.ungesichert === false, 'und der Status „Gespeichert“ stimmt', JSON.stringify(r1));

  console.log('\n== Strg+Z bei offenem Türdialog ==');
  const vorher = await page.evaluate(() => window.AppKern.Zustand.projekt.tueren.length);
  await page.click('.schwebe-aktion');
  await page.waitForSelector('.dialog');
  await page.fill('.dialog input[type=text] >> nth=1', 'Testtür Zurück');
  await page.click('.dialog button:has-text("Alle Felder")');
  await page.waitForTimeout(250);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  p(!!(await page.$('.dialog')), 'der Dialog bleibt offen');
  await page.click('.dialog button:has-text("Tür speichern")');
  await page.waitForTimeout(1000);
  const r2 = await page.evaluate(async () => {
    const K = window.AppKern;
    const db = await window.Store.projektLaden(K.Zustand.projekt.id);
    return { speicher: K.Zustand.projekt.tueren.some(t => t.bezeichnung === 'Testtür Zurück'),
             db: db.tueren.some(t => t.bezeichnung === 'Testtür Zurück'),
             anzahl: K.Zustand.projekt.tueren.length };
  });
  p(r2.speicher && r2.db && r2.anzahl === vorher + 1, 'die Tür ist trotz Strg+Z gespeichert', JSON.stringify(r2));

  console.log('\n== Fremde Änderung an der Tür, während ihr Dialog offen ist ==');
  await page.locator('.tuer-zeile').first().click();
  await page.waitForSelector('.dialog');
  const nr = (await page.textContent('.dialog .kopf h2')).replace('Tür bearbeiten:', '').trim();
  /* „Gerät B“ ergänzt derweil eine Bemerkung - der Abgleich zieht sie in das Projekt */
  const tuerId = await page.evaluate(nummer => {
    const t = window.AppKern.Zustand.projekt.tueren.find(x => x.nummer === nummer);
    t.bemerkung = 'Von Gerät B ergänzt';
    return t.id;
  }, nr);
  await page.fill('.dialog input[type=text] >> nth=1', 'Bezeichnung von Gerät A');
  await page.click('.dialog button:has-text("Änderungen übernehmen")');
  await page.waitForTimeout(1000);
  const r3 = await page.evaluate(id => {
    const t = window.AppKern.Zustand.projekt.tueren.find(x => x.id === id);
    return { bez: t.bezeichnung, bem: t.bemerkung };
  }, tuerId);
  p(r3.bez === 'Bezeichnung von Gerät A', 'die eigene Änderung ist übernommen', JSON.stringify(r3));
  p(r3.bem === 'Von Gerät B ergänzt', 'die fremde Änderung an einem anderen Feld bleibt erhalten', JSON.stringify(r3));

  p(seitenFehler.length === 0, 'keine JavaScript-Fehler', seitenFehler.join(' | '));
  await browser.close();
  console.log('\nErgebnis Speichern: ' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
