/* Layout der gedruckten Berichte: Kein Text unter der Fußzeile oder über
 * dem rechten Rand, keine verwaisten Kopfzeilen, Fließtext über Seiten,
 * Fotos vollständig, Metadaten, Schriftgrößen. Die Prüfungen zeichnen die
 * Aufrufe des PDF-Writers mit (Seite, Position, Größe) und werten sie aus;
 * die PDF-Dateien selbst werden nicht gerendert. */
const fs = require('fs');
require('../src/js/catalog.js');
const M = require('../src/js/model.js');
require('../src/js/europlan.js');
const PDF = require('../src/js/pdf.js');
const Reports = require('../src/js/reports.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + String(i).slice(0, 400) : '')); } }

/* Kleine Testbilder: RGB 64x48 und CMYK 16x12 mit Adobe-Marker (aus Pillow) */
const FOTO_KLEIN = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDIooor1DgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//2Q==';
const FOTO_CMYK = 'data:image/jpeg;base64,/9j/7gAOQWRvYmUAZAAAAAAA/9sAQwAQCwwODAoQDg0OEhEQExgoGhgWFhgxIyUdKDozPTw5Mzg3QEhcTkBEV0U3OFBtUVdfYmdoZz5NcXlwZHhcZWdj/8AAFAgADAAQBEMRAE0RAFkRAEsRAP/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAA4EQwBNAFkASwAAPwDz+vQK8/r0Ciiiiiiiiiiiiv/Z';
const FOTO_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const fotoDatei = __dirname + '/out/foto.txt';
const FOTO_GROSS = fs.existsSync(fotoDatei) ? fs.readFileSync(fotoDatei, 'utf8').trim() : FOTO_KLEIN;

/* --- Mitschrift der Zeichenaufrufe ------------------------------------- */
const proto = PDF.Doc.prototype;
let log = [];
['text', 'textRotiert', 'rechteck', 'bild', 'linienGruppe'].forEach(name => {
  const orig = proto[name];
  proto[name] = function () {
    const a = Array.prototype.slice.call(arguments);
    const e = { art: name, args: a, seite: this.seiten.length, rahmen: this._imBlock, doc: this };
    if (name === 'text' || name === 'textRotiert') {
      const opt = a[3] || {};
      e.text = String(a[0]); e.x = a[1]; e.y = a[2]; e.size = opt.size || (name === 'text' ? 9 : 8);
      e.align = opt.align || 'left'; e.breite = this.textBreite(a[0], e.size, !!opt.bold);
    }
    log.push(e);
    return orig.apply(this, arguments);
  };
});
function aufzeichnen(fn) { log = []; const doc = fn(); const bytes = doc.build(); return { doc, bytes, log: log.slice(), txt: Buffer.from(bytes).toString('latin1') }; }
const inhalt = r => r.log.filter(e => !e.rahmen);
const texte = r => inhalt(r).filter(e => e.art === 'text' || e.art === 'textRotiert');
const findeText = (r, re) => texte(r).filter(e => re.test(e.text));

/* Text, der unten über den Rand oder rechts über die Seite läuft */
function ueberlaeufe(r) {
  const d = r.doc, unten = d.hoehe - d.rand.unten, rechts = d.breite - d.rand.rechts;
  const aus = [];
  texte(r).forEach(e => {
    const zeilenHoehe = e.size / PDF.MM_TO_PT;
    if (e.art === 'text' && e.y + zeilenHoehe > unten + 0.05) aus.push('S.' + e.seite + ' y=' + e.y.toFixed(1) + ' "' + e.text.slice(0, 30) + '" unter dem Rand');
    if (e.art === 'textRotiert' && e.y > unten + 0.05) aus.push('S.' + e.seite + ' gedreht y=' + e.y.toFixed(1) + ' unter dem Rand');
    if (e.art === 'text') {
      const links = e.align === 'right' ? e.x - e.breite : (e.align === 'center' ? e.x - e.breite / 2 : e.x);
      if (links + e.breite > rechts + 0.5) aus.push('S.' + e.seite + ' "' + e.text.slice(0, 30) + '" über den rechten Rand (' + (links + e.breite - rechts).toFixed(1) + ' mm)');
      if (links < d.rand.links - 0.5) aus.push('S.' + e.seite + ' "' + e.text.slice(0, 30) + '" über den linken Rand');
    }
  });
  return aus;
}
/* Kopfzeilen (Bereich, Tabellenkopf, Datenblattkopf, Summenzeile), hinter
   denen auf derselben Seite nichts mehr folgt */
function waisen(r) {
  const ereignisse = inhalt(r).map(e => {
    if (e.art === 'rechteck') {
      const opt = e.args[4] || {}, h = e.args[3];
      if (opt.fill === '#dce6f2') return { art: 'gruppe', seite: e.seite };
      if (opt.fill === '#eef2f7') return { art: 'blatt', seite: e.seite };
      /* Tabellenkopf 6,5 mm; Matrix- und Europlan-Kopf ab 24 mm; Summenzeile der Matrix 5,4 mm */
      if (opt.fill === '#e7ecf8' && h > 6 && h <= 6.5) return { art: 'kopf', seite: e.seite };
      if (opt.fill === '#e7ecf8' && h >= 20) return { art: 'matrixkopf', seite: e.seite };
      if (opt.fill === '#e7ecf8' && h < 6) return { art: 'summe', seite: e.seite };
      return null;
    }
    if (e.art === 'linienGruppe' || e.art === 'bild') return { art: 'zeile', seite: e.seite };
    if (e.art === 'text') return { art: 'text', seite: e.seite, text: e.text };
    return null;
  }).filter(Boolean);
  const aus = [];
  ereignisse.forEach((e, i) => {
    if (e.art === 'summe') {
      /* Die Summenzeile steht bei der letzten Datenzeile, nicht allein mit wiederholtem Kopf */
      let k = i - 1;
      while (k >= 0 && ereignisse[k].seite === e.seite && ereignisse[k].art !== 'zeile' && ereignisse[k].art !== 'matrixkopf') k--;
      if (k < 0 || ereignisse[k].seite !== e.seite || ereignisse[k].art === 'matrixkopf') aus.push('Summenzeile allein auf Seite ' + e.seite);
      return;
    }
    if (e.art !== 'gruppe' && e.art !== 'kopf' && e.art !== 'matrixkopf') return;
    let j = i + 1;
    while (j < ereignisse.length && (ereignisse[j].art === 'gruppe' || ereignisse[j].art === 'kopf' || ereignisse[j].art === 'matrixkopf' || ereignisse[j].art === 'text')) j++;
    if (j >= ereignisse.length || ereignisse[j].seite !== e.seite) aus.push(e.art + ' auf Seite ' + e.seite);
  });
  /* Unterschriften nie allein: Auf ihrer Seite steht weiterer Inhalt */
  const unterschrift = ereignisse.filter(e => e.art === 'text' && /^Aufgenommen durch/.test(e.text));
  unterschrift.forEach(u => {
    const andere = ereignisse.filter(e => e.seite === u.seite && e.art === 'text' && !/Unterschrift\)$/.test(e.text));
    if (!andere.length) aus.push('Unterschriften allein auf Seite ' + u.seite);
  });
  return aus;
}
/* Fußzeile: linker und rechter Text dürfen sich nicht berühren; der Stand ist auf allen Seiten gleich */
function fusszeile(r) {
  const d = r.doc, unten = d.hoehe - d.rand.unten;
  const fuss = r.log.filter(e => e.rahmen && e.art === 'text' && e.y > unten);
  const seiten = {};
  fuss.forEach(e => { (seiten[e.seite] = seiten[e.seite] || []).push(e); });
  const probleme = [], staende = new Set();
  Object.keys(seiten).forEach(s => {
    const links = seiten[s].filter(e => e.align !== 'right'), rechts = seiten[s].filter(e => e.align === 'right');
    links.forEach(l => rechts.forEach(re => { if (l.x + l.breite > re.x - re.breite - 2) probleme.push('Seite ' + s + ': Abstand ' + (re.x - re.breite - l.x - l.breite).toFixed(1) + ' mm'); }));
    rechts.forEach(re => { const m = /^Stand (\S+ \S+)/.exec(re.text); if (m) staende.add(m[1]); });
  });
  if (staende.size > 1) probleme.push('verschiedene Stände: ' + [...staende].join(', '));
  return probleme;
}
/* Info-Dictionary lesen: Hex-Strings (UTF-16BE) und Literale */
function info(txt, schluessel) {
  const m = new RegExp('/' + schluessel + ' (<[0-9A-F]+>|\\((?:[^()\\\\]|\\\\.)*\\))').exec(txt);
  if (!m) return null;
  const s = m[1];
  if (s[0] === '<') { const hex = s.slice(1, -1); if (!/^FEFF/.test(hex)) return '(ohne BOM) ' + hex; let aus = ''; for (let i = 4; i < hex.length; i += 4) aus += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16)); return aus; }
  return s.slice(1, -1);
}

