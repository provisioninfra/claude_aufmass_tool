#!/usr/bin/env node
/* =============================================================================
 * aufmass-mcp.js — MCP-Server für das Aufmaß-Werkzeug (Claude Code)
 *
 * Spricht das Model Context Protocol über stdin/stdout (eine JSON-RPC-
 * Nachricht je Zeile) und stellt die Aufmaße der gemeinsamen Ablage als
 * Werkzeuge bereit: Projekte, Gliederung, Türen, Schließplan, Berichte.
 * Ausgewiesen wird es mit einem Zugangsschlüssel, den eine Person im
 * Werkzeug unter Einstellungen erzeugt hat - kein Browser, keine Anmeldung.
 *
 * Einrichten (eine Zeile, im Terminal):
 *   claude mcp add aufmass \
 *     --env AUFMASS_URL=https://www.provision-infra.de \
 *     --env AUFMASS_SCHLUESSEL=aufm_… \
 *     -- node /pfad/zu/aufmass-anbindung/aufmass-mcp.js
 *
 * Jede Änderung liest, ändert und speichert mit der gelesenen Version;
 * speichert zwischendurch jemand anderes, wird dreiseitig zusammengeführt
 * wie im Werkzeug. Keine Abhängigkeiten, Node 18 oder neuer.
 * ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const C = require('./aufmass-client.js');
const M = C.Model, K = C.Katalog, Z = C.Zusammenfuehren;

/* --- Hilfsmittel für Texte -------------------------------------------- */
const NUR_TEXT = (w) => (w === null || w === undefined) ? '' : String(w);
function zeilen(liste) { return liste.join('\n'); }
function datum(iso) { return iso ? String(iso).replace('T', ' ').slice(0, 16) : '–'; }

const STAMMDATEN = ['name', 'kunde', 'kundenNr', 'objekt', 'strasse', 'plz', 'ort', 'ansprechpartner', 'telefon', 'email',
  'anlagenNr', 'bearbeiter', 'anlagenart', 'systemMechanik', 'systemElektronik', 'systemDetail', 'aufmassDatum',
  'bemerkung', 'lieferAdresse', 'kommission'];

/* Auswahllisten je Türfeld - zur Prüfung und für katalog_lesen. */
const listenWerte = (liste) => (liste || []).map(x => (x && typeof x === 'object') ? (x.id !== undefined ? x.id : (x.wert !== undefined ? x.wert : x.label)) : x).map(String);
const TUERLISTEN = {
  kategorie: K.TUERKATEGORIEN, status: K.STATUS, tuerTechnologie: K.TECHNOLOGIE,
  zylinderBauform: K.ZYLINDER_BAUFORM, zylinderAusfuehrung: K.ZYLINDER_AUSFUEHRUNG, zylinderKnaufseite: K.KNAUFSEITE,
  masseAussen: K.ZYLINDER_LAENGE, masseInnen: K.ZYLINDER_LAENGE,
  beschlagBauform: K.BESCHLAG_BAUFORM, beschlagBestueckung: K.BESCHLAG_BESTUECKUNG, beschlagSicherheit: K.BESCHLAG_SICHERHEIT,
  beschlagOptionen: K.BESCHLAG_OPTIONEN, beschlagAusfuehrung: K.BESCHLAG_AUSFUEHRUNG,
  schlossBauform: K.SCHLOSS_BAUFORM, schlossFunktion: K.SCHLOSS_FUNKTION, schlossStulpform: K.STULPFORM,
  schlossFallenart: K.FALLENART, schlossNorm: K.SCHLOSS_NORM, schlossStulpbreite: K.STULPBREITE,
  schlossStulplaenge: K.STULPLAENGE, schlossVerriegelungspunkte: K.VERRIEGELUNGSPUNKTE, schlossRiegelausschluss: K.RIEGELAUSSCHLUSS,
  tuerblattstaerke: K.TUERBLATTSTAERKE, dornmass: K.DORNMASS, entfernung: K.ENTFERNUNG, vierkant: K.VIERKANT,
  profilbreite: K.PROFILBREITE, tuerbreite: K.TUERBREITE, tuerhoehe: K.TUERHOEHE, tuerAnschlag: K.TUER_ANSCHLAG,
  tuermaterial: K.TUERMATERIAL, dinRichtung: K.DIN_RICHTUNG, oeffnungsrichtung: K.TUER_OEFFNUNG, elKabeluebergang: K.KABELUEBERGANG
};
const VORLAGE_TUER = M.neueTuer();
const TUERFELDER = Object.keys(VORLAGE_TUER).filter(k => ['id', 'fotos', 'geaendert', 'statusVonHand'].indexOf(k) === -1);

function feldName(k) { return Z.feldName(k); }

/* --- Projektdaten lesbar machen --------------------------------------- */
function gliederungText(p) {
  const aus = [];
  (function lauf(parentId, tiefe) {
    if (tiefe > 12) return;
    M.kinderVon(p, parentId).forEach(k => {
      const n = M.tuerenUnter(p, k.id).length;
      aus.push('  '.repeat(tiefe) + '- ' + k.name + '  [' + k.ebene + ', id ' + k.id + ', ' + n + (n === 1 ? ' Tür' : ' Türen') + ']');
      lauf(k.id, tiefe + 1);
    });
  })(null, 0);
  return aus.length ? zeilen(aus) : '(keine Gliederung angelegt)';
}

