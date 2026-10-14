/* Tür einsprechen: Feldschema und Übernahme ohne Browser, dann der ganze
 * Weg im echten Browser - Aufnahme mit dem Prüfmikrofon von Chromium,
 * Erkennung und Zuordnung über den echten PHP-Server gegen eine Attrappe
 * von OpenAI, Vorschlag, Übernahme in die Tür. Der Schlüssel bleibt dabei
 * auf dem Server. */
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { starte, istUmgebungsGeraeusch, ersteProjektOeffnen } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');

const W = path.join(__dirname, '..');
let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

/* ------------------------------------------------------------------ */
console.log('\n== Das Feldschema aus dem Katalog ==');
global.Katalog = require('../src/js/catalog.js');
const Diktat = require('../src/js/diktat.js');
const eins = { eigeneZylinderarten: ['Spezialzylinder XY'], eigeneSysteme: [{ id: 'eig-1', name: 'Keyota Pro' }] };
const schema = Diktat.felder({ anlagenart: 'mechanik' }, eins);
const namen = schema.map(f => f.name);
p(schema.length >= 50 && schema.length <= 80, 'das Schema hat zwischen 50 und 80 Felder (' + schema.length + ')');
p(new Set(namen).size === namen.length, 'alle Feldnamen sind eindeutig');
p(schema.every(f => /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(f.name) && ['text', 'zahl', 'wahl', 'mehrfach', 'ja_nein'].indexOf(f.typ) !== -1), 'Namen und Arten sind so, wie der Server sie verlangt');
p(schema.filter(f => f.typ === 'wahl' || f.typ === 'mehrfach').every(f => Array.isArray(f.werte) && f.werte.length > 0 && f.werte.length <= 80), 'jedes Auswahlfeld hat Werte, höchstens 80');
p(schema.every(f => f.frage && f.frage.length <= 120 && (f.hinweis || '').length <= 240), 'Fragen und Hinweise halten die Grenzen');
const zb = schema.find(f => f.name === 'zylinderBauform');
p(zb && zb.werte.indexOf('Spezialzylinder XY') !== -1 && zb.werte.indexOf('Halbzylinder') !== -1, 'eigene Listeneinträge gehören zu den erlaubten Werten');
p(namen.indexOf('tuerTechnologie') === -1 && Diktat.felder({ anlagenart: 'hybrid' }, eins).some(f => f.name === 'tuerTechnologie'), 'die Technologie je Tür wird nur bei einer Hybridanlage gefragt');
p(schema.find(f => f.name === 'zylinderAusfuehrung').hinweis.indexOf('BSZ') !== -1, 'der Hinweis nennt Synonyme (Not- und Gefahrenfunktion = BSZ)');
const woerter = Diktat.woerter(eins);
p(woerter.indexOf('Keyota Pro') !== -1 && woerter.indexOf('Spezialzylinder XY') !== -1, 'eigene Begriffe gehen als Fachwörter mit', JSON.stringify(woerter));
const Model = require('../src/js/model.js');
const leer = Model.neueTuer({});
p(namen.every(n => Object.prototype.hasOwnProperty.call(leer, n) || n === 'tuerTechnologie'), 'jedes Feld des Schemas gibt es an der Tür', namen.filter(n => !Object.prototype.hasOwnProperty.call(leer, n)).join(', '));

