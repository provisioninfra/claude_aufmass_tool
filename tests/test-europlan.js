/* Europlan im Browser: Umschalten zwischen Kreuzschließplan und Europlan,
 * Bearbeiten im Europlan (X/O, I mit Inhaber, Z, Gleichschließung, ESL, Stk,
 * neue Tür) mit sofortiger Wirkung im Kreuzschließplan und umgekehrt, die
 * EVVA-Excel-Ausgabe (entpackt und zellgenau geprüft) und das Europlan-PDF. */
const path = require('path'), fs = require('fs');
const { starte, ersteProjektOeffnen, istUmgebungsGeraeusch } = require('./browser.js');
const { einstellungen } = require('./fixture.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'europlan-training.json'), 'utf8'));
const BILDER = process.env.AUFMASS_BILDER || '';

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + String(i).slice(0, 400) : '')); } }
const DLG = '.dialog-hinter:last-of-type .dialog';

/* ZIP (store) entpacken - ohne Bibliothek */
function entpacken(bytes) {
  const teile = {}; let pos = 0;
  while (pos + 30 <= bytes.length && bytes[pos] === 0x50 && bytes[pos + 1] === 0x4B && bytes[pos + 2] === 3) {
    const nameLen = bytes[pos + 26] | (bytes[pos + 27] << 8), extraLen = bytes[pos + 28] | (bytes[pos + 29] << 8);
    const groesse = bytes.readUInt32LE(pos + 18);
    const name = bytes.slice(pos + 30, pos + 30 + nameLen).toString('utf8');
    teile[name] = bytes.slice(pos + 30 + nameLen + extraLen, pos + 30 + nameLen + extraLen + groesse).toString('utf8');
    pos += 30 + nameLen + extraLen + groesse;
  }
  return teile;
}
function zellen(sheetXml) {
  const aus = {}; const re = /<c r="([A-Z]+\d+)"(?: s="\d+")?(?: t="inlineStr")?>(?:<is><t[^>]*>([^<]*)<\/t><\/is>|<v>([^<]*)<\/v>)<\/c>/g; let m;
  while ((m = re.exec(sheetXml))) aus[m[1]] = m[2] !== undefined ? m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : Number(m[3]);
  return aus;
}

