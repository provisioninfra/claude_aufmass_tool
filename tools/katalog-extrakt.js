#!/usr/bin/env node
/* =============================================================================
 * katalog-extrakt.js — Liest Produktkatalog-PDFs aus und schlägt einen
 * Katalogentwurf vor.
 *
 * WICHTIG: Das ist ein Assistent, kein Automat. PDF-Kataloge sind für Menschen
 * gesetzt, nicht für Maschinen. Das Werkzeug findet Kandidaten und markiert
 * jede Fundstelle mit Seite und Originalzeile, damit sie gegengeprüft werden
 * kann. Was es nicht sicher erkennt, meldet es als offen - es rät nicht.
 *
 * Aufruf:  node tools/katalog-extrakt.js <datei.pdf> [weitere.pdf ...]
 *          [--system <id>] [--out <ziel.json>] [--bericht <bericht.txt>]
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/* --- PDF zu Text (Layout erhalten, damit Tabellenspalten stehen bleiben) -- */
function pdfText(datei) {
  try {
    return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', datei, '-'],
      { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 });
  } catch (e) {
    throw new Error('pdftotext konnte "' + path.basename(datei) + '" nicht lesen: ' + e.message);
  }
}

function seiten(text) { return text.split('\f'); }

/* =============================================================================
 * Mustererkennung
 * ========================================================================== */

/* Längenpaare wie "31/31", "30/35", "35 / 45", auch mit mm */
const RE_PAAR = /\b(\d{2,3})\s*[\/\-]\s*(\d{2,3})\b(?:\s*mm)?/g;
/* Reihen aus mindestens vier Maßzahlen: typische Längentabelle */
const RE_REIHE = /(?:\b\d{2,3}\b[\s,;]+){3,}\b\d{2,3}\b/g;
/* Einzelmaß mit Einheit */
const RE_MASS = /\b(\d{2,3})\s*mm\b/g;

/* Begriffe, die auf Bauteile hindeuten */
const BAUTEIL_MUSTER = [
  { art: 'zylinder', re: /\b(Doppelzylinder|Halbzylinder|Knaufzylinder|Doppelknaufzylinder|Hebelzylinder|Möbelzylinder|Rundzylinder|Vorhangschloss|Vorhängeschloss|Briefkastenzylinder|Schaltzylinder|Blindzylinder|Profilzylinder|Zylinder)\b/i },
  { art: 'beschlag', re: /\b(Rosettengarnitur|Langschild|Schutzbeschlag|Wechselgarnitur|Panikbeschlag|Türbeschlag|SmartHandle|Drückergarnitur|Knaufgarnitur|Beschlag)\b/i },
  { art: 'schloss',  re: /\b(Einsteckschloss|Rohrrahmenschloss|Panikschloss|Mehrfachverriegelung|Motorschloss|Möbelschloss|Schrankschloss|SmartLocker|Schloss)\b/i },
  { art: 'leser',    re: /\b(Wandleser|Zutrittsleser|SmartRelais|Leser|Terminal|Codierstation)\b/i },
  { art: 'medium',   re: /\b(Transponder|SmartCard|SmartTag|Schlüsselanhänger|Identmedium|Karte|PinCode)\b/i },
  { art: 'zubehoer', re: /\b(RouterNode|GatewayNode|AccessNode|LockNode|Bridge|Opener|Keypad|Programmiergerät|SmartCD)\b/i }
];

/* Ausführungen und Optionen, die in Katalogen üblich sind */
const VARIANTEN_MUSTER = [
  'Freidreh', 'Freilauf', 'Komfort', 'Anti-Panik', 'Antipanik', 'Panik',
  'Wetterschutz', 'wetterfest', 'IP54', 'IP65', 'IP66',
  'Not- und Gefahrenfunktion', 'Not-/Gefahrenfunktion', 'beidseitig steckbar',
  'gleichschließend', 'verschiedenschließend', 'Zentralschloss',
  'Bauschließung', 'Notschlüssel', 'Schließfolgeregler',
  'VdS', 'SKG', 'RC2', 'RC3', 'ES0', 'ES1', 'ES2', 'ES3',
  'Edelstahl', 'vernickelt', 'Messing', 'brüniert', 'schwarz', 'Aluminium',
  'BLE', 'NFC', 'MIFARE', 'DESFire', 'Legic', 'HITAG',
  'kurz', 'lang', 'Sonderlänge', 'Sondermaß',
  'außen', 'innen', 'beidseitig', 'einseitig'
];

/* Zeilen, die eindeutig kein Bauteil sind */
const RE_MUELL = /^(Seite|Page|Inhalt|Impressum|Stand:|Copyright|©|www\.|Tel\.|Fax|E-Mail|Alle Rechte|Änderungen|Technische Änderungen|Preise)/i;

