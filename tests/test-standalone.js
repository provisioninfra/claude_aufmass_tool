/* Prüft die eigenständige Einzeldatei aus dist/ - das ist die Fassung,
 * die vor Ort ohne Server und ohne Netz genutzt wird. */
const path = require('path'), fs = require('fs');
const { starte, ersteProjektOeffnen } = require('./browser.js');
const DATEI = 'file://' + path.join(__dirname, '..', 'dist', 'aufmass-tool.html');
const AUS = path.join(__dirname, 'out');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? ' -> ' + i : '')); } }

(async () => {
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const netzAnfragen = [];
  const konsolenFehler = [];
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) netzAnfragen.push(r.url()); });
  page.on('pageerror', e => konsolenFehler.push(e.message));
  page.on('console', m => { if (m.type() === 'error') konsolenFehler.push(m.text()); });

  console.log('\n== Eigenständige Einzeldatei ==');
  await page.goto(DATEI, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf', { timeout: 8000 });
  pruefe(true, 'Einzeldatei startet per Doppelklick (file://)');
  pruefe(netzAnfragen.length === 0, 'keine einzige Netzanfrage', netzAnfragen.slice(0,3).join(', '));

  const module = await page.evaluate(() => ['Katalog','Model','PDF','Reports','Store','App'].filter(m => !window[m]));
  pruefe(module.length === 0, 'alle Module eingebettet', module.join(', '));

  // Projekt anlegen und PDF erzeugen - der komplette Ablauf ohne Netz
  const ergebnis = await page.evaluate(async () => {
    const p = window.Model.neuesProjekt('Offline-Test');
    p.kunde = 'Prüfobjekt Größe & Maße';
    const st = window.Model.neuerStrukturknoten('standort', 'Standort Süd');
    p.standorte.push(st);
    for (let i = 1; i <= 5; i++) {
      p.tueren.push(window.Model.neueTuer({
        nummer: 'T-' + String(i).padStart(2,'0'), bezeichnung: 'Büro ' + i,
        strukturId: st.id, systemId: 'evva-4ks', zylinderArt: 'Doppelzylinder',
        masseAussen: '30', masseInnen: '35', status: 'aufgemessen'
      }));
    }
    const s = window.Model.neueSchliessung({ kuerzel: 'GHS', bezeichnung: 'General', typ: 'ghs', anzahlMedien: 2 });
    p.schliessungen.push(s);
    p.tueren.forEach(t => window.Model.setBerechtigung(p, t.id, s.id, 'ja'));
    await window.Store.projektSpeichern(p);
    const doc = window.Reports.tuerliste(p, { firma: 'Testfirma' }, { modus: 'kompakt' });
    const bytes = doc.build();
    return { seiten: doc.seitenAnzahl(), bytes: bytes.length,
             kopf: String.fromCharCode.apply(null, bytes.slice(0, 8)) };
  });
  pruefe(ergebnis.kopf.startsWith('%PDF-1.4') && ergebnis.bytes > 1000,
    `PDF offline erzeugt (${ergebnis.seiten} Seite, ${Math.round(ergebnis.bytes/1024)} KB)`);

  // Echter Download über die Oberfläche
  await page.reload({ waitUntil: 'load' });
  const karte = await ersteProjektOeffnen(page, 6000);
  if (karte) {
    await page.click('nav.reiter button:has-text("Export")');
    await page.waitForSelector('.kennzahl');
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.locator('.karte.schmal').filter({ hasText: 'Türliste kompakt' }).locator('button').click()
    ]);
    const ziel = path.join(AUS, 'standalone.pdf');
    await dl.saveAs(ziel);
    pruefe(fs.readFileSync(ziel).slice(0,8).toString('latin1').startsWith('%PDF'),
      'PDF-Download aus der Einzeldatei funktioniert');
  } else { pruefe(false, 'gespeichertes Projekt in der Einzeldatei gefunden'); }

  pruefe(netzAnfragen.length === 0, 'auch nach vollem Durchlauf keine Netzanfrage', netzAnfragen.join(', '));
  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler', konsolenFehler.slice(0,3).join(' | '));

  await browser.close();
  console.log(`\nErgebnis Einzeldatei: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message); process.exit(1); });
