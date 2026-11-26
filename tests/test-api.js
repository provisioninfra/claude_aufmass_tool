/* Schnittstelle für Programme und Claude Code - ohne Browser, gegen den echten
 * PHP-Code (server/tests/mini-server.php): Zugangsschlüssel erzeugen, Rechte
 * lesen/schreiben, Bibliothek aufmass-client.js mit Zusammenführung bei 409,
 * MCP-Server aufmass-mcp.js als Kindprozess über JSON-RPC, Kommandozeile,
 * zum Schluss die Drossel gegen Durchprobieren. */
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { spawn, execFileSync, spawnSync } = require('child_process');

const W = path.join(__dirname, '..');
const HAFEN = 9400 + (process.pid % 250);
const BASIS = 'http://127.0.0.1:' + HAFEN;
const API = BASIS + '/wp-json/aufmass/v1';
const ARBEIT = fs.mkdtempSync(path.join(os.tmpdir(), 'aufmass-api-'));
const MCP = path.join(W, 'tools/mcp/aufmass-mcp.js');
const CLI = path.join(W, 'tools/mcp/aufmass-cli.js');
let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + String(i).slice(0, 400) : '')); } }
const warte = ms => new Promise(r => setTimeout(r, ms));

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const CLIENT = '555-api.apps.googleusercontent.com', DOMAENE = 'provision-infra.de';
function b64(r) { return Buffer.from(r).toString('base64url'); }
function ausweis(sub, name) {
  const kopf = b64(JSON.stringify({ alg: 'RS256', kid: 'api-1', typ: 'JWT' }));
  const inhalt = b64(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub, email: sub + '@' + DOMAENE, email_verified: true, hd: DOMAENE, name,
    iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600, nonce: Math.random().toString(36).slice(2) }));
  return kopf + '.' + inhalt + '.' + crypto.sign('RSA-SHA256', Buffer.from(kopf + '.' + inhalt), privateKey).toString('base64url');
}
const OPT = path.join(ARBEIT, 'opt.json');
fs.writeFileSync(OPT, JSON.stringify({ aufmass_client_id: CLIENT, aufmass_domaene: DOMAENE, permalink_structure: '/%postname%/',
  aufmass_google_schluessel_sicherung: { keys: [{ kty: 'RSA', kid: 'api-1', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] } }));

async function ruf(weg, opt) {
  opt = opt || {};
  const kopf = Object.assign({}, opt.kopf || {});
  if (opt.json !== undefined) kopf['Content-Type'] = 'application/json';
  const r = await fetch(API + weg, { method: opt.methode || 'GET', headers: kopf, redirect: 'manual', body: opt.json !== undefined ? JSON.stringify(opt.json) : undefined });
  const text = await r.text();
  let d = null; try { d = JSON.parse(text); } catch (e) {}
  return { status: r.status, d, text, kopf: r.headers };
}
async function anmelden(sub, name) {
  const r = await ruf('/anmelden', { methode: 'POST', kopf: { 'X-Aufmass-Abgleich': '1' }, json: { token: ausweis(sub, name) } });
  const m = /aufmass_sitzung=([^;]+)/.exec(r.kopf.get('set-cookie') || '');
  if (!m) throw new Error('Anmeldung fehlgeschlagen: ' + r.status + ' ' + r.text);
  return { Cookie: 'aufmass_sitzung=' + m[1], 'X-Aufmass-Abgleich': '1' };
}
const bearer = (t) => ({ Authorization: 'Bearer ' + t });

/* MCP-Server als Kindprozess: eine JSON-Zeile hin, eine zurück. */
function mcpStarten(umgebung) {
  const kind = spawn(process.execPath, [MCP], { env: Object.assign({}, process.env, umgebung), stdio: ['pipe', 'pipe', 'pipe'] });
  let puffer = '', stderr = '', n = 0; const wartende = new Map(); const alle = [];
  kind.stdout.on('data', d => {
    puffer += d; let i;
    while ((i = puffer.indexOf('\n')) >= 0) {
      const z = puffer.slice(0, i).trim(); puffer = puffer.slice(i + 1); if (!z) continue;
      let m; try { m = JSON.parse(z); } catch (e) { alle.push({ kaputt: z }); continue; }
      alle.push(m);
      if (m.id !== undefined && m.id !== null && wartende.has(m.id)) { wartende.get(m.id)(m); wartende.delete(m.id); }
    }
  });
  kind.stderr.on('data', d => { stderr += d; });
  function senden(method, params) {
    const id = ++n;
    return new Promise((res, rej) => {
      wartende.set(id, res);
      kind.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      setTimeout(() => { if (wartende.has(id)) { wartende.delete(id); rej(new Error('keine Antwort auf ' + method)); } }, 90000);
    });
  }
  function melden(method, params) { kind.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); }
  async function werkzeug(name, args) {
    const a = await senden('tools/call', { name, arguments: args || {} });
    const inhalt = a.result && a.result.content && a.result.content[0];
    return { text: inhalt ? inhalt.text : '', fehler: !!(a.result && a.result.isError), roh: a };
  }
  return { kind, senden, melden, werkzeug, alle, stderr: () => stderr, ende: () => new Promise(r => { kind.on('exit', r); kind.stdin.end(); setTimeout(() => kind.kill(), 3000); }) };
}
const werte = l => (l || []).map(x => (x && typeof x === 'object') ? (x.id !== undefined ? x.id : (x.wert !== undefined ? x.wert : x.label)) : x).map(String);

