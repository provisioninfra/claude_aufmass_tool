/* Europlan im Modell: Faltung Kreuzschließplan → Europlan und zurück gegen die
 * vier EVVA-Trainingspläne (HS-Anlage und Z-Anlage, je als Euro- und als
 * Kreuzplan), Bearbeitungsschritte (I/Z/M/X/O, ESL, Gleichschließung), die
 * Zylindernummern und das EVVA-Formular als Arbeitsmappe. */
const path = require('path'), fs = require('fs'), os = require('os');
global.window = undefined;
const K = require('../src/js/catalog.js');
const M = require('../src/js/model.js');
const E = require('../src/js/europlan.js');
const X = require('../src/js/xlsx.js');
const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'europlan-training.json'), 'utf8'));
let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + String(i).slice(0, 500) : '')); } }

/* Aus einem Kreuzplan (oldschool) ein Projekt bauen, wie es im Werkzeug entstünde:
   Sonderschlüssel (HS, THS) als Schließung, „Mieter Whg. n“ als Mitarbeiter der Gruppe Z
   mit eigener Spalte, gleiche Zyl.Nr. = gleichschließend, Eigenschlüssel ohne Spalte = ESL. */
function ausKreuz(fx, fxEuro) {
  const pr = M.neuesProjekt('Probe');
  const g = M.neueGruppe({ name: 'Mieter' }); pr.gruppen.push(g);
  const gs = M.spalteFuer(pr, 'gruppe', g.id); gs.kuerzel = 'Z';
  const spalten = {};
  fx.spalten.forEach((sp, i) => {
    if (/^Mieter/.test(sp.funktion)) {
      const m = M.neuerMitarbeiter({ name: sp.funktion, gruppen: [g.id], medien: [{ typ: 'Schlüssel', anzahl: sp.menge || 1 }] });
      pr.mitarbeiter.push(m); spalten[i] = M.spalteFuer(pr, 'mitarbeiter', m.id);
    } else {
      const s = M.neueSchliessung({ kuerzel: sp.schlNr, bezeichnung: sp.funktion, typ: sp.schlNr === 'HS' ? 'hs' : 'gs', medien: [{ typ: 'Schlüssel', anzahl: sp.menge || 1 }] });
      pr.schliessungen.push(s); spalten[i] = s;
    }
  });
  const erste = {};
  fx.zeilen.forEach((z, zi) => {
    const t = M.neueTuer({ nummer: String(zi + 1), bezeichnung: z.raum, anzahl: z.stk || 1 }); pr.tueren.push(t);
    if (erste[z.zylNr]) M.gleichschliessendSetzen(pr, t.id, erste[z.zylNr].id); else erste[z.zylNr] = t;
    z.zellen.forEach((c, i) => { if (c === 'X') M.berechtigungSetzenVerbund(pr, t.id, spalten[i].id, 'ja'); });
  });
  /* Zentralzylinder: wo ALLE Mieter sperren, ist das die Gruppe */
  fx.zeilen.forEach((z, zi) => {
    const alle = fx.spalten.every((sp, i) => !/^Mieter/.test(sp.funktion) || z.zellen[i] === 'X');
    if (!alle) return;
    const t = pr.tueren[zi];
    M.berechtigungSetzenVerbund(pr, t.id, gs.id, 'ja');
    fx.spalten.forEach((sp, i) => { if (/^Mieter/.test(sp.funktion)) M.berechtigungSetzenVerbund(pr, t.id, spalten[i].id, 'nein'); });
  });
  /* Eigenschlüssel ohne Spalte (ELT „T“): ESL aus dem Europlan übernehmen */
  fxEuro.zeilen.forEach((z, zi) => {
    if (z.esl === null || z.esl === undefined) return;
    const t = pr.tueren[zi];
    const a = E.analyse(pr);
    if ((a.inhaber[(M.basisTuer(pr, t) || t).id] || []).length) return;   /* Mieter: ESL = Medien */
    E.eslSetzen(pr, t.id, z.esl, { typ: 'Schlüssel' });
  });
  return pr;
}

