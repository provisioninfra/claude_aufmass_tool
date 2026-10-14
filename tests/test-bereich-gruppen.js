/* Prüft die vier neuen Funktionen gegen die Oberfläche:
 *   1. Türen aus einem Bereich der Gliederung heraus erfassen
 *   2. Gruppen und Mitarbeiter als Spalten im Schließplan
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
   * 4. Gruppen und Mitarbeiter als Spalten im Schließplan
   * ==================================================================== */
  console.log('\n== Gruppen und Mitarbeiter ==');
  await page.click('nav.reiter button:has-text("Schließplan")');
  await page.waitForSelector('table.matrix');
  pruefe(await page.$('.personen-karte') !== null, 'unter der Matrix stehen Mitarbeiter und Gruppen');

  /* Eine neue Gruppe direkt als Spalte anlegen */
  await page.click('button:has-text("+ Spalte")');
  await page.waitForSelector('.dialog');
  const artChips = await page.$$eval('.dialog .chips >> nth=0 >> .chip', n => n.map(x => x.textContent.trim()));
  pruefe(artChips.join('|') === 'Gruppe|Mitarbeiter|Schließung / Schlüssel',
    'die Spaltenart wird zuerst gefragt: Gruppe, Mitarbeiter oder Schließung', artChips.join('|'));
  await page.click('.dialog .chip:has-text("Gruppe")');
  await page.waitForTimeout(250);
  await page.fill('.dialog input[placeholder="Name der neuen Gruppe"]', 'Reinigung Glanz GmbH');
  await page.click('.dialog .fuss button:has-text("Anlegen")');
  await page.waitForTimeout(600);
  const spalte = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const g = p.gruppen.find(x => x.name === 'Reinigung Glanz GmbH');
    const s = g && p.schliessungen.find(x => x.art === 'gruppe' && x.gruppeId === g.id);
    return { gruppe: !!g, spalte: !!s, kuerzel: s && s.kuerzel, bezeichnung: s && s.bezeichnung };
  });
  pruefe(spalte.gruppe && spalte.spalte, 'die Gruppe ist angelegt und hat eine Spalte', JSON.stringify(spalte));
  pruefe(spalte.kuerzel === 'RGG' && spalte.bezeichnung === 'Reinigung Glanz GmbH',
    'die Spalte heißt wie die Gruppe und bekommt ein Kürzel aus dem Namen', JSON.stringify(spalte));

  /* Mitarbeiter entstehen nacheinander über „+ Mitarbeiter“ - ohne
   * Gruppenauswahl; zugeordnet wird danach in der Gruppe. */
  await page.click('.personen-karte button:has-text("+ Mitarbeiter")');
  await page.waitForSelector('.dialog');
  pruefe(/Neuer Mitarbeiter/.test(await page.textContent('.dialog .kopf')), '„+ Mitarbeiter“ öffnet den Dialog für einen neuen Mitarbeiter');
  pruefe(await page.$('.dialog [data-feld="gruppen"]') === null, 'beim Anlegen gibt es keine Gruppenauswahl');
  const mitarbeiterDlg = '.dialog-hinter:last-of-type .dialog';
  await page.fill(mitarbeiterDlg + ' input[placeholder="z. B. Max Mustermann"]', 'Frau Yilmaz');
  await page.click(mitarbeiterDlg + ' button:has-text("+ Medium eintragen")');
  await page.waitForTimeout(250);
  await page.fill(mitarbeiterDlg + ' .medien-zeile .zahl-anzeige', '2');
  await page.click(mitarbeiterDlg + ' .fuss button:has-text("Anlegen & neuer Mitarbeiter")');
  await page.waitForTimeout(500);
  pruefe((await page.$$eval('.dialog', n => n.length)) === 1 && /Neuer Mitarbeiter/.test(await page.textContent('.dialog .kopf')),
    '„Anlegen & neuer Mitarbeiter“ öffnet gleich den nächsten Dialog');
  pruefe((await page.inputValue(mitarbeiterDlg + ' input[placeholder="z. B. Max Mustermann"]')) === '',
    'der nächste Dialog ist leer');
  await page.fill(mitarbeiterDlg + ' input[placeholder="z. B. Max Mustermann"]', 'Herr Novak');
  await page.click(mitarbeiterDlg + ' .fuss button:text-is("Anlegen")');
  await page.waitForTimeout(500);
  pruefe((await page.$$eval('.dialog', n => n.length)) === 0, '„Anlegen“ schließt den Dialog');
  const angelegt = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    return ['Frau Yilmaz', 'Herr Novak'].map(n => { const m = p.mitarbeiter.find(x => x.name === n); return m ? n + '/' + window.Model.mitarbeiterMedienAnzahl(m) + '/' + (m.gruppen || []).length : 'fehlt'; });
  });
  pruefe(angelegt.join('|') === 'Frau Yilmaz/2/0|Herr Novak/1/0',
    'beide Mitarbeiter sind angelegt - mit Medien, noch ohne Gruppe', angelegt.join(' | '));

  /* Zuordnen in der Gruppe: Mitglieder antippen */
  await page.click('.gruppen-liste .chip.gruppe:has-text("Reinigung Glanz GmbH")');
  await page.waitForSelector('.dialog');
  pruefe(/Gruppe bearbeiten/.test(await page.textContent('.dialog .kopf')), 'ein Tippen auf die Gruppe öffnet sie');
  pruefe(await page.$('.dialog .chip:has-text("+ Mitarbeiter anlegen")') === null, 'in der Gruppe werden keine Mitarbeiter angelegt - nur zugeordnet');
  await page.click('.dialog [data-feld="mitglieder"] .chip:has-text("Frau Yilmaz")');
  await page.click('.dialog [data-feld="mitglieder"] .chip:has-text("Herr Novak")');
  const gedrueckt = await page.$$eval('.dialog [data-feld="mitglieder"] .chip[aria-pressed="true"]', n => n.map(x => x.textContent.trim()));
  pruefe(gedrueckt.indexOf('Frau Yilmaz') !== -1 && gedrueckt.indexOf('Herr Novak') !== -1,
    'angetippte Mitarbeiter sind als Mitglieder gewählt', gedrueckt.join(' | '));
  await page.click('.dialog .fuss button:has-text("Übernehmen")');
  await page.waitForTimeout(600);

  const gespeichert = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const g = p.gruppen.find(x => x.name === 'Reinigung Glanz GmbH');
    const s = p.schliessungen.find(x => x.art === 'gruppe' && x.gruppeId === g.id);
    const leute = window.Model.gruppenMitglieder(p, g.id);
    return { mitglieder: leute.map(m => m.name + '/' + window.Model.mitarbeiterMedienAnzahl(m)),
             medien: window.Model.medienAnzahl(p, s), kopf: document.querySelector('th.spaltenkopf[data-id="' + s.id + '"] .medien').textContent };
  });
  pruefe(gespeichert.mitglieder.length === 2 && /Frau Yilmaz\/2/.test(gespeichert.mitglieder.join()),
    'die Mitglieder stehen in der Mitarbeiterliste - mit ihrer Medienzahl', gespeichert.mitglieder.join(' | '));
  pruefe(gespeichert.medien === 3 && gespeichert.kopf === '3×',
    'die Medien der Spalte ergeben sich aus den Mitarbeitern (2 + 1 = 3) - auch im Spaltenkopf', JSON.stringify(gespeichert));
  pruefe(/2 Mitglieder/.test(await page.textContent('.gruppen-liste .chip.gruppe:has-text("Reinigung Glanz GmbH")')),
    'die Mitgliederzahl steht an der Gruppe');

  /* Eine Gruppe ohne Namen wird nicht angelegt */
  await page.click('.personen-karte button:has-text("+ Gruppe")');
  await page.waitForSelector('.dialog');
  pruefe(await page.$('.dialog [data-feld="mitglieder"]') === null, 'beim Anlegen einer Gruppe gibt es keine Mitgliederauswahl');
  await page.click('.dialog .fuss button:text-is("Anlegen")');
  await page.waitForTimeout(400);
  const nochOffen = await page.$$eval('.dialog', n => n.length);
  const dialogTitel = () => page.$$eval('.dialog .kopf h2', n => n.map(x => x.textContent.trim()).join(' | '));
  pruefe(nochOffen === 1, 'eine Gruppe ohne Namen wird nicht angelegt', 'offene Dialoge: ' + nochOffen + ' (' + (await dialogTitel()) + ')');
  await page.click('.dialog .fuss button:has-text("Anlegen & neue Gruppe")');
  await page.waitForTimeout(400);
  const nochOffen2 = await page.$$eval('.dialog', n => n.length);
  pruefe(nochOffen2 === 1, 'auch „Anlegen & neue Gruppe“ braucht einen Namen', 'offene Dialoge: ' + nochOffen2 + ' (' + (await dialogTitel()) + ')');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* Ein Mitarbeiter, der einzeln und über die Gruppe berechtigt ist, wird gemeldet */
  await page.click('.personen-tabelle tr:has-text("Frau Yilmaz") button:has-text("Bearbeiten")');
  await page.waitForSelector('.dialog');
  await page.click('.dialog label.schalter:has-text("Eigene Spalte")');
  await page.click('.dialog .fuss button:has-text("Übernehmen")');
  await page.waitForTimeout(600);
  pruefe(await page.$('.doppelt-hinweis') !== null && /Frau Yilmaz/.test(await page.textContent('.doppelt-hinweis')),
    'steht jemand einzeln und in seiner Gruppe, erscheint ein Hinweis', (await page.textContent('.doppelt-hinweis').catch(() => '')).slice(0, 80));

  /* Verwaltungsliste zeigt Art und Träger */
  await page.click('button:has-text("Verwalten")');
  await page.waitForSelector('.dialog table');
  const kopf = await page.$$eval('.dialog table th', n => n.map(x => x.textContent));
  pruefe(kopf.indexOf('Art') !== -1 && kopf.indexOf('Träger / Mitglieder') !== -1,
    'die Verwaltung unterscheidet Art und Träger', kopf.join(' | '));
  const zeilenText = await page.textContent('.dialog table');
  pruefe(/Reinigung Glanz GmbH/.test(zeilenText) && /2 Mitglieder/.test(zeilenText),
    'die Gruppe erscheint mit Mitgliederzahl', (zeilenText.match(/Reinigung[^\n]{0,60}/) || [''])[0]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler',
    konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\nErgebnis Bereich und Gruppen: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
