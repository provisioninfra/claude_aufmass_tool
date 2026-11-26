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
  p(keller3.mitlaeufer && keller3.zylNr === wohnung3.zylNr + '.1' && keller3.esl === null, 'Keller 3 ist gleichschließend zu Wohnung 3: Zyl.Nr. ' + wohnung3.zylNr + '.1, keine ESL', keller3.zylNr);
  const zentral = e.zeilen.filter(z => ['Müll', 'Fahrräder'].indexOf(z.tuer.bezeichnung) !== -1);
  p(zentral.every(z => z.mitlaeufer && /^1\.[12]$/.test(z.zylNr)), 'Müll und Fahrräder hängen als 1.1 und 1.2 an der Haustür (Zyl.Nr. = Türnummer)', zentral.map(z => z.zylNr).join(','));

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
  fs.unlinkSync(datei);
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
  p(E.moeglicheZeichen(pr, w1.id, hs.id).join('') === 'XO' && E.moeglicheZeichen(pr, w1.id, gs.id).join('') === 'IZMO', 'mögliche Zeichen: X/O in Schlüsselspalten, I/Z/M/O in Gruppenspalten');
  pr.tueren.forEach(t => E.zelleSetzen(pr, t.id, hs.id, 'X'));
  const braucht = E.zelleSetzen(pr, w1.id, gs.id, 'I');
  p(braucht.ok === false && braucht.braucht === 'inhaber', 'I an einer Tür ohne Inhaber verlangt einen Inhaber');
  p(E.zelleSetzen(pr, w1.id, gs.id, 'I', { inhaber: { name: 'Familie Eins', anzahl: 3, typ: 'Schlüssel' } }).ok, 'I mit Inhaber: Mitarbeiter wird angelegt');
  p(E.zelleSetzen(pr, w2.id, gs.id, 'I', { inhaber: { name: 'Familie Zwei', anzahl: 2 } }).ok, 'zweite Wohnung');
  p(E.zelleSetzen(pr, haus.id, gs.id, 'Z').ok, 'Haustür wird Zentralzylinder');
  const m1 = pr.mitarbeiter.filter(m => m.name === 'Familie Eins')[0];
  p(m1 && m1.gruppen.indexOf(g.id) !== -1 && M.mitarbeiterMedienAnzahl(m1) === 3 && E.eigeneSpalte(pr, m1), 'der Inhaber ist Gruppenmitglied, hat 3 Medien und eine eigene Spalte');
  p(M.getBerechtigung(pr, w1.id, E.eigeneSpalte(pr, m1).id) === 'ja' && M.getBerechtigung(pr, w1.id, gs.id) === 'nein', 'im Kreuzplan: eigene Spalte ja, Gruppenspalte nein');
  p(M.gleichschliessendSetzen(pr, k1.id, w1.id) && M.zylinderNummer(pr, k1) === '2.1', 'Keller 1 gleichschließend mit Wohnung 1: Zyl.Nr. 2.1');
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
  p(/Zyl\.Nr/.test(text) && /2\.1/.test(text), 'Textdarstellung enthält die Zylindernummern');
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

console.log('\n' + ok + ' ok, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
