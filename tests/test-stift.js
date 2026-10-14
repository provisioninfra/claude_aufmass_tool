/* Weist nach, dass sich das Werkzeug vollständig mit dem Apple Pencil
 * bedienen lässt:
 *   - kein Zahlenfeld (<input type="number">), denn dort schreibt Apples
 *     "Kritzeln" nicht hinein
 *   - feste Maße stehen als Auswahl bereit, Stückzahlen über - und +
 *   - abweichende Maße bleiben über ein beschreibbares Textfeld möglich
 *   - eine laufende Eingabe wird nicht durch einen Neuaufbau zerstört
 */
const path = require('path');
const { starte, ersteProjektOeffnen } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

/* Angaben mit festem Raster - sie dürfen nicht mehr frei getippt werden */
const MIT_RASTER = ['masseAussen', 'masseInnen', 'tuerblattstaerke', 'dornmass',
  'entfernung', 'vierkant', 'schlossStulpbreite', 'schlossStulplaenge',
  'schlossRiegelausschluss', 'schlossVerriegelungspunkte', 'tuerbreite',
  'tuerhoehe', 'profilbreite', 'bestandLaengeAussen', 'bestandLaengeInnen'];
/* Stückzahlen - über einen Zähler zu stellen */
const MIT_ZAEHLER = ['anzahl', 'bestandAnzahlSchluessel'];

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
   * 1. Kein Zahlenfeld - nirgends
   * ==================================================================== */
  console.log('\n== Kritzeln kann überall schreiben ==');
  async function zahlenfelderSuchen(wo) {
    return page.evaluate(() => {
      const treffer = [];
      document.querySelectorAll('input[type=number]').forEach(e => {
        treffer.push(e.getAttribute('data-feld') ||
          (e.closest('[data-feld]') || {}).dataset?.feld || e.placeholder || '(ohne Namen)');
      });
      return treffer;
    });
  }

  const ansichten = ['stammdaten', 'struktur', 'tueren', 'plan', 'export', 'einstellungen'];
  const gefunden = [];
  for (const a of ansichten) {
    await page.evaluate(v => window.App.wechseln(v), a);
    await page.waitForTimeout(350);
    (await zahlenfelderSuchen()).forEach(x => gefunden.push(a + ': ' + x));
  }
  pruefe(gefunden.length === 0, 'in keiner Ansicht steht ein Zahlenfeld', gefunden.join(', '));

  /* Auch in den Dialogen nicht */
  await page.evaluate(() => window.App.wechseln('tueren'));
  await page.waitForSelector('.tuer-zeile');
  await page.click('.tuer-zeile >> nth=0');
  await page.waitForSelector('.dialog');
  await page.click('.dialog .modus-leiste button:has-text("Alle Felder")');
  await page.waitForTimeout(400);
  /* Die freiwilligen Abschnitte aufklappen, damit wirklich alles geprüft wird */
  await page.evaluate(() => {
    document.querySelectorAll('.dialog details').forEach(d => { d.open = true; });
  });
  await page.waitForTimeout(300);
  const imFormular = await zahlenfelderSuchen();
  pruefe(imFormular.length === 0, 'im Türformular steht kein Zahlenfeld', imFormular.join(', '));

  /* =======================================================================
   * 2. Feste Maße als Auswahl, Stückzahlen als Zähler
   * ==================================================================== */
  console.log('\n== Feste Größen werden ausgewählt, nicht getippt ==');
  const befund = await page.evaluate(([raster, zaehler]) => {
    const d = document.querySelector('.dialog');
    const aus = { fehltRaster: [], fehltZaehler: [], freieTextfelder: [] };
    raster.forEach(k => {
      const f = d.querySelector('[data-feld="' + k + '"]');
      if (!f) return;                       /* Abschnitt nicht aktiv */
      if (!f.querySelector('select')) aus.fehltRaster.push(k);
    });
    zaehler.forEach(k => {
      const f = d.querySelector('[data-feld="' + k + '"]');
      if (!f) return;
      if (!f.querySelector('.zahl-knopf')) aus.fehltZaehler.push(k);
    });
    /* Welche Felder verlangen überhaupt noch freie Eingabe? */
    d.querySelectorAll('[data-feld]').forEach(f => {
      const k = f.getAttribute('data-feld');
      const eing = f.querySelector('input[type=text], textarea');
      if (!eing || eing.classList.contains('versteckt')) return;
      if (f.querySelector('select') || f.querySelector('.zahl-knopf')) return;
      aus.freieTextfelder.push(k);
    });
    return aus;
  }, [MIT_RASTER, MIT_ZAEHLER]);

  pruefe(befund.fehltRaster.length === 0,
    'jede Angabe mit festem Raster bietet eine Auswahl', befund.fehltRaster.join(', '));
  pruefe(befund.fehltZaehler.length === 0,
    'jede Stückzahl lässt sich über – und + stellen', befund.fehltZaehler.join(', '));

  /* Was bleibt, muss wirklich frei sein - sonst fehlt ein Raster */
  const erlaubtFrei = ['nummer', 'bezeichnung', 'etage', 'systemNotiz', 'stulpmass',
    'bohrbild', 'bestandFabrikat', 'bestandLaenge', 'elLeitungsweg',
    'masseBemerkung', 'bestandBemerkung', 'elBemerkung', 'notiz', 'nacharbeitText'];
  const unerwartet = befund.freieTextfelder.filter(k => !erlaubtFrei.includes(k));
  pruefe(unerwartet.length === 0,
    'frei einzutragen ist nur, was auch wirklich frei ist (' +
    befund.freieTextfelder.length + ' Felder)', unerwartet.join(', '));

  /* =======================================================================
   * 3. Abweichende Maße bleiben möglich
   * ==================================================================== */
  console.log('\n== Abweichende Maße ==');
  const massWahl = page.locator('.dialog [data-feld="masseAussen"] select');
  const optionen = await massWahl.locator('option').allTextContents();
  pruefe(optionen.some(o => /^27,5/.test(o)) && optionen.some(o => /^100/.test(o)),
    'das Längenraster deckt 27,5 bis 120 mm ab', optionen.length + ' Einträge');
  pruefe(optionen.some(o => /anderes Maß/.test(o)), 'ein abweichendes Maß bleibt wählbar');

  await massWahl.selectOption({ label: 'anderes Maß …' });
  await page.waitForTimeout(250);
  const freiSichtbar = await page.evaluate(() => {
    const e = document.querySelector('.dialog [data-feld="masseAussen"] input');
    return { sichtbar: !e.classList.contains('versteckt'), typ: e.type,
             modus: e.getAttribute('inputmode'), fokus: document.activeElement === e };
  });
  pruefe(freiSichtbar.sichtbar && freiSichtbar.typ === 'text',
    'das Feld für abweichende Maße ist beschreibbar (Textfeld)', JSON.stringify(freiSichtbar));
  pruefe(freiSichtbar.modus === 'decimal',
    'es zeigt die Zifferntastatur, falls doch getippt wird', String(freiSichtbar.modus));

  /* Ein Komma muss durchgehen, Buchstaben nicht */
  await page.fill('.dialog [data-feld="masseAussen"] input', '');
  await page.type('.dialog [data-feld="masseAussen"] input', '27,5');
  await page.waitForTimeout(200);
  const mitKomma = await page.inputValue('.dialog [data-feld="masseAussen"] input');
  pruefe(mitKomma === '27,5', 'ein Komma wird angenommen (27,5)', mitKomma);
  await page.type('.dialog [data-feld="masseAussen"] input', 'abc');
  await page.waitForTimeout(200);
  const ohneBuchstaben = await page.inputValue('.dialog [data-feld="masseAussen"] input');
  pruefe(ohneBuchstaben === '27,5', 'Buchstaben landen nicht in einem Maß', ohneBuchstaben);

  /* Die Eingabe darf nicht durch einen Neuaufbau zerrissen werden */
  const stabil = await page.evaluate(() => {
    const e = document.querySelector('.dialog [data-feld="masseAussen"] input');
    e.focus();
    const vorher = e;
    e.value = '42';
    e.dispatchEvent(new Event('input', { bubbles: true }));
    const nachher = document.querySelector('.dialog [data-feld="masseAussen"] input');
    return { selbesFeld: vorher === nachher, fokusGeblieben: document.activeElement === nachher,
             wert: nachher.value };
  });
  pruefe(stabil.selbesFeld && stabil.fokusGeblieben,
    'während des Schreibens wird das Feld nicht neu aufgebaut', JSON.stringify(stabil));

  /* Und der Wert kommt im Projekt an */
  await page.click('.dialog .fuss button:has-text("Änderungen übernehmen")');
  await page.waitForTimeout(600);
  const gespeichert = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const t = p.tueren.slice().sort((a, b) =>
      String(a.nummer).localeCompare(String(b.nummer)))[0];
    return t.masseAussen;
  });
  pruefe(String(gespeichert) === '42', 'ein abweichendes Maß wird gespeichert', String(gespeichert));

  /* =======================================================================
   * 4. Zähler
   * ==================================================================== */
  console.log('\n== Stückzahlen ohne Tastatur ==');
  await page.click('.tuer-zeile >> nth=0');
  await page.waitForSelector('.dialog');
  await page.waitForTimeout(350);
  const zaehlerFeld = '.dialog [data-feld="anzahl"]';
  const start = parseInt(await page.inputValue(zaehlerFeld + ' .zahl-anzeige'), 10);
  await page.click(zaehlerFeld + ' .zahl-knopf >> nth=1');
  await page.click(zaehlerFeld + ' .zahl-knopf >> nth=1');
  await page.waitForTimeout(200);
  const nachPlus = parseInt(await page.inputValue(zaehlerFeld + ' .zahl-anzeige'), 10);
  pruefe(nachPlus === start + 2, 'der Zähler erhöht um 1 je Tipp', start + ' -> ' + nachPlus);
  for (let i = 0; i < 10; i++) await page.click(zaehlerFeld + ' .zahl-knopf >> nth=0');
  await page.waitForTimeout(250);
  const untergrenze = parseInt(await page.inputValue(zaehlerFeld + ' .zahl-anzeige'), 10);
  pruefe(untergrenze === 1, 'der Zähler fällt nicht unter 1 Tür', String(untergrenze));

  /* Die Mitte bleibt beschreibbar, damit auch 48 schnell gesetzt ist */
  await page.fill(zaehlerFeld + ' .zahl-anzeige', '48');
  await page.waitForTimeout(250);
  const getippt = await page.evaluate(() => {
    const d = document.querySelector('.dialog [data-feld="anzahl"] .zahl-anzeige');
    return { typ: d.type, modus: d.getAttribute('inputmode'), wert: d.value };
  });
  pruefe(getippt.typ === 'text' && getippt.modus === 'numeric' && getippt.wert === '48',
    'die Zahl lässt sich auch schreiben', JSON.stringify(getippt));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* Ein noch nicht erfasster Wert bleibt leer - "0" wäre eine Aussage.
   * Dafür eine frische Tür, bei der noch nichts eingetragen ist. */
  await page.click('button:has-text("+ Neue Tür")');
  await page.waitForSelector('.dialog');
  await page.click('.dialog .modus-leiste button:has-text("Alle Felder")');
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    document.querySelectorAll('.dialog details').forEach(d => { d.open = true; });
  });
  await page.waitForTimeout(250);
  const leerFeld = '.dialog [data-feld="bestandAnzahlSchluessel"]';
  const leerStand = await page.evaluate((sel) => {
    const e = document.querySelector(sel + ' .zahl-anzeige');
    return e ? { wert: e.value, platzhalter: e.placeholder } : null;
  }, leerFeld);
  pruefe(leerStand && leerStand.wert === '',
    'ein nicht erfasster Zähler zeigt nichts an statt einer 0',
    JSON.stringify(leerStand));

  /* Antippen und wieder verlassen darf daraus keine 0 machen */
  await page.click(leerFeld + ' .zahl-anzeige');
  await page.click('.dialog .kopf h2');
  await page.waitForTimeout(250);
  const nachBlur = await page.evaluate((sel) =>
    document.querySelector(sel + ' .zahl-anzeige').value, leerFeld);
  pruefe(nachBlur === '', 'bloßes Antippen erzeugt keinen Zahlenwert', JSON.stringify(nachBlur));

  /* Ein + macht daraus die erste echte Zahl */
  await page.click(leerFeld + ' .zahl-knopf >> nth=1');
  await page.waitForTimeout(200);
  const nachPlusLeer = await page.evaluate((sel) =>
    document.querySelector(sel + ' .zahl-anzeige').value, leerFeld);
  pruefe(nachPlusLeer === '1', 'aus leer wird mit + die 1', nachPlusLeer);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* =======================================================================
   * 5. Stiftmodus
   * ==================================================================== */
  console.log('\n== Stiftmodus ==');
  const anAus = async () => page.evaluate(() => document.body.classList.contains('stift'));
  pruefe(await anAus(), 'der Stiftmodus ist vorbelegt');

  async function feldHoehen() {
    await page.click('.tuer-zeile >> nth=0');
    await page.waitForSelector('.dialog');
    await page.waitForTimeout(350);
    const h = await page.evaluate(() => {
      const d = document.querySelector('.dialog');
      const ein = d.querySelector('[data-feld="bezeichnung"] input');
      const bereich = [...d.querySelectorAll('textarea')].find(x => x.offsetParent);
      return { eingabe: Math.round(ein.getBoundingClientRect().height),
               bereich: bereich ? Math.round(bereich.getBoundingClientRect().height) : 0 };
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    return h;
  }
  const mitStift = await feldHoehen();
  await page.evaluate(() => window.App.wechseln('einstellungen'));
  await page.waitForTimeout(400);
  await page.click('.karte:has(h2:text("Apple Pencil und Handschrift")) .schalter');
  await page.waitForTimeout(400);
  pruefe(!(await anAus()), 'der Stiftmodus lässt sich abschalten');
  await page.evaluate(() => window.App.wechseln('tueren'));
  await page.waitForTimeout(400);
  const ohneStift = await feldHoehen();
  pruefe(mitStift.eingabe > ohneStift.eingabe,
    'im Stiftmodus sind die Schreibfelder höher (' + mitStift.eingabe + ' statt ' +
    ohneStift.eingabe + ' px)');
  pruefe(mitStift.bereich > ohneStift.bereich,
    'auch die Bemerkungsfelder bieten mehr Platz (' + mitStift.bereich + ' statt ' +
    ohneStift.bereich + ' px)');
  pruefe(mitStift.eingabe >= 56, 'eine Zeile Handschrift hat mindestens 56 px Höhe',
    String(mitStift.eingabe));

  /* Die Einstellung überlebt den Neustart */
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  await page.waitForTimeout(500);
  pruefe(!(await anAus()), 'die Entscheidung bleibt nach dem Neustart erhalten');
  /* Nach dem Neustart ist bewusst kein Projekt offen - wieder öffnen */
  await ersteProjektOeffnen(page, 10000);

  /* =======================================================================
   * 6. Schreibprobe: KEIN Feld darf unter dem Stift wegbrechen
   * ====================================================================
   * Der eigentliche Nachweis: In jedes sichtbare Schreibfeld wird ein
   * Zeichen eingetragen. Danach muss dasselbe Feld noch im Dokument stehen
   * und den Fokus haben. Ein Feld, das sich bei der Eingabe selbst neu
   * aufbaut, würde die Handschrifterkennung mitten im Wort abbrechen.
   */
  console.log('\n== Schreibprobe in jedem Feld ==');
  async function schreibprobe(wurzelSel) {
    return page.evaluate((sel) => {
      const wurzel = sel ? document.querySelector(sel) : document;
      if (!wurzel) return { geprueft: 0, kaputt: ['Wurzel nicht gefunden: ' + sel] };
      const felder = [].slice.call(wurzel.querySelectorAll(
        'input[type=text], input:not([type]), input[type=search], textarea'))
        .filter(e => e.offsetParent !== null && !e.readOnly && !e.disabled);
      const kaputt = [];
      felder.forEach(e => {
        const traeger = e.closest('[data-feld]');
        const name = (traeger && traeger.getAttribute('data-feld')) ||
                     e.placeholder || e.className || e.tagName;
        const vorher = e.value;
        e.focus();
        e.value = vorher + '7';
        e.dispatchEvent(new Event('input', { bubbles: true }));
        if (!e.isConnected) { kaputt.push(name + ' (Feld verschwunden)'); return; }
        if (document.activeElement !== e) { kaputt.push(name + ' (Fokus verloren)'); }
        e.value = vorher;
        e.dispatchEvent(new Event('input', { bubbles: true }));
      });
      return { geprueft: felder.length, kaputt: kaputt };
    }, wurzelSel);
  }

  /* Türformular, Vollansicht, alle Abschnitte offen */
  await page.evaluate(() => window.App.wechseln('tueren'));
  await page.waitForSelector('.tuer-zeile');
  await page.click('.tuer-zeile >> nth=0');
  await page.waitForSelector('.dialog');
  await page.click('.dialog .modus-leiste button:has-text("Alle Felder")');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.querySelectorAll('.dialog details').forEach(d => { d.open = true; });
    /* Auch die Felder für abweichende Maße sichtbar machen */
    document.querySelectorAll('.dialog .feld input.versteckt')
      .forEach(e => e.classList.remove('versteckt'));
  });
  await page.waitForTimeout(300);
  const tuerProbe = await schreibprobe('.dialog');
  pruefe(tuerProbe.kaputt.length === 0,
    'alle ' + tuerProbe.geprueft + ' Schreibfelder des Türformulars überstehen die Eingabe',
    tuerProbe.kaputt.join(', '));
  pruefe(tuerProbe.geprueft >= 15,
    'die Probe hat auch wirklich alle Felder erreicht (' + tuerProbe.geprueft + ')');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* Geführter Ablauf, Schritt für Schritt */
  await page.click('.tuer-zeile >> nth=0');
  await page.waitForSelector('.dialog');
  await page.click('.dialog .modus-leiste button:has-text("Schritt für Schritt")');
  await page.waitForTimeout(350);
  const schritte = await page.$$eval('.dialog .schritt-fortschritt .stufe', n => n.length);
  const kaputteSchritte = [];
  let gepruefteSchritte = 0;
  for (let i = 0; i < schritte; i++) {
    await page.click('.dialog .schritt-fortschritt .stufe >> nth=' + i);
    await page.waitForTimeout(220);
    await page.evaluate(() => {
      document.querySelectorAll('.dialog details').forEach(d => { d.open = true; });
      document.querySelectorAll('.dialog .feld input.versteckt')
        .forEach(e => e.classList.remove('versteckt'));
    });
    const r = await schreibprobe('.dialog');
    gepruefteSchritte += r.geprueft;
    r.kaputt.forEach(x => kaputteSchritte.push('Schritt ' + (i + 1) + ': ' + x));
  }
  pruefe(kaputteSchritte.length === 0,
    'auch im geführten Ablauf übersteht jedes Feld die Eingabe (' +
    schritte + ' Schritte, ' + gepruefteSchritte + ' Felder)', kaputteSchritte.join(', '));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* Spalte, Gruppe und Mitarbeiter samt Medienliste */
  await page.evaluate(() => window.App.wechseln('plan'));
  await page.waitForSelector('table.matrix');
  await page.click('th.spaltenkopf.art-gruppe >> nth=0');
  await page.waitForSelector('.dialog');
  await page.waitForTimeout(400);
  const schlProbe = await schreibprobe('.dialog');
  pruefe(schlProbe.kaputt.length === 0,
    'die Felder der Schließung überstehen die Eingabe (' + schlProbe.geprueft + ')',
    schlProbe.kaputt.join(', '));
  await page.click('.dialog button:has-text("Gruppe bearbeiten")');
  await page.waitForTimeout(400);
  const grpProbe = await schreibprobe('.dialog');
  pruefe(grpProbe.kaputt.length === 0,
    'auch die Gruppe übersteht die Eingabe (' + grpProbe.geprueft + ')',
    grpProbe.kaputt.join(', '));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('.personen-karte button:has-text("+ Mitarbeiter")');
  await page.waitForTimeout(400);
  const maProbe = await schreibprobe('.dialog-hinter:last-of-type .dialog');
  pruefe(maProbe.kaputt.length === 0,
    'und der Mitarbeiter samt Medienliste ebenso (' + maProbe.geprueft + ')',
    maProbe.kaputt.join(', '));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* Stammdaten und Einstellungen */
  for (const [ansicht, name] of [['stammdaten', 'Stammdaten'], ['einstellungen', 'Einstellungen']]) {
    await page.evaluate(v => window.App.wechseln(v), ansicht);
    await page.waitForTimeout(450);
    const r = await schreibprobe('main.inhalt');
    pruefe(r.kaputt.length === 0,
      'die Felder unter „' + name + '“ überstehen die Eingabe (' + r.geprueft + ')',
      r.kaputt.join(', '));
  }

  /* =======================================================================
   * 7. Eine Auswahl verliert keinen Altwert
   * ==================================================================== */
  console.log('\n== Kein stiller Datenverlust in Auswahllisten ==');
  const altwert = await page.evaluate(() => {
    const ziel = {};
    const feld = window.AppKern.auswahlFeld(
      { art: 'Sonderzylinder aus 1998' }, 'art', 'Art',
      ['Doppelzylinder', 'Halbzylinder'], { leerText: '– bitte wählen –' });
    const sel = feld.querySelector('select');
    ziel.wert = sel.value;
    ziel.texte = [...sel.options].map(o => o.textContent);
    return ziel;
  });
  pruefe(altwert.wert === 'Sonderzylinder aus 1998',
    'ein nicht mehr gelisteter Wert bleibt ausgewählt', altwert.wert);
  pruefe(altwert.texte.some(x => /aus dem Bestand/.test(x)),
    'er ist als Altbestand gekennzeichnet', altwert.texte.join(' | '));

  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler',
    konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\nErgebnis Stiftbedienung: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
