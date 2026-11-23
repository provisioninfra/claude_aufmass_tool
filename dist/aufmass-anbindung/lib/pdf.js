/* =============================================================================
 * pdf.js — Minimaler, abhängigkeitsfreier PDF-Writer
 *
 * Warum selbstgebaut statt einer CDN-Bibliothek?
 * Die App muss beim Aufmaß vor Ort ohne jede Netzverbindung funktionieren.
 * Eine externe Bibliothek wäre genau dann nicht ladbar, wenn sie gebraucht wird.
 *
 * Unterstützt: Helvetica/Helvetica-Bold/Helvetica-Oblique (Base-14, WinAnsi),
 * Text mit Ausrichtung und Umbruch, Linien, Rechtecke, JPEG-Bilder,
 * Hoch-/Querformat, Seitenwechsel.
 * Koordinatensystem: Ursprung oben links, Einheit Millimeter.
 * ========================================================================== */
(function (global) {
  'use strict';

  var MM_TO_PT = 72 / 25.4;

  /* ---------------------------------------------------------------------------
   * Zeichenbreiten (Adobe AFM, Einheit 1/1000 em).
   * Für ASCII exakt; akzentuierte Latin-1-Zeichen haben in Helvetica dieselbe
   * Breite wie ihr Basisbuchstabe, deshalb die Ableitung über BASIS_MAP.
   * ------------------------------------------------------------------------ */
  var W_REG = {
    32:278,33:278,34:355,35:556,36:556,37:889,38:667,39:222,40:333,41:333,42:389,43:584,
    44:278,45:333,46:278,47:278,48:556,49:556,50:556,51:556,52:556,53:556,54:556,55:556,
    56:556,57:556,58:278,59:278,60:584,61:584,62:584,63:556,64:1015,65:667,66:667,67:722,
    68:722,69:667,70:611,71:778,72:722,73:278,74:500,75:667,76:556,77:833,78:722,79:778,
    80:667,81:778,82:722,83:667,84:611,85:722,86:667,87:944,88:667,89:667,90:611,91:278,
    92:278,93:278,94:469,95:556,96:222,97:556,98:556,99:500,100:556,101:556,102:278,
    103:556,104:556,105:222,106:222,107:500,108:222,109:833,110:556,111:556,112:556,
    113:556,114:333,115:500,116:278,117:556,118:500,119:722,120:500,121:500,122:500,
    123:334,124:260,125:334,126:584
  };
  var W_BOLD = {
    32:278,33:333,34:474,35:556,36:556,37:889,38:722,39:278,40:333,41:333,42:389,43:584,
    44:278,45:333,46:278,47:278,48:556,49:556,50:556,51:556,52:556,53:556,54:556,55:556,
    56:556,57:556,58:333,59:333,60:584,61:584,62:584,63:611,64:975,65:722,66:722,67:722,
    68:722,69:667,70:611,71:778,72:722,73:278,74:556,75:722,76:611,77:833,78:722,79:778,
    80:667,81:778,82:722,83:667,84:611,85:722,86:667,87:944,88:667,89:667,90:611,91:333,
    92:278,93:333,94:584,95:556,96:278,97:556,98:611,99:556,100:611,101:556,102:333,
    103:611,104:611,105:278,106:278,107:556,108:278,109:889,110:611,111:611,112:611,
    113:611,114:389,115:556,116:333,117:611,118:556,119:778,120:556,121:556,122:500,
    123:389,124:280,125:389,126:584
  };

  /* WinAnsi-Byte -> ASCII-Basiszeichen zur Breitenableitung */
  var BASIS_MAP = {
    0xC0:'A',0xC1:'A',0xC2:'A',0xC3:'A',0xC4:'A',0xC5:'A',0xC7:'C',
    0xC8:'E',0xC9:'E',0xCA:'E',0xCB:'E',0xCC:'I',0xCD:'I',0xCE:'I',0xCF:'I',
    0xD1:'N',0xD2:'O',0xD3:'O',0xD4:'O',0xD5:'O',0xD6:'O',0xD8:'O',
    0xD9:'U',0xDA:'U',0xDB:'U',0xDC:'U',0xDD:'Y',0xDF:'s',
    0xE0:'a',0xE1:'a',0xE2:'a',0xE3:'a',0xE4:'a',0xE5:'a',0xE7:'c',
    0xE8:'e',0xE9:'e',0xEA:'e',0xEB:'e',0xEC:'i',0xED:'i',0xEE:'i',0xEF:'i',
    0xF1:'n',0xF2:'o',0xF3:'o',0xF4:'o',0xF5:'o',0xF6:'o',0xF8:'o',
    0xF9:'u',0xFA:'u',0xFB:'u',0xFC:'u',0xFD:'y',0xFF:'y',
    0xC6:'W',0xE6:'m',0xD0:'D',0xDE:'P',0xFE:'p'
  };
  /* Sonderzeichen mit eigener Breite (regular / bold) */
  var W_SPECIAL = {
    0x80:[556,556],  /* Euro */
    0x82:[222,278],  /* quotesinglbase */
    0x84:[333,500],  /* quotedblbase */
    0x85:[1000,1000],/* ellipsis */
    0x91:[222,278],0x92:[222,278],   /* quoteleft/right */
    0x93:[333,500],0x94:[333,500],   /* quotedblleft/right */
    0x83:[556,556],  /* florin */
    0x86:[556,556],0x87:[556,556],   /* dagger, daggerdbl */
    0x88:[333,333],  /* circumflex */
    0x89:[1000,1000],/* perthousand */
    0x8A:[667,722],  /* Scaron */
    0x8B:[333,333],0x9B:[333,333],   /* guilsinglleft/right */
    0x8C:[1000,1000],/* OE */
    0x8E:[611,611],  /* Zcaron */
    0x95:[350,350],  /* bullet */
    0x98:[333,333],  /* tilde */
    0x99:[1000,1000],/* trademark */
    0x9A:[500,556],  /* scaron */
    0x9C:[944,944],  /* oe */
    0x9E:[500,500],  /* zcaron */
    0x9F:[667,667],  /* Ydieresis */
    0x96:[556,556],  /* endash */
    0x97:[1000,1000],/* emdash */
    0xA0:[278,278],  /* nbsp */
    0xA1:[333,333],0xA2:[556,556],0xA3:[556,556],0xA4:[556,556],0xA5:[556,556],
    0xA7:[556,556],0xA9:[737,737],0xAB:[556,556],0xAE:[737,737],
    0xB0:[400,400],0xB1:[584,584],0xB2:[333,333],0xB3:[333,333],
    0xB5:[556,611],0xB6:[537,556],0xB7:[278,278],0xBB:[556,556],0xBF:[611,611],
    0xD7:[584,584],0xF7:[584,584]
  };

  /* Unicode -> WinAnsi-Byte für den 0x80..0x9F-Bereich und Transliteration */
  var UNI_TO_WIN = {
    0x20AC:0x80, 0x201A:0x82, 0x0192:0x83, 0x201E:0x84, 0x2026:0x85, 0x2020:0x86,
    0x2021:0x87, 0x02C6:0x88, 0x2030:0x89, 0x0160:0x8A, 0x2039:0x8B, 0x0152:0x8C,
    0x017D:0x8E, 0x2018:0x91, 0x2019:0x92, 0x201C:0x93, 0x201D:0x94, 0x2022:0x95,
    0x2013:0x96, 0x2014:0x97, 0x02DC:0x98, 0x2122:0x99, 0x0161:0x9A, 0x203A:0x9B,
    0x0153:0x9C, 0x017E:0x9E, 0x0178:0x9F
  };
  /* Zeichen ohne WinAnsi-Entsprechung sinnvoll ersetzen statt "?" zu drucken */
  var TRANSLIT = {
    0x2192:'->', 0x2190:'<-', 0x2191:'^', 0x2193:'v',
    0x2713:'X', 0x2714:'X', 0x2717:'-', 0x2718:'-',
    0x25A0:'-', 0x25A1:'[ ]', 0x25CF:'*', 0x25CB:'o', 0x2605:'*', 0x2606:'*',
    0x2011:'-', 0x2012:'-', 0x2015:'-', 0x2044:'/', 0x02BC:"'",
    0x00A0:' ', 0x2007:' ', 0x202F:' ', 0x2009:' '
  };

  function zeichenBreite(code, bold) {
    var tab = bold ? W_BOLD : W_REG;
    if (tab[code] !== undefined) return tab[code];
    if (W_SPECIAL[code]) return W_SPECIAL[code][bold ? 1 : 0];
    var basis = BASIS_MAP[code];
    if (basis) return tab[basis.charCodeAt(0)] || 556;
    return bold ? 556 : 556;
  }

  /* Text -> WinAnsi-Bytefolge (als Array von Zahlen) */
  function zuWinAnsi(text) {
    var out = [];
    var s = String(text == null ? '' : text);
    for (var i = 0; i < s.length; i++) {
      var cp = s.codePointAt(i);
      if (cp > 0xFFFF) { i++; out.push(0x3F); continue; }
      if (cp === 0x0A || cp === 0x0D || cp === 0x09) { out.push(0x20); continue; }
      if (cp < 0x80) { out.push(cp); continue; }
      if (UNI_TO_WIN[cp] !== undefined) { out.push(UNI_TO_WIN[cp]); continue; }
      if (cp >= 0xA0 && cp <= 0xFF) { out.push(cp); continue; }
      if (TRANSLIT[cp]) {
        var r = TRANSLIT[cp];
        for (var j = 0; j < r.length; j++) out.push(r.charCodeAt(j));
        continue;
      }
      out.push(0x3F); /* '?' */
    }
    return out;
  }

  /* Escaping für PDF-Literal-Strings */
  function pdfString(text) {
    var bytes = zuWinAnsi(text), out = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if (b === 0x28 || b === 0x29 || b === 0x5C) { out += '\\' + String.fromCharCode(b); }
      else if (b < 32 || b > 126) {
        var o = b.toString(8); while (o.length < 3) o = '0' + o;
        out += '\\' + o;
      } else { out += String.fromCharCode(b); }
    }
    return '(' + out + ')';
  }

  function num(n) {
    if (!isFinite(n)) n = 0;
    var s = (Math.round(n * 1000) / 1000).toString();
    return s;
  }

  /* --- Seitenformate in mm ------------------------------------------------ */
  var FORMATE = {
    a4:      { w: 210, h: 297 },
    a3:      { w: 297, h: 420 },
    letter:  { w: 215.9, h: 279.4 }
  };

  /* =========================================================================
   * PDFDoc
   * ====================================================================== */
  function PDFDoc(opt) {
    opt = opt || {};
    var fmt = FORMATE[(opt.format || 'a4').toLowerCase()] || FORMATE.a4;
    this.querformat = (opt.orientation === 'landscape' || opt.orientation === 'quer');
    this.breite  = this.querformat ? fmt.h : fmt.w;
    this.hoehe   = this.querformat ? fmt.w : fmt.h;
    this.rand = Object.assign({ oben: 15, unten: 15, links: 12, rechts: 12 }, opt.margin || {});
    this.seiten = [];
    this.bilder = [];          // {id, daten(Uint8Array), breite, hoehe, farbraum}
    this.meta = {
      titel: opt.titel || 'Dokument',
      autor: opt.autor || '',
      betreff: opt.betreff || '',
      ersteller: 'Schliessanlagen Aufmass-Tool'
    };
    this.aktuelleSeite = null;
    this.y = 0;
    this.onSeitenkopf = null;  // function(doc, seitenNr)
    this.onSeitenfuss = null;  // function(doc, seitenNr)
    this._imBlock = false;     // verhindert Rekursion in Kopf/Fuß
  }

  PDFDoc.prototype.inhaltsBreite = function () {
    return this.breite - this.rand.links - this.rand.rechts;
  };
  PDFDoc.prototype.inhaltsHoehe = function () {
    return this.hoehe - this.rand.oben - this.rand.unten;
  };
  PDFDoc.prototype.seitenAnzahl = function () { return this.seiten.length; };

  PDFDoc.prototype.neueSeite = function () {
    var seite = { ops: [], nr: this.seiten.length + 1, bilderRefs: {} };
    this.seiten.push(seite);
    this.aktuelleSeite = seite;
    this.y = this.rand.oben;
    if (this.onSeitenkopf && !this._imBlock) {
      this._imBlock = true;
      try { this.onSeitenkopf(this, seite.nr); } finally { this._imBlock = false; }
    }
    return seite;
  };

  PDFDoc.prototype._seite = function () {
    if (!this.aktuelleSeite) this.neueSeite();
    return this.aktuelleSeite;
  };

  PDFDoc.prototype._op = function (s) { this._seite().ops.push(s); };

  /* Y-Koordinate von oben-links in PDF-Koordinaten (unten-links) */
  PDFDoc.prototype._y = function (y) { return (this.hoehe - y) * MM_TO_PT; };
  PDFDoc.prototype._x = function (x) { return x * MM_TO_PT; };

  /* --- Farben ------------------------------------------------------------- */
  function farbe(c) {
    if (!c) return [0, 0, 0];
    if (Array.isArray(c)) return [c[0] / 255, c[1] / 255, c[2] / 255];
    var s = String(c).replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    if (isNaN(n)) return [0, 0, 0];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* --- Textbreite in mm --------------------------------------------------- */
  PDFDoc.prototype.textBreite = function (text, groesse, fett) {
    var bytes = zuWinAnsi(text), summe = 0;
    for (var i = 0; i < bytes.length; i++) summe += zeichenBreite(bytes[i], !!fett);
    return (summe / 1000) * groesse / MM_TO_PT;
  };

  /* Zeilenumbruch an Wortgrenzen; zu lange Wörter werden hart getrennt. */
  PDFDoc.prototype.umbrechen = function (text, maxBreite, groesse, fett) {
    var absaetze = String(text == null ? '' : text).split(/\r?\n/);
    var zeilen = [], self = this;

    function hartTrennen(wort) {
      var teile = [], akt = '';
      for (var i = 0; i < wort.length; i++) {
        var test = akt + wort[i];
        if (self.textBreite(test, groesse, fett) > maxBreite && akt) { teile.push(akt); akt = wort[i]; }
        else { akt = test; }
      }
      if (akt) teile.push(akt);
      return teile;
    }

    absaetze.forEach(function (absatz) {
      var woerter = absatz.split(/\s+/).filter(function (w) { return w.length; });
      if (!woerter.length) { zeilen.push(''); return; }
      var zeile = '';
      woerter.forEach(function (wort) {
        var test = zeile ? (zeile + ' ' + wort) : wort;
        if (self.textBreite(test, groesse, fett) <= maxBreite) { zeile = test; return; }
        if (zeile) { zeilen.push(zeile); zeile = ''; }
        if (self.textBreite(wort, groesse, fett) > maxBreite) {
          var teile = hartTrennen(wort);
          for (var i = 0; i < teile.length - 1; i++) zeilen.push(teile[i]);
          zeile = teile[teile.length - 1] || '';
        } else { zeile = wort; }
      });
      if (zeile) zeilen.push(zeile);
    });
    return zeilen;
  };

  /* --- Text zeichnen ------------------------------------------------------
   * x/y = obere linke Ecke der Textzeile (Baseline wird intern berechnet).
   * ---------------------------------------------------------------------- */
  PDFDoc.prototype.text = function (text, x, y, opt) {
    opt = opt || {};
    var groesse = opt.size || 9;
    var fett = !!opt.bold;
    var kursiv = !!opt.italic;
    var f = farbe(opt.color || '#000000');
    var fontRef = fett ? 'F2' : (kursiv ? 'F3' : 'F1');
    var breite = this.textBreite(text, groesse, fett);
    var zx = x;
    if (opt.align === 'center') zx = x - breite / 2;
    else if (opt.align === 'right') zx = x - breite;
    var baseline = y + groesse * 0.78 / MM_TO_PT;  /* Ascender-Näherung */

    this._op('BT /' + fontRef + ' ' + num(groesse) + ' Tf ' +
             num(f[0]) + ' ' + num(f[1]) + ' ' + num(f[2]) + ' rg ' +
             num(this._x(zx)) + ' ' + num(this._y(baseline)) + ' Td ' +
             pdfString(text) + ' Tj ET');

    if (opt.underline) {
      this.linie(zx, y + groesse * 0.95 / MM_TO_PT, zx + breite, y + groesse * 0.95 / MM_TO_PT,
                 { color: opt.color || '#000000', width: 0.2 });
    }
    return breite;
  };

  /* Um 90 Grad gegen den Uhrzeigersinn gedrehter Text (Spaltenköpfe der Matrix).
   * x/y bezeichnen den Startpunkt der Grundlinie; der Text läuft nach oben. */
  PDFDoc.prototype.textRotiert = function (text, x, y, opt) {
    opt = opt || {};
    var groesse = opt.size || 8;
    var fett = !!opt.bold;
    var f = farbe(opt.color || '#000000');
    var fontRef = fett ? 'F2' : 'F1';
    var breite = this.textBreite(text, groesse, fett);
    var sy = y;
    if (opt.align === 'center') sy = y + breite / 2;
    else if (opt.align === 'right') sy = y + breite;
    this._op('BT /' + fontRef + ' ' + num(groesse) + ' Tf ' +
             num(f[0]) + ' ' + num(f[1]) + ' ' + num(f[2]) + ' rg ' +
             '0 1 -1 0 ' + num(this._x(x)) + ' ' + num(this._y(sy)) + ' Tm ' +
             pdfString(text) + ' Tj ET');
    return breite;
  };

  /* Auf maximale Breite kürzen und mit Auslassungszeichen versehen. */
  PDFDoc.prototype.kuerzen = function (text, maxBreite, groesse, fett) {
    var s = String(text == null ? '' : text);
    if (this.textBreite(s, groesse, fett) <= maxBreite) return s;
    var punkte = '...';
    while (s.length > 0 && this.textBreite(s + punkte, groesse, fett) > maxBreite) {
      s = s.slice(0, -1);
    }
    return s + punkte;
  };

  /* Mehrzeiliger Text in fester Breite, gibt die verbrauchte Höhe in mm zurück. */
  PDFDoc.prototype.textBlock = function (text, x, y, maxBreite, opt) {
    opt = opt || {};
    var groesse = opt.size || 9;
    var zeilenhoehe = opt.lineHeight || (groesse * 1.25 / MM_TO_PT);
    var zeilen = this.umbrechen(text, maxBreite, groesse, opt.bold);
    if (opt.maxLines && zeilen.length > opt.maxLines) {
      zeilen = zeilen.slice(0, opt.maxLines);
      zeilen[zeilen.length - 1] = zeilen[zeilen.length - 1].replace(/.{3}$/, '...');
    }
    for (var i = 0; i < zeilen.length; i++) {
      var zx = x;
      if (opt.align === 'center') zx = x + maxBreite / 2;
      else if (opt.align === 'right') zx = x + maxBreite;
      this.text(zeilen[i], zx, y + i * zeilenhoehe, opt);
    }
    return zeilen.length * zeilenhoehe;
  };

  /* Höhe berechnen, ohne zu zeichnen (für Tabellen-Zeilenhöhen). */
  PDFDoc.prototype.blockHoehe = function (text, maxBreite, opt) {
    opt = opt || {};
    var groesse = opt.size || 9;
    var zeilenhoehe = opt.lineHeight || (groesse * 1.25 / MM_TO_PT);
    var zeilen = this.umbrechen(text, maxBreite, groesse, opt.bold);
    if (opt.maxLines && zeilen.length > opt.maxLines) zeilen = zeilen.slice(0, opt.maxLines);
    return Math.max(1, zeilen.length) * zeilenhoehe;
  };

  /* --- Grafik ------------------------------------------------------------- */
  PDFDoc.prototype.linie = function (x1, y1, x2, y2, opt) {
    opt = opt || {};
    var f = farbe(opt.color || '#000000');
    var w = (opt.width === undefined ? 0.2 : opt.width) * MM_TO_PT;
    var strich = opt.dash ? ('[' + opt.dash + '] 0 d ') : '[] 0 d ';
    this._op('q ' + strich + num(w) + ' w ' + num(f[0]) + ' ' + num(f[1]) + ' ' + num(f[2]) + ' RG ' +
             num(this._x(x1)) + ' ' + num(this._y(y1)) + ' m ' +
             num(this._x(x2)) + ' ' + num(this._y(y2)) + ' l S Q');
  };

  /* Mehrere Linien gleicher Stärke und Farbe in einem einzigen Pfad zeichnen.
   * Bei Rastern (Matrix, Tabellen) spart das erheblich Dateigröße, weil der
   * Grafikzustand nicht je Linie neu gesetzt wird.
   * linien: [[x1,y1,x2,y2], ...] */
  PDFDoc.prototype.linienGruppe = function (linien, opt) {
    if (!linien || !linien.length) return;
    opt = opt || {};
    var f = farbe(opt.color || '#000000');
    var w = (opt.width === undefined ? 0.2 : opt.width) * MM_TO_PT;
    var pfad = 'q [] 0 d ' + num(w) + ' w ' +
               num(f[0]) + ' ' + num(f[1]) + ' ' + num(f[2]) + ' RG';
    for (var i = 0; i < linien.length; i++) {
      var l = linien[i];
      pfad += ' ' + num(this._x(l[0])) + ' ' + num(this._y(l[1])) + ' m ' +
                    num(this._x(l[2])) + ' ' + num(this._y(l[3])) + ' l';
    }
    this._op(pfad + ' S Q');
  };

  PDFDoc.prototype.rechteck = function (x, y, b, h, opt) {
    opt = opt || {};
    var ops = 'q ';
    var modus = '';
    if (opt.fill) {
      var ff = farbe(opt.fill);
      ops += num(ff[0]) + ' ' + num(ff[1]) + ' ' + num(ff[2]) + ' rg ';
      modus = 'f';
    }
    if (opt.stroke) {
      var sf = farbe(opt.stroke);
      var w = (opt.width === undefined ? 0.2 : opt.width) * MM_TO_PT;
      ops += num(sf[0]) + ' ' + num(sf[1]) + ' ' + num(sf[2]) + ' RG ' + num(w) + ' w ';
      modus = modus === 'f' ? 'B' : 'S';
    }
    if (!modus) return;
    ops += num(this._x(x)) + ' ' + num(this._y(y + h)) + ' ' +
           num(b * MM_TO_PT) + ' ' + num(h * MM_TO_PT) + ' re ' + modus + ' Q';
    this._op(ops);
  };

  /* =========================================================================
   * JPEG-Einbettung
   * Liest Größe und Farbkanäle aus dem SOFn-Marker und bettet die Rohdaten
   * mit /DCTDecode ein (keine Neukodierung nötig).
   * ====================================================================== */
  function jpegInfo(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
    var i = 2;
    while (i < bytes.length - 1) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      var marker = bytes[i + 1];
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
      if (marker === 0xD9 || marker === 0xDA) break;
      var laenge = (bytes[i + 2] << 8) | bytes[i + 3];
      var istSOF = (marker >= 0xC0 && marker <= 0xCF) &&
                   marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
      if (istSOF) {
        return {
          hoehe: (bytes[i + 5] << 8) | bytes[i + 6],
          breite: (bytes[i + 7] << 8) | bytes[i + 8],
          kanaele: bytes[i + 9],
          bits: bytes[i + 4]
        };
      }
      i += 2 + laenge;
    }
    return null;
  }

  /* dataUrl: "data:image/jpeg;base64,..." */
  function base64ZuBytes(b64) {
    var bin;
    if (typeof atob === 'function') { bin = atob(b64); }
    else { bin = Buffer.from(b64, 'base64').toString('binary'); }
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xFF;
    return out;
  }

  /* Gibt die Bild-ID zurück oder null, wenn das Bild nicht lesbar ist. */
  PDFDoc.prototype.bildRegistrieren = function (dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    var komma = dataUrl.indexOf(',');
    if (komma < 0) return null;
    if (!/^data:image\/jpe?g/i.test(dataUrl)) return null;   /* nur JPEG */
    var bytes;
    try { bytes = base64ZuBytes(dataUrl.slice(komma + 1)); } catch (e) { return null; }
    var info = jpegInfo(bytes);
    if (!info || !info.breite || !info.hoehe) return null;
    var id = 'Im' + (this.bilder.length + 1);
    this.bilder.push({
      id: id, daten: bytes, breite: info.breite, hoehe: info.hoehe,
      farbraum: info.kanaele === 1 ? 'DeviceGray' : (info.kanaele === 4 ? 'DeviceCMYK' : 'DeviceRGB'),
      bits: info.bits || 8
    });
    return id;
  };

  /* Zeichnet ein registriertes Bild. Gibt {breite,hoehe} in mm zurück. */
  PDFDoc.prototype.bild = function (bildId, x, y, maxBreite, maxHoehe) {
    var bild = null;
    for (var i = 0; i < this.bilder.length; i++) if (this.bilder[i].id === bildId) bild = this.bilder[i];
    if (!bild) return null;
    var verhaeltnis = bild.breite / bild.hoehe;
    var b = maxBreite, h = maxBreite / verhaeltnis;
    if (maxHoehe && h > maxHoehe) { h = maxHoehe; b = maxHoehe * verhaeltnis; }
    var seite = this._seite();
    seite.bilderRefs[bildId] = true;
    this._op('q ' + num(b * MM_TO_PT) + ' 0 0 ' + num(h * MM_TO_PT) + ' ' +
             num(this._x(x)) + ' ' + num(this._y(y + h)) + ' cm /' + bildId + ' Do Q');
    return { breite: b, hoehe: h };
  };

  /* --- Flow-Helfer -------------------------------------------------------- */
  PDFDoc.prototype.platzPruefen = function (benoetigteHoehe) {
    if (!this.aktuelleSeite) { this.neueSeite(); return true; }
    if (this.y + benoetigteHoehe > this.hoehe - this.rand.unten) {
      this.neueSeite();
      return true;
    }
    return false;
  };

  /* =========================================================================
   * Serialisierung
   * ====================================================================== */
  function zuBytes(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xFF;
    return out;
  }

  PDFDoc.prototype.build = function () {
    if (!this.seiten.length) this.neueSeite();

    var self = this;
    /* Fußzeilen erst am Ende zeichnen, damit die Gesamtseitenzahl bekannt ist */
    if (this.onSeitenfuss) {
      var merkSeite = this.aktuelleSeite, merkY = this.y;
      this._imBlock = true;
      try {
        this.seiten.forEach(function (s) {
          self.aktuelleSeite = s;
          self.onSeitenfuss(self, s.nr, self.seiten.length);
        });
      } finally {
        this._imBlock = false;
        this.aktuelleSeite = merkSeite; this.y = merkY;
      }
    }

    var objekte = [];   // 1-basiert, Index 0 = Objekt 1
    function addObj(inhalt) { objekte.push(inhalt); return objekte.length; }

    var katalogNr = addObj(null);      // Platzhalter
    var seitenBaumNr = addObj(null);

    var fontRegNr = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var fontBoldNr = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    var fontObliqueNr = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');

    /* Bild-XObjects */
    var bildNr = {};
    this.bilder.forEach(function (b) {
      bildNr[b.id] = addObj({
        dict: '<< /Type /XObject /Subtype /Image /Width ' + b.breite + ' /Height ' + b.hoehe +
              ' /ColorSpace /' + b.farbraum + ' /BitsPerComponent ' + b.bits +
              ' /Filter /DCTDecode /Length ' + b.daten.length + ' >>',
        stream: b.daten
      });
    });

    var seitenNrs = [];
    this.seiten.forEach(function (s) {
      var inhalt = s.ops.join('\n');
      var inhaltBytes = zuBytes(inhalt);
      var streamNr = addObj({
        dict: '<< /Length ' + inhaltBytes.length + ' >>',
        stream: inhaltBytes
      });
      var xobj = Object.keys(s.bilderRefs).map(function (id) {
        return '/' + id + ' ' + bildNr[id] + ' 0 R';
      }).join(' ');
      var ressourcen = '<< /Font << /F1 ' + fontRegNr + ' 0 R /F2 ' + fontBoldNr +
                       ' 0 R /F3 ' + fontObliqueNr + ' 0 R >>' +
                       (xobj ? (' /XObject << ' + xobj + ' >>') : '') +
                       ' /ProcSet [/PDF /Text /ImageB /ImageC] >>';
      var seiteNr = addObj('<< /Type /Page /Parent ' + seitenBaumNr + ' 0 R /MediaBox [0 0 ' +
                           num(self.breite * MM_TO_PT) + ' ' + num(self.hoehe * MM_TO_PT) + '] ' +
                           '/Resources ' + ressourcen + ' /Contents ' + streamNr + ' 0 R >>');
      seitenNrs.push(seiteNr);
    });

    objekte[seitenBaumNr - 1] = '<< /Type /Pages /Count ' + seitenNrs.length + ' /Kids [' +
      seitenNrs.map(function (n) { return n + ' 0 R'; }).join(' ') + '] >>';

    var infoNr = addObj('<< /Title ' + pdfString(this.meta.titel) +
                        ' /Author ' + pdfString(this.meta.autor) +
                        ' /Subject ' + pdfString(this.meta.betreff) +
                        ' /Creator ' + pdfString(this.meta.ersteller) +
                        ' /Producer ' + pdfString(this.meta.ersteller) + ' >>');

    objekte[katalogNr - 1] = '<< /Type /Catalog /Pages ' + seitenBaumNr + ' 0 R >>';

    /* --- Bytes zusammensetzen --- */
    var teile = [];
    var laenge = 0;
    function push(bytesOderString) {
      var b = (typeof bytesOderString === 'string') ? zuBytes(bytesOderString) : bytesOderString;
      teile.push(b); laenge += b.length;
    }

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    var offsets = [0];
    objekte.forEach(function (obj, idx) {
      offsets[idx + 1] = laenge;
      var nr = idx + 1;
      if (obj && obj.stream) {
        push(nr + ' 0 obj\n' + obj.dict + '\nstream\n');
        push(obj.stream);
        push('\nendstream\nendobj\n');
      } else {
        push(nr + ' 0 obj\n' + (obj || '<< >>') + '\nendobj\n');
      }
    });

    var xrefPos = laenge;
    var xref = 'xref\n0 ' + (objekte.length + 1) + '\n0000000000 65535 f \n';
    for (var i = 1; i <= objekte.length; i++) {
      var o = String(offsets[i]); while (o.length < 10) o = '0' + o;
      xref += o + ' 00000 n \n';
    }
    push(xref);
    push('trailer\n<< /Size ' + (objekte.length + 1) + ' /Root ' + katalogNr + ' 0 R /Info ' +
         infoNr + ' 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n');

    var ergebnis = new Uint8Array(laenge), pos = 0;
    teile.forEach(function (t) { ergebnis.set(t, pos); pos += t.length; });
    return ergebnis;
  };

  PDFDoc.prototype.blob = function () {
    return new Blob([this.build()], { type: 'application/pdf' });
  };

  /* Speichern im Browser; auf iOS öffnet sich das Teilen-/Vorschau-Fenster. */
  PDFDoc.prototype.speichern = function (dateiname) {
    var blob = this.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = dateiname || 'dokument.pdf';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 4000);
    return url;
  };

  global.PDF = {
    Doc: PDFDoc,
    FORMATE: FORMATE,
    MM_TO_PT: MM_TO_PT,
    _intern: { zuWinAnsi: zuWinAnsi, zeichenBreite: zeichenBreite, jpegInfo: jpegInfo, farbe: farbe }
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.PDF; }
})(typeof window !== 'undefined' ? window : globalThis);
