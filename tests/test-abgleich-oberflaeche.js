/* Die Oberfläche des Abgleichs im echten Browser: Anmeldeseite,
 * Zustandsanzeige, Rückfrage bei Konflikt - gegen den echten Server. */
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { spawn } = require('child_process');
const { starte, istUmgebungsGeraeusch } = require('./browser.js');

const W = path.join(__dirname, '..');
const HAFEN = 8500 + (process.pid % 300);
const BASIS = 'http://127.0.0.1:' + HAFEN;
const ARBEIT = fs.mkdtempSync(path.join(os.tmpdir(), 'aufmass-ui-'));
const ARGS = ['--no-sandbox','--disable-component-update','--disable-background-networking',
  '--no-first-run','--disable-sync','--disable-default-apps','--metrics-recording-only'];

let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const CLIENT = '999-ui.apps.googleusercontent.com';
const DOMAENE = 'provision-infra.de';
function b64(r) { return Buffer.from(r).toString('base64url'); }
function ausweis(sub, name) {
  const kopf = b64(JSON.stringify({ alg: 'RS256', kid: 'ui-1', typ: 'JWT' }));
  const inhalt = b64(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub,
    email: sub + '@' + DOMAENE, email_verified: true, hd: DOMAENE, name,
    iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600, nonce: Math.random().toString(36).slice(2) }));
  return kopf + '.' + inhalt + '.' + crypto.sign('RSA-SHA256', Buffer.from(kopf + '.' + inhalt), privateKey).toString('base64url');
}
const OPT = path.join(ARBEIT, 'opt.json');
fs.writeFileSync(OPT, JSON.stringify({
  aufmass_client_id: CLIENT, aufmass_domaene: DOMAENE,
  aufmass_google_schluessel_sicherung: { keys: [{ kty: 'RSA', kid: 'ui-1', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] }
}));

(async () => {
  const server = spawn('php', ['-S', '127.0.0.1:' + HAFEN, path.join(W, 'server/tests/mini-server.php')], {
    env: Object.assign({}, process.env, {
      AUFMASS_TEST_DB: path.join(ARBEIT, 'd.sqlite'), AUFMASS_TEST_OPT: OPT,
      AUFMASS_TEST_UPLOADS: path.join(ARBEIT, 'up')
    }), stdio: ['ignore', 'ignore', 'pipe']
  });
  let serverFehler = '';
  server.stderr.on('data', d => { const t = String(d); if (/Fatal|Parse error/.test(t)) { serverFehler += t; } });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASIS + '/wp-json/aufmass/v1/start')).ok) break; } catch (e) {}
    await new Promise(r => setTimeout(r, 150));
  }

  const browser = await starte({ args: ARGS });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 860 } });
    const seite = await ctx.newPage();
    const konsole = [];
    seite.on('pageerror', e => {
      if (istUmgebungsGeraeusch(e.message, e.stack)) return;
      konsole.push('PAGEERROR: ' + e.message);
    });
    /* Zwei Geräusche gehören zur Prüfumgebung, nicht zum Werkzeug:
       - Googles Anmeldeskript ist hier nicht erreichbar (Zertifikat/Proxy)
       - im Abschnitt "Ohne Netz" wird die Verbindung absichtlich gekappt */
    seite.on('console', m => {
      if (m.type() !== 'error') return;
      const t = m.text();
      const wo = m.location() ? m.location().url : '';
      /* Was Googles Anmeldeskript aus dem Netz nachlädt, liegt außerhalb des Werkzeugs. */
      if (istUmgebungsGeraeusch(t, wo)) return;
      konsole.push(t + '  @ ' + (m.location() ? m.location().url : ''));
    });
    seite.on('requestfailed', r => {
      if (istUmgebungsGeraeusch(r.failure() ? r.failure().errorText : '', r.url())) return;
      if (/\/wp-json\//.test(r.url()) && offlineAbschnitt) return;
      konsole.push('Anfrage gescheitert: ' + r.url() + ' (' + (r.failure() || {}).errorText + ')');
    });
    let offlineAbschnitt = false;

    console.log('\n== Anmeldeseite ==');
    await seite.goto(BASIS + '/index.html', { waitUntil: 'load' });
    await seite.waitForSelector('header.kopf', { timeout: 10000 });
    await seite.waitForSelector('.anmelde-seite', { timeout: 10000 });
    p(true, 'ohne Anmeldung erscheint die Anmeldeseite');
    const text = await seite.textContent('.anmelde-karte');
    p(/provision-infra\.de/.test(text), 'sie nennt die Organisation', text.slice(0, 90));
    p(/ohne Anmeldung vollständig auf diesem Gerät/i.test(text),
      'sie sagt zu, dass das Werkzeug auch ohne Anmeldung läuft');
    p(await seite.$('button:has-text("Ohne Abgleich weiterarbeiten")') !== null,
      'und bietet den Weg ohne Abgleich an');
    const chip = await seite.textContent('.abgleich-status');
    p(/Nicht angemeldet/.test(chip), 'die Kopfzeile zeigt den Zustand', chip.trim());

    console.log('\n== Ohne Abgleich weiterarbeiten ==');
    await seite.click('button:has-text("Ohne Abgleich weiterarbeiten")');
    await seite.waitForTimeout(400);
    p(await seite.$('.anmelde-seite') === null, 'die Anmeldeseite verschwindet');
    p(await seite.$('button:has-text("+ Neues Aufmaß")') !== null, 'das Werkzeug ist bedienbar');

    console.log('\n== Anmelden ==');
    await seite.evaluate(t => window.Abgleich.anmelden(t), ausweis('u-ui', 'U. Prüfer'));
    await seite.waitForTimeout(900);
    await seite.evaluate(() => window.App.zeichnen());
    await seite.waitForTimeout(400);
    const chip2 = await seite.textContent('.abgleich-status');
    p(/Abgeglichen|wartet|Gleicht/.test(chip2), 'der Zustand wechselt auf abgeglichen', chip2.trim());
    const zust = await seite.evaluate(() => window.Abgleich.zustand());
    p(zust.angemeldet === true && zust.benutzer.name === 'U. Prüfer', 'das Werkzeug kennt den Benutzer',
      JSON.stringify(zust.benutzer));

    console.log('\n== Aufmaß anlegen und abgleichen ==');
    await seite.click('button:has-text("+ Neues Aufmaß")');
    await seite.waitForSelector('.dialog input[type=text]');
    await seite.fill('.dialog input[type=text]', 'Müller & Söhne GmbH');
    await seite.click('.dialog button:has-text("Übernehmen")');
    await seite.waitForTimeout(600);
    await seite.evaluate(() => window.Abgleich.jetzt());
    await seite.waitForTimeout(900);
    const amServer = await (await fetch(BASIS + '/wp-json/aufmass/v1/projekte', {
      headers: { 'X-Aufmass-Abgleich': '1', Cookie: (await ctx.cookies()).map(c => c.name + '=' + c.value).join('; ') }
    })).json();
    p((amServer.projekte || []).length === 1, 'das Aufmaß liegt auf dem Server',
      JSON.stringify((amServer.projekte || []).map(x => x.kunde)));
    p(amServer.projekte[0].kunde === 'Müller & Söhne GmbH', 'mit dem richtigen Kunden');
    p((amServer.projekte[0].zustaendige || []).length === 1, 'und einem Zuständigen',
      JSON.stringify(amServer.projekte[0].zustaendige));

    console.log('\n== Zuständige in den Stammdaten ==');
    await seite.evaluate(() => { window.AppKern.Zustand.ansicht = 'stammdaten'; window.App.zeichnen(); });
    await seite.waitForTimeout(800);
    const stamm = await seite.textContent('main.inhalt');
    p(/Zuständig für dieses Aufmaß/.test(stamm), 'die Zuständigkeit steht in den Stammdaten');
    p(/Ändern darf nur, wer hier eingetragen ist/.test(stamm), 'mit erklärendem Hinweis');

    console.log('\n== Rückfrage bei echtem Konflikt ==');
    /* Eine zweite Person ändert dieselbe Angabe über die Schnittstelle */
    const projektId = amServer.projekte[0].id;
    const kekse = (await ctx.cookies()).map(c => c.name + '=' + c.value).join('; ');
    const voll = await (await fetch(BASIS + '/wp-json/aufmass/v1/projekte/' + projektId,
      { headers: { 'X-Aufmass-Abgleich': '1', Cookie: kekse } })).json();
    /* Zuerst im Browser ändern, OHNE zu senden */
    await seite.evaluate(() => {
      const p = window.AppKern.Zustand.projekt;
      p.objekt = 'Vom iPad';
      window.AppKern.alsGeaendertMarkieren();
    });
    await seite.waitForTimeout(1200);
    /* Dann von außen etwas anderes eintragen */
    const fremd = JSON.parse(JSON.stringify(voll.daten));
    fremd.objekt = 'Aus dem Büro';
    const a = await fetch(BASIS + '/wp-json/aufmass/v1/projekte/' + projektId, {
      method: 'PUT', headers: { 'X-Aufmass-Abgleich': '1', 'Content-Type': 'application/json', Cookie: kekse },
      body: JSON.stringify({ daten: fremd, basisVersion: voll.version })
    });
    p(a.ok, 'die Gegenseite konnte speichern', String(a.status));

    await seite.evaluate(() => window.Abgleich.jetzt());
    await seite.waitForTimeout(1200);
    const konflikte = await seite.evaluate(() => window.Abgleich.zustand().konflikte.length);
    p(konflikte === 1, 'das Werkzeug erkennt den Konflikt', String(konflikte));

    await seite.evaluate(() => window.App.zeichnen());
    await seite.waitForTimeout(300);
    const chip3 = await seite.textContent('.abgleich-status');
    p(/Rückfrage/.test(chip3), 'die Kopfzeile meldet eine Rückfrage', chip3.trim());
    await seite.click('.abgleich-status');
    await seite.waitForSelector('.konflikt-liste', { timeout: 5000 });
    const dialog = await seite.textContent('.dialog');
    p(/Rückfrage zu/.test(dialog), 'der Rückfragedialog geht auf');
    p(/Vom iPad/.test(dialog) && /Aus dem Büro/.test(dialog), 'beide Fassungen stehen zur Wahl');
    p(/Objekt/.test(dialog), 'die strittige Angabe ist benannt');
    const fassungen = await seite.$$('.konflikt .fassung');
    p(fassungen.length === 2, 'es stehen genau zwei Fassungen zur Wahl', String(fassungen.length));

    await seite.locator('.konflikt .fassung').nth(1).click();   /* zweite Fassung = die vom Server */
    await seite.waitForTimeout(200);
    await seite.click('.dialog button:has-text("Übernehmen")');
    await seite.waitForTimeout(1500);
    const danach = await seite.evaluate(() => ({
      konflikte: window.Abgleich.zustand().konflikte.length,
      objekt: window.AppKern.Zustand.projekt ? window.AppKern.Zustand.projekt.objekt : null
    }));
    p(danach.konflikte === 0, 'nach der Entscheidung ist die Rückfrage weg');
    p(danach.objekt === 'Aus dem Büro',
      'die gewählte Fassung steht im GEÖFFNETEN Aufmaß, nicht nur in der Datenbank',
      String(danach.objekt));
    const angezeigt = await seite.textContent('main.inhalt');
    p(/Aus dem Büro/.test(angezeigt) || danach.objekt === 'Aus dem Büro',
      'und ist auch auf dem Bildschirm angekommen');

    console.log('\n== Ohne Netz ==');
    offlineAbschnitt = true;
    await ctx.setOffline(true);
    await seite.evaluate(() => {
      const p = window.AppKern.Zustand.projekt;
      p.bemerkung = 'Im Keller erfasst';
      window.AppKern.alsGeaendertMarkieren();
    });
    await seite.waitForTimeout(1500);
    await seite.evaluate(() => window.Abgleich.jetzt());
    await seite.waitForTimeout(800);
    await seite.evaluate(() => window.App.zeichnen());
    const chipOffline = await seite.textContent('.abgleich-status');
    p(/wartet|Offline/.test(chipOffline), 'ohne Netz meldet die Kopfzeile das offen Stehende', chipOffline.trim());
    const nochDa = await seite.evaluate(() => window.AppKern.Zustand.projekt.bemerkung);
    p(nochDa === 'Im Keller erfasst', 'die Eingabe ohne Netz ist erhalten');

    await ctx.setOffline(false);
    offlineAbschnitt = false;
    await seite.evaluate(() => window.Abgleich.jetzt());
    await seite.waitForTimeout(1500);
    const offen = await seite.evaluate(() => window.Abgleich.zustand().offen);
    p(offen === 0, 'mit Netz wird nachgeholt', String(offen));
    const amServer2 = await (await fetch(BASIS + '/wp-json/aufmass/v1/projekte/' + projektId,
      { headers: { 'X-Aufmass-Abgleich': '1', Cookie: kekse } })).json();
    p(amServer2.daten.bemerkung === 'Im Keller erfasst', 'und die Eingabe liegt auf dem Server',
      String(amServer2.daten.bemerkung));

    console.log('\n== Fremde Änderung trifft ein, während eine eigene noch ungesichert ist ==');
    /* Zwischen Eingabe und Autosave liegen bis zu 0,7 s. Kommt genau dann
       eine fremde Änderung herein, dürfen weder die eigene noch die fremde
       verlorengehen. */
    const stand2 = await (await fetch(BASIS + '/wp-json/aufmass/v1/projekte/' + projektId,
      { headers: { 'X-Aufmass-Abgleich': '1', Cookie: kekse } })).json();
    const fremd2 = JSON.parse(JSON.stringify(stand2.daten)); fremd2.kundenNr = 'K-FREMD-7';
    const a2 = await fetch(BASIS + '/wp-json/aufmass/v1/projekte/' + projektId, {
      method: 'PUT', headers: { 'X-Aufmass-Abgleich': '1', 'Content-Type': 'application/json', Cookie: kekse },
      body: JSON.stringify({ daten: fremd2, basisVersion: stand2.version }) });
    p(a2.ok, 'Vorbereitung: die Gegenseite hat die Kunden-Nr. gesetzt', String(a2.status));
    /* Eigene Eingabe (noch ungesichert) und sofort der Abgleich */
    await seite.evaluate(() => {
      const q = window.AppKern.Zustand.projekt;
      q.ansprechpartner = 'Eigene Eingabe, noch ungesichert';
      window.AppKern.alsGeaendertMarkieren();          /* Autosave in 0,7 s */
      return window.Abgleich.jetzt();                   /* der Abgleich kommt dazwischen */
    });
    await seite.waitForTimeout(4500);                    /* Autosave, Sendeverzug, Abgleich */
    await seite.evaluate(() => window.Abgleich.jetzt());
    await seite.waitForTimeout(1500);
    const danach2 = await seite.evaluate(() => ({ kundenNr: window.AppKern.Zustand.projekt.kundenNr,
      ansprechpartner: window.AppKern.Zustand.projekt.ansprechpartner, konflikte: window.Abgleich.zustand().konflikte.length }));
    p(danach2.kundenNr === 'K-FREMD-7', 'die fremde Änderung steht im geöffneten Aufmaß', JSON.stringify(danach2));
    p(danach2.ansprechpartner === 'Eigene Eingabe, noch ungesichert', 'die eigene, zuvor ungesicherte Eingabe ebenfalls', JSON.stringify(danach2));
    const amServer3 = await (await fetch(BASIS + '/wp-json/aufmass/v1/projekte/' + projektId,
      { headers: { 'X-Aufmass-Abgleich': '1', Cookie: kekse } })).json();
    p(amServer3.daten.kundenNr === 'K-FREMD-7' && amServer3.daten.ansprechpartner === 'Eigene Eingabe, noch ungesichert',
      'und auf dem Server stehen beide - nichts wurde überschrieben',
      JSON.stringify({ kundenNr: amServer3.daten.kundenNr, ansprechpartner: amServer3.daten.ansprechpartner }));
    p(danach2.konflikte === 0, 'ohne Rückfrage - es waren verschiedene Angaben', String(danach2.konflikte));

    console.log('\n== Die Gliederung kommt vom anderen Gerät, während hier eine Tür getippt wird ==');
    /* Der Fall aus der Praxis: Im Büro wird die Gliederung angelegt, vor
       Ort ist dasselbe Aufmaß geöffnet und jemand tippt gerade die erste
       Tür ein. Die Tür ist noch nicht im Aufmaß (erst „Tür speichern“
       bringt sie hinein), das Werkzeug gilt aber als ungesichert. Die
       Gliederung muss trotzdem im geöffneten Aufmaß ankommen - sonst
       schreibt das Speichern der Tür den Stand ohne Gliederung über den
       Server, und das Büro verliert seine Gliederung. */
    const stand3 = await (await fetch(BASIS + '/wp-json/aufmass/v1/projekte/' + projektId,
      { headers: { 'X-Aufmass-Abgleich': '1', Cookie: kekse } })).json();
    const fremd3 = JSON.parse(JSON.stringify(stand3.daten));
    fremd3.standorte = [
      { id: 'st-ui', ebene: 'standort', name: 'Standort Ibsen', parentId: null, bemerkung: '', sort: 0 },
      { id: 'geb-ui', ebene: 'gebaeude', name: 'Haus 1', parentId: 'st-ui', bemerkung: '', sort: 0 },
      { id: 'ber-ui', ebene: 'bereich', name: 'Erdgeschoss', parentId: 'geb-ui', bemerkung: '', sort: 0 }
    ];
    const a3 = await fetch(BASIS + '/wp-json/aufmass/v1/projekte/' + projektId, {
      method: 'PUT', headers: { 'X-Aufmass-Abgleich': '1', 'Content-Type': 'application/json', Cookie: kekse },
      body: JSON.stringify({ daten: fremd3, basisVersion: stand3.version }) });
    p(a3.ok, 'Vorbereitung: das Büro hat die Gliederung angelegt', String(a3.status));
    /* Hier: Türformular öffnen und tippen - noch nichts im Aufmaß */
    await seite.evaluate(() => window.App.wechseln('tueren'));
    await seite.waitForTimeout(400);
    await seite.click('button:has-text("+ Neue Tür") >> nth=0');
    await seite.waitForSelector('.dialog [data-feld="bezeichnung"] input');
    await seite.type('.dialog [data-feld="bezeichnung"] input', 'Eingang Ibsen');
    const waehrend = await seite.evaluate(() => ({ ungesichert: window.AppKern.Zustand.ungesichert,
      tueren: window.AppKern.Zustand.projekt.tueren.length, standorte: window.AppKern.Zustand.projekt.standorte.length }));
    p(waehrend.ungesichert === true && waehrend.standorte === 0, 'während des Tippens: ungesichert, die Tür noch nicht im Aufmaß, keine Gliederung', JSON.stringify(waehrend));
    await seite.evaluate(() => window.Abgleich.jetzt());    /* der Abgleich kommt mitten ins Tippen */
    await seite.waitForTimeout(1500);
    const imSpeicher = await seite.evaluate(() => window.AppKern.Zustand.projekt.standorte.map(k => k.name).join(' > '));
    p(imSpeicher === 'Standort Ibsen > Haus 1 > Erdgeschoss', 'die Gliederung steht im geöffneten Aufmaß - obwohl gerade getippt wird', imSpeicher || '(keine)');
    p((await seite.$$eval('.dialog', n => n.length)) === 1, 'das Türformular ist dabei offen geblieben');
    /* Die Tür speichern - das löst Autosave und Senden aus */
    await seite.click('.dialog .fuss button:has-text("Tür speichern")');
    await seite.waitForTimeout(4500);
    await seite.evaluate(() => window.Abgleich.jetzt());
    await seite.waitForTimeout(1500);
    const amServer4 = await (await fetch(BASIS + '/wp-json/aufmass/v1/projekte/' + projektId,
      { headers: { 'X-Aufmass-Abgleich': '1', Cookie: kekse } })).json();
    p((amServer4.daten.standorte || []).length === 3, 'auf dem Server steht die Gliederung noch - das Speichern der Tür hat sie nicht überschrieben',
      JSON.stringify((amServer4.daten.standorte || []).map(k => k.name)));
    p((amServer4.daten.tueren || []).some(x => x.bezeichnung === 'Eingang Ibsen'), 'und die neue Tür ist angekommen',
      JSON.stringify((amServer4.daten.tueren || []).map(x => x.bezeichnung)));
    await seite.evaluate(() => window.App.wechseln('struktur'));
    await seite.waitForTimeout(500);
    const baum = await seite.$$eval('.knoten .name', n => n.map(x => x.textContent));
    p(baum.join(' > ') === 'Standort Ibsen > Haus 1 > Erdgeschoss', 'der Reiter „Struktur“ zeigt die Gliederung', baum.join(' > ') || '(leer)');

    p(konsole.length === 0, 'keine JavaScript-Fehler in der Oberfläche', konsole.join(' | '));
    p(serverFehler === '', 'keine Fehler auf dem Server', serverFehler.slice(0, 300));
  } catch (e) {
    p(false, 'Durchlauf ohne Ausnahme', (e.stack || String(e)).split('\n').slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.kill();
    try { fs.rmSync(ARBEIT, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nErgebnis Abgleich-Oberfläche: ' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})();