function tuerKurz(p, t) {
  const offen = M.pflichtfelder(p, t).length;
  return [t.nummer || '(ohne Nr.)', t.bezeichnung || '(ohne Bezeichnung)',
    'Bereich: ' + (t.strukturId ? (M.strukturPfadText(p, t.strukturId) || 'unbekannt') : (t.etage || 'ohne Zuordnung')),
    'Status: ' + (t.status || 'offen') + (offen ? ' (' + offen + ' Pflichtangabe' + (offen === 1 ? '' : 'n') + ' offen)' : ''),
    (t.anzahl && t.anzahl > 1) ? t.anzahl + ' baugleiche' : null,
    'id ' + t.id].filter(Boolean).join(' | ');
}

function tuerVoll(p, t) {
  const aus = { id: t.id };
  TUERFELDER.forEach(k => {
    const w = t[k];
    if (w === '' || w === null || w === undefined || (Array.isArray(w) && !w.length) || w === false) return;
    aus[k] = w;
  });
  aus.bereich = t.strukturId ? M.strukturPfadText(p, t.strukturId) : '';
  aus.fotos = (t.fotos || []).length;
  aus.pflichtOffen = M.pflichtfelder(p, t).map(f => f.label || f.schluessel);
  return aus;
}

function stammdatenText(p) {
  return STAMMDATEN.map(k => p[k] ? feldName(k) + ': ' + NUR_TEXT(p[k]) : null).filter(Boolean).join('\n');
}

function spaltenText(p) {
  return (p.schliessungen || []).map(s => {
    const art = s.art === 'gruppe' ? 'Gruppe' : (s.art === 'mitarbeiter' ? 'Mitarbeiter' : ('Schließung' + (s.typ ? ' ' + s.typ : '')));
    return (s.kuerzel || '?') + ' = ' + (s.bezeichnung || '') + ' [' + art + ', Medien: ' + M.medienAnzahl(p, s) + ', id ' + s.id + ']';
  }).join('\n') || '(keine Spalten)';
}

function schliessplanText(p) {
  const spalten = p.schliessungen || [];
  if (!spalten.length) return 'Der Schließplan hat noch keine Spalten.';
  const kopf = ['Tür'].concat(spalten.map(s => s.kuerzel || '?'));
  const reihen = [kopf];
  (M.tuerenGruppiert ? M.tuerenGruppiert(p) : [{ tueren: p.tueren }]).forEach(g => {
    if (g.titel) reihen.push(['— ' + g.titel]);
    g.tueren.forEach(t => {
      reihen.push([(t.nummer || '') + ' ' + (t.bezeichnung || '')].concat(spalten.map(s => {
        const w = M.getBerechtigung(p, t.id, s.id);
        return w === 'nein' ? '·' : (K.berechtigungZeichen(w) || w);
      })));
    });
  });
  const breiten = kopf.map((_, i) => Math.max(...reihen.map(r => (r[i] || '').length)));
  return zeilen(reihen.map(r => r.map((z, i) => (z || '').padEnd(breiten[i] || 0)).join('  ').trimEnd()))
    + '\n\nZeichen: X = berechtigt, Z = zeitbeschränkt, T = temporär, – = gesperrt, · = nicht berechtigt.';
}

/* --- Nachschlagen ------------------------------------------------------ */
function tuerFinden(p, arg) {
  const id = arg.tuerId, nr = arg.nummer;
  let t = id ? p.tueren.find(x => x.id === id) : null;
  if (!t && nr !== undefined && nr !== '') {
    const treffer = p.tueren.filter(x => String(x.nummer || '').toLowerCase() === String(nr).toLowerCase());
    if (treffer.length > 1) throw new Error('Die Nummer „' + nr + '“ gibt es ' + treffer.length + ' Mal - bitte die tuerId angeben: ' + treffer.map(x => x.id).join(', '));
    t = treffer[0] || null;
  }
  if (!t) throw new Error('Diese Tür gibt es im Aufmaß nicht (tuerId ' + JSON.stringify(id || '') + ', nummer ' + JSON.stringify(nr || '') + '). tueren_auflisten zeigt alle.');
  return t;
}
function knotenFinden(p, arg) {
  if (!arg) return null;
  const direkt = p.standorte.find(k => k.id === arg);
  if (direkt) return direkt;
  const nachName = p.standorte.filter(k => String(k.name || '').toLowerCase() === String(arg).toLowerCase());
  if (nachName.length === 1) return nachName[0];
  if (nachName.length > 1) throw new Error('Den Bereich „' + arg + '“ gibt es mehrfach - bitte die id angeben: ' + nachName.map(k => k.id + ' (' + M.strukturPfadText(p, k.id) + ')').join('; '));
  /* auch ein Pfad „Standort › Gebäude › Bereich“ */
  const pfad = p.standorte.find(k => M.strukturPfadText(p, k.id).toLowerCase() === String(arg).toLowerCase().replace(/\s*>\s*|\s*\/\s*/g, ' › '));
  if (pfad) return pfad;
  throw new Error('Den Bereich „' + arg + '“ gibt es nicht. gliederung_lesen zeigt alle Einträge mit ihren ids.');
}
function spalteFinden(p, arg) {
  const direkt = p.schliessungen.find(x => x.id === arg);
  if (direkt) return direkt;
  const treffer = p.schliessungen.filter(x => String(x.kuerzel || '').toLowerCase() === String(arg).toLowerCase());
  if (treffer.length > 1) throw new Error('Das Kürzel „' + arg + '“ gibt es ' + treffer.length + ' Mal - bitte die id angeben: ' + treffer.map(x => x.id + ' (' + (x.bezeichnung || '') + ')').join('; '));
  if (!treffer.length) throw new Error('Die Spalte „' + arg + '“ gibt es nicht. schliessplan_lesen zeigt alle Spalten mit Kürzel und id.');
  return treffer[0];
}