console.log('\n== Vorschlag anwenden ==');
let t = Model.neueTuer({});
t.notiz = 'Alte Bemerkung';
t.zylinderAusfuehrung = ['VdS'];
let geaendert = Diktat.anwenden(t, {
  bezeichnung: 'Büro Empfang', zylinderBauform: 'Halbzylinder', masseAussen: 35, masseInnen: 27.5, dinRichtung: 'DIN links',
  zylinderAusfuehrung: ['BSZ (beidseitig schließbar)', 'Unsinn'], zylinderSkgStufe: 'SKG **', brauchtWandleser: true,
  anzahl: 2.6, notiz: 'Kabel liegt schon', nacharbeitText: 'Maß fehlt', schlossBauform: 'Einsteckschloss',
  beschlagBauform: 'Rosettengarnitur', erfunden: 'x', kategorie: 'Gibt es nicht'
}, schema);
p(t.bezeichnung === 'Büro Empfang' && t.zylinderBauform === 'Halbzylinder', 'Text und Auswahl werden gesetzt');
p(t.masseAussen === '35' && t.masseInnen === '27,5', 'Maße werden wie im Formular als Text mit Komma geführt', t.masseAussen + ' / ' + t.masseInnen);
p(t.zylinderAusfuehrung.join('|') === 'VdS|BSZ (beidseitig schließbar)|SKG', 'Mehrfachfelder werden ergänzt, Unerlaubtes fällt weg, die SKG-Stufe setzt den Chip', t.zylinderAusfuehrung.join('|'));
p(t.zylinderSkgStufe === 'SKG **' && t.brauchtWandleser === true, 'Stufe und Ja/Nein kommen an');
p(t.anzahl === 3, 'eine Stückzahl wird ganzzahlig', String(t.anzahl));
p(t.notiz === 'Alte Bemerkung\nKabel liegt schon', 'die Bemerkung wird ergänzt, nicht ersetzt', t.notiz);
p(t.nacharbeit === true && t.nacharbeitText === 'Maß fehlt', 'ein Nacharbeitstext schaltet die Nacharbeit ein');
p(t.brauchtZylinder === true && t.brauchtSchloss === true && t.brauchtBeschlag === true, 'genannte Bauteile gelten als gebraucht');
p(!('erfunden' in t) && t.kategorie === '', 'Unbekanntes und unerlaubte Werte werden nicht geschrieben');
p(geaendert.indexOf('bezeichnung') !== -1 && geaendert.indexOf('erfunden') === -1 && geaendert.indexOf('kategorie') === -1, 'die Rückgabe nennt nur, was geändert wurde', geaendert.join(','));
geaendert = Diktat.anwenden(t, { bezeichnung: 'Büro Empfang', masseAussen: 35 }, schema);
p(geaendert.length === 0, 'dieselben Werte noch einmal ändern nichts');
geaendert = Diktat.anwenden(t, { bezeichnung: 'Lager', dornmass: 55 }, schema, ['dornmass']);
p(t.bezeichnung === 'Büro Empfang' && t.dornmass === '55' && geaendert.join() === 'dornmass', 'mit Auswahl werden nur die gewählten Felder geschrieben');
const zeilen = Diktat.zeilen(t, { bezeichnung: 'Büro Empfang', tuerbreite: 885, brauchtSchloss: false, schlossNorm: 'EN 179' }, schema);
p(zeilen.length === 4 && zeilen[0].name === 'bezeichnung' && zeilen[0].gleich === true, 'die Vorschlagszeilen erkennen Unverändertes', JSON.stringify(zeilen));
p(zeilen.find(z => z.name === 'tuerbreite').neu === '885' && zeilen.find(z => z.name === 'brauchtSchloss').neu === 'nein' && zeilen.find(z => z.name === 'brauchtSchloss').alt === 'ja', 'und zeigen Alt und Neu lesbar', JSON.stringify(zeilen));
p(zeilen.map(z => z.name).join() === 'bezeichnung,brauchtSchloss,schlossNorm,tuerbreite', 'in der Reihenfolge des Formulars');

