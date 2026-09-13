/* Prüft den zweiten Ausgabeweg: eingebettete Umgebung, die eigene Downloads
 * unterbindet und stattdessen eine Speicherfunktion bereitstellt. */
const path = require('path');
const { starte } = require('./browser.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');
let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? ' -> ' + i : '')); } }

(async () => {
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await ctx.newPage();
  const konsolenFehler = [];
  page.on('pageerror', e => konsolenFehler.push(e.message));

  console.log('\n== Ausgabeweg über Laufzeit-Fähigkeit ==');

  // Speicherfunktion bereitstellen, bevor die Anwendung startet
  await page.addInitScript(() => {
    window.__gespeichert = [];
    window.__antwort = 'ok';
    window.claude = {
      use: (name) => Promise.resolve(name === 'downloads' ? {
        save: ({ filename, data }) => {
          if (window.__antwort === 'declined') return Promise.reject({ code: 'declined', message: 'abgelehnt' });
          if (window.__antwort === 'zu_gross') return Promise.reject({ code: 'too_large', message: 'zu groß' });
          return Promise.resolve(data.size !== undefined ? data.arrayBuffer() : data)
            .then(inhalt => {
              window.__gespeichert.push({
                filename,
                bytes: inhalt.byteLength !== undefined ? inhalt.byteLength : String(inhalt).length,
                kopf: inhalt.byteLength !== undefined
                  ? String.fromCharCode.apply(null, new Uint8Array(inhalt).slice(0, 8))
                  : String(inhalt).slice(0, 8)
              });
              return { status: 'saved' };
            });
        }
      } : null)
    };
  });

  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');

  // Projekt vorbereiten
  await page.evaluate(async () => {
    const p = window.Model.neuesProjekt('Fähigkeitstest');
    p.kunde = 'Testkunde Größe';
    const st = window.Model.neuerStrukturknoten('standort', 'Standort'); p.standorte.push(st);
    p.tueren.push(window.Model.neueTuer({ nummer: 'T1', bezeichnung: 'Tür', strukturId: st.id,
      systemId: 'evva-4ks', zylinderArt: 'Doppelzylinder', masseAussen: '30', masseInnen: '35' }));
    const s = window.Model.neueSchliessung({ kuerzel: 'GHS', bezeichnung: 'General', anzahlMedien: 2 });
    p.schliessungen.push(s);
    window.Model.setBerechtigung(p, p.tueren[0].id, s.id, 'ja');
    await window.Store.projektSpeichern(p);
    await window.Store.einstellungenSpeichern(
      Object.assign({}, window.Store.EINSTELLUNGEN_STANDARD, { letztesProjekt: p.id, firma: 'Testfirma' }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.tuer-zeile', { timeout: 6000 });
  await page.click('nav.reiter button:has-text("Export")');
  await page.waitForSelector('.kennzahl');

  // PDF über die Fähigkeit ausgeben
  await page.locator('.karte.schmal').filter({ hasText: 'Türliste kompakt' }).locator('button').click();
  await page.waitForFunction(() => window.__gespeichert.length > 0, { timeout: 8000 });
  const pdf = await page.evaluate(() => window.__gespeichert[0]);
  pruefe(pdf.kopf.startsWith('%PDF'), 'PDF wird an die Speicherfunktion übergeben', JSON.stringify(pdf.kopf));
  pruefe(/\.pdf$/.test(pdf.filename), 'Dateiname endet auf .pdf', pdf.filename);
  pruefe(pdf.bytes > 1000, 'PDF ist vollständig (' + Math.round(pdf.bytes/1024) + ' KB)');
  await page.waitForTimeout(300);
  const meldung = await page.textContent('#toast-bereich').catch(() => '');
  pruefe(/Seiten erzeugt/.test(meldung), 'Erfolgsmeldung erscheint', meldung);

  // JSON-Export
  await page.click('button:has-text("Projekt exportieren (ohne Fotos)")');
  await page.waitForFunction(() => window.__gespeichert.length > 1, { timeout: 6000 });
  const json = await page.evaluate(() => window.__gespeichert[1]);
  pruefe(/\.json$/.test(json.filename) && json.kopf.indexOf('{') === 0, 'JSON-Export geht denselben Weg', json.filename);

  // Ablehnung durch den Betrachter
  await page.evaluate(() => { window.__antwort = 'declined'; });
  await page.locator('.karte.schmal').filter({ hasText: 'Materialliste' }).locator('button').click();
  await page.waitForTimeout(1200);
  const abgelehnt = await page.textContent('#toast-bereich');
  pruefe(/abgebrochen/i.test(abgelehnt), 'Ablehnung wird sachlich gemeldet, nicht als Fehler', abgelehnt.trim());

  // Zu große Datei
  await page.evaluate(() => { window.__antwort = 'zu_gross'; });
  await page.locator('.karte.schmal').filter({ hasText: 'Kreuzschließplan' }).locator('button').click();
  await page.waitForTimeout(1200);
  const zuGross = await page.textContent('#toast-bereich');
  pruefe(/zu groß/i.test(zuGross), 'Größenfehler nennt einen konkreten Ausweg', zuGross.trim());

  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler', konsolenFehler.join(' | '));
  await browser.close();
  console.log(`\nErgebnis Ausgabeweg: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, e.stack.split('\n')[1]); process.exit(1); });
