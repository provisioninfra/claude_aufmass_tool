/* Prüft den Weg: Freigabe erzeugen → Kunde trägt ein → Rückmeldung einlesen. */
const path = require('path');
const fs = require('fs');
const { starte, ersteProjektOeffnen } = require('./browser.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');
const FREIGABE = 'file://' + path.join(__dirname, '..', 'src', 'freigabe.html');
const { baueTestprojekt, einstellungen } = require('./fixture.js');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

(async () => {
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const konsolenFehler = [];
  page.on('pageerror', e => konsolenFehler.push(e.message));
  page.on('console', m => { if (m.type() === 'error') konsolenFehler.push(m.text()); });

  console.log('\n== Kundenfreigabe ==');
  const projekt = baueTestprojekt();
  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  await page.evaluate(async ([p, e]) => {
    await window.Store.projektSpeichern(p);
    await window.Store.einstellungenSpeichern(e);
  }, [projekt, Object.assign({}, einstellungen, { letztesProjekt: projekt.id })]);
  await page.reload({ waitUntil: 'load' });
  await ersteProjektOeffnen(page);

  await page.evaluate(() => window.App.wechseln('plan'));
  await page.waitForSelector('table.matrix');

  // --- Freigabe erzeugen ---
  await page.click('button:has-text("Kundenfreigabe")');
  await page.waitForSelector('.dialog');
  const chips = await page.$$('.dialog .chip');
  pruefe(chips.length === projekt.schliessungen.length,
    'alle Schließungen stehen zur Freigabe bereit (' + chips.length + ')');

  // Zwei Schließungen freigeben
  await chips[5].click();
  await chips[10].click();
  await page.waitForTimeout(200);
  const vorschau = await page.textContent('.dialog .meldung');
  pruefe(/2 Schließungen/.test(vorschau), 'Vorschau nennt den Umfang', vorschau.trim().slice(0, 70));

  await page.fill('.dialog input[type=text] >> nth=0', 'Bitte die Reinigungszeiten eintragen');
  await page.click('.dialog button:has-text("Freigabe-Link erzeugen")');
  await page.waitForSelector('.dialog .schluessel-feld');
  const link = await page.inputValue('.dialog .schluessel-feld');
  pruefe(link.indexOf('freigabe.html#plan=') !== -1, 'Link zeigt auf die Freigabeseite');
  pruefe(link.length > 500, 'Link enthält die Plandaten (' + link.length + ' Zeichen)');
  const warnungLokal = await page.textContent('.dialog .meldung.warn').catch(() => '');
  pruefe(/lokale Datei/.test(warnungLokal), 'Hinweis bei lokaler Datei erscheint', warnungLokal.trim().slice(0, 60));
  await page.click('.dialog .fuss button:has-text("Schließen")');

  // --- Kundenseite öffnen ---
  const anker = link.slice(link.indexOf('#'));
  const kundeSeite = await ctx.newPage();
  const kundeFehler = [];
  kundeSeite.on('pageerror', e => kundeFehler.push(e.message));
  const kundeNetz = [];
  kundeSeite.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) kundeNetz.push(r.url()); });

  await kundeSeite.goto(FREIGABE + anker, { waitUntil: 'load' });
  await kundeSeite.waitForSelector('table.matrix', { timeout: 8000 });
  pruefe(true, 'Kunde kann die Matrix über den Link öffnen');
  pruefe(kundeNetz.length === 0, 'die Kundenseite sendet nichts an einen Server', kundeNetz.join(', '));

  const kopfText = await kundeSeite.textContent('.fr-kopf');
  pruefe(/Müller/.test(kopfText), 'Kunde und Objekt werden angezeigt', kopfText.trim().slice(0, 60));
  const hinweisText = await kundeSeite.textContent('.meldung.info');
  pruefe(/Reinigungszeiten/.test(hinweisText), 'der mitgegebene Hinweis erscheint');

  const freieZellen = await kundeSeite.$$eval('td.zelle.frei', n => n.length);
  const gesperrte = await kundeSeite.$$eval('td.zelle.gesperrt', n => n.length);
  pruefe(freieZellen === projekt.tueren.length * 2,
    'nur die freigegebenen Spalten sind bearbeitbar (' + freieZellen + ' Felder)');
  pruefe(gesperrte === projekt.tueren.length * (projekt.schliessungen.length - 2),
    'alle übrigen Felder sind gesperrt (' + gesperrte + ')');

  // Gesperrtes Feld antippen darf nichts bewirken
  const gesperrtesFeld = await kundeSeite.$('td.zelle.gesperrt');
  const vorherGesperrt = await gesperrtesFeld.textContent();
  await gesperrtesFeld.click();
  await kundeSeite.waitForTimeout(150);
  pruefe((await gesperrtesFeld.textContent()) === vorherGesperrt,
    'ein gesperrtes Feld lässt sich nicht ändern');

  // Drei freie Felder setzen
  const freie = await kundeSeite.$$('td.zelle.frei');
  await freie[0].click(); await kundeSeite.waitForTimeout(100);
  await freie[1].click(); await kundeSeite.waitForTimeout(100);
  await freie[1].click(); await kundeSeite.waitForTimeout(100);   // zweimal: X -> Z
  await freie[2].click(); await kundeSeite.waitForTimeout(150);
  const zaehlerText = await kundeSeite.textContent('#fr-zaehler');
  pruefe(/Änderung/.test(zaehlerText), 'die Änderungen werden gezählt', zaehlerText.trim());

  // --- Rückmeldung erzeugen ---
  await kundeSeite.click('button:has-text("Rückmeldung erzeugen")');
  await kundeSeite.waitForSelector('.dialog .schluessel-feld');
  const rueckschluessel = await kundeSeite.inputValue('.dialog .schluessel-feld');
  pruefe(rueckschluessel.length > 50, 'Rückschlüssel erzeugt (' + rueckschluessel.length + ' Zeichen)');
  pruefe(rueckschluessel.length < link.length / 2,
    'die Rückmeldung ist deutlich kürzer als der Plan (nur die Änderungen)');

  // Auch als Datei
  const [download] = await Promise.all([
    kundeSeite.waitForEvent('download', { timeout: 8000 }),
    kundeSeite.click('.dialog button:has-text("als Datei speichern")')
  ]);
  const dateiPfad = path.join(__dirname, 'out', 'rueckmeldung.txt');
  await download.saveAs(dateiPfad);
  pruefe(fs.readFileSync(dateiPfad, 'utf8').trim() === rueckschluessel,
    'die Datei enthält denselben Rückschlüssel');
  pruefe(kundeFehler.length === 0, 'keine Fehler auf der Kundenseite', kundeFehler.join(' | '));
  await kundeSeite.close();

  // --- Rückmeldung einlesen ---
  await page.bringToFront();
  await page.click('button:has-text("Rückmeldung")');
  await page.waitForSelector('.dialog textarea');
  await page.fill('.dialog textarea', rueckschluessel);
  await page.waitForTimeout(400);
  const pruefText = await page.textContent('.dialog .meldung');
  pruefe(/Änderung/.test(pruefText), 'die Rückmeldung wird vorab geprüft', pruefText.trim().slice(0, 70));

  const vorher = await page.evaluate(() => JSON.stringify(window.AppKern.Zustand.projekt.matrix));
  await page.click('.dialog button:has-text("Änderungen übernehmen")');
  await page.waitForTimeout(300);
  const meldung = await page.textContent('#toast-bereich').catch(() => '');
  pruefe(/übernommen/i.test(meldung), 'Ergebnis wird gemeldet', meldung.trim().slice(0, 70));
  await page.waitForTimeout(600);
  const nachher = await page.evaluate(() => JSON.stringify(window.AppKern.Zustand.projekt.matrix));
  pruefe(vorher !== nachher, 'die Berechtigungen des Kunden stehen im Projekt');

  // Zurück-Knopf kann die Übernahme rücknehmen
  const zurueckMoeglich = await page.$('.zurueck-knopf:not([disabled])');
  pruefe(!!zurueckMoeglich, 'die Übernahme lässt sich zurücknehmen');

  // --- Fremdes Projekt wird abgelehnt ---
  const fremd = await page.evaluate((schluessel) => {
    const antwort = window.Freigabe.antwortAusSchluessel(schluessel);
    antwort.pid = 'anderes-projekt';
    try {
      window.Freigabe.antwortUebernehmen(window.AppKern.Zustand.projekt, antwort);
      return 'kein Fehler';
    } catch (e) { return e.message; }
  }, rueckschluessel);
  pruefe(/anderen Projekt/.test(fremd), 'Rückmeldung eines fremden Projekts wird abgelehnt', fremd);

  pruefe(konsolenFehler.length === 0, 'keine Fehler in der Anwendung', konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\nErgebnis Freigabe: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
