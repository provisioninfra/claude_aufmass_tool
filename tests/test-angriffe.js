/* Angriffsproben von außen - ohne Browser, direkt gegen die Schnittstelle,
 * wie ein Angreifer sie sieht: ohne Konto, mit Kauderwelsch, mit zu viel,
 * mit gefälschten Cookies, mit Umwegen in Adressen. Der Server ist der
 * echte PHP-Code (server/tests/mini-server.php lädt dieselben Klassen). */
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { spawn } = require('child_process');

const W = path.join(__dirname, '..');
const HAFEN = 9100 + (process.pid % 250);
const BASIS = 'http://127.0.0.1:' + HAFEN;
const API = BASIS + '/wp-json/aufmass/v1';
const ARBEIT = fs.mkdtempSync(path.join(os.tmpdir(), 'aufmass-angriff-'));
let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }
const warte = ms => new Promise(r => setTimeout(r, ms));

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const CLIENT = '444-an.apps.googleusercontent.com', DOMAENE = 'provision-infra.de';
function b64(r) { return Buffer.from(r).toString('base64url'); }
function ausweis(sub, name, zusatz) {
  const kopf = b64(JSON.stringify({ alg: 'RS256', kid: 'an-1', typ: 'JWT' }));
  const inhalt = b64(JSON.stringify(Object.assign({ iss: 'https://accounts.google.com', aud: CLIENT, sub,
    email: sub + '@' + DOMAENE, email_verified: true, hd: DOMAENE, name,
    iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600, nonce: Math.random().toString(36).slice(2) }, zusatz || {})));
  return kopf + '.' + inhalt + '.' + crypto.sign('RSA-SHA256', Buffer.from(kopf + '.' + inhalt), privateKey).toString('base64url');
}
const OPT = path.join(ARBEIT, 'opt.json');
fs.writeFileSync(OPT, JSON.stringify({ aufmass_client_id: CLIENT, aufmass_domaene: DOMAENE, permalink_structure: '/%postname%/',
  aufmass_google_schluessel_sicherung: { keys: [{ kty: 'RSA', kid: 'an-1', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] } }));

async function ruf(weg, opt) {
  opt = opt || {};
  const kopf = Object.assign({}, opt.kopf || {});
  if (opt.json !== undefined) { kopf['Content-Type'] = 'application/json'; }
  const r = await fetch(API + weg, { method: opt.methode || 'GET', headers: kopf, redirect: 'manual',
    body: opt.json !== undefined ? JSON.stringify(opt.json) : opt.koerper });
  const text = await r.text();
  let d = null; try { d = JSON.parse(text); } catch (e) {}
  return { status: r.status, d, text, kopf: r.headers };
}

(async () => {
  const server = spawn('php', ['-S', '127.0.0.1:' + HAFEN, path.join(W, 'server/tests/mini-server.php')], {
    env: Object.assign({}, process.env, { AUFMASS_TEST_DB: path.join(ARBEIT, 'd.sqlite'), AUFMASS_TEST_OPT: OPT,
      AUFMASS_TEST_UPLOADS: path.join(ARBEIT, 'up'), AUFMASS_TEST_MAIL: path.join(ARBEIT, 'm.log') }),
    stdio: ['ignore', 'ignore', 'pipe'] });
  let serverFehler = '';
  server.stderr.on('data', d => { const t = String(d); if (/Fatal|Parse error|Warning|Notice|Deprecated/.test(t)) serverFehler += t; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(API + '/start')).ok) break; } catch (e) {} await warte(150); }

  try {
    console.log('\n== Ohne Konto: was ein Fremder sieht ==');
    const start = await ruf('/start');
    p(start.status === 200 && start.d.eingerichtet === true, 'die Startauskunft ist erreichbar');
    p(start.d.pipedrive === undefined && start.d.version === undefined && start.d.benutzer === null,
      'sie verrät weder Anbindungen noch Fassung noch Personen', JSON.stringify(start.d));
    for (const weg of ['/projekte', '/benutzer', '/ich', '/projekte/x', '/fotos/x', '/projekte/x/fotos',
                       '/pipedrive/v1/users/me', '/freigaben?projekt=x']) {
      const r = await ruf(weg);
      p(r.status === 401, 'ohne Anmeldung gesperrt: ' + weg, String(r.status));
    }
    for (const [weg, methode] of [['/projekte/x', 'PUT'], ['/projekte/x', 'DELETE'], ['/freigaben', 'POST'],
                                  ['/freigaben/abcdefghjk/uebernommen', 'POST'], ['/fotos/x', 'PUT']]) {
      const r = await ruf(weg, { methode, kopf: { 'X-Aufmass-Abgleich': '1' }, json: {} });
      p(r.status === 401, 'ohne Anmeldung gesperrt: ' + methode + ' ' + weg, String(r.status));
    }
    const ohneKopf = await ruf('/anmelden', { methode: 'POST', json: { token: 'x' } });
    p(ohneKopf.status === 400 && /nicht vom Aufmaß-Werkzeug/.test(ohneKopf.d.message), 'Schreiben ohne das eigene Kopffeld wird abgewiesen (fremde Seiten können es nicht setzen)');

    console.log('\n== Gefälschte Ausweise ==');
    const falsch = [
      ['erfundener Text', 'kein.ausweis.hier'],
      ['Unterschrift mit anderem Schlüssel', (() => { const k = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
        const kopf = b64(JSON.stringify({ alg: 'RS256', kid: 'an-1', typ: 'JWT' }));
        const inhalt = b64(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub: 'x', email: 'x@' + DOMAENE, email_verified: true, hd: DOMAENE, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }));
        return kopf + '.' + inhalt + '.' + crypto.sign('RSA-SHA256', Buffer.from(kopf + '.' + inhalt), k.privateKey).toString('base64url'); })()],
      ['alg none', b64(JSON.stringify({ alg: 'none', kid: 'an-1' })) + '.' + b64(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub: 'x', email: 'x@' + DOMAENE, email_verified: true, hd: DOMAENE, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })) + '.'],
      ['fremde Organisation', ausweis('u-fremd', 'F', { hd: 'boese.example', email: 'u-fremd@boese.example' })],
      ['unbestätigte Adresse', ausweis('u-x', 'X', { email_verified: false })],
      ['abgelaufen', ausweis('u-x', 'X', { exp: Math.floor(Date.now() / 1000) - 3600 })],
      ['falsche Client-ID', ausweis('u-x', 'X', { aud: 'andere.apps.googleusercontent.com' })],
      ['zu alt (20 Minuten, noch nicht abgelaufen)', ausweis('u-x', 'X', { iat: Math.floor(Date.now() / 1000) - 1200 })],
      ['ohne Ausstellungszeit', ausweis('u-x', 'X', { iat: undefined })],
      ['fremdes azp', ausweis('u-x', 'X', { azp: 'andere.apps.googleusercontent.com' })],
      ['privates Konto ohne Organisation', ausweis('u-x', 'X', { hd: undefined, email: 'x@gmail.com' })],
      ['Organisation nur in der Adresse', ausweis('u-x', 'X', { hd: undefined })],
      ['Organisation nur im hd', ausweis('u-x', 'X', { email: 'x@gmail.com' })]
    ];
    for (const [name, token] of falsch) {
      const r = await ruf('/anmelden', { methode: 'POST', kopf: { 'X-Aufmass-Abgleich': '1' }, json: { token } });
      p(r.status === 401 || r.status === 400, 'abgewiesen: ' + name, String(r.status) + ' ' + (r.d && r.d.message));
      p(!(r.kopf.get('set-cookie') || '').includes('aufmass_sitzung='), 'und es gibt kein Sitzungscookie: ' + name);
    }

    console.log('\n== Ein Ausweis gilt genau einmal ==');
    const einmal = ausweis('u-weber', 'M. Weber');
    const w1 = await ruf('/anmelden', { methode: 'POST', kopf: { 'X-Aufmass-Abgleich': '1' }, json: { token: einmal } });
    const w2 = await ruf('/anmelden', { methode: 'POST', kopf: { 'X-Aufmass-Abgleich': '1' }, json: { token: einmal } });
    p(w1.status === 200 && w2.status === 401 && /bereits verwendet/.test(w2.d && w2.d.message),
      'derselbe Ausweis ein zweites Mal: abgewiesen - ein mitgelesener Ausweis eröffnet keine zweite Sitzung', w1.status + ' / ' + w2.status);
    p(!(w2.kopf.get('set-cookie') || '').includes('aufmass_sitzung=' ) || /aufmass_sitzung=;/.test(w2.kopf.get('set-cookie') || ''), 'und ohne Sitzungscookie');

    console.log('\n== Echte Anmeldung: das Cookie ==');
    const an = await ruf('/anmelden', { methode: 'POST', kopf: { 'X-Aufmass-Abgleich': '1', 'X-Forwarded-Proto': 'https' }, json: { token: ausweis('u-weber', 'M. Weber') } });
    p(an.status === 200, 'ein echter Ausweis meldet an', String(an.status));
    const keks = an.kopf.get('set-cookie') || '';
    p(/aufmass_sitzung=[0-9a-f]{32}\.[0-9a-f]{64}/.test(keks), 'das Cookie besteht aus Kennung und 256-Bit-Geheimnis', keks.slice(0, 60));
    p(/HttpOnly/i.test(keks) && /SameSite=Strict/i.test(keks), 'HttpOnly und SameSite=Strict', keks);
    p(/;\s*Secure/i.test(keks), 'Secure - auch wenn der Proxy davor die Verschlüsselung übernimmt', keks);
    const wert = /aufmass_sitzung=([^;]+)/.exec(keks)[1];
    const [sid, geheim] = wert.split('.');
    const echt = { Cookie: 'aufmass_sitzung=' + wert, 'X-Aufmass-Abgleich': '1' };
    p((await ruf('/ich', { kopf: echt })).status === 200, 'mit dem Cookie geht es');
    p((await ruf('/ich', { kopf: { Cookie: 'aufmass_sitzung=' + sid + '.' + 'f'.repeat(64) } })).status === 401, 'richtige Kennung, falsches Geheimnis: 401');
    p((await ruf('/ich', { kopf: { Cookie: 'aufmass_sitzung=' + sid + '.' + geheim.slice(0, 63) + (geheim[63] === 'a' ? 'b' : 'a') } })).status === 401, 'ein Zeichen anders: 401');
    p((await ruf('/ich', { kopf: { Cookie: 'aufmass_sitzung=' + sid } })).status === 401, 'nur die Kennung: 401');
    p((await ruf('/ich', { kopf: { Cookie: "aufmass_sitzung=' OR 1=1 --" } })).status === 401, 'SQL-Kauderwelsch: 401');
    const startAn = await ruf('/start', { kopf: echt });
    p(startAn.d.angemeldet === true && startAn.d.version !== undefined, 'angemeldet sieht man mehr');

    console.log('\n== Eine Freigabe anlegen, dann als Fremder daran rütteln ==');
    const projekt = { id: 'prj-a', kunde: 'Müller', objekt: 'Haus', tueren: [{ id: 't1' }, { id: 't2' }], schliessungen: [{ id: 's1' }, { id: 's2' }], standorte: [], matrix: {} };
    p((await ruf('/projekte/prj-a', { methode: 'PUT', kopf: echt, json: { daten: projekt, basisVersion: 0 } })).status === 200, 'Vorbereitung: Aufmaß liegt');
    const daten = { f: 2, pid: 'prj-a', kunde: 'Müller', objekt: 'Haus', t: [['t1', '1', 'A', ''], ['t2', '2', 'B', '']],
      r: { m: 1, g: 0, s: 0 }, mt: ['Karte'], gr: [['g1', 'EDV']], ma: [['m1', 'Herr Alt', ['g1'], [['Karte', 1]]]],
      s: [['s1', 'X', 'X', '', 'schliessung', ''], ['s2', 'Y', 'Y', '', 'gruppe', 'g1']], m: '0000', e: '0101' };
    const f = await ruf('/freigaben', { methode: 'POST', kopf: echt, json: { projektId: 'prj-a', daten, seite: BASIS + '/freigabe.html' } });
    p(f.status === 200 && f.d.code, 'Vorbereitung: Freigabe angelegt', JSON.stringify(f.d).slice(0, 100));
    const code = f.d.code;

    const oeff = await ruf('/freigaben/' + code);
    p(oeff.status === 200 && oeff.d.daten && oeff.d.daten.t.length === 2, 'der Kunde bekommt die Freigabe');
    p(JSON.stringify(oeff.d).indexOf('u-weber') === -1 && oeff.d.erstelltVon === undefined && oeff.d.projektId === undefined,
      'ohne Kennungen von Personen oder Aufmaßen', Object.keys(oeff.d).join());
    p(oeff.kopf.get('access-control-allow-origin') === null, 'keine Freigabe für fremde Herkünfte (CORS)');
    /* ("/../" probiert der Browser gar nicht erst: Er löst es auf, bevor
       die Anfrage den Server erreicht - deshalb steht es hier nicht.) */
    for (const weg of ['/freigaben/' + encodeURIComponent('../../x'), '/freigaben/' + code + '%00',
                       '/freigaben/' + code.toUpperCase() + '/antwort', '/freigaben/%27%20OR%201%3D1']) {
      const r = await ruf(weg, { methode: weg.endsWith('/antwort') ? 'POST' : 'GET', kopf: { 'X-Aufmass-Abgleich': '1' }, json: weg.endsWith('/antwort') ? {} : undefined });
      p(r.status === 404 || r.status === 400, 'Umwege in der Adresse führen nirgendwohin: ' + weg.slice(10, 50), String(r.status));
    }

    const kopfK = { 'X-Aufmass-Abgleich': '1' };
    const antwortOk = { f: 2, pid: 'prj-a', typ: 'antwort', tIds: ['t1', 't2'], sIds: ['s1', 's2'], a: '1:1' };
    const proben = [
      ['kein JSON', { koerper: '{{{{', kopf: Object.assign({ 'Content-Type': 'application/json' }, kopfK) }, [400]],
      ['leerer Körper', { koerper: '', kopf: Object.assign({ 'Content-Type': 'application/json' }, kopfK) }, [400]],
      ['Antwort ist eine Zahl', { json: { antwort: 5, name: 'X' }, kopf: kopfK }, [400]],
      ['nicht freigegebenes Feld', { json: { antwort: Object.assign({}, antwortOk, { a: '0:1' }), name: 'X' }, kopf: kopfK }, [400]],
      ['Feld außerhalb', { json: { antwort: Object.assign({}, antwortOk, { a: 'zzzzzzz:1' }), name: 'X' }, kopf: kopfK }, [400]],
      ['fremdes Aufmaß', { json: { antwort: Object.assign({}, antwortOk, { pid: 'prj-b' }), name: 'X' }, kopf: kopfK }, [400]],
      ['Gruppen ohne Recht', { json: { antwort: Object.assign({}, antwortOk, { gr: [['neu-a', 'Hacker']] }), name: 'X' }, kopf: kopfK }, [400]],
      ['neue Spalte ohne Recht', { json: { antwort: Object.assign({}, antwortOk, { n: [['gruppe', 'g1', '11']] }), name: 'X' }, kopf: kopfK }, [400]],
      ['Mitarbeiterliste als Zeichenkette', { json: { antwort: Object.assign({}, antwortOk, { ma: 'x' }), name: 'X' }, kopf: kopfK }, [400]],
      ['Mitarbeiter mit erfundener Kennung', { json: { antwort: Object.assign({}, antwortOk, { ma: [['m9', 'Fremd', [], []]] }), name: 'X' }, kopf: kopfK }, [400]],
      ['Löschen einer unbekannten Kennung', { json: { antwort: Object.assign({}, antwortOk, { max: ['m9'] }), name: 'X' }, kopf: kopfK }, [400]],
      ['Freigabe ohne Namen', { json: { antwort: Object.assign({}, antwortOk, { fr: { name: '' } }), name: 'X' }, kopf: kopfK }, [400]],
      ['alte Fassung', { json: { antwort: Object.assign({}, antwortOk, { f: 1 }), name: 'X' }, kopf: kopfK }, [400]],
      ['ohne Namen', { json: { antwort: antwortOk }, kopf: kopfK }, [400]],
      ['Name als Objekt', { json: { antwort: antwortOk, name: { x: 1 } }, kopf: kopfK }, [400]],
      ['ohne Kopffeld', { json: { antwort: antwortOk, name: 'X' } }, [400]]
    ];
    for (const [name, opt, erwartet] of proben) {
      const r = await ruf('/freigaben/' + code + '/antwort', Object.assign({ methode: 'POST' }, opt));
      p(erwartet.includes(r.status), 'Übertragen: ' + name + ' → ' + r.status, (r.d && r.d.message) || r.text.slice(0, 80));
    }
    const gross = await ruf('/freigaben/' + code + '/antwort', { methode: 'POST', kopf: kopfK, json: { antwort: Object.assign({}, antwortOk, { a: '1:1,'.repeat(120000) }), name: 'X' } });
    p(gross.status === 413, 'ein übergroßer Körper wird abgewiesen (413), bevor er entziffert wird', String(gross.status));
    const stand = await ruf('/freigaben/' + code);
    p(stand.d.status === 'offen' && stand.d.antwort === null, 'keiner der Versuche hat eine Rückmeldung hinterlassen');
    /* Unbrauchbares in der Mitarbeiterliste wird übergangen, die gültige
       Berechtigung daneben trotzdem angenommen - und nichts davon wandert
       in den Bauplan. */
    const tief = await ruf('/freigaben/' + code + '/antwort', { methode: 'POST', kopf: kopfK,
      json: { antwort: Object.assign({}, antwortOk, { ma: [['m1', 'Herr Alt', ['g1'], [['Karte', 1]]], [[[[[[['x']]]]]]], { '__proto__': { x: 1 } }] }), name: 'Tief' } });
    p(tief.status === 200 && tief.d.listen === 0 && tief.d.anzahl === 1, 'tief verschachtelter Unsinn wird übergangen, die gültige Berechtigung angenommen', JSON.stringify(tief.d));
    const nachTief = await ruf('/freigaben/' + code);
    p(nachTief.d.antwort && nachTief.d.antwort.ma === undefined && nachTief.d.antwort.a === '1:1', 'abgelegt ist nur das Brauchbare - eine unveränderte Liste gar nicht', JSON.stringify(nachTief.d.antwort));

    console.log('\n== Eine gute Übertragung, mit bösem Text ==');
    const gut = await ruf('/freigaben/' + code + '/antwort', { methode: 'POST', kopf: kopfK,
      json: { antwort: antwortOk, name: '<script>alert(1)</script>\r\nBcc: x@y', anmerkung: '"; DROP TABLE wp_aufmass_freigaben; --' } });
    p(gut.status === 200 && gut.d.ok === true, 'die gültige Übertragung wird angenommen', JSON.stringify(gut.d));
    const nach = await ruf('/freigaben/' + code);
    p(nach.d.status === 'beantwortet' && nach.d.antwortName === '<script>alert(1)</script> Bcc: x@y',
      'der Name wird einzeilig, aber unverändert abgelegt (die Seiten zeigen ihn als Text, nie als HTML)', nach.d.antwortName);
    const liste = await ruf('/freigaben?projekt=prj-a', { kopf: echt });
    p(liste.status === 200 && liste.d.freigaben.length === 1, 'die Tabelle ist noch da und die Anmerkung ebenfalls', liste.d.freigaben && liste.d.freigaben[0].antwortAnmerkung);
    const mails = fs.readFileSync(path.join(ARBEIT, 'm.log'), 'utf8').trim().split('\n').map(z => JSON.parse(z));
    const letzteMail = mails[mails.length - 1];
    p(mails.length === 2 && !/\r|\n/.test(letzteMail.betreff) && /ungeprüft/.test(letzteMail.text) && /alert\(1\)/.test(letzteMail.text),
      'je angenommener Übertragung eine E-Mail, mit sauberem Betreff und gekennzeichnetem Kundentext', JSON.stringify(letzteMail.betreff));
    p(!/<script>alert\(1\)<\/script>\r/.test(letzteMail.text) && letzteMail.kopf[0] === 'Content-Type: text/plain; charset=UTF-8',
      'als reiner Text - ein Skript im Namen ist dort nur Buchstaben');

    console.log('\n== Raten und Hämmern ==');
    let letzter = 0;
    for (let i = 0; i < 30; i++) { letzter = (await ruf('/freigaben/raten' + String(i).padStart(5, '0'))).status; }
    p(letzter === 404, '30 geratene Codes: 404');
    p((await ruf('/freigaben/ratenxxxxx')).status === 429, 'der 31. wird gedrosselt (429)');
    p((await ruf('/freigaben/' + code)).status === 200, 'der echte Kunde kommt weiter hinein');
    const um = await fetch(BASIS + '/f/' + code, { redirect: 'manual' });
    p(um.status === 302 && um.headers.get('location') === BASIS + '/freigabe.html#' + code, 'der Kurzlink leitet nur auf die eigene Seite um', um.headers.get('location'));
    p((await fetch(BASIS + '/f/..%2f..%2fetc', { redirect: 'manual' })).status === 404, 'ein Umweg im Kurzlink führt nirgendwohin');

    console.log('\n== Zurückgezogen heißt zu ==');
    p((await ruf('/freigaben/' + code + '/zurueckziehen', { methode: 'POST', kopf: echt, json: {} })).status === 200, 'Vorbereitung: zurückgezogen');
    p((await ruf('/freigaben/' + code)).status === 410, 'danach: 410 für den Kunden');
    p((await ruf('/freigaben/' + code + '/antwort', { methode: 'POST', kopf: kopfK, json: { antwort: antwortOk, name: 'X' } })).status === 410, 'und kein Übertragen mehr');

    console.log('\n== Abmelden macht das Cookie wertlos ==');
    p((await ruf('/abmelden', { methode: 'POST', kopf: echt })).status === 200, 'abgemeldet');
    p((await ruf('/ich', { kopf: echt })).status === 401, 'das alte Cookie gilt nicht mehr');

    console.log('\n== Gehämmerte Anmeldung ==');
    /* Von dieser Herkunft kamen oben schon einige falsche Ausweise. Nach
       höchstens 30 Fehlversuchen in zehn Minuten ist Schluss - dann gilt
       vorübergehend auch ein echter Ausweis nicht mehr. */
    let gedrosseltBei = -1;
    for (let i = 0; i < 40; i++) {
      const r = await ruf('/anmelden', { methode: 'POST', kopf: { 'X-Aufmass-Abgleich': '1' }, json: { token: 'kauderwelsch.' + i } });
      if (r.status === 429) { gedrosseltBei = i; break; }
      if (r.status !== 401) { gedrosseltBei = -2; break; }
    }
    p(gedrosseltBei >= 0 && gedrosseltBei <= 30, 'nach höchstens 30 Fehlversuchen antwortet der Server mit 429', String(gedrosseltBei));
    const gedrosselt = await ruf('/anmelden', { methode: 'POST', kopf: { 'X-Aufmass-Abgleich': '1' }, json: { token: ausweis('u-weber', 'M. Weber') } });
    p(gedrosselt.status === 429 && !(gedrosselt.kopf.get('set-cookie') || '').includes('aufmass_sitzung='),
      'solange gilt auch ein echter Ausweis nicht - und es gibt kein Cookie', String(gedrosselt.status));
    p(/Zu viele Versuche/.test(gedrosselt.d && gedrosselt.d.message), 'mit einer verständlichen Meldung', JSON.stringify(gedrosselt.d));

    p(serverFehler === '', 'der Server blieb ohne Warnungen und Fehler', serverFehler.slice(0, 300));
  } catch (e) {
    p(false, 'Durchlauf ohne Ausnahme', e.stack || String(e));
  } finally {
    server.kill();
    try { fs.rmSync(ARBEIT, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nErgebnis Angriffsproben: ' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})();
