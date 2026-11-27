/* Sichtprüfung 1.5.2 als Prüfreihe: Was auf Telefon, Tablet und Rechner
 * aufgefallen war, darf nicht zurückkommen.
 *  - schwebender Knopf nur, wenn der gleichnamige Knopf im Kopf aus dem Bild ist
 *  - Dialogfuß mit zwei Knöpfen in einer Reihe (Telefon), kleine Dialoge als Blatt
 *  - Tabellen unter dem Plan und „Spalten verwalten“ ohne abgeschnittene Knöpfe
 *  - Europlan auf dem Telefon mit sichtbaren Schlüsselspalten
 *  - Meldungen begrenzt (Länge, Anzahl), Hover nur bei echter Maus
 *  - Browserleistenfarbe folgt der Darstellung
 *  - Kundenseite: Escape schließt, Fußleiste kompakt */
const fs = require('fs'), path = require('path');
const { starte, ersteProjektOeffnen } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');
const FREIGABE = 'file://' + path.join(__dirname, '..', 'src', 'freigabe.html');
let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? ' -> ' + i : '')); } }

async function laden(browser, geraet, theme) {
  const ctx = await browser.newContext({ viewport: geraet.viewport, deviceScaleFactor: 1, isMobile: geraet.mobil, hasTouch: geraet.mobil, colorScheme: theme === 'hell' ? 'light' : 'dark' });
  const page = await ctx.newPage();
  const fehlerListe = [];
  page.on('pageerror', e => fehlerListe.push(e.message));
  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  const projekt = baueTestprojekt();
  await page.evaluate(async ([p, e]) => { await window.Store.projektSpeichern(p); await window.Store.einstellungenSpeichern(e); },
    [projekt, Object.assign({}, einstellungen, { letztesProjekt: projekt.id, erscheinungsbild: theme })]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  return { ctx, page, fehlerListe };
}

(async () => {
  const browser = await starte();
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'css', 'app.css'), 'utf8');

  console.log('\n== Gestaltung (statisch) ==');
  const hoverOhneAbfrage = css.split('\n').filter(z => z.includes(':hover') && !z.includes('@media (hover: hover)') && !/^\s*(\/\*|\*)/.test(z));
  pruefe(hoverOhneAbfrage.length === 0, 'jede Hover-Regel steht unter @media (hover: hover) - kein klebendes Hover auf Touch-Geräten', hoverOhneAbfrage.slice(0, 2).join(' | '));
  pruefe(/\.schwebe-aktion\.verborgen/.test(css), 'der schwebende Knopf kennt einen verborgenen Zustand');
  pruefe(/\.werkzeugleiste/.test(css) && /\.spalten-tabelle/.test(css) && /\.personen-tabelle th:nth-child\(5\)/.test(css), 'Werkzeugleiste und Tabellen haben Telefon-Regeln');

  console.log('\n== Telefon (390 px), dunkel ==');
  const phone = { viewport: { width: 390, height: 844 }, mobil: true };
  let { ctx, page, fehlerListe } = await laden(browser, phone, 'dunkel');
  pruefe((await page.$eval('meta[name="theme-color"]', m => m.content)) === '#0a1637', 'Browserleiste dunkel wie der Kopf');
  await ersteProjektOeffnen(page, 8000);
  await page.evaluate(() => window.App.wechseln('tueren'));
  await page.waitForSelector('.tuer-zeile'); await page.waitForTimeout(350);
  const fabOben = await page.$eval('.schwebe-aktion', b => ({ opacity: getComputedStyle(b).opacity, verborgen: b.classList.contains('verborgen') }));
  pruefe(fabOben.verborgen && fabOben.opacity === '0', 'oben in der Liste ist der schwebende Knopf verborgen (der Kopf hat „+ Neue Tür“)', JSON.stringify(fabOben));
  await page.evaluate(() => { document.querySelector('main.inhalt').scrollTop = 700; });
  await page.waitForTimeout(400);
  const fabUnten = await page.$eval('.schwebe-aktion', b => ({ opacity: getComputedStyle(b).opacity, verborgen: b.classList.contains('verborgen') }));
  pruefe(!fabUnten.verborgen && fabUnten.opacity === '1', 'nach dem Scrollen erscheint er', JSON.stringify(fabUnten));
  const aktiverReiter = await page.$eval('nav.reiter', n => { const a = n.querySelector('button[aria-selected="true"]'); const r = a.getBoundingClientRect(); const nr = n.getBoundingClientRect(); return r.left >= nr.left - 1 && r.right <= nr.right + 1; });
  pruefe(aktiverReiter, 'der gewählte Reiter steht im Bild der Reiterleiste');

  /* Dialogfuß mit zwei Knöpfen */
  await page.click('.tuer-zeile:has-text("Büro Empfang")');
  await page.waitForSelector('.dialog'); await page.waitForTimeout(300);
  const fuss = await page.$$eval('.dialog > .fuss button', bs => bs.filter(b => b.offsetParent !== null).map(b => ({ t: b.textContent.trim(), top: Math.round(b.getBoundingClientRect().top), right: Math.round(b.getBoundingClientRect().right), w: Math.round(b.getBoundingClientRect().width) })));
  pruefe(fuss.length === 2 && fuss[0].top === fuss[1].top, 'Abbrechen und Übernehmen stehen in einer Reihe', JSON.stringify(fuss));
  pruefe(fuss.every(b => b.right <= 390), 'kein Knopf ragt aus dem Bild', JSON.stringify(fuss));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  /* Plan: Werkzeugleiste als Raster, Tabelle unten ohne Abschnitt */
  await page.evaluate(() => window.App.wechseln('plan'));
  await page.waitForSelector('table.matrix'); await page.waitForTimeout(300);
  const leiste = await page.$eval('main .werkzeugleiste', l => ({ display: getComputedStyle(l).display, breiten: [...l.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().width)) }));
  pruefe(leiste.display === 'grid' && leiste.breiten.every(w => w > 150 && w < 190), 'die Werkzeugleiste ist ein zweispaltiges Raster', JSON.stringify(leiste));
  const maTab = await page.$eval('.personen-tabelle', t => ({ breit: t.scrollWidth <= t.parentElement.clientWidth + 1, spalten: [...t.querySelectorAll('thead th')].filter(h => h.offsetParent !== null).map(h => h.textContent.trim()) }));
  pruefe(maTab.breit, 'die Mitarbeitertabelle passt in die Breite', JSON.stringify(maTab));
  pruefe(maTab.spalten.join('|') === 'Name|Medien', 'sie zeigt Name und Medien, die Zeile öffnet den Eintrag', maTab.spalten.join('|'));
  await page.click('main button:has-text("Verwalten")');
  await page.waitForSelector('.dialog .spalten-tabelle'); await page.waitForTimeout(300);
  const pfeile = await page.$$eval('.dialog .spalten-tabelle tbody tr:first-child .reihenfolge button', bs => bs.map(b => Math.round(b.getBoundingClientRect().right)));
  pruefe(pfeile.length === 2 && pfeile.every(r => r <= 390), 'in „Spalten verwalten“ sind beide Pfeile im Bild', JSON.stringify(pfeile));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  /* Europlan: Schlüsselspalten sichtbar, kleiner Dialog als Blatt */
  await page.click('button:has-text("Europlan")'); await page.waitForTimeout(400);
  const euro = await page.evaluate(() => {
    const r = document.querySelector('.matrix-rahmen').getBoundingClientRect();
    const zeile = [...document.querySelectorAll('table.matrix.europlan tbody tr')].find(x => x.querySelector('td.zelle'));
    const zellen = zeile ? zeile.querySelectorAll('td.zelle') : [];
    let sichtbar = 0; zellen.forEach(z => { const b = z.getBoundingClientRect(); if (b.left >= r.left && b.right <= r.right + 1) sichtbar++; });
    const zp = document.querySelector('table.matrix.europlan td.links.zp');
    return { sichtbar, zpWeg: !zp || zp.offsetParent === null };
  });
  pruefe(euro.sichtbar >= 2 && euro.zpWeg, 'im Europlan sind auf dem Telefon mindestens zwei Schlüsselspalten im Bild (ZP ausgeblendet)', JSON.stringify(euro));
  const zellen = await page.$$('table.matrix.europlan tbody tr:not(.gruppe) td.zelle');
  await zellen[4].click(); await page.waitForSelector('.dialog.klein'); await page.waitForTimeout(300);
  const blatt = await page.$eval('.dialog.klein', d => { const r = d.getBoundingClientRect(); return { unten: Math.round(r.bottom), hoehe: Math.round(r.height) }; });
  pruefe(blatt.unten >= 840 && blatt.hoehe < 700, 'der Auswahldialog liegt als Blatt am unteren Rand', JSON.stringify(blatt));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  pruefe(await page.$('.dialog') === null, 'Escape schließt ihn');
  await page.click('button:has-text("Kreuzschließplan")'); await page.waitForTimeout(200);
  const fabEuro = await page.evaluate(() => document.querySelector('.schwebe-aktion').textContent.trim());
  pruefe(fabEuro === '+ Spalte', 'zurück im Kreuzplan heißt die Hauptaktion wieder „+ Spalte“', fabEuro);

  /* Meldungen */
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.AppKern.toast('Meldung ' + i); window.AppKern.toast('x'.repeat(400), 'fehler'); });
  await page.waitForTimeout(200);
  const toasts = await page.$$eval('#toast-bereich .toast', ts => ts.map(t => t.textContent.length));
  pruefe(toasts.length <= 3, 'höchstens drei Meldungen auf einmal', String(toasts.length));
  pruefe(Math.max.apply(null, toasts) <= 222, 'eine Meldung ist höchstens rund 220 Zeichen lang', String(Math.max.apply(null, toasts)));
  pruefe(fehlerListe.length === 0, 'keine Seitenfehler', fehlerListe.join(' | '));
  await ctx.close();

  console.log('\n== Rechner (1440 px), hell ==');
  ({ ctx, page, fehlerListe } = await laden(browser, { viewport: { width: 1440, height: 900 }, mobil: false }, 'hell'));
  pruefe((await page.$eval('meta[name="theme-color"]', m => m.content)) === '#ffffff', 'Browserleiste hell wie der Kopf');
  await page.evaluate(() => window.App.darstellungAnwenden('dunkel'));
  pruefe((await page.$eval('meta[name="theme-color"]', m => m.content)) === '#0a1637', 'und sie folgt dem Umschalten');
  await page.evaluate(() => window.App.darstellungAnwenden('hell'));
  await ersteProjektOeffnen(page, 8000);
  await page.evaluate(() => window.App.wechseln('export')); await page.waitForTimeout(300);
  const knoepfe = await page.$$eval('.raster.zwei > .karte > button.haupt', bs => bs.slice(0, 4).map(b => Math.round(b.getBoundingClientRect().bottom)));
  pruefe(knoepfe.length === 4 && Math.max.apply(null, knoepfe) - Math.min.apply(null, knoepfe) <= 2, 'die Export-Knöpfe stehen auf einer Linie', JSON.stringify(knoepfe));
  await page.evaluate(() => window.App.wechseln('tueren')); await page.waitForSelector('.tuer-zeile'); await page.waitForTimeout(300);
  pruefe(await page.$eval('.schwebe-aktion', b => b.classList.contains('verborgen')), 'auch auf dem Rechner doppelt der schwebende Knopf nicht den Kopf');
  pruefe(fehlerListe.length === 0, 'keine Seitenfehler', fehlerListe.join(' | '));

  /* Kundenseite */
  console.log('\n== Kundenseite (Telefon) ==');
  await page.evaluate(() => window.App.wechseln('plan')); await page.waitForSelector('table.matrix');
  await page.click('main button:has-text("Kundenfreigabe")'); await page.waitForSelector('.dialog');
  const chips = await page.$$('.dialog .chip'); await chips[2].click(); await chips[5].click();
  await page.click('.dialog button:has-text("Freigabe-Link erzeugen")'); await page.waitForSelector('.dialog .schluessel-feld');
  const link = await page.inputValue('.dialog .schluessel-feld');
  await ctx.close();
  const kctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const kunde = await kctx.newPage();
  const kundeFehler = []; kunde.on('pageerror', e => kundeFehler.push(e.message));
  await kunde.goto(FREIGABE + link.slice(link.indexOf('#')), { waitUntil: 'load' });
  await kunde.waitForSelector('table.matrix'); await kunde.waitForTimeout(300);
  const fussK = await kunde.$eval('.fr-fuss', f => { const r = f.getBoundingClientRect(); const bs = [...f.querySelectorAll('button')].map(b => ({ top: Math.round(b.getBoundingClientRect().top), right: Math.round(b.getBoundingClientRect().right), sw: b.scrollWidth, cw: b.clientWidth })); return { hoehe: Math.round(r.height), bs }; });
  pruefe(fussK.hoehe <= 150 && fussK.bs.length === 2 && Math.abs(fussK.bs[0].top - fussK.bs[1].top) < 20, 'die Fußleiste ist kompakt, beide Knöpfe in einer Reihe', JSON.stringify(fussK));
  pruefe(fussK.bs.every(b => b.right <= 390 && b.sw <= b.cw + 1), 'kein Knopftext läuft über', JSON.stringify(fussK.bs));
  await kunde.click('button:has-text("Rückmeldung erzeugen")'); await kunde.waitForSelector('.dialog'); await kunde.waitForTimeout(200);
  await kunde.keyboard.press('Escape'); await kunde.waitForTimeout(200);
  pruefe(await kunde.$('.dialog') === null, 'Escape schließt den Dialog der Kundenseite');
  const kundeFarbe = await kunde.evaluate(() => ({ meta: document.querySelector('meta[name="theme-color"]').content, darstellung: document.documentElement.getAttribute('data-darstellung') }));
  pruefe(kundeFarbe.meta === (kundeFarbe.darstellung === 'hell' ? '#ffffff' : '#0a1637'), 'auch die Kundenseite färbt die Browserleiste passend zur Darstellung', JSON.stringify(kundeFarbe));
  pruefe(kundeFehler.length === 0, 'keine Seitenfehler auf der Kundenseite', kundeFehler.join(' | '));
  await kctx.close();

  /* --- Tastatur, Dialoge, Druck (Rechner) ---------------------------------- */
  console.log('\n== Tastatur und Dialoge (Rechner) ==');
  ({ ctx, page, fehlerListe } = await laden(browser, { viewport: { width: 1440, height: 900 }, mobil: false }, 'dunkel'));
  await ersteProjektOeffnen(page, 8000);
  await page.evaluate(() => window.App.wechseln('tueren')); await page.waitForSelector('.tuer-zeile'); await page.waitForTimeout(300);
  const zeileAttr = await page.$eval('.tuer-zeile', z => ({ tabindex: z.getAttribute('tabindex'), role: z.getAttribute('role') }));
  pruefe(zeileAttr.tabindex === '0' && zeileAttr.role === 'button', 'eine Türzeile ist per Tab erreichbar und als Knopf ausgezeichnet', JSON.stringify(zeileAttr));
  await page.focus('.tuer-zeile'); await page.keyboard.press('Enter'); await page.waitForSelector('.dialog'); await page.waitForTimeout(350);
  const dlg = await page.evaluate(() => {
    const d = document.querySelector('.dialog');
    return { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), titel: !!d.getAttribute('aria-labelledby') && !!document.getElementById(d.getAttribute('aria-labelledby')),
      inert: document.getElementById('app').inert === true, fokusImDialog: d.contains(document.activeElement) };
  });
  pruefe(dlg.role === 'dialog' && dlg.modal === 'true' && dlg.titel, 'Enter öffnet das Türformular als Dialog mit Rolle und Titel', JSON.stringify(dlg));
  pruefe(dlg.inert && dlg.fokusImDialog, 'der Hintergrund ist gesperrt und der Fokus liegt im Dialog', JSON.stringify(dlg));
  /* Tab bleibt im Dialog: 60 Schritte, nie außerhalb */
  let draussen = 0;
  for (let i = 0; i < 60; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => document.querySelector('.dialog').contains(document.activeElement)))) draussen++; }
  pruefe(draussen === 0, 'Tab läuft 60 Schritte lang nur durch den Dialog', String(draussen));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const nachher = await page.evaluate(() => ({ dialog: !!document.querySelector('.dialog'), inert: document.getElementById('app').inert === true, aktiv: (document.activeElement.className || '').split(' ')[0] }));
  pruefe(!nachher.dialog && !nachher.inert && nachher.aktiv === 'tuer-zeile', 'Escape schließt, der Hintergrund ist frei, der Fokus ist zurück auf der Türzeile', JSON.stringify(nachher));
  /* Reiter: Pfeiltasten wandern, kein Wechsel ohne Enter */
  await page.focus('nav.reiter button[aria-selected="true"]');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
  const reiter = await page.evaluate(() => ({ fokus: document.activeElement.textContent.trim().replace(/\d+$/, ''), ansicht: window.AppKern.Zustand.ansicht, controls: document.activeElement.getAttribute('aria-controls'), panel: document.getElementById('inhalt') && document.getElementById('inhalt').getAttribute('role') }));
  pruefe(reiter.fokus === 'Schließplan' && reiter.ansicht === 'tueren' && reiter.controls === 'inhalt' && reiter.panel === 'tabpanel', 'Pfeil rechts bewegt den Fokus auf den nächsten Reiter, gewechselt wird erst mit Enter', JSON.stringify(reiter));
  await page.keyboard.press('Enter'); await page.waitForSelector('table.matrix'); await page.waitForTimeout(300);
  /* Matrix: Zelle fokussieren, Pfeil, Enter schaltet */
  const zelle = await page.$('table.matrix td.zelle');
  await zelle.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80);
  const nachPfeil = await page.evaluate(() => { const z = document.activeElement; const zeile = z.parentNode; return { istZelle: z.classList.contains('zelle'), index: Array.prototype.indexOf.call(zeile.querySelectorAll('td.zelle'), z) }; });
  pruefe(nachPfeil.istZelle && nachPfeil.index === 1, 'in der Matrix springt Pfeil rechts zur nächsten Zelle', JSON.stringify(nachPfeil));
  const vorher = await page.evaluate(() => document.activeElement.textContent);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  const danach = await page.evaluate(() => document.activeElement.textContent);
  pruefe(vorher !== danach, 'Enter schaltet die Berechtigung der fokussierten Zelle', vorher + ' -> ' + danach);
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);   /* zurück auf den Ausgangswert (nein, ja, zeit) */
  /* Scrollschatten rechts, wenn die Matrix breiter als der Rahmen ist */
  await page.evaluate(() => { const p = window.AppKern.Zustand.projekt; for (let i = 0; i < 30; i++) { p.schliessungen.push(window.Model.neueSchliessung({ kuerzel: 'Z' + i, bezeichnung: 'Zusatz ' + i })); } window.App.zeichnen(); });
  await page.waitForSelector('table.matrix'); await page.waitForTimeout(300);
  const schatten = await page.evaluate(() => { const h = document.querySelector('.matrix-huelle'); return { rechts: h.classList.contains('kann-rechts'), links: h.classList.contains('kann-links') }; });
  pruefe(schatten.rechts && !schatten.links, 'bei breiter Matrix zeigt ein Schatten rechts an, dass es weitergeht', JSON.stringify(schatten));
  await page.evaluate(() => { const r = document.querySelector('.matrix-rahmen'); r.scrollLeft = 400; });
  await page.waitForTimeout(150);
  pruefe(await page.evaluate(() => document.querySelector('.matrix-huelle').classList.contains('kann-links')), 'nach dem Scrollen auch links');
  /* Druck: helle Palette, Rahmen ausgeklappt, schwebender Knopf weg */
  await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(100);
  const druck = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { text: cs.getPropertyValue('--text').trim(), flaeche: cs.getPropertyValue('--flaeche').trim(), rahmenMax: getComputedStyle(document.querySelector('.matrix-rahmen')).maxHeight, fab: getComputedStyle(document.querySelector('.schwebe-aktion')).display, body: getComputedStyle(document.body).backgroundColor }; });
  pruefe(druck.text === '#0a1637' && druck.flaeche === '#ffffff' && druck.body === 'rgb(255, 255, 255)', 'im Druck gilt die helle Palette, auch in der dunklen Darstellung', JSON.stringify(druck));
  pruefe(druck.rahmenMax === 'none' && druck.fab === 'none', 'der Matrixrahmen ist ausgeklappt und der schwebende Knopf fehlt', JSON.stringify(druck));
  await page.emulateMedia({ media: 'screen' });
  /* Passwortfeld und color-scheme */
  const technik = await page.evaluate(() => { const i = document.createElement('input'); i.type = 'password'; document.body.appendChild(i); const fs = getComputedStyle(i).fontSize; i.remove(); return { passwort: fs, schema: getComputedStyle(document.documentElement).colorScheme, meta: !!document.querySelector('meta[name="color-scheme"]') }; });
  pruefe(technik.passwort === '16px', 'auch ein Passwortfeld hat 16 px (iOS zoomt nicht)', technik.passwort);
  pruefe(technik.schema === 'dark' && technik.meta, 'color-scheme folgt der Darstellung', JSON.stringify(technik));
  pruefe(fehlerListe.length === 0, 'keine Seitenfehler', fehlerListe.join(' | '));
  await ctx.close();

  /* Kundenseite: Zellen per Tastatur, Druck ohne Fußleiste */
  console.log('\n== Kundenseite: Tastatur und Druck ==');
  const kctx2 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const kunde2 = await kctx2.newPage();
  await kunde2.goto(FREIGABE + link.slice(link.indexOf('#')), { waitUntil: 'load' });
  await kunde2.waitForSelector('table.matrix'); await kunde2.waitForTimeout(300);
  const frei = await kunde2.$('td.zelle.frei');
  await frei.focus(); await kunde2.keyboard.press('Enter'); await kunde2.waitForTimeout(100);
  pruefe(await kunde2.evaluate(() => document.activeElement.classList.contains('geaendert')), 'Enter setzt eine freigegebene Zelle');
  await kunde2.keyboard.press('ArrowDown'); await kunde2.waitForTimeout(80);
  pruefe(await kunde2.evaluate(() => document.activeElement.classList.contains('frei')), 'Pfeil nach unten springt zur nächsten freigegebenen Zelle');
  await kunde2.emulateMedia({ media: 'print' }); await kunde2.waitForTimeout(100);
  const kdruck = await kunde2.evaluate(() => ({ fuss: getComputedStyle(document.querySelector('.fr-fuss')).display, rahmen: getComputedStyle(document.querySelector('.matrix-rahmen')).maxHeight, text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim() }));
  pruefe(kdruck.fuss === 'none' && kdruck.rahmen === 'none' && kdruck.text === '#0a1637', 'im Druck fehlt die Fußleiste, die Matrix ist ausgeklappt, die Palette ist hell', JSON.stringify(kdruck));
  await kctx2.close();

  await browser.close();
  console.log('\nErgebnis Darstellung: ' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch', e); process.exit(1); });
