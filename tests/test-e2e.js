/* End-to-End-Test der Anwendung im echten Browser (Chromium).
 * Simuliert einen kompletten Aufmaß-Durchlauf inklusive PDF-Erzeugung. */
const fs = require('fs');
const path = require('path');
const { starte, ersteProjektOeffnen } = require('./browser.js');

const WURZEL = path.join(__dirname, '..', 'src');
const AUS = path.join(__dirname, 'out');
const SEITE = 'file://' + path.join(WURZEL, 'index.html');

let ok = 0, fehler = 0;
const konsolenFehler = [];
function pruefe(bedingung, text, info) {
  if (bedingung) { ok++; console.log('  OK   ' + text); }
  else { fehler++; console.log('  FEHL ' + text + (info ? '\n         -> ' + info : '')); }
}

(async () => {
  const browser = await starte();
  const ctx = await browser.newContext({
    viewport: { width: 1180, height: 820 },        // iPad Pro 11" quer
    deviceScaleFactor: 2,
    acceptDownloads: true
  });
  const page = await ctx.newPage();

  page.on('console', m => {
    if (m.type() === 'error') konsolenFehler.push(m.text());
  });
  page.on('pageerror', e => konsolenFehler.push('PAGEERROR: ' + e.message));

  console.log('\n== E2E: Anwendung im Browser ==');
  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf', { timeout: 8000 });
  pruefe(true, 'Anwendung startet');

  const module = await page.evaluate(() => ['Katalog','Model','PDF','Reports','Store','AppKern','ViewsProjekt','ViewsTueren','ViewsPlan','App'].filter(m => !window[m]));
  pruefe(module.length === 0, 'alle Module geladen', 'fehlend: ' + module.join(', '));

  // --- Projekt anlegen -----------------------------------------------------
  await page.click('button:has-text("+ Neues Aufmaß")');
  await page.waitForSelector('.dialog input[type=text]');
  await page.fill('.dialog input[type=text]', 'Müller & Söhne GmbH');
  await page.click('.dialog button:has-text("Übernehmen")');
  await page.waitForSelector('nav.reiter button[aria-selected=true]:has-text("Stammdaten")', { timeout: 5000 });
  pruefe(true, 'Projekt angelegt, Ansicht wechselt zu Stammdaten');

  // --- Stammdaten ----------------------------------------------------------
  await page.fill('input >> nth=1', 'K-1000');                   // Kunden-Nr
  const felder = await page.$$('main input[type=text]');
  await felder[2].fill('Bürogebäude Königsallee 47');            // Objekt
  await page.fill('input[type=date]', '2026-09-13');

  // Schließanlage einmal für das gesamte Projekt festlegen
  const anlagenart = page.locator('main select').filter({
    has: page.locator('option[value="hybrid"]') }).first();
  await anlagenart.selectOption('elektronik');
  await page.waitForTimeout(300);
  const systemWahl = page.locator('main select').filter({
    has: page.locator('option[value="evva-airkey"]') }).first();
  await systemWahl.selectOption('evva-airkey');
  await page.waitForTimeout(400);
  const mechInElektronik = await page.locator('main select')
    .filter({ has: page.locator('option[value="evva-4ks"]') }).count();
  pruefe(mechInElektronik === 0, 'bei Elektronikanlage wird kein Mechaniksystem angeboten');

  await page.waitForTimeout(900);                                 // Autosave abwarten
  const statusText = await page.textContent('#speicher-status');
  pruefe(/Gespeichert/.test(statusText), 'Autospeicherung greift', 'Status: ' + statusText);

  // --- Struktur ------------------------------------------------------------
  await page.click('nav.reiter button:has-text("Struktur")');
  await page.click('button:has-text("+ Standort")');
  await page.fill('.dialog input[type=text]', 'Standort Düsseldorf');
  await page.click('.dialog button:has-text("Übernehmen")');
  await page.waitForSelector('.knoten');
  await page.click('button:has-text("+ Gebäude")');
  await page.fill('.dialog input[type=text]', 'Haus A');
  await page.click('.dialog button:has-text("Übernehmen")');
  await page.waitForTimeout(200);
  await page.click('button:has-text("+ Bereich / Etage")');
  await page.fill('.dialog input[type=text]', 'Erdgeschoss');
  await page.click('.dialog button:has-text("Übernehmen")');
  await page.waitForTimeout(200);
  const knotenZahl = await page.$$eval('.knoten', n => n.length);
  pruefe(knotenZahl === 3, 'Strukturbaum mit 3 Ebenen aufgebaut', 'gefunden: ' + knotenZahl);

  // --- Tür aufnehmen -------------------------------------------------------
  await page.click('nav.reiter button:has-text("Türen")');
  await page.click('button:has-text("+ Neue Tür")');
  await page.waitForSelector('.dialog');
  await page.fill('.dialog input[type=text] >> nth=0', 'A-EG-01');
  await page.fill('.dialog input[type=text] >> nth=1', 'Haupteingang');

  // Tür dem Erdgeschoss zuordnen – Grundlage für den Blanko-Schließplan
  const bereichWahl = page.locator('.dialog select').filter({
    has: page.locator('option:has-text("Erdgeschoss")') }).first();
  const bereichWerte = await bereichWahl.locator('option').evaluateAll(os =>
    os.filter(o => /Erdgeschoss/.test(o.textContent)).map(o => o.value));
  await bereichWahl.selectOption(bereichWerte[0]);
  await page.waitForTimeout(150);

  // Das System steht im Projekt und darf hier nicht erneut wählbar sein
  const systemImDialog = await page.locator('.dialog select')
    .filter({ has: page.locator('option[value="evva-airkey"]') }).count();
  pruefe(systemImDialog === 0, 'an der Tür gibt es keine Systemauswahl mehr');
  const angezeigtesSystem = await page.locator('.dialog .marke-pille').allTextContents();
  pruefe(angezeigtesSystem.some(x => /AirKey/.test(x)),
    'das System der Anlage wird an der Tür nur angezeigt', angezeigtesSystem.join(' | '));
  pruefe(angezeigtesSystem.some(x => /Elektronische Schließanlage/.test(x)),
    'die Art der Anlage wird an der Tür angezeigt', angezeigtesSystem.join(' | '));
  const hybridFrage = await page.locator('.dialog select')
    .filter({ has: page.locator('option[value="mechanik"]') }).count();
  pruefe(hybridFrage === 0, 'bei reiner Anlage keine Frage nach der Ausführung');

  // Zylinder: Bauform ist eine einzige Auswahl ohne Technologieangabe
  const bauformWahl = page.locator('.dialog select').filter({
    has: page.locator('option:text-is("Doppelknaufzylinder")') }).first();
  const bauformen = await bauformWahl.locator('option').allTextContents();
  pruefe(!bauformen.some(o => /Elektronik/i.test(o)),
    'Zylinder-Bauformen enthalten keine Technologie', bauformen.filter(o => /Elektronik/i.test(o)).join(','));
  pruefe(!bauformen.some(o => /^Kein /i.test(o)), 'keine "Kein Zylinder"-Auswahl neben dem Schalter');
  await bauformWahl.selectOption({ label: 'Doppelknaufzylinder' });
  await page.waitForTimeout(200);

  // Freidreh und Comfort müssen einzeln anklickbar sein
  const chips = await page.locator('.dialog .chip').allTextContents();
  pruefe(chips.includes('Freidreh') && chips.includes('Comfort'),
    'Freidreh und Comfort sind getrennt anklickbar',
    chips.filter(c => /Freidreh|Comfort/.test(c)).join(' | '));

  // Knaufzylinder: Knaufseite mit Bezug auf den festen Knauf
  await bauformWahl.selectOption({ label: 'Knaufzylinder' });
  await page.waitForTimeout(250);
  const knaufLabel = await page.locator('.dialog label').filter({ hasText: 'Knaufseite' }).first().textContent();
  pruefe(/vom mech\. festen Knauf/.test(knaufLabel),
    'Knaufseite nennt den Bezug auf den festen Knauf', knaufLabel.trim());
  await bauformWahl.selectOption({ label: 'Doppelknaufzylinder' });
  await page.waitForTimeout(250);
  const knaufWeg = await page.locator('.dialog label').filter({ hasText: 'Knaufseite' }).count();
  pruefe(knaufWeg === 0, 'beim Doppelknaufzylinder entfällt die Knaufseite');

  await page.click('.dialog button:has-text("Tür speichern")');
  await page.waitForTimeout(400);
  const tuerZahl = await page.$$eval('.tuer-zeile', n => n.length);
  pruefe(tuerZahl === 1, 'Tür angelegt und in der Liste sichtbar', 'gefunden: ' + tuerZahl);

  // Zweite Tür über "Speichern & nächste"
  await page.click('button:has-text("+ Neue Tür")');
  await page.waitForSelector('.dialog');
  const nrFeld = await page.inputValue('.dialog input[type=text] >> nth=0');
  pruefe(/^\d{3}$/.test(nrFeld), 'neue Tür bekommt eine laufende Nummer', 'gefunden: ' + nrFeld);

  // Eine neue Tür beginnt leer: nichts wird von der vorherigen übernommen
  const leer = await page.evaluate(() => {
    const d = document.querySelector('.dialog');
    const felder = [...d.querySelectorAll('select')].filter(e => e.offsetParent !== null);
    return {
      gesetzteAuswahlen: felder.filter(e => e.value && !/aufgemessen/i.test(e.value)).length,
      bezeichnung: d.querySelectorAll('input[type=text]')[1].value,
      aktiveChips: d.querySelectorAll('.chip[aria-pressed=true]').length
    };
  });
  pruefe(leer.bezeichnung === '', 'Bezeichnung ist leer', JSON.stringify(leer.bezeichnung));
  pruefe(leer.aktiveChips === 0, 'keine Auswahl aus der vorherigen Tür übernommen',
    leer.aktiveChips + ' Chips aktiv');
  const status = await page.evaluate(() => {
    const d = document.querySelector('.dialog');
    const s2 = [...d.querySelectorAll('select')].find(e =>
      [...e.options].some(o => /Aufgemessen/i.test(o.textContent)));
    return s2 ? s2.value : '';
  });
  pruefe(status === 'aufgemessen', 'Status steht automatisch auf „Aufgemessen“', status);

  await page.fill('.dialog input[type=text] >> nth=1', 'Nebeneingang');
  await page.click('.dialog button:has-text("Speichern & nächste")');
  await page.waitForTimeout(500);
  await page.click('.dialog button:has-text("Abbrechen")');
  await page.waitForTimeout(300);
  pruefe(await page.$$eval('.tuer-zeile', n => n.length) === 2, '„Speichern & nächste“ funktioniert');

  // --- Schließplan ---------------------------------------------------------
  await page.click('nav.reiter button:has-text("Schließplan")');
  // Blanko-Plan aus der Gebäudestruktur erzeugen
  await page.click('button:has-text("Blanko-Plan")');
  await page.waitForSelector('.dialog');
  const vorschauText = await page.textContent('.dialog .meldung');
  pruefe(/Schließung(en)? werden angelegt/.test(vorschauText),
    'Blanko-Plan zeigt vorab, wie viele Schließungen entstehen', vorschauText.trim().slice(0, 60));
  await page.click('.dialog button:has-text("Plan erzeugen")');
  await page.waitForSelector('table.matrix', { timeout: 6000 });
  const spalten = await page.$$eval('table.matrix th.spaltenkopf', n => n.length);
  pruefe(spalten >= 3, 'Blanko-Plan legt GHS, Hauptschlüssel und Gruppe an (' + spalten + ' Schließungen)');
  const kuerzel = await page.$$eval('table.matrix th.spaltenkopf .dreh', n => n.map(x => x.textContent.trim()));
  pruefe(kuerzel.some(k => /^GHS/.test(k)) && kuerzel.some(k => /^HS-/.test(k)),
    'Hierarchie aus Generalhaupt- und Hauptschlüssel entsteht', kuerzel.join(' | '));
  const gesetzt = await page.$$eval('table.matrix td.zelle', z =>
    z.filter(c => c.textContent.trim()).length);
  pruefe(gesetzt > 0, 'Berechtigungen sind bereits gesetzt (' + gesetzt + ' Kreuze)');

  // Zelle dreimal antippen: nein -> ja -> zeit -> temp
  const zelle = await page.$('table.matrix td.zelle');
  const vorher = (await zelle.textContent()).trim();
  await zelle.click(); await page.waitForTimeout(80);
  const nachher = (await zelle.textContent()).trim();
  pruefe(vorher !== nachher, 'Zellklick schaltet die Berechtigung weiter',
    JSON.stringify(vorher) + ' -> ' + JSON.stringify(nachher));
  const zellGroesse = await zelle.boundingBox();
  pruefe(zellGroesse.height >= 44 && zellGroesse.width >= 44,
    'Matrixzellen sind mit einem Finger treffbar (' +
    Math.round(zellGroesse.width) + '×' + Math.round(zellGroesse.height) + ' px)');
  const summe = await page.textContent('table.matrix tfoot td >> nth=1');
  pruefe(/^\d+$/.test(summe.trim()), 'Summenzeile rechnet mit', 'gefunden: ' + summe);

  // --- PDF-Export ----------------------------------------------------------
  await page.click('nav.reiter button:has-text("Export")');
  await page.waitForSelector('.kennzahl');
  const pdfs = [
    ['Türliste kompakt', 'e2e-tuerliste.pdf'],
    ['Kreuzschließplan', 'e2e-plan.pdf'],
    ['Materialliste', 'e2e-material.pdf'],
    ['Türliste ausführlich', 'e2e-detail.pdf'],
    ['Prüfprotokoll', 'e2e-pruef.pdf']
  ];
  for (const [titel, datei] of pdfs) {
    const karte = page.locator('.karte.schmal').filter({ hasText: titel }).first();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 12000 }),
      karte.locator('button:has-text("PDF erzeugen")').click()
    ]);
    const ziel = path.join(AUS, datei);
    await download.saveAs(ziel);
    const groesse = fs.statSync(ziel).size;
    const kopf = fs.readFileSync(ziel).slice(0, 8).toString('latin1');
    pruefe(kopf.startsWith('%PDF-1.4') && groesse > 900,
      `PDF „${titel}“ im Browser erzeugt (${Math.round(groesse/1024)} KB)`,
      'Kopf: ' + JSON.stringify(kopf) + ' Größe: ' + groesse);
  }

  // --- JSON-Export ---------------------------------------------------------
  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.click('button:has-text("Projekt exportieren (ohne Fotos)")')
  ]);
  const jsonPfad = path.join(AUS, 'e2e-projekt.json');
  await jsonDownload.saveAs(jsonPfad);
  const daten = JSON.parse(fs.readFileSync(jsonPfad, 'utf8'));
  pruefe(daten.typ === 'schliessanlagen-aufmass' && daten.projekt.tueren.length === 2,
    'JSON-Export enthält das vollständige Projekt');

  // --- Neuladen: Daten müssen erhalten bleiben -----------------------------
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  await page.waitForTimeout(600);

  // Nach dem Start ist bewusst kein Projekt geöffnet
  const reiterAktiv = await page.textContent('nav.reiter button[aria-selected=true]');
  pruefe(/Projekte/.test(reiterAktiv), 'Start zeigt die Projektübersicht ohne offenes Projekt', reiterAktiv.trim());
  const titelLeer = await page.textContent('.projekt-titel');
  pruefe(/Kein Projekt/.test(titelLeer), 'kein Projekt aktiv ausgewählt', titelLeer.trim());
  const zurueckImKopf = await page.$$eval('.zurueck-knopf', n => n.length);
  pruefe(zurueckImKopf === 0, 'ohne Projekt gibt es keinen Zurück-Knopf');

  // Erst durch Öffnen wird gearbeitet
  await ersteProjektOeffnen(page);
  const titelNachOeffnen = await page.textContent('.projekt-titel');
  pruefe(/Müller/.test(titelNachOeffnen), 'Projekt lässt sich über „Öffnen“ aktivieren', titelNachOeffnen.trim());
  const tuerenNachReload = await page.$$eval('.tuer-zeile', n => n.length).catch(() => -1);
  pruefe(tuerenNachReload === 2, 'Türen bleiben nach Neuladen erhalten (IndexedDB)', 'gefunden: ' + tuerenNachReload);

  // Zurück auf die Projektübersicht schließt das Projekt
  await page.click('nav.reiter button:has-text("Projekte")');
  await page.waitForTimeout(700);
  const titelNachSchliessen = await page.textContent('.projekt-titel');
  pruefe(/Kein Projekt/.test(titelNachSchliessen),
    'Wechsel zur Übersicht schließt das Projekt', titelNachSchliessen.trim());
  await ersteProjektOeffnen(page);

  // --- Import --------------------------------------------------------------
  await page.click('nav.reiter button:has-text("Projekte")');
  await page.click('button:has-text("Projekt importieren")');
  await page.setInputFiles('.dialog input[type=file]', jsonPfad);
  await page.waitForTimeout(500);
  const dialogOffen = await page.$('.dialog-hinter');
  if (dialogOffen) {
    const ueberschreiben = await page.$('.dialog button:has-text("Überschreiben")');
    if (ueberschreiben) await ueberschreiben.click();
    await page.waitForTimeout(500);
  }
  // Nach dem Import wird das Projekt direkt geöffnet
  await page.waitForSelector('nav.reiter button[aria-selected=true]:has-text("Türen")', { timeout: 8000 });
  const tuerenNachImport = await page.$$eval('.tuer-zeile', n => n.length);
  pruefe(tuerenNachImport === 2, 'Import öffnet das Projekt direkt mit allen Türen',
    'gefunden: ' + tuerenNachImport);

  // Doppelte Projekte dürfen nicht entstehen (Überschreiben statt Kopie)
  await page.click('nav.reiter button:has-text("Projekte")');
  await page.waitForSelector('.projekt-karte');
  const projektZahl = await page.$$eval('.projekt-karte', n => n.length);
  pruefe(projektZahl === 1, 'Überschreiben erzeugt kein Duplikat', 'gefunden: ' + projektZahl);

  // --- Screenshots für die Sichtprüfung ------------------------------------
  await ersteProjektOeffnen(page);
  await page.screenshot({ path: path.join(AUS, 'ui-tueren.png'), fullPage: false });
  await page.click('nav.reiter button:has-text("Schließplan")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(AUS, 'ui-plan.png'), fullPage: false });
  await page.click('nav.reiter button:has-text("Türen")');
  await page.click('.tuer-zeile');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(AUS, 'ui-formular.png'), fullPage: false });
  await page.keyboard.press('Escape');

  // --- Hochformat (iPad) ---------------------------------------------------
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(300);
  const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  pruefe(!ueberlauf, 'kein horizontaler Überlauf im Hochformat');
  await page.screenshot({ path: path.join(AUS, 'ui-hochformat.png') });

  // --- iPhone-Breite -------------------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const ueberlaufKlein = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  pruefe(!ueberlaufKlein, 'kein horizontaler Überlauf bei 390 px Breite');

  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler in der Konsole',
    konsolenFehler.slice(0, 5).join('\n         '));

  await browser.close();
  console.log(`\nErgebnis E2E: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => {
  console.error('\nE2E abgebrochen:', e.message);
  console.error(e.stack.split('\n').slice(1,5).join('\n'));
  if (konsolenFehler.length) console.error('Konsolenfehler:\n  ' + konsolenFehler.join('\n  '));
  process.exit(1);
});
