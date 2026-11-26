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

  // Eine Vorgabe des Planers in einer später freigegebenen Spalte: Reserve (O)
  await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    window.Model.setBerechtigung(p, p.tueren[2].id, p.schliessungen[5].id, 'plan');
  });

  // Zwei Türen gleichschließend: ihre Felder einer Spalte werden auf der Kundenseite gemeinsam gesetzt
  const verbund = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const ok = window.Model.gleichschliessendSetzen(p, p.tueren[7].id, p.tueren[6].id);
    return { ok: ok, haupt: p.tueren[6].nummer, mit: p.tueren[7].nummer };
  });
  pruefe(verbund.ok === true, 'Vorbereitung: Tür ' + verbund.mit + ' ist gleichschließend mit ' + verbund.haupt);

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
  pruefe(/2 Spalten/.test(vorschau), 'Vorschau nennt den Umfang', vorschau.trim().slice(0, 70));

  await page.fill('.dialog input[type=text] >> nth=0', 'Bitte die Reinigungszeiten eintragen');
  pruefe(!!(await page.$('.dialog input[type=date]')), 'die Frist ist ein Datumsfeld (kein freier Text, der auf der Kundenseite „Invalid Date“ würde)');
  await page.fill('.dialog input[type=date]', '2026-09-30');
  await page.click('.dialog button:has-text("Freigabe-Link erzeugen")');
  await page.waitForSelector('.dialog .schluessel-feld');
  const link = await page.inputValue('.dialog .schluessel-feld');
  pruefe(link.indexOf('freigabe.html#plan=') !== -1, 'Link zeigt auf die Freigabeseite');
  pruefe(link.length > 500, 'Link enthält die Plandaten (' + link.length + ' Zeichen)');
  const warnungLokal = await page.textContent('.dialog .meldung.warn').catch(() => '');
  pruefe(/lokale Datei/.test(warnungLokal), 'Hinweis bei lokaler Datei erscheint', warnungLokal.trim().slice(0, 60));
  pruefe(/E-Mail-Programme brechen lange Links/.test(await page.textContent('.dialog')), 'der Dialog erklärt, dass Mailprogramme lange Links zerlegen, und nennt die Datei als sicheren Weg');
  pruefe(!!(await page.$('.dialog button:has-text("E-Mail-Vorlage öffnen")')), 'auch ohne Server gibt es eine E-Mail-Vorlage');
  const lokaleListe = await page.textContent('.dialog .freigabe-liste').catch(() => '');
  pruefe(/freigegebene Felder/.test(lokaleListe) && !!(await page.$('.dialog .freigabe-eintrag button:has-text("Zurückziehen")')),
    'der Dialog führt die bisherigen Links ohne Server auf - mit Zurückziehen', lokaleListe.replace(/\s+/g, ' ').slice(0, 100));
  // Die Datei zum Doppelklick: eine kleine Seite, die auf die Freigabe weiterleitet
  const [linkDatei] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.click('.dialog button:has-text("Als Datei speichern")')
  ]);
  const linkDateiPfad = path.join(__dirname, 'out', 'freigabe-link.html');
  await linkDatei.saveAs(linkDateiPfad);
  const linkSeite = fs.readFileSync(linkDateiPfad, 'utf8');
  /* Der Dateiname kommt bei file://-Seiten in Chromium nicht an („download“) - im Netz schon; geprüft wird der Inhalt */
  pruefe(/http-equiv="refresh" content="0; url=/.test(linkSeite) && linkSeite.indexOf('href="' + link + '"') !== -1 && /<!DOCTYPE html>/.test(linkSeite),
    'die Datei ist eine HTML-Seite, die sofort auf den vollständigen Link weiterleitet', linkSeite.slice(0, 120));
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
  const infoText = await kundeSeite.$$eval('.meldung.info', n => n.map(x => x.textContent).join(' | '));
  pruefe(/Rückmeldung bitte bis: 30\.09\.2026/.test(infoText), 'die Frist steht als deutsches Datum im Hinweis', infoText.replace(/\s+/g, ' ').slice(0, 160));
  const hinweisText = await kundeSeite.textContent('.meldung.info');
  pruefe(/Reinigungszeiten/.test(hinweisText), 'der mitgegebene Hinweis erscheint');

  const freieZellen = await kundeSeite.$$eval('td.zelle.frei', n => n.length);
  const gesperrte = await kundeSeite.$$eval('td.zelle.gesperrt', n => n.length);
  /* Gesperrte (–) und befristete (T) Vorgaben bleiben in freigegebenen Spalten gesperrt (Vorgabe des Dialogs) */
  const maskeStand = await page.evaluate((a) => {
    const d = window.Freigabe.ausAnker(a.replace(/^#plan=/, ''));
    let frei = 0, geschuetzt = 0, falsch = 0;
    for (let i = 0; i < d.maske.length; i++) {
      const spalte = i % d.s.length;
      if (spalte !== 5 && spalte !== 10) { if (d.maske[i] === '1') falsch++; continue; }
      if (d.maske[i] === '1') frei++; else { geschuetzt++; if (d.matrix[i] !== '3' && d.matrix[i] !== '4') falsch++; }
    }
    return { frei, geschuetzt, falsch };
  }, anker);
  pruefe(freieZellen === maskeStand.frei && maskeStand.falsch === 0 && freieZellen + maskeStand.geschuetzt === projekt.tueren.length * 2,
    'nur die freigegebenen Spalten sind bearbeitbar (' + freieZellen + ' Felder, ' + maskeStand.geschuetzt + ' Vorgaben – und T bleiben gesperrt)', JSON.stringify(maskeStand));
  pruefe(gesperrte === projekt.tueren.length * projekt.schliessungen.length - freieZellen,
    'alle übrigen Felder sind gesperrt (' + gesperrte + ')');

  // Gesperrtes Feld antippen darf nichts bewirken
  const gesperrtesFeld = await kundeSeite.$('td.zelle.gesperrt');
  const vorherGesperrt = await gesperrtesFeld.textContent();
  await gesperrtesFeld.click();
  await kundeSeite.waitForTimeout(150);
  pruefe((await gesperrtesFeld.textContent()) === vorherGesperrt,
    'ein gesperrtes Feld lässt sich nicht ändern');

  // Drei freie Felder setzen
  let freie = await kundeSeite.$$('td.zelle.frei');
  await freie[0].click(); await kundeSeite.waitForTimeout(100);
  await freie[1].click(); await kundeSeite.waitForTimeout(100);
  await freie[1].click(); await kundeSeite.waitForTimeout(100);   // zweimal: X -> Z
  await freie[2].click(); await kundeSeite.waitForTimeout(150);
  const zaehlerText = await kundeSeite.textContent('#fr-zaehler');
  pruefe(/Änderung/.test(zaehlerText), 'die Änderungen werden gezählt', zaehlerText.trim());

  // --- Zwischenstand: Neuladen verliert nichts, Zurücksetzen fragt nach ---
  const zellenVorher = await kundeSeite.$$eval('td.zelle.frei', z => z.map(x => x.textContent).join(''));
  await kundeSeite.reload({ waitUntil: 'load' });
  await kundeSeite.waitForSelector('table.matrix', { timeout: 8000 });
  const entwurfHinweis = await kundeSeite.textContent('#fr-entwurf').catch(() => '');
  pruefe(/Zwischenstand/.test(entwurfHinweis) && /wieder da/.test(entwurfHinweis),
    'nach dem Neuladen ist der Zwischenstand wieder da und wird gemeldet', entwurfHinweis.replace(/\s+/g, ' ').trim().slice(0, 90));
  pruefe((await kundeSeite.$$eval('td.zelle.frei', z => z.map(x => x.textContent).join(''))) === zellenVorher,
    'die Eingaben stehen wieder wie vor dem Neuladen');
  pruefe((await kundeSeite.textContent('#fr-zaehler')) === zaehlerText, 'der Zähler stimmt wieder');
  pruefe(kundeNetz.length === 0, 'auch der Zwischenstand bleibt im Browser - nichts geht an einen Server', kundeNetz.join(', '));
  await kundeSeite.click('#fr-zuruecksetzen');
  await kundeSeite.waitForSelector('.dialog');
  const frage = await kundeSeite.textContent('.dialog');
  pruefe(/zurücksetzen\?/i.test(frage) && /verworfen/.test(frage), 'Zurücksetzen fragt vorher nach', frage.replace(/\s+/g, ' ').trim().slice(0, 100));
  await kundeSeite.click('.dialog button:has-text("Abbrechen")');
  await kundeSeite.waitForTimeout(150);
  pruefe((await kundeSeite.textContent('#fr-zaehler')) === zaehlerText, 'Abbrechen lässt die Eingaben stehen');
  await kundeSeite.click('#fr-zuruecksetzen');
  await kundeSeite.waitForSelector('.dialog');
  await kundeSeite.click('.dialog .fuss button:has-text("Zurücksetzen")');
  await kundeSeite.waitForTimeout(250);
  pruefe(!/Änderung/.test(await kundeSeite.textContent('#fr-zaehler')), 'nach dem Zurücksetzen gibt es keine Änderungen mehr', (await kundeSeite.textContent('#fr-zaehler')).trim());
  pruefe(!(await kundeSeite.$('#fr-entwurf')), 'der Hinweis auf den Zwischenstand ist weg');
  pruefe(await kundeSeite.$eval('#fr-zuruecksetzen', b => b.disabled), 'ohne Änderungen ist Zurücksetzen gesperrt');
  const gemerkt = await kundeSeite.evaluate(() => Object.keys(localStorage).filter(k => k.indexOf('aufmass.freigabe.entwurf.') === 0).length);
  pruefe(gemerkt === 0, 'im Browser bleibt kein Zwischenstand zurück');
  // Die drei Felder erneut setzen - der weitere Ablauf baut darauf auf
  freie = await kundeSeite.$$('td.zelle.frei');
  await freie[0].click(); await kundeSeite.waitForTimeout(100);
  await freie[1].click(); await kundeSeite.waitForTimeout(100);
  await freie[1].click(); await kundeSeite.waitForTimeout(100);
  await freie[2].click(); await kundeSeite.waitForTimeout(150);
  pruefe((await kundeSeite.textContent('#fr-zaehler')) === zaehlerText, 'die Felder lassen sich erneut setzen', (await kundeSeite.textContent('#fr-zaehler')).trim());
  pruefe(!(await kundeSeite.$eval('#fr-zuruecksetzen', b => b.disabled)), 'mit Änderungen ist Zurücksetzen wieder möglich');

  // --- Gleichschließende Türen ziehen mit ---
  const zeilen = await kundeSeite.$$('table.matrix tbody tr');
  async function zeileMitNr(nr) { for (const z of zeilen) { const n = await z.$('.tuername .nr'); if (n && (await n.textContent()) === nr) return z; } return null; }
  const hauptZeile = await zeileMitNr(verbund.haupt), mitZeile = await zeileMitNr(verbund.mit);
  pruefe(!!(hauptZeile && mitZeile && (await hauptZeile.$('.tuername .verbund')) && (await mitZeile.$('.tuername .verbund'))),
    'gleichschließende Türen sind auf der Kundenseite gekennzeichnet');
  if (hauptZeile && mitZeile) {
    const hauptFrei = await hauptZeile.$$('td.zelle.frei'), mitFrei = await mitZeile.$$('td.zelle.frei');
    const folge = [];
    let gleich = true;
    for (let k = 0; k < 4; k++) {
      await hauptFrei[0].click(); await kundeSeite.waitForTimeout(100);
      const a = await hauptFrei[0].textContent(), b = await mitFrei[0].textContent();
      folge.push(a + '=' + b);
      if (a !== b) gleich = false;
      if (!/geaendert/.test(await hauptFrei[0].getAttribute('class'))) break;
    }
    pruefe(gleich && folge[0].indexOf('X=X') === 0, 'ein Kreuz an der Haupttür setzt das Feld der gleichschließenden Tür mit - bei jedem Schritt gleich', folge.join(' '));
    pruefe(!/geaendert/.test(await mitFrei[0].getAttribute('class')), 'zurück am Anfang gilt auch die Mitläufertür als unverändert');
  }

  // --- Vorgabe „vorgeplant“ (O): sichtbar, erklärt, rückholbar ---
  const legende = await kundeSeite.textContent('.matrix-legende');
  const legendeZeichen = await kundeSeite.$$eval('.matrix-legende b', bs => bs.map(b => b.textContent));
  pruefe(/vorgeplant/.test(legende) && legendeZeichen.indexOf('O') !== -1, 'die Legende erklärt das O (vorgeplant)', legendeZeichen.join(',') + ' | ' + legende.trim().slice(0, 80));
  const reserveZellen = await kundeSeite.$$('td.zelle.frei.gesetzt-plan');
  pruefe(reserveZellen.length === 1, 'die vorgeplante Zelle liegt in einer freigegebenen Spalte und zeigt O', String(reserveZellen.length));
  if (reserveZellen.length === 1) {
    const rz = reserveZellen[0];
    const vorherZaehler = await kundeSeite.textContent('#fr-zaehler');
    pruefe((await rz.textContent()) === 'O', 'sie zeigt O');
    const folge = [];
    for (let k = 0; k < 4; k++) { await rz.click(); await kundeSeite.waitForTimeout(80); folge.push(await rz.textContent()); }
    pruefe(folge.join('|') === 'X|Z||O', 'Antippen läuft X, Z, leer und zurück zu O - die Vorgabe geht nicht verloren', folge.join('|'));
    pruefe(!/geaendert/.test(await rz.getAttribute('class')), 'zurück auf O gilt die Zelle nicht als geändert');
    pruefe((await kundeSeite.textContent('#fr-zaehler')) === vorherZaehler, 'und der Zähler steht wieder wie zuvor');
  }

  // --- Mitarbeiter und Gruppen: der Kunde darf sie pflegen (Vorgabe des Links) ---
  pruefe(await kundeSeite.$('#fr-listen') !== null, 'unter der Matrix stehen Mitarbeiter und Gruppen');
  const karten = await kundeSeite.$$eval('#fr-mitarbeiter .fr-ma', n => n.length);
  pruefe(karten === projekt.mitarbeiter.length, 'alle Mitarbeiter stehen zur Bearbeitung bereit (' + karten + ')');
  // Träger eines Schlüssels (Herr Lorenz trägt HS-A) lassen sich nicht entfernen
  let traegerKarte = null;
  for (const kk of await kundeSeite.$$('#fr-mitarbeiter .fr-ma')) { if (/Herr Lorenz/.test(await kk.$eval('input.name', n => n.value))) traegerKarte = kk; }
  pruefe(!!traegerKarte && !(await traegerKarte.$('button[title="Mitarbeiter entfernen"]')) && /Träger: HS-A/.test(await traegerKarte.textContent()),
    'ein Träger eines Schlüssels lässt sich nicht entfernen - die Karte nennt den Schlüssel', traegerKarte ? (await traegerKarte.textContent()).replace(/\s+/g, ' ').slice(0, 80) : 'keine Karte');
  await kundeSeite.click('#fr-ma-neu');
  await kundeSeite.waitForTimeout(150);
  const neueKarte = (await kundeSeite.$$('#fr-mitarbeiter .fr-ma')).pop();
  await neueKarte.$eval('input.name', n => { n.focus(); });
  await kundeSeite.keyboard.type('Frau Kundenseitig');
  await neueKarte.$eval('.chip', c => c.click());
  await neueKarte.$eval('button:has-text("+ Medium eintragen")', b => b.click());
  await kundeSeite.waitForTimeout(150);
  await neueKarte.$eval('input.anzahl', n => { n.focus(); n.select(); });
  await kundeSeite.keyboard.type('3');
  await kundeSeite.waitForTimeout(150);
  pruefe(await neueKarte.evaluate(n => n.classList.contains('geaendert')), 'der neue Mitarbeiter wird als Änderung markiert');
  const zaehler2 = await kundeSeite.textContent('#fr-zaehler');
  pruefe(/Mitarbeiterliste geändert/.test(zaehler2), 'der Zähler nennt die geänderte Mitarbeiterliste', zaehler2.trim());
  // Einen Mitarbeiter ohne eigene Spalte entfernen
  const entfernbar = await kundeSeite.$('#fr-mitarbeiter .fr-ma button[title="Mitarbeiter entfernen"]');
  if (entfernbar) {
    await entfernbar.click();
    await kundeSeite.waitForTimeout(150);
    pruefe((await kundeSeite.$$eval('#fr-mitarbeiter .fr-ma', n => n.length)) === karten, 'auch das Entfernen zählt (einer dazu, einer weg)');
  }
  // Eine neue Gruppe
  await kundeSeite.click('#fr-gruppe-neu');
  await kundeSeite.waitForTimeout(150);
  await kundeSeite.keyboard.type('Empfang');
  await kundeSeite.waitForTimeout(150);
  const zaehler3 = await kundeSeite.textContent('#fr-zaehler');
  pruefe(/Gruppen geändert/.test(zaehler3), 'der Zähler nennt die geänderten Gruppen', zaehler3.trim());

  // --- Rückmeldung erzeugen ---
  await kundeSeite.click('button:has-text("Rückmeldung erzeugen")');
  await kundeSeite.waitForSelector('.dialog .schluessel-feld');
  const rueckschluessel = await kundeSeite.inputValue('.dialog .schluessel-feld');
  pruefe(rueckschluessel.length > 50, 'Rückschlüssel erzeugt (' + rueckschluessel.length + ' Zeichen)');
  pruefe(rueckschluessel.length < link.length / 2,
    'die Rückmeldung ist deutlich kürzer als der Plan (nur die Änderungen)');
  const antwortDialogText = await kundeSeite.textContent('.dialog');
  pruefe(/Anhang an \S+@\S+ zurücksenden/.test(antwortDialogText), 'die Adresse für die Rückmeldung steht im Dialog (aus dem Firmenkopf)', antwortDialogText.replace(/\s+/g, ' ').slice(0, 120));
  const mailKnopf = await kundeSeite.$('.dialog button:has-text("E-Mail mit dem Schlüssel öffnen")');
  pruefe(!!mailKnopf === (rueckschluessel.length <= 1500), 'kurze Rückschlüssel lassen sich direkt als E-Mail öffnen', String(!!mailKnopf) + ' bei ' + rueckschluessel.length + ' Zeichen');

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
  const vorschauBericht = await page.textContent('.dialog .antwort-bericht').catch(() => '');
  pruefe(/Berechtigung/.test(vorschauBericht) && /Bisher/.test(vorschauBericht) && /Neu/.test(vorschauBericht) && /Frau Kundenseitig/.test(vorschauBericht),
    'vor dem Übernehmen steht eine Vorschau der Änderungen im Dialog', vorschauBericht.trim().slice(0, 160));

  const vorher = await page.evaluate(() => JSON.stringify(window.AppKern.Zustand.projekt.matrix));
  await page.click('.dialog button:has-text("Änderungen übernehmen")');
  await page.waitForTimeout(300);
  const meldung = await page.textContent('#toast-bereich').catch(() => '');
  pruefe(/übernommen/i.test(meldung), 'Ergebnis wird gemeldet', meldung.trim().slice(0, 70));
  await page.waitForTimeout(600);
  const nachher = await page.evaluate(() => JSON.stringify(window.AppKern.Zustand.projekt.matrix));
  pruefe(vorher !== nachher, 'die Berechtigungen des Kunden stehen im Projekt');
  // Der Bericht bleibt in einem Dialog zum Nachlesen offen (eine Meldung verschwände nach Sekunden)
  const bericht = await page.textContent('.dialog').catch(() => '');
  pruefe(/Rückmeldung übernommen/.test(bericht) && /Mitarbeiter neu/.test(bericht) && /Gruppe neu/.test(bericht)
    && /Frau Kundenseitig/.test(bericht) && /Empfang/.test(bericht),
    'der Bericht nennt den neuen Mitarbeiter und die neue Gruppe mit Namen', bericht.trim().slice(0, 160));
  await page.click('.dialog button:has-text("Schließen")');
  await page.waitForTimeout(200);
  const imProjekt = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const m = p.mitarbeiter.find(x => x.name === 'Frau Kundenseitig');
    return { mitarbeiter: m ? [m.name, m.gruppen.length, m.medien.map(x => x.anzahl), /^ma-/.test(m.id)] : null,
             gruppe: p.gruppen.some(g => g.name === 'Empfang'), alleKennungen: p.mitarbeiter.every(x => /^ma-/.test(x.id)) };
  });
  pruefe(imProjekt.mitarbeiter && imProjekt.mitarbeiter[1] === 1 && imProjekt.mitarbeiter[2][0] === 3,
    'der vom Kunden eingetragene Mitarbeiter steht mit Gruppe und Anzahl im Projekt', JSON.stringify(imProjekt));
  pruefe(imProjekt.mitarbeiter && imProjekt.mitarbeiter[3] === true && imProjekt.alleKennungen, 'und alle Mitarbeiter tragen eigene Kennungen');
  pruefe(imProjekt.gruppe, 'die neue Gruppe „Empfang“ ist angelegt');

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

  // --- Lokale Datei mit hinterlegter Kundenseite: der lange Link führt ins Internet ---
  await page.evaluate(() => window.App.wechseln('einstellungen'));
  await page.waitForSelector('.karte:has(h2:has-text("Kundenfreigabe")) input[type=text]');
  await page.fill('.karte:has(h2:has-text("Kundenfreigabe")) input[type=text]', 'https://beispiel.example/aufmasstool/freigabe.html');
  await page.waitForTimeout(150);
  await page.evaluate(() => window.App.wechseln('plan'));
  await page.waitForSelector('table.matrix');
  await page.click('button:has-text("Kundenfreigabe")');
  await page.waitForSelector('.dialog .chip');
  await page.click('.dialog .chip >> nth=5');
  await page.click('.dialog button:has-text("Freigabe-Link erzeugen")');
  await page.waitForSelector('.dialog .schluessel-feld');
  const link2 = await page.inputValue('.dialog .schluessel-feld');
  pruefe(link2.indexOf('https://beispiel.example/aufmasstool/freigabe.html#plan=') === 0,
    'mit hinterlegter Kundenseite führt der lange Link dorthin statt auf die lokale Datei', link2.slice(0, 80));
  pruefe(!(await page.$('.dialog .meldung.warn')), 'die Warnung zur lokalen Datei entfällt dann');
  await page.click('.dialog .fuss button:has-text("Schließen")');

  pruefe(konsolenFehler.length === 0, 'keine Fehler in der Anwendung', konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\nErgebnis Freigabe: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
