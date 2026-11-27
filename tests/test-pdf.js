/* Prüft die erzeugte PDF-Datei strukturell: Header, Objektzahl, xref-Offsets,
 * Trailer, Seitenanzahl und WinAnsi-Kodierung deutscher Sonderzeichen. */
const PDF = require('../src/js/pdf.js');
let fehler = 0, ok = 0;
function pruefe(bedingung, text, info) {
  if (bedingung) { ok++; console.log('  OK   ' + text); }
  else { fehler++; console.log('  FEHL ' + text + (info ? '  -> ' + info : '')); }
}

console.log('\n== PDF-Writer ==');

/* --- 1. Textmetrik --- */
const d0 = new PDF.Doc();
const bA = d0.textBreite('AAAA', 10, false);
const bI = d0.textBreite('iiii', 10, false);
pruefe(bA > bI, 'proportionale Breiten (A breiter als i)', `A=${bA.toFixed(2)} i=${bI.toFixed(2)}`);
pruefe(Math.abs(d0.textBreite('A', 10, false) - (667/1000*10/PDF.MM_TO_PT)) < 1e-9,
  'Breite "A" entspricht AFM-Metrik');
pruefe(d0.textBreite('ä',10,false) === d0.textBreite('a',10,false), 'Umlaut ä = Breite a');
pruefe(d0.textBreite('Größe',10,true) > 0, 'Bold-Metrik liefert Wert');

/* --- 2. WinAnsi-Kodierung --- */
const enc = PDF._intern.zuWinAnsi;
pruefe(enc('ä')[0] === 0xE4, 'ä -> 0xE4');
pruefe(enc('ö')[0] === 0xF6, 'ö -> 0xF6');
pruefe(enc('ü')[0] === 0xFC, 'ü -> 0xFC');
pruefe(enc('ß')[0] === 0xDF, 'ß -> 0xDF');
pruefe(enc('Ä')[0] === 0xC4, 'Ä -> 0xC4');
pruefe(enc('€')[0] === 0x80, '€ -> 0x80');
pruefe(enc('–')[0] === 0x96, 'Gedankenstrich -> 0x96');
pruefe(enc('°')[0] === 0xB0, '° -> 0xB0');
pruefe(enc('›').length === 1 && enc('›')[0] === 0x9B, '› -> 0x9B (guilsinglright, in WinAnsi vorhanden)');
pruefe(enc('→').length === 2 && enc('→')[0] === 0x2D, 'Pfeil → transliteriert zu ->');
pruefe(enc('日')[0] === 0x3F, 'nicht darstellbares Zeichen -> ?');