/* --- Projekte ------------------------------------------------------------ */
const eins = Object.assign({}, einstellungen);
const einsLang = Object.assign({}, einstellungen, {
  firma: 'Provision Infrastruktur- und Sicherheitstechnik Gesellschaft mit beschränkter Haftung & Co. Kommanditgesellschaft'
});
const NOTIZ = 'Diese Bemerkung ist absichtlich sehr lang, damit der Textblock über das Seitenende hinausläuft. '.repeat(60) + 'ENDE-DER-NOTIZ';
const BEMERKUNG = 'Projektbemerkung, sehr lang. '.repeat(250) + 'ENDE-DER-BEMERKUNG';

function ueberlaufProjekt() {
  const p = baueTestprojekt();
  p.tueren[0].notiz = NOTIZ;
  p.tueren[0].nacharbeit = true; p.tueren[0].nacharbeitText = 'Nacharbeit, ebenfalls lang. '.repeat(40) + 'ENDE-DER-NACHARBEIT';
  p.tueren[1].notiz = 'Zweite lange Notiz im Kompaktmodus. '.repeat(50);
  p.bemerkung = BEMERKUNG;
  p.lieferAdresse = 'Lieferadresse Zeile 1\nZeile 2\nZeile 3 mit sehr langem Text, der nicht in eine Zeile passt und deshalb früher gekürzt wurde ENDE-DER-ADRESSE';
  p.kommission = 'Kommission mit sehr langem Bestellzeichen das nicht in die Spalte passt 0123456789 ENDE-DER-KOMMISSION';
  return p;
}
function langProjekt() {
  const p = baueTestprojekt();
  p.objekt = 'Verwaltungs- und Bürogebäude mit angeschlossener Tiefgarage, Lagerhallen, Werkstattgebäude und Pförtnerhaus an der Königsallee 47 bis 53 in Düsseldorf';
  p.kunde = 'Wohnungsbaugesellschaft für gemeinnützigen Wohnungsbau und Verwaltung von Immobilien in Nordrhein-Westfalen mit Sitz in Düsseldorf am Rhein mbH & Co. KG';
  const egA = p.standorte.find(k => k.name === 'Erdgeschoss');
  p.tueren.push(M.neueTuer({ nummer: 'LANG-OHNE-LEERZEICHEN-0001', bezeichnung: 'Haupteingang Verwaltungsgebäude Erdgeschoss Nordseite mit Windfang und Zugangskontrolle und Notausgangsfunktion sowie Türschließer Nummer 12',
    strukturId: egA.id, brauchtZylinder: true, zylinderBauform: 'Doppelzylinder',
    zylinderAusfuehrung: ['BSZ (beidseitig schließbar)', 'Freidreh', 'Anti-Panik', 'Not- und Gefahrenfunktion', 'SKG', 'VdS Klasse B', 'Bohrschutz', 'Ziehschutz'],
    masseAussen: '30.5', masseInnen: '35,5', dornmass: '65.5', status: 'aufgemessen', anzahl: 2.5 }));
  p.tueren.push(M.neueTuer({ nummer: '', bezeichnung: '', strukturId: egA.id, brauchtZylinder: true, status: 'offen' }));
  p.tueren[1].anzahl = -1;
  /* sechs Ebenen */
  let eltern = p.standorte.find(k => k.name === 'Haus B (Lager & Technik)');
  ['Ebene 3: Technikgebäude Ost', 'Ebene 4: Zwischengeschoss', 'Ebene 5: Flur Nord mit Zugang zur Wendeltreppe', 'Ebene 6: Raumgruppe Elektro / HAK / Batterie'].forEach((n, i) => {
    const k = M.neuerStrukturknoten('bereich', n, eltern.id); k.sort = 9 + i; p.standorte.push(k); eltern = k;
  });
  p.tueren.push(M.neueTuer({ nummer: 'E6-01', bezeichnung: 'Batterieraum', strukturId: eltern.id, brauchtZylinder: true, zylinderBauform: 'Halbzylinder', masseAussen: '30', masseInnen: '10', status: 'aufgemessen' }));
  /* lange Schlüsselnummern und ein langer Funktionsname */
  for (let i = 1; i <= 10; i++) {
    const s = M.neueSchliessung({ kuerzel: 'UGS-' + (i < 10 ? '0' : '') + i, bezeichnung: 'Untergruppe ' + i, typ: 'ugs', sort: 50 + i, medien: [{ typ: 'Schlüssel', anzahl: 1 }] });
    p.schliessungen.push(s); M.setBerechtigung(p, p.tueren[i % p.tueren.length].id, s.id, 'ja');
  }
  const lang = M.neueSchliessung({ kuerzel: 'GHS-LANGES-KÜRZEL-0001', bezeichnung: 'Generalhauptschlüssel für sämtliche Türen des Verwaltungsgebäudes inklusive Tiefgarage und Nebengebäude (Reserve im Tresor)', typ: 'ghs', sort: 99, medien: [{ typ: 'Schlüssel', anzahl: 2 }] });
  p.schliessungen.push(lang);
  p.tueren.forEach(t => M.setBerechtigung(p, t.id, lang.id, 'ja'));
  M.spaltenAngleichen(p);
  return p;
}
function fotoProjekt() {
  const p = baueTestprojekt();
  p.tueren[0].fotos = [1, 2, 3, 4, 5, 6].map(i => ({ id: 'p' + i, dataUrl: i === 3 ? FOTO_KLEIN : (i === 5 ? FOTO_CMYK : FOTO_GROSS), beschriftung: 'Foto ' + i, erstellt: '2026-11-20T10:00:00Z' }));
  p.tueren[1].fotos = [
    { id: 'q1', dataUrl: FOTO_PNG, beschriftung: 'PNG-Foto' },
    { id: 'q2', dataUrl: FOTO_GROSS, beschriftung: 'gültig' },
    { id: 'q3', dataUrl: 'data:image/jpeg;base64,AAAABBBB', beschriftung: 'defekt' },
    { id: 'q4', dataUrl: '', beschriftung: 'leer' }
  ];
  return p;
}
/* Viele Hinweise im Europlan: Mitarbeiter mit eigener Spalte ohne Berechtigung */
function hinweisProjekt() {
  const p = baueTestprojekt();
  for (let i = 0; i < 40; i++) {
    const m = M.neuerMitarbeiter({ name: 'Mitarbeiter mit sehr langem Namen Nummer ' + i, funktion: 'Prüfung', medien: [{ typ: 'Schlüssel', anzahl: 1 }] });
    p.mitarbeiter.push(m); M.spalteFuer(p, 'mitarbeiter', m.id);
  }
  M.spaltenAngleichen(p);
  return p;
}
function freigabeProjekt() {
  const p = baueTestprojekt();
  p.freigabe = { am: '2026-11-20T10:15:00Z', name: 'Frau Dr. Dr. h.c. Annemarie-Charlotte von Schäfer-Hohenlohe-Langenburg und Herr Dipl.-Ing. Maximilian Baumann-Westerwelle', funktion: 'Geschäftsführung und Prokura, Leitung Facility Management, Gebäudetechnik, Sicherheit und Einkauf', art: 'mit_antwort', stand: '' };
  p.freigabe.stand = M.freigabeStand(p);
  M.setBerechtigung(p, p.tueren[1].id, p.schliessungen[4].id, 'ja');
  return p;
}
/* 150 Türen mal 30 Schließungen mit Zufallsnotizen: Seitenumbrüche an allen Stellen */
function grossProjekt() {
  let seed = 4242; const zufall = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const p = baueTestprojekt();
  const bereiche = p.standorte.filter(k => k.ebene === 'bereich');
  for (let i = 0; i < 150; i++) {
    p.tueren.push(M.neueTuer({ nummer: 'T-' + (100 + i), bezeichnung: 'Raum ' + i, strukturId: bereiche[i % bereiche.length].id, brauchtZylinder: true, zylinderBauform: 'Doppelzylinder',
      masseAussen: '30', masseInnen: '35', status: 'aufgemessen', anzahl: zufall() < 0.1 ? 2 : 1,
      notiz: zufall() < 0.3 ? 'Notiz '.repeat(1 + Math.floor(zufall() * 25)) : '', nacharbeit: zufall() < 0.1, nacharbeitText: 'Nacharbeit '.repeat(5),
      systemNotiz: zufall() < 0.2 ? 'Besonderheit '.repeat(1 + Math.floor(zufall() * 6)) : '' }));
  }
  for (let i = 0; i < 30; i++) {
    const s = M.neueSchliessung({ kuerzel: 'GS-' + (i < 10 ? '0' : '') + i, bezeichnung: 'Gruppenschlüssel ' + i, typ: 'gs', sort: 100 + i, medien: [{ typ: 'Schlüssel', anzahl: 1 + (i % 4) }] });
    p.schliessungen.push(s);
    p.tueren.forEach(t => { if (zufall() < 0.2) M.setBerechtigung(p, t.id, s.id, 'ja'); });
  }
  M.spaltenAngleichen(p);
  return p;
}

