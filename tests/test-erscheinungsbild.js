/* Prüft das von provision-infra.de abgenommene Erscheinungsbild:
 *   - die gemessenen Hausfarben stehen in der Gestaltung
 *   - gefüllte Hauptaktionen tragen Gold, Schrift darauf ist lesbar
 *   - helle und dunkle Darstellung sind wählbar und überleben den Neustart
 *   - jede Schrift erreicht den geforderten Kontrast (WCAG AA)
 *   - die Kundenseite trägt dasselbe Erscheinungsbild
 *   - auf dem Papier bleibt es lesbar: kein Gold als Schriftfarbe
 */
const path = require('path');
const { starte, ersteProjektOeffnen } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

/* Aus den Bildschirmaufnahmen der Website ausgelesen */
const GOLD = '#fcc91d';
const GRUND_DUNKEL = '#02092b';
const KARTE_DUNKEL = '#0a1637';

/* Kontrast nach WCAG 2.1 */
function kanal(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function leuchtdichte(rgb) {
  return 0.2126 * kanal(rgb[0]) + 0.7152 * kanal(rgb[1]) + 0.0722 * kanal(rgb[2]);
}
function kontrast(a, b) {
  const l1 = leuchtdichte(a), l2 = leuchtdichte(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function ausCss(wert) {
  const m = /rgba?\(([^)]+)\)/.exec(wert);
  if (!m) return null;
  const t = m[1].split(',').map(x => parseFloat(x));
  return [t[0], t[1], t[2], t.length > 3 ? t[3] : 1];
}
/* Halbdurchsichtiges über den Untergrund rechnen */
function ueber(vorne, hinten) {
  if (vorne[3] >= 1) return vorne;
  return [0, 1, 2].map(i => Math.round(vorne[i] * vorne[3] + hinten[i] * (1 - vorne[3])));
}

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
   * 1. Die Hausfarben der Website stehen in der Gestaltung
   * ==================================================================== */
  console.log('\n== Hausfarben ==');
  const werte = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const lies = n => s.getPropertyValue(n).trim().toLowerCase();
    return { hausfarbe: lies('--hausfarbe'), aufHausfarbe: lies('--auf-hausfarbe'),
             grund: lies('--flaeche-2'), karte: lies('--flaeche'),
             darstellung: document.documentElement.getAttribute('data-darstellung') };
  });
  pruefe(werte.darstellung === 'dunkel', 'die Anwendung startet in der dunklen Darstellung',
    String(werte.darstellung));
  pruefe(werte.hausfarbe === GOLD, 'die Hausfarbe ist das Gold der Website', werte.hausfarbe);
  pruefe(werte.grund === GRUND_DUNKEL, 'der Seitengrund entspricht der Website', werte.grund);
  pruefe(werte.karte === KARTE_DUNKEL, 'die Kartenfläche entspricht der Website', werte.karte);

  /* =======================================================================
   * 2. Gefüllte Hauptaktionen tragen Gold - und sind lesbar
   * ==================================================================== */
  console.log('\n== Hauptaktionen ==');
  async function gemessen(sel) {
    return page.evaluate((s2) => {
      const e = document.querySelector(s2);
      if (!e) return null;
      const st = getComputedStyle(e);
      return { hintergrund: st.backgroundColor, schrift: st.color,
               radius: parseFloat(st.borderRadius) };
    }, sel);
  }
  for (const [sel, name] of [['button.haupt', 'Hauptknopf'], ['.schwebe-aktion', 'schwebende Aktion']]) {
    const g = await gemessen(sel);
    const hg = ausCss(g.hintergrund), sf = ausCss(g.schrift);
    pruefe(hg[0] === 252 && hg[1] === 201 && hg[2] === 29,
      name + ' trägt die goldene Hausfarbe', g.hintergrund);
    const k = kontrast(hg, sf);
    pruefe(k >= 4.5, name + ': Schrift darauf ist lesbar (Kontrast ' + k.toFixed(1) + ':1)');
    pruefe(g.radius >= 20, name + ' ist eine Pille wie auf der Website (' + g.radius + ' px)');
  }

  /* =======================================================================
   * 3. Kontrast aller Schriftfarben - in beiden Darstellungen
   * ==================================================================== */
  console.log('\n== Lesbarkeit ==');
  for (const darstellung of ['dunkel', 'hell']) {
    await page.evaluate(d => window.App.darstellungAnwenden(d), darstellung);
    await page.waitForTimeout(250);
    const mängel = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const lies = n => s.getPropertyValue(n).trim();
      return {
        flaeche: lies('--flaeche'), flaeche2: lies('--flaeche-2'),
        text: lies('--text'), schwach: lies('--text-schwach'), zart: lies('--text-zart'),
        akzent: lies('--akzent'), gruen: lies('--gruen'), gelb: lies('--gelb'), rot: lies('--rot'),
        hausfarbe: lies('--hausfarbe'), aufHausfarbe: lies('--auf-hausfarbe')
      };
    });
    const hex = h => { const t = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(t.substr(i, 2), 16)); };
    const grund = hex(mängel.flaeche);
    [['Text', 'text', 4.5], ['abgeschwächter Text', 'schwach', 4.5],
     ['Akzent', 'akzent', 4.5], ['Grün', 'gruen', 3], ['Warnung', 'gelb', 3],
     ['Rot', 'rot', 3]].forEach(([bez, schluessel, mindest]) => {
      const k = kontrast(hex(mängel[schluessel]), grund);
      pruefe(k >= mindest, darstellung + ': ' + bez + ' auf der Karte lesbar (' +
        k.toFixed(1) + ':1, mindestens ' + mindest + ')');
    });
    const kGold = kontrast(hex(mängel.hausfarbe), hex(mängel.aufHausfarbe));
    pruefe(kGold >= 4.5, darstellung + ': Schrift auf der Hausfarbe (' + kGold.toFixed(1) + ':1)');
  }

  /* =======================================================================
   * 4. Darstellung wählbar und beständig
   * ==================================================================== */
  console.log('\n== Darstellung wählen ==');
  await page.evaluate(() => window.App.wechseln('einstellungen'));
  await page.waitForTimeout(400);
  const wahl = page.locator('.dialog select, main select').filter({
    has: page.locator('option[value="geraet"]') }).first();
  pruefe(await wahl.count() === 1, 'die Darstellung lässt sich in den Einstellungen wählen');
  await wahl.selectOption('hell');
  await page.waitForTimeout(400);
  pruefe(await page.evaluate(() => document.documentElement.getAttribute('data-darstellung')) === 'hell',
    'die Wahl greift sofort');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  await page.waitForTimeout(500);
  const nachNeustart = await page.evaluate(() => document.documentElement.getAttribute('data-darstellung'));
  pruefe(nachNeustart === 'hell', 'die Wahl überlebt den Neustart ohne Aufblitzen', nachNeustart);

  /* Auch in der hellen Darstellung bleibt die Hauptaktion golden */
  await ersteProjektOeffnen(page, 10000);
  const hellKnopf = await gemessen('button.haupt');
  const hhg = ausCss(hellKnopf.hintergrund);
  pruefe(hhg[0] === 252 && hhg[1] === 201 && hhg[2] === 29,
    'auch hell trägt die Hauptaktion die Hausfarbe', hellKnopf.hintergrund);

  /* Zurück auf dunkel für die weiteren Prüfungen */
  await page.evaluate(() => window.App.darstellungAnwenden('dunkel'));
  await page.waitForTimeout(250);

  /* =======================================================================
   * 5. Der Zurück-Knopf ist kein Leerzustand
   * ==================================================================== */
  console.log('\n== Kopfzeile ==');
  const kopf = await page.evaluate(() => {
    const z = document.querySelector('.zurueck-knopf');
    const k = document.querySelector('header.kopf');
    const st = getComputedStyle(z);
    return { hoehe: Math.round(z.getBoundingClientRect().height),
             kopfHoehe: Math.round(k.getBoundingClientRect().height),
             randStil: st.borderStyle, klassen: z.className };
  });
  pruefe(kopf.hoehe <= 60 && kopf.randStil === 'solid',
    'der Zurück-Knopf ist ein Knopf und kein gestrichelter Kasten (' +
    kopf.hoehe + ' px, ' + kopf.randStil + ')');
  pruefe(!/\bleer\b/.test(kopf.klassen),
    'er trägt nicht die Klasse des Leerzustands', kopf.klassen);
  pruefe(kopf.kopfHoehe <= 90, 'die Kopfzeile bleibt flach (' + kopf.kopfHoehe + ' px)');

  /* =======================================================================
   * 6. Die Kundenseite trägt dasselbe Erscheinungsbild
   * ==================================================================== */
  console.log('\n== Kundenfreigabe ==');
  const link = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const d = window.Freigabe.erstellen(p, {
      freigegebeneSchliessungen: p.schliessungen.slice(0, 2).map(s => s.id),
      firma: 'Provision Infra GmbH' });
    return window.Freigabe.alsAnker(d);
  });
  const kundenSeite = 'file://' + path.join(__dirname, '..', 'src', 'freigabe.html') + '#plan=' + link;
  const seite2 = await ctx.newPage();
  await seite2.goto(kundenSeite, { waitUntil: 'load' });
  await seite2.waitForSelector('table.matrix', { timeout: 10000 });
  const kunde = await seite2.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const knopf = document.querySelector('button.haupt');
    return { hausfarbe: s.getPropertyValue('--hausfarbe').trim().toLowerCase(),
             darstellung: document.documentElement.getAttribute('data-darstellung'),
             knopfGrund: knopf ? getComputedStyle(knopf).backgroundColor : null };
  });
  pruefe(kunde.hausfarbe === GOLD, 'die Kundenseite kennt die Hausfarbe', kunde.hausfarbe);
  pruefe(kunde.darstellung === 'hell' || kunde.darstellung === 'dunkel',
    'sie folgt dem Gerät des Kunden', String(kunde.darstellung));
  pruefe(/252, 201, 29/.test(kunde.knopfGrund || ''),
    'ihr Hauptknopf trägt die Hausfarbe', String(kunde.knopfGrund));
  await seite2.close();

  /* =======================================================================
   * 7. Auf dem Papier bleibt es lesbar
   * ==================================================================== */
  console.log('\n== Farben auf dem Papier ==');
  const papier = await page.evaluate(() => window.Reports._intern.FARBE);
  const hex2 = h => { const t = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(t.substr(i, 2), 16)); };
  const weiss = [255, 255, 255];
  [['Text', 'text', 4.5], ['Akzent', 'akzent', 4.5], ['Grau', 'grau', 4.5],
   ['Warnung', 'warn', 4.5]].forEach(([bez, schluessel, mindest]) => {
    const k = kontrast(hex2(papier[schluessel]), weiss);
    pruefe(k >= mindest, bez + ' ist auf Weiß lesbar (' + k.toFixed(1) + ':1)');
  });
  const kGoldPapier = kontrast(hex2(papier.hausfarbe), weiss);
  pruefe(kGoldPapier < 4.5,
    'Gold ist als Schriftfarbe auf Papier ungeeignet (' + kGoldPapier.toFixed(1) +
    ':1) – es wird nur als Streifen verwendet');
  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler',
    konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\nErgebnis Erscheinungsbild: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
