/* Prüft die vier neuen Funktionen gegen die Oberfläche:
 *   1. Türen aus einem Bereich der Gliederung heraus erfassen
 *   2. Einzelpersonen und Gruppen je Schließung
 *   3. Pflichtangaben an der Tür (kennzeichnen, nicht blockieren)
 *   4. Einsteckschloss-, Tür- und Kabelangaben als freiwillige Felder
 */
const path = require('path');
const { starte, ersteProjektOeffnen } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

(async () => {
  const projekt = baueTestprojekt();
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const konsolenFehler = [];
  page.on('pageerror', e => konsolenFehler.push(e.message));

  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  await page.evaluate(async ([p, e]) => {
    await window.Store.projektSpeichern(p);
    await window.Store.einstellungenSpeichern(Object.assign({}, e, { letztesProjekt: p.id }));
  }, [projekt, einstellungen]);
  await page.reload({ waitUntil: 'load' });
  await ersteProjektOeffnen(page, 10000);

  /* =======================================================================
   * 1. Bereich antippen und dort Türen erfassen
   * ==================================================================== */
  console.log('\n== Türen je Bereich ==');
  await page.click('nav.reiter button:has-text("Struktur")');
  await page.waitForSelector('.knoten');

  /* Das Gebäude "Haus A" antippen */
  await page.click('.knoten:has-text("Haus A")');
  await page.waitForSelector('.bereich-kopf', { timeout: 8000 });
  const pfad = await page.textContent('.bereich-kopf .pfad');
  pruefe(/Standort Düsseldorf/.test(pfad) && /Haus A/.test(pfad),
    'der Pfad des Bereichs wird angezeigt', pfad.trim());

  const reiterAktiv = await page.textContent('nav.reiter button[aria-selected=true]');
  pruefe(/Struktur/.test(reiterAktiv),
    'die Bereichsansicht bleibt unter dem Reiter „Struktur“', reiterAktiv.trim());

  /* Haus A hat Erdgeschoss (7 Positionen) und 1. Obergeschoss (3) */
  const gezeigt = await page.$$eval('.tuer-zeile', n => n.length);
  const erwartetHausA = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const hausA = p.standorte.find(k => /Haus A/.test(k.name));
    return window.Model.tuerenUnter(p, hausA.id).length;
  });
  pruefe(gezeigt === erwartetHausA,
    'alle Türen des Gebäudes samt Unterbereichen werden gezeigt (' + gezeigt + ')',
    'erwartet ' + erwartetHausA);

  const gruppenTitel = await page.$$eval('.tuer-gruppe .kopfzeile span:first-child',
    n => n.map(x => x.textContent));
  pruefe(gruppenTitel.some(x => /Erdgeschoss/.test(x)) && gruppenTitel.some(x => /Obergeschoss/.test(x)),
    'die Türen sind nach Unterbereich gruppiert', gruppenTitel.join(' | '));

  const kacheln = await page.$$eval('.bereich-kachel .name', n => n.map(x => x.textContent));
  pruefe(kacheln.some(x => /Erdgeschoss/.test(x)),
    'Unterbereiche sind zum Weiterklicken aufgeführt', kacheln.join(' | '));

  /* Eine Tür hier anlegen: der Bereich muss bereits eingetragen sein */
  await page.click('.bereich-kachel:has-text("Erdgeschoss")');
  await page.waitForTimeout(400);
  const egName = await page.textContent('.seite h1');
  pruefe(/Erdgeschoss/.test(egName), 'ein Unterbereich lässt sich direkt öffnen', egName.trim());

  await page.click('button:has-text("+ Neue Tür hier")');
  await page.waitForSelector('.dialog');
  await page.waitForTimeout(300);
  const vorbelegt = await page.evaluate(() => {
    const d = document.querySelector('.dialog');
    const sel = [...d.querySelectorAll('select')].find(e =>
      [...e.options].some(o => /Erdgeschoss/.test(o.textContent)));
    const gewaehlt = sel ? sel.options[sel.selectedIndex].textContent : '';
    return { gewaehlt: gewaehlt.trim() };
  });
  pruefe(/Erdgeschoss/.test(vorbelegt.gewaehlt),
    'die neue Tür ist dem Bereich bereits zugeordnet', vorbelegt.gewaehlt);

  await page.fill('.dialog input[type=text] >> nth=1', 'Testtür aus dem Bereich');
  await page.click('.dialog .fuss button:has-text("Tür speichern")');
  await page.waitForTimeout(600);
  const neueImBereich = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const t = p.tueren.find(x => x.bezeichnung === 'Testtür aus dem Bereich');
    const eg = p.standorte.find(k => k.name === 'Erdgeschoss');
    return { zugeordnet: t && t.strukturId === eg.id, status: t && t.status };
  });
  pruefe(neueImBereich.zugeordnet === true,
    'die gespeicherte Tür hängt am richtigen Bereich');

  /* Zurück zur Struktur */
  await page.click('.bereich-kopf .zurueck-zeile');
  await page.waitForSelector('.baum', { timeout: 8000 });
  pruefe(await page.$$eval('.knoten', n => n.length) > 0,
    'der Zurück-Knopf führt wieder in die Gliederung');

  /* =======================================================================
   * 2. Pflichtangaben
   * ==================================================================== */
  console.log('\n== Pflichtangaben an der Tür ==');
  pruefe(neueImBereich.status === 'klaerung',
    'eine unvollständige Tür erhält den Status „Klärung nötig“', String(neueImBereich.status));

  await page.click('nav.reiter button:has-text("Türen")');
  await page.waitForSelector('.tuer-zeile');
  const warnung = await page.textContent('.meldung.warn');
  pruefe(/unvollständig/.test(warnung), 'die Türliste weist auf unvollständige Türen hin',
    warnung.trim().slice(0, 70));
  const pillen = await page.$$eval('.marke-pille.gelb', n => n.map(x => x.textContent));
  pruefe(pillen.some(x => /Pflicht offen/.test(x)),
    'unvollständige Türen sind in der Liste gekennzeichnet', pillen.slice(0, 3).join(' | '));

  const vorFilter = await page.$$eval('.tuer-zeile', n => n.length);
  await page.click('.meldung.warn button:has-text("Nur diese zeigen")');
  await page.waitForTimeout(400);
  const nachFilter = await page.$$eval('.tuer-zeile', n => n.length);
  const offeneZahl = await page.evaluate(() =>
    window.Model.unvollstaendigeTueren(window.AppKern.Zustand.projekt).length);
  pruefe(nachFilter === offeneZahl && nachFilter < vorFilter,
    'der Filter zeigt genau die unvollständigen Türen (' + nachFilter + ' von ' + vorFilter + ')',
    'erwartet ' + offeneZahl);
  await page.click('.meldung.warn button:has-text("Alle Türen zeigen")');
  await page.waitForTimeout(300);

  /* Ein von Hand gesetzter Status wird nicht überschrieben */
  await page.click('.tuer-zeile >> nth=0');
  await page.waitForSelector('.dialog');
  await page.waitForTimeout(300);
  const statusWahl = page.locator('.dialog select').filter({
    has: page.locator('option[value="freigegeben"]') }).first();
  await statusWahl.selectOption('freigegeben');
  await page.waitForTimeout(250);
  const vonHandHinweis = await page.$$eval('.dialog button',
    n => n.map(x => x.textContent).filter(x => /automatisch führen/.test(x)));
  pruefe(vonHandHinweis.length === 1,
    'nach eigener Wahl lässt sich der Status wieder automatisch führen');
  await page.click('.dialog .fuss button:has-text("Änderungen übernehmen")');
  await page.waitForTimeout(600);
  const bleibt = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const t = p.tueren.slice().sort((a, b) => String(a.nummer).localeCompare(String(b.nummer)))[0];
    return { status: t.status, vonHand: t.statusVonHand, nr: t.nummer };
  });
  pruefe(bleibt.status === 'freigegeben' && bleibt.vonHand === true,
    'ein selbst gewählter Status bleibt erhalten', JSON.stringify(bleibt));

  /* =======================================================================
   * 3. Freiwillige Felder: Einsteckschloss, Türmaße, Kabel
   * ==================================================================== */
  console.log('\n== Freiwillige Angaben ==');
  await page.click('.tuer-zeile:has-text("Haupteingang")');
  await page.waitForSelector('.dialog');
  await page.waitForTimeout(300);
  const abschnittsTitel = await page.$$eval('.dialog .abschnitt > summary span:first-child',
    n => n.map(x => x.textContent));
  pruefe(abschnittsTitel.some(x => /Türdaten/.test(x)) && abschnittsTitel.some(x => /Bestand/.test(x)),
    'die freiwilligen Abschnitte sind vorhanden', abschnittsTitel.join(' | '));

  const freiwillig = await page.$$eval('.dialog .abschnitt > summary .zusatz',
    n => n.map(x => x.textContent).filter(Boolean));
  pruefe(freiwillig.some(x => /freiwillig/.test(x)),
    'freiwillige Abschnitte sind als solche benannt', freiwillig.join(' | '));

  const detailBlock = await page.$$eval('.dialog summary span',
    n => n.map(x => x.textContent).filter(x => /Einsteckschloss im Detail/.test(x)));
  pruefe(detailBlock.length === 1, 'das Einsteckschloss hat einen eigenen Detailblock');

  const neueFelder = await page.evaluate(() => {
    const d = document.querySelector('.dialog');
    const namen = [...d.querySelectorAll('[data-feld]')].map(e => e.getAttribute('data-feld'));
    return ['schlossStulpform', 'schlossFallenart', 'schlossRiegelausschluss', 'schlossNorm',
            'tuerbreite', 'tuerhoehe', 'tuerAnschlag', 'elKabeluebergang', 'elLeitungsweg']
      .filter(k => namen.indexOf(k) === -1);
  });
  pruefe(neueFelder.length === 0, 'alle neuen freiwilligen Felder sind im Formular',
    'fehlt: ' + neueFelder.join(', '));

  /* Kein neues Feld ist Pflicht */
  const pflichtNamen = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const t = p.tueren.find(x => /Haupteingang/.test(x.bezeichnung || ''));
    return Object.keys(window.Model.pflichtSchluessel(p, t));
  });
  const verboten = ['schlossStulpform', 'schlossFallenart', 'schlossNorm', 'tuerbreite',
                    'tuerhoehe', 'tuerAnschlag', 'elKabeluebergang', 'elLeitungsweg',
                    'bestandFabrikat', 'notiz', 'bohrbild', 'stulpmass'];
  const falschPflicht = verboten.filter(k => pflichtNamen.indexOf(k) !== -1);
  pruefe(falschPflicht.length === 0, 'kein freiwilliges Feld ist Pflicht',
    falschPflicht.join(', '));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  /* =======================================================================
   * 4. Einzelpersonen und Gruppen je Schließung
   * ==================================================================== */
  console.log('\n== Personen und Gruppen ==');
  await page.click('nav.reiter button:has-text("Schließplan")');
  await page.waitForSelector('table.matrix');
  await page.click('button:has-text("+ Schließung")');
  await page.waitForSelector('.dialog');
  await page.fill('.dialog input[type=text] >> nth=0', 'TEST-GR');
  await page.fill('.dialog input[type=text] >> nth=1', 'Testgruppe');

  const traegerWahl = page.locator('.dialog select').filter({
    has: page.locator('option[value="gruppe"]') }).first();
  pruefe(await traegerWahl.count() === 1, 'die Frage nach dem Träger wird gestellt');
  await traegerWahl.selectOption('gruppe');
  await page.waitForTimeout(300);

  await page.fill('.dialog input[placeholder*="Reinigung"]', 'Reinigung Glanz GmbH');
  await page.waitForTimeout(250);
  const gruppenKnopf = await page.textContent('.dialog .gruppen-knopf');
  pruefe(/Reinigung Glanz GmbH/.test(gruppenKnopf),
    'der Gruppenname steht auf dem Knopf zur Mitgliederliste', gruppenKnopf.trim());

  /* Auf den Gruppennamen tippen öffnet die Mitgliederliste */
  await page.click('.dialog .gruppen-knopf');
  await page.waitForTimeout(400);
  const dialoge = await page.$$eval('.dialog', n => n.length);
  pruefe(dialoge === 2, 'der Klick auf den Gruppennamen öffnet die Mitgliederliste');

  const mitgliedDlg = '.dialog-hinter:last-of-type .dialog';
  await page.click(mitgliedDlg + ' button:has-text("+ Mitglied")');
  await page.waitForTimeout(250);
  await page.fill(mitgliedDlg + ' .person-zeile >> nth=0 >> input >> nth=0', 'Frau Yilmaz');
  await page.fill(mitgliedDlg + ' .person-zeile >> nth=0 >> input >> nth=1', 'Objektleitung');
  await page.fill(mitgliedDlg + ' .person-zeile >> nth=0 >> input >> nth=2', '2');
  await page.click(mitgliedDlg + ' button:has-text("+ Mitglied")');
  await page.waitForTimeout(250);
  await page.fill(mitgliedDlg + ' .person-zeile >> nth=1 >> input >> nth=0', 'Herr Novak');
  await page.waitForTimeout(250);
  await page.click(mitgliedDlg + ' .fuss button:has-text("Fertig")');
  await page.waitForTimeout(400);

  const nachMitglieder = await page.textContent('.dialog .gruppen-knopf');
  pruefe(/2 Mitglieder/.test(nachMitglieder), 'die Mitgliederzahl wird am Gruppennamen geführt',
    nachMitglieder.trim());

  /* Die Medienzahl ergibt sich aus der Summe: 2 + 1 = 3 */
  const medienFeld = await page.evaluate(() => {
    const d = document.querySelector('.dialog');
    const feld = [...d.querySelectorAll('.feld')].find(e =>
      /Anzahl Schlüssel/.test(e.querySelector('label') ? e.querySelector('label').textContent : ''));
    if (!feld) return null;
    const eing = feld.querySelector('input');
    return { wert: eing.value, nurLesen: eing.readOnly,
             label: feld.querySelector('label').textContent };
  });
  pruefe(medienFeld && medienFeld.wert === '3' && medienFeld.nurLesen === true,
    'die Anzahl der Medien ergibt sich aus den Personen (2 + 1 = 3)', JSON.stringify(medienFeld));
  pruefe(medienFeld && /automatisch/.test(medienFeld.label),
    'dass die Zahl errechnet wird, steht am Feld', medienFeld && medienFeld.label);

  /* Von Hand übersteuern muss möglich bleiben */
  await page.click('.dialog button:has-text("Anzahl von Hand eintragen")');
  await page.waitForTimeout(300);
  const vonHandFeld = await page.evaluate(() => {
    const d = document.querySelector('.dialog');
    const feld = [...d.querySelectorAll('.feld')].find(e =>
      /Anzahl Schlüssel/.test(e.querySelector('label') ? e.querySelector('label').textContent : ''));
    return feld ? { nurLesen: feld.querySelector('input').readOnly } : null;
  });
  pruefe(vonHandFeld && vonHandFeld.nurLesen === false,
    'die Anzahl lässt sich auch von Hand eintragen');
  await page.click('.dialog button:has-text("Wieder automatisch")');
  await page.waitForTimeout(300);

  await page.click('.dialog .fuss button:has-text("Anlegen")');
  await page.waitForTimeout(600);

  const gespeichert = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const s = p.schliessungen.find(x => x.kuerzel === 'TEST-GR');
    return { traegerArt: s.traegerArt, gruppenName: s.gruppenName,
             personen: s.personen.map(x => x.name + '/' + x.funktion + '/' + x.anzahlMedien),
             medien: window.Model.medienAnzahl(s), gespeichert: s.anzahlMedien };
  });
  pruefe(gespeichert.traegerArt === 'gruppe' && gespeichert.gruppenName === 'Reinigung Glanz GmbH',
    'die Gruppe ist gespeichert', JSON.stringify(gespeichert.gruppenName));
  pruefe(gespeichert.personen.length === 2 && /Frau Yilmaz\/Objektleitung\/2/.test(gespeichert.personen[0]),
    'die Mitglieder sind mit Funktion und Anzahl gespeichert', gespeichert.personen.join(' | '));
  pruefe(gespeichert.medien === 3 && gespeichert.gespeichert === 3,
    'die errechnete Anzahl steht auch im Projekt', String(gespeichert.gespeichert));

  /* Eine Gruppe ohne Namen wird nicht angelegt */
  await page.click('button:has-text("+ Schließung")');
  await page.waitForSelector('.dialog');
  await page.fill('.dialog input[type=text] >> nth=0', 'X1');
  await page.locator('.dialog select').filter({
    has: page.locator('option[value="gruppe"]') }).first().selectOption('gruppe');
  await page.waitForTimeout(250);
  await page.click('.dialog .fuss button:has-text("Anlegen")');
  await page.waitForTimeout(400);
  const nochOffen = await page.$$eval('.dialog', n => n.length);
  pruefe(nochOffen === 1, 'eine Gruppe ohne Namen wird nicht angelegt');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* Verwaltungsliste zeigt den Träger */
  await page.click('button:has-text("Verwalten")');
  await page.waitForSelector('.dialog table');
  const kopf = await page.$$eval('.dialog table th', n => n.map(x => x.textContent));
  pruefe(kopf.indexOf('Träger') !== -1 && kopf.indexOf('Rang im Plan') !== -1,
    'die Verwaltung unterscheidet Rang und Träger', kopf.join(' | '));
  const zeilenText = await page.textContent('.dialog table');
  pruefe(/Reinigung Glanz GmbH \(2 Personen\)/.test(zeilenText),
    'die Gruppe erscheint mit Mitgliederzahl', (zeilenText.match(/Reinigung[^\n]{0,40}/) || [''])[0]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler',
    konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\nErgebnis Bereich und Gruppen: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