/* --- 1. Kein Text unter der Fußzeile oder über den Rand, keine Waisen ------- */
console.log('\n== Berichte: Überläufe, Waisen, Fußzeile ==');
const projekte = { fixture: baueTestprojekt(), ueberlauf: ueberlaufProjekt(), lang: langProjekt(), fotos: fotoProjekt(), hinweise: hinweisProjekt(), freigabe: freigabeProjekt(), gross: grossProjekt() };
const berichte = {
  'tuerliste-kompakt': (p, e) => Reports.tuerliste(p, e, { modus: 'kompakt' }),
  'tuerliste-detail': (p, e) => Reports.tuerliste(p, e, { modus: 'detail', mitFotos: true }),
  'tuerliste-detail-quer': (p, e) => Reports.tuerliste(p, e, { modus: 'detail', mitFotos: false, orientation: 'landscape' }),
  'schliessplan': (p, e) => Reports.schliessplan(p, e),
  'europlan': (p, e) => Reports.europlan(p, e),
  'europlan-kreuz': (p, e) => Reports.europlan(p, e, { art: 'kreuz' }),
  'materialliste': (p, e) => Reports.materialliste(p, e, { mitTueren: true }),
  'pruefprotokoll': (p, e) => Reports.pruefprotokoll(p, e)
};
const ergebnisse = {};
let laeufe = 0, ueber = [], waise = [], fuss = [], klein = [];
Object.keys(projekte).forEach(pn => {
  Object.keys(berichte).forEach(bn => {
    [eins, einsLang].forEach((e, ei) => {
      const r = aufzeichnen(() => berichte[bn](projekte[pn], e));
      ergebnisse[pn + '/' + bn + '/' + ei] = r;
      laeufe++;
      ueberlaeufe(r).forEach(u => ueber.push(pn + '/' + bn + ': ' + u));
      waisen(r).forEach(w => waise.push(pn + '/' + bn + ': ' + w));
      fusszeile(r).forEach(f => fuss.push(pn + '/' + bn + ': ' + f));
      texte(r).forEach(t => { if (t.size < 6.5 - 1e-9) klein.push(pn + '/' + bn + ': ' + t.size + ' pt "' + t.text.slice(0, 20) + '"'); });
    });
  });
});
pruefe(laeufe === Object.keys(projekte).length * Object.keys(berichte).length * 2, laeufe + ' Berichte erzeugt');
pruefe(ueber.length === 0, 'kein Text unter der Fußzeile oder über den Seitenrand (H3, H4, H5)', ueber.slice(0, 6).join(' | '));
pruefe(waise.length === 0, 'keine verwaiste Bereichs-, Tabellen- oder Datenblatt-Kopfzeile, Unterschriften nie allein (M1, N1, N15)', waise.slice(0, 6).join(' | '));
pruefe(fuss.length === 0, 'Fußzeile: linker und rechter Text berühren sich nicht, Stand auf allen Seiten gleich (M2, N11)', fuss.slice(0, 4).join(' | '));
pruefe(klein.length === 0, 'keine Schrift unter 6,5 pt (M16)', klein.slice(0, 4).join(' | '));
const stueck = [];
Object.keys(ergebnisse).forEach(k => texte(ergebnisse[k]).forEach(t => { if (t.size < 7 - 1e-9 && !/^\d+$|^Stk$/.test(t.text)) stueck.push(k + ': "' + t.text.slice(0, 20) + '"'); }));
pruefe(stueck.length === 0, 'unter 7 pt stehen nur Stückzahlen (M16)', stueck.slice(0, 4).join(' | '));

