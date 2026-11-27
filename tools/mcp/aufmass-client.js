/* =============================================================================
 * aufmass-client.js — Zugriff auf die Schnittstelle des Aufmaß-Abgleichs
 *
 * Für Programme ohne Browser: ein Zugangsschlüssel (im Werkzeug unter
 * Einstellungen erzeugt) weist die Anfragen aus. Keine Abhängigkeiten,
 * Node 18 oder neuer (fetch ist eingebaut).
 *
 * Das Herzstück ist aendern(): lesen, ändern, mit der gelesenen Version
 * speichern. Hat in der Zwischenzeit jemand anderes gespeichert, antwortet
 * der Server mit 409 und seinem Stand; dann wird dreiseitig zusammengeführt
 * (dieselbe Logik wie im Werkzeug, zusammenfuehren.js) und erneut
 * gespeichert. Nur ein echter Konflikt - dieselbe Angabe, zwei verschiedene
 * neue Werte - bricht ab und nennt die Stellen.
 * ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');

/* Im Paket liegen die Bausteine des Werkzeugs unter lib/, im Quellbaum unter src/js/. */
const LIB = fs.existsSync(path.join(__dirname, 'lib', 'model.js'))
  ? path.join(__dirname, 'lib')
  : path.join(__dirname, '..', '..', 'src', 'js');
const K = require(path.join(LIB, 'catalog.js'));
const M = require(path.join(LIB, 'model.js'));
const Z = require(path.join(LIB, 'zusammenfuehren.js'));

const WEG = '/wp-json/aufmass/v1';
const FASSUNG = '1.5.5';

class AufmassFehler extends Error {
  constructor(meldung, status, code, daten) { super(meldung); this.status = status || 0; this.code = code || ''; this.daten = daten || null; }
}

function ohneBilddaten(daten) {
  const kopie = JSON.parse(JSON.stringify(daten));
  (kopie.tueren || []).forEach(t => (t.fotos || []).forEach(f => { if (f) f.dataUrl = ''; }));
  return kopie;
}