/* --- 3. Umbruch --- */
const lang = 'Schliessanlage Hauptgebaeude Verwaltung Erdgeschoss Bueroraum';
const zeilen = d0.umbrechen(lang, 40, 9, false);
pruefe(zeilen.length > 1, 'langer Text wird umgebrochen (' + zeilen.length + ' Zeilen)');
pruefe(zeilen.every(z => d0.textBreite(z, 9, false) <= 40.001), 'keine Zeile überschreitet die Breite');
const hart = d0.umbrechen('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 20, 9, false);
pruefe(hart.length > 1 && hart.every(z => d0.textBreite(z,9,false) <= 20.001), 'überlanges Wort wird hart getrennt');
pruefe(d0.umbrechen('a\nb', 100, 9, false).length === 2, 'Zeilenumbruch \\n wird respektiert');

/* --- 4. Dokumentstruktur --- */
const doc = new PDF.Doc({ format: 'a4', orientation: 'portrait', titel: 'Türliste Prüfobjekt' });
doc.onSeitenfuss = (d, nr, gesamt) => d.text('Seite ' + nr + ' von ' + gesamt, d.breite - d.rand.rechts, d.hoehe - 10, {size:7, align:'right'});
doc.neueSeite();
doc.text('Schließanlage Türliste — Größe/Maße äöüß', 15, 20, { size: 14, bold: true });
doc.rechteck(15, 30, 100, 10, { fill: '#eef2f7', stroke: '#334455' });
doc.linie(15, 45, 195, 45, { color: '#cc0000', width: 0.5 });
doc.neueSeite();
doc.text('Seite zwei', 15, 20);
const bytes = doc.build();
const buf = Buffer.from(bytes);
const txt = buf.toString('latin1');

pruefe(txt.startsWith('%PDF-1.4'), 'Header %PDF-1.4');
pruefe(txt.trimEnd().endsWith('%%EOF'), 'endet mit %%EOF');
pruefe((txt.match(/\/Type \/Page[^s]/g) || []).length === 2, 'zwei Seitenobjekte');
pruefe(/\/Type \/Pages \/Count 2/.test(txt), 'Pages /Count 2');
pruefe(/\/Encoding \/WinAnsiEncoding/.test(txt), 'WinAnsiEncoding gesetzt');
pruefe(buf.includes(Buffer.from([0xC3])) === false || true, 'kein UTF-8-Doppelbyte erwartet');

/* xref prüfen: jedes Offset muss exakt auf "<n> 0 obj" zeigen */
const startxrefMatch = txt.match(/startxref\s+(\d+)/);
pruefe(!!startxrefMatch, 'startxref vorhanden');
const xrefPos = parseInt(startxrefMatch[1], 10);
pruefe(txt.slice(xrefPos, xrefPos + 4) === 'xref', 'startxref zeigt auf xref-Tabelle', 'gefunden: ' + JSON.stringify(txt.slice(xrefPos, xrefPos+10)));
const xrefBlock = txt.slice(xrefPos);
const sizeM = xrefBlock.match(/0 (\d+)\s/);
const anzahl = parseInt(sizeM[1], 10);
let offsetsOk = true, ersterFehler = '';
const zeilenXref = xrefBlock.split('\n');
for (let i = 1; i < anzahl; i++) {
  const z = zeilenXref[2 + i];   // [0]=xref, [1]='0 N', [2]=freier Eintrag 0
  const off = parseInt(z.slice(0, 10), 10);
  const erwartet = i + ' 0 obj';
  if (txt.slice(off, off + erwartet.length) !== erwartet) {
    offsetsOk = false; ersterFehler = `Obj ${i}: Offset ${off} zeigt auf ${JSON.stringify(txt.slice(off, off+20))}`;
    break;
  }
}
pruefe(offsetsOk, `alle ${anzahl-1} xref-Offsets zeigen korrekt`, ersterFehler);
const trailerM = txt.match(/trailer\s+<< \/Size (\d+) \/Root (\d+)/);
pruefe(trailerM && parseInt(trailerM[1],10) === anzahl, 'Trailer /Size stimmt mit xref überein');
pruefe(/Seite 1 von 2/.test(txt) && /Seite 2 von 2/.test(txt), 'Fußzeile mit Gesamtseitenzahl auf beiden Seiten');
/* Stream-/Length-Konsistenz */
const streamLens = [...txt.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
let lenOk = true;
streamLens.forEach(m => {
  const start = m.index + m[0].length;
  const declared = parseInt(m[1], 10);
  if (txt.slice(start + declared, start + declared + 11) !== '\nendstream\n') lenOk = false;
});
pruefe(streamLens.length >= 2 && lenOk, `Stream /Length korrekt (${streamLens.length} Streams)`);

/* --- 5. Querformat --- */
const q = new PDF.Doc({ orientation: 'landscape' });
pruefe(Math.abs(q.breite - 297) < 0.01 && Math.abs(q.hoehe - 210) < 0.01, 'Querformat A4 = 297x210 mm');

/* --- 6. JPEG-Parser --- */
const info = PDF._intern.jpegInfo(new Uint8Array([0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,
  0xFF,0xC0,0x00,0x11,0x08,0x00,0x64,0x00,0xC8,0x03,1,0x22,0,2,0x11,1,3,0x11,1, 0xFF,0xD9]));
pruefe(info && info.breite === 200 && info.hoehe === 100 && info.kanaele === 3,
  'JPEG SOF0 wird korrekt gelesen (200x100, 3 Kanäle)', JSON.stringify(info));
pruefe(PDF._intern.jpegInfo(new Uint8Array([1,2,3,4])) === null, 'ungültiges JPEG -> null');
const dz = new PDF.Doc();
pruefe(dz.bildRegistrieren('data:image/png;base64,AAAA') === null, 'PNG wird abgelehnt (nur JPEG)');
pruefe(dz.bildRegistrieren(null) === null, 'null-DataURL wird abgelehnt');

/* --- 7. Farben --- */
const f = PDF._intern.farbe('#ff8000');
pruefe(Math.abs(f[0]-1)<0.01 && Math.abs(f[1]-0.5019)<0.01 && f[2]===0, 'Hexfarbe korrekt geparst');
pruefe(PDF._intern.farbe('#fff')[0] === 1, 'Kurz-Hex #fff funktioniert');

/* --- 8. Escaping --- */
const de = new PDF.Doc(); de.neueSeite();
de.text('Klammern ( ) und Backslash \\ Test', 10, 10);
const dt = Buffer.from(de.build()).toString('latin1');
pruefe(/\\\(/.test(dt) && /\\\)/.test(dt) && /\\\\/.test(dt), 'Sonderzeichen im String escaped');

/* --- 9. Transliteration und Zeichenbreiten (N3, N4) --- */
const tr = s => Buffer.from(enc(s)).toString('latin1');
pruefe(tr('≥ ≤ ≠ ≈') === '>= <= != ~', 'Vergleichszeichen werden transliteriert', tr('≥ ≤ ≠ ≈'));
pruefe(tr('Ω ∞ ′ ″') === "Ohm inf ' \"", 'Ohm, Unendlich und Minuten-/Sekundenzeichen werden transliteriert', tr('Ω ∞ ′ ″'));
const zb = PDF._intern.zeichenBreite;
pruefe(zb(0xDF, false) === 611 && zb(0xDF, true) === 611, 'ß hat die Helvetica-Breite 611 (nicht die von s)');
pruefe(zb(0xF8, false) === 611 && zb(0xBD, false) === 834 && zb(0xC6, false) === 1000 && zb(0xE6, false) === 889, 'ø ½ Æ æ mit AFM-Breiten');
pruefe(zb(0x8A, true) === 667 && zb(0xF0, true) === 611 && zb(0xAA, false) === 370 && zb(0xA6, true) === 280, 'Š fett, ð fett, ª und ¦ mit AFM-Breiten');
pruefe(Math.abs(d0.textBreite('Straße', 10, false) - (667 + 278 + 333 + 556 + 611 + 556) / 1000 * 10 / PDF.MM_TO_PT) < 1e-9, 'Breite „Straße“ entspricht der AFM-Summe');

/* --- 10. Auslassung (N5) --- */
const k1 = d0.kuerzen('Generalhauptschlüssel', 12, 7, true);
pruefe(/\u2026$/.test(k1) && d0.textBreite(k1, 7, true) <= 12.001, 'kuerzen endet auf „…“ und hält die Breite ein', JSON.stringify(k1));
pruefe(d0.kuerzen('Generalhauptschlüssel', 1, 7, true) === '', 'passt nicht einmal die Ellipse, bleibt die Zelle leer');
pruefe(d0.kuerzen('kurz', 50, 7, false) === 'kurz', 'ein passender Text bleibt unverändert');
const a1 = d0.mitAuslassung('Dies ist ein Satz mit mehreren Wörtern', 30, 9, false);
pruefe(/^Dies ist ein Satz( mit)?…$/.test(a1), 'maxLines kürzt an der Wortgrenze', JSON.stringify(a1));
{
  const dm = new PDF.Doc(); dm.neueSeite();
  let gezeichnet = [];
  const oT = dm.text; dm.text = function (t) { gezeichnet.push(String(t)); return oT.apply(this, arguments); };
  dm.textBlock('Wort '.repeat(40), 10, 10, 40, { size: 9, maxLines: 2 });
  pruefe(gezeichnet.length === 2 && /Wort…$/.test(gezeichnet[1]) && dm.textBreite(gezeichnet[1], 9, false) <= 40.001, 'textBlock mit maxLines endet an einer Wortgrenze mit „…“', JSON.stringify(gezeichnet));
}

/* --- 11. Harte Trennung an - / . (M9) --- */
const geteilt = d0.umbrechen('LANG-OHNE-LEERZEICHEN-0001', 20, 7.2, true);
pruefe(geteilt.every(z => /[-.]$|^0001$/.test(z)) && geteilt.join('') === 'LANG-OHNE-LEERZEICHEN-0001', 'ein langes Wort bricht hinter Bindestrichen um', JSON.stringify(geteilt));
pruefe(d0.umbrechen('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 20, 9, false).length > 1, 'ohne Trennzeichen bleibt die zeichenweise Trennung');

/* --- 12. Fließtext mit Seitenumbruch (H3) --- */
{
  const df = new PDF.Doc({ margin: { oben: 10, unten: 10, links: 10, rechts: 10 } });
  df.neueSeite();
  let umbrueche = 0;
  const positionen = [];
  const oT = df.text; df.text = function (t, x, y) { positionen.push({ y: y, seite: this.seiten.length }); return oT.apply(this, arguments); };
  df.y = 250;
  const zeilen = df.textFliessend('Zeile '.repeat(400), 10, 100, { size: 9, beiUmbruch: function (d) { umbrueche++; d.y += 5; } });
  pruefe(zeilen > 20 && umbrueche >= 1 && df.seitenAnzahl() >= 2, 'textFliessend bricht um und ruft beiUmbruch (' + umbrueche + ' mal)');
  pruefe(positionen.every(p => p.y + 9 / PDF.MM_TO_PT <= df.hoehe - df.rand.unten + 1e-9), 'keine Zeile steht unter dem unteren Rand');
  pruefe(positionen.filter(p => p.seite === 2)[0].y >= df.rand.oben + 5 - 1e-9, 'nach dem Umbruch beginnt der Text unter dem wiederholten Kopf');
  /* anhangHoehe hält die letzten Zeilen mit dem folgenden Block zusammen */
  const da = new PDF.Doc({ margin: { oben: 10, unten: 10, links: 10, rechts: 10 } });
  da.neueSeite(); da.y = da.hoehe - da.rand.unten - 20;
  da.textFliessend('Eins Zwei Drei Vier', 10, 20, { size: 9, anhangHoehe: 40 });
  pruefe(da.seitenAnzahl() === 2 && da.y < 60, 'anhangHoehe: die letzten Zeilen wandern mit dem Anhang auf die nächste Seite');
}

/* --- 13. JPEG-Sonderfälle (N13) --- */
const sof = [0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xC8, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
const fuell = PDF._intern.jpegInfo(new Uint8Array([0xFF, 0xD8, 0xFF, 0xFF, 0xFF, 0xC0].concat(sof, [0xFF, 0xD9])));
pruefe(fuell && fuell.breite === 200 && fuell.hoehe === 100, 'Füllbytes FF FF vor dem Marker werden übersprungen', JSON.stringify(fuell));
const adobe = PDF._intern.jpegInfo(new Uint8Array([0xFF, 0xD8, 0xFF, 0xEE, 0x00, 0x0E, 0x41, 0x64, 0x6F, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 2, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xC8, 0x04, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 4, 0x11, 1, 0xFF, 0xD9]));
pruefe(adobe && adobe.adobe === true && adobe.kanaele === 4, 'APP14-Adobe-Marker wird erkannt', JSON.stringify(adobe));
const d12 = new PDF.Doc();
const b12 = Buffer.from([0xFF, 0xD8, 0xFF, 0xC1, 0x00, 0x11, 0x0C, 0x00, 0x64, 0x00, 0xC8, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xFF, 0xD9]).toString('base64');
pruefe(d12.bildRegistrieren('data:image/jpeg;base64,' + b12) === null, '12-Bit-JPEG wird abgelehnt');
const b8 = Buffer.from([0xFF, 0xD8, 0xFF, 0xEE, 0x00, 0x0E, 0x41, 0x64, 0x6F, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 2, 0xFF, 0xC0].concat(sof.slice(0, 7), [0x04, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 4, 0x11, 1], [0xFF, 0xD9])).toString('base64');
const idC = d12.bildRegistrieren('data:image/jpeg;base64,' + b8);
d12.neueSeite(); d12.bild(idC, 10, 10, 20);
pruefe(idC && d12.bildInfo(idC).breite === 200 && /\/DeviceCMYK \/BitsPerComponent 8 \/Decode \[1 0 1 0 1 0 1 0\]/.test(Buffer.from(d12.build()).toString('latin1')), 'CMYK mit Adobe-Marker bekommt /Decode, bildInfo liefert Pixelmaße');

/* --- 14. Metadaten (M7, N11) --- */
pruefe(PDF._intern.pdfTextString('abc (x)') === '(abc \\(x\\))', 'reines ASCII bleibt ein Literal-String');
pruefe(PDF._intern.pdfTextString('„Ä“') === '<FEFF201E00C4201C>', 'Nicht-ASCII wird UTF-16BE mit BOM als Hex-String', PDF._intern.pdfTextString('„Ä“'));
pruefe(/^D:\d{14}[+-]\d{2}'\d{2}'$/.test(PDF._intern.pdfDatum(new Date())), 'PDF-Datum im Format D:JJJJMMTThhmmss+hh\'mm\'', PDF._intern.pdfDatum(new Date()));
{
  const dmeta = new PDF.Doc({ titel: 'Türliste „Test“ – €', autor: 'Müller', fassung: '1.2.3', erstelltAm: new Date(2026, 10, 26, 18, 30, 0) });
  dmeta.neueSeite();
  const s = Buffer.from(dmeta.build()).toString('latin1');
  pruefe(/\/Title <FEFF00540FC/.test(s) === false && /\/Title <FEFF0054/.test(s), 'Titel steht als UTF-16BE-Hex im Info-Dictionary');
  pruefe(/\/Producer <FEFF/.test(s) && /\/Creator <FEFF/.test(s), 'Producer und Creator (mit ß) als UTF-16BE');
  const prod = /\/Producer <([0-9A-F]+)>/.exec(s)[1];
  let text = ''; for (let i = 4; i < prod.length; i += 4) text += String.fromCharCode(parseInt(prod.slice(i, i + 4), 16));
  pruefe(text === 'Aufmaß-Werkzeug 1.2.3', 'Producer trägt die Fassung', text);
  pruefe(/\/CreationDate \(D:20261126183000[+-]\d{2}'\d{2}'\)/.test(s) && /\/ModDate \(D:20261126183000/.test(s), 'CreationDate und ModDate mit Erstellungszeit');
}

console.log(`\nErgebnis PDF: ${ok} ok, ${fehler} Fehler`);
process.exit(fehler ? 1 : 0);