/* Türfelder prüfen und eintragen; liefert Hinweise. */
function tuerFelderEintragen(p, t, felder) {
  if (!felder || typeof felder !== 'object' || Array.isArray(felder)) throw new Error('„felder“ muss ein Objekt mit Feldname → Wert sein.');
  const hinweise = [];
  Object.keys(felder).forEach(k => {
    if (k === 'strukturId' || k === 'bereich' || k === 'gleichschliessendMit') return;   /* eigens unten */
    if (TUERFELDER.indexOf(k) === -1) {
      throw new Error('Unbekanntes Türfeld „' + k + '“. Erlaubt sind: ' + TUERFELDER.join(', ') + ' (katalog_lesen nennt Bedeutung und Werte).');
    }
    let w = felder[k];
    const vorlage = VORLAGE_TUER[k];
    if (Array.isArray(vorlage)) {
      if (!Array.isArray(w)) w = (w === '' || w === null || w === undefined) ? [] : [w];
      w = w.map(String);
    } else if (typeof vorlage === 'boolean') {
      w = (w === true || w === 'true' || w === 'ja' || w === 1 || w === '1');
    } else if (typeof vorlage === 'number') {
      const n = parseInt(w, 10); if (isNaN(n)) throw new Error('Das Feld „' + k + '“ erwartet eine Zahl.');
      w = n;
    } else {
      w = (w === null || w === undefined) ? '' : String(w);
    }
    if (TUERLISTEN[k] && w !== '' && !(Array.isArray(w) && !w.length)) {
      const erlaubt = listenWerte(TUERLISTEN[k]);
      const werte = Array.isArray(w) ? w : [w];
      werte.forEach(x => {
        if (erlaubt.indexOf(String(x)) === -1) {
          if (k === 'status') {
            const nachLabel = (K.STATUS || []).find(s => String(s.label).toLowerCase() === String(x).toLowerCase());
            if (nachLabel) { w = nachLabel.id; return; }
            throw new Error('Unbekannter Status „' + x + '“. Möglich: ' + erlaubt.join(', '));
          }
          hinweise.push('„' + x + '“ steht nicht in der Auswahlliste von ' + feldName(k) + ' (' + erlaubt.slice(0, 12).join(', ') + (erlaubt.length > 12 ? ', …' : '') + ') - eingetragen als freier Wert.');
        }
      });
    }
    t[k] = w;
    if (k === 'status') t.statusVonHand = true;
  });
  if (felder.gleichschliessendMit !== undefined) {
    const ziel = felder.gleichschliessendMit ? tuerFinden(p, /^tur-/.test(String(felder.gleichschliessendMit)) ? { tuerId: felder.gleichschliessendMit } : { nummer: felder.gleichschliessendMit }) : null;
    if (!M.gleichschliessendSetzen(p, t.id, ziel ? ziel.id : '')) throw new Error('Diese Gleichschließung ist nicht möglich (Kreis oder eigene Schließung).');
  }
  const bereich = felder.bereich !== undefined ? felder.bereich : felder.strukturId;
  if (bereich !== undefined) {
    if (bereich === '' || bereich === null) { t.strukturId = null; }
    else { t.strukturId = knotenFinden(p, bereich).id; }
  }
  if (!t.statusVonHand) M.statusAusPruefung(p, t);
  t.geaendert = new Date().toISOString();
  return hinweise;
}

/* --- Die Werkzeuge ------------------------------------------------------ */
let client = null;
function verbindung() {
  if (!client) client = C.verbinden({});
  return client;
}
const O = (eigenschaften, pflicht) => ({ type: 'object', properties: eigenschaften, required: pflicht || [], additionalProperties: false });
const S = (beschreibung, extra) => Object.assign({ type: 'string', description: beschreibung }, extra || {});
const PROJEKT = S('Kennung des Aufmaßes (projektId aus projekte_auflisten)');