/* --- 2. Fließtext: nichts geht verloren --------------------------------- */
console.log('\n== Fließtext über Seitengrenzen (H3) ==');
{
  const r = ergebnisse['ueberlauf/tuerliste-detail/0'];
  pruefe(findeText(r, /ENDE-DER-NOTIZ/).length === 1 && findeText(r, /ENDE-DER-NACHARBEIT/).length === 1, 'lange Bemerkung und Nacharbeit stehen vollständig im Datenblatt');
  pruefe(findeText(r, /\(Fortsetzung\)/).length >= 1, 'der Datenblattkopf wiederholt sich als „(Fortsetzung)“');
  pruefe(findeText(r, /ENDE-DER-BEMERKUNG/).length === 1, 'die Projektbemerkung steht bis zum Ende im Datenblatt-Bericht');
  const kompakt = ergebnisse['ueberlauf/tuerliste-kompakt/0'];
  pruefe(findeText(kompakt, /ENDE-DER-BEMERKUNG/).length === 1 && findeText(kompakt, /^Projektbemerkung \(Fortsetzung\)$/).length >= 1, 'im Querformat läuft die Projektbemerkung mit Fortsetzungstitel weiter');
  const ml = ergebnisse['ueberlauf/materialliste/0'];
  pruefe(findeText(ml, /ENDE-DER-ADRESSE/).length === 1 && findeText(ml, /ENDE-DER-KOMMISSION/).length === 1, 'Lieferadresse und Kommission stehen vollständig (N9)');
  pruefe(findeText(ml, /^Zeile 2$/).length === 1, 'die Lieferadresse bleibt mehrzeilig');
  pruefe(findeText(ml, /beim Lieferanten ergänzt/).length === 1, 'der Schlusshinweis der Materialliste ist vollständig');
  const eu = ergebnisse['hinweise/europlan/0'];
  pruefe(findeText(eu, /Nummer 39/).length >= 1 && findeText(eu, /^Legende$/).length === 1, 'Europlan: alle Hinweise stehen im Dokument (H4)');
}