function zeilenAufbereiten(text) {
  return text.split('\n')
    .map(z => z.replace(/\s+$/, ''))
    .filter(z => z.trim().length > 0);
}

/* --- Bauteilkandidaten je Seite finden ---------------------------------- */
function bauteileFinden(seitenText, seitenNr) {
  const funde = [];
  zeilenAufbereiten(seitenText).forEach((zeile, i) => {
    const gekuerzt = zeile.trim();
    if (gekuerzt.length < 4 || gekuerzt.length > 140) return;
    if (RE_MUELL.test(gekuerzt)) return;
    for (const muster of BAUTEIL_MUSTER) {
      const treffer = muster.re.exec(gekuerzt);
      if (treffer) {
        funde.push({
          art: muster.art,
          begriff: treffer[1],
          zeile: gekuerzt,
          seite: seitenNr,
          zeilenNr: i + 1
        });
        break;
      }
    }
  });
  return funde;
}

/* --- Längenangaben je Seite sammeln ------------------------------------- */
function laengenFinden(seitenText, seitenNr) {
  const paare = [], einzel = new Set(), reihen = [];

  let m;
  RE_PAAR.lastIndex = 0;
  while ((m = RE_PAAR.exec(seitenText)) !== null) {
    const a = parseInt(m[1], 10), i = parseInt(m[2], 10);
    /* Jahreszahlen, Normnummern und Telefonnummern ausschließen */
    if (a < 10 || a > 200 || i < 5 || i > 200) continue;
    paare.push({ aussen: a, innen: i, quelle: m[0], seite: seitenNr });
  }

  RE_REIHE.lastIndex = 0;
  while ((m = RE_REIHE.exec(seitenText)) !== null) {
    const zahlen = m[0].match(/\d{2,3}/g).map(Number)
      .filter(z => z >= 10 && z <= 200);
    if (zahlen.length < 4) continue;
    /* Gleichmäßiger Abstand deutet auf ein Längenraster hin */
    const schritte = [];
    for (let k = 1; k < zahlen.length; k++) schritte.push(zahlen[k] - zahlen[k - 1]);
    const gleich = schritte.every(s => s === schritte[0]) && schritte[0] > 0;
    reihen.push({
      zahlen: zahlen, seite: seitenNr,
      schritt: gleich ? schritte[0] : null,
      regelmaessig: gleich,
      quelle: m[0].trim().slice(0, 90)
    });
    zahlen.forEach(z => einzel.add(z));
  }

  RE_MASS.lastIndex = 0;
  while ((m = RE_MASS.exec(seitenText)) !== null) {
    const z = parseInt(m[1], 10);
    if (z >= 10 && z <= 200) einzel.add(z);
  }

  return { paare, einzel: Array.from(einzel).sort((a, b) => a - b), reihen };
}

/* --- Varianten je Seite ------------------------------------------------- */
function variantenFinden(seitenText) {
  const gefunden = new Map();
  VARIANTEN_MUSTER.forEach(v => {
    const re = new RegExp('\\b' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(seitenText)) gefunden.set(v.toLowerCase(), v);
  });
  return Array.from(gefunden.values());
}

/* =============================================================================
 * Auswertung einer Datei
 * ========================================================================== */
function dateiAuswerten(datei) {
  const text = pdfText(datei);
  const s = seiten(text);
  const ergebnis = {
    datei: path.basename(datei),
    seiten: s.length,
    zeichen: text.length,
    bauteile: [], laengenpaare: [], laengenreihen: [],
    einzelmasse: new Set(), varianten: new Set(),
    leereSeiten: 0
  };

  s.forEach((seite, i) => {
    const nr = i + 1;
    if (seite.trim().length < 20) { ergebnis.leereSeiten++; return; }
    bauteileFinden(seite, nr).forEach(b => ergebnis.bauteile.push(b));
    const l = laengenFinden(seite, nr);
    l.paare.forEach(p => ergebnis.laengenpaare.push(p));
    l.reihen.forEach(r => ergebnis.laengenreihen.push(r));
    l.einzel.forEach(z => ergebnis.einzelmasse.add(z));
    variantenFinden(seite).forEach(v => ergebnis.varianten.add(v));
  });

  ergebnis.einzelmasse = Array.from(ergebnis.einzelmasse).sort((a, b) => a - b);
  ergebnis.varianten = Array.from(ergebnis.varianten).sort();
  return ergebnis;
}

