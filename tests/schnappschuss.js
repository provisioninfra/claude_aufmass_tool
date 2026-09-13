/* Öffnet das Türformular mit einer realistischen Tür für die Sichtprüfung. */
const fs = require('fs'), path = require('path');
const { starte } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');
const AUS = path.join(__dirname, 'out');

(async () => {
  const projekt = baueTestprojekt();
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(e.message));
  page.on('console', m => { if (m.type() === 'error') fehler.push(m.text()); });

  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  await page.evaluate(async ([p, e]) => {
    await window.Store.projektSpeichern(p);
    await window.Store.einstellungenSpeichern(e);
  }, [projekt, Object.assign({}, einstellungen, { letztesProjekt: projekt.id })]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.tuer-zeile', { timeout: 8000 });

  // Elektronische Tür mit vielen Angaben öffnen
  await page.locator('.tuer-zeile', { hasText: 'Haupteingang Königsallee' }).click();
  await page.waitForSelector('.dialog');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(AUS, 'f-elektronisch.png') });

  // Zählen, wie viele Auswahlfelder überhaupt sichtbar sind
  const felder = await page.evaluate(() => {
    const d = document.querySelector('.dialog');
    const sichtbar = el => el.offsetParent !== null;
    return {
      auswahl: [...d.querySelectorAll('select')].filter(sichtbar).length,
      text: [...d.querySelectorAll('input[type=text],input[type=number]')].filter(sichtbar).length,
      chips: [...d.querySelectorAll('.chip')].filter(sichtbar).length,
      abschnitte: [...d.querySelectorAll('.abschnitt')].filter(sichtbar).length,
      abschnittTitel: [...d.querySelectorAll('.abschnitt > summary')].filter(sichtbar)
        .map(s => s.textContent.trim().split('\n')[0])
    };
  });
  console.log('Elektronische Tür — sichtbare Bedienelemente:');
  console.log('  Auswahlfelder:', felder.auswahl, '| Textfelder:', felder.text, '| Chips:', felder.chips);
  console.log('  Abschnitte:', felder.abschnitte);
  felder.abschnittTitel.forEach(t => console.log('    · ' + t));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Mechanische Tür: Elektronik-Abschnitt muss verschwinden
  await page.locator('.tuer-zeile', { hasText: 'Büro Geschäftsleitung' }).click();
  await page.waitForSelector('.dialog');
  await page.waitForTimeout(500);
  const mech = await page.evaluate(() => {
    const d = document.querySelector('.dialog');
    const sichtbar = el => el.offsetParent !== null;
    return {
      abschnitte: [...d.querySelectorAll('.abschnitt > summary')].filter(sichtbar)
        .map(s => s.textContent.trim().split('\n')[0]),
      elektronikSichtbar: [...d.querySelectorAll('.abschnitt')]
        .some(a => sichtbar(a) && /Elektronik/.test(a.textContent))
    };
  });
  console.log('\nMechanische Tür:');
  console.log('  Abschnitte:', mech.abschnitte.length, '| Elektronik sichtbar:', mech.elektronikSichtbar);
  await page.screenshot({ path: path.join(AUS, 'f-mechanisch.png') });

  await browser.close();
  if (fehler.length) { console.log('\nFEHLER:', fehler.slice(0,3).join(' | ')); process.exit(1); }
  console.log('\nkeine Konsolenfehler');
})();