(async () => {
  const server = spawn('php', ['-S', '127.0.0.1:' + HAFEN, path.join(W, 'server/tests/mini-server.php')], {
    env: Object.assign({}, process.env, { AUFMASS_TEST_DB: path.join(ARBEIT, 'd.sqlite'), AUFMASS_TEST_OPT: OPT,
      AUFMASS_TEST_UPLOADS: path.join(ARBEIT, 'up'), AUFMASS_TEST_MAIL: path.join(ARBEIT, 'm.log') }),
    stdio: ['ignore', 'ignore', 'pipe'] });
  let serverFehler = '';
  server.stderr.on('data', d => { const t = String(d); if (/Fatal|Parse error|Warning|Notice|Deprecated/.test(t)) serverFehler += t; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(API + '/start')).ok) break; } catch (e) {} await warte(150); }
  const C = require(path.join(W, 'tools/mcp/aufmass-client.js'));
  const K = C.Katalog;
  const mcps = [];

  try {
    console.log('\n== Zugangsschlüssel über die Schnittstelle ==');
    const chef = await anmelden('u-chef', 'Chefin Test');          /* erste Person = Verwaltung */
    const monteur = await anmelden('u-monteur', 'Monteur Test');
    const k0 = await ruf('/schluessel', { methode: 'POST', kopf: chef, json: {} });
    p(k0.status === 200 && /^aufm_[0-9a-f]{16}_[A-Za-z0-9_-]{40,64}$/.test(k0.d.schluessel || ''), 'ein Schlüssel hat die Form aufm_<Kennung>_<Geheimnis>', k0.text);
    p(k0.d.eintrag && k0.d.eintrag.rechte === 'lesen' && k0.d.eintrag.name, 'Vorgabe ohne Angaben: nur lesen, mit Namen', JSON.stringify(k0.d.eintrag));
    const tage = k0.d.eintrag ? Math.round((new Date(k0.d.eintrag.gueltigBis) - Date.now()) / 864e5) : 0;
    p(tage >= 364 && tage <= 366, 'Vorgabe-Gültigkeit ein Jahr', tage + ' Tage');
    const k1 = await ruf('/schluessel', { methode: 'POST', kopf: chef, json: { name: 'Claude Code', rechte: 'schreiben', tage: 30 } });
    const schreib = k1.d && k1.d.schluessel;
    p(k1.status === 200 && schreib && k1.d.eintrag.rechte === 'schreiben' && k1.d.eintrag.name === 'Claude Code', 'Schreibschlüssel „Claude Code“, 30 Tage', k1.text);
    const k2 = await ruf('/schluessel', { methode: 'POST', kopf: chef, json: { name: 'Nur lesen', rechte: 'lesen' } });
    const lese = k2.d && k2.d.schluessel;
    p(k2.status === 200 && lese, 'Leseschlüssel');
    const komisch = await ruf('/schluessel', { methode: 'POST', kopf: chef, json: { rechte: 'admin', tage: 9999, name: 'x'.repeat(500) } });
    p(komisch.status === 200 && komisch.d.eintrag.rechte === 'lesen' && komisch.d.eintrag.name.length <= 120 && Math.round((new Date(komisch.d.eintrag.gueltigBis) - Date.now()) / 864e5) <= 730, 'unbekannte Rechte fallen auf „lesen“ zurück, Name und Gültigkeit werden begrenzt', JSON.stringify(komisch.d.eintrag));
    const liste = await ruf('/schluessel', { kopf: chef });
    p(liste.status === 200 && liste.d.schluessel.length === 4, 'die Liste zeigt die vier Schlüssel', liste.text);
    p(!JSON.stringify(liste.d).includes(schreib.slice(22)) && !/pruefwert|geheim/.test(liste.text), 'die Liste verrät kein Geheimnis');
    p((await ruf('/schluessel', { methode: 'POST', json: {} })).status === 400, 'ohne das Kopffeld des Werkzeugs: 400');
    p((await ruf('/schluessel', { methode: 'POST', kopf: { 'X-Aufmass-Abgleich': '1' }, json: {} })).status === 401, 'ohne Anmeldung kein Schlüssel (401)');
    p((await ruf('/schluessel', { methode: 'POST', kopf: Object.assign({ 'X-Aufmass-Abgleich': '1' }, bearer(schreib)), json: {} })).status === 403, 'ein Schlüssel kann keine Schlüssel erzeugen (403)');
    p((await ruf('/schluessel', { kopf: Object.assign({ 'X-Aufmass-Abgleich': '1' }, bearer(schreib)) })).status === 403, 'ein Schlüssel sieht die Schlüsselliste nicht (403)');

    console.log('\n== Ausweisen mit dem Schlüssel ==');
    const ich = await ruf('/ich', { kopf: bearer(schreib) });
    p(ich.status === 200 && ich.d.zugang === 'schluessel' && ich.d.benutzer && ich.d.benutzer.name === 'Chefin Test', 'Bearer: angemeldet als die Person, Zugang „schluessel“', ich.text);
    p(ich.d.schluessel && ich.d.schluessel.name === 'Claude Code' && ich.d.schluessel.rechte === 'schreiben' && ich.d.version, 'die Antwort nennt Schlüssel, Rechte und Fassung');
    p(!JSON.stringify(ich.d).includes(schreib), 'aber nicht das Geheimnis');
    const kopfVariante = await ruf('/ich', { kopf: { 'X-Aufmass-Schluessel': schreib } });
    p(kopfVariante.status === 200 && kopfVariante.d.zugang === 'schluessel', 'auch über das Kopffeld X-Aufmass-Schluessel');
    const falsch = schreib.slice(0, -1) + (schreib.endsWith('a') ? 'b' : 'a');
    const f1 = await ruf('/ich', { kopf: bearer(falsch) });
    p(f1.status === 401 && f1.d.code === 'schluessel_ungueltig', 'ein Zeichen anders: 401 schluessel_ungueltig', f1.text);
    p((await ruf('/ich', { kopf: bearer('aufm_0000000000000000_' + 'x'.repeat(48)) })).status === 401, 'unbekannte Kennung: 401');
    p((await ruf('/ich', { kopf: bearer('kauderwelsch') })).status === 401, 'Kauderwelsch: 401');
    p((await ruf('/ich', { kopf: { Authorization: 'Basic ' + Buffer.from('a:b').toString('base64') } })).status === 401, 'Basic-Auth: 401');

    console.log('\n== Rechte: lesen und schreiben ==');
    const A = C.verbinden({ url: BASIS, schluessel: schreib });
    const L = C.verbinden({ url: BASIS, schluessel: lese });
    const neu = await A.anlegen({ kunde: 'API-Kunde', objekt: 'Testhalle' });
    p(neu.id && neu.antwort && neu.antwort.version === 1, 'Schreibschlüssel legt ein Aufmaß an (ohne Browser-Kopffeld)', JSON.stringify(neu.antwort));
    const roh = await ruf('/projekte/' + neu.id, { methode: 'PUT', kopf: bearer(schreib), json: { daten: Object.assign((await A.projekt(neu.id)).daten, { ort: 'Hamburg' }), basisVersion: 1 } });
    p(roh.status === 200 && roh.d.version === 2, 'PUT nur mit Bearer, ohne X-Aufmass-Abgleich: 200', roh.text);
    const geleseneListe = await L.projekte();
    p(geleseneListe.some(x => x.id === neu.id && x.kunde === 'API-Kunde'), 'Leseschlüssel sieht die Liste');
    p((await L.projekt(neu.id)).daten.ort === 'Hamburg', 'und das Aufmaß');
    const rueck = (await L.projekt(neu.id)).daten;
    p(rueck.matrix && typeof rueck.matrix === 'object' && !Array.isArray(rueck.matrix) && rueck.freigabe !== false && !Array.isArray(rueck.freigabe) && !Array.isArray(rueck.pipedrive), 'die leere Matrix kommt als Objekt zurück, nicht als Liste (PHP-Eigenheit abgefangen)', JSON.stringify({ m: rueck.matrix, f: rueck.freigabe, pd: rueck.pipedrive }));
    const probe = C.Model.neuesProjekt('Probe'); const pt = C.Model.neueTuer({ nummer: '1' }); const ps = C.Model.neueSchliessung({ kuerzel: 'S' }); probe.tueren.push(pt); probe.schliessungen.push(ps);
    const arr = []; arr[pt.id + '|' + ps.id] = 'ja'; probe.matrix = arr;
    const gerettet = C.Model.migriere(JSON.parse(JSON.stringify(probe)) && probe).matrix;
    p(!Array.isArray(gerettet) && gerettet[pt.id + '|' + ps.id] === 'ja' && !Array.isArray(C.Model.migriere({ name: 'x', matrix: [] }).matrix), 'migriere rettet Kreuze aus einer Listen-Matrix und macht ein Objekt daraus', JSON.stringify(gerettet));
    let leseFehler = null; try { await L.speichern(neu.id, (await L.projekt(neu.id)).daten, 2); } catch (e) { leseFehler = e; }
    p(leseFehler && leseFehler.status === 403 && leseFehler.code === 'nur_lesen', 'Leseschlüssel darf nicht speichern: 403 nur_lesen', leseFehler && (leseFehler.status + ' ' + leseFehler.code));
    p((await ruf('/projekte/' + neu.id, { methode: 'DELETE', kopf: bearer(lese) })).status === 403, 'und nicht löschen: 403');
    p((await ruf('/projekte/' + neu.id, { methode: 'PUT', kopf: bearer(schreib), json: { daten: (await A.projekt(neu.id)).daten, basisVersion: 1 } })).status === 409, 'veraltete basisVersion: 409 (optimistische Sperre gilt auch für Schlüssel)');
    p((await ruf('/projekte/' + neu.id, { methode: 'DELETE', kopf: bearer(lese) })).status === 403, 'Löschen mit Leseschlüssel: 403');

    console.log('\n== Widerrufen ==');
    const leseId = k2.d.eintrag.id;
    p((await ruf('/schluessel/' + leseId, { methode: 'DELETE', kopf: monteur })).status === 403, 'eine andere Person (ohne Verwaltung) darf fremde Schlüssel nicht widerrufen (403)');
    p((await ruf('/schluessel/' + leseId, { methode: 'DELETE', kopf: Object.assign({ 'X-Aufmass-Abgleich': '1' }, bearer(schreib)) })).status === 403, 'ein Schlüssel darf nicht widerrufen (403)');
    const wr = await ruf('/schluessel/' + leseId, { methode: 'DELETE', kopf: chef });
    p(wr.status === 200, 'die Inhaberin widerruft (200)', wr.text);
    const nachher = await ruf('/ich', { kopf: bearer(lese) });
    p(nachher.status === 401 && nachher.d.code === 'schluessel_widerrufen', 'der widerrufene Schlüssel ist sofort tot: 401 schluessel_widerrufen', nachher.text);
    p((await ruf('/schluessel/' + leseId, { methode: 'DELETE', kopf: chef })).status === 404, 'nochmal widerrufen: 404');
    p((await ruf('/schluessel/0123456789abcdef', { methode: 'DELETE', kopf: chef })).status === 404, 'unbekannte Kennung: 404');
    const km = await ruf('/schluessel', { methode: 'POST', kopf: monteur, json: { name: 'Monteur-Skript', rechte: 'schreiben' } });
    p(km.status === 200 && (await ruf('/ich', { kopf: bearer(km.d.schluessel) })).d.benutzer.name === 'Monteur Test', 'der Monteur erzeugt einen eigenen Schlüssel');
    p((await ruf('/schluessel/' + km.d.eintrag.id, { methode: 'DELETE', kopf: chef })).status === 200, 'die Verwaltung darf fremde Schlüssel widerrufen (200)');
    const km2 = await ruf('/schluessel', { methode: 'POST', kopf: monteur, json: { name: 'Monteur 2' } });
    p((await ruf('/schluessel/' + km2.d.eintrag.id, { methode: 'DELETE', kopf: monteur })).status === 200, 'die eigene Person darf den eigenen widerrufen (200)');
    const alleListe = (await ruf('/schluessel', { kopf: monteur })).d.schluessel;
    p(alleListe.length === 0, 'die Liste des Monteurs ist danach leer', JSON.stringify(alleListe));

    console.log('\n== Bibliothek: ändern mit Zusammenführung ==');
    const kB = await ruf('/schluessel', { methode: 'POST', kopf: chef, json: { name: 'Zweites Gerät', rechte: 'schreiben' } });
    const kmNeu = await ruf('/schluessel', { methode: 'POST', kopf: monteur, json: { name: 'Monteur-Gerät', rechte: 'schreiben' } });
    let fremd = null; try { await C.verbinden({ url: BASIS, schluessel: kmNeu.d.schluessel }).aendern(neu.id, (x) => { x.ort = 'Kiel'; }); } catch (e) { fremd = e; }
    p(fremd && fremd.status === 403 && /zuständig/.test(fremd.message), 'eine nicht zuständige Person darf ein fremdes Aufmaß nicht ändern (Regel wie im Werkzeug): 403', fremd && (fremd.status + ' ' + fremd.message));
    const B = C.verbinden({ url: BASIS, schluessel: kB.d.schluessel });
    const e1 = await A.aendern(neu.id, async (meins) => {
      meins.bemerkung = 'von A';
      await B.aendern(neu.id, (anderes) => { anderes.objekt = 'Halle B'; });   /* dazwischen speichert jemand anderes */
      return 'fertig';
    });
    const stand = await A.projekt(neu.id);
    p(e1.ergebnis === 'fertig' && stand.daten.bemerkung === 'von A' && stand.daten.objekt === 'Halle B', 'beide Änderungen bleiben erhalten (409 → zusammengeführt → gespeichert)', JSON.stringify({ b: stand.daten.bemerkung, o: stand.daten.objekt }));
    p(stand.version === 4 && e1.version === 4, 'die Version zählt beide Speichervorgänge', stand.version + '/' + e1.version);
    let konflikt = null;
    try {
      await A.aendern(neu.id, async (meins) => { meins.bemerkung = 'A2'; await B.aendern(neu.id, (x) => { x.bemerkung = 'B2'; }); });
    } catch (e) { konflikt = e; }
    p(konflikt && konflikt.status === 409 && konflikt.code === 'konflikt' && konflikt.daten.konflikte.length >= 1, 'dieselbe Angabe zweimal anders: echter Konflikt, Abbruch mit Stellen', konflikt && konflikt.message);
    p((await A.projekt(neu.id)).daten.bemerkung === 'B2', 'der Stand des Servers bleibt unangetastet');
    let weg = null; try { await A.projekt('gibt-es-nicht'); } catch (e) { weg = e; }
    p(weg && weg.status === 404, 'unbekanntes Aufmaß: 404 als Fehler', weg && weg.status);
    let ohneUrl = null; try { C.verbinden({ url: '', schluessel: schreib }); } catch (e) { ohneUrl = e; }
    p(ohneUrl && /AUFMASS_URL/.test(ohneUrl.message), 'ohne Adresse eine klare Meldung');
    let falschForm = null; try { C.verbinden({ url: BASIS, schluessel: 'abc' }); } catch (e) { falschForm = e; }
    p(falschForm && /AUFMASS_SCHLUESSEL/.test(falschForm.message), 'falsche Schlüsselform eine klare Meldung');

    console.log('\n== MCP-Server für Claude Code ==');
    const mcp = mcpStarten({ AUFMASS_URL: BASIS, AUFMASS_SCHLUESSEL: schreib, AUFMASS_AUSGABE: path.join(ARBEIT, 'aus') }); mcps.push(mcp);
    const init = await mcp.senden('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    p(init.result && init.result.protocolVersion === '2025-06-18' && init.result.serverInfo.name === 'aufmass' && init.result.capabilities.tools, 'initialize: Protokoll, Server, Fähigkeiten', JSON.stringify(init));
    mcp.melden('notifications/initialized', {});
    p((await mcp.senden('ping', {})).result !== undefined, 'ping');
    const tl = await mcp.senden('tools/list', {});
    const namen = (tl.result.tools || []).map(t => t.name);
    p(namen.length === 17 && tl.result.tools.every(t => t.inputSchema && t.inputSchema.type === 'object' && t.description), 'tools/list: 17 Werkzeuge mit Schema und Beschreibung', namen.join(','));
    for (const n of ['zugang_pruefen', 'projekte_auflisten', 'projekt_lesen', 'projekt_anlegen', 'tuer_anlegen', 'tuer_aendern', 'berechtigung_setzen', 'bericht_erzeugen', 'katalog_lesen']) p(namen.includes(n), 'Werkzeug ' + n);
    const zp = await mcp.werkzeug('zugang_pruefen');
    p(!zp.fehler && /lesen und schreiben/.test(zp.text) && /Claude Code/.test(zp.text) && /Chefin Test/.test(zp.text), 'zugang_pruefen nennt Person, Schlüssel und Rechte', zp.text);
    const pa = await mcp.werkzeug('projekt_anlegen', { kunde: 'MCP-Kunde', objekt: 'Verwaltung', anlagenNr: 'A-100', anlagenart: 'mechanik' });
    const pid = (/projektId (\S+)/.exec(pa.text) || [])[1];
    p(!pa.fehler && pid, 'projekt_anlegen liefert die projektId', pa.text);
    p(/MCP-Kunde/.test((await mcp.werkzeug('projekte_auflisten')).text), 'projekte_auflisten zeigt es');
    const g1 = await mcp.werkzeug('gliederung_anlegen', { projektId: pid, ebene: 'standort', name: 'Hauptstandort' });
    const g2 = await mcp.werkzeug('gliederung_anlegen', { projektId: pid, ebene: 'gebaeude', name: 'Haus A', parent: 'Hauptstandort' });
    const g3 = await mcp.werkzeug('gliederung_anlegen', { projektId: pid, ebene: 'bereich', name: 'EG', parent: 'Haus A' });
    const g4 = await mcp.werkzeug('gliederung_anlegen', { projektId: pid, ebene: 'bereich', name: 'OG', parent: (/id (\S+)\]/.exec(g2.text) || [])[1] });
    p(!g1.fehler && !g2.fehler && !g3.fehler && !g4.fehler, 'gliederung_anlegen: Standort, Gebäude (per Name), zwei Bereiche (per Name und id)', [g1, g2, g3, g4].map(x => x.text).join(' | '));
    p((await mcp.werkzeug('gliederung_anlegen', { projektId: pid, ebene: 'bereich', name: 'X' })).fehler, 'Bereich ohne parent: Fehler');
    p((await mcp.werkzeug('gliederung_anlegen', { projektId: pid, ebene: 'bereich', name: 'X', parent: 'Nirgendwo' })).fehler, 'unbekannter parent: Fehler');
    const gl = (await mcp.werkzeug('gliederung_lesen', { projektId: pid })).text;
    p(/^- Hauptstandort/m.test(gl) && /^    - EG/m.test(gl) && /^    - OG/m.test(gl), 'gliederung_lesen zeigt den Baum eingerückt', gl);
    const kat = werte(K.TUERKATEGORIEN)[0], bauform = werte(K.ZYLINDER_BAUFORM)[0], laenge = werte(K.ZYLINDER_LAENGE)[2];
    const t1 = await mcp.werkzeug('tuer_anlegen', { projektId: pid, bereich: 'EG', felder: { bezeichnung: 'Haupteingang', kategorie: kat, zylinderBauform: bauform, masseAussen: laenge, masseInnen: laenge, tuerblattstaerke: werte(K.TUERBLATTSTAERKE)[0], dornmass: werte(K.DORNMASS)[0] } });
    const t1id = (/tuerId ([^,)\s]+)/.exec(t1.text) || [])[1]; const nr1 = (/Tür angelegt: (\S+)/.exec(t1.text) || [])[1];
    p(!t1.fehler && t1id && nr1 && !/Hinweise/.test(t1.text), 'tuer_anlegen mit Katalogwerten: ohne Hinweise, mit tuerId und Nummer', t1.text);
    const t2 = await mcp.werkzeug('tuer_anlegen', { projektId: pid, felder: { bezeichnung: 'Lager', dornmass: '99', kategorie: kat } });
    const nr2 = (/Tür angelegt: (\S+)/.exec(t2.text) || [])[1];
    p(!t2.fehler && nr2 && nr2 !== nr1 && /Hinweise:.*99.*freier Wert/.test(t2.text), 'zweite Tür: neue Nummer, freier Wert mit Hinweis', t2.text);
    const tf = await mcp.werkzeug('tuer_anlegen', { projektId: pid, felder: { farbe: 'rot' } });
    p(tf.fehler && /Unbekanntes Türfeld „farbe“/.test(tf.text), 'unbekanntes Feld: isError mit Liste der erlaubten', tf.text.slice(0, 80));
    p((await mcp.werkzeug('tuer_anlegen', { projektId: pid, felder: { status: 'Quatsch' } })).fehler, 'unbekannter Status: Fehler');
    p((await mcp.werkzeug('tuer_anlegen', { projektId: pid, felder: 'text' })).fehler, 'felder kein Objekt: Fehler');
    const ta = await mcp.werkzeug('tuer_aendern', { projektId: pid, nummer: nr1, felder: { notiz: 'Hinweis vom Test', brauchtZylinder: true, anzahl: 2, status: 'aufgemessen' } });
    p(!ta.fehler && /Geändert: Tür/.test(ta.text), 'tuer_aendern über die Nummer', ta.text);
    const tlJson = JSON.parse((await mcp.werkzeug('tuer_lesen', { projektId: pid, nummer: nr1 })).text);
    p(tlJson.id === t1id && tlJson.notiz === 'Hinweis vom Test' && tlJson.anzahl === 2 && tlJson.brauchtZylinder === true && tlJson.status === 'aufgemessen' && tlJson.bereich === 'Hauptstandort › Haus A › EG', 'tuer_lesen zeigt die Änderungen und den Bereichspfad', JSON.stringify(tlJson).slice(0, 300));
    p((await mcp.werkzeug('tuer_lesen', { projektId: pid, nummer: 'XX-99' })).fehler, 'unbekannte Nummer: Fehler');
    p(/Keine Türen gefunden/.test((await mcp.werkzeug('tueren_auflisten', { projektId: pid, bereich: 'OG' })).text), 'tueren_auflisten OG: leer');
    p(/Haupteingang/.test((await mcp.werkzeug('tueren_auflisten', { projektId: pid, bereich: 'EG' })).text), 'tueren_auflisten EG: Haupteingang');
    p(/Lager/.test((await mcp.werkzeug('tueren_auflisten', { projektId: pid, suche: 'lag' })).text), 'tueren_auflisten suche „lag“');
    await mcp.werkzeug('tuer_aendern', { projektId: pid, nummer: nr2, felder: { bereich: 'OG' } });
    p(/Lager/.test((await mcp.werkzeug('tueren_auflisten', { projektId: pid, bereich: 'OG' })).text), 'Tür in Bereich OG verschoben');
    const s1 = await mcp.werkzeug('spalte_anlegen', { projektId: pid, art: 'gruppe', name: 'Geschäftsführung' });
    const s2 = await mcp.werkzeug('spalte_anlegen', { projektId: pid, art: 'mitarbeiter', name: 'Maria Muster', funktion: 'Leitung' });
    const s3 = await mcp.werkzeug('spalte_anlegen', { projektId: pid, art: 'schliessung', kuerzel: 'HS', bezeichnung: 'Hauptschlüssel', typ: 'hs' });
    p(!s1.fehler && !s2.fehler && !s3.fehler && /Spalte angelegt: HS = Hauptschlüssel/.test(s3.text), 'spalte_anlegen: Gruppe, Mitarbeiter, Schließung', [s1, s2, s3].map(x => x.text).join(' | '));
    p((await mcp.werkzeug('spalte_anlegen', { projektId: pid, art: 'gruppe', name: 'Geschäftsführung' })).fehler, 'doppelte Gruppe: Fehler');
    p(!(await mcp.werkzeug('berechtigung_setzen', { projektId: pid, nummer: nr1, spalte: 'HS', wert: 'ja' })).fehler, 'berechtigung_setzen ja');
    p(!(await mcp.werkzeug('berechtigung_setzen', { projektId: pid, nummer: nr2, spalte: 'hs', wert: 'zeit' })).fehler, 'berechtigung_setzen zeit (Kürzel klein geschrieben)');
    p((await mcp.werkzeug('berechtigung_setzen', { projektId: pid, nummer: nr2, spalte: 'ZZ', wert: 'ja' })).fehler, 'unbekannte Spalte: Fehler');
    let plan = (await mcp.werkzeug('schliessplan_lesen', { projektId: pid })).text;
    const zeile = (nr) => plan.split('\n').find(z => z.startsWith(nr + ' ')) || '';
    p(/HS/.test(plan) && /X/.test(zeile(nr1)) && /Z/.test(zeile(nr2)), 'schliessplan_lesen: Tabelle mit X und Z', plan);
    await mcp.werkzeug('berechtigung_setzen', { projektId: pid, nummer: nr1, spalte: 'HS', wert: 'nein' });
    plan = (await mcp.werkzeug('schliessplan_lesen', { projektId: pid })).text;
    p(!/X/.test(zeile(nr1)) && /·/.test(zeile(nr1)), 'nein nimmt die Berechtigung wieder weg', zeile(nr1));
    const sa = await mcp.werkzeug('stammdaten_aendern', { projektId: pid, felder: { ort: 'Berlin', plz: '10115' } });
    p(!sa.fehler && /Ort/.test(sa.text) && /PLZ/.test(sa.text), 'stammdaten_aendern nennt die Felder auf Deutsch', sa.text);
    p((await mcp.werkzeug('stammdaten_aendern', { projektId: pid, felder: { farbe: 'rot' } })).fehler, 'unbekanntes Stammdatenfeld: Fehler');
    const kurz = (await mcp.werkzeug('projekt_lesen', { projektId: pid })).text;
    p(/MCP-Kunde/.test(kurz) && /Berlin/.test(kurz) && /## Gliederung/.test(kurz) && /Haupteingang/.test(kurz) && /HS = Hauptschlüssel/.test(kurz), 'projekt_lesen kurz: Stammdaten, Gliederung, Türen, Spalten', kurz.slice(0, 300));
    const vollJson = JSON.parse((await mcp.werkzeug('projekt_lesen', { projektId: pid, umfang: 'voll' })).text);
    p(vollJson.tueren.length === 2 && vollJson.standorte.length === 4 && vollJson.schliessungen.length === 3 && vollJson.ort === 'Berlin', 'projekt_lesen voll: gültiges JSON mit allem', Object.keys(vollJson).join(','));
    for (const art of ['tuerliste', 'schliessplan', 'materialliste', 'pruefprotokoll']) {
      const b = await mcp.werkzeug('bericht_erzeugen', { projektId: pid, art, modus: 'kompakt', firma: 'Testfirma GmbH' });
      const datei = (/Bericht geschrieben: (.+\.pdf) \(/.exec(b.text) || [])[1];
      const kopf = datei && fs.existsSync(datei) ? fs.readFileSync(datei).slice(0, 5).toString() : '';
      p(!b.fehler && kopf === '%PDF-' && datei.startsWith(path.join(ARBEIT, 'aus')), 'bericht_erzeugen ' + art + ' schreibt eine PDF in den Ausgabeordner', b.text);
    }
    const bz = await mcp.werkzeug('bericht_erzeugen', { projektId: pid, art: 'tuerliste', modus: 'detail', pfad: path.join(ARBEIT, 'eigen', 'liste.pdf') });
    p(!bz.fehler && fs.existsSync(path.join(ARBEIT, 'eigen', 'liste.pdf')), 'bericht_erzeugen mit Zieldatei (Ordner wird angelegt)', bz.text);
    const euro = await mcp.werkzeug('schliessplan_lesen', { projektId: pid, darstellung: 'euro' });
    p(!euro.fehler && /Zyl\.Nr/.test(euro.text) && /Eigenschlüssel gehört zur Gruppe/.test(euro.text), 'schliessplan_lesen darstellung euro liefert den Europlan', euro.text.slice(0, 160));
    const planGesetzt = await mcp.werkzeug('berechtigung_setzen', { projektId: pid, nummer: nr1, spalte: 'HS', wert: 'plan' });
    plan = (await mcp.werkzeug('schliessplan_lesen', { projektId: pid })).text;
    p(!planGesetzt.fehler && /O/.test(zeile(nr1)), 'berechtigung_setzen plan zeigt O im Kreuzplan', zeile(nr1));
    const kl = (await mcp.werkzeug('katalog_lesen')).text;
    p(/zylinderBauform: Zylinder-Bauform \[/.test(kl) && /## Berechtigungen/.test(kl) && /## Stammdaten/.test(kl), 'katalog_lesen: Felder mit Werten, Stammdaten, Berechtigungen', kl.slice(0, 200));
    p(/## Schließsysteme/.test((await mcp.werkzeug('katalog_lesen', { bereich: 'systeme' })).text), 'katalog_lesen systeme');
    const tlo = await mcp.werkzeug('tuer_loeschen', { projektId: pid, nummer: nr2 });
    p(!tlo.fehler && /Gelöscht/.test(tlo.text) && (await mcp.werkzeug('tueren_auflisten', { projektId: pid })).text.split('\n').length === 1, 'tuer_loeschen: eine Tür bleibt', tlo.text);
    const unbekannt = await mcp.senden('tools/call', { name: 'gibt_es_nicht', arguments: {} });
    p(unbekannt.error && unbekannt.error.code === -32602, 'unbekanntes Werkzeug: JSON-RPC-Fehler -32602');
    const methode = await mcp.senden('irgendwas/anderes', {});
    p(methode.error && methode.error.code === -32601, 'unbekannte Methode: -32601');
    const vorher = mcp.alle.length; mcp.kind.stdin.write('{kaputt\n'); await warte(300);
    p(mcp.alle.slice(vorher).some(m => m.error && m.error.code === -32700), 'kaputte Zeile: -32700 Parse error');
    p(!/TypeError|ReferenceError|Warning/.test(mcp.stderr()), 'kein Programmfehler auf stderr', mcp.stderr());

    console.log('\n== MCP-Server mit Leseschlüssel und ohne Zugang ==');
    const kl2 = await ruf('/schluessel', { methode: 'POST', kopf: chef, json: { name: 'Nur lesen 2', rechte: 'lesen' } });
    const mcpLese = mcpStarten({ AUFMASS_URL: BASIS, AUFMASS_SCHLUESSEL: kl2.d.schluessel }); mcps.push(mcpLese);
    await mcpLese.senden('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    p(/nur lesen/.test((await mcpLese.werkzeug('zugang_pruefen')).text), 'zugang_pruefen: nur lesen');
    p(/MCP-Kunde/.test((await mcpLese.werkzeug('projekte_auflisten')).text), 'lesen geht');
    const schreibVersuch = await mcpLese.werkzeug('tuer_anlegen', { projektId: pid, felder: { bezeichnung: 'Nicht erlaubt' } });
    p(schreibVersuch.fehler && /HTTP 403/.test(schreibVersuch.text), 'schreiben: isError mit HTTP 403', schreibVersuch.text);
    const mcpTot = mcpStarten({ AUFMASS_URL: BASIS, AUFMASS_SCHLUESSEL: lese }); mcps.push(mcpTot);
    await mcpTot.senden('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    const tot = await mcpTot.werkzeug('zugang_pruefen');
    p(tot.fehler && /HTTP 401/.test(tot.text), 'widerrufener Schlüssel: isError mit HTTP 401', tot.text);
    const mcpOhne = mcpStarten({ AUFMASS_URL: '', AUFMASS_SCHLUESSEL: '' }); mcps.push(mcpOhne);
    const initOhne = await mcpOhne.senden('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    p(initOhne.result && (await mcpOhne.senden('tools/list', {})).result.tools.length === 17, 'ohne Zugangsdaten startet der Server trotzdem (Liste geht)');
    const ohne = await mcpOhne.werkzeug('projekte_auflisten');
    p(ohne.fehler && /AUFMASS_URL/.test(ohne.text), 'ein Aufruf ohne Zugangsdaten erklärt, was fehlt', ohne.text);

    console.log('\n== Kommandozeile ==');
    const cli = (args) => spawnSync(process.execPath, [CLI].concat(args), { env: Object.assign({}, process.env, { AUFMASS_URL: BASIS, AUFMASS_SCHLUESSEL: schreib }), encoding: 'utf8' });
    const c1 = cli(['projekte']);
    p(c1.status === 0 && /MCP-Kunde/.test(c1.stdout), 'aufmass-cli projekte', c1.stderr);
    const c2 = cli(['tuer', pid, nr1]);
    p(c2.status === 0 && JSON.parse(c2.stdout).notiz === 'Hinweis vom Test', 'aufmass-cli tuer <id> <nummer>', c2.stdout.slice(0, 100));
    const c3 = cli(['bericht', pid, 'schliessplan', path.join(ARBEIT, 'cli.pdf')]);
    p(c3.status === 0 && fs.existsSync(path.join(ARBEIT, 'cli.pdf')), 'aufmass-cli bericht', c3.stderr);
    const c4 = cli(['werkzeug', 'katalog_lesen', '{"bereich":"systeme"}']);
    p(c4.status === 0 && /Schließsysteme/.test(c4.stdout), 'aufmass-cli werkzeug <name> <json>');
    const c5 = cli(['unsinn']);
    p(c5.status === 1 && /Unbekannter Befehl/.test(c5.stderr), 'unbekannter Befehl: Ende 1 mit Meldung');
    const c6 = spawnSync(process.execPath, [CLI, 'ich', '--url=' + BASIS, '--schluessel=' + schreib], { env: Object.assign({}, process.env, { AUFMASS_URL: '', AUFMASS_SCHLUESSEL: '' }), encoding: 'utf8' });
    p(c6.status === 0 && /Chefin Test/.test(c6.stdout), 'Zugangsdaten als Optionen statt Umgebung', c6.stderr);
    const c7 = cli(['hilfe']);
    p(c7.status === 0 && /Befehle:/.test(c7.stdout), 'aufmass-cli hilfe');
    const PAKET = path.join(W, 'dist', 'aufmass-anbindung');
    if (fs.existsSync(path.join(PAKET, 'aufmass-cli.js'))) {
      const c8 = spawnSync(process.execPath, [path.join(PAKET, 'aufmass-cli.js'), 'projekte'], { env: Object.assign({}, process.env, { AUFMASS_URL: BASIS, AUFMASS_SCHLUESSEL: schreib }), encoding: 'utf8', cwd: os.tmpdir() });
      p(c8.status === 0 && /MCP-Kunde/.test(c8.stdout), 'das gebaute Paket (dist/aufmass-anbindung) läuft aus sich heraus, mit lib/ statt src/', c8.stderr);
      const c9 = spawnSync(process.execPath, [path.join(PAKET, 'aufmass-cli.js'), 'bericht', pid, 'tuerliste', path.join(ARBEIT, 'paket.pdf')], { env: Object.assign({}, process.env, { AUFMASS_URL: BASIS, AUFMASS_SCHLUESSEL: schreib }), encoding: 'utf8', cwd: os.tmpdir() });
      p(c9.status === 0 && fs.existsSync(path.join(ARBEIT, 'paket.pdf')), 'und erzeugt eine PDF mit den beigelegten Bausteinen', c9.stderr);
    } else { console.log('  (dist/aufmass-anbindung nicht gebaut - Paketprobe übersprungen)'); }

    console.log('\n== Drossel gegen Durchprobieren (zum Schluss) ==');
    let letzter = null;
    for (let i = 0; i < 31; i++) letzter = await ruf('/ich', { kopf: bearer('aufm_' + schreib.slice(5, 21) + '_' + crypto.randomBytes(36).toString('base64url')) });
    p(letzter.status === 429 && letzter.d.code === 'zu_viele', 'nach 30 Fehlversuchen: 429 zu_viele', letzter.status + ' ' + letzter.text);
    p((await ruf('/ich', { kopf: bearer(schreib) })).status === 429, 'die Sperre gilt dann auch für richtige Schlüssel dieser Herkunft');
    p(!serverFehler, 'keine PHP-Warnungen auf dem Server', serverFehler);
  } catch (e) {
    fehler++; console.log('  FEHL Ausnahme: ' + (e && e.stack || e));
  } finally {
    for (const m of mcps) { try { await m.ende(); } catch (e) {} }
    server.kill();
    try { fs.rmSync(ARBEIT, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\n' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})();