const WERKZEUGE = [
  {
    name: 'zugang_pruefen',
    beschreibung: 'Prüft den Zugangsschlüssel: Wer bin ich, was darf der Schlüssel (lesen oder schreiben), welche Fassung läuft auf dem Server. Sinnvoll als erster Aufruf.',
    schema: O({}),
    ausfuehren: async () => {
      const d = await verbindung().ich();
      const s = d.schluessel || {};
      return zeilen(['Server: ' + verbindung().basis + ' (Plugin ' + (d.version || '?') + ')',
        'Angemeldet als: ' + (d.benutzer ? d.benutzer.name + ' <' + d.benutzer.email + '> (' + d.benutzer.rolle + ')' : 'niemand'),
        'Zugang: ' + (d.zugang || '?') + (s.name ? ' „' + s.name + '“' : ''),
        'Rechte des Schlüssels: ' + (s.rechte === 'schreiben' ? 'lesen und schreiben' : 'nur lesen'),
        'Gültig bis: ' + datum(s.gueltigBis),
        (d.version && String(d.version).replace(/-test$/, '') !== C.FASSUNG) ? 'Hinweis: Dieses Paket ist Fassung ' + C.FASSUNG + ', der Server meldet ' + d.version + '. Unter Einstellungen liegt das passende Paket zum Herunterladen.' : null].filter(Boolean));
    }
  },
  {
    name: 'projekte_auflisten',
    beschreibung: 'Listet alle Aufmaße der gemeinsamen Ablage: Kennung, Kunde, Objekt, Anlagen-Nr., Version, letzte Änderung, Zuständige.',
    schema: O({}),
    ausfuehren: async () => {
      const liste = (await verbindung().projekte()).filter(p => !p.geloescht);
      if (!liste.length) return 'Es liegen keine Aufmaße auf dem Server.';
      return liste.map(p => [p.id, p.kunde || '(ohne Kunde)', p.objekt || '', p.anlagenNr ? 'Anlage ' + p.anlagenNr : '',
        'v' + p.version, 'geändert ' + datum(p.geaendertAm) + (p.geaendertVon ? ' von ' + p.geaendertVon : ''),
        'zuständig: ' + ((p.zustaendige || []).map(z => z.name).join(', ') || '–')].filter(Boolean).join(' | ')).join('\n');
    }
  },
  {
    name: 'projekt_lesen',
    beschreibung: 'Liest ein Aufmaß. umfang „kurz“ (Vorgabe): Stammdaten, Gliederung, Türen in einer Zeile je Tür, Spalten des Schließplans. umfang „voll“: das vollständige Aufmaß als JSON (ohne Bilddaten).',
    schema: O({ projektId: PROJEKT, umfang: S('kurz oder voll', { enum: ['kurz', 'voll'] }) }, ['projektId']),
    ausfuehren: async (a) => {
      const voll = await verbindung().projekt(a.projektId);
      const p = M.migriere(voll.daten); p.id = voll.id;
      if (a.umfang === 'voll') return JSON.stringify(C.ohneBilddaten(p), null, 1);
      return zeilen(['# ' + (p.kunde || p.name || voll.id) + (p.objekt ? ' – ' + p.objekt : '') + '  (projektId ' + voll.id + ', Version ' + voll.version + ')',
        '', '## Stammdaten', stammdatenText(p) || '(leer)',
        '', '## Gliederung', gliederungText(p),
        '', '## Türen (' + p.tueren.length + ')', p.tueren.length ? zeilen(M.tuerenGruppiert(p).flatMap(g => g.tueren.map(t => tuerKurz(p, t)))) : '(keine Türen)',
        '', '## Spalten des Schließplans', spaltenText(p),
        '', 'Mitarbeiter: ' + (p.mitarbeiter || []).length + ', Gruppen: ' + (p.gruppen || []).length]);
    }
  },
  {
    name: 'projekt_anlegen',
    beschreibung: 'Legt ein neues Aufmaß an. Pflicht: kunde. Weitere Stammdaten: objekt, anlagenNr, strasse, plz, ort, ansprechpartner, telefon, email, anlagenart (mechanik|elektronik|hybrid), systemMechanik, systemElektronik, bemerkung, bearbeiter.',
    schema: O({ kunde: S('Kunde oder Objektbezeichnung'), objekt: S('Objekt / Adresse'), anlagenNr: S('Anlagen-Nr.'), strasse: S(''), plz: S(''), ort: S(''),
      ansprechpartner: S(''), telefon: S(''), email: S(''), anlagenart: S('mechanik, elektronik oder hybrid', { enum: ['mechanik', 'elektronik', 'hybrid', ''] }),
      systemMechanik: S('Kennung des mechanischen Systems (katalog_lesen)'), systemElektronik: S('Kennung des elektronischen Systems'), bemerkung: S(''), bearbeiter: S('') }, ['kunde']),
    ausfuehren: async (a) => {
      const vorgabe = {};
      STAMMDATEN.forEach(k => { if (a[k] !== undefined && a[k] !== '') vorgabe[k] = String(a[k]); });
      vorgabe.name = vorgabe.name || vorgabe.kunde;
      const e = await verbindung().anlegen(vorgabe);
      return 'Aufmaß angelegt: projektId ' + e.id + ' (Version ' + (e.antwort && e.antwort.version) + '). Als Nächstes gliederung_anlegen und tuer_anlegen.';
    }
  },
  {
    name: 'stammdaten_aendern',
    beschreibung: 'Ändert Stammdaten eines Aufmaßes. felder: Objekt aus Feldname → Wert. Felder: ' + STAMMDATEN.join(', ') + '.',
    schema: O({ projektId: PROJEKT, felder: { type: 'object', description: 'Feldname → neuer Wert', additionalProperties: true } }, ['projektId', 'felder']),
    ausfuehren: async (a) => {
      const falsch = Object.keys(a.felder || {}).filter(k => STAMMDATEN.indexOf(k) === -1);
      if (falsch.length) throw new Error('Unbekannte Stammdatenfelder: ' + falsch.join(', ') + '. Erlaubt: ' + STAMMDATEN.join(', '));
      const e = await verbindung().aendern(a.projektId, (p) => { Object.keys(a.felder).forEach(k => { p[k] = NUR_TEXT(a.felder[k]); }); return Object.keys(a.felder); });
      return 'Geändert: ' + e.ergebnis.map(feldName).join(', ') + ' (jetzt Version ' + e.version + ').';
    }
  },
  {
    name: 'gliederung_lesen',
    beschreibung: 'Zeigt die Gliederung eines Aufmaßes: Standorte → Gebäude → Bereiche/Etagen mit ids und Türanzahl.',
    schema: O({ projektId: PROJEKT }, ['projektId']),
    ausfuehren: async (a) => { const v = await verbindung().projekt(a.projektId); return gliederungText(M.migriere(v.daten)); }
  },
  {
    name: 'gliederung_anlegen',
    beschreibung: 'Legt einen Eintrag der Gliederung an: ebene standort (ohne parent), gebaeude (unter einem Standort) oder bereich (unter Gebäude oder Bereich). parent: id oder eindeutiger Name des übergeordneten Eintrags.',
    schema: O({ projektId: PROJEKT, ebene: S('standort, gebaeude oder bereich', { enum: ['standort', 'gebaeude', 'bereich'] }), name: S('Bezeichnung, z. B. „Erdgeschoss“'), parent: S('id oder Name des übergeordneten Eintrags (bei standort weglassen)') }, ['projektId', 'ebene', 'name']),
    ausfuehren: async (a) => {
      const e = await verbindung().aendern(a.projektId, (p) => {
        const eltern = a.ebene === 'standort' ? null : knotenFinden(p, a.parent);
        if (a.ebene !== 'standort' && !eltern) throw new Error('Für ' + a.ebene + ' ist „parent“ nötig.');
        const k = M.neuerStrukturknoten(a.ebene, String(a.name || '').trim() || a.ebene, eltern ? eltern.id : null);
        k.sort = M.kinderVon(p, k.parentId).length;
        p.standorte.push(k);
        return k;
      });
      return 'Eintrag angelegt: ' + e.ergebnis.name + ' [' + e.ergebnis.ebene + ', id ' + e.ergebnis.id + '] (Version ' + e.version + ').';
    }
  },
  {
    name: 'tueren_auflisten',
    beschreibung: 'Listet die Türen eines Aufmaßes, je Tür eine Zeile (Nummer, Bezeichnung, Bereich, Status, offene Pflichtangaben, id). Optional suche (Text in Nummer/Bezeichnung) oder bereich (id/Name, mit Unterbereichen).',
    schema: O({ projektId: PROJEKT, suche: S('Textfilter'), bereich: S('id oder Name eines Gliederungseintrags') }, ['projektId']),
    ausfuehren: async (a) => {
      const v = await verbindung().projekt(a.projektId); const p = M.migriere(v.daten);
      let tueren = a.bereich ? M.tuerenUnter(p, knotenFinden(p, a.bereich).id) : M.tuerenGruppiert(p).flatMap(g => g.tueren);
      if (a.suche) { const s = String(a.suche).toLowerCase(); tueren = tueren.filter(t => (String(t.nummer || '') + ' ' + String(t.bezeichnung || '')).toLowerCase().indexOf(s) !== -1); }
      return tueren.length ? tueren.map(t => tuerKurz(p, t)).join('\n') : 'Keine Türen gefunden.';
    }
  },
  {
    name: 'tuer_lesen',
    beschreibung: 'Liest eine Tür mit allen gesetzten Feldern (als JSON), dem Bereich, der Fotoanzahl und den offenen Pflichtangaben. Angabe über tuerId oder nummer.',
    schema: O({ projektId: PROJEKT, tuerId: S('id der Tür'), nummer: S('Türnummer, z. B. A-EG-01') }, ['projektId']),
    ausfuehren: async (a) => { const v = await verbindung().projekt(a.projektId); const p = M.migriere(v.daten); return JSON.stringify(tuerVoll(p, tuerFinden(p, a)), null, 1); }
  },
  {
    name: 'tuer_anlegen',
    beschreibung: 'Legt eine Tür an. felder: Feldname → Wert (katalog_lesen nennt alle Felder und Auswahlwerte; typisch: bezeichnung, kategorie, zylinderBauform, masseAussen, masseInnen, tuerblattstaerke, dornmass, entfernung, notiz). bereich: id oder Name des Gliederungseintrags. Ohne nummer wird die nächste laufende Nummer vergeben.',
    schema: O({ projektId: PROJEKT, felder: { type: 'object', description: 'Feldname → Wert', additionalProperties: true }, bereich: S('id oder Name des Bereichs') }, ['projektId', 'felder']),
    ausfuehren: async (a) => {
      const e = await verbindung().aendern(a.projektId, (p) => {
        const t = M.neueTuer({ nummer: M.naechsteLaufendeNummer(p), status: 'aufgemessen' });
        const felder = Object.assign({}, a.felder || {});
        if (a.bereich) felder.bereich = a.bereich;
        p.tueren.push(t);
        let hinweise;
        try { hinweise = tuerFelderEintragen(p, t, felder); }
        catch (e) { p.tueren = p.tueren.filter(x => x.id !== t.id); M.matrixAufraeumen(p); throw e; }
        return { t, hinweise };
      });
      const { t, hinweise } = e.ergebnis;
      return 'Tür angelegt: ' + t.nummer + ' ' + (t.bezeichnung || '') + ' (tuerId ' + t.id + ', Version ' + e.version + ').' + (hinweise.length ? '\nHinweise: ' + hinweise.join(' ') : '');
    }
  },
  {
    name: 'tuer_aendern',
    beschreibung: 'Ändert Felder einer Tür (tuerId oder nummer). felder: Feldname → Wert; ein leerer Wert löscht das Feld; bereich setzt den Gliederungseintrag (id/Name).',
    schema: O({ projektId: PROJEKT, tuerId: S('id der Tür'), nummer: S('Türnummer'), felder: { type: 'object', description: 'Feldname → neuer Wert', additionalProperties: true } }, ['projektId', 'felder']),
    ausfuehren: async (a) => {
      const e = await verbindung().aendern(a.projektId, (p) => { const t = tuerFinden(p, a); const hinweise = tuerFelderEintragen(p, t, a.felder); return { t, hinweise }; });
      const { t, hinweise } = e.ergebnis;
      return 'Geändert: Tür ' + t.nummer + ' - ' + Object.keys(a.felder).map(feldName).join(', ') + ' (Version ' + e.version + ').' + (hinweise.length ? '\nHinweise: ' + hinweise.join(' ') : '');
    }
  },
  {
    name: 'tuer_loeschen',
    beschreibung: 'Löscht eine Tür samt ihrer Berechtigungen im Schließplan (tuerId oder nummer).',
    schema: O({ projektId: PROJEKT, tuerId: S('id der Tür'), nummer: S('Türnummer') }, ['projektId']),
    ausfuehren: async (a) => {
      const e = await verbindung().aendern(a.projektId, (p) => { const t = tuerFinden(p, a); p.tueren = p.tueren.filter(x => x.id !== t.id); M.matrixAufraeumen(p); return t; });
      return 'Gelöscht: Tür ' + e.ergebnis.nummer + ' ' + (e.ergebnis.bezeichnung || '') + ' (Version ' + e.version + ').';
    }
  },
  {
    name: 'schliessplan_lesen',
    beschreibung: 'Zeigt den Schließplan als Tabelle. darstellung „kreuz“ (Vorgabe): Zeilen Türen, Spalten Gruppen, Mitarbeiter und Schließungen mit X/Z/T/–/O. darstellung „euro“: die Schreibweise der Hersteller (Zyl.Nr., ESL, Spalten mit X, I, Z, M, O).',
    schema: O({ projektId: PROJEKT, darstellung: S('kreuz oder euro', { enum: ['kreuz', 'euro'] }) }, ['projektId']),
    ausfuehren: async (a) => {
      const v = await verbindung().projekt(a.projektId); const p = M.migriere(v.daten);
      if (a.darstellung === 'euro') {
        const E = require(path.join(C.LIB, 'europlan.js'));
        const e = E.europlan(p);
        return E.alsText(e) + '\n\nZeichen: X = sperrt, I = Eigenschlüssel gehört zur Gruppe, Z = Zentralzylinder, M = Mitschließung, O = vorgeplant, · = leer. ESL = Stück Eigenschlüssel.' + (e.hinweise.length ? '\nHinweise: ' + e.hinweise.join(' ') : '');
      }
      return schliessplanText(p) + '\n\nSpalten:\n' + spaltenText(p);
    }
  },
  {
    name: 'berechtigung_setzen',
    beschreibung: 'Setzt eine Berechtigung im Schließplan: Tür (tuerId/nummer) × Spalte (id/Kürzel) → wert ja, zeit, temp, sperr, plan (vorgeplant/Reserve) oder nein. Gleichschließende Türen werden mitgesetzt.',
    schema: O({ projektId: PROJEKT, tuerId: S('id der Tür'), nummer: S('Türnummer'), spalte: S('id oder Kürzel der Spalte'), wert: S('ja, zeit, temp, sperr, plan (vorgeplant) oder nein', { enum: ['ja', 'zeit', 'temp', 'sperr', 'plan', 'nein'] }) }, ['projektId', 'spalte', 'wert']),
    ausfuehren: async (a) => {
      const e = await verbindung().aendern(a.projektId, (p) => { const t = tuerFinden(p, a); const s = spalteFinden(p, a.spalte); M.berechtigungSetzenVerbund(p, t.id, s.id, a.wert); return { t, s }; });
      return 'Berechtigung gesetzt: ' + e.ergebnis.t.nummer + ' × ' + e.ergebnis.s.kuerzel + ' = ' + a.wert + ' (Version ' + e.version + ').';
    }
  },
  {
    name: 'spalte_anlegen',
    beschreibung: 'Legt eine Spalte im Schließplan an. art gruppe: name (Mitglieder später per Werkzeug); art mitarbeiter: name, funktion; art schliessung: kuerzel, bezeichnung, typ (ghs, hs, gs, ugs, ez, extern).',
    schema: O({ projektId: PROJEKT, art: S('gruppe, mitarbeiter oder schliessung', { enum: ['gruppe', 'mitarbeiter', 'schliessung'] }), name: S('Name der Gruppe oder des Mitarbeiters'), funktion: S('Funktion (Mitarbeiter)'),
      kuerzel: S('Kürzel der Spalte'), bezeichnung: S('Bezeichnung (Schließung)'), typ: S('Rang im Plan bei Schließung', { enum: ['ghs', 'hs', 'gs', 'ugs', 'ez', 'extern', ''] }) }, ['projektId', 'art']),
    ausfuehren: async (a) => {
      const e = await verbindung().aendern(a.projektId, (p) => {
        if (a.art === 'gruppe') {
          const name = String(a.name || '').trim(); if (!name) throw new Error('Eine Gruppe braucht einen Namen.');
          if (p.gruppen.some(g => String(g.name).toLowerCase() === name.toLowerCase())) throw new Error('Eine Gruppe „' + name + '“ gibt es schon.');
          const g = M.neueGruppe({ name }); p.gruppen.push(g);
          const s = M.spalteFuer(p, 'gruppe', g.id); s.kuerzel = M.kuerzelEindeutig(p, a.kuerzel || s.kuerzel || M.kuerzelAus(name), s.id);
          M.spaltenAngleichen(p); return s;
        }
        if (a.art === 'mitarbeiter') {
          const name = String(a.name || '').trim(); if (!name) throw new Error('Ein Mitarbeiter braucht einen Namen.');
          const m = M.neuerMitarbeiter({ name, funktion: String(a.funktion || '') }); p.mitarbeiter.push(m);
          const s = M.spalteFuer(p, 'mitarbeiter', m.id); s.kuerzel = M.kuerzelEindeutig(p, a.kuerzel || s.kuerzel || M.kuerzelAus(name), s.id);
          M.spaltenAngleichen(p); return s;
        }
        const s = M.neueSchliessung({ kuerzel: M.kuerzelEindeutig(p, String(a.kuerzel || a.bezeichnung || 'S').slice(0, 12)), bezeichnung: String(a.bezeichnung || a.name || ''), typ: a.typ || '' });
        s.sort = p.schliessungen.length; p.schliessungen.push(s); return s;
      });
      return 'Spalte angelegt: ' + e.ergebnis.kuerzel + ' = ' + (e.ergebnis.bezeichnung || '') + ' (id ' + e.ergebnis.id + ', Version ' + e.version + ').';
    }
  },
  {
    name: 'bericht_erzeugen',
    beschreibung: 'Erzeugt einen PDF-Bericht und schreibt ihn als Datei: art tuerliste (modus kompakt|detail, mitFotos), schliessplan, materialliste oder pruefprotokoll. pfad: Datei oder Ordner (Vorgabe: Arbeitsordner). firma/firmaZusatz für den Kopf.',
    schema: O({ projektId: PROJEKT, art: S('tuerliste, schliessplan, materialliste, pruefprotokoll', { enum: ['tuerliste', 'schliessplan', 'materialliste', 'pruefprotokoll'] }),
      modus: S('kompakt oder detail (Türliste)', { enum: ['kompakt', 'detail'] }), mitFotos: { type: 'boolean', description: 'Fotos einbetten (Türliste detail)' },
      pfad: S('Zieldatei oder Zielordner (~ erlaubt)'), ueberschreiben: { type: 'boolean', description: 'vorhandene Datei ersetzen' }, firma: S('Firmenname für den Kopf'), firmaZusatz: S('Zusatzzeile') }, ['projektId', 'art']),
    ausfuehren: async (a) => {
      require(path.join(C.LIB, 'pdf.js'));
      const Reports = require(path.join(C.LIB, 'reports.js'));
      const v = await verbindung().projekt(a.projektId); const p = M.migriere(v.daten); p.id = v.id;
      if (a.mitFotos) await verbindung().fotosLaden(p);
      const eins = { firma: a.firma || process.env.AUFMASS_FIRMA || '', firmaZusatz: a.firmaZusatz || process.env.AUFMASS_FIRMA_ZUSATZ || '' };
      const doc = a.art === 'tuerliste' ? Reports.tuerliste(p, eins, { modus: a.modus || 'detail', mitFotos: !!a.mitFotos })
        : (a.art === 'schliessplan' ? Reports.schliessplan(p, eins) : (a.art === 'materialliste' ? Reports.materialliste(p, eins) : Reports.pruefprotokoll(p, eins)));
      const bytes = Buffer.from(doc.build());
      const name = Reports.dateiName(p, { tuerliste: 'Tuerliste', schliessplan: 'Schliessplan', materialliste: 'Materialliste', pruefprotokoll: 'Pruefprotokoll' }[a.art]);
      const heim = process.env.HOME || process.env.USERPROFILE || '';
      let ziel = a.pfad ? String(a.pfad).trim() : '';
      if (ziel === '~' || ziel.startsWith('~/') || ziel.startsWith('~\\')) ziel = path.join(heim, ziel.slice(1));
      ziel = ziel ? path.resolve(ziel) : path.resolve(process.env.AUFMASS_AUSGABE || process.cwd());
      if (fs.existsSync(ziel)) {
        const st = fs.statSync(ziel);
        if (st.isDirectory()) ziel = path.join(ziel, name);
        else if (!/\.pdf$/i.test(ziel)) throw new Error('„' + ziel + '“ ist eine vorhandene Datei, aber keine PDF - bitte einen Ordner oder einen Dateinamen mit .pdf angeben.');
        else if (a.ueberschreiben !== true) throw new Error('„' + ziel + '“ gibt es schon. Zum Ersetzen ueberschreiben: true angeben.');
      } else if (!/\.pdf$/i.test(ziel)) { fs.mkdirSync(ziel, { recursive: true }); ziel = path.join(ziel, name); }
      if (fs.existsSync(ziel) && a.ueberschreiben !== true) throw new Error('„' + ziel + '“ gibt es schon. Zum Ersetzen ueberschreiben: true angeben.');
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.writeFileSync(ziel, bytes);
      return 'Bericht geschrieben: ' + ziel + ' (' + doc.seitenAnzahl() + ' Seiten, ' + Math.round(bytes.length / 1024) + ' KB).';
    }
  },
  {
    name: 'katalog_lesen',
    beschreibung: 'Nennt die Türfelder mit Bedeutung und Auswahlwerten, die Stammdatenfelder, Status, Spaltenarten, Berechtigungen und die bekannten Schließsysteme - zum korrekten Befüllen.',
    schema: O({ bereich: S('felder, systeme oder alles', { enum: ['felder', 'systeme', 'alles'] }) }),
    ausfuehren: async (a) => {
      const teile = [];
      if (!a.bereich || a.bereich === 'felder' || a.bereich === 'alles') {
        teile.push('## Türfelder (Feldname: Bedeutung [Auswahlwerte])');
        TUERFELDER.forEach(k => {
          const liste = TUERLISTEN[k] ? listenWerte(TUERLISTEN[k]) : null;
          const art = Array.isArray(VORLAGE_TUER[k]) ? 'Liste' : typeof VORLAGE_TUER[k];
          teile.push('- ' + k + ': ' + feldName(k) + (art !== 'string' ? ' (' + art + ')' : '') + (liste ? ' [' + liste.join(', ') + ']' : ''));
        });
        teile.push('', '## Stammdaten', STAMMDATEN.map(k => '- ' + k + ': ' + feldName(k)).join('\n'));
        teile.push('', '## Berechtigungen im Schließplan', (K.BERECHTIGUNG || []).map(b => '- ' + b.id + ' = ' + b.label).join('\n'));
        teile.push('', '## Spaltenarten', 'gruppe (alle Mitglieder berechtigt), mitarbeiter (einzelne Person), schliessung (Rang: ' + listenWerte(K.SCHLIESSUNG_TYPEN).join(', ') + ')');
      }
      if (a.bereich === 'systeme' || a.bereich === 'alles') {
        teile.push('', '## Schließsysteme (Kennung: Name, Technologie)');
        (K.SYSTEME || []).forEach(s => teile.push('- ' + s.id + ': ' + (s.label || s.name) + ' [' + (s.technologie || s.typ || '') + ']'));
        teile.push('', 'Anlagenart: ' + listenWerte(K.ANLAGENART).join(', '));
      }
      return zeilen(teile);
    }
  }
];

