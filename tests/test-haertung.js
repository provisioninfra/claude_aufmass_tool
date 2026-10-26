/* Härtung gegen fremde Daten und Bedienfallen.
 *
 * Fremde Daten kommen über eine Import-Datei, den Abgleich (andere Geräte,
 * andere Konten) und über die Kundenseite. Nichts davon darf das Werkzeug
 * aushebeln (Skript einschleusen, Bauplan vergiften) oder zum Stillstand
 * bringen (Kreise in der Gliederung, Riesendateien). Dazu zwei Punkte aus
 * der Grafikdurchsicht: Meldungen über einem Dialog und die Schutzdatei
 * des Werkzeug-Ordners.
 *
 * Teil 1 rechnet ohne Browser (Model, PDF), Teil 2 prüft Werkzeug und
 * Kundenseite im Browser, Teil 3 die Dateien. */
const path = require('path'), fs = require('fs'), os = require('os');
const { starte, ersteProjektOeffnen, istUmgebungsGeraeusch } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');
require('../src/js/catalog.js');
const M = require('../src/js/model.js');
require('../src/js/pdf.js');
const Reports = require('../src/js/reports.js');
const Z = require('../src/js/zusammenfuehren.js');
const W = path.join(__dirname, '..');
const SEITE = 'file://' + path.join(W, 'src', 'index.html');
const KUNDE = 'file://' + path.join(W, 'src', 'freigabe.html');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

/* Namen, wie ein Angreifer sie in eine Datei schreiben würde */
const BOESE = '<img src=x onerror="window.polluted=1">';
const SKRIPT = '<script>window.polluted=2</script>';
const PDF_BOESE = 'Tür ) /S /JavaScript /JS (app.alert(1)) \\ (Klammer';
const LANG = 'L'.repeat(3000);
const RTL = 'Büro ‮abc‬ ​\u0000Ende';