(async () => {
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await ctx.newPage();
  const konsolenFehler = [];
  page.on('pageerror', e => { if (!istUmgebungsGeraeusch(e.message, e.stack)) konsolenFehler.push(e.message); });
  page.on('console', m => { if (m.type() === 'error' && !istUmgebungsGeraeusch(m.text(), '')) konsolenFehler.push(m.text()); });

  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');
  /* Das HS-Trainingsprojekt im Werkzeugmodell anlegen (wie im Modelltest) */
  const projektId = await page.evaluate(async ([fxK, e]) => {
    const M = window.Model, E = window.Europlan;
    const pr = M.neuesProjekt('Training HS-Anlage');
    Object.assign(pr, { kunde: 'Wohnhaus EVVA GmbH', objekt: 'Hauptbahnhof', anlagenNr: '171MU', systemMechanik: 'evva-4ks', oberflaeche: 'NI', aufmassDatum: '2017-02-01', strasse: 'Wienerbergstraße 59-65', plz: '1120', ort: 'Wien' });
    const g = M.neueGruppe({ name: 'Mieter' }); pr.gruppen.push(g);
    const gs = M.spalteFuer(pr, 'gruppe', g.id); gs.kuerzel = 'Z';
    const spalten = {};
    fxK.spalten.forEach((sp, i) => {
      if (/^Mieter/.test(sp.funktion)) {
        const m = M.neuerMitarbeiter({ name: sp.funktion, gruppen: [g.id], medien: [{ typ: 'Schlüssel', anzahl: sp.menge || 1 }] });
        pr.mitarbeiter.push(m); spalten[i] = M.spalteFuer(pr, 'mitarbeiter', m.id);
      } else {
        const s = M.neueSchliessung({ kuerzel: sp.schlNr, bezeichnung: sp.funktion, typ: 'hs', medien: [{ typ: 'Schlüssel', anzahl: sp.menge || 1 }] });
        pr.schliessungen.push(s); spalten[i] = s;
      }
    });
    const erste = {};
    fxK.zeilen.forEach((z, zi) => {
      const t = M.neueTuer({ nummer: String(zi + 1), bezeichnung: z.raum, anzahl: z.stk || 1, zylinderBauform: 'Doppelzylinder', masseAussen: '31', masseInnen: '36' }); pr.tueren.push(t);
      if (erste[z.zylNr]) M.gleichschliessendSetzen(pr, t.id, erste[z.zylNr].id); else erste[z.zylNr] = t;
      z.zellen.forEach((c, i) => { if (c === 'X') M.berechtigungSetzenVerbund(pr, t.id, spalten[i].id, 'ja'); });
    });
    fxK.zeilen.forEach((z, zi) => {
      const alle = fxK.spalten.every((sp, i) => !/^Mieter/.test(sp.funktion) || z.zellen[i] === 'X');
      if (!alle) return;
      M.berechtigungSetzenVerbund(pr, pr.tueren[zi].id, gs.id, 'ja');
      fxK.spalten.forEach((sp, i) => { if (/^Mieter/.test(sp.funktion)) M.berechtigungSetzenVerbund(pr, pr.tueren[zi].id, spalten[i].id, 'nein'); });
    });
    E.eslSetzen(pr, pr.tueren[29].id, 2, { typ: 'Schlüssel' });   /* ELT: Eigenschlüssel T, 2 Stück */
    await window.Store.projektSpeichern(pr);
    await window.Store.einstellungenSpeichern(Object.assign({}, e, { letztesProjekt: pr.id, firma: 'Firma MusterMax', firmaZusatz: 'Max Mustermann' }));
    return pr.id;
  }, [FX['HS-Anlage_oldschool'], einstellungen]);
  await page.reload({ waitUntil: 'load' });
  await ersteProjektOeffnen(page, 10000);
  await page.evaluate(() => { try { localStorage.removeItem('aufmass.planDarstellung'); } catch (e) {} window.App.wechseln('plan'); });
  await page.waitForSelector('table.matrix');

  try {
    console.log('\n== Umschalten ==');
    pruefe(await page.$('.plan-schalter button[data-darstellung="kreuz"].aktiv') !== null, 'der Kreuzschließplan ist die Vorgabe');
    pruefe(await page.$('table.matrix:not(.europlan)') !== null, 'die Zutrittsmatrix steht');
    await page.click('.plan-schalter button[data-darstellung="euro"]');
    await page.waitForSelector('table.matrix.europlan');
    pruefe(await page.$('.plan-schalter button[data-darstellung="euro"].aktiv') !== null, 'der Europlan ist gewählt');
    pruefe(/Europlan/.test(await page.textContent('h1')), 'die Überschrift wechselt');
    const kopf = await page.$$eval('table.matrix.europlan thead tr.schlnr th', n => n.map(x => x.textContent.trim()));
    pruefe(kopf.join('|') === 'ZP|Tür.Nr.|Raumbezeichnung|Stk.|ESL|Type (Produktcode)|Zyl.Nr.|HS|Z', 'Kopfzeile: ZP, Tür.Nr., Raumbezeichnung, Stk., ESL, Type, Zyl.Nr., HS, Z', kopf.join('|'));
    const mengen = await page.$$eval('table.matrix.europlan thead tr.menge th', n => n.map(x => x.textContent.trim()));
    pruefe(mengen.join('|') === '3|', 'Menge: 3 Hauptschlüssel, keine reinen Gruppenschlüssel', mengen.join('|'));
    const zeile = async (raum) => page.$eval('table.matrix.europlan tbody tr:has(td.raum:text-is("' + raum + '"))', r => [].slice.call(r.querySelectorAll('td')).map(td => td.textContent.trim()));
    const haus = await zeile('Haustür');
    pruefe(haus.slice(1).join('|') === '1|Haustür|1||DZ 31/36|1|X|Z', 'Haustür: Zyl.Nr. 1, Type DZ 31/36, X und Z', haus.join('|'));
    const w1 = await zeile('Wohnung 1');
    pruefe(w1.slice(1).join('|') === '2|Wohnung 1|1|3|DZ 31/36|2|X|I', 'Wohnung 1: ESL 3, Zyl.Nr. 2, X und I', w1.join('|'));
    const k1 = await zeile('Keller 1');
    pruefe(k1.slice(1).join('|') === '16|Keller 1|1||DZ 31/36|2.1|X|', 'Keller 1: gleichschließend, Zyl.Nr. 2.1, keine ESL, kein I', k1.join('|'));
    const elt = await zeile('ELT');
    pruefe(elt[4] === '2' && elt[7] === 'X' && elt[8] === '', 'ELT: ESL 2 (Einzelschließung ohne Spalte)', elt.join('|'));
    const muell = await zeile('Müll');
    pruefe(muell[6] === '1.1' && muell[8] === 'Z', 'Müll: Zyl.Nr. 1.1 (gleichschließend mit der Haustür), Z', muell.join('|'));
    if (BILDER) await page.screenshot({ path: path.join(BILDER, 'europlan-1-ansicht.png') });
    await page.reload({ waitUntil: 'load' });
    await ersteProjektOeffnen(page, 10000);
    await page.evaluate(() => window.App.wechseln('plan'));
    await page.waitForSelector('table.matrix.europlan');
    pruefe(true, 'die gewählte Darstellung bleibt nach dem Neuladen erhalten');

    console.log('\n== Bearbeiten im Europlan wirkt sofort im Kreuzschließplan ==');
    const zelle = async (raum, spalte) => (await page.$$('table.matrix.europlan tbody tr:has(td.raum:text-is("' + raum + '")) td.zelle'))[spalte - 1];
    /* X-Spalte: X → O → leer */
    await (await zelle('Wohnung 2', 1)).click();
    await page.waitForTimeout(250);
    pruefe((await zeile('Wohnung 2'))[7] === 'O', 'Antippen in der HS-Spalte: X wird O (vorgeplant)');
    pruefe((await page.evaluate(() => { const p = window.AppKern.Zustand.projekt, M = window.Model; const t = p.tueren.filter(x => x.bezeichnung === 'Wohnung 2')[0]; const s = p.schliessungen.filter(x => x.kuerzel === 'HS')[0]; return M.getBerechtigung(p, t.id, s.id); })) === 'plan', 'im Modell steht „plan“');
    await (await zelle('Wohnung 2', 1)).click(); await page.waitForTimeout(250);
    pruefe((await zeile('Wohnung 2'))[7] === '', 'noch einmal: leer');
    await (await zelle('Wohnung 2', 1)).click(); await page.waitForTimeout(250);
    pruefe((await zeile('Wohnung 2'))[7] === 'X', 'und wieder X');
    /* Gruppenspalte am Keller: Auswahl ohne I */
    await (await zelle('Keller 2', 2)).click();
    await page.waitForSelector(DLG + ' .wahl-liste');
    const wahlen = await page.$$eval(DLG + ' .wahl-liste .wahl b', n => n.map(x => x.textContent.trim()));
    pruefe(wahlen.join('') === '·ZO', 'am gleichschließenden Keller gibt es kein I, und Z statt M (kein fremder Eigenschlüssel): ' + wahlen.join(' '), wahlen.join(''));
    await page.click(DLG + ' .fuss button:has-text("Abbrechen")');
    /* Z an einer Wohnung setzen: Zentralzylinder, Inhaber verlässt die Gruppe → eigene Spalte */
    await (await zelle('Wohnung 3', 2)).click();
    await page.waitForSelector(DLG + ' .wahl-liste');
    await page.click(DLG + ' .wahl-liste .wahl:has(b:text-is("Z"))');
    await page.waitForTimeout(300);
    const w3 = await zeile('Wohnung 3');
    pruefe(w3[8] === 'Z', 'Wohnung 3 wird von der Gruppe gesperrt: ' + w3[8], w3.join('|'));
    const kopf2 = await page.$$eval('table.matrix.europlan thead tr.schlnr th', n => n.map(x => x.textContent.trim()));
    pruefe(kopf2.length === 10 && kopf2[9] === '4', 'der Mieter von Wohnung 3 steht jetzt als eigene Spalte (Schl.Nr. 4 = seine Zyl.Nr.)', kopf2.join('|'));
    pruefe((await zeile('Haustür'))[9] === 'X' && w3[9] === 'X', 'seine Spalte zeigt die Haustür (über die Gruppe) und Wohnung 3', (await zeile('Haustür')).join('|'));
    pruefe((await page.evaluate(() => { const p = window.AppKern.Zustand.projekt; const m = p.mitarbeiter.filter(x => /Whg\. 3/.test(x.name))[0]; return m && m.gruppen.length; })) === 1, 'der Mieter bleibt in seiner Gruppe');
    pruefe(/eigene Spalte/.test(await page.textContent('.seite')), 'mit Hinweis in der Ansicht');
    /* zurück: leer → Gruppe sperrt nicht mehr; dann I → Inhaber wieder in die Gruppe */
    await (await zelle('Wohnung 3', 2)).click(); await page.waitForSelector(DLG + ' .wahl-liste');
    await page.click(DLG + ' .wahl-liste .wahl:has(b:text-is("·"))'); await page.waitForTimeout(300);
    await (await zelle('Wohnung 3', 2)).click(); await page.waitForSelector(DLG + ' .wahl-liste');
    await page.click(DLG + ' .wahl-liste .wahl:has(b:text-is("I"))'); await page.waitForTimeout(300);
    const w3b = await zeile('Wohnung 3');
    pruefe(w3b[8] === 'I' && (await page.$$eval('table.matrix.europlan thead tr.schlnr th', n => n.length)) === 9, 'I setzt den vorhandenen Inhaber wieder in die Gruppe, die Extraspalte verschwindet', w3b.join('|'));
    /* Neue Tür anlegen und I vergeben: Inhaber-Dialog */
    await page.click('button:has-text("+ Tür / Zylinder")');
    await page.waitForSelector(DLG + ' input');
    await page.fill(DLG + ' input[placeholder="z. B. Wohnung 3"]', 'Wohnung 15');
    await page.click(DLG + ' .fuss button:text-is("Anlegen")');
    await page.waitForTimeout(400);
    const w15 = await zeile('Wohnung 15');
    pruefe(w15 && w15[2] === 'Wohnung 15' && w15[6] === w15[1], 'neue Tür erscheint als Zeile mit Zyl.Nr. = Türnummer', w15 && w15.join('|'));
    await (await zelle('Wohnung 15', 2)).click(); await page.waitForSelector(DLG + ' .wahl-liste');
    await page.click(DLG + ' .wahl-liste .wahl:has(b:text-is("I"))');
    await page.waitForSelector(DLG + ' input[placeholder="z. B. Mieter Wohnung 3"]');
    await page.fill(DLG + ' input[placeholder="z. B. Mieter Wohnung 3"]', 'Mieter Whg. 15');
    await page.click(DLG + ' .fuss button:text-is("Anlegen")');
    await page.waitForTimeout(400);
    const w15b = await zeile('Wohnung 15');
    pruefe(w15b[4] === '3' && w15b[8] === 'I', 'I mit neuem Inhaber: ESL 3 und I', w15b.join('|'));
    const modell = await page.evaluate(() => { const p = window.AppKern.Zustand.projekt, M = window.Model; const m = p.mitarbeiter.filter(x => x.name === 'Mieter Whg. 15')[0]; const s = p.schliessungen.filter(x => x.art === 'mitarbeiter' && x.mitarbeiterId === m.id)[0]; const t = p.tueren.filter(x => x.bezeichnung === 'Wohnung 15')[0]; return { gruppen: m.gruppen.length, medien: M.mitarbeiterMedienAnzahl(m), kreuz: M.getBerechtigung(p, t.id, s.id), haus: M.getBerechtigung(p, p.tueren[0].id, s.id) }; });
    pruefe(modell.gruppen === 1 && modell.medien === 3 && modell.kreuz === 'ja' && modell.haus === 'nein', 'im Modell: Gruppenmitglied, 3 Medien, eigene Spalte mit ja an der Wohnung (die Haustür kommt über die Gruppe)', JSON.stringify(modell));
    /* ESL ändern */
    await page.click('table.matrix.europlan tbody tr:has(td.raum:text-is("Wohnung 15")) td.esl');
    await page.waitForSelector(DLG + ' input[type=number], ' + DLG + ' input');
    await page.fill(DLG + ' input', '5');
    await page.click(DLG + ' .fuss button:has-text("Übernehmen")');
    await page.waitForTimeout(300);
    pruefe((await zeile('Wohnung 15'))[4] === '5', 'ESL auf 5 gesetzt');
    /* Stk ändern */
    await page.click('table.matrix.europlan tbody tr:has(td.raum:text-is("Wohnung 15")) td.stk');
    await page.waitForSelector(DLG + ' input'); await page.fill(DLG + ' input', '2');
    await page.click(DLG + ' .fuss button:has-text("Übernehmen")'); await page.waitForTimeout(300);
    pruefe((await zeile('Wohnung 15'))[3] === '2', 'Stk. auf 2 gesetzt');
    /* Gleichschließung über die Zyl.Nr. */
    await page.click('button:has-text("+ Tür / Zylinder")');
    await page.waitForSelector(DLG + ' input');
    await page.fill(DLG + ' input[placeholder="z. B. Wohnung 3"]', 'Keller 15');
    await page.click(DLG + ' .fuss button:text-is("Anlegen")'); await page.waitForTimeout(400);
    await page.click('table.matrix.europlan tbody tr:has(td.raum:text-is("Keller 15")) td.zyl');
    await page.waitForSelector(DLG + ' .wahl-liste');
    await page.click(DLG + ' .wahl-liste .wahl:has-text("Wohnung 15")'); await page.waitForTimeout(400);
    const k15 = await zeile('Keller 15');
    pruefe(k15[6] === w15b[1] + '.1' && k15[4] === '' && k15[8] === '', 'Keller 15 ist gleichschließend: Zyl.Nr. ' + w15b[1] + '.1, keine ESL, kein I', k15.join('|'));
    pruefe(await page.evaluate(() => { const p = window.AppKern.Zustand.projekt, M = window.Model; const a = p.tueren.filter(x => x.bezeichnung === 'Wohnung 15')[0], b = p.tueren.filter(x => x.bezeichnung === 'Keller 15')[0]; return p.schliessungen.every(s => M.getBerechtigung(p, a.id, s.id) === M.getBerechtigung(p, b.id, s.id)); }), 'beide Türen haben dieselben Berechtigungen');
    if (BILDER) await page.screenshot({ path: path.join(BILDER, 'europlan-2-bearbeitet.png') });

    console.log('\n== Kreuzschließplan zeigt denselben Stand ==');
    await page.click('.plan-schalter button[data-darstellung="kreuz"]');
    await page.waitForSelector('table.matrix:not(.europlan)');
    const kreuzZeile = async (text) => page.$eval('table.matrix tbody tr:has(td.tuername:has-text("' + text + '"))', r => [].slice.call(r.querySelectorAll('td.zelle')).map(td => td.textContent.trim()));
    const koepfe = await page.$$eval('table.matrix th.spaltenkopf .dreh', n => n.map(x => x.textContent.trim()));
    pruefe(koepfe.some(k => /Mieter Whg\. 15/.test(k)), 'der neue Mieter hat eine Spalte im Kreuzplan', koepfe.join('|'));
    const iKeller = koepfe.findIndex(k => /Mieter Whg\. 15/.test(k));
    pruefe((await kreuzZeile('Keller 15'))[iKeller] === 'X' && (await kreuzZeile('Wohnung 15'))[iKeller] === 'X', 'Wohnung 15 und Keller 15 tragen sein Kreuz');
    pruefe(/= .*\.1/.test(await page.$eval('table.matrix tbody tr:has(td.tuername:has-text("Keller 15")) td.tuername', n => n.textContent)), 'der Keller zeigt seine Zylindernummer mit .1');
    /* Im Kreuzplan ein Kreuz an der Wohnung 15 für HS setzen: der Keller zieht mit */
    const iHS = koepfe.findIndex(k => /^HS/.test(k));
    await (await page.$$('table.matrix tbody tr:has(td.tuername:has-text("Wohnung 15")) td.zelle'))[iHS].click();
    await page.waitForTimeout(200);
    pruefe((await kreuzZeile('Keller 15'))[iHS] === 'X', 'ein Kreuz an der Wohnung erscheint sofort auch am gleichschließenden Keller');
    await page.click('.plan-schalter button[data-darstellung="euro"]');
    await page.waitForSelector('table.matrix.europlan');
    pruefe((await zeile('Keller 15'))[7] === 'X' && (await zeile('Wohnung 15'))[7] === 'X', 'und im Europlan steht das X an beiden');

    console.log('\n== Ein Gruppenkreuz im Kreuzschließplan kommt vollständig im Europlan an ==');
    await page.click('.plan-schalter button[data-darstellung="kreuz"]');
    await page.waitForSelector('table.matrix:not(.europlan)');
    const koepfe2 = await page.$$eval('table.matrix th.spaltenkopf .dreh', n => n.map(x => x.textContent.trim()));
    const iZ = koepfe2.findIndex(k => /Mieter/.test(k) && !/Whg/.test(k));
    pruefe(iZ >= 0, 'die Gruppenspalte „Mieter“ steht im Kreuzplan', koepfe2.join('|'));
    /* Die Gruppe darf jetzt auch Wohnung 2 sperren - deren Mieter hat einen Eigenschlüssel */
    await (await page.$$('table.matrix tbody tr:has(td.tuername:has-text("Wohnung 2")) td.zelle'))[iZ].click();
    await page.waitForTimeout(200);
    pruefe((await kreuzZeile('Wohnung 2'))[iZ] === 'X', 'das Kreuz steht im Kreuzplan');
    await page.click('.plan-schalter button[data-darstellung="euro"]');
    await page.waitForSelector('table.matrix.europlan');
    const w2e = await zeile('Wohnung 2');
    const kopf3 = await page.$$eval('table.matrix.europlan thead tr.schlnr th', n => n.map(x => x.textContent.trim()));
    const iNeu = kopf3.indexOf(w2e[1]);
    pruefe(w2e[8] === 'Z', 'im Europlan sperrt die Gruppe Wohnung 2 (Z)', w2e.join('|'));
    pruefe(iNeu > 8, 'der Mieter von Wohnung 2 steht als eigene Spalte mit seiner Zyl.Nr. ' + w2e[1], kopf3.join('|'));
    pruefe(iNeu > 8 && (await zeile('Haustür'))[iNeu] === 'X' && w2e[iNeu] === 'X' && (await zeile('Wohnung 1'))[iNeu] === '',
      'seine Spalte zeigt Haustür und Wohnung 2 - der Schlüssel sperrt beides', (await zeile('Haustür')).join('|'));
    pruefe(/mit allem, was seine Gruppe sperrt/.test(await page.textContent('.seite')), 'der Hinweis in der Ansicht erklärt die eigene Spalte');
    /* zurück auf den Ausgangsstand, damit das Formular unten dem Trainingsplan entspricht */
    await page.evaluate(() => { const p = window.AppKern.Zustand.projekt, M = window.Model; const t = p.tueren.filter(x => x.bezeichnung === 'Wohnung 2')[0]; const s = p.schliessungen.filter(x => x.art === 'gruppe')[0]; M.berechtigungSetzenVerbund(p, t.id, s.id, 'nein'); window.AppKern.speichern(); });
    await page.click('.plan-schalter button[data-darstellung="kreuz"]'); await page.waitForSelector('table.matrix:not(.europlan)');
    await page.click('.plan-schalter button[data-darstellung="euro"]'); await page.waitForSelector('table.matrix.europlan');
    pruefe((await zeile('Wohnung 2'))[8] === 'I' && (await page.$$eval('table.matrix.europlan thead tr.schlnr th', n => n.length)) === kopf3.length - 1, 'ohne das Gruppenkreuz ist der Mieter wieder gefaltet (I)');

    console.log('\n== EVVA-Formular (Excel) ==');
    const dateien = await page.evaluate(async () => {
      const aus = [];
      const original = window.Store.dateiHerunterladen;
      window.Store.dateiHerunterladen = async (inhalt, name, mime) => {
        const puffer = inhalt instanceof Blob ? await inhalt.arrayBuffer() : new TextEncoder().encode(inhalt);
        aus.push({ name, mime, groesse: puffer.byteLength, b64: btoa(String.fromCharCode.apply(null, new Uint8Array(puffer).subarray(0, 400000))) });
        return 'gespeichert';
      };
      window.ViewsEuroplan.excelExport('euro');
      window.ViewsEuroplan.excelExport('kreuz');
      await new Promise(r => setTimeout(r, 800));
      window.Store.dateiHerunterladen = original;
      return aus;
    });
    pruefe(dateien.length === 2 && /Europlan-EVVA.*\.xlsx$/.test(dateien[0].name) && /Kreuzschliessplan-EVVA.*\.xlsx$/.test(dateien[1].name), 'zwei Arbeitsmappen mit sprechenden Namen', dateien.map(d => d.name).join(', '));
    pruefe(dateien.every(d => d.mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'mit dem Excel-Inhaltstyp');
    const euroTeile = entpacken(Buffer.from(dateien[0].b64, 'base64'));
    const ez = zellen(euroTeile['xl/worksheets/sheet1.xml'] || '');
    pruefe(ez.G1 === 'Funktion' && ez.G2 === 'Menge' && ez.G3 === 'Schl.Nr' && ez.A4 === 'ZP' && ez.B4 === 'Tür.Nr.' && ez.C4 === 'Raumbezeichnung' && ez.D4 === 'Stk.' && ez.E4 === 'ESL' && ez.F4 === 'Type (Produktcode)' && ez.G4 === 'Zyl.Nr.', 'Europlan: Kopfzellen an den Stellen der EVVA-Vorlage');
    pruefe(/Firma MusterMax/.test(ez.C2) && /Wohnhaus EVVA GmbH/.test(ez.C3) && ez.F2 === '171MU' && /EVVA 4KS\nNI\n01\.02\.2017\nHauptbahnhof/.test(ez.F3), 'Besteller, Besitzer, Anlage, System/Oberfläche/Datum/Objekt', JSON.stringify([ez.C2, ez.C3, ez.F2, ez.F3]));
    pruefe(ez.H1 === 'Hauptschlüssel' && ez.H2 === 3 && ez.H3 === 'HS' && ez.I3 === 'Z' && ez.I1 === 'Mieter', 'Schlüsselspalten: Funktion, Menge, Schl.Nr', JSON.stringify([ez.H1, ez.H2, ez.H3, ez.I1, ez.I3]));
    pruefe(ez.A5 === 1 && ez.B5 === '1' && ez.C5 === 'Haustür' && ez.D5 === 1 && ez.G5 === '1' && ez.H5 === 'X' && ez.I5 === 'Z', 'Zeile 5 Haustür wie im Trainingsplan', JSON.stringify([ez.A5, ez.B5, ez.C5, ez.D5, ez.G5, ez.H5, ez.I5]));
    pruefe(ez.C6 === 'Wohnung 1' && ez.E6 === 3 && ez.F6 === 'DZ 31/36' && ez.G6 === '2' && ez.H6 === 'X' && ez.I6 === 'I', 'Zeile 6 Wohnung 1: ESL 3, Type, Zyl.Nr., X, I', JSON.stringify([ez.C6, ez.E6, ez.F6, ez.G6, ez.H6, ez.I6]));
    pruefe(ez.C20 === 'Keller 1' && ez.E20 === undefined && ez.G20 === '2.1' && ez.I20 === undefined, 'Zeile 20 Keller 1: gleichschließend 2.1 ohne ESL und ohne I', JSON.stringify([ez.C20, ez.E20, ez.G20, ez.I20]));
    pruefe(ez.A504 === 500 && ez.C504 === undefined, 'Zeilenpositionen bis 500 wie in der Vorlage');
    pruefe(/state="hidden"/.test(euroTeile['xl/workbook.xml']) && /definedName name="Sperrmgl"/.test(euroTeile['xl/workbook.xml']), 'verstecktes Blatt „Vorlagen“ und die Namen der Vorlage');
    const kreuzTeile = entpacken(Buffer.from(dateien[1].b64, 'base64'));
    const kz = zellen(kreuzTeile['xl/worksheets/sheet1.xml'] || '');
    const kreuzKopf = []; for (let i = 0; i < 20; i++) { const c = window_spalte(8 + i); if (kz[c + '3'] !== undefined) kreuzKopf.push(String(kz[c + '3'])); }
    function window_spalte(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
    pruefe(kreuzKopf[0] === 'HS' && kreuzKopf.length === 16 && kreuzKopf.indexOf('2') === 1, 'Kreuzplan: 16 Schlüsselspalten (HS, 14 Mieter, Mieter 15), Schlüsselnummer = Zylindernummer', kreuzKopf.join(','));
    pruefe(kz.H5 === 'X' && kz.I5 === 'X' && kz.I6 === 'X' && kz.J6 === undefined && kz.I20 === 'X', 'Kreuzplan: Haustür für alle, Wohnung 1 und Keller 1 für Schlüssel 2', JSON.stringify([kz.H5, kz.I5, kz.I6, kz.J6, kz.I20]));
    pruefe(kz.E6 === undefined && kz.E34 === 2, 'Kreuzplan: ESL nur beim Eigenschlüssel ohne Spalte (ELT)', JSON.stringify([kz.E6, kz.E34]));

    console.log('\n== Europlan-PDF ==');
    const pdf = await page.evaluate(() => { const doc = window.Reports.europlan(window.AppKern.Zustand.projekt, window.AppKern.Zustand.einstellungen || {}); const b = doc.build(); return { kopf: String.fromCharCode.apply(null, new Uint8Array(b).subarray(0, 5)), seiten: doc.seitenAnzahl(), bytes: b.length }; });
    pruefe(pdf.kopf === '%PDF-' && pdf.seiten >= 1 && pdf.bytes > 5000, 'das Europlan-PDF entsteht im Browser (' + pdf.seiten + ' Seiten)');
    await page.evaluate(() => window.App.wechseln('export'));
    await page.waitForSelector('h1:has-text("Export")');
    const exportText = await page.textContent('main.inhalt');
    pruefe(/Europlan/.test(exportText) && /EVVA-Bestellformular \(Excel\)/.test(exportText) && /Kreuzschließplan \(jeder Schlüssel eine Spalte\)/.test(exportText), 'die Export-Ansicht bietet Europlan-PDF und beide EVVA-Formulare an');

    pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler', konsolenFehler.join(' | '));
  } catch (e) {
    pruefe(false, 'Durchlauf ohne Ausnahme', (e.stack || String(e)).split('\n').slice(0, 3).join(' | '));
    if (BILDER) { try { await page.screenshot({ path: path.join(BILDER, 'europlan-fehler.png') }); } catch (f) {} }
  } finally {
    await browser.close();
  }
  console.log('\nErgebnis Europlan: ' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})();
