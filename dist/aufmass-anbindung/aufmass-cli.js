#!/usr/bin/env node
/* =============================================================================
 * aufmass-cli.js — Kommandozeile für das Aufmaß-Werkzeug
 *
 * Für Skripte und den schnellen Blick ohne Browser. Nutzt denselben
 * Zugangsschlüssel wie der MCP-Server:
 *   AUFMASS_URL=https://www.provision-infra.de AUFMASS_SCHLUESSEL=aufm_… \
 *     node aufmass-cli.js projekte
 *
 * Befehle:
 *   ich                                  wer bin ich, was darf der Schlüssel
 *   projekte                             alle Aufmaße
 *   projekt <projektId> [voll]           ein Aufmaß (Übersicht oder JSON)
 *   tueren <projektId> [suche]           Türen des Aufmaßes
 *   tuer <projektId> <tuerId|nummer>     eine Tür als JSON
 *   schliessplan <projektId>             Kreuzschließplan als Tabelle
 *   bericht <projektId> <art> [ziel]     PDF: tuerliste|schliessplan|materialliste|pruefprotokoll
 *   werkzeug <name> [json]               beliebiges MCP-Werkzeug aufrufen
 *   werkzeuge                            alle Werkzeuge mit Beschreibung
 * Optionen: --url=<Adresse> --schluessel=<aufm_…> (statt Umgebungsvariablen)
 * ========================================================================== */
'use strict';
const S = require('./aufmass-mcp.js');

function hilfe() {
  const text = require('fs').readFileSync(__filename, 'utf8');
  const kopf = /Befehle:[\s\S]*?Optionen:[^\n]*\n/.exec(text);
  process.stdout.write('aufmass-cli ' + require('./aufmass-client.js').FASSUNG + '\n\n' + (kopf ? kopf[0].replace(/^ \* ?/gm, '') : '') + '\n');
}

async function werkzeug(name, args) {
  const w = S.WERKZEUGE.find(x => x.name === name);
  if (!w) throw new Error('Unbekanntes Werkzeug: ' + name + '. Bekannt: ' + S.WERKZEUGE.map(x => x.name).join(', '));
  return w.ausfuehren(args || {});
}

(async () => {
  const argv = process.argv.slice(2);
  const opt = {};
  const rest = argv.filter(a => {
    const m = /^--([a-z]+)=(.*)$/i.exec(a);
    if (m) { opt[m[1]] = m[2]; return false; }
    return true;
  });
  if (opt.url) process.env.AUFMASS_URL = opt.url;
  if (opt.schluessel) process.env.AUFMASS_SCHLUESSEL = opt.schluessel;
  const [befehl, a, b, c] = rest;
  if (!befehl || befehl === 'hilfe' || befehl === '--help' || befehl === '-h') { hilfe(); return; }
  let aus;
  switch (befehl) {
    case 'ich': aus = await werkzeug('zugang_pruefen'); break;
    case 'projekte': aus = await werkzeug('projekte_auflisten'); break;
    case 'projekt': if (!a) throw new Error('projekt <projektId> [voll]'); aus = await werkzeug('projekt_lesen', { projektId: a, umfang: b === 'voll' ? 'voll' : 'kurz' }); break;
    case 'tueren': if (!a) throw new Error('tueren <projektId> [suche]'); aus = await werkzeug('tueren_auflisten', { projektId: a, suche: b || '' }); break;
    case 'tuer': if (!a || !b) throw new Error('tuer <projektId> <tuerId|nummer>'); aus = await werkzeug('tuer_lesen', /^(tuer|t)-/.test(b) ? { projektId: a, tuerId: b } : { projektId: a, nummer: b }); break;
    case 'schliessplan': if (!a) throw new Error('schliessplan <projektId>'); aus = await werkzeug('schliessplan_lesen', { projektId: a }); break;
    case 'bericht': if (!a || !b) throw new Error('bericht <projektId> <art> [ziel]'); aus = await werkzeug('bericht_erzeugen', { projektId: a, art: b, pfad: c || '', modus: opt.modus || 'detail', mitFotos: opt.fotos === 'ja' }); break;
    case 'werkzeuge': aus = S.WERKZEUGE.map(w => w.name + '\n    ' + w.beschreibung).join('\n'); break;
    case 'werkzeug': {
      if (!a) throw new Error('werkzeug <name> [json]');
      let args = {};
      if (b) { try { args = JSON.parse(b); } catch (e) { throw new Error('Die Argumente müssen JSON sein, z. B. \'{"projektId":"…"}\''); } }
      aus = await werkzeug(a, args); break;
    }
    default: throw new Error('Unbekannter Befehl „' + befehl + '“. „aufmass-cli hilfe“ zeigt alle.');
  }
  process.stdout.write(String(aus) + '\n');
})().catch(e => {
  process.stderr.write('Fehler: ' + (e && e.message ? e.message : e) + (e && e.status ? ' (HTTP ' + e.status + ')' : '') + '\n');
  process.exit(1);
});