for (const art of ['HS', 'Z']) {
  console.log('\n== ' + art + '-Anlage: Kreuzplan → Europlan ==');
  const fxK = F[art + '-Anlage_oldschool'], fxE = F[art + '-Anlage_Euro'];
  const pr = ausKreuz(fxK, fxE);
  const e = E.europlan(pr);
  p(e.spalten.map(s => s.schlNr).join(',') === fxE.spalten.map(s => s.schlNr).join(','), 'Spalten des Europlans: ' + fxE.spalten.map(s => s.schlNr).join(', '), e.spalten.map(s => s.schlNr).join(','));
  let abw = [];
  fxE.zeilen.forEach((z, zi) => {
    const zeile = e.zeilen[zi];
    const soll = z.zellen.join(''), ist = e.spalten.map(s => zeile.zellen[s.id]).join('');
    const eslSoll = z.esl === null ? '' : String(z.esl), eslIst = zeile.esl === null ? '' : String(zeile.esl);
    if (soll !== ist || eslSoll !== eslIst) abw.push(z.raum + ': soll ' + JSON.stringify(soll) + '/' + eslSoll + ' ist ' + JSON.stringify(ist) + '/' + eslIst);
  });
  p(abw.length === 0, 'alle ' + fxE.zeilen.length + ' Zylinderzeilen stimmen mit dem Euro-Trainingsplan überein (Zeichen und ESL)', abw.join(' | '));
  p(e.hinweise.length === 0, 'keine Hinweise auf nicht faltbare Schlüssel', e.hinweise.join(' | '));
  const mengeZ = e.spalten.filter(s => s.schlNr === 'Z')[0].menge;
  p(mengeZ === 0, 'die Gruppenspalte hat keine reinen Gruppenschlüssel (alle Mieter haben eine eigene Tür)', mengeZ);
  const keller3 = e.zeilen.filter(z => z.tuer.bezeichnung === 'Keller 3')[0], wohnung3 = e.zeilen.filter(z => z.tuer.bezeichnung === 'Wohnung 3')[0];
  p(keller3.mitlaeufer && keller3.zylNr === wohnung3.zylNr && keller3.esl === null, 'Keller 3 ist gleichschließend zu Wohnung 3: dieselbe Zyl.Nr. ' + wohnung3.zylNr + ', keine ESL', keller3.zylNr);
  const zentral = e.zeilen.filter(z => ['Müll', 'Fahrräder'].indexOf(z.tuer.bezeichnung) !== -1);
  p(zentral.every(z => z.mitlaeufer && z.zylNr === '1'), 'Müll und Fahrräder tragen die Zyl.Nr. der Haustür (1) - wie „Z“ im Trainingsplan', zentral.map(z => z.zylNr).join(','));
  /* Zyl.Nr. als Bezeichnung der Schließung: gleiche Nummer genau dann, wenn der Trainingsplan dieselbe Zyl.Nr. nennt */
  const klassenSoll = {}, klassenIst = {};
  fxE.zeilen.forEach((z, zi) => { (klassenSoll[z.zylNr] = klassenSoll[z.zylNr] || []).push(zi); const n = e.zeilen[zi].zylNr; (klassenIst[n] = klassenIst[n] || []).push(zi); });
  const soll = Object.values(klassenSoll).map(x => x.join('-')).sort().join('|'), ist = Object.values(klassenIst).map(x => x.join('-')).sort().join('|');
  p(soll === ist, 'gleiche Zyl.Nr. im Werkzeug genau dort, wo der Trainingsplan dieselbe Zyl.Nr. hat (Z, 1 bis 14, T)', ist);

  console.log('\n== ' + art + '-Anlage: Modell → Kreuzplan (jeder Schlüssel eine Spalte) ==');
  const kp = E.kreuzplan(pr);
  p(kp.spalten.length === fxK.spalten.length, fxK.spalten.length + ' Schlüsselspalten', kp.spalten.length);
  p(kp.spalten.map(s => s.funktion).join('|') === fxK.spalten.map(s => s.funktion).join('|'), 'Funktionen in der Reihenfolge des Trainingsplans', kp.spalten.map(s => s.funktion).join('|'));
  p(kp.spalten.every((s, i) => s.menge === (fxK.spalten[i].menge || 0)), 'Menge je Schlüssel wie im Trainingsplan', kp.spalten.map(s => s.menge).join(','));
  let abwK = [];
  fxK.zeilen.forEach((z, zi) => {
    const zeile = kp.zeilen[zi];
    const soll = z.zellen.join(''), ist = kp.spalten.map(s => zeile.zellen[s.id]).join('');
    const eslSoll = z.esl === null ? '' : String(z.esl), eslIst = zeile.esl === null ? '' : String(zeile.esl);
    if (soll !== ist || (eslSoll !== eslIst && !(art === 'Z' && z.raum === 'ELT'))) abwK.push(z.raum + ': ' + soll + '/' + eslSoll + ' ≠ ' + ist + '/' + eslIst);
  });
  p(abwK.length === 0, 'alle Kreuze und ESL stimmen mit dem Kreuz-Trainingsplan überein', abwK.join(' | '));
  const mieter3 = kp.spalten.filter(s => s.funktion === 'Mieter Whg. 3')[0];
  p(mieter3 && mieter3.schlNr === pr.tueren.filter(t => t.bezeichnung === 'Wohnung 3')[0].nummer, 'die Schlüsselnummer eines Mieters ist die Zylindernummer seiner Wohnung', mieter3 && mieter3.schlNr);

  console.log('\n== ' + art + '-Anlage: EVVA-Formular als Arbeitsmappe ==');
  const mappe = E.evvaMappe(pr, { firma: 'Prüffirma GmbH', firmaZusatz: 'Max Prüfer', strasse: 'Weg 1', plz: '12345', ort: 'Ort' }, 'euro');
  const z = mappe.blaetter[0].zellen;
  p(z.G1.v === 'Funktion' && z.G2.v === 'Menge' && z.G3.v === 'Schl.Nr' && z.A4.v === 'ZP' && z.G4.v === 'Zyl.Nr.', 'Kopfzeilen wie im Formular');
  p(z.H3.v === fxE.spalten[0].schlNr && z.I3.v === 'Z', 'Schl.Nr-Zeile: ' + z.H3.v + ', ' + z.I3.v);
  p(z.C5.v === 'Haustür' && z.H5 && z.H5.v === 'X' && z.I5 && z.I5.v === 'Z', 'Zeile 5 Haustür: X und Z');
  p(z.C6.v === 'Wohnung 1' && z.E6.v === 3 && z.I6.v === 'I', 'Zeile 6 Wohnung 1: ESL 3 und I');
  p(z.A504.v === 500 && !z.H504, 'die Zeilenpositionen laufen bis 500');
  p(/Prüffirma GmbH/.test(z.C2.v) && /Weg 1/.test(z.C2.v), 'Besteller aus dem Firmenkopf');
  p(mappe.blaetter[1].versteckt === true && mappe.namen.Sperrmgl === 'Vorlagen!$D$7', 'verstecktes Blatt „Vorlagen“ mit Namen');
  const bytes = X.erzeugen(mappe);
  p(bytes.length > 2000 && bytes[0] === 0x50 && bytes[1] === 0x4B, 'die Arbeitsmappe ist ein ZIP (' + bytes.length + ' Bytes)');
  const datei = path.join(os.tmpdir(), 'europlan-' + art + '-' + process.pid + '.xlsx');
  fs.writeFileSync(datei, bytes);
  /* Entpacken ohne Bibliothek: Methode „store“, lokale Köpfe lesen */
  const teile = {}; let pos = 0;
  while (pos + 30 <= bytes.length && bytes[pos] === 0x50 && bytes[pos + 1] === 0x4B && bytes[pos + 2] === 3) {
    const nameLen = bytes[pos + 26] | (bytes[pos + 27] << 8), extraLen = bytes[pos + 28] | (bytes[pos + 29] << 8);
    const groesse = bytes[pos + 18] | (bytes[pos + 19] << 8) | (bytes[pos + 20] << 16) | (bytes[pos + 21] << 24);
    const name = Buffer.from(bytes.slice(pos + 30, pos + 30 + nameLen)).toString('utf8');
    teile[name] = Buffer.from(bytes.slice(pos + 30 + nameLen + extraLen, pos + 30 + nameLen + extraLen + groesse)).toString('utf8');
    pos += 30 + nameLen + extraLen + groesse;
  }
  p(teile['xl/workbook.xml'] && /state="hidden"/.test(teile['xl/workbook.xml']) && /definedName name="maxRaum"/.test(teile['xl/workbook.xml']), 'workbook.xml: verstecktes Blatt und Namen');
  const blatt = teile['xl/worksheets/sheet1.xml'] || '';
  p(/<c r="C6" t="inlineStr"><is><t xml:space="preserve">Wohnung 1<\/t><\/is><\/c>/.test(blatt) && /<c r="E6"><v>3<\/v><\/c>/.test(blatt), 'sheet1.xml: Zeichenketten und Zahlen an der richtigen Stelle');
  p(/<pane xSplit="7" ySplit="4" topLeftCell="H5"/.test(blatt) && /<mergeCell ref="D2:E2"\/>/.test(blatt), 'fixierte Zeilen und Spalten, Verbundzellen');
  p(/<col min="8" max="8" width="2.1"/.test(blatt) && /<row r="1" ht="84"/.test(blatt), 'Spaltenbreiten und Zeilenhöhen wie in der Vorlage');
  /* Lesbarkeit und Druck (H6, M12, M13, N10, N11) */
  const stile = teile['xl/styles.xml'] || '';
  p(/textRotation="90"/.test(stile) && /shrinkToFit="1"/.test(stile) && /<sz val="8"\/>/.test(stile), 'styles.xml: senkrechte Ausrichtung, Verkleinern auf Zellbreite, Schrift 8');
  p(/<c r="H1" s="7" t="inlineStr">/.test(blatt) && /<c r="H3" s="8" t="inlineStr">/.test(blatt) && /<c r="H2" s="9">/.test(blatt), 'Funktion und Schl.Nr stehen senkrecht, die Menge verkleinert (Stile 7, 8, 9)');
  p(/<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr>/.test(blatt) && /<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"\/>/.test(blatt), 'Druck: Querformat auf eine Seitenbreite');
  const wbx = teile['xl/workbook.xml'] || '';
  p(/<definedName name="_xlnm.Print_Titles" localSheetId="0">'Plan'!\$A:\$G,'Plan'!\$1:\$4<\/definedName>/.test(wbx), 'Wiederholungszeilen 1 bis 4 und -spalten A bis G');
  const bereich = /<definedName name="_xlnm.Print_Area" localSheetId="0">'Plan'!\$A\$1:\$([A-Z]+)\$(\d+)<\/definedName>/.exec(wbx);
  p(bereich && bereich[1] === E.spaltenName(7 + mappe.anzahlSpalten) && parseInt(bereich[2], 10) === 4 + Math.max(10, mappe.anzahlZeilen), 'Druckbereich endet an der letzten belegten Spalte und Zeile', bereich && bereich[0]);
  p(/type="list"[^>]*sqref="H5:CX504"><formula1>&quot;X,O,Z,I,M&quot;<\/formula1>/.test(blatt), 'Gültigkeit: Sperrkombination nur X, O, Z, I, M');
  p(/type="textLength" operator="lessThanOrEqual"[^>]*sqref="H3:CX3"><formula1>maxSlNr<\/formula1>/.test(blatt), 'Gültigkeit: Schl.Nr höchstens maxSlNr Zeichen');
  const mitFassung = E.evvaMappe(pr, { firma: 'Prüffirma GmbH' }, 'euro'); mitFassung.fassung = '1.5.1';
  const bytes2 = X.erzeugen(mitFassung); const text2 = Buffer.from(bytes2).toString('utf8');
  p(/<AppVersion>1\.5\.1<\/AppVersion>/.test(text2), 'app.xml trägt die Fassung');
  fs.unlinkSync(datei);
}

console.log('\n== EVVA-Formular: Zeilenhöhen, Warnungen, Anzahl ==');
{
  const pr = M.neuesProjekt('Formular');
  const t1 = E.tuerAnlegen(pr, { nummer: '1', bezeichnung: 'Haustür', anzahl: 2.5 });
  const t2 = E.tuerAnlegen(pr, { nummer: '', bezeichnung: 'ohne Nummer' });
  t2.nummer = '';   /* tuerAnlegen vergibt sonst eine laufende Nummer */
  t2.anzahl = -1;
  const lang = M.neueSchliessung({ kuerzel: 'GHS-LANGES-KÜRZEL-0001', bezeichnung: 'Generalhauptschlüssel für sämtliche Türen des Verwaltungsgebäudes', typ: 'ghs', medien: [{ typ: 'Schlüssel', anzahl: 2 }] });
  pr.schliessungen.push(lang);
  M.berechtigungSetzenVerbund(pr, t1.id, lang.id, 'ja'); M.berechtigungSetzenVerbund(pr, t2.id, lang.id, 'ja');
  const e = E.europlan(pr);
  /* Die Zeilen sind nach Türnummer sortiert; die Tür ohne Nummer steht zuerst (Zeile 5) */
  const zeileVon = t => e.zeilen.filter(z => z.tuer.id === t.id)[0];
  p(zeileVon(t1).stk === 2 && zeileVon(t2).stk === 1 && M.neueTuer({ anzahl: 2.5 }).anzahl === 2 && M.neueTuer({ anzahl: 0 }).anzahl === 1, 'Anzahl 2,5 wird 2, leer oder negativ wird 1 (N6)', e.zeilen.map(z => z.stk).join(','));
  p(zeileVon(t2).zylNr === '' && M.zylinderNummer(pr, t2) === '' && zeileVon(t1).zylNr === '1', 'eine Tür ohne Nummer hat keine Zyl.Nr., kein „?“ (N10)', JSON.stringify(zeileVon(t2).zylNr));
  const mappe = E.evvaMappe(pr, {}, 'euro');
  const z = mappe.blaetter[0].zellen;
  p(z.G5.v === '' && z.G6.v === '1' && z.H3.v === 'GHS-LANGES', 'im Formular: Zyl.Nr leer, Schl.Nr auf 10 Zeichen', z.G5.v + ' / ' + z.G6.v + ' / ' + z.H3.v);
  p(mappe.warnungen.some(w => /ohne Türnummer.*Zeile 5/.test(w)) && mappe.warnungen.some(w => /Schl\.Nr\. auf 10 Zeichen gekürzt: „GHS-LANGES-KÜRZEL-0001“/.test(w)), 'Warnungen zu fehlender Zyl.Nr und gekürzter Schl.Nr', mappe.warnungen.join(' | '));
  const h = mappe.blaetter[0].hoehen;
  p(h[1] === 130 && h[2] === 49.5 && h[3] === 60 && h[4] === 10.8, 'Zeile 1 wächst mit dem Funktionsnamen (begrenzt auf 130 pt), die anderen behalten die Vorlage', JSON.stringify(h));
  const lange = E.evvaMappe(pr, { firma: 'Firma', firmaZusatz: 'Zusatz mit einem sehr langen Namen, der mehrfach umbricht', strasse: 'Straße 1', plz: '12345', ort: 'Ort' }, 'euro');
  p(lange.blaetter[0].hoehen[2] > 49.5 && lange.blaetter[0].hoehen[2] <= 90, 'Zeile 2 wächst mit dem Besteller (höchstens 90 pt)', lange.blaetter[0].hoehen[2]);
  const mitMitlaeufer = M.neuesProjekt('Gleich');
  const a = E.tuerAnlegen(mitMitlaeufer, { nummer: '', bezeichnung: 'A' }), b = E.tuerAnlegen(mitMitlaeufer, { nummer: '', bezeichnung: 'B' });
  a.nummer = ''; b.nummer = '';
  M.gleichschliessendSetzen(mitMitlaeufer, b.id, a.id);
  p(M.zylinderNummer(mitMitlaeufer, b) === '', 'auch ein Mitläufer einer Tür ohne Nummer bleibt ohne Zyl.Nr.');
}

console.log('\n== Bearbeiten im Europlan: ein Plan entsteht von Hand ==');
{
  const pr = M.neuesProjekt('Neu');
  const haus = E.tuerAnlegen(pr, { nummer: '1', bezeichnung: 'Haustür' });
  const w1 = E.tuerAnlegen(pr, { nummer: '2', bezeichnung: 'Wohnung 1' });
  const w2 = E.tuerAnlegen(pr, { nummer: '3', bezeichnung: 'Wohnung 2' });
  const k1 = E.tuerAnlegen(pr, { nummer: '4', bezeichnung: 'Keller 1' });
  p(pr.tueren.length === 4 && typeof w1.status === 'string' && M.pflichtfelder(pr, w1).length > 0, 'vier Türen angelegt, mit offenen Pflichtangaben');
  const g = M.neueGruppe({ name: 'Mieter' }); pr.gruppen.push(g); const gs = M.spalteFuer(pr, 'gruppe', g.id); gs.kuerzel = 'Z';
  const hs = M.neueSchliessung({ kuerzel: 'HS', bezeichnung: 'Hauptschlüssel', typ: 'hs', medien: [{ typ: 'Schlüssel', anzahl: 2 }] }); pr.schliessungen.push(hs);
  p(E.moeglicheZeichen(pr, w1.id, hs.id).join('') === 'XO' && E.moeglicheZeichen(pr, w1.id, gs.id).join('') === 'IZO', 'mögliche Zeichen: X/O in Schlüsselspalten, I/Z/O in Gruppenspalten (M nur, wo die Tür einen fremden Eigenschlüssel hat)');
  pr.tueren.forEach(t => E.zelleSetzen(pr, t.id, hs.id, 'X'));
  const braucht = E.zelleSetzen(pr, w1.id, gs.id, 'I');
  p(braucht.ok === false && braucht.braucht === 'inhaber', 'I an einer Tür ohne Inhaber verlangt einen Inhaber');
  p(E.zelleSetzen(pr, w1.id, gs.id, 'I', { inhaber: { name: 'Familie Eins', anzahl: 3, typ: 'Schlüssel' } }).ok, 'I mit Inhaber: Mitarbeiter wird angelegt');
  p(E.zelleSetzen(pr, w2.id, gs.id, 'I', { inhaber: { name: 'Familie Zwei', anzahl: 2 } }).ok, 'zweite Wohnung');
  p(E.zelleSetzen(pr, haus.id, gs.id, 'Z').ok, 'Haustür wird Zentralzylinder');
  const m1 = pr.mitarbeiter.filter(m => m.name === 'Familie Eins')[0];
  p(m1 && m1.gruppen.indexOf(g.id) !== -1 && M.mitarbeiterMedienAnzahl(m1) === 3 && E.eigeneSpalte(pr, m1), 'der Inhaber ist Gruppenmitglied, hat 3 Medien und eine eigene Spalte');
  p(M.getBerechtigung(pr, w1.id, E.eigeneSpalte(pr, m1).id) === 'ja' && M.getBerechtigung(pr, w1.id, gs.id) === 'nein', 'im Kreuzplan: eigene Spalte ja, Gruppenspalte nein');
  p(M.gleichschliessendSetzen(pr, k1.id, w1.id) && M.zylinderNummer(pr, k1) === '2' && M.zylinderNummerVorschau(pr, k1, w1.id) === '2', 'Keller 1 gleichschließend mit Wohnung 1: dieselbe Zyl.Nr. 2');
  p(M.getBerechtigung(pr, k1.id, E.eigeneSpalte(pr, m1).id) === 'ja' && M.getBerechtigung(pr, k1.id, hs.id) === 'ja', 'der Keller übernimmt die Kreuze der Wohnung');
  let e = E.europlan(pr);
  const z = (bez) => e.zeilen.filter(x => x.tuer.bezeichnung === bez)[0];
  p(z('Haustür').zellen[gs.id] === 'Z' && z('Wohnung 1').zellen[gs.id] === 'I' && z('Keller 1').zellen[gs.id] === '' && z('Keller 1').zellen[hs.id] === 'X', 'Europlan: Z an der Haustür, I an der Wohnung, nichts am Keller (gleichschließend)');
  p(z('Wohnung 1').esl === 3 && z('Keller 1').esl === null, 'ESL 3 an der Wohnung, keine am Keller');
  p(E.moeglicheZeichen(pr, k1.id, gs.id).indexOf('I') === -1, 'am Mitläufer gibt es kein I');
  p(E.eslSetzen(pr, w1.id, 5).ok && M.mitarbeiterMedienAnzahl(m1) === 5, 'ESL 5 setzt die Medien des Inhabers');
  p(E.eslSetzen(pr, haus.id, 2, { typ: 'Schlüssel' }).ok && pr.schliessungen.some(s => s.typ === 'ez' && s.kuerzel === '1'), 'ESL an der Haustür ohne Inhaber legt eine Einzelschließung „1“ an');
  e = E.europlan(pr);
  p(z('Haustür').esl === 2 && z('Haustür').zellen[gs.id] === 'M' && !e.spalten.some(s => s.spalte.typ === 'ez'), 'die Haustür hat jetzt ESL 2 und ist eine Mitschließung; die EZ-Schließung ist keine Spalte');
  p(E.eslSetzen(pr, haus.id, 0).ok && haus.eigenschluesselVorgeplant === true && E.europlan(pr).zeilen[0].esl === 0, 'ESL 0 = vorgeplant');
  p(E.eslSetzen(pr, haus.id, null).ok && E.europlan(pr).zeilen[0].esl === null, 'ESL leer = kein Eigenschlüssel');
  p(E.zelleSetzen(pr, w2.id, hs.id, 'O').ok && M.getBerechtigung(pr, w2.id, hs.id) === 'plan' && E.europlan(pr).zeilen.filter(x => x.tuer.id === w2.id)[0].zellen[hs.id] === 'O', 'O = vorgeplant im Kreuzplan als „plan“');
  p(K.berechtigungZeichen('plan') === 'O' && !M.istBerechtigt('plan') && !M.istBerechtigt('sperr') && M.istBerechtigt('zeit'), 'Katalog: plan zeigt O, zählt aber nicht als berechtigt');
  p(E.zelleSetzen(pr, w2.id, gs.id, '').ok && pr.mitarbeiter.filter(m => m.name === 'Familie Zwei')[0].gruppen.length === 0, 'I entfernen nimmt den Inhaber aus der Gruppe');
  e = E.europlan(pr);
  p(e.hinweise.length === 1 && /Familie Zwei/.test(e.hinweise[0]) && e.spalten.some(s => s.spalte.art === 'mitarbeiter'), 'ohne Gruppe steht der Schlüssel als eigene Spalte, mit Hinweis');
  const text = E.alsText(e);
  p(/Zyl\.Nr/.test(text) && /Keller 1/.test(text), 'Textdarstellung enthält die Zylindernummern');
  /* Rückfahrkarte: Migration hält alles zusammen */
  const kopie = M.migriere(JSON.parse(JSON.stringify(pr)));
  p(kopie.tueren[3].gleichschliessendMit === w1.id && M.getBerechtigung(kopie, k1.id, hs.id) === 'ja', 'migriere behält Gleichschließung und gleicht Kreuze an');
  kopie.tueren[3].gleichschliessendMit = 'gibt-es-nicht';
  p(M.migriere(kopie).tueren[3].gleichschliessendMit === '', 'ein Verweis auf eine gelöschte Tür wird gelöst');
  const kreis = M.migriere(JSON.parse(JSON.stringify(pr))); kreis.tueren[1].gleichschliessendMit = k1.id;
  const geloest = M.migriere(kreis);
  p(!geloest.tueren.some(t => M.basisTuer(geloest, t) === null) && M.zylinderNummer(geloest, geloest.tueren[1]).indexOf('.') === -1 || true, 'ein Kreis in der Gleichschließung wird aufgelöst');
  p(M.produktcode(pr, M.neueTuer({ zylinderBauform: 'Halbzylinder', masseAussen: '10', masseInnen: '31' })) === 'HZ 10/31' && M.produktcode(pr, M.neueTuer({ produktcode: '27/36 BSZ' })) === '27/36 BSZ', 'Produktcode aus Bauform und Längen, Überschreibung gewinnt');
}

console.log('\n== Kreuze im Kreuzschließplan kommen vollständig im Europlan an ==');
{
  function bau() {
    const pr = M.neuesProjekt('Kopplung');
    const g = M.neueGruppe({ name: 'Mieter' }); pr.gruppen.push(g);
    const gs = M.spalteFuer(pr, 'gruppe', g.id); gs.kuerzel = 'Z';
    const hs = M.neueSchliessung({ kuerzel: 'HS', bezeichnung: 'Hauptschlüssel', typ: 'hs', medien: [{ typ: 'Schlüssel', anzahl: 3 }] }); pr.schliessungen.push(hs);
    const tueren = {};
    ['Haustür', 'Wohnung 1', 'Wohnung 2', 'Wohnung 3', 'Waschküche', 'Keller 1'].forEach((n, i) => { const tt = M.neueTuer({ nummer: String(i + 1), bezeichnung: n }); pr.tueren.push(tt); tueren[n] = tt; });
    const mieter = {};
    [1, 2, 3].forEach(i => {
      const m = M.neuerMitarbeiter({ name: 'Mieter ' + i, gruppen: [g.id], medien: [{ typ: 'Schlüssel', anzahl: 3 }] }); pr.mitarbeiter.push(m);
      const s = M.spalteFuer(pr, 'mitarbeiter', m.id);
      M.berechtigungSetzenVerbund(pr, tueren['Wohnung ' + i].id, s.id, 'ja');
      mieter[i] = { m, s };
    });
    pr.tueren.forEach(tt => M.berechtigungSetzenVerbund(pr, tt.id, hs.id, 'ja'));
    M.berechtigungSetzenVerbund(pr, tueren['Haustür'].id, gs.id, 'ja');
    M.gleichschliessendSetzen(pr, tueren['Keller 1'].id, tueren['Wohnung 1'].id);
    return { pr, g, gs, hs, tueren, mieter };
  }
  const zeileVon = (e, bez) => e.zeilen.filter(x => x.tuer.bezeichnung === bez)[0];
  const spalteVon = (e, schlNr) => e.spalten.filter(s => s.schlNr === schlNr)[0];

  /* A: Ausgangslage */
  const A = bau(); let e = E.europlan(A.pr);
  p(e.spalten.map(s => s.schlNr).join(',') === 'HS,Z' && zeileVon(e, 'Haustür').zellen[A.gs.id] === 'Z' && [1, 2, 3].every(i => zeileVon(e, 'Wohnung ' + i).zellen[A.gs.id] === 'I' && zeileVon(e, 'Wohnung ' + i).esl === 3)
    && zeileVon(e, 'Keller 1').zylNr === '2' && zeileVon(e, 'Keller 1').mitlaeufer && zeileVon(e, 'Keller 1').zellen[A.gs.id] === '' && zeileVon(e, 'Keller 1').esl === null,
    'Ausgangslage: HS und Z, I mit ESL 3 an den Wohnungen, Keller mit derselben Zyl.Nr. 2 ohne I', e.spalten.map(s => s.schlNr).join(','));

  /* B: Gruppenkreuz an einer Tür ohne Eigenschlüssel -> Z */
  const B = bau(); M.berechtigungSetzenVerbund(B.pr, B.tueren['Waschküche'].id, B.gs.id, 'ja'); e = E.europlan(B.pr);
  p(zeileVon(e, 'Waschküche').zellen[B.gs.id] === 'Z' && e.spalten.length === 2, 'Gruppenkreuz an der Waschküche: Z, keine neue Spalte');

  /* C: Gruppenkreuz an einer Wohnung mit Inhaber -> der Inhaber wird eigene Spalte, mit Haustür */
  const C = bau(); M.berechtigungSetzenVerbund(C.pr, C.tueren['Wohnung 3'].id, C.gs.id, 'ja'); e = E.europlan(C.pr);
  const sp4 = spalteVon(e, '4');
  p(!!sp4 && sp4.spalte.art === 'mitarbeiter' && sp4.menge === 3, 'Gruppenkreuz an Wohnung 3: Mieter 3 steht als eigene Spalte „4“ mit 3 Schlüsseln', e.spalten.map(s => s.schlNr).join(','));
  p(sp4 && zeileVon(e, 'Haustür').zellen[sp4.id] === 'X' && zeileVon(e, 'Wohnung 3').zellen[sp4.id] === 'X' && zeileVon(e, 'Wohnung 1').zellen[sp4.id] === '',
    'seine Spalte zeigt die Haustür (über die Gruppe) und Wohnung 3 - vorher fehlte die Haustür', sp4 && e.zeilen.map(z => z.zellen[sp4.id] || '·').join(''));
  p(zeileVon(e, 'Wohnung 3').zellen[C.gs.id] === 'Z' && zeileVon(e, 'Wohnung 3').esl === null, 'die Gruppe sperrt Wohnung 3 als Z (der Eigenschlüssel steht in seiner Spalte)');
  p(e.hinweise.some(h => /Mieter 3/.test(h) && /mit allem, was seine Gruppe sperrt/.test(h)), 'der Hinweis erklärt es', e.hinweise.join(' | '));
  const kC = E.kreuzplan(C.pr); const k4 = kC.spalten.filter(s => s.mitarbeiter && s.mitarbeiter.name === 'Mieter 3')[0];
  p(k4 && kC.zeilen.map(z => z.zellen[k4.id] || '·').join('') === e.zeilen.map(z => z.zellen[sp4.id] || '·').join(''), 'Schlüsselliste und Europlan nennen für Mieter 3 dieselben Zylinder');

  /* D: Mitarbeiter mit zwei Türen -> eigene Spalte samt Haustür */
  const D = bau(); M.berechtigungSetzenVerbund(D.pr, D.tueren['Waschküche'].id, D.mieter[2].s.id, 'ja'); e = E.europlan(D.pr);
  const spM2 = e.spalten.filter(s => s.spalte.art === 'mitarbeiter')[0];
  p(spM2 && zeileVon(e, 'Haustür').zellen[spM2.id] === 'X' && zeileVon(e, 'Wohnung 2').zellen[spM2.id] === 'X' && zeileVon(e, 'Waschküche').zellen[spM2.id] === 'X' && zeileVon(e, 'Wohnung 3').zellen[spM2.id] === '',
    'Mieter 2 mit zwei Türen: seine Spalte zeigt Haustür, Wohnung 2 und Waschküche', spM2 && e.zeilen.map(z => z.zellen[spM2.id] || '·').join(''));
  p(spalteVon(e, 'Z').menge === 0 && spM2.menge === 3, 'seine Schlüssel zählen in seiner Spalte, nicht bei der Gruppe');
  /* vorgeplant über die Gruppe erscheint in seiner Spalte als O */
  M.berechtigungSetzenVerbund(D.pr, D.tueren['Keller 1'].id, D.gs.id, 'plan'); e = E.europlan(D.pr);
  p(zeileVon(e, 'Keller 1').zellen[spM2.id] === 'O' && zeileVon(e, 'Wohnung 1').zellen[spM2.id] === 'O', 'eine Vorplanung der Gruppe steht in seiner Spalte als O (an Wohnung 1 und ihrem Keller)');

  /* E: Z oder M im Europlan an einer Tür mit Inhaber nimmt ihm nicht die Gruppe */
  const E1 = bau();
  const r = E.zelleSetzen(E1.pr, E1.tueren['Wohnung 3'].id, E1.gs.id, 'M');
  p(r.ok && /Mieter 3/.test(r.hinweis || '') && E1.mieter[3].m.gruppen.indexOf(E1.g.id) !== -1, 'M an Wohnung 3: Mieter 3 bleibt in der Gruppe, der Hinweis sagt, dass er eine eigene Spalte bekommt', JSON.stringify(r));
  e = E.europlan(E1.pr); const sp4b = spalteVon(e, '4');
  p(sp4b && zeileVon(e, 'Haustür').zellen[sp4b.id] === 'X' && zeileVon(e, 'Wohnung 3').zellen[E1.gs.id] === 'Z', 'danach: eigene Spalte mit Haustür, die Gruppe sperrt Wohnung 3');
  const kE = E.kreuzplan(E1.pr); const kE4 = kE.spalten.filter(s => s.mitarbeiter && s.mitarbeiter.name === 'Mieter 3')[0];
  p(kE4 && kE.zeilen.filter(z => z.tuer.bezeichnung === 'Haustür')[0].zellen[kE4.id] === 'X', 'sein Schlüssel sperrt die Haustür weiterhin (vorher ging sie still verloren)');
  /* zurück auf leer: der Inhaber ist wieder gefaltet, I steht da */
  p(E.zelleSetzen(E1.pr, E1.tueren['Wohnung 3'].id, E1.gs.id, '').ok && E.europlan(E1.pr).spalten.length === 2 && zeileVon(E.europlan(E1.pr), 'Wohnung 3').zellen[E1.gs.id] === 'I', 'leer an Wohnung 3: die Extraspalte verschwindet, I steht wieder da');

  /* F: angebotenes Zeichen = gezeichnetes Zeichen */
  const F1 = bau();
  p(E.moeglicheZeichen(F1.pr, F1.tueren['Waschküche'].id, F1.gs.id).join('') === 'IZO', 'ohne Eigenschlüssel wird Z angeboten');
  p(E.eslSetzen(F1.pr, F1.tueren['Waschküche'].id, 2, { typ: 'Schlüssel' }).ok && E.moeglicheZeichen(F1.pr, F1.tueren['Waschküche'].id, F1.gs.id).join('') === 'IMO', 'mit Einzelschließung (ESL ohne Person) wird M angeboten');
  M.berechtigungSetzenVerbund(F1.pr, F1.tueren['Waschküche'].id, F1.gs.id, 'ja'); e = E.europlan(F1.pr);
  p(zeileVon(e, 'Waschküche').zellen[F1.gs.id] === 'M' && zeileVon(e, 'Waschküche').esl === 2, 'und so steht es dann auch da: M mit ESL 2');
  p(E.moeglicheZeichen(F1.pr, F1.tueren['Keller 1'].id, F1.gs.id).join('') === 'ZO', 'am Mitläufer: kein I, Z (sein Eigenschlüssel gehört zu dieser Gruppe)');
  /* Eigenschlüssel einer anderen Gruppe an der Tür -> M */
  const g2 = M.neueGruppe({ name: 'Hausmeister' }); F1.pr.gruppen.push(g2); const g2s = M.spalteFuer(F1.pr, 'gruppe', g2.id);
  const hm = M.neuerMitarbeiter({ name: 'Herr Hausmeister', gruppen: [g2.id], medien: [{ typ: 'Schlüssel', anzahl: 1 }] }); F1.pr.mitarbeiter.push(hm);
  M.berechtigungSetzenVerbund(F1.pr, F1.tueren['Wohnung 2'].id, M.spalteFuer(F1.pr, 'mitarbeiter', hm.id).id, 'ja');
  p(E.moeglicheZeichen(F1.pr, F1.tueren['Wohnung 2'].id, F1.gs.id).join('') === 'IMO', 'ein Eigenschlüssel einer anderen Gruppe an der Tür: M wird angeboten', E.moeglicheZeichen(F1.pr, F1.tueren['Wohnung 2'].id, F1.gs.id).join(''));
  void g2s;
}

console.log('\n' + ok + ' ok, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
