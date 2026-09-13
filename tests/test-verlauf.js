/* Prüft die Rücknahme von Arbeitsschritten – im Kern und in der Oberfläche. */
const path = require('path');
const { starte, ersteProjektOeffnen } = require('./browser.js');
const V = require('../src/js/verlauf.js');
const K = require('../src/js/catalog.js');
const M = require('../src/js/model.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

console.log('\n== Verlauf: Kern ==');

const p = M.neuesProjekt('Verlaufstest');
p.anlagenart = 'mechanik'; p.systemMechanik = 'evva-4ks';
V.beginnen(p);
pruefe(!V.moeglich(), 'frisch geöffnet gibt es nichts zurückzunehmen');

/* Reihenfolge: erst den Ist-Zustand merken, dann ändern */
V.merken(p, 'Tür 1 angelegt');
p.tueren.push(M.neueTuer({ nummer: 'T1', zylinderBauform: 'Doppelzylinder' }));
V.merken(p, 'Tür 2 angelegt');
p.tueren.push(M.neueTuer({ nummer: 'T2' }));
V.merken(p, 'Tür 3 angelegt');
p.tueren.push(M.neueTuer({ nummer: 'T3' }));

pruefe(V.anzahl() === 3, 'drei Schritte abgelegt', String(V.anzahl()));
pruefe(V.naechsteBeschreibung() === 'Tür 3 angelegt', 'der nächste Schritt ist benannt', V.naechsteBeschreibung());

let stand = V.zurueck();
pruefe(stand.projekt.tueren.length === 2, 'ein Schritt zurück: zwei Türen', String(stand.projekt.tueren.length));
stand = V.zurueck();
pruefe(stand.projekt.tueren.length === 1, 'zwei Schritte zurück: eine Tür');
stand = V.zurueck();
pruefe(stand.projekt.tueren.length === 0, 'drei Schritte zurück: keine Tür mehr');
pruefe(!V.moeglich(), 'danach ist der Verlauf leer');
pruefe(V.zurueck() === null, 'ein weiterer Versuch liefert nichts');

/* --- Beliebig viele Schritte, begrenzt durch die Obergrenze --- */
V.beginnen(p);
for (let i = 0; i < V.MAX_SCHRITTE + 15; i++) {
  V.merken(p, 'Schritt ' + i);
  p.name = 'Stand ' + i;
}
pruefe(V.anzahl() === V.MAX_SCHRITTE,
  `der Verlauf hält die letzten ${V.MAX_SCHRITTE} Schritte`, String(V.anzahl()));
let zaehler = 0;
while (V.moeglich()) { V.zurueck(); zaehler++; if (zaehler > 200) break; }
pruefe(zaehler === V.MAX_SCHRITTE, 'alle gehaltenen Schritte lassen sich zurücknehmen', String(zaehler));

/* --- Fotos sprengen den Verlauf nicht --- */
const mitFoto = M.neuesProjekt('Fotos');
const bild = 'data:image/jpeg;base64,' + 'A'.repeat(200000);   // 200 KB
mitFoto.tueren.push(M.neueTuer({ nummer: 'F1', fotos: [{ id: 'foto-1', dataUrl: bild }] }));
V.beginnen(mitFoto);
for (let i = 0; i < 20; i++) { V.merken(mitFoto, 'Schritt ' + i); mitFoto.name = 'S' + i; }
const groesse = V.groesse();
pruefe(groesse < bild.length * 3,
  `20 Schritte mit einem 200-KB-Foto belegen nur ${Math.round(groesse / 1024)} KB (das Bild liegt einmal)`,
  Math.round(groesse / 1024) + ' KB');
const zurueckMitFoto = V.zurueck();
pruefe(zurueckMitFoto.projekt.tueren[0].fotos[0].dataUrl === bild,
  'das Foto ist nach dem Zurücknehmen vollständig erhalten');

/* --- Unveränderte Stände werden nicht doppelt abgelegt --- */
V.beginnen(p);
V.merken(p, 'A'); V.merken(p, 'B'); V.merken(p, 'C');
pruefe(V.anzahl() === 1, 'ein unveränderter Stand wird nicht mehrfach abgelegt', String(V.anzahl()));

console.log('\n== Verlauf: Oberfläche ==');
(async () => {
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 860 } });
  const page = await ctx.newPage();
  const konsolenFehler = [];
  page.on('pageerror', e => konsolenFehler.push(e.message));

  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');

  // Projekt anlegen und öffnen
  await page.evaluate(async () => {
    const pr = window.Model.neuesProjekt('Rücknahme');
    pr.kunde = 'Testkunde';
    pr.anlagenart = 'mechanik'; pr.systemMechanik = 'evva-4ks';
    const st = window.Model.neuerStrukturknoten('standort', 'Objekt'); pr.standorte.push(st);
    for (let i = 1; i <= 3; i++) {
      pr.tueren.push(window.Model.neueTuer({ nummer: 'T-' + i, bezeichnung: 'Raum ' + i,
        strukturId: st.id, zylinderBauform: 'Doppelzylinder', masseAussen: '30', masseInnen: '35' }));
    }
    await window.Store.projektSpeichern(pr);
  });
  await page.reload({ waitUntil: 'load' });
  await ersteProjektOeffnen(page);

  const knopfAnfang = await page.$('.zurueck-knopf:not([disabled])');
  pruefe(!knopfAnfang, 'frisch geöffnet ist der Zurück-Knopf nicht bedienbar');

  // Eine Tür löschen
  await page.click('.tuer-zeile');
  await page.waitForSelector('.dialog');
  await page.click('.dialog button:has-text("Löschen")');
  await page.waitForTimeout(300);
  await page.click('.dialog.klein button:has-text("Löschen")');
  await page.waitForTimeout(700);
  const nachLoeschen = await page.$$eval('.tuer-zeile', n => n.length);
  pruefe(nachLoeschen === 2, 'Tür gelöscht (' + nachLoeschen + ' übrig)');

  const knopf = await page.$('.zurueck-knopf:not([disabled])');
  pruefe(!!knopf, 'Zurück-Knopf ist jetzt bedienbar');
  const titel = await knopf.getAttribute('title');
  pruefe(/gelöscht/i.test(titel), 'der Knopf nennt, was zurückgenommen wird', titel);

  await knopf.click();
  await page.waitForTimeout(700);
  const nachZurueck = await page.$$eval('.tuer-zeile', n => n.length);
  pruefe(nachZurueck === 3, 'Löschen wurde zurückgenommen (' + nachZurueck + ' Türen)');

  // Mehrere Schritte hintereinander: drei Berechtigungen setzen und zurücknehmen
  await page.evaluate(() => window.App.wechseln('plan'));
  await page.waitForTimeout(300);
  await page.click('button:has-text("Blanko-Plan")');
  await page.waitForSelector('.dialog');
  await page.click('.dialog button:has-text("Plan erzeugen")');
  await page.waitForSelector('table.matrix', { timeout: 6000 });

  const zellen = await page.$$('table.matrix td.zelle');
  for (let i = 0; i < 3; i++) { await zellen[i].click(); await page.waitForTimeout(120); }
  const schritteDa = await page.$eval('.zurueck-knopf .zahl', e => parseInt(e.textContent, 10));
  pruefe(schritteDa >= 4, 'mehrere Schritte werden gezählt (' + schritteDa + ')');

  for (let i = 0; i < 3; i++) {
    await page.click('.zurueck-knopf:not([disabled])');
    await page.waitForTimeout(400);
  }
  const restSchritte = await page.$eval('.zurueck-knopf .zahl', e => parseInt(e.textContent, 10)).catch(() => 0);
  pruefe(restSchritte === schritteDa - 3,
    'drei Schritte nacheinander zurückgenommen', schritteDa + ' -> ' + restSchritte);

  // Projekt schließen setzt den Verlauf zurück
  await page.click('nav.reiter button:has-text("Projekte")');
  await page.waitForTimeout(800);
  const knopfNachSchliessen = await page.$$eval('.zurueck-knopf', n => n.length);
  pruefe(knopfNachSchliessen === 0, 'nach dem Schließen gibt es keinen Zurück-Knopf mehr');
  await ersteProjektOeffnen(page);
  const knopfNeu = await page.$('.zurueck-knopf:not([disabled])');
  pruefe(!knopfNeu, 'beim erneuten Öffnen beginnt der Verlauf von vorn');

  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler', konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\nErgebnis Verlauf: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
