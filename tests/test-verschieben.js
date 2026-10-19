/* Spalten im Schließplan verschieben: Kopf zwei Sekunden halten (der Kopf
 * füllt sich), dann greifen (die Spalte hebt sich ab) und ziehen (die
 * Nachbarn weichen aus), beim Loslassen rückt die Spalte an die Zielstelle.
 * Davor und danach lassen sich Berechtigungen setzen; nichts bleibt
 * gegriffen. Geprüft mit echten Zeigerereignissen der Maus. */
const path = require('path');
const { starte, ersteProjektOeffnen, istUmgebungsGeraeusch } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');
let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }
const warte = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await starte();
  const konsole = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => { if (!istUmgebungsGeraeusch(e.message, e.stack)) konsole.push('PAGEERROR: ' + e.message); });
    page.on('console', m => { if (m.type() === 'error' && !istUmgebungsGeraeusch(m.text())) konsole.push(m.text()); });
    const projekt = baueTestprojekt();
    await page.goto(SEITE, { waitUntil: 'load' });
    await page.waitForSelector('header.kopf');
    await page.evaluate(async ([pr, e]) => {
      await window.Store.projektSpeichern(pr);
      await window.Store.einstellungenSpeichern(Object.assign({}, e, { letztesProjekt: pr.id }));
    }, [projekt, einstellungen]);
    await page.reload({ waitUntil: 'load' });
    await ersteProjektOeffnen(page, 8000);
    await page.evaluate(() => window.App.wechseln('plan'));
    await page.waitForSelector('table.matrix thead th.spaltenkopf');

    const koepfe = () => page.$$eval('table.matrix thead th.spaltenkopf', ths => ths.map(t => t.getAttribute('data-id')));
    const mitte = async (i) => { const b = await page.locator('table.matrix thead th.spaltenkopf').nth(i).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width }; };
    const zelleText = () => page.textContent('table.matrix tbody td.zelle >> nth=0');
    const klasseDa = (sel) => page.$(sel).then(x => x !== null);
    const ids0 = await koepfe();
    p(ids0.length >= 4, 'der Plan hat mindestens vier Spalten (' + ids0.length + ')');

    console.log('\n== Vorher: Berechtigungen setzen und Kopf antippen ==');
    const t0 = await zelleText();
    await page.click('table.matrix tbody td.zelle >> nth=0');
    p((await zelleText()) !== t0, 'ein Antippen schaltet die Berechtigung weiter', t0 + ' -> ' + (await zelleText()));
    await page.click('table.matrix thead th.spaltenkopf >> nth=1');
    await page.waitForSelector('.dialog', { timeout: 5000 });
    p(true, 'kurzes Antippen des Kopfs öffnet den Bearbeiten-Dialog');
    await page.keyboard.press('Escape'); await warte(200);

    console.log('\n== Halten, greifen, ziehen, loslassen ==');
    let m = await mitte(1);
    await page.mouse.move(m.x, m.y); await page.mouse.down();
    await warte(400);
    p(await klasseDa('table.matrix th.spaltenkopf.drueckt'), 'beim Halten füllt sich der Kopf');
    p(!(await klasseDa('table.matrix .greifen')), 'aber gegriffen ist noch nichts');
    await warte(1900);
    p(await klasseDa('table.matrix th.spaltenkopf.greifen') && (await page.$$('table.matrix td.greifen')).length >= 2, 'nach zwei Sekunden ist die ganze Spalte gegriffen - Kopf und Zellen');
    p(!(await klasseDa('table.matrix th.spaltenkopf.drueckt')), 'die Füllung ist dann weg');
    p(await klasseDa('table.matrix.verschieben'), 'die Tabelle ist im Verschiebemodus');
    const transformGegriffen = await page.$eval('table.matrix thead th.spaltenkopf >> nth=1', t => getComputedStyle(t).transform);
    p(transformGegriffen !== 'none', 'die gegriffene Spalte hebt sich ab (Transformation)', transformGegriffen);
    const ziel = await mitte(3);
    await page.mouse.move(ziel.x + 6, m.y, { steps: 15 });
    await warte(300);
    const tf = await page.$$eval('table.matrix thead th.spaltenkopf', ths => ths.map(t => getComputedStyle(t).transform));
    p(tf[2] !== 'none' && tf[3] !== 'none' && tf[0] === 'none', 'die überquerten Nachbarn rücken zur Seite, die anderen bleiben', JSON.stringify(tf));
    p(JSON.stringify(await koepfe()) === JSON.stringify(ids0), 'die Tabelle wird während des Ziehens nicht umgebaut');
    await page.mouse.up();
    await warte(450);
    const ids1 = await koepfe();
    p(ids1[3] === ids0[1] && ids1[1] === ids0[2] && ids1[2] === ids0[3] && ids1[0] === ids0[0], 'beim Loslassen rückt die Spalte an die Zielstelle', ids0.join(',') + ' -> ' + ids1.join(','));
    p(!(await klasseDa('table.matrix .greifen')) && !(await klasseDa('table.matrix.verschieben')) && !(await klasseDa('table.matrix .drueckt')), 'nichts bleibt gegriffen, gefüllt oder im Verschiebemodus');
    const rest = await page.$$eval('table.matrix th.spaltenkopf, table.matrix td', zs => zs.filter(z => getComputedStyle(z).transform !== 'none').length);
    p(rest === 0, 'keine Zelle behält eine Verschiebung', String(rest));
    p(!(await klasseDa('.dialog')), 'der Griff öffnet keinen Dialog');
    const sortiert = await page.evaluate(() => window.AppKern.Zustand.projekt.schliessungen.slice().sort((a, b) => a.sort - b.sort).map(s => s.id));
    p(JSON.stringify(sortiert) === JSON.stringify(ids1), 'die Reihenfolge ist im Aufmaß festgeschrieben');

    console.log('\n== Danach: Berechtigungen setzen ==');
    const t1 = await zelleText();
    await page.click('table.matrix tbody td.zelle >> nth=0');
    p((await zelleText()) !== t1, 'nach dem Verschieben lässt sich eine Berechtigung setzen', t1 + ' -> ' + (await zelleText()));
    const t2 = await page.textContent('table.matrix tbody td.zelle >> nth=3');
    await page.click('table.matrix tbody td.zelle >> nth=3');
    p((await page.textContent('table.matrix tbody td.zelle >> nth=3')) !== t2, 'auch in der verschobenen Spalte');

    console.log('\n== Abbrüche ==');
    m = await mitte(2);
    await page.mouse.move(m.x, m.y); await page.mouse.down();
    await warte(300);
    await page.mouse.move(m.x + 40, m.y, { steps: 5 });
    await warte(2200);
    p(!(await klasseDa('table.matrix .greifen')) && !(await klasseDa('table.matrix th.spaltenkopf.drueckt')), 'wer sich beim Halten bewegt, greift nicht - die Füllung verschwindet');
    await page.mouse.up(); await warte(200);
    p(JSON.stringify(await koepfe()) === JSON.stringify(ids1), 'und nichts wurde verschoben');
    m = await mitte(2);
    await page.mouse.move(m.x, m.y); await page.mouse.down();
    await warte(2300);
    p(await klasseDa('table.matrix th.spaltenkopf.greifen'), 'Halten ohne Bewegung greift');
    await page.mouse.up(); await warte(450);
    p(JSON.stringify(await koepfe()) === JSON.stringify(ids1) && !(await klasseDa('table.matrix .greifen')) && !(await klasseDa('.dialog')),
      'Loslassen an Ort und Stelle: keine Verschiebung, nichts bleibt gegriffen, kein Dialog');
    const t3 = await zelleText();
    await page.click('table.matrix tbody td.zelle >> nth=0');
    p((await zelleText()) !== t3, 'danach lassen sich wieder Berechtigungen setzen');
    /* Nach links schieben */
    m = await mitte(3);
    await page.mouse.move(m.x, m.y); await page.mouse.down();
    await warte(2300);
    const links = await mitte(0);
    await page.mouse.move(links.x - 4, m.y, { steps: 15 });
    await warte(250);
    await page.mouse.up(); await warte(450);
    const ids2 = await koepfe();
    p(ids2[0] === ids1[3] && ids2[1] === ids1[0], 'auch nach ganz links lässt sich schieben', ids1.join(',') + ' -> ' + ids2.join(','));

    console.log('\n== Nach dem Neuladen ==');
    await warte(600);
    await page.reload({ waitUntil: 'load' });
    await ersteProjektOeffnen(page, 8000);
    await page.evaluate(() => window.App.wechseln('plan'));
    await page.waitForSelector('table.matrix thead th.spaltenkopf');
    p(JSON.stringify(await koepfe()) === JSON.stringify(ids2), 'die neue Reihenfolge ist gespeichert', (await koepfe()).join(','));

    p(konsole.length === 0, 'keine JavaScript-Fehler', konsole.join(' | '));
  } catch (e) {
    p(false, 'Durchlauf ohne Ausnahme', (e.stack || String(e)).split('\n').slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  console.log('\nErgebnis Spalten verschieben: ' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})();