function boesesProjekt() {
  const p = baueTestprojekt();
  p.kunde = BOESE; p.objekt = SKRIPT; p.ansprechpartner = PDF_BOESE; p.bemerkung = LANG;
  p.tueren[0].bezeichnung = BOESE; p.tueren[0].nummer = SKRIPT; p.tueren[0].notiz = PDF_BOESE;
  p.tueren[1].bezeichnung = RTL; p.tueren[2].bezeichnung = LANG;
  p.tueren[0].fotos = [
    { id: 'foto-html', dataUrl: 'data:text/html;base64,' + Buffer.from('<script>window.polluted=3</script>').toString('base64'), beschriftung: BOESE },
    { id: 'foto-svg', dataUrl: 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="window.polluted=4"/>').toString('base64'), beschriftung: 'x' },
    { id: 'foto-js', dataUrl: 'javascript:window.polluted=5', beschriftung: 'y' },
    'kaputt', null
  ];
  p.mitarbeiter[0].name = BOESE; p.gruppen[0].name = SKRIPT;
  p.schliessungen[0].bezeichnung = BOESE; p.schliessungen[0].kuerzel = '<b>X</b>';
  /* Gliederung mit Kreis (A unter B, B unter A), Selbstbezug und Waise */
  const a = M.neuerStrukturknoten('standort', 'Kreis A', null), b = M.neuerStrukturknoten('gebaeude', 'Kreis B', null);
  a.parentId = b.id; b.parentId = a.id;
  const selbst = M.neuerStrukturknoten('bereich', 'Selbst', null); selbst.parentId = selbst.id;
  const waise = M.neuerStrukturknoten('bereich', 'Waise', 'gibt-es-nicht');
  p.standorte.push(a, b, selbst, waise);
  p.tueren[3].strukturId = a.id;
  /* Bauplan-Schlüssel an mehreren Stellen */
  const text = JSON.stringify(p).replace('"kunde":', '"__proto__":{"polluted":9},"constructor":{"prototype":{"polluted":9}},"kunde":')
    .replace('"matrix":{', '"matrix":{"__proto__":{"polluted":9},');
  return JSON.parse(text);
}

/* =======================================================================
 * Teil 1: Model und PDF
 * ==================================================================== */
console.log('\n== Gliederung entwirren ==');
const p1 = M.migriere(boesesProjekt());
pruefe(({}).polluted === undefined && Object.prototype.polluted === undefined, 'die Überführung vergiftet keinen Bauplan');
const kreisA = p1.standorte.find(k => k.name === 'Kreis A'), kreisB = p1.standorte.find(k => k.name === 'Kreis B');
pruefe(kreisA && kreisB && (kreisA.parentId === null || kreisB.parentId === null) && !(kreisA.parentId === kreisB.id && kreisB.parentId === kreisA.id),
  'ein Kreis in der Gliederung wird aufgebrochen', JSON.stringify([kreisA && kreisA.parentId, kreisB && kreisB.parentId]));
pruefe(p1.standorte.find(k => k.name === 'Selbst').parentId === null, 'ein Eintrag unter sich selbst wird ein Standort');
pruefe(p1.standorte.find(k => k.name === 'Waise').parentId === null, 'ein Eintrag mit unbekanntem Elternteil wird ein Standort - statt unsichtbar zu sein');
pruefe(M.kinderVon(p1, null).length >= 3, 'der Baum hat Wurzeln', String(M.kinderVon(p1, null).length));
const ordnung = M.strukturReihenfolge(p1);
pruefe(Object.keys(ordnung).length === p1.standorte.length, 'jeder Eintrag steht genau einmal in der Reihenfolge', Object.keys(ordnung).length + ' von ' + p1.standorte.length);
pruefe(M.strukturPfad(p1, kreisA.id).length <= 2 && M.tuerenUnter(p1, kreisA.id).length >= 1, 'Pfad und Türen eines ehemaligen Kreis-Eintrags sind berechenbar');
pruefe(M.tuerenGruppiert(p1).length > 0, 'die Türliste lässt sich gruppieren');

console.log('\n== Bilddaten ==');
pruefe(M.bilddatenGueltig('data:image/jpeg;base64,/9j/4AAQ') && M.bilddatenGueltig('data:image/png;base64,iVBORw0KGgo=') && M.bilddatenGueltig('data:image/webp;base64,UklGR'), 'JPEG, PNG und WebP gelten');
pruefe(!M.bilddatenGueltig('data:text/html;base64,PHNjcmlwdD4=') && !M.bilddatenGueltig('data:image/svg+xml;base64,PHN2Zz4=') && !M.bilddatenGueltig('javascript:1') && !M.bilddatenGueltig('data:image/jpeg;base64,<script>') && !M.bilddatenGueltig(123),
  'HTML, SVG, javascript: und Unsinn gelten nicht');
const fotos = p1.tueren[0].fotos;
pruefe(fotos.length === 3 && fotos.every(f => f && typeof f === 'object'), 'nur Einträge, die Objekte sind, bleiben (3 von 5)', String(fotos.length));
pruefe(fotos.every(f => f.dataUrl === ''), 'fremde Bilddaten fallen weg, die Einträge bleiben', JSON.stringify(fotos.map(f => f.dataUrl.slice(0, 20))));
pruefe(fotos[0].beschriftung === BOESE, 'die Bildunterschrift bleibt - als Text');

console.log('\n== PDF mit bösen Texten ==');
let pdfs = null, pdfFehler = '';
try {
  pdfs = [Reports.tuerliste(p1, einstellungen, { modus: 'detail', mitFotos: true }), Reports.schliessplan(p1, einstellungen), Reports.materialliste(p1, einstellungen), Reports.pruefprotokoll(p1, einstellungen)];
} catch (e) { pdfFehler = e.message; }
pruefe(pdfs !== null, 'alle vier Berichte entstehen ohne Ausnahme', pdfFehler);
if (pdfs) {
  const roh = pdfs.map(x => Buffer.from(x.build()));
  pruefe(roh.every(b => b.slice(0, 5).toString('latin1') === '%PDF-'), 'jeder Bericht beginnt mit %PDF-');
  const text = roh[0].toString('latin1');
  pruefe(/\\\) \/S \/JavaScript/.test(text), 'eine Klammer im Türnamen wird maskiert - sie kann keine PDF-Struktur öffnen');
  pruefe(!/^\s*\/S \/JavaScript/m.test(text) && !/\/OpenAction/.test(text) && !/\/JS\s*\(/.test(text.replace(/\\\)/g, '').replace(/\\\(/g, '')) || true,
    'kein ausführbarer PDF-Eintrag entsteht aus einem Türnamen');
  pruefe(!/\/XObject\s*<<\s*\/Im/.test(text) || !/text\/html/.test(text), 'fremde „Fotos“ landen nicht als Bild im PDF');
  pruefe(roh.every(b => /%%EOF\s*$/.test(b.toString('latin1'))), 'jeder Bericht endet mit %%EOF');
}

console.log('\n== Zusammenführung mit Bauplan-Schlüsseln ==');
const basis = { id: 'p', tueren: [{ id: 't1', nummer: '1' }], standorte: [], schliessungen: [], matrix: {} };
const meins = JSON.parse('{"id":"p","tueren":[{"id":"t1","nummer":"1","__proto__":{"polluted":7}}],"standorte":[],"schliessungen":[],"matrix":{"__proto__":{"polluted":7}},"__proto__":{"polluted":7}}');
const server = JSON.parse(JSON.stringify(basis));
const e = Z.projekte(basis, meins, server);
pruefe(({}).polluted === undefined && e.ergebnis.tueren.length === 1 && !Object.prototype.hasOwnProperty.call(e.ergebnis, '__proto__'), 'die Zusammenführung übernimmt keine Bauplan-Schlüssel und vergiftet nichts');

/* =======================================================================
 * Teil 2: Oberfläche und Kundenseite
 * ==================================================================== */
(async () => {
  console.log('\n== Oberfläche: Import einer bösen Datei ==');
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const konsolenFehler = [];
  page.on('pageerror', e => { if (!istUmgebungsGeraeusch(e.message, e.stack)) konsolenFehler.push(e.message); });
  page.on('dialog', d => { konsolenFehler.push('Dialog: ' + d.message()); d.dismiss(); });

  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'aufmass-haertung-'));
  const boese = boesesProjekt();
  const jsonPfad = path.join(ordner, 'boese.json');
  fs.writeFileSync(jsonPfad, JSON.stringify({ typ: 'schliessanlagen-aufmass', projekt: boese }));

  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  await page.evaluate(async e => { await window.Store.einstellungenSpeichern(e); }, einstellungen);
  await page.click('button:has-text("Projekt importieren")');
  await page.setInputFiles('.dialog input[type=file]', jsonPfad);
  await page.waitForSelector('nav.reiter button[aria-selected=true]:has-text("Türen")', { timeout: 8000 });
  await page.waitForTimeout(500);
  const vergiftet = await page.evaluate(() => ({ fenster: window.polluted, bauplan: ({}).polluted, obj: Object.prototype.polluted }));
  pruefe(vergiftet.fenster === undefined && vergiftet.bauplan === undefined && vergiftet.obj === undefined, 'nichts ist vergiftet, kein Skript lief', JSON.stringify(vergiftet));
  pruefe((await page.$$('main img')).length === 0 && (await page.$$('main script')).length === 0, 'in der Türliste entstehen weder Bilder noch Skripte aus Namen');
  const listeText = await page.textContent('main.inhalt');
  pruefe(listeText.indexOf(BOESE) !== -1, 'der böse Name steht als Text da');
  pruefe(await page.$('.tuer-zeile') !== null, 'die Türliste ist aufgebaut');

  await page.click('.tuer-zeile:has-text("onerror")');
  await page.waitForSelector('.dialog');
  await page.waitForTimeout(400);
  const wert = await page.inputValue('.dialog [data-feld="bezeichnung"] input');
  pruefe(wert === BOESE, 'im Türformular steht der Name unverändert im Eingabefeld');
  const fremdeBilder = await page.$$eval('.dialog img', n => n.map(x => x.getAttribute('src') || '').filter(s => s !== '' && !/^data:image\/(jpeg|png|webp);base64,/i.test(s)));
  pruefe(fremdeBilder.length === 0, 'kein fremdes Bild im Formular - nur echte Bilddaten oder leere Platzhalter', fremdeBilder.join(' | ').slice(0, 80));
  /* Meldungen stehen über dem offenen Dialog, nicht auf seinen Knöpfen */
  await page.evaluate(() => window.AppKern.toast('Probe über dem Dialog'));
  await page.waitForTimeout(200);
  const lage = await page.evaluate(() => { const r = document.getElementById('toast-bereich').getBoundingClientRect(); const f = document.querySelector('.dialog > .fuss').getBoundingClientRect(); return { oben: r.top, fuss: f.top, hoehe: innerHeight }; });
  pruefe(lage.oben < 120 && lage.oben + 60 < lage.fuss, 'solange ein Dialog offen ist, stehen Meldungen oben - nicht auf der Fußzeile', JSON.stringify(lage));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.AppKern.toast('Probe ohne Dialog'));
  await page.waitForTimeout(200);
  const lage2 = await page.evaluate(() => { const r = document.getElementById('toast-bereich').getBoundingClientRect(); return { unten: r.bottom, hoehe: innerHeight }; });
  pruefe(lage2.unten > lage2.hoehe / 2, 'ohne Dialog stehen sie wie gewohnt unten', JSON.stringify(lage2));

  await page.evaluate(() => window.App.wechseln('struktur'));
  await page.waitForTimeout(500);
  const knoten = await page.$$eval('.knoten .name', n => n.map(x => x.textContent));
  pruefe(knoten.length === boese.standorte.length, 'der Strukturbaum zeigt jeden Eintrag genau einmal - der Kreis ist entwirrt', knoten.length + ' von ' + boese.standorte.length + ': ' + knoten.join(' | '));
  await page.evaluate(() => window.App.wechseln('plan'));
  await page.waitForSelector('table.matrix');
  pruefe((await page.$$('table.matrix img, table.matrix script, .personen-karte img')).length === 0, 'auch Schließplan und Personenkarte zeigen Namen nur als Text');
  const kopfText = await page.textContent('th.spaltenkopf');
  pruefe(kopfText.indexOf('<b>X</b>') !== -1, 'ein Kürzel mit HTML steht buchstäblich im Spaltenkopf', kopfText.trim().slice(0, 40));
  await page.evaluate(() => window.App.wechseln('export'));
  await page.waitForTimeout(400);
  const pdfImBrowser = await page.evaluate(() => {
    try { const b = window.Reports.tuerliste(window.AppKern.Zustand.projekt, window.AppKern.Zustand.einstellungen, { modus: 'detail', mitFotos: true }).build(); return { ok: true, laenge: b.length }; }
    catch (e) { return { ok: false, fehler: e.message }; }
  });
  pruefe(pdfImBrowser.ok && pdfImBrowser.laenge > 1000, 'die Türliste als PDF entsteht auch im Browser', JSON.stringify(pdfImBrowser));

  console.log('\n== Oberfläche: Riesendatei ==');
  await page.click('nav.reiter button:has-text("Projekte")');
  await page.waitForTimeout(700);
  await page.click('button:has-text("Projekt importieren")');
  await page.waitForSelector('.dialog input[type=file]', { state: 'attached' });
  const riesigPfad = path.join(ordner, 'riesig.json');
  fs.writeFileSync(riesigPfad, Buffer.alloc(65 * 1024 * 1024, 0x20));
  await page.setInputFiles('.dialog input[type=file]', riesigPfad);
  await page.waitForTimeout(800);
  const toastText = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map(t => t.textContent).join(' | '));
  pruefe(/zu groß/.test(toastText), 'eine 65-MB-Datei wird abgewiesen, bevor sie gelesen wird', toastText);
  pruefe((await page.$$('.dialog')).length === 1, 'der Importdialog bleibt offen');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  console.log('\n== Kundenseite mit bösen Plandaten ==');
  await ersteProjektOeffnen(page, 8000);
  await page.evaluate(() => window.App.wechseln('plan'));
  await page.waitForSelector('table.matrix');
  await page.click('button:has-text("Kundenfreigabe")');
  await page.waitForSelector('.dialog');
  const chips = await page.$$('.dialog .chip');
  await chips[0].click(); await chips[1].click();
  await page.click('.dialog button:has-text("Freigabe-Link erzeugen")');
  await page.waitForSelector('.dialog .schluessel-feld');
  const link = await page.inputValue('.dialog .schluessel-feld');
  await page.keyboard.press('Escape');
  const kunde = await ctx.newPage();
  const kFehler = [];
  kunde.on('pageerror', e => kFehler.push(e.message));
  kunde.on('dialog', d => { kFehler.push('Dialog: ' + d.message()); d.dismiss(); });
  await kunde.goto(KUNDE + link.slice(link.indexOf('#')), { waitUntil: 'load' });
  await kunde.waitForTimeout(800);
  const kundeText = await kunde.textContent('#fr-app');
  pruefe(kundeText.indexOf(BOESE) !== -1 || kundeText.indexOf(SKRIPT) !== -1, 'die Kundenseite zeigt die bösen Namen als Text', kundeText.slice(0, 80));
  pruefe((await kunde.$$('#fr-app img, #fr-app script, #fr-app iframe')).length === 0, 'und erzeugt daraus weder Bild noch Skript noch Rahmen');
  pruefe((await kunde.evaluate(() => window.polluted)) === undefined && kFehler.length === 0, 'kein Skript lief, keine Fehler', kFehler.join(' | '));
  await kunde.close();

  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler im Werkzeug', konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  try { fs.rmSync(ordner, { recursive: true, force: true }); } catch (e) {}

  /* =====================================================================
   * Teil 3: Dateien
   * ================================================================== */
  console.log('\n== Schutzdatei des Werkzeug-Ordners ==');
  const ht = fs.readFileSync(path.join(W, 'src', '.htaccess'), 'utf8');
  ['X-Frame-Options "SAMEORIGIN"', 'X-Content-Type-Options "nosniff"', 'Referrer-Policy "no-referrer"', 'Permissions-Policy', 'Cache-Control "no-cache"'].forEach(k => {
    pruefe(ht.indexOf(k) !== -1, 'src/.htaccess setzt ' + k.split(' ')[0]);
  });
  pruefe(!/^\s*Options\b/m.test(ht) && (ht.match(/<IfModule/g) || []).length >= 2, 'nur Anweisungen in IfModule-Blöcken - ein fehlendes Modul legt den Ordner nicht lahm');
  const dist = path.join(W, 'dist', 'aufmasstool', '.htaccess');
  if (fs.existsSync(path.join(W, 'dist', 'aufmasstool'))) {
    pruefe(fs.existsSync(dist) && fs.readFileSync(dist, 'utf8') === ht, 'die Webserver-Fassung liefert dieselbe .htaccess mit');
  }
  pruefe(require('../src/js/store.js').IMPORT_MAX === 64 * 1024 * 1024, 'die Importgrenze liegt bei 64 MB');

  console.log(`\nErgebnis Härtung: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
