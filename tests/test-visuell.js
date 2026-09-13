/* Lädt das realistische Testprojekt in die Anwendung und erstellt Screenshots
 * der wichtigsten Ansichten zur Sichtprüfung. */
const fs = require('fs'), path = require('path');
const { starte } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');

const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');
const AUS = path.join(__dirname, 'out');

(async () => {
  const fotoDataUrl = fs.existsSync(AUS + '/foto.txt') ? fs.readFileSync(AUS + '/foto.txt', 'utf8') : null;
  const projekt = baueTestprojekt({ fotoDataUrl });
  const eins = Object.assign({}, einstellungen, { logoDataUrl: fotoDataUrl, letztesProjekt: projekt.id });

  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(e.message));
  page.on('console', m => { if (m.type() === 'error') fehler.push(m.text()); });

  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');

  // Projekt und Einstellungen direkt in die Datenbank schreiben
  await page.evaluate(async ([p, e]) => {
    await window.Store.projektSpeichern(p);
    await window.Store.einstellungenSpeichern(e);
  }, [projekt, eins]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.tuer-zeile', { timeout: 8000 });

  const schuesse = [
    ['tueren', 'v-tueren.png'],
    ['plan', 'v-plan.png'],
    ['export', 'v-export.png'],
    ['struktur', 'v-struktur.png'],
    ['projekte', 'v-projekte.png']
  ];
  for (const [ansicht, datei] of schuesse) {
    await page.evaluate(a => window.App.wechseln(a), ansicht);
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(AUS, datei) });
    console.log('  ' + datei);
  }

  // Kennzahlen aus der Oberfläche gegenprüfen
  await page.evaluate(() => window.App.wechseln('export'));
  await page.waitForSelector('.kennzahl');
  const werte = await page.$$eval('.kennzahl', ks => ks.map(k => ({
    wert: k.querySelector('.wert').textContent, bez: k.querySelector('.bez').textContent
  })));
  console.log('  Kennzahlen:', werte.map(w => w.bez + '=' + w.wert).join(', '));

  // Matrix-Maße prüfen
  await page.evaluate(() => window.App.wechseln('plan'));
  await page.waitForSelector('table.matrix');
  const mass = await page.evaluate(() => {
    const t = document.querySelector('table.matrix');
    const r = document.querySelector('.matrix-rahmen');
    return { tabelleBreite: Math.round(t.getBoundingClientRect().width),
             rahmenBreite: Math.round(r.getBoundingClientRect().width),
             kopfhoehe: getComputedStyle(t).getPropertyValue('--kopfhoehe').trim(),
             spalten: t.querySelectorAll('th.spaltenkopf').length,
             zeilen: t.querySelectorAll('tbody tr').length };
  });
  console.log('  Matrix:', JSON.stringify(mass));

  await browser.close();
  if (fehler.length) { console.log('  FEHLER:', fehler.slice(0,3).join(' | ')); process.exit(1); }
  console.log('  keine Konsolenfehler');
})();