function verbinden(optionen) {
  optionen = optionen || {};
  const basis = String(optionen.url || process.env.AUFMASS_URL || '').trim().replace(/\/+$/, '');
  const schluessel = String(optionen.schluessel || process.env.AUFMASS_SCHLUESSEL || '').trim();
  if (!/^https?:\/\/[^/\s]+/.test(basis)) {
    throw new AufmassFehler('AUFMASS_URL fehlt oder ist keine Adresse - erwartet wird die Adresse der WordPress-Website, z. B. https://www.provision-infra.de');
  }
  if (!/^aufm_[0-9a-f]{16}_[A-Za-z0-9_-]{40,64}$/.test(schluessel)) {
    throw new AufmassFehler('AUFMASS_SCHLUESSEL fehlt oder hat nicht die Form aufm_… - der Schlüssel wird im Werkzeug unter Einstellungen erzeugt.');
  }
  const zeitgrenze = optionen.zeit || 60000;

  async function anfrage(weg, o) {
    o = o || {};
    const kopf = { Authorization: 'Bearer ' + schluessel, 'X-Aufmass-Schluessel': schluessel, Accept: 'application/json' };
    if (o.json !== undefined) kopf['Content-Type'] = 'application/json';
    let antwort;
    try {
      antwort = await fetch(basis + WEG + weg, {
        method: o.methode || 'GET', headers: kopf,
        body: o.json !== undefined ? JSON.stringify(o.json) : o.koerper,
        signal: AbortSignal.timeout(o.zeit || zeitgrenze), redirect: 'manual'
      });
    } catch (f) {
      throw new AufmassFehler('Der Server ' + basis + ' ist nicht erreichbar: ' + (f && f.message ? f.message : f), 0, 'netz');
    }
    if (o.roh) {
      if (!antwort.ok) throw new AufmassFehler('Der Server antwortete mit ' + antwort.status + '.', antwort.status);
      return Buffer.from(await antwort.arrayBuffer());
    }
    const text = await antwort.text();
    let d = null;
    try { d = text ? JSON.parse(text) : null; } catch (e) { d = null; }
    if (!antwort.ok) {
      const meldung = (d && d.message) || ('Der Server antwortete mit ' + antwort.status + (text && !d ? ' - keine JSON-Antwort. Stimmt AUFMASS_URL (WordPress-Adresse ohne /aufmasstool)?' : '.'));
      throw new AufmassFehler(meldung, antwort.status, d && d.code, d && d.data);
    }
    return d;
  }

  /* --- Lesen --------------------------------------------------------- */
  const ich = () => anfrage('/ich');
  const projekte = async () => { const d = await anfrage('/projekte'); return (d && d.projekte) || []; };
  const projekt = (id) => anfrage('/projekte/' + encodeURIComponent(id));
  const fotoBytes = (id) => anfrage('/fotos/' + encodeURIComponent(id), { roh: true });

  /* Bilddaten nachladen - für PDFs mit Fotos. Fehlende Bilder werden übersprungen. */
  async function fotosLaden(daten) {
    for (const t of (daten.tueren || [])) {
      for (const f of (t.fotos || [])) {
        if (!f || !f.id || f.dataUrl) continue;
        try { f.dataUrl = 'data:image/jpeg;base64,' + (await fotoBytes(f.id)).toString('base64'); } catch (e) { /* ohne Bild weiter */ }
      }
    }
    return daten;
  }

  /* --- Schreiben ----------------------------------------------------- */
  const speichern = (id, daten, basisVersion) =>
    anfrage('/projekte/' + encodeURIComponent(id), { methode: 'PUT', json: { daten: ohneBilddaten(daten), basisVersion: basisVersion || 0 } });

  async function anlegen(vorgabe) {
    const p = M.migriere(Object.assign(M.neuesProjekt((vorgabe && (vorgabe.kunde || vorgabe.name)) || 'Neues Aufmaß'), vorgabe || {}));
    const antwort = await speichern(p.id, p, 0);
    return { id: p.id, antwort };
  }

  /**
   * Lesen, ändern, speichern - mit Zusammenführung bei 409.
   * fn(daten, voll) darf die Daten an Ort und Stelle ändern (auch asynchron)
   * und gibt ein Ergebnis zurück, das durchgereicht wird.
   */
  async function aendern(id, fn) {
    const voll = await projekt(id);
    if (!voll || !voll.daten) throw new AufmassFehler('Das Aufmaß ' + id + ' gibt es nicht.', 404, 'unbekannt');
    let basis = JSON.parse(JSON.stringify(voll.daten));
    let meins = M.migriere(JSON.parse(JSON.stringify(voll.daten)));
    meins.id = id;
    const ergebnis = await fn(meins, voll);
    let version = voll.version;
    for (let versuch = 0; ; versuch++) {
      try {
        const antwort = await speichern(id, meins, version);
        return { antwort, ergebnis, version: antwort && antwort.version };
      } catch (f) {
        const server = f && f.daten && f.daten.server;
        if (f.status !== 409 || !server || !server.daten || versuch >= 3) throw f;
        const e = Z.projekte(basis, meins, server.daten);
        if (e.konflikte.length) {
          const stellen = e.konflikte.slice(0, 8).map(k => k.gegenstand + ' / ' + k.feldName).join('; ');
          throw new AufmassFehler('Konflikt: Dieselben Angaben wurden inzwischen von anderer Stelle geändert (' + stellen + '). Bitte das Aufmaß neu lesen und die Änderung erneut vornehmen.', 409, 'konflikt', { konflikte: e.konflikte });
        }
        meins = e.ergebnis; meins.id = id;
        basis = JSON.parse(JSON.stringify(server.daten));
        version = server.version;
      }
    }
  }

  return { basis, anfrage, ich, projekte, projekt, fotoBytes, fotosLaden, speichern, anlegen, aendern, ohneBilddaten };
}

module.exports = { verbinden, ohneBilddaten, AufmassFehler, LIB, WEG, FASSUNG, Model: M, Katalog: K, Zusammenfuehren: Z };