/* Pflichtfelder und Aufzählungen des Schemas prüfen - Claude hält sich daran,
   ein Tippfehler wie wert: "yes" soll aber nicht still in der Matrix landen. */
function schemaPruefen(schema, args) {
  const maengel = [];
  if (!schema || typeof args !== 'object' || args === null || Array.isArray(args)) return ['Die Argumente müssen ein Objekt sein.'];
  (schema.required || []).forEach(k => { if (args[k] === undefined || args[k] === null || args[k] === '') maengel.push('„' + k + '“ fehlt.'); });
  Object.keys(args).forEach(k => {
    const e = schema.properties && schema.properties[k];
    if (!e) { if (schema.additionalProperties === false) maengel.push('Unbekanntes Argument „' + k + '“.'); return; }
    const v = args[k];
    if (v === undefined || v === null || v === '') return;
    if (e.enum && e.enum.indexOf(v) === -1) maengel.push('„' + k + '“ muss einer von ' + e.enum.filter(x => x !== '').join(', ') + ' sein (nicht „' + v + '“).');
    if (e.type === 'string' && typeof v !== 'string') maengel.push('„' + k + '“ muss Text sein.');
    if (e.type === 'boolean' && typeof v !== 'boolean') maengel.push('„' + k + '“ muss true oder false sein.');
    if (e.type === 'object' && (typeof v !== 'object' || Array.isArray(v))) maengel.push('„' + k + '“ muss ein Objekt sein.');
  });
  return maengel;
}

