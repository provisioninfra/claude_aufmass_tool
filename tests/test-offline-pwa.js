/* Prüft den Weg "vom Webserver laden, dann offline weiterarbeiten":
 * Service Worker, Neustart ohne Netz, PDF-Erzeugung im Offline-Zustand. */
const path = require('path');
const { spawn } = require('child_process');
const { starte, ersteProjektOeffnen } = require('./browser.js');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? ' -> ' + i : '')); } }

(async () => {
  const server = spawn('npx', ['http-server', path.join(__dirname, '..', 'src'), '-p', '8137', '-c-1', '--silent'],
    { stdio: 'ignore', detached: false });
  await new Promise(r => setTimeout(r, 3500));

  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();
  const konsolenFehler = [];
  page.on('pageerror', e => konsolenFehler.push(e.message));

  console.log('\n== Offline-Betrieb nach Laden vom Webserver ==');
  try {
    await page.goto('http://127.0.0.1:8137/index.html', { waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('header.kopf', { timeout: 8000 });
    pruefe(true, 'Anwendung lädt über http');

    // Service Worker abwarten
    const swBereit = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'nicht unterstützt';
      try {
        const reg = await navigator.serviceWorker.ready;
        return reg && reg.active ? 'aktiv' : 'keine aktive Fassung';
      } catch (e) { return 'Fehler: ' + e.message; }
    });
    pruefe(swBereit === 'aktiv', 'Service Worker ist aktiv', swBereit);

    const imSpeicher = await page.evaluate(async () => {
      const namen = await caches.keys();
      if (!namen.length) return 0;
      const c = await caches.open(namen[0]);
      return (await c.keys()).length;
    });
    pruefe(imSpeicher >= 12, imSpeicher + ' Dateien im Gerätespeicher abgelegt');

    // Projekt anlegen
    await page.evaluate(async () => {
      const p = window.Model.neuesProjekt('Offline-Probe');
      p.kunde = 'Kunde ohne Netz';
      const st = window.Model.neuerStrukturknoten('standort', 'Keller'); p.standorte.push(st);
      p.tueren.push(window.Model.neueTuer({ nummer: 'K-01', bezeichnung: 'Technikraum',
        strukturId: st.id, systemId: 'evva-4ks', zylinderArt: 'Doppelzylinder',
        masseAussen: '30', masseInnen: '35', status: 'aufgemessen' }));
      await window.Store.projektSpeichern(p);
      await window.Store.einstellungenSpeichern(Object.assign({},
        window.Store.EINSTELLUNGEN_STANDARD, { letztesProjekt: p.id }));
    });

    // --- Netz trennen und neu starten ---
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('header.kopf', { timeout: 8000 });
    pruefe(true, 'Anwendung startet OHNE Netzverbindung neu');

    await page.waitForTimeout(500);
    await ersteProjektOeffnen(page);
    const titel = await page.textContent('.projekt-titel');
    pruefe(/Kunde ohne Netz/.test(titel), 'Projekt ist offline weiterhin vorhanden', titel.trim());

    const pdf = await page.evaluate(() => {
      const p = window.AppKern.Zustand.projekt;
      const doc = window.Reports.tuerliste(p, {}, { modus: 'kompakt' });
      const b = doc.build();
      return { kopf: String.fromCharCode.apply(null, b.slice(0, 5)), bytes: b.length };
    });
    pruefe(pdf.kopf === '%PDF-' && pdf.bytes > 1000,
      'PDF wird auch offline erzeugt (' + Math.round(pdf.bytes / 1024) + ' KB)');

    // Neue Tür offline erfassen
    await page.click('nav.reiter button:has-text("Türen")');
    await page.click('button:has-text("+ Neue Tür")');
    await page.waitForSelector('.dialog');
    await page.fill('.dialog input[type=text] >> nth=1', 'Offline erfasst');
    await page.click('.dialog button:has-text("Tür speichern")');
    await page.waitForTimeout(600);
    const anzahl = await page.$$eval('.tuer-zeile', n => n.length);
    pruefe(anzahl === 2, 'neue Tür lässt sich offline erfassen und speichern', 'gefunden: ' + anzahl);

    pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler im Offline-Betrieb',
      konsolenFehler.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    try { process.kill(-server.pid); } catch (e) { try { server.kill('SIGKILL'); } catch (e2) {} }
  }

  console.log(`\nErgebnis Offline-Betrieb: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message); process.exit(1); });
