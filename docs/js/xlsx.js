/* =============================================================================
 * xlsx.js — Ein kleiner Schreiber für Excel-Arbeitsmappen (.xlsx)
 *
 * Ohne Fremdbibliothek, damit es auch in der Einzeldatei und ohne Netz
 * läuft. Eine .xlsx ist ein ZIP mit XML-Dateien; hier wird beides selbst
 * geschrieben: das ZIP ohne Kompression (Methode „store“, mit CRC-32), die
 * Blätter mit eingebetteten Zeichenketten (inlineStr), ein paar Formaten,
 * Spaltenbreiten, Zeilenhöhen, verbundenen Zellen, fixierten Zeilen und
 * Spalten, versteckten Blättern, Namen und Gültigkeitsregeln.
 *
 * Aufruf: XLSX.erzeugen({ blaetter: [{ name, zellen: { A1: { v, s } }, breiten,
 *         hoehen, verbund, fixierung, versteckt, validierungen, druck }], namen,
 *         fassung })
 * liefert ein Uint8Array. Formate (s): fett, kopf, umbruch, fettUmbruch,
 * mitte, muster, senkrecht, senkrechtFett (Text um 90 Grad gedreht, Schrift 8),
 * zahlKlein (Schrift 8, auf Zellbreite verkleinert).
 * druck: { titel: '$A:$G,$1:$4', bereich: '$A$1:$R$20', quer: true,
 *          einpassen: true } setzt Wiederholungszeilen, Druckbereich,
 * Querformat und die Anpassung auf eine Seitenbreite.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* --- ZIP (store) ------------------------------------------------------- */
  var CRC_TABELLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABELLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    var aus = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) aus.push(c);
      else if (c < 0x800) aus.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xD800 && c < 0xDC00 && i + 1 < text.length) {
        var d = text.charCodeAt(++i), cp = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00);
        aus.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else aus.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(aus);
  }
  function le16(n) { return [n & 255, (n >> 8) & 255]; }
  function le32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]; }
  function dosZeit() {
    var d = new Date();
    var zeit = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var datum = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { zeit: zeit, datum: datum };
  }
  function zip(dateien) {
    var teile = [], zentral = [], versatz = 0, dz = dosZeit();
    dateien.forEach(function (f) {
      var name = utf8(f.name), inhalt = typeof f.inhalt === 'string' ? utf8(f.inhalt) : f.inhalt;
      var crc = crc32(inhalt);
      var kopf = [].concat([0x50, 0x4B, 3, 4], le16(20), le16(0x0800), le16(0), le16(dz.zeit), le16(dz.datum),
        le32(crc), le32(inhalt.length), le32(inhalt.length), le16(name.length), le16(0));
      teile.push(new Uint8Array(kopf), name, inhalt);
      zentral.push([[].concat([0x50, 0x4B, 1, 2], le16(20), le16(20), le16(0x0800), le16(0), le16(dz.zeit), le16(dz.datum),
        le32(crc), le32(inhalt.length), le32(inhalt.length), le16(name.length), le16(0), le16(0), le16(0), le16(0),
        le32(0), le32(versatz)), name]);
      versatz += kopf.length + name.length + inhalt.length;
    });
    var zentralStart = versatz, zentralLaenge = 0;
    zentral.forEach(function (e) { var k = new Uint8Array(e[0]); teile.push(k, e[1]); zentralLaenge += k.length + e[1].length; });
    teile.push(new Uint8Array([].concat([0x50, 0x4B, 5, 6], le16(0), le16(0), le16(dateien.length), le16(dateien.length),
      le32(zentralLaenge), le32(zentralStart), le16(0))));
    var gesamt = teile.reduce(function (n, t) { return n + t.length; }, 0);
    var aus = new Uint8Array(gesamt), pos = 0;
    teile.forEach(function (t) { aus.set(t, pos); pos += t.length; });
    return aus;
  }

  /* --- XML-Helfer ---------------------------------------------------------- */
  function x(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  /* In Attributen würde ein Zeilenumbruch zum Leerzeichen normalisiert */
  function xa(text) { return x(text).replace(/\n/g, '&#10;').replace(/\r/g, ''); }
  var FORMATE = ['standard', 'fett', 'kopf', 'umbruch', 'fettUmbruch', 'mitte', 'muster', 'senkrecht', 'senkrechtFett', 'zahlKlein'];
  /* Blattname in einer Formel: in Hochkommas, ein Hochkomma im Namen verdoppelt */
  function blattRef(name) { return "'" + String(name).replace(/'/g, "''") + "'!"; }
  function formatIndex(name) { var i = FORMATE.indexOf(name || 'standard'); return i < 0 ? 0 : i; }
  function spaltenIndex(ref) {
    var m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) return null;
    var n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return { spalte: n, zeile: parseInt(m[2], 10), buchstaben: m[1] };
  }
  function spaltenName(n) { var s = ''; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

  function blattXml(blatt) {
    var zeilen = {};
    var maxSpalte = 1, maxZeile = 1;
    Object.keys(blatt.zellen || {}).forEach(function (ref) {
      var si = spaltenIndex(ref); if (!si) return;
      var z = blatt.zellen[ref]; if (z === null || z === undefined) return;
      (zeilen[si.zeile] = zeilen[si.zeile] || []).push({ ref: ref, spalte: si.spalte, zelle: typeof z === 'object' ? z : { v: z } });
      if (si.spalte > maxSpalte) maxSpalte = si.spalte;
      if (si.zeile > maxZeile) maxZeile = si.zeile;
    });
    var druck = blatt.druck || null;
    var aus = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
    /* Die Seitenanpassung muss vor allem anderen stehen (Reihenfolge im Schema) */
    if (druck && druck.einpassen) aus.push('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    aus.push('<dimension ref="A1:' + spaltenName(maxSpalte) + maxZeile + '"/>');
    var fix = blatt.fixierung;
    aus.push('<sheetViews><sheetView workbookViewId="0"' + (blatt.erste ? ' tabSelected="1"' : '') + '>');
    if (fix && (fix.spalten || fix.zeilen)) {
      var ziel = spaltenName((fix.spalten || 0) + 1) + ((fix.zeilen || 0) + 1);
      aus.push('<pane' + (fix.spalten ? ' xSplit="' + fix.spalten + '"' : '') + (fix.zeilen ? ' ySplit="' + fix.zeilen + '"' : '') +
        ' topLeftCell="' + ziel + '" activePane="bottomRight" state="frozen"/>');
      aus.push('<selection pane="bottomRight" activeCell="' + ziel + '" sqref="' + ziel + '"/>');
    }
    aus.push('</sheetView></sheetViews>');
    aus.push('<sheetFormatPr defaultRowHeight="12.75"/>');
    var breiten = blatt.breiten || {};
    var bKeys = Object.keys(breiten).map(function (k) { return { n: spaltenIndex(k + '1').spalte, w: breiten[k] }; }).sort(function (a, b) { return a.n - b.n; });
    if (bKeys.length) {
      aus.push('<cols>');
      bKeys.forEach(function (b) { aus.push('<col min="' + b.n + '" max="' + b.n + '" width="' + (Math.round(b.w * 100) / 100) + '" customWidth="1"/>'); });
      aus.push('</cols>');
    }
    aus.push('<sheetData>');
    var hoehen = blatt.hoehen || {};
    var zeilenNummern = Object.keys(zeilen).map(Number);
    Object.keys(hoehen).forEach(function (h) { if (zeilenNummern.indexOf(Number(h)) === -1) zeilenNummern.push(Number(h)); });
    zeilenNummern.sort(function (a, b) { return a - b; }).forEach(function (nr) {
      var h = hoehen[nr];
      aus.push('<row r="' + nr + '"' + (h ? ' ht="' + h + '" customHeight="1"' : '') + '>');
      (zeilen[nr] || []).sort(function (a, b) { return a.spalte - b.spalte; }).forEach(function (e) {
        var z = e.zelle, s = formatIndex(z.s);
        var attr = ' r="' + e.ref + '"' + (s ? ' s="' + s + '"' : '');
        if (typeof z.v === 'number' && isFinite(z.v)) aus.push('<c' + attr + '><v>' + z.v + '</v></c>');
        else if (z.f) aus.push('<c' + attr + '><f>' + x(z.f) + '</f></c>');
        else if (z.v === null || z.v === undefined || z.v === '') { if (s) aus.push('<c' + attr + '/>'); }
        else aus.push('<c' + attr + ' t="inlineStr"><is><t xml:space="preserve">' + x(z.v) + '</t></is></c>');
      });
      aus.push('</row>');
    });
    aus.push('</sheetData>');
    if (blatt.verbund && blatt.verbund.length) {
      aus.push('<mergeCells count="' + blatt.verbund.length + '">');
      blatt.verbund.forEach(function (v) { aus.push('<mergeCell ref="' + x(v) + '"/>'); });
      aus.push('</mergeCells>');
    }
    if (blatt.validierungen && blatt.validierungen.length) {
      aus.push('<dataValidations count="' + blatt.validierungen.length + '">');
      blatt.validierungen.forEach(function (v) {
        aus.push('<dataValidation type="' + x(v.typ) + '"' + (v.op ? ' operator="' + x(v.op) + '"' : '') + ' allowBlank="1" showInputMessage="1" showErrorMessage="1"' +
          (v.hinweis ? ' prompt="' + xa(v.hinweis) + '"' : '') + (v.fehler ? ' error="' + xa(v.fehler) + '"' : '') + ' sqref="' + x(v.bereich) + '">' +
          (v.f1 !== undefined ? '<formula1>' + x(v.f1) + '</formula1>' : '') + (v.f2 !== undefined ? '<formula2>' + x(v.f2) + '</formula2>' : '') + '</dataValidation>');
      });
      aus.push('</dataValidations>');
    }
    aus.push('<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>');
    /* Druck: A4 (paperSize 9), Querformat, auf eine Seitenbreite einpassen; die Höhe bleibt frei (0) */
    if (druck) {
      aus.push('<pageSetup paperSize="9"' + (druck.quer ? ' orientation="landscape"' : ' orientation="portrait"') +
        (druck.einpassen ? ' fitToWidth="1" fitToHeight="0"' : '') + '/>');
    }
    aus.push('</worksheet>');
    return aus.join('');
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font>' +
    '<font><sz val="8"/><name val="Arial"/></font><font><b/><sz val="8"/><name val="Arial"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFC0C0C0"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFCC99"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="10">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                                                        /* 0 standard */
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                                          /* 1 fett */
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + /* 2 kopf */
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +         /* 3 umbruch */
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' + /* 4 fettUmbruch */
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +  /* 5 mitte */
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' + /* 6 muster */
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="bottom" textRotation="90"/></xf>' + /* 7 senkrecht */
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="bottom" textRotation="90"/></xf>' + /* 8 senkrechtFett */
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" shrinkToFit="1"/></xf>' + /* 9 zahlKlein */
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function erzeugen(mappe) {
    var blaetter = (mappe.blaetter || []).map(function (b, i) { b.erste = i === 0; return b; });
    var dateien = [];
    dateien.push({ name: '[Content_Types].xml', inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      blaetter.map(function (b, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>' });
    dateien.push({ name: '_rels/.rels', inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>' });
    var jetzt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    dateien.push({ name: 'docProps/core.xml', inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + x(mappe.titel || 'Schließplan') + '</dc:title><dc:creator>' + x(mappe.ersteller || 'Aufmaß-Werkzeug') + '</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + jetzt + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + jetzt + '</dcterms:modified>' +
      '</cp:coreProperties>' });
    /* Die Fassung des Werkzeugs steht in app.xml. In Node (Tests, Skripte)
       gibt es AppKern nicht, dann kommt sie aus mappe.fassung oder fehlt. */
    var fassung = mappe.fassung || (global.AppKern && global.AppKern.FASSUNG) || '';
    dateien.push({ name: 'docProps/app.xml', inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>' + x(mappe.ersteller || 'Aufmaß-Werkzeug') + '</Application>' +
      (fassung ? '<AppVersion>' + x(fassung) + '</AppVersion>' : '') + '</Properties>' });
    var wb = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="10000" activeTab="0"/></bookViews><sheets>'];
    blaetter.forEach(function (b, i) {
      wb.push('<sheet name="' + x(b.name || ('Blatt' + (i + 1))) + '" sheetId="' + (i + 1) + '"' + (b.versteckt ? ' state="hidden"' : '') + ' r:id="rId' + (i + 1) + '"/>');
    });
    wb.push('</sheets>');
    var namen = mappe.namen || {};
    var namenKeys = Object.keys(namen);
    /* Druckbereich und Wiederholungszeilen sind Namen je Blatt (localSheetId) */
    var druckNamen = [];
    blaetter.forEach(function (b, i) {
      var d = b.druck; if (!d) return;
      var ref = blattRef(b.name || ('Blatt' + (i + 1)));
      if (d.titel) druckNamen.push('<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">' + x(String(d.titel).split(',').map(function (t) { return ref + t.trim(); }).join(',')) + '</definedName>');
      if (d.bereich) druckNamen.push('<definedName name="_xlnm.Print_Area" localSheetId="' + i + '">' + x(ref + d.bereich) + '</definedName>');
    });
    if (namenKeys.length || druckNamen.length) {
      wb.push('<definedNames>');
      druckNamen.forEach(function (dn) { wb.push(dn); });
      namenKeys.forEach(function (n) { wb.push('<definedName name="' + x(n) + '">' + x(namen[n]) + '</definedName>'); });
      wb.push('</definedNames>');
    }
    wb.push('<calcPr calcId="0"/></workbook>');
    dateien.push({ name: 'xl/workbook.xml', inhalt: wb.join('') });
    dateien.push({ name: 'xl/_rels/workbook.xml.rels', inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      blaetter.map(function (b, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (blaetter.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>' });
    dateien.push({ name: 'xl/styles.xml', inhalt: STYLES });
    blaetter.forEach(function (b, i) { dateien.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', inhalt: blattXml(b) }); });
    return zip(dateien);
  }

  function alsBlob(mappe) {
    var bytes = erzeugen(mappe);
    return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  global.XLSX = { erzeugen: erzeugen, alsBlob: alsBlob, crc32: crc32, spaltenName: spaltenName, MIME: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.XLSX; }
})(typeof window !== 'undefined' ? window : globalThis);