/* --- 3. Kürzungen und Spalten ------------------------------------------- */
console.log('\n== Kürzungen, Spalten, Titel (H5, M3, M4, M5, M8, M9, M10, M11) ==');
{
  const r = ergebnisse['lang/tuerliste-kompakt/0'];
  const nummern = texte(r).map(t => t.text);
  pruefe(nummern.indexOf('LANG-OHNE-') !== -1 && nummern.indexOf('LEERZEICHEN-') !== -1 && nummern.indexOf('0001') !== -1, 'lange Türnummer bricht an Bindestrichen um (M9)', nummern.filter(n => /LANG|LEER|0001/.test(n)).join(','));
  pruefe(!nummern.some(n => /^LANG-O$|^HNE-LEE$|LANG.*…$/.test(n)), 'die Türnummer wird nicht zerrissen oder gekürzt');
  const kopf = ergebnisse['lang/schliessplan/0'];
  pruefe(findeText(kopf, /Co\. KG$/).length >= 1, 'Kopfblock: ein langer Kundenname steht bis zum Ende (M8)');
  const detail = ergebnisse['lang/tuerliste-detail/0'];
  const titelZeilen = texte(detail).filter(t => t.size === 10.5 && /Windfang/.test(t.text) && !/^LANG-OHNE/.test(t.text));
  pruefe(titelZeilen.length >= 1, 'Datenblatt-Titel ist zweizeilig (M10)', texte(detail).filter(t => t.size === 10.5).map(t => t.text).join(' | '));
  pruefe(findeText(detail, /Ziehschutz$/).length >= 1, 'acht Zylinderausführungen stehen vollständig im Datenblatt (M4)');
  pruefe(findeText(detail, /Ebene 4: Zwisch/).length >= 1 && !ueberlaeufe(detail).length, 'Bereichs-Kopfzeile mit sechs Ebenen ist gekürzt (H5)');
  const ml = ergebnisse['lang/materialliste/0'];
  pruefe(findeText(ml, /Ziehschutz$/).length >= 1, 'Materialliste: die Ausführung wird nicht nach drei Zeilen gekürzt (M5)');
  const eu = ergebnisse['lang/europlan/0'];
  const gedreht = inhalt(eu).filter(e => e.art === 'textRotiert').map(e => e.text);
  pruefe(gedreht.indexOf('UGS-01') !== -1 && gedreht.indexOf('UGS-10') !== -1, 'Europlan: Schlüsselnummern ab sechs Zeichen stehen senkrecht und vollständig (M3)', gedreht.filter(t => /UGS/.test(t)).join(','));
  pruefe(findeText(eu, /^Objekt: |Pförtnerhaus/).length >= 1 || findeText(eu, /Objekt: Verwaltungs/).length >= 1, 'Europlan-Kopfzeile ist umbrochen statt abgeschnitten (H5)');
  const fr = ergebnisse['freigabe/schliessplan/0'];
  const kasten = inhalt(fr).filter(e => e.art === 'rechteck' && (e.args[4] || {}).fill === '#fff3e0')[0];
  pruefe(kasten && kasten.args[3] > 9, 'Freigabevermerk: der Kasten wächst mit dem Text (M11)', kasten && kasten.args[3]);
}

