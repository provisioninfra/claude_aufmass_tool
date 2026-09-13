/* Prüft die Einzeldatei in allen Situationen, in denen sie geöffnet wird:
 *  1. lokal per Doppelklick (file://)
 *  2. von einer Website ausgeliefert (http://)
 *  3. eingebettet in eine bestehende Seite (iframe)
 * Jeweils mit der entscheidenden Frage: bleiben die Daten erhalten? */
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const { starte, ersteProjektOeffnen } = require('./browser.js');

const DATEI = path.join(__dirname, '..', 'dist', 'aufmass-tool.html');
let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? ' -> ' + i : '')); } }

/* Legt ein Projekt an, lädt neu und prüft, ob es noch da ist. */
async function durchlauf(page, bezeichnung) {
  await page.waitForSelector('header.kopf', { timeout: 10000 });

  const speicherArt = await page.evaluate(() => window.Store.nutztFallback() ? 'Browserspeicher' : 'IndexedDB');

  await page.evaluate(async () => {
    const p = window.Model.neuesProjekt('Dauertest');
    p.kunde = 'Beständigkeitsprüfung';
    const st = window.Model.neuerStrukturknoten('standort', 'Objekt'); p.standorte.push(st);
    p.tueren.push(window.Model.neueTuer({ nummer: 'P-01', bezeichnung: 'Prüftür',
      strukturId: st.id, systemId: 'evva-4ks', zylinderArt: 'Doppelzylinder',
      masseAussen: '30', masseInnen: '35' }));
    await window.Store.projektSpeichern(p);
    await window.Store.einstellungenSpeichern(Object.assign({},
      window.Store.EINSTELLUNGEN_STANDARD, { letztesProjekt: p.id }));
  });

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('header.kopf', { timeout: 10000 });
  await page.waitForTimeout(500);
  await ersteProjektOeffnen(page, 10000);

  const titel = await page.textContent('.projekt-titel');
  const erhalten = /Beständigkeitsprüfung/.test(titel);
  pruefe(erhalten, bezeichnung + ': Aufmaß übersteht das Neuladen  [' + speicherArt + ']',
    'Titel war: ' + titel.trim());

  const pdf = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    if (!p) return null;
    const b = window.Reports.tuerliste(p, {}, { modus: 'kompakt' }).build();
    return { kopf: String.fromCharCode.apply(null, b.slice(0, 5)), bytes: b.length };
  });
  pruefe(pdf && pdf.kopf === '%PDF-', bezeichnung + ': PDF lässt sich erzeugen',
    pdf ? JSON.stringify(pdf) : 'kein Projekt geladen');
  return speicherArt;
}

(async () => {
  console.log('\n== Einzeldatei in allen Öffnungswegen ==');
  const groesse = fs.statSync(DATEI).size;
  console.log('  Datei: ' + Math.round(groesse / 1024) + ' KB\n');

  const browser = await starte();

  /* --- 1. Lokal per Doppelklick --- */
  const ctx1 = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const p1 = await ctx1.newPage();
  const fehler1 = []; p1.on('pageerror', e => fehler1.push(e.message));
  const netz1 = []; p1.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) netz1.push(r.url()); });
  await p1.goto('file://' + DATEI, { waitUntil: 'load' });
  await durchlauf(p1, 'Doppelklick (file://)');
  pruefe(netz1.length === 0, 'Doppelklick: keine Netzanfrage', netz1.slice(0,2).join(', '));
  pruefe(fehler1.length === 0, 'Doppelklick: keine Fehler', fehler1.join(' | '));
  await ctx1.close();

  /* --- 2. Von einer Website ausgeliefert --- */
  const zielOrdner = '/tmp/claude-0/web';
  fs.mkdirSync(zielOrdner, { recursive: true });
  fs.copyFileSync(DATEI, path.join(zielOrdner, 'aufmass.html'));
  const server = spawn('npx', ['http-server', zielOrdner, '-p', '8141', '-c-1', '--silent'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 3500));

  const ctx2 = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const p2 = await ctx2.newPage();
  const fehler2 = []; p2.on('pageerror', e => fehler2.push(e.message));
  await p2.goto('http://127.0.0.1:8141/aufmass.html', { waitUntil: 'load' });
  await durchlauf(p2, 'Von Website (http://)');
  pruefe(fehler2.length === 0, 'Website: keine Fehler', fehler2.join(' | '));
  await ctx2.close();

  /* --- 3. Eingebettet in eine bestehende Seite --- */
  fs.writeFileSync(path.join(zielOrdner, 'einbindung.html'),
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Einbindung</title>' +
    '<style>body{margin:0;font-family:sans-serif}h1{padding:12px;margin:0;background:#eee;font-size:16px}' +
    'iframe{width:100%;height:88vh;border:0}</style></head><body>' +
    '<h1>Beispielseite mit eingebettetem Aufmaß-Tool</h1>' +
    '<iframe src="aufmass.html" title="Aufmaß"></iframe></body></html>');

  const ctx3 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const p3 = await ctx3.newPage();
  const fehler3 = []; p3.on('pageerror', e => fehler3.push(e.message));
  await p3.goto('http://127.0.0.1:8141/einbindung.html', { waitUntil: 'load' });
  const rahmen = p3.frameLocator('iframe');
  await rahmen.locator('header.kopf').waitFor({ timeout: 10000 });
  pruefe(true, 'Einbettung: Anwendung läuft im Rahmen einer anderen Seite');
  const tabs = await rahmen.locator('nav.reiter button').count();
  pruefe(tabs === 7, 'Einbettung: alle Bereiche bedienbar', 'gefunden: ' + tabs);
  await p3.screenshot({ path: path.join(__dirname, 'out', 'einbindung.png') });
  pruefe(fehler3.length === 0, 'Einbettung: keine Fehler', fehler3.join(' | '));
  await ctx3.close();

  try { server.kill('SIGKILL'); } catch (e) {}
  await browser.close();
  console.log(`\nErgebnis: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message); process.exit(1); });