/* --- JSON-RPC über stdin/stdout ---------------------------------------- */
function senden(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function antwort(id, result) { senden({ jsonrpc: '2.0', id, result }); }
function fehlerAntwort(id, code, message) { senden({ jsonrpc: '2.0', id, error: { code, message } }); }
const PROTOKOLLE = ['2024-11-05', '2025-03-26', '2025-06-18'];

async function verarbeiten(zeile) {
  let n;
  try { n = JSON.parse(zeile); } catch (e) { return fehlerAntwort(null, -32700, 'Parse error'); }
  if (!n || n.jsonrpc !== '2.0' || typeof n.method !== 'string') { if (n && n.id !== undefined) fehlerAntwort(n.id, -32600, 'Invalid Request'); return; }
  const { id, method } = n; const params = n.params || {};
  if (method === 'initialize') {
    const gewuenscht = params.protocolVersion;
    return antwort(id, { protocolVersion: PROTOKOLLE.indexOf(gewuenscht) !== -1 ? gewuenscht : PROTOKOLLE[PROTOKOLLE.length - 1],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'aufmass', version: C.FASSUNG },
      instructions: 'Aufmaß-Werkzeug für Schließanlagen: Aufmaße, Gliederung, Türen, Schließplan und PDF-Berichte der gemeinsamen Ablage. Mit zugang_pruefen beginnen, dann projekte_auflisten. Änderungen speichern sofort auf dem Server; bei gleichzeitigen Änderungen anderer wird zusammengeführt.' });
  }
  if (method.indexOf('notifications/') === 0) return;   /* keine Antwort auf Benachrichtigungen */
  if (method === 'ping') return antwort(id, {});
  if (method === 'tools/list') return antwort(id, { tools: WERKZEUGE.map(w => ({ name: w.name, description: w.beschreibung, inputSchema: w.schema })) });
  if (method === 'tools/call') {
    const w = WERKZEUGE.find(x => x.name === params.name);
    if (!w) return fehlerAntwort(id, -32602, 'Unbekanntes Werkzeug: ' + params.name);
    try {
      const maengel = schemaPruefen(w.schema, params.arguments || {});
      if (maengel.length) throw new Error(maengel.join(' '));
      const text = await w.ausfuehren(params.arguments || {});
      return antwort(id, { content: [{ type: 'text', text: String(text) }] });
    } catch (e) {
      const text = 'Fehler: ' + (e && e.message ? e.message : String(e)) + (e && e.status ? ' (HTTP ' + e.status + ')' : '');
      return antwort(id, { content: [{ type: 'text', text }], isError: true });
    }
  }
  if (method === 'resources/list') return antwort(id, { resources: [] });
  if (method === 'prompts/list') return antwort(id, { prompts: [] });
  if (id !== undefined) fehlerAntwort(id, -32601, 'Method not found: ' + method);
}

if (require.main === module) {
  let puffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (teil) => {
    puffer += teil;
    let i;
    while ((i = puffer.indexOf('\n')) >= 0) {
      const zeile = puffer.slice(0, i).trim(); puffer = puffer.slice(i + 1);
      if (zeile) verarbeiten(zeile).catch(e => { process.stderr.write('aufmass-mcp: ' + e.message + '\n'); });
    }
  });
  process.stdin.on('end', () => process.exit(0));
  process.stderr.write('aufmass-mcp ' + C.FASSUNG + ' bereit (' + WERKZEUGE.length + ' Werkzeuge)\n');
}

module.exports = { WERKZEUGE, verarbeiten, TUERFELDER, TUERLISTEN, schliessplanText, gliederungText };
