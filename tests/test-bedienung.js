/* Misst die Bedienbarkeit mit einer Hand: Größe der Bedienelemente,
 * Erreichbarkeit in der Daumenzone, kein Hineinzoomen auf iOS. */
const path = require('path');
const { starte } = require('./browser.js');
const fs = require('fs');
const { baueTestprojekt, einstellungen } = require('./fixture.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');
const AUS = path.join(__dirname, 'out');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

/* Kleinste zumutbare Fingerfläche */
const MIN = 44;

(async () => {
  const projekt = baueTestprojekt();
  const browser = await starte();

  /* --- iPad hoch: die typische Haltung beim Aufmaß --- */
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const konsolenFehler = [];
  page.on('pageerror', e => konsolenFehler.push(e.message));

  console.log('\n== Bedienung mit einer Hand ==');
  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  await page.evaluate(async ([p, e]) => {
    await window.Store.projektSpeichern(p);
    await window.Store.einstellungenSpeichern(e);
  }, [projekt, Object.assign({}, einstellungen, {
      letztesProjekt: projekt.id,
      logoDataUrl: fs.existsSync(AUS + '/foto.txt') ? fs.readFileSync(AUS + '/foto.txt', 'utf8') : ''
    })]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.tuer-zeile', { timeout: 8000 });

  /* --- Logo in der Kopfzeile --- */
  const logo = await page.$('header.kopf img.logo');
  pruefe(!!logo, 'hinterlegtes Logo erscheint in der Kopfzeile');
  const firmenname = await page.textContent('header.kopf .marke');
  pruefe(/Provision Infra/.test(firmenname), 'Firmenname statt Werkzeugname im Kopf', firmenname.trim());

  /* --- Schwebende Hauptaktion in der Daumenzone --- */
  const schwebe = await page.$('.schwebe-aktion');
  pruefe(!!schwebe, 'Hauptaktion liegt als schwebender Knopf bereit');
  if (schwebe) {
    const kasten = await schwebe.boundingBox();
    const hoehe = page.viewportSize().height;
    pruefe(kasten.height >= 52, 'Hauptaktion ist groß genug (' + Math.round(kasten.height) + ' px)');
    pruefe(kasten.y > hoehe * 0.8, 'Hauptaktion liegt im unteren Fünftel (Daumenzone)',
      'y=' + Math.round(kasten.y) + ' von ' + hoehe);
    const text = await schwebe.textContent();
    pruefe(/Neue Tür/.test(text), 'Hauptaktion passt zur Ansicht', text.trim());
  }

  /* --- Alle Bedienelemente messen --- */
  async function elementeMessen(bereich) {
    return page.evaluate((sel) => {
      const wurzel = document.querySelector(sel) || document;
      const treffer = [];
      wurzel.querySelectorAll('button, select, input, .chip, .tuer-zeile, td.zelle, .schalter').forEach(e => {
        if (e.offsetParent === null) return;
        if (e.type === 'hidden' || e.type === 'file') return;
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const name = (e.textContent || e.placeholder || e.className || e.tagName).trim().slice(0, 44);
        treffer.push({ name, w: Math.round(r.width), h: Math.round(r.height), tag: e.tagName });
      });
      return treffer;
    }, bereich);
  }

  const inListe = await elementeMessen('main.inhalt');
  const zuKlein = inListe.filter(e => e.h < MIN);
  pruefe(zuKlein.length === 0, `alle ${inListe.length} Bedienelemente der Türliste sind mindestens ${MIN} px hoch`,
    zuKlein.slice(0, 5).map(e => `${e.tag} "${e.name}" ${e.w}×${e.h}`).join('\n         -> '));

  /* --- Schriftgröße der Eingabefelder: unter 16px zoomt iOS hinein --- */
  await page.click('.tuer-zeile');
  await page.waitForSelector('.dialog');
  await page.waitForTimeout(400);
  const schriften = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.dialog input, .dialog select, .dialog textarea').forEach(e => {
      if (e.offsetParent === null || e.type === 'file' || e.type === 'checkbox') return;
      out.push({ tag: e.tagName, size: parseFloat(getComputedStyle(e).fontSize) });
    });
    return out;
  });
  const zuKlein2 = schriften.filter(s => s.size < 16);
  pruefe(zuKlein2.length === 0,
    `alle ${schriften.length} Eingabefelder haben mindestens 16 px (iOS zoomt sonst hinein)`,
    zuKlein2.slice(0, 4).map(s => s.tag + ' ' + s.size + 'px').join(', '));

  const imDialog = await elementeMessen('.dialog');
  const dialogKlein = imDialog.filter(e => e.h < MIN);
  pruefe(dialogKlein.length === 0, `alle ${imDialog.length} Bedienelemente im Türformular sind groß genug`,
    dialogKlein.slice(0, 5).map(e => `${e.tag} "${e.name}" ${e.w}×${e.h}`).join('\n         -> '));

  /* --- Dialogaktionen unten erreichbar --- */
  const fuss = await page.$('.dialog .fuss');
  if (fuss) {
    const k = await fuss.boundingBox();
    pruefe(k.y + k.height > page.viewportSize().height * 0.75,
      'Aktionen des Formulars liegen unten in Reichweite', 'y=' + Math.round(k.y));
    const hauptKnopf = await page.$('.dialog .fuss button.haupt');
    const hk = await hauptKnopf.boundingBox();
    pruefe(hk.height >= 52 && hk.width >= 120,
      'Hauptknopf ist breit und hoch genug (' + Math.round(hk.width) + '×' + Math.round(hk.height) + ')');
  }
  await page.screenshot({ path: path.join(AUS, 'b-formular-ipad.png') });
  await page.keyboard.press('Escape');

  /* --- Matrix mit einem Finger --- */
  await page.evaluate(() => window.App.wechseln('plan'));
  await page.waitForSelector('table.matrix');
  const zelle = await page.$('table.matrix td.zelle');
  const zk = await zelle.boundingBox();
  pruefe(zk.width >= MIN && zk.height >= MIN,
    'Matrixzellen sind mit einem Finger treffbar (' + Math.round(zk.width) + '×' + Math.round(zk.height) + ')');
  await page.screenshot({ path: path.join(AUS, 'b-plan-ipad.png') });

  /* --- Telefon: Navigation muss in die Daumenzone wandern --- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.App.wechseln('tueren'));
  await page.waitForTimeout(500);
  const navUnten = await page.evaluate(() => {
    const n = document.querySelector('nav.reiter');
    const r = n.getBoundingClientRect();
    return { y: r.y, hoehe: window.innerHeight };
  });
  pruefe(navUnten.y > navUnten.hoehe * 0.6,
    'auf dem Telefon liegt die Navigation unten', 'y=' + Math.round(navUnten.y) + ' von ' + navUnten.hoehe);
  const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  pruefe(!ueberlauf, 'kein seitliches Scrollen auf dem Telefon');
  await page.screenshot({ path: path.join(AUS, 'b-telefon.png') });

  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler', konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\nErgebnis Bedienung: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, e.stack.split('\n')[1]); process.exit(1); });