/* --- Bauteilkandidaten zusammenfassen ----------------------------------- */
function bauteileVerdichten(funde) {
  const nachBegriff = new Map();
  funde.forEach(f => {
    const schluessel = f.art + '|' + f.begriff.toLowerCase();
    if (!nachBegriff.has(schluessel)) {
      nachBegriff.set(schluessel, {
        art: f.art, begriff: f.begriff, anzahl: 0, seiten: new Set(), beispiele: []
      });
    }
    const e = nachBegriff.get(schluessel);
    e.anzahl++;
    e.seiten.add(f.seite);
    if (e.beispiele.length < 3) e.beispiele.push('S.' + f.seite + ': ' + f.zeile.slice(0, 100));
  });
  return Array.from(nachBegriff.values())
    .map(e => ({ ...e, seiten: Array.from(e.seiten).sort((a, b) => a - b) }))
    .sort((a, b) => b.anzahl - a.anzahl);
}

/* --- Längenraster ableiten ---------------------------------------------- */
function rasterAbleiten(ergebnis) {
  /* Regelmäßige Reihen sind die verlässlichste Quelle */
  const regelmaessig = ergebnis.laengenreihen.filter(r => r.regelmaessig);
  const nachSchritt = new Map();
  regelmaessig.forEach(r => {
    const s = r.schritt;
    if (!nachSchritt.has(s)) nachSchritt.set(s, { schritt: s, min: Infinity, max: -Infinity, treffer: 0, seiten: new Set() });
    const e = nachSchritt.get(s);
    e.min = Math.min(e.min, r.zahlen[0]);
    e.max = Math.max(e.max, r.zahlen[r.zahlen.length - 1]);
    e.treffer++;
    e.seiten.add(r.seite);
  });

  /* Aus Längenpaaren die tatsächlich vorkommenden Werte je Seite sammeln */
  const aussen = new Set(), innen = new Set();
  ergebnis.laengenpaare.forEach(p => { aussen.add(p.aussen); innen.add(p.innen); });

  return {
    schrittKandidaten: Array.from(nachSchritt.values())
      .filter(e => e.treffer >= 2)
      .map(e => ({ ...e, seiten: Array.from(e.seiten).slice(0, 8) }))
      .sort((a, b) => b.treffer - a.treffer),
    ausPaaren: {
      aussen: Array.from(aussen).sort((a, b) => a - b),
      innen: Array.from(innen).sort((a, b) => a - b),
      anzahlPaare: ergebnis.laengenpaare.length
    }
  };
}

/* =============================================================================
 * Bericht und Entwurf
 * ========================================================================== */
function berichtErzeugen(ergebnisse) {
  const zeilen = [];
  const t = (s = '') => zeilen.push(s);

  t('KATALOG-AUSWERTUNG');
  t('='.repeat(70));
  t('Erzeugt: ' + new Date().toLocaleString('de-DE'));
  t('');
  t('Dieser Bericht ist eine Lesehilfe, kein fertiger Katalog.');
  t('Jede Angabe ist mit Seitenzahl belegt und muss gegen das PDF geprüft');
  t('werden, bevor sie in den Katalog übernommen wird.');
  t('');

  ergebnisse.forEach(e => {
    t('');
    t('-'.repeat(70));
    t('DATEI: ' + e.datei);
    t('-'.repeat(70));
    t('Seiten: ' + e.seiten + '  |  Textzeichen: ' + e.zeichen.toLocaleString('de-DE') +
      '  |  Seiten ohne Text: ' + e.leereSeiten);
    if (e.zeichen < e.seiten * 200) {
      t('');
      t('!! ACHTUNG: sehr wenig Text je Seite. Das PDF besteht vermutlich aus');
      t('   Bildern (Scan). Eine Textauswertung ist dann nicht möglich.');
    }

    t('');
    t('GEFUNDENE BAUTEILBEGRIFFE');
    const verdichtet = bauteileVerdichten(e.bauteile);
    if (!verdichtet.length) { t('  (keine)'); }
    verdichtet.slice(0, 40).forEach(b => {
      t('  [' + b.art.padEnd(9) + '] ' + b.begriff.padEnd(26) +
        String(b.anzahl).padStart(4) + '×  Seiten: ' +
        b.seiten.slice(0, 10).join(', ') + (b.seiten.length > 10 ? ' …' : ''));
    });
    if (verdichtet.length > 40) t('  … und ' + (verdichtet.length - 40) + ' weitere');

    t('');
    t('LÄNGENRASTER — KANDIDATEN');
    const raster = rasterAbleiten(e);
    if (!raster.schrittKandidaten.length) {
      t('  Keine regelmäßige Zahlenreihe gefunden.');
    }
    raster.schrittKandidaten.forEach(k => {
      t('  Schrittweite ' + k.schritt + ' mm  von ' + k.min + ' bis ' + k.max +
        '  (' + k.treffer + ' Reihen, Seiten ' + k.seiten.join(', ') + ')');
    });
    t('');
    t('  Aus Längenpaaren (z. B. "31/31"):  ' + raster.ausPaaren.anzahlPaare + ' Paare');
    if (raster.ausPaaren.aussen.length) {
      t('    Außenmaße: ' + raster.ausPaaren.aussen.join(', '));
      t('    Innenmaße: ' + raster.ausPaaren.innen.join(', '));
    }
    if (e.einzelmasse.length) {
      t('  Alle erkannten Einzelmaße: ' + e.einzelmasse.join(', '));
    }

    t('');
    t('AUSFÜHRUNGEN / OPTIONEN IM TEXT');
    t('  ' + (e.varianten.length ? e.varianten.join(' · ') : '(keine)'));

    t('');
    t('BELEGSTELLEN (zum Nachschlagen im PDF)');
    verdichtet.slice(0, 12).forEach(b => {
      b.beispiele.forEach(bsp => t('  ' + bsp));
    });
  });

  t('');
  t('='.repeat(70));
  t('NÄCHSTER SCHRITT: Die Kandidaten oben gegen das PDF prüfen und in die');
  t('Katalogdatei übernehmen. Nur belegte Werte eintragen.');
  return zeilen.join('\n');
}

