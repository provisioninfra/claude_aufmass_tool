/* Kundenfreigabe über Kurzlink - der ganze Weg im echten Browser gegen den
 * echten PHP-Code: Werkzeug erzeugt den Kurzlink, der Kunde öffnet ihn ohne
 * Anmeldung, trägt ein, überträgt; das Werkzeug holt die Rückmeldung, zeigt
 * den Bericht und übernimmt erst nach Bestätigung. Dazu: erneutes Übertragen,
 * Verwerfen, Zurückziehen, unbekannter Code, Sichtbarkeit für Unzuständige. */
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { spawn } = require('child_process');
const { starte, ersteProjektOeffnen, istUmgebungsGeraeusch } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');

const W = path.join(__dirname, '..');
const HAFEN = 8900 + (process.pid % 250);
const BASIS = 'http://127.0.0.1:' + HAFEN;
const ARBEIT = fs.mkdtempSync(path.join(os.tmpdir(), 'aufmass-fr-'));
const MAIL = path.join(ARBEIT, 'mails.log');
const ARGS = ['--no-sandbox','--disable-component-update','--disable-background-networking',
  '--no-first-run','--disable-sync','--disable-default-apps','--metrics-recording-only'];

let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }
const warte = ms => new Promise(r => setTimeout(r, ms));

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const CLIENT = '777-fr.apps.googleusercontent.com', DOMAENE = 'provision-infra.de';
function b64(r) { return Buffer.from(r).toString('base64url'); }
function ausweis(sub, name) {
  const kopf = b64(JSON.stringify({ alg: 'RS256', kid: 'fr-1', typ: 'JWT' }));
  const inhalt = b64(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub,
    email: sub + '@' + DOMAENE, email_verified: true, hd: DOMAENE, name,
    iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600 }));
  return kopf + '.' + inhalt + '.' + crypto.sign('RSA-SHA256', Buffer.from(kopf + '.' + inhalt), privateKey).toString('base64url');
}
const OPT = path.join(ARBEIT, 'opt.json');
fs.writeFileSync(OPT, JSON.stringify({
  aufmass_client_id: CLIENT, aufmass_domaene: DOMAENE,
  permalink_structure: '/%postname%/',
  aufmass_google_schluessel_sicherung: { keys: [{ kty: 'RSA', kid: 'fr-1', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] }
}));
function mails() {
  if (!fs.existsSync(MAIL)) return [];
  return fs.readFileSync(MAIL, 'utf8').split('\n').filter(Boolean).map(z => JSON.parse(z));
}

(async () => {
  const server = spawn('php', ['-S', '127.0.0.1:' + HAFEN, path.join(W, 'server/tests/mini-server.php')], {
    env: Object.assign({}, process.env, {
      AUFMASS_TEST_DB: path.join(ARBEIT, 'd.sqlite'), AUFMASS_TEST_OPT: OPT,
      AUFMASS_TEST_UPLOADS: path.join(ARBEIT, 'up'), AUFMASS_TEST_MAIL: MAIL
    }), stdio: ['ignore', 'ignore', 'pipe']
  });
  let serverFehler = '';
  server.stderr.on('data', d => { const t = String(d); if (/Fatal|Parse error|Warning|Notice/.test(t)) { serverFehler += t; } });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASIS + '/wp-json/aufmass/v1/start')).ok) break; } catch (e) {}
    await warte(150);
  }

  const browser = await starte({ args: ARGS });
  function ueberwachen(seite, sammler) {
    seite.on('pageerror', e => {
      /* Ohne Netz zu Googles CDN scheitert Googles Anmeldeskript in sich selbst ("gis is not defined"). */
      if (istUmgebungsGeraeusch(e.message, e.stack)) return;
      sammler.push('PAGEERROR: ' + e.message);
    });
    seite.on('console', m => {
      if (m.type() !== 'error') return;
      const t = m.text();
      const wo = m.location() ? m.location().url : '';
      /* Was Googles Anmeldeskript aus dem Netz nachlädt, liegt außerhalb des Werkzeugs. */
      if (istUmgebungsGeraeusch(t, wo)) return;
      /* Die Kundenseite probiert bewusst Links aus, die 404/410 liefern. */
      if (/the server responded with a status of (404|410|400)/.test(t)) return;
      sammler.push(t + '  @ ' + (m.location() ? m.location().url : ''));
    });
  }
  try {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 860 } });
    const seite = await ctx.newPage();
    const konsole = [];
    ueberwachen(seite, konsole);

    console.log('\n== Werkzeug: anmelden, Aufmaß ablegen ==');
    await seite.goto(BASIS + '/index.html', { waitUntil: 'load' });
    await seite.waitForSelector('header.kopf', { timeout: 10000 });
    await seite.evaluate(t => window.Abgleich.anmelden(t), ausweis('u-weber', 'M. Weber'));
    await warte(800);
    const projekt = baueTestprojekt();
    await seite.evaluate(async ([pr, e]) => {
      await window.Store.projektSpeichern(pr);
      await window.Store.einstellungenSpeichern(e);
    }, [projekt, Object.assign({}, einstellungen, { firma: 'Provision Infra GmbH' })]);
    await seite.evaluate(() => window.Abgleich.jetzt());
    await warte(1500);
    const z0 = await seite.evaluate(() => window.Abgleich.zustand());
    p(z0.angemeldet && z0.offen === 0, 'das Aufmaß liegt auf dem Server', JSON.stringify({ angemeldet: z0.angemeldet, offen: z0.offen }));
    await seite.evaluate(() => { window.AppKern.Zustand.einstellungen.firma = 'Provision Infra GmbH'; window.App.zeichnen(); });
    await warte(300);
    p(await ersteProjektOeffnen(seite), 'das Aufmaß lässt sich öffnen');
    await seite.evaluate(() => window.App.wechseln('plan'));
    await seite.waitForSelector('table.matrix');

    console.log('\n== Kurzlink erzeugen ==');
    await seite.click('button:has-text("Kundenfreigabe")');
    await seite.waitForSelector('.dialog');
    const dialogText = await seite.textContent('.dialog');
    p(/kurzen Link/.test(dialogText) && /erst nach Ihrer Prüfung/.test(dialogText), 'der Dialog erklärt den Weg über den Kurzlink');
    const chips = await seite.$$('.dialog .chip');
    await chips[5].click(); await chips[10].click();
    await seite.fill('.dialog input[type=text] >> nth=0', 'Bitte die Reinigungszeiten eintragen');
    await seite.click('.dialog button:has-text("Freigabe-Link erzeugen")');
    await seite.waitForSelector('.dialog .kurzlink-feld', { timeout: 8000 });
    const kurzlink = await seite.inputValue('.dialog .kurzlink-feld');
    const code = (kurzlink.match(/\/f\/([a-z0-9]+)$/) || [])[1] || '';
    p(kurzlink === BASIS + '/f/' + code && code.length === 10, 'der Kurzlink hat die Form /f/CODE mit zehn Zeichen', kurzlink);
    p(kurzlink.length < 60, 'und ist kurz (' + kurzlink.length + ' Zeichen statt tausender)');
    const hinweis = await seite.textContent('.dialog .hinweis >> nth=-1');
    p(/Übertragen/.test(hinweis) && /geprüft/.test(hinweis), 'der Hinweis erklärt Übertragen und Prüfung', hinweis.slice(0, 80));
    await seite.waitForSelector('.dialog .freigabe-eintrag', { timeout: 5000 });
    const eintraege = await seite.$$eval('.dialog .freigabe-eintrag', n => n.map(x => x.textContent));
    p(eintraege.length === 1 && /Offen/.test(eintraege[0]) && /M\. Weber/.test(eintraege[0]),
      'die Liste der Freigabe-Links zeigt den neuen Link als offen', eintraege.join(' | ').slice(0, 120));
    await seite.click('.dialog .fuss button:has-text("Schließen")');

    console.log('\n== Kunde: Kurzlink öffnen, ohne Anmeldung ==');
    const ctxKunde = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const kunde = await ctxKunde.newPage();
    const kundeKonsole = [], kundeAnfragen = [];
    ueberwachen(kunde, kundeKonsole);
    kunde.on('request', r => kundeAnfragen.push({ url: r.url(), kopf: r.headers() }));
    await kunde.goto(kurzlink, { waitUntil: 'load' });
    await kunde.waitForSelector('table.matrix', { timeout: 10000 });
    p(kunde.url() === BASIS + '/freigabe.html#' + code, 'der Kurzlink leitet auf die Freigabeseite mit dem Code im Anker', kunde.url());
    const kopf = await kunde.textContent('.fr-kopf');
    p(/Müller/.test(kopf), 'Kunde und Objekt werden angezeigt', kopf.trim().slice(0, 60));
    p(/Reinigungszeiten/.test(await kunde.textContent('.meldung.info')), 'der mitgegebene Hinweis erscheint');
    p(/Übertragen/.test(await kunde.textContent('.meldung.info')), 'die Anleitung nennt den Knopf „Übertragen“');
    const freieZellen = await kunde.$$eval('td.zelle.frei', n => n.length);
    p(freieZellen === projekt.tueren.length * 2, 'nur die freigegebenen Spalten sind bearbeitbar (' + freieZellen + ')');
    p((await ctxKunde.cookies()).length === 0, 'der Kunde bekommt kein Sitzungscookie');
    p(kundeAnfragen.every(a => !a.kopf.cookie), 'und schickt auch keines');
    p(kundeAnfragen.filter(a => /\/wp-json\//.test(a.url)).every(a => /\/freigaben\/[a-z0-9]+$/.test(a.url)),
      'die Seite fragt nur den Freigabe-Weg ab, nichts anderes',
      kundeAnfragen.filter(a => /\/wp-json\//.test(a.url)).map(a => a.url).join(', '));
    p(/gültig bis/.test(await kunde.textContent('.fr-inhalt')), 'die Gültigkeit wird genannt');

    /* Drei leere freie Felder setzen: X, Z, X */
    const leer = await kunde.$$eval('td.zelle.frei', ns => ns.map((n, i) => n.textContent.trim() === '' ? i : -1).filter(i => i >= 0));
    const freie = await kunde.$$('td.zelle.frei');
    await freie[leer[0]].click(); await warte(80);
    await freie[leer[1]].click(); await warte(80); await freie[leer[1]].click(); await warte(80);
    await freie[leer[2]].click(); await warte(120);
    const bloecke = await kunde.$$('.fr-inhaber-block');
    await bloecke[0].$eval('button:has-text("+ Person")', b => b.click());
    await warte(120);
    const neueZeile = (await bloecke[0].$$('.fr-person-zeile')).pop();
    await neueZeile.$eval('input.name', n => n.focus()); await kunde.keyboard.type('Frau Kundenseitig');
    await neueZeile.$eval('input.funktion', n => n.focus()); await kunde.keyboard.type('Empfang');
    await warte(120);
    p(/3 Änderungen/.test(await kunde.textContent('#fr-zaehler')) && /1 Inhaberliste/.test(await kunde.textContent('#fr-zaehler')),
      'drei Felder und eine Inhaberliste gelten als geändert', (await kunde.textContent('#fr-zaehler')).trim());

    console.log('\n== Kunde: Übertragen ==');
    await kunde.click('#fr-uebertragen');
    await kunde.waitForSelector('#fr-senden');
    p(/3 Berechtigungen und 1 Inhaberliste geändert/.test(await kunde.textContent('.dialog .meldung')),
      'die Zusammenfassung vor dem Übertragen stimmt', (await kunde.textContent('.dialog .meldung')).trim());
    await kunde.click('#fr-senden');
    await warte(300);
    const fehlerText = await kunde.textContent('#fr-fehler');
    p(/Namen/.test(fehlerText) && await kunde.isVisible('#fr-fehler'), 'ohne Namen wird nicht übertragen', fehlerText.trim());
    p(await kunde.$('#fr-fertig') === null, 'und es gibt noch keine Bestätigung');
    p(mails().length === 0, 'und keine E-Mail');
    await kunde.fill('#fr-name', 'Frau Kundig');
    await kunde.fill('#fr-anmerkung', 'Bitte prüfen, ob Herr Özdemir zwei Schlüssel braucht.');
    await kunde.click('#fr-senden');
    await kunde.waitForSelector('#fr-fertig', { timeout: 8000 });
    const fertig = await kunde.textContent('#fr-fertig');
    p(/Vielen Dank, Frau Kundig/.test(fertig), 'die Bestätigung nennt den Namen', fertig.trim().slice(0, 80));
    p(/3 Berechtigungen und 1 Inhaberliste/.test(fertig), 'und zählt, was übertragen wurde');
    p(/Provision Infra GmbH prüft/.test(fertig), 'und sagt, dass erst geprüft wird');

    const post = mails();
    p(post.length === 1, 'genau eine E-Mail wurde ausgelöst', String(post.length));
    p(post.length === 1 && post[0].an.indexOf('u-weber@provision-infra.de') !== -1, 'an den Ersteller des Links', JSON.stringify(post[0] && post[0].an));
    p(post.length === 1 && /Kundenrückmeldung/.test(post[0].betreff) && /Frau Kundig/.test(post[0].text) && /Özdemir/.test(post[0].text),
      'mit Betreff, Name und Anmerkung', post[0] && post[0].betreff);
    p(post.length === 1 && post[0].text.indexOf(BASIS + '/') !== -1, 'und dem Weg zum Werkzeug');

    /* Die Seite erneut öffnen: der übertragene Stand ist wieder da */
    await kunde.reload({ waitUntil: 'load' });
    await kunde.waitForSelector('table.matrix', { timeout: 10000 });
    p(/bereits übertragen/.test(await kunde.textContent('#fr-stand')), 'nach dem Neuladen steht da: bereits übertragen');
    p((await kunde.$$eval('td.zelle.geaendert', n => n.length)) === 3, 'die drei geänderten Felder sind wieder eingetragen');
    const namen = await kunde.$$eval('.fr-inhaber-block input.name', ns => ns.map(n => n.value));
    p(namen.indexOf('Frau Kundenseitig') !== -1, 'und die eingetragene Person auch', namen.join(', '));

    console.log('\n== Werkzeug: die Rückmeldung kommt an, wird geprüft und übernommen ==');
    const vorherZellen = await seite.evaluate(() => Object.keys(window.AppKern.Zustand.projekt.matrix).length);
    await seite.evaluate(() => window.Abgleich.jetzt());
    await warte(1200);
    const antworten = await seite.evaluate(() => window.Abgleich.zustand().antworten);
    p(antworten.length === 1 && antworten[0].code === code && antworten[0].antwortName === 'Frau Kundig',
      'der Abgleich bringt die Rückmeldung mit', JSON.stringify(antworten.map(a => [a.code, a.antwortName])));
    p(antworten.length === 1 && antworten[0].antwortAnzahl === 3 && antworten[0].antwortListen === 1, 'mit den richtigen Zahlen');
    const vorherServer = await seite.evaluate(() => Object.keys(window.AppKern.Zustand.projekt.matrix).length);
    p(vorherServer === vorherZellen, 'am Aufmaß hat sich noch nichts geändert (erst nach Bestätigung)');
    /* Noch OHNE Neuaufbau der Ansicht: Kopfzeile und Hinweis ziehen von selbst mit */
    const chipSofort = await seite.textContent('.abgleich-status');
    p(/1 Rückmeldung/.test(chipSofort), 'die Kopfzeile meldet die Rückmeldung sofort', chipSofort.trim());
    p(await seite.$('.antworten-hinweis') !== null, 'der Hinweis im Schließplan erscheint ohne Neuaufbau der Ansicht');
    await seite.evaluate(() => window.App.zeichnen());
    await warte(300);
    const chip = await seite.textContent('.abgleich-status');
    p(/1 Rückmeldung/.test(chip), 'die Kopfzeile meldet die Rückmeldung', chip.trim());
    p((await seite.$$('.antworten-hinweis')).length === 1, 'der Schließplan zeigt den Hinweis genau einmal');
    p(/Frau Kundig/.test(await seite.textContent('.antworten-hinweis')), 'mit dem Namen des Kunden');
    await seite.click('.antworten-hinweis button:has-text("Prüfen und übernehmen")');
    await seite.waitForSelector('.antwort-bericht table', { timeout: 5000 });
    const bericht = await seite.textContent('.dialog');
    p((await seite.$$eval('.antwort-bericht tbody tr', n => n.length)) === 3, 'der Bericht listet drei Berechtigungen');
    p(/Frau Kundenseitig/.test(bericht), 'und die neue Person');
    p(/Herr Özdemir zwei Schlüssel/.test(bericht), 'und die Anmerkung des Kunden');
    p(/erst etwas, wenn Sie unten auf „Übernehmen“/.test(bericht), 'und erklärt, dass noch nichts geändert ist');
    await seite.click('.dialog .fuss button:has-text("Übernehmen")');
    await warte(1500);
    const nachher = await seite.evaluate(() => ({
      zellen: Object.keys(window.AppKern.Zustand.projekt.matrix).length,
      antworten: window.Abgleich.zustand().antworten.length,
      personen: window.AppKern.Zustand.projekt.schliessungen.some(s => (s.personen || []).some(x => x.name === 'Frau Kundenseitig')),
      verlauf: window.Verlauf.naechsteBeschreibung(),
      ungesichert: window.AppKern.Zustand.ungesichert
    }));
    p(nachher.zellen === vorherZellen + 3, 'drei Berechtigungen stehen jetzt im geöffneten Aufmaß', vorherZellen + ' -> ' + nachher.zellen);
    p(nachher.personen, 'die neue Person steht in der Inhaberliste');
    p(nachher.antworten === 0, 'die Rückmeldung ist erledigt');
    p(nachher.verlauf === 'Kundenrückmeldung übernommen', 'der Schritt lässt sich zurücknehmen', nachher.verlauf);
    await warte(3500);
    const kekse = (await ctx.cookies()).map(c => c.name + '=' + c.value).join('; ');
    const liste = await (await fetch(BASIS + '/wp-json/aufmass/v1/freigaben?projekt=' + projekt.id,
      { headers: { 'X-Aufmass-Abgleich': '1', Cookie: kekse } })).json();
    p(liste.freigaben[0].status === 'uebernommen' && liste.freigaben[0].uebernommenVon === 'M. Weber',
      'der Server weiß: übernommen von M. Weber', JSON.stringify([liste.freigaben[0].status, liste.freigaben[0].uebernommenVon]));
    const amServer = await (await fetch(BASIS + '/wp-json/aufmass/v1/projekte/' + projekt.id,
      { headers: { 'X-Aufmass-Abgleich': '1', Cookie: kekse } })).json();
    p(Object.keys(amServer.daten.matrix).length === vorherZellen + 3, 'und das geänderte Aufmaß liegt wieder auf dem Server',
      String(Object.keys(amServer.daten.matrix).length));
    p(amServer.daten.schliessungen.some(s => (s.personen || []).some(x => x.name === 'Frau Kundenseitig')), 'samt der neuen Person');
    const chipDanach = await seite.textContent('.abgleich-status');
    p(!/Rückmeldung/.test(chipDanach), 'die Kopfzeile ist wieder ruhig', chipDanach.trim());
    p(await seite.$('.antworten-hinweis') === null, 'und der Hinweis im Schließplan ist weg');

    console.log('\n== Kunde überträgt erneut - nur Zuständige sehen es ==');
    await kunde.evaluate(() => document.querySelector('.fr-fertig button') && document.querySelector('.fr-fertig button').click());
    await kunde.reload({ waitUntil: 'load' });
    await kunde.waitForSelector('table.matrix', { timeout: 10000 });
    p(/bereits übernommen/.test(await kunde.textContent('#fr-stand')), 'der Kunde sieht: bereits übernommen');
    const leer2 = await kunde.$$eval('td.zelle.frei', ns => ns.map((n, i) => n.textContent.trim() === '' ? i : -1).filter(i => i >= 0));
    const freie2 = await kunde.$$('td.zelle.frei');
    await freie2[leer2[0]].click(); await warte(120);
    await kunde.click('#fr-uebertragen');
    await kunde.waitForSelector('#fr-senden');
    p((await kunde.inputValue('#fr-name')) === 'Frau Kundig', 'der Name ist schon eingetragen');
    await kunde.click('#fr-senden');
    await kunde.waitForSelector('#fr-fertig', { timeout: 8000 });
    p(mails().length === 2, 'die zweite Übertragung löst wieder eine E-Mail aus', String(mails().length));

    const ctx2 = await browser.newContext({ viewport: { width: 1180, height: 860 } });
    const fremd = await ctx2.newPage();
    const fremdKonsole = [];
    ueberwachen(fremd, fremdKonsole);
    await fremd.goto(BASIS + '/index.html', { waitUntil: 'load' });
    await fremd.waitForSelector('header.kopf', { timeout: 10000 });
    await fremd.evaluate(t => window.Abgleich.anmelden(t), ausweis('u-kraus', 'J. Kraus'));
    await warte(1500);
    const fremdSicht = await fremd.evaluate(() => window.Abgleich.zustand().antworten.length);
    p(fremdSicht === 0, 'ein Unzuständiger bekommt die Rückmeldung nicht zu sehen', String(fremdSicht));

    await seite.evaluate(() => window.Abgleich.jetzt());
    await warte(1200);
    const zweite = await seite.evaluate(() => window.Abgleich.zustand().antworten);
    p(zweite.length === 1 && zweite[0].antwortNr === 2, 'der Zuständige sieht die zweite Rückmeldung (Nr. 2)', JSON.stringify(zweite.map(a => a.antwortNr)));

    console.log('\n== Verwerfen über die Kopfzeile ==');
    await seite.evaluate(() => window.App.zeichnen());
    await warte(300);
    await seite.click('.abgleich-status');
    await seite.waitForSelector('.antworten-liste', { timeout: 5000 });
    p(/Rückmeldungen von Kunden/.test(await seite.textContent('.dialog')), 'die Übersicht führt die wartende Rückmeldung auf');
    await seite.click('.antworten-liste button:has-text("Prüfen")');
    await seite.waitForSelector('.antwort-bericht table', { timeout: 5000 });
    /* Die Antwort nennt alle vier Abweichungen zum freigegebenen Stand;
       drei davon sind schon im Aufmaß. Der Bericht zeigt nur, was sich
       JETZT noch ändern würde - sonst sähe es nach vier neuen aus. */
    p((await seite.$$eval('.antwort-bericht tbody tr', n => n.length)) === 1,
      'der Bericht zur zweiten Rückmeldung zeigt nur die eine neue Abweichung, nicht die drei schon übernommenen');
    await seite.click('.dialog .fuss button:has-text("Verwerfen")');
    await seite.waitForSelector('.dialog.klein', { timeout: 5000 });
    await seite.click('.dialog.klein .fuss button:has-text("Verwerfen")');
    await warte(1000);
    const nachVerwerfen = await seite.evaluate(() => ({
      antworten: window.Abgleich.zustand().antworten.length,
      zellen: Object.keys(window.AppKern.Zustand.projekt.matrix).length
    }));
    p(nachVerwerfen.antworten === 0, 'die Rückmeldung ist weg', String(nachVerwerfen.antworten));
    p(nachVerwerfen.zellen === vorherZellen + 3, 'ohne das Aufmaß zu ändern');
    const liste2 = await (await fetch(BASIS + '/wp-json/aufmass/v1/freigaben?projekt=' + projekt.id,
      { headers: { 'X-Aufmass-Abgleich': '1', Cookie: kekse } })).json();
    p(liste2.freigaben[0].status === 'verworfen', 'der Server weiß: verworfen', liste2.freigaben[0].status);

    console.log('\n== Zurückziehen ==');
    await seite.waitForSelector('.dialog', { state: 'detached', timeout: 3000 }).catch(() => {});
    await seite.click('button:has-text("Kundenfreigabe")');
    await seite.waitForSelector('.dialog .freigabe-eintrag', { timeout: 5000 });
    p(/geprüft und verworfen/.test(await seite.textContent('.dialog .freigabe-eintrag')), 'die Liste nennt den Zustand');
    await seite.click('.dialog .freigabe-eintrag button:has-text("Zurückziehen")');
    await seite.waitForSelector('.dialog.klein', { timeout: 5000 });
    await seite.click('.dialog.klein .fuss button:has-text("Zurückziehen")');
    await warte(800);
    p(/Zurückgezogen/.test(await seite.textContent('.dialog .freigabe-eintrag')), 'danach steht da: zurückgezogen');
    p((await seite.$$('.dialog .freigabe-eintrag button')).length === 0, 'und es gibt nichts mehr zu tun');
    await kunde.reload({ waitUntil: 'load' });
    await kunde.waitForSelector('.meldung.fehler', { timeout: 10000 });
    p(/nicht mehr gültig/.test(await kunde.textContent('.meldung.fehler')), 'der Kunde sieht: Link nicht mehr gültig',
      (await kunde.textContent('.meldung.fehler')).trim().slice(0, 80));

    console.log('\n== Unbekannter Code ==');
    await kunde.goto(BASIS + '/f/gibtsnicht1', { waitUntil: 'load' });
    await kunde.waitForSelector('.meldung.fehler', { timeout: 10000 });
    p(/gibt es nicht/.test(await kunde.textContent('.meldung.fehler')), 'ein unbekannter Kurzlink wird erklärt',
      (await kunde.textContent('.meldung.fehler')).trim().slice(0, 80));
    await kunde.goto(BASIS + '/freigabe.html', { waitUntil: 'load' });
    await kunde.waitForSelector('.meldung.fehler', { timeout: 10000 });
    p(/Freigabe-Link/.test(await kunde.textContent('.meldung.fehler')), 'ohne Code wird erklärt, wie die Seite benutzt wird');

    console.log('\n== Sauberkeit ==');
    p(konsole.length === 0, 'keine Fehler im Werkzeug', konsole.join(' | ').slice(0, 300));
    p(kundeKonsole.length === 0, 'keine Fehler auf der Kundenseite', kundeKonsole.join(' | ').slice(0, 300));
    p(fremdKonsole.length === 0, 'keine Fehler beim zweiten Gerät', fremdKonsole.join(' | ').slice(0, 300));
    p(serverFehler === '', 'keine Fehler im Server', serverFehler.slice(0, 300));
  } finally {
    await browser.close();
    server.kill();
  }
  console.log('\nErgebnis Freigabe über Server: ' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