/* ------------------------------------------------------------------ */
const HAFEN = 8900 + (process.pid % 250);
const HAFEN_OAI = HAFEN + 1;
const BASIS = 'http://127.0.0.1:' + HAFEN;
const ARBEIT = fs.mkdtempSync(path.join(os.tmpdir(), 'aufmass-dk-'));
const ARGS = ['--no-sandbox', '--disable-component-update', '--disable-background-networking', '--no-first-run', '--disable-sync',
  '--disable-default-apps', '--metrics-recording-only', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const SCHLUESSEL = 'sk-proj-PruefSchluessel0123456789abcdefghijkl';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const CLIENT = '777-dk.apps.googleusercontent.com', DOMAENE = 'provision-infra.de';
function b64(r) { return Buffer.from(r).toString('base64url'); }
function ausweis(sub, name) {
  const kopf = b64(JSON.stringify({ alg: 'RS256', kid: 'dk-1', typ: 'JWT' }));
  const inhalt = b64(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub, email: sub + '@' + DOMAENE, email_verified: true,
    hd: DOMAENE, name, iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600, nonce: Math.random().toString(36).slice(2) }));
  return kopf + '.' + inhalt + '.' + crypto.sign('RSA-SHA256', Buffer.from(kopf + '.' + inhalt), privateKey).toString('base64url');
}
const OPT = path.join(ARBEIT, 'opt.json'), LOG = path.join(ARBEIT, 'openai.log');
fs.writeFileSync(OPT, JSON.stringify({
  aufmass_client_id: CLIENT, aufmass_domaene: DOMAENE, aufmass_geheimnis: crypto.randomBytes(32).toString('hex'),
  aufmass_openai_host: 'http://127.0.0.1:' + HAFEN_OAI,
  aufmass_google_schluessel_sicherung: { keys: [{ kty: 'RSA', kid: 'dk-1', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] }
}));
execFileSync('php', ['-r', 'require ' + JSON.stringify(path.join(W, 'server/tests/wp-attrappe.php')) + ';'
  + 'if (!Aufmass_Diktat::schluessel_setzen(' + JSON.stringify(SCHLUESSEL) + ')) { fwrite(STDERR, "schluessel_setzen fehlgeschlagen"); exit(1); }'],
  { env: Object.assign({}, process.env, { AUFMASS_TEST_OPT: OPT }) });
const gespeichert = JSON.parse(fs.readFileSync(OPT, 'utf8'));

(async () => {
  const umgebung = Object.assign({}, process.env, {
    AUFMASS_TEST_DB: path.join(ARBEIT, 'd.sqlite'), AUFMASS_TEST_OPT: OPT, AUFMASS_TEST_UPLOADS: path.join(ARBEIT, 'up'),
    AUFMASS_TEST_OAI_KEY: SCHLUESSEL, AUFMASS_TEST_OAI_LOG: LOG
  });
  const server = spawn('php', ['-S', '127.0.0.1:' + HAFEN, path.join(W, 'server/tests/mini-server.php')], { env: umgebung, stdio: ['ignore', 'ignore', 'pipe'] });
  const attrappe = spawn('php', ['-S', '127.0.0.1:' + HAFEN_OAI, path.join(W, 'server/tests/fake-openai.php')], { env: umgebung, stdio: ['ignore', 'ignore', 'pipe'] });
  let serverFehler = '';
  [server, attrappe].forEach(s => s.stderr.on('data', d => { const x = String(d); if (/Fatal|Parse error|Warning|Notice/.test(x)) serverFehler += x; }));
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASIS + '/wp-json/aufmass/v1/start')).ok && (await fetch('http://127.0.0.1:' + HAFEN_OAI + '/v1/models')).status === 401) break; } catch (e) {}
    await new Promise(r => setTimeout(r, 150));
  }
  const browser = await starte({ args: ARGS });
  try {
    console.log('\n== Der Schlüssel liegt auf dem Server ==');
    p(gespeichert.aufmass_openai_schluessel && gespeichert.aufmass_openai_schluessel !== SCHLUESSEL && JSON.stringify(gespeichert).indexOf(SCHLUESSEL) === -1,
      'der Schlüssel steht verschlüsselt in den Einstellungen, nirgends im Klartext');
    const start = await (await fetch(BASIS + '/wp-json/aufmass/v1/start')).json();
    p(start.diktat === undefined, 'ohne Anmeldung verrät der Start nicht, ob das Einsprechen eingerichtet ist', JSON.stringify(start));
    const ohne = await fetch(BASIS + '/wp-json/aufmass/v1/diktat', { method: 'POST', headers: { 'X-Aufmass-Abgleich': '1' }, body: new FormData() });
    p(ohne.status === 401, 'ohne Anmeldung ist das Einsprechen zu', String(ohne.status));

    const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
    await ctx.grantPermissions(['microphone'], { origin: BASIS });
    const seite = await ctx.newPage();
    const konsole = [], anfragen = [];
    seite.on('pageerror', e => { if (!istUmgebungsGeraeusch(e.message, e.stack)) konsole.push('PAGEERROR: ' + e.message); });
    seite.on('console', m => { if (m.type() !== 'error') return; const wo = m.location() ? m.location().url : ''; if (!istUmgebungsGeraeusch(m.text(), wo)) konsole.push(m.text()); });
    seite.on('request', r => anfragen.push({ url: r.url(), kopf: r.headers() }));

    await seite.goto(BASIS + '/index.html', { waitUntil: 'load' });
    await seite.waitForSelector('header.kopf', { timeout: 10000 });
    await seite.evaluate(x => window.Abgleich.anmelden(x), ausweis('u-dk', 'D. Diktat'));
    await seite.waitForTimeout(900);
    p(await seite.evaluate(() => window.Abgleich.zustand().diktat === true), 'angemeldet weiß das Werkzeug: das Einsprechen ist eingerichtet');
    p(await seite.evaluate(() => window.Diktat.verfuegbar() === true), 'und es ist auf diesem Gerät verfügbar');
    const kekse = (await ctx.cookies()).map(c => c.name + '=' + c.value).join('; ');
    const schlecht = await fetch(BASIS + '/wp-json/aufmass/v1/diktat', { method: 'POST', headers: { 'X-Aufmass-Abgleich': '1', Cookie: kekse }, body: new FormData() });
    const schlechtJson = await schlecht.json();
    p(schlecht.status === 400 && schlechtJson.code === 'schema', 'angemeldet, aber ohne Feldschema: 400', schlecht.status + ' ' + JSON.stringify(schlechtJson).slice(0, 100));

    console.log('\n== Einstellungen ==');
    await seite.evaluate(() => { window.AppKern.Zustand.ansicht = 'einstellungen'; window.App.zeichnen(); });
    await seite.waitForTimeout(400);
    const einstText = await seite.textContent('main.inhalt');
    p(/Tür einsprechen/.test(einstText) && /Über den Server eingerichtet/.test(einstText), 'die Einstellungen nennen das Einsprechen als eingerichtet');

    console.log('\n== Eine Tür einsprechen ==');
    const projekt = baueTestprojekt();
    await seite.evaluate(async ([pr, e]) => {
      await window.Store.projektSpeichern(pr);
      await window.Store.einstellungenSpeichern(Object.assign({}, e, { letztesProjekt: pr.id }));
    }, [projekt, einstellungen]);
    await seite.reload({ waitUntil: 'load' });
    await ersteProjektOeffnen(seite, 10000);
    await seite.evaluate(() => window.App.wechseln('tueren'));
    await seite.waitForSelector('button:has-text("+ Neue Tür")', { timeout: 10000 });
    const tuerenVorher = await seite.evaluate(() => window.AppKern.Zustand.projekt.tueren.length);
    await seite.click('button:has-text("+ Neue Tür")');
    await seite.waitForSelector('.dialog .modus-leiste', { timeout: 10000 });
    p(await seite.$('.dialog .modus-leiste .diktat-start') !== null, 'das Türformular hat den Knopf „Einsprechen“');
    await seite.click('.dialog .modus-leiste .umschalter button:has-text("Alle Felder")');
    await seite.waitForTimeout(200);
    await seite.click('.dialog .modus-leiste .diktat-start');
    await seite.waitForSelector('.dialog .diktat', { timeout: 5000 });
    p((await seite.textContent('.dialog .diktat')).indexOf('Aufnahme starten') !== -1, 'der Dialog „Tür einsprechen“ öffnet sich');
    await seite.click('.dialog .diktat .diktat-aufnahme');
    await seite.waitForSelector('.dialog .diktat .diktat-laeuft', { timeout: 8000 });
    p(true, 'die Aufnahme läuft (Prüfmikrofon von Chromium)');
    await seite.waitForTimeout(1800);
    const dauer = await seite.textContent('.dialog .diktat .dauer');
    p(/0:0[1-9]/.test(dauer), 'die Dauer zählt mit', dauer);
    await seite.click('.dialog .fuss button:has-text("Aufnahme beenden")');
    await seite.waitForSelector('.dialog .diktat table.diktat-tabelle', { timeout: 20000 });
    p(true, 'der Vorschlag erscheint');
    const verstanden = await seite.textContent('.dialog .diktat blockquote');
    p(/Halbzylinder 35 10/.test(verstanden), 'der verstandene Text wird gezeigt', verstanden);
    const reihen = await seite.$$eval('.dialog table.diktat-tabelle tbody tr', rs => rs.map(r => ({
      feld: r.getAttribute('data-feld'), neu: r.querySelector('td.neu').textContent, alt: r.querySelector('td.alt').textContent,
      an: r.querySelector('input').checked, gleich: r.classList.contains('gleich') })));
    const reihe = n => reihen.find(r => r.feld === n) || {};
    p(reihe('zylinderBauform').neu === 'Halbzylinder' && reihe('masseAussen').neu === '35' && reihe('masseInnen').neu === '10', 'Zylinder und Längen stehen im Vorschlag', JSON.stringify(reihen));
    p(reihe('dinRichtung').neu === 'DIN links' && reihe('beschlagBestueckung').neu === 'Drücker / Drücker' && reihe('dornmass').neu === '55', 'DIN, Bestückung und Dornmaß auch');
    p(reihe('brauchtWandleser').neu === 'ja' && reihe('brauchtWandleser').alt === 'nein' && reihe('brauchtWandleser').an === true, 'der Wandleser wird als Änderung vorgeschlagen und ist angehakt');
    p(reihe('bezeichnung').neu === 'Büro Empfang' && reihe('nummer').neu === '7', 'Bezeichnung und Nummer sind erkannt');
    const offenText = await seite.textContent('.dialog .diktat-offen');
    p(/Kabel liegt schon/.test(offenText), 'nicht Zugeordnetes wird gelistet - für die Bemerkung', offenText.trim().slice(0, 80));
    /* Zwei Dialoge liegen übereinander (Türformular und Diktat) - gezählt wird im oberen. */
    const knopfTexte = await seite.$$eval('.dialog .fuss button.haupt', bs => bs.map(b => b.textContent));
    p(knopfTexte.some(x => /Übernehmen \(\d+\)/.test(x)), 'der Knopf zählt, was übernommen wird', knopfTexte.join(' | '));

    /* Text berichtigen und neu zuordnen */
    await seite.click('.dialog .diktat-text button:has-text("Text ändern")');
    await seite.fill('.dialog .diktat-text textarea', 'Büro Empfang, Doppelzylinder 40 45, DIN rechts.');
    await seite.click('.dialog .diktat-text button:has-text("Neu zuordnen")');
    await seite.waitForSelector('.dialog .diktat table.diktat-tabelle', { timeout: 20000 });
    p(/Doppelzylinder 40 45/.test(await seite.textContent('.dialog .diktat blockquote')), 'ein berichtigter Text wird neu zugeordnet');

    /* Eine Zeile abwählen, dann übernehmen */
    await seite.click('.dialog table.diktat-tabelle tr[data-feld="nummer"] input');
    await seite.click('.dialog .fuss button.haupt:has-text("Übernehmen")');
    await seite.waitForSelector('.dialog .diktat', { state: 'detached', timeout: 5000 });
    await seite.waitForTimeout(300);
    const formular = await seite.evaluate(() => {
      const d = document.querySelector('.dialog');
      const w = n => { const k = d.querySelector('[data-feld="' + n + '"]'); if (!k) return null; const e = k.querySelector('select, textarea, input'); return e ? (e.type === 'checkbox' ? e.checked : e.value) : null; };
      return { bezeichnung: w('bezeichnung'), nummer: w('nummer'), zylinderBauform: w('zylinderBauform'), masseAussen: w('masseAussen'),
        dinRichtung: w('dinRichtung'), beschlagBestueckung: w('beschlagBestueckung'), dornmass: w('dornmass'), wandleser: w('brauchtWandleser'),
        beschlag: w('brauchtBeschlag'), notiz: w('notiz') };
    });
    p(formular.bezeichnung === 'Büro Empfang' && formular.zylinderBauform === 'Halbzylinder' && formular.masseAussen === '35', 'die Felder im Formular sind gefüllt', JSON.stringify(formular));
    p(formular.dinRichtung === 'DIN links' && formular.beschlagBestueckung === 'Drücker / Drücker' && formular.dornmass === '55', 'auch Beschlag und Maße');
    p(formular.wandleser === true && formular.beschlag === true, 'Wandleser und Beschlag sind eingeschaltet');
    p(/Kabel liegt schon/.test(formular.notiz || ''), 'das nicht Zugeordnete steht in der Bemerkung', formular.notiz);
    p(formular.nummer !== '7', 'die abgewählte Nummer wurde nicht übernommen', formular.nummer);
    await seite.click('.dialog .fuss button:has-text("Tür speichern")');
    await seite.waitForTimeout(500);
    const gespeicherteTuer = await seite.evaluate(() => { const ts = window.AppKern.Zustand.projekt.tueren; return ts[ts.length - 1]; });
    p(await seite.evaluate(() => window.AppKern.Zustand.projekt.tueren.length) === tuerenVorher + 1 && gespeicherteTuer.bezeichnung === 'Büro Empfang'
      && gespeicherteTuer.zylinderBauform === 'Halbzylinder' && gespeicherteTuer.brauchtWandleser === true, 'die Tür ist mit den Angaben gespeichert');

    console.log('\n== Was bei OpenAI ankam - und was nicht ==');
    const protokoll = (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').map(z => JSON.parse(z)) : []).filter(z => z.ua !== 'node' && !z.fehler);
    const erkennungen = protokoll.filter(z => z.weg === '/v1/audio/transcriptions');
    const zuordnungen = protokoll.filter(z => z.weg === '/v1/chat/completions');
    p(erkennungen.length === 1 && zuordnungen.length === 2, 'eine Erkennung und zwei Zuordnungen (die zweite nach der Berichtigung)', erkennungen.length + ' / ' + zuordnungen.length);
    const e1 = erkennungen[0] || {};
    p(e1.datei && /^aufnahme\.(webm|mp4|ogg)$/.test(e1.datei.name) && e1.datei.groesse > 1000, 'die Aufnahme kam als Datei mit passendem Format an', JSON.stringify(e1.datei));
    p(e1.modell === 'gpt-4o-transcribe' && e1.sprache === 'de' && /Dornmaß/.test(e1.prompt || ''), 'mit Modell, Sprache Deutsch und Fachwörtern', JSON.stringify([e1.modell, e1.sprache]));
    const z1 = zuordnungen[0] || {}, z2 = zuordnungen[1] || {};
    p(z1.modell === 'gpt-4.1-mini' && z1.strict === true && z1.felder >= 50 && z1.pflicht === z1.felder, 'die Zuordnung mit striktem Schema aller Felder', JSON.stringify(z1));
    p(/Halbzylinder 35 10/.test(z1.text || '') && /Doppelzylinder 40 45/.test(z2.text || ''), 'erst der erkannte, dann der berichtigte Text');
    p(protokoll.every(z => /^Aufmass-Werkzeug\//.test(z.ua)), 'alle Anfragen kamen vom Server, mit seiner Kennung');
    p(anfragen.every(a => a.url.indexOf(':' + HAFEN_OAI) === -1), 'der Browser spricht OpenAI nie direkt an');
    p(anfragen.every(a => a.url.indexOf(SCHLUESSEL) === -1 && JSON.stringify(a.kopf).indexOf(SCHLUESSEL) === -1), 'keine Browser-Anfrage enthält den Schlüssel');
    const diktatAnfragen = anfragen.filter(a => a.url.indexOf('/wp-json/aufmass/v1/diktat') !== -1);
    p(diktatAnfragen.length === 2 && diktatAnfragen.every(a => /multipart\/form-data/.test(a.kopf['content-type'] || '') && a.kopf['x-aufmass-abgleich'] === '1'),
      'das Werkzeug schickt Aufnahme und Text als Formular mit dem eigenen Kopffeld an den Server', JSON.stringify(diktatAnfragen.map(a => a.kopf['content-type'])));

    console.log('\n== Wenn der Server das Einsprechen nicht anbietet ==');
    const ohneSchluessel = await browser.newContext({ viewport: { width: 1180, height: 900 } });
    const seite2 = await ohneSchluessel.newPage();
    seite2.on('pageerror', e => { if (!istUmgebungsGeraeusch(e.message, e.stack)) konsole.push('PAGEERROR2: ' + e.message); });
    await seite2.route('**/wp-json/aufmass/v1/projekte*', async route => {
      const antwort = await route.fetch();
      const json = await antwort.json(); json.diktat = false;
      await route.fulfill({ response: antwort, json });
    });
    await seite2.route('**/wp-json/aufmass/v1/start', async route => {
      const antwort = await route.fetch();
      const json = await antwort.json(); if (json.diktat !== undefined) json.diktat = false;
      await route.fulfill({ response: antwort, json });
    });
    await seite2.goto(BASIS + '/index.html', { waitUntil: 'load' });
    await seite2.waitForSelector('header.kopf', { timeout: 10000 });
    await seite2.evaluate(x => window.Abgleich.anmelden(x), ausweis('u-dk2', 'E. Einsprech'));
    await seite2.waitForTimeout(900);
    p(await seite2.evaluate(() => window.Abgleich.zustand().diktat === false && window.Diktat.verfuegbar() === false), 'ohne Angebot des Servers ist das Einsprechen nicht verfügbar');
    await seite2.evaluate(async ([pr, e]) => {
      await window.Store.projektSpeichern(pr);
      await window.Store.einstellungenSpeichern(Object.assign({}, e, { letztesProjekt: pr.id }));
    }, [baueTestprojekt(), einstellungen]);
    await seite2.reload({ waitUntil: 'load' });
    await seite2.waitForTimeout(600);
    await ersteProjektOeffnen(seite2, 10000);
    await seite2.evaluate(() => window.App.wechseln('tueren'));
    await seite2.waitForSelector('button:has-text("+ Neue Tür")', { timeout: 10000 });
    await seite2.click('button:has-text("+ Neue Tür")');
    await seite2.waitForSelector('.dialog .modus-leiste', { timeout: 10000 });
    p(await seite2.$('.dialog .modus-leiste .diktat-start') === null, 'dann hat das Türformular den Knopf nicht - alles bleibt wie gewohnt');
    await ohneSchluessel.close();

    p(konsole.length === 0, 'keine JavaScript-Fehler', konsole.join(' | '));
    p(serverFehler === '', 'keine Fehler auf den Servern', serverFehler.slice(0, 300));
  } catch (e) {
    p(false, 'Durchlauf ohne Ausnahme', (e.stack || String(e)).split('\n').slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.kill(); attrappe.kill();
    try { fs.rmSync(ARBEIT, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nErgebnis Diktat: ' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})();