/* --- 4. Fotos ----------------------------------------------------------- */
console.log('\n== Fotos (M6, N13, N16) ==');
{
  const r = ergebnisse['fotos/tuerliste-detail/0'];
  const bilder = inhalt(r).filter(e => e.art === 'bild');
  pruefe(bilder.length === 7, 'sechs Fotos der ersten Tür und das gültige der zweiten werden gezeichnet (' + bilder.length + ')');
  const kleines = bilder.filter(e => Math.abs(e.args[3] - 64 / 150 * 25.4) < 0.05);
  pruefe(kleines.length === 1 && !bilder.some(e => e.args[3] > 42.01), 'ein 64 Pixel breites Foto wird nicht über 10,8 mm hochgezogen (N16)', bilder.map(e => e.args[3].toFixed(1)).join(','));
  pruefe(findeText(r, /Fotos 1 \(PNG-Foto\), 3 \(defekt\), 4 \(leer\) sind nicht als JPEG lesbar/).length === 1, 'nicht lesbare Fotos werden benannt (M6)');
  pruefe(/\/ColorSpace \/DeviceCMYK \/BitsPerComponent 8 \/Decode \[1 0 1 0 1 0 1 0\]/.test(r.txt), 'CMYK-JPEG mit Adobe-Marker bekommt /Decode (N13)');
}