/* Erzeugt ein Katalog-Gerüst mit den Funden als Vorschlag (auskommentiert
 * durch das Feld "zuPruefen": nichts davon gilt als bestätigt). */
function entwurfErzeugen(ergebnisse, systemId) {
  const alleBauteile = [];
  ergebnisse.forEach(e => bauteileVerdichten(e.bauteile).forEach(b => alleBauteile.push({ ...b, datei: e.datei })));

  const zusammen = new Map();
  alleBauteile.forEach(b => {
    const k = b.art + '|' + b.begriff.toLowerCase();
    if (!zusammen.has(k)) zusammen.set(k, b);
    else zusammen.get(k).anzahl += b.anzahl;
  });

  const raster = ergebnisse.map(e => rasterAbleiten(e));
  const besterSchritt = raster.flatMap(r => r.schrittKandidaten)
    .sort((a, b) => b.treffer - a.treffer)[0] || null;

  const bauteile = Array.from(zusammen.values())
    .filter(b => b.anzahl >= 2)
    .sort((a, b) => b.anzahl - a.anzahl)
    .map(b => {
      const eintrag = {
        id: b.begriff.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-'),
        bezeichnung: b.begriff,
        art: b.art,
        zuPruefen: true,
        belegSeiten: b.seiten.slice(0, 12)
      };
      if (b.art === 'zylinder' && besterSchritt) {
        eintrag.laengenRaster = {
          aussen: { min: besterSchritt.min, max: besterSchritt.max, schritt: besterSchritt.schritt },
          innen:  { min: besterSchritt.min, max: besterSchritt.max, schritt: besterSchritt.schritt },
          zuPruefen: true
        };
      }
      return eintrag;
    });

  const varianten = Array.from(new Set(ergebnisse.flatMap(e => e.varianten)));

  return {
    typ: 'schliessanlagen-produktkatalog',
    version: 1,
    quelle: ergebnisse.map(e => e.datei).join(', '),
    stand: '',
    erstellt: new Date().toISOString(),
    hinweis: 'ENTWURF aus PDF-Auswertung. Alle Einträge mit "zuPruefen": true sind ' +
             'unbestätigte Vorschläge und müssen gegen den Katalog geprüft werden.',
    gefundeneVarianten: varianten,
    systeme: {
      [systemId || 'BITTE-SYSTEM-ID-EINTRAGEN']: { bauteile: bauteile }
    }
  };
}

/* =============================================================================
 * Aufruf
 * ========================================================================== */
function main(argv) {
  const dateien = [];
  let systemId = null, ausgabe = null, berichtDatei = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--system') systemId = argv[++i];
    else if (argv[i] === '--out') ausgabe = argv[++i];
    else if (argv[i] === '--bericht') berichtDatei = argv[++i];
    else dateien.push(argv[i]);
  }
  if (!dateien.length) {
    console.log('Aufruf: node tools/katalog-extrakt.js <datei.pdf> [...] ' +
                '[--system <id>] [--out <ziel.json>] [--bericht <bericht.txt>]');
    process.exit(1);
  }

  const ergebnisse = dateien.map(d => {
    process.stderr.write('Lese ' + path.basename(d) + ' …\n');
    return dateiAuswerten(d);
  });

  const bericht = berichtErzeugen(ergebnisse);
  if (berichtDatei) { fs.writeFileSync(berichtDatei, bericht, 'utf8'); console.error('Bericht: ' + berichtDatei); }
  else { console.log(bericht); }

  if (ausgabe) {
    fs.writeFileSync(ausgabe, JSON.stringify(entwurfErzeugen(ergebnisse, systemId), null, 2), 'utf8');
    console.error('Katalogentwurf: ' + ausgabe);
  }
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { dateiAuswerten, bauteileVerdichten, rasterAbleiten, berichtErzeugen,
                   entwurfErzeugen, laengenFinden, bauteileFinden, variantenFinden };
