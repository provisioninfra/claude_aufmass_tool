/* Pipedrive über den eigenen Server: Der Schlüssel liegt in WordPress und
 * verlässt den Server nie. Geprüft im echten Browser gegen den echten
 * PHP-Code, mit einer Attrappe von Pipedrive als zweitem Prozess. */
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { starte } = require('./browser.js');

const W = path.join(__dirname, '..');
const HAFEN = 8700 + (process.pid % 250);
const HAFEN_PD = HAFEN + 1;
const BASIS = 'http://127.0.0.1:' + HAFEN;
const ARBEIT = fs.mkdtempSync(path.join(os.tmpdir(), 'aufmass-pd-'));
const ARGS = ['--no-sandbox','--disable-component-update','--disable-background-networking',
  '--no-first-run','--disable-sync','--disable-default-apps','--metrics-recording-only'];
const TOKEN = 'f0e1d2c3b4a5968778695a4b3c2d1e0f1a2b3c4d';

let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const CLIENT = '555-pd.apps.googleusercontent.com', DOMAENE = 'provision-infra.de';
function b64(r) { return Buffer.from(r).toString('base64url'); }
function ausweis(sub, name) {
  const kopf = b64(JSON.stringify({ alg: 'RS256', kid: 'pd-1', typ: 'JWT' }));
  const inhalt = b64(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub,
    email: sub + '@' + DOMAENE, email_verified: true, hd: DOMAENE, name,
    iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600 }));
  return kopf + '.' + inhalt + '.' + crypto.sign('RSA-SHA256', Buffer.from(kopf + '.' + inhalt), privateKey).toString('base64url');
}
const OPT = path.join(ARBEIT, 'opt.json'), LOG = path.join(ARBEIT, 'pipedrive.log');
fs.writeFileSync(OPT, JSON.stringify({
  aufmass_client_id: CLIENT, aufmass_domaene: DOMAENE,
  aufmass_geheimnis: crypto.randomBytes(32).toString('hex'),
  aufmass_pipedrive_host: 'http://127.0.0.1:' + HAFEN_PD,
  aufmass_google_schluessel_sicherung: { keys: [{ kty: 'RSA', kid: 'pd-1', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] }
}));
/* Den Schlüssel so hinterlegen, wie es die Einstellungsseite täte: verschlüsselt. */
execFileSync('php', ['-r', 'require ' + JSON.stringify(path.join(W, 'server/tests/wp-attrappe.php')) + ';'
  + 'if (!Aufmass_Pipedrive::token_setzen(' + JSON.stringify(TOKEN) + ')) { fwrite(STDERR, "token_setzen fehlgeschlagen"); exit(1); }'],
  { env: Object.assign({}, process.env, { AUFMASS_TEST_OPT: OPT }) });
const gespeichert = JSON.parse(fs.readFileSync(OPT, 'utf8'));

(async () => {
  const umgebung = Object.assign({}, process.env, {
    AUFMASS_TEST_DB: path.join(ARBEIT, 'd.sqlite'), AUFMASS_TEST_OPT: OPT,
    AUFMASS_TEST_UPLOADS: path.join(ARBEIT, 'up'),
    AUFMASS_TEST_PD_TOKEN: TOKEN, AUFMASS_TEST_PD_LOG: LOG
  });
  const server = spawn('php', ['-S', '127.0.0.1:' + HAFEN, path.join(W, 'server/tests/mini-server.php')], { env: umgebung, stdio: ['ignore', 'ignore', 'pipe'] });
  const attrappe = spawn('php', ['-S', '127.0.0.1:' + HAFEN_PD, path.join(W, 'server/tests/fake-pipedrive.php')], { env: umgebung, stdio: ['ignore', 'ignore', 'pipe'] });
  let serverFehler = '';
  [server, attrappe].forEach(s => s.stderr.on('data', d => { const t = String(d); if (/Fatal|Parse error/.test(t)) serverFehler += t; }));
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASIS + '/wp-json/aufmass/v1/start')).ok && (await fetch('http://127.0.0.1:' + HAFEN_PD + '/api/v2/pipelines')).status === 401) break; } catch (e) {}
    await new Promise(r => setTimeout(r, 150));
  }

  const browser = await starte({ args: ARGS });
  try {
    console.log('\n== Ablage ==');
    p(gespeichert.aufmass_pipedrive_token && gespeichert.aufmass_pipedrive_token !== TOKEN,
      'der Schlüssel steht verschlüsselt in den Einstellungen', String(gespeichert.aufmass_pipedrive_token).slice(0, 12));
    p(JSON.stringify(gespeichert).indexOf(TOKEN) === -1, 'nirgends im Klartext');
    const start = await (await fetch(BASIS + '/wp-json/aufmass/v1/start')).json();
    p(start.pipedrive === true, 'der Server meldet: Pipedrive eingerichtet', JSON.stringify(start));
    p(start.pipedriveHost === '127.0.0.1:' + HAFEN_PD, 'und nennt die Adresse ohne Schlüssel', start.pipedriveHost);
    p(JSON.stringify(start).indexOf(TOKEN) === -1, 'der Start verrät den Schlüssel nicht');
    const ohne = await fetch(BASIS + '/wp-json/aufmass/v1/pipedrive/v1/users/me');
    p(ohne.status === 401, 'ohne Anmeldung ist die Weiterleitung zu', String(ohne.status));

    const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
    const seite = await ctx.newPage();
    const konsole = [], anfragen = [];
    seite.on('pageerror', e => konsole.push('PAGEERROR: ' + e.message));
    seite.on('console', m => { if (m.type() === 'error' && !/gsi\/client|accounts\.google|ERR_CERT|ERR_NAME_NOT_RESOLVED/.test(m.text())) konsole.push(m.text()); });
    seite.on('request', r => anfragen.push({ url: r.url(), kopf: r.headers() }));

    await seite.goto(BASIS + '/index.html', { waitUntil: 'load' });
    await seite.waitForSelector('header.kopf', { timeout: 10000 });
    await seite.evaluate(t => window.Abgleich.anmelden(t), ausweis('u-pd', 'P. Prüfer'));
    await seite.waitForTimeout(900);
    await seite.evaluate(() => window.App.zeichnen());
    await seite.waitForTimeout(300);
    p(await seite.evaluate(() => window.Abgleich.zustand().pipedrive === true), 'das Werkzeug weiß: Pipedrive läuft über den Server');
    p(await seite.evaluate(() => window.Pipedrive.quelle(window.AppKern.Zustand.einstellungen) === 'server'),
      'die Quelle ist der Server, obwohl auf dem Gerät kein Schlüssel liegt');

    console.log('\n== Einstellungen ==');
    await seite.evaluate(() => { window.AppKern.Zustand.ansicht = 'einstellungen'; window.App.zeichnen(); });
    await seite.waitForTimeout(400);
    const text = await seite.textContent('main.inhalt');
    p(/Über den Server verbunden/.test(text), 'die Einstellungen zeigen die Server-Verbindung');
    p(/kein Schlüssel nötig/.test(text), 'und sagen, dass das Gerät keinen Schlüssel braucht');
    p((await seite.$$('main input[type=password]')).length === 0, 'es gibt kein Schlüsselfeld mehr auf dem Gerät');
    await seite.click('main button:has-text("Verbindung prüfen")');
    await seite.waitForSelector('main .meldung.ok:has-text("Verbindung steht")', { timeout: 10000 });
    p(true, '„Verbindung prüfen“ geht über den Server durch');
    const angemeldetAls = await seite.textContent('main .meldung.ok:has-text("Verbindung steht")');
    p(/Pipedrive Prüfer/.test(angemeldetAls), 'und nennt das Pipedrive-Konto', angemeldetAls.trim().slice(0, 80));
    const pipelineWahl = seite.locator('main select').filter({ has: seite.locator('option:has-text("Neukunden Funnel")') }).first();
    p(await pipelineWahl.count() === 1, 'die Pipelines kommen an');
    await pipelineWahl.selectOption('1');
    await seite.waitForSelector('main option:has-text("Workshop / Aufmaß v.O.")', { state: 'attached', timeout: 10000 });
    p(true, 'die Phasen der gewählten Pipeline kommen an');

    console.log('\n== Aufmaß aus einem Deal ==');
    await seite.evaluate(() => { window.AppKern.Zustand.ansicht = 'projekte'; window.App.zeichnen(); });
    await seite.waitForTimeout(300);
    const knopf = await seite.$('button:has-text("Aus Pipedrive")');
    p(knopf !== null, 'die Projektübersicht bietet „Aus Pipedrive“ an');
    await knopf.click();
    await seite.waitForSelector('.dialog .deal-offen .tuer-zeile', { timeout: 10000 });
    const deals = await seite.$$eval('.dialog .deal-offen .tuer-zeile .bez', n => n.map(x => x.textContent));
    p(deals.length === 2 && deals.indexOf('Bürogebäude Königsallee 47') !== -1, 'die Deals werden gelistet', JSON.stringify(deals));
    await seite.click('.dialog .deal-offen .tuer-zeile:has-text("Königsallee")');
    await seite.waitForFunction(() => window.AppKern.Zustand.projekt && /Müller/.test(window.AppKern.Zustand.projekt.kunde || ''), null, { timeout: 10000 });
    const projekt = await seite.evaluate(() => { const q = window.AppKern.Zustand.projekt; return { kunde: q.kunde, ansprechpartner: q.ansprechpartner, ort: q.ort, pipedrive: q.pipedrive }; });
    p(/Müller/.test(projekt.kunde), 'das Aufmaß trägt den Kunden aus der Organisation', JSON.stringify(projekt));
    p(/Schäfer/.test(projekt.ansprechpartner || ''), 'und den Ansprechpartner aus der Person');
    p(projekt.pipedrive && String(projekt.pipedrive.dealId) === '501', 'und ist mit dem Deal verknüpft');

    console.log('\n== Der Schlüssel bleibt auf dem Server ==');
    const zurAttrappe = anfragen.filter(a => a.url.indexOf(':' + HAFEN_PD) !== -1);
    p(zurAttrappe.length === 0, 'der Browser spricht Pipedrive nie direkt an', zurAttrappe.map(a => a.url).join(', '));
    const mitSchluessel = anfragen.filter(a => a.url.indexOf(TOKEN) !== -1 || JSON.stringify(a.kopf).indexOf(TOKEN) !== -1);
    p(mitSchluessel.length === 0, 'keine Browser-Anfrage enthält den Schlüssel');
    const weiterleitungen = anfragen.filter(a => a.url.indexOf('/wp-json/aufmass/v1/pipedrive/') !== -1);
    p(weiterleitungen.length >= 5, 'die Abfragen laufen über die Weiterleitung (' + weiterleitungen.length + ')');
    /* Der erste Eintrag ist die Bereitschaftsprobe dieses Tests (ohne
       Schlüssel, Kennung "node") - sie zählt nicht als Abfrage des Servers. */
    const protokoll = (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').map(z => JSON.parse(z)) : [])
      .filter(z => z.ua !== 'node');
    p(protokoll.length >= 5, 'die Attrappe hat die Abfragen erhalten (' + protokoll.length + ')');
    p(protokoll.every(z => z.token === TOKEN), 'jede davon mit dem richtigen Schlüssel - vom Server gesetzt');
    p(protokoll.every(z => /^Aufmass-Werkzeug\//.test(z.ua)), 'und mit der Kennung des Servers, nicht des Browsers',
      JSON.stringify(protokoll.map(z => z.ua).slice(0, 2)));
    p(protokoll.some(z => z.weg === '/api/v2/organizations/90') && protokoll.some(z => z.weg === '/api/v2/persons/70'),
      'Organisation und Person wurden nachgeladen');
    const meAntwort = await seite.evaluate(async () => {
      const a = await fetch('/wp-json/aufmass/v1/pipedrive/v1/users/me', { credentials: 'same-origin', headers: { 'X-Aufmass-Abgleich': '1' } });
      return a.json();
    });
    p(meAntwort.daten && meAntwort.daten.data && meAntwort.daten.data.api_token === '[entfernt]',
      'nennt Pipedrive den Schlüssel in seiner Antwort, wird er vor dem Browser getilgt', JSON.stringify(meAntwort).slice(0, 160));
    /* Von außerhalb des Browsers, damit der absichtliche 403 nicht als
       Konsolenfehler der Seite erscheint. */
    const kekse = (await ctx.cookies()).map(c => c.name + '=' + c.value).join('; ');
    const verboten = (await fetch(BASIS + '/wp-json/aufmass/v1/pipedrive/v1/activities',
      { headers: { 'X-Aufmass-Abgleich': '1', Cookie: kekse } })).status;
    p(verboten === 403, 'ein nicht vorgesehener Weg wird auch für Angemeldete abgewiesen', String(verboten));

    p(konsole.length === 0, 'keine JavaScript-Fehler', konsole.join(' | '));
    p(serverFehler === '', 'keine Fehler auf den Servern', serverFehler.slice(0, 300));
  } catch (e) {
    p(false, 'Durchlauf ohne Ausnahme', (e.stack || String(e)).split('\n').slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.kill(); attrappe.kill();
    try { fs.rmSync(ARBEIT, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nErgebnis Pipedrive über Server: ' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})();