/* --- 5. Zahlen und Metadaten ------------------------------------------- */
console.log('\n== Zahlen, Metadaten, Format (N6, N7, N8, M7, N11) ==');
{
  const r = ergebnisse['lang/tuerliste-kompakt/0'];
  const anz = texte(r).filter(t => t.size === 7.2 && t.align === 'center' && /^\d+$/.test(t.text)).map(t => t.text);
  pruefe(anz.indexOf('2') !== -1 && anz.indexOf('-1') === -1 && !texte(r).some(t => t.text === '2.5'), 'Anzahl 2,5 wird 2 und -1 wird 1 (N6)', anz.join(','));
  const ml = ergebnisse['lang/materialliste/0'];
  pruefe(findeText(ml, /^66$/).length >= 1 && findeText(ml, /^30,5$/).length >= 1 && findeText(ml, /^35,5$/).length >= 1 && !texte(ml).some(t => /^\d+\.\d+$/.test(t.text)), 'Maße mit Dezimalkomma: 30,5 / 35,5 / 66 (N7)', texte(ml).filter(t => /^\d+[.,]\d+$/.test(t.text)).map(t => t.text).join(','));
  const hoch = Reports.tuerliste(baueTestprojekt(), eins, { modus: 'kompakt', orientation: 'portrait' });
  pruefe(hoch.querformat === true, 'die kompakte Türliste ist auch mit Hochformat-Option quer (N8)');
  const quer = Reports.tuerliste(baueTestprojekt(), eins, { modus: 'detail', orientation: 'landscape' });
  pruefe(quer.querformat === true && Reports.tuerliste(baueTestprojekt(), eins, { modus: 'detail' }).querformat === false, 'das Datenblatt kennt hoch und quer');
  /* Metadaten */
  global.AppKern = { FASSUNG: '9.9.9' };
  const p = baueTestprojekt(); p.kunde = 'Müller & Söhne „Immobilien“ GmbH – Größe € ²';
  const meta = aufzeichnen(() => Reports.tuerliste(p, eins, { modus: 'kompakt' }));
  delete global.AppKern;
  pruefe(info(meta.txt, 'Title') === 'Türliste Müller & Söhne „Immobilien“ GmbH – Größe € ²', 'Titel als UTF-16BE mit BOM (M7)', info(meta.txt, 'Title'));
  pruefe(info(meta.txt, 'Producer') === 'Aufmaß-Werkzeug 9.9.9' && info(meta.txt, 'Creator') === 'Aufmaß-Werkzeug', 'Producer trägt die Fassung (N11)', info(meta.txt, 'Producer'));
  pruefe(/\/CreationDate \(D:\d{14}[+-]\d{2}'\d{2}'\)/.test(meta.txt) && /\/ModDate \(D:/.test(meta.txt), 'CreationDate und ModDate sind gesetzt (N11)');
  pruefe(info(meta.txt, 'Subject') === 'Aufma\u00df-T\u00fcrliste', 'Betreff mit ß und ü richtig', info(meta.txt, 'Subject'));
}

console.log('\nErgebnis Berichte-Layout: ' + ok + ' ok, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
