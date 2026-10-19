/* Prüft den Ablauf „Mitarbeiter und Gruppen nacheinander anlegen“ im
 * Schließplan gegen die Oberfläche:
 *   1. Mitarbeiter einzeln anlegen - „Anlegen“ oder „Anlegen & neuer
 *      Mitarbeiter“ (auch per Enter); beim Anlegen keine Gruppenauswahl
 *   2. Gruppen einzeln anlegen - „Anlegen“ oder „Anlegen & neue Gruppe“;
 *      beim Anlegen keine Mitgliederauswahl
 *   3. Zuordnen erst, wenn beides da ist: in der Gruppe (Mitglieder) und
 *      beim angelegten Mitarbeiter (Gruppen) - in beide Richtungen
 *   4. Spalten und Medienzahlen, Abbrechen, Löschen, Träger einer Schließung
 */
const path = require('path');
const { starte, ersteProjektOeffnen, istUmgebungsGeraeusch } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

const NAME = 'input[placeholder="z. B. Max Mustermann"]';
const FUNKTION = 'input[placeholder="z. B. Hausmeister"]';
const GRUPPENNAME = 'input[placeholder="z. B. Verwaltung, Reinigung, EDV"]';
const DLG = '.dialog-hinter:last-of-type .dialog';

(async () => {
  const projekt = baueTestprojekt();
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const konsolenFehler = [];
  page.on('pageerror', e => { if (!istUmgebungsGeraeusch(e.message, e.stack)) konsolenFehler.push(e.message); });

  const dialoge = () => page.$$eval('.dialog', n => n.length);
  const fussKnoepfe = () => page.$$eval(DLG + ' .fuss button', n => n.map(x => x.textContent.trim()));
  const zeile = name => page.$eval('.personen-tabelle tr:has-text("' + name + '")',
    r => [].slice.call(r.querySelectorAll('td')).map(td => td.textContent.replace(/\s+/g, ' ').trim()));
  const stand = () => page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt, M = window.Model;
    return {
      mitarbeiter: p.mitarbeiter.map(m => ({ name: m.name, funktion: m.funktion || '',
        gruppen: (m.gruppen || []).map(id => (M.gruppeVon(p, id) || {}).name).sort(), medien: M.mitarbeiterMedienAnzahl(m) })),
      gruppen: p.gruppen.map(g => ({ name: g.name, mitglieder: M.gruppenMitglieder(p, g.id).map(m => m.name).sort(),
        spalte: p.schliessungen.some(s => s.art === 'gruppe' && s.gruppeId === g.id) })),
      spalten: p.schliessungen.map(s => s.art + ':' + (s.kuerzel || s.bezeichnung))
    };
  });

  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  await page.evaluate(async ([p, e]) => {
    await window.Store.projektSpeichern(p);
    await window.Store.einstellungenSpeichern(Object.assign({}, e, { letztesProjekt: p.id }));
  }, [projekt, einstellungen]);
  await page.reload({ waitUntil: 'load' });
  await ersteProjektOeffnen(page, 10000);

  /* Leere Ausgangslage: alle Mitarbeiter und Gruppen samt Spalten weg */
  await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt, M = window.Model;
    p.mitarbeiter.slice().forEach(m => M.mitarbeiterLoeschen(p, m.id));
    p.gruppen.slice().forEach(g => M.gruppeLoeschen(p, g.id));
    M.spaltenAngleichen(p);
    window.AppKern.alsGeaendertMarkieren(); window.AppKern.speichern();
    window.App.wechseln('plan');
  });
  await page.waitForSelector('table.matrix');
  await page.waitForTimeout(300);

  /* =======================================================================
   * 1. Ausgangslage
   * ==================================================================== */
  console.log('\n== Ausgangslage ==');
  pruefe(await page.$('.personen-karte') !== null, 'unter der Matrix steht die Karte „Mitarbeiter und Gruppen“');
  const reihenfolge = await page.$$eval('.personen-karte .personen-abschnitt', n => n.map(x => x.className.replace('personen-abschnitt', '').trim()));
  pruefe(reihenfolge.join('|') === 'mitarbeiter-abschnitt|gruppen-abschnitt', 'erst die Mitarbeiter, dann die Gruppen', reihenfolge.join('|'));
  const kartenText = await page.textContent('.personen-karte');
  pruefe(/Noch keine Mitarbeiter angelegt/.test(kartenText) && /Noch keine Gruppen/.test(kartenText),
    'beide Listen sind leer und sagen, wie es weitergeht');
  pruefe(/Mitarbeiter \(0\)/.test(kartenText) && /Gruppen \(0\)/.test(kartenText), 'die Überschriften zählen 0 / 0');
  pruefe(/Erst die Mitarbeiter anlegen, dann die Gruppen/.test(kartenText), 'der Kartenhinweis beschreibt den Ablauf');

  /* =======================================================================
   * 2. Mitarbeiter nacheinander anlegen
   * ==================================================================== */
  console.log('\n== Mitarbeiter nacheinander anlegen ==');
  await page.click('.personen-karte button:has-text("+ Mitarbeiter")');
  await page.waitForSelector('.dialog');
  pruefe(/Neuer Mitarbeiter/.test(await page.textContent('.dialog .kopf')), 'der Dialog heißt „Neuer Mitarbeiter“');
  pruefe(await page.$('.dialog [data-feld="gruppen"]') === null, 'beim Anlegen gibt es keine Gruppenauswahl');
  pruefe(await page.$('.dialog .gruppen-hinweis') !== null, 'stattdessen steht dort, dass Gruppen danach zugeordnet werden');
  let knoepfe = await fussKnoepfe();
  pruefe(knoepfe.join('|') === 'Abbrechen|Anlegen & neuer Mitarbeiter|Anlegen',
    'die Knöpfe: Abbrechen, Anlegen & neuer Mitarbeiter, Anlegen', knoepfe.join('|'));
  pruefe(await page.$(DLG + ' .fuss button.weiter') !== null && await page.$(DLG + ' .fuss button.haupt') !== null,
    '„Anlegen & neuer Mitarbeiter“ ist als zweiter Hauptweg ausgezeichnet, „Anlegen“ als Hauptaktion');

  /* Ohne Namen geht nichts */
  await page.click(DLG + ' .fuss button:text-is("Anlegen")');
  await page.waitForTimeout(300);
  pruefe((await dialoge()) === 1, 'ohne Namen wird nicht angelegt - der Dialog bleibt');
  await page.click(DLG + ' .fuss button:has-text("Anlegen & neuer Mitarbeiter")');
  await page.waitForTimeout(300);
  pruefe((await dialoge()) === 1 && (await stand()).mitarbeiter.length === 0, 'auch „& neuer Mitarbeiter“ braucht einen Namen - kein leerer Mitarbeiter');

  /* Anlegen & neuer Mitarbeiter: der Dialog kommt leer wieder */
  await page.fill(DLG + ' ' + NAME, 'Anna Albers');
  await page.fill(DLG + ' ' + FUNKTION, 'Empfang');
  await page.click(DLG + ' .fuss button:has-text("Anlegen & neuer Mitarbeiter")');
  await page.waitForTimeout(500);
  pruefe((await dialoge()) === 1 && /Neuer Mitarbeiter/.test(await page.textContent('.dialog .kopf')),
    '„Anlegen & neuer Mitarbeiter“ öffnet gleich den nächsten Dialog');
  pruefe((await page.inputValue(DLG + ' ' + NAME)) === '' && (await page.inputValue(DLG + ' ' + FUNKTION)) === '',
    'der nächste Dialog ist leer');
  let s = await stand();
  pruefe(s.mitarbeiter.length === 1 && s.mitarbeiter[0].name === 'Anna Albers' && s.mitarbeiter[0].funktion === 'Empfang' && s.mitarbeiter[0].gruppen.length === 0,
    'Anna Albers ist angelegt - mit Funktion, ohne Gruppe', JSON.stringify(s.mitarbeiter));

  /* Enter im Namensfeld = Anlegen & neuer Mitarbeiter */
  await page.fill(DLG + ' ' + NAME, 'Bernd Berger');
  await page.press(DLG + ' ' + NAME, 'Enter');
  await page.waitForTimeout(500);
  pruefe((await dialoge()) === 1 && (await page.inputValue(DLG + ' ' + NAME)) === '', 'Enter im Namensfeld legt an und öffnet den nächsten');
  s = await stand();
  pruefe(s.mitarbeiter.length === 2 && s.mitarbeiter.some(m => m.name === 'Bernd Berger'), 'Bernd Berger ist angelegt');

  /* Anlegen: Dialog zu, Medien kommen mit */
  await page.fill(DLG + ' ' + NAME, 'Clara Cordes');
  await page.click(DLG + ' button:has-text("+ Medium eintragen")');
  await page.waitForTimeout(250);
  await page.fill(DLG + ' .medien-zeile .zahl-anzeige', '2');
  await page.click(DLG + ' .fuss button:text-is("Anlegen")');
  await page.waitForTimeout(500);
  pruefe((await dialoge()) === 0, '„Anlegen“ legt an und schließt den Dialog');
  s = await stand();
  const clara = s.mitarbeiter.find(m => m.name === 'Clara Cordes');
  pruefe(s.mitarbeiter.length === 3 && !!clara && clara.medien === 2, 'Clara Cordes ist angelegt - mit zwei Medien', JSON.stringify(s.mitarbeiter));

  /* Die Liste */
  const zeilen = await page.$$eval('.personen-tabelle tbody tr', n => n.map(r =>
    [].slice.call(r.querySelectorAll('td')).slice(0, 2).map(td => td.textContent.replace(/\s+/g, ' ').trim()).join('/')));
  pruefe(zeilen.join('|') === 'Anna Albers Empfang/–|Bernd Berger/–|Clara Cordes/–',
    'die Tabelle führt alle drei alphabetisch, Gruppen noch „–“', zeilen.join('|'));
  pruefe(/Mitarbeiter \(3\)/.test(await page.textContent('.mitarbeiter-abschnitt h3')), 'die Überschrift zählt 3 Mitarbeiter');
  pruefe(/3 Mitarbeiter stehen in keiner Spalte/.test(await page.textContent('.mitarbeiter-abschnitt')),
    'der Hinweis sagt, dass noch niemand in einer Spalte steht');

  /* =======================================================================
   * 3. Angelegter Mitarbeiter, solange es keine Gruppen gibt
   * ==================================================================== */
  console.log('\n== Angelegter Mitarbeiter ohne Gruppen ==');
  await page.click('.personen-tabelle tr:has-text("Anna Albers") button:has-text("Bearbeiten")');
  await page.waitForSelector('.dialog');
  pruefe(/Mitarbeiter bearbeiten/.test(await page.textContent('.dialog .kopf')), '„Bearbeiten“ öffnet den angelegten Mitarbeiter');
  pruefe(await page.$('.dialog [data-feld="gruppen"]') !== null, 'beim angelegten Mitarbeiter gibt es die Gruppenzuordnung');
  pruefe((await page.$$eval('.dialog [data-feld="gruppen"] .chip', n => n.length)) === 0 &&
         /Noch keine Gruppen angelegt/.test(await page.textContent('.dialog [data-feld="gruppen"]')),
    'solange es keine Gruppen gibt, steht dort der Hinweis statt Chips');
  pruefe(await page.$('.dialog .gruppen-hinweis') === null, 'der Anlege-Hinweis fehlt beim Bearbeiten');
  knoepfe = await fussKnoepfe();
  pruefe(knoepfe.join('|') === 'Löschen|Abbrechen|Übernehmen', 'die Knöpfe: Löschen, Abbrechen, Übernehmen - kein „& neuer“', knoepfe.join('|'));
  /* Abbrechen ändert nichts */
  await page.fill(DLG + ' ' + NAME, 'Anna Anders');
  await page.click(DLG + ' .fuss button:text-is("Abbrechen")');
  await page.waitForTimeout(300);
  s = await stand();
  pruefe((await dialoge()) === 0 && s.mitarbeiter.some(m => m.name === 'Anna Albers') && !s.mitarbeiter.some(m => m.name === 'Anna Anders'),
    '„Abbrechen“ verwirft die Änderung');

  /* =======================================================================
   * 4. Gruppen nacheinander anlegen
   * ==================================================================== */
  console.log('\n== Gruppen nacheinander anlegen ==');
  await page.click('.personen-karte button:has-text("+ Gruppe")');
  await page.waitForSelector('.dialog');
  pruefe(/Neue Gruppe/.test(await page.textContent('.dialog .kopf')), 'der Dialog heißt „Neue Gruppe“');
  pruefe(await page.$('.dialog [data-feld="mitglieder"]') === null && await page.$('.dialog .mitglieder-hinweis') !== null,
    'beim Anlegen gibt es keine Mitgliederauswahl, nur den Hinweis');
  knoepfe = await fussKnoepfe();
  pruefe(knoepfe.join('|') === 'Abbrechen|Anlegen & neue Gruppe|Anlegen', 'die Knöpfe: Abbrechen, Anlegen & neue Gruppe, Anlegen', knoepfe.join('|'));
  pruefe(await page.$eval(DLG + ' label.schalter:has-text("Spalte im Schließplan") input', e => e.checked),
    'die Spalte im Plan ist bei einer neuen Gruppe vorgewählt');

  /* Ohne Namen geht nichts */
  await page.click(DLG + ' .fuss button:has-text("Anlegen & neue Gruppe")');
  await page.waitForTimeout(300);
  pruefe((await dialoge()) === 1 && (await stand()).gruppen.length === 0, 'ohne Namen wird keine Gruppe angelegt');

  await page.fill(DLG + ' ' + GRUPPENNAME, 'Verwaltung');
  await page.click(DLG + ' .fuss button:has-text("Anlegen & neue Gruppe")');
  await page.waitForTimeout(500);
  pruefe((await dialoge()) === 1 && /Neue Gruppe/.test(await page.textContent('.dialog .kopf')) && (await page.inputValue(DLG + ' ' + GRUPPENNAME)) === '',
    '„Anlegen & neue Gruppe“ öffnet gleich den nächsten, leeren Dialog');
  s = await stand();
  pruefe(s.gruppen.length === 1 && s.gruppen[0].name === 'Verwaltung' && s.gruppen[0].spalte && s.gruppen[0].mitglieder.length === 0,
    'Verwaltung ist angelegt - mit Spalte, ohne Mitglieder', JSON.stringify(s.gruppen));

  await page.fill(DLG + ' ' + GRUPPENNAME, 'Reinigung');
  await page.press(DLG + ' ' + GRUPPENNAME, 'Enter');
  await page.waitForTimeout(500);
  pruefe((await dialoge()) === 1 && (await page.inputValue(DLG + ' ' + GRUPPENNAME)) === '', 'Enter im Namensfeld legt an und öffnet die nächste');

  /* Doppelter Name wird abgewiesen */
  await page.fill(DLG + ' ' + GRUPPENNAME, 'verwaltung');
  await page.click(DLG + ' .fuss button:text-is("Anlegen")');
  await page.waitForTimeout(300);
  pruefe((await dialoge()) === 1 && (await stand()).gruppen.length === 2, 'eine Gruppe mit vorhandenem Namen wird abgewiesen (auch anders geschrieben)');

  await page.fill(DLG + ' ' + GRUPPENNAME, 'EDV');
  await page.click(DLG + ' label.schalter:has-text("Spalte im Schließplan")');
  await page.click(DLG + ' .fuss button:text-is("Anlegen")');
  await page.waitForTimeout(500);
  pruefe((await dialoge()) === 0, '„Anlegen“ legt an und schließt den Dialog');
  s = await stand();
  const edv = s.gruppen.find(g => g.name === 'EDV');
  pruefe(s.gruppen.length === 3 && !!edv && !edv.spalte, 'EDV ist angelegt - ohne Spalte, weil abgewählt', JSON.stringify(s.gruppen));
  pruefe((await page.$$eval('th.spaltenkopf.art-gruppe', n => n.length)) === 2 && s.spalten.filter(x => /^gruppe:/.test(x)).length === 2,
    'Verwaltung und Reinigung haben je eine Spalte im Plan', s.spalten.join(' | '));
  const gruppenChips = await page.$$eval('.gruppen-liste .chip.gruppe', n => n.map(x => [].slice.call(x.children).map(c => c.textContent.trim()).join(' ')));
  pruefe(gruppenChips.join('|') === 'EDV 0 Mitglieder · ohne Spalte|Reinigung 0 Mitglieder|Verwaltung 0 Mitglieder',
    'die Gruppen stehen alphabetisch mit Mitgliederzahl, EDV ohne Spalte', gruppenChips.join('|'));
  pruefe(/Gruppen \(3\)/.test(await page.textContent('.gruppen-abschnitt h3')), 'die Überschrift zählt 3 Gruppen');

  /* =======================================================================
   * 5. Zuordnen in der Gruppe
   * ==================================================================== */
  console.log('\n== Zuordnen in der Gruppe ==');
  await page.click('.gruppen-liste .chip.gruppe:has-text("Verwaltung")');
  await page.waitForSelector('.dialog');
  pruefe(/Gruppe bearbeiten/.test(await page.textContent('.dialog .kopf')), 'ein Tippen auf die Gruppe öffnet sie');
  const mitgliedChips = await page.$$eval('.dialog [data-feld="mitglieder"] .chip', n => n.map(x => x.textContent.trim() + ':' + x.getAttribute('aria-pressed')));
  pruefe(mitgliedChips.join('|') === 'Anna Albers:false|Bernd Berger:false|Clara Cordes:false',
    'alle angelegten Mitarbeiter stehen als Mitglieder zur Wahl - noch keiner gewählt', mitgliedChips.join('|'));
  pruefe(await page.$('.dialog .chip:has-text("+ Mitarbeiter anlegen")') === null, 'in der Gruppe werden keine Mitarbeiter angelegt');
  pruefe(await page.$('.dialog .mitglieder-hinweis') === null, 'der Anlege-Hinweis fehlt beim Bearbeiten');
  knoepfe = await fussKnoepfe();
  pruefe(knoepfe.join('|') === 'Löschen|Abbrechen|Übernehmen', 'die Knöpfe: Löschen, Abbrechen, Übernehmen', knoepfe.join('|'));
  await page.click('.dialog [data-feld="mitglieder"] .chip:has-text("Anna Albers")');
  await page.click('.dialog [data-feld="mitglieder"] .chip:has-text("Bernd Berger")');
  pruefe((await page.$$eval('.dialog [data-feld="mitglieder"] .chip[aria-pressed="true"]', n => n.length)) === 2, 'zwei Mitglieder sind angetippt');
  await page.click('.dialog .fuss button:text-is("Übernehmen")');
  await page.waitForTimeout(600);
  s = await stand();
  const verw = s.gruppen.find(g => g.name === 'Verwaltung');
  pruefe(verw.mitglieder.join('|') === 'Anna Albers|Bernd Berger', 'Verwaltung hat Anna und Bernd als Mitglieder', verw.mitglieder.join('|'));
  pruefe(s.mitarbeiter.find(m => m.name === 'Anna Albers').gruppen.join() === 'Verwaltung' && s.mitarbeiter.find(m => m.name === 'Clara Cordes').gruppen.length === 0,
    'die Zuordnung steht beim Mitarbeiter - Clara bleibt ohne', JSON.stringify(s.mitarbeiter));
  pruefe(/2 Mitglieder/.test(await page.textContent('.gruppen-liste .chip.gruppe:has-text("Verwaltung")')), 'der Gruppenchip zählt 2 Mitglieder');
  const annaZeile = await zeile('Anna Albers');
  pruefe(annaZeile[1] === 'Verwaltung' && annaZeile[3] !== 'noch keine Spalte' && annaZeile[3] !== '',
    'in der Tabelle steht bei Anna die Gruppe und die Spalte, über die sie berechtigt ist', annaZeile.join(' | '));
  const kopfMedien = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const g = p.gruppen.find(x => x.name === 'Verwaltung');
    const sp = p.schliessungen.find(x => x.art === 'gruppe' && x.gruppeId === g.id);
    const th = document.querySelector('th.spaltenkopf[data-id="' + sp.id + '"] .medien');
    return { modell: window.Model.medienAnzahl(p, sp), kopf: th && th.textContent };
  });
  pruefe(kopfMedien.modell === 2 && kopfMedien.kopf === '2×', 'die Spalte zählt die Medien ihrer Mitglieder (1 + 1) - auch im Spaltenkopf', JSON.stringify(kopfMedien));

  /* =======================================================================
   * 6. Zuordnen beim Mitarbeiter
   * ==================================================================== */
  console.log('\n== Zuordnen beim Mitarbeiter ==');
  await page.click('.personen-tabelle tr:has-text("Clara Cordes") button:has-text("Bearbeiten")');
  await page.waitForSelector('.dialog');
  const gruppenWahl = await page.$$eval('.dialog [data-feld="gruppen"] .chip', n => n.map(x => x.textContent.trim() + ':' + x.getAttribute('aria-pressed')));
  pruefe(gruppenWahl.join('|') === 'EDV:false|Reinigung:false|Verwaltung:false', 'beim Mitarbeiter stehen jetzt alle Gruppen zur Wahl', gruppenWahl.join('|'));
  await page.click('.dialog [data-feld="gruppen"] .chip:has-text("EDV")');
  await page.click('.dialog [data-feld="gruppen"] .chip:has-text("Reinigung")');
  await page.click('.dialog .fuss button:text-is("Übernehmen")');
  await page.waitForTimeout(600);
  s = await stand();
  pruefe(s.mitarbeiter.find(m => m.name === 'Clara Cordes').gruppen.join('|') === 'EDV|Reinigung', 'Clara ist EDV und Reinigung zugeordnet', JSON.stringify(s.mitarbeiter));
  pruefe(s.gruppen.find(g => g.name === 'EDV').mitglieder.join() === 'Clara Cordes' && s.gruppen.find(g => g.name === 'Reinigung').mitglieder.join() === 'Clara Cordes',
    'und steht in beiden Gruppen als Mitglied', JSON.stringify(s.gruppen));
  pruefe(/1 Mitglied\b/.test(await page.textContent('.gruppen-liste .chip.gruppe:has-text("EDV")')), 'der Gruppenchip EDV zählt 1 Mitglied');
  const claraZeile = await zeile('Clara Cordes');
  pruefe(claraZeile[1] === 'EDV, Reinigung', 'die Tabelle zeigt bei Clara beide Gruppen', claraZeile.join(' | '));

  /* Abwählen beim Mitarbeiter wirkt in der Gruppe */
  await page.click('.personen-tabelle tr:has-text("Anna Albers") button:has-text("Bearbeiten")');
  await page.waitForSelector('.dialog');
  pruefe((await page.getAttribute('.dialog [data-feld="gruppen"] .chip:has-text("Verwaltung")', 'aria-pressed')) === 'true',
    'bei Anna ist Verwaltung als zugeordnet markiert');
  await page.click('.dialog [data-feld="gruppen"] .chip:has-text("Verwaltung")');
  await page.click('.dialog .fuss button:text-is("Übernehmen")');
  await page.waitForTimeout(600);
  s = await stand();
  pruefe(s.gruppen.find(g => g.name === 'Verwaltung').mitglieder.join() === 'Bernd Berger', 'nach dem Abwählen bei Anna hat Verwaltung nur noch Bernd', JSON.stringify(s.gruppen));
  pruefe((await zeile('Anna Albers'))[1] === '–', 'die Tabelle zeigt bei Anna wieder „–“');

  /* =======================================================================
   * 7. Löschen fragt nach und räumt auf
   * ==================================================================== */
  console.log('\n== Löschen ==');
  await page.click('.gruppen-liste .chip.gruppe:has-text("EDV")');
  await page.waitForSelector('.dialog');
  await page.click(DLG + ' .fuss button:text-is("Löschen")');
  await page.waitForTimeout(300);
  pruefe((await dialoge()) === 2 && /Gruppe löschen/.test(await page.textContent(DLG + ' .kopf')), 'Löschen einer Gruppe fragt nach');
  await page.click(DLG + ' .fuss button:text-is("Abbrechen")');
  await page.waitForTimeout(300);
  pruefe((await dialoge()) === 1 && (await stand()).gruppen.length === 3, '„Abbrechen“ in der Rückfrage lässt die Gruppe bestehen');
  await page.click(DLG + ' .fuss button:text-is("Löschen")');
  await page.waitForTimeout(300);
  await page.click(DLG + ' .fuss button.gefahr');
  await page.waitForTimeout(600);
  s = await stand();
  pruefe((await dialoge()) === 0 && !s.gruppen.some(g => g.name === 'EDV') && s.mitarbeiter.find(m => m.name === 'Clara Cordes').gruppen.join() === 'Reinigung',
    'die Gruppe ist weg und bei Clara entfernt - Clara bleibt', JSON.stringify(s));

  await page.click('.personen-tabelle tr:has-text("Bernd Berger") button:has-text("Bearbeiten")');
  await page.waitForSelector('.dialog');
  await page.click(DLG + ' .fuss button:text-is("Löschen")');
  await page.waitForTimeout(300);
  pruefe((await dialoge()) === 2 && /Mitarbeiter löschen/.test(await page.textContent(DLG + ' .kopf')), 'Löschen eines Mitarbeiters fragt nach');
  await page.click(DLG + ' .fuss button.gefahr');
  await page.waitForTimeout(600);
  s = await stand();
  pruefe((await dialoge()) === 0 && !s.mitarbeiter.some(m => m.name === 'Bernd Berger') && s.gruppen.find(g => g.name === 'Verwaltung').mitglieder.length === 0,
    'der Mitarbeiter ist weg, Verwaltung hat keine Mitglieder mehr', JSON.stringify(s));
  pruefe(/0 Mitglieder/.test(await page.textContent('.gruppen-liste .chip.gruppe:has-text("Verwaltung")')), 'der Gruppenchip zählt 0 Mitglieder');

  /* =======================================================================
   * 8. Träger einer Schließung: dort darf weiter angelegt werden
   * ==================================================================== */
  console.log('\n== Träger einer Schließung ==');
  await page.click('th.spaltenkopf.art-schliessung >> nth=0');
  await page.waitForSelector('.dialog');
  pruefe(await page.$('.dialog [data-feld="traeger"]') !== null, 'die Schließung fragt, wer den Schlüssel bekommt');
  const traegerVorher = await page.$$eval('.dialog [data-feld="traeger"] .chip:not(.neu)', n => n.map(x => x.textContent.trim()));
  pruefe(traegerVorher.join('|') === 'Anna Albers|Clara Cordes 2×', 'die angelegten Mitarbeiter stehen als Träger zur Wahl - mit Medienzahl', traegerVorher.join('|'));
  await page.click('.dialog [data-feld="traeger"] .chip.neu:has-text("+ Mitarbeiter anlegen")');
  await page.waitForTimeout(300);
  pruefe((await dialoge()) === 2 && /Neuer Mitarbeiter/.test(await page.textContent(DLG + ' .kopf')), 'von dort aus entsteht ein Mitarbeiter im eigenen Dialog');
  pruefe(await page.$(DLG + ' [data-feld="gruppen"]') === null, 'auch dort ohne Gruppenauswahl');
  await page.fill(DLG + ' ' + NAME, 'Dora Dietz');
  await page.click(DLG + ' .fuss button:has-text("Anlegen & neuer Mitarbeiter")');
  await page.waitForTimeout(500);
  pruefe((await dialoge()) === 2 && (await page.inputValue(DLG + ' ' + NAME)) === '', '„& neuer Mitarbeiter“ geht auch von der Schließung aus weiter');
  await page.fill(DLG + ' ' + NAME, 'Emil Ewald');
  await page.click(DLG + ' .fuss button:text-is("Anlegen")');
  await page.waitForTimeout(500);
  const traegerNachher = await page.$$eval('.dialog [data-feld="traeger"] .chip[aria-pressed="true"]', n => n.map(x => x.textContent.trim()));
  pruefe((await dialoge()) === 1 && traegerNachher.join('|') === 'Dora Dietz|Emil Ewald',
    'beide neuen Mitarbeiter sind gleich als Träger gewählt', traegerNachher.join('|'));
  await page.click('.dialog .fuss button:text-is("Übernehmen")');
  await page.waitForTimeout(600);
  s = await stand();
  pruefe(s.mitarbeiter.length === 4 && (await dialoge()) === 0, 'die Schließung ist übernommen, vier Mitarbeiter sind angelegt', JSON.stringify(s.mitarbeiter.map(m => m.name)));
  const traegerImModell = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const sp = p.schliessungen.filter(x => x.art === 'schliessung')[0];
    return (sp.traeger || []).map(id => (p.mitarbeiter.find(m => m.id === id) || {}).name).sort();
  });
  pruefe(traegerImModell.join('|') === 'Dora Dietz|Emil Ewald', 'die Träger stehen an der Schließung', traegerImModell.join('|'));

  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler', konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\nErgebnis Mitarbeiter und Gruppen: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
