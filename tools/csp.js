#!/usr/bin/env node
/* Content-Security-Policy der Seiten pflegen.
 *
 * Beide Seiten (index.html, freigabe.html) tragen eine CSP als <meta>.
 * Ihre eingebetteten Skripte (Darstellung vor dem ersten Bild, Anmeldung
 * des Service Workers, die Kundenseite selbst) sind darin über ihren
 * SHA-256-Wert freigegeben - nicht über 'unsafe-inline'. Wer eines dieser
 * Skripte ändert, muss den Wert nachziehen; das erledigt dieses Werkzeug,
 * und die Prüfläufe melden, wenn er nicht stimmt.
 *
 *   node tools/csp.js --pruefen  src/index.html src/freigabe.html
 *   node tools/csp.js --schreiben src/index.html src/freigabe.html
 */
const fs = require('fs');
const crypto = require('crypto');

function inlineSkripte(html) {
  const aus = [];
  const muster = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let t;
  while ((t = muster.exec(html)) !== null) aus.push(t[1]);
  return aus;
}
function hashVon(text) {
  return "'sha256-" + crypto.createHash('sha256').update(text, 'utf8').digest('base64') + "'";
}
function metaFinden(html) {
  return /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/i.exec(html);
}
function mitHashes(policy, hashes) {
  return policy.split(';').map(teil => {
    const woerter = teil.trim().split(/\s+/).filter(Boolean);
    if (woerter[0] !== 'script-src') return woerter.join(' ');
    return woerter.filter(w => !/^'sha256-/.test(w)).concat(hashes).join(' ');
  }).filter(Boolean).join('; ');
}

/* Liefert { stimmt, erwartet, html } - html ist die Seite mit richtiger Policy. */
function pruefen(datei) {
  const html = fs.readFileSync(datei, 'utf8');
  const meta = metaFinden(html);
  if (!meta) return { stimmt: false, grund: 'keine Content-Security-Policy in ' + datei, html };
  const hashes = inlineSkripte(html).map(hashVon);
  const erwartet = mitHashes(meta[1], hashes);
  const neu = html.replace(meta[0], '<meta http-equiv="Content-Security-Policy" content="' + erwartet + '">');
  return { stimmt: meta[1] === erwartet, erwartet, vorhanden: meta[1], html: neu, anzahl: hashes.length };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const schreiben = args.includes('--schreiben');
  const dateien = args.filter(a => !a.startsWith('--'));
  let fehler = 0;
  dateien.forEach(datei => {
    const e = pruefen(datei);
    if (e.grund) { console.error('FEHLER: ' + e.grund); fehler++; return; }
    if (e.stimmt) { console.log(datei + ': CSP stimmt (' + e.anzahl + ' eingebettete Skripte)'); return; }
    if (schreiben) {
      fs.writeFileSync(datei, e.html, 'utf8');
      console.log(datei + ': CSP nachgezogen (' + e.anzahl + ' eingebettete Skripte)');
    } else {
      console.error('FEHLER: ' + datei + ' - die CSP passt nicht mehr zu den eingebetteten Skripten.\n'
        + '  vorhanden: ' + e.vorhanden + '\n  erwartet:  ' + e.erwartet
        + '\n  Nachziehen mit: node tools/csp.js --schreiben ' + datei);
      fehler++;
    }
  });
  process.exit(fehler ? 1 : 0);
}
module.exports = { pruefen, inlineSkripte, hashVon, mitHashes };
