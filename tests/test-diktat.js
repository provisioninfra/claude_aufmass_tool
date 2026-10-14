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
    AUFMASS_TEST_OAI_KEY: SCHLUESSEL, AUFMASS_TEST_OAI_LOG: LOG, AUFMASS_TEST_OAI_MODUS: path.join(ARBEIT, 'modus.txt')
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
    await seite.fill('.dialog .diktat-text textarea', 'Tür Nummer 9, Büro Empfang, Doppelzylinder 40 45, DIN rechts, Kabel liegt schon.');
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
    p(formular.bezeichnung === 'Büro Empfang' && formular.zylinderBauform === 'Doppelzylinder' && formular.masseAussen === '40', 'die Felder im Formular sind aus dem berichtigten Text gefüllt', JSON.stringify(formular));
    p(!formular.beschlagBestueckung && !formular.dornmass, 'nur was im berichtigten Text stand - kein Beschlag, kein Dornmaß', JSON.stringify(formular));
    p(await seite.evaluate(() => { const d = document.querySelector('.dialog'); return !!d; }) && formular.dinRichtung === null, 'die DIN-Richtung ist gespeichert, aber ohne Beschlag oder Schloss nicht im Formular zu sehen - so ist das Formular gebaut');
    p(formular.wandleser === false && formular.beschlag === false, 'Wandleser und Beschlag bleiben aus');
    p(/Kabel liegt schon/.test(formular.notiz || ''), 'das nicht Zugeordnete steht in der Bemerkung', formular.notiz);
    p(formular.nummer !== '9', 'die abgewählte Nummer wurde nicht übernommen', formular.nummer);
    await seite.click('.dialog .fuss button:has-text("Tür speichern")');
    await seite.waitForTimeout(500);
    const gespeicherteTuer = await seite.evaluate(() => { const ts = window.AppKern.Zustand.projekt.tueren; return ts[ts.length - 1]; });
    p(await seite.evaluate(() => window.AppKern.Zustand.projekt.tueren.length) === tuerenVorher + 1 && gespeicherteTuer.bezeichnung === 'Büro Empfang'
      && gespeicherteTuer.zylinderBauform === 'Doppelzylinder' && gespeicherteTuer.brauchtWandleser === false && gespeicherteTuer.dinRichtung === 'DIN rechts', 'die Tür ist mit den Angaben gespeichert - samt DIN-Richtung');

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

    console.log('\n== Serie: „neue Tür“ legt mehrere Türen im Bereich an ==');
    const MODUS = path.join(ARBEIT, 'modus.txt');
    fs.writeFileSync(MODUS, 'serie');
    const seite4 = await ctx.newPage();
    seite4.on('pageerror', e => { if (!istUmgebungsGeraeusch(e.message, e.stack)) konsole.push('PAGEERROR4: ' + e.message); });
    seite4.on('console', m => { if (m.type() !== 'error') return; const wo = m.location() ? m.location().url : ''; if (/Failed to load resource/.test(m.text())) return; if (!istUmgebungsGeraeusch(m.text(), wo)) konsole.push(m.text()); });
    await seite4.goto(BASIS + '/index.html', { waitUntil: 'load' });
    await seite4.waitForSelector('header.kopf', { timeout: 10000 });
    await ersteProjektOeffnen(seite4, 10000);
    const bereich = await seite4.evaluate(() => {
      const pr = window.AppKern.Zustand.projekt;
      const blatt = pr.standorte.find(k => !pr.standorte.some(x => x.parentId === k.id));
      window.AppKern.Zustand.tuerFilter = { suche: '', struktur: blatt.id, status: '', system: '', unvollstaendig: false };
      window.App.wechseln('tueren');
      return { id: blatt.id, name: blatt.name, vorher: pr.tueren.length };
    });
    await seite4.waitForSelector('button:has-text("+ Neue Tür")', { timeout: 10000 });
    await seite4.click('button:has-text("+ Neue Tür")');
    await seite4.waitForSelector('.dialog .modus-leiste .diktat-start', { timeout: 10000 });
    await seite4.click('.dialog .modus-leiste .diktat-start');
    await seite4.waitForSelector('.dialog .diktat .diktat-aufnahme', { timeout: 5000 });
    p(/neue Tür/.test(await seite4.textContent('.dialog .diktat')), 'der Dialog erklärt den Befehl „neue Tür“');
    await seite4.click('.dialog .diktat .diktat-aufnahme');
    await seite4.waitForSelector('.dialog .diktat .diktat-laeuft', { timeout: 8000 });
    await seite4.waitForTimeout(1500);
    await seite4.click('.dialog .fuss button:has-text("Aufnahme beenden")');
    await seite4.waitForSelector('.dialog:has-text("Türen eingesprochen")', { timeout: 25000 });
    p(true, 'nach der Aufnahme erscheint die Zusammenfassung - kein Vorschlag, keine Rückfrage');
    const zusammen = await seite4.textContent('.dialog:has-text("Türen eingesprochen")');
    p(/3 Türen wurden/.test(zusammen) && zusammen.indexOf(bereich.name) !== -1, 'drei Türen im Bereich, in dem ich war', zusammen.slice(0, 160));
    const tueren = await seite4.evaluate(() => window.AppKern.Zustand.projekt.tueren.slice(-3).map(x => ({ bez: x.bezeichnung, nr: x.nummer, struktur: x.strukturId,
      zyl: x.zylinderBauform, aussen: x.masseAussen, din: x.dinRichtung, wl: x.brauchtWandleser, notiz: x.notiz, beschlag: x.brauchtBeschlag })));
    p(tueren.map(x => x.bez).join('|') === 'Büro Empfang|Lager hinten|Technikraum', 'die drei Türen tragen ihre Bezeichnungen in der gesprochenen Reihenfolge', JSON.stringify(tueren));
    p(tueren.every(x => x.struktur === bereich.id), 'alle drei liegen in diesem Bereich');
    p(tueren[0].zyl === 'Halbzylinder' && tueren[0].aussen === '35' && tueren[0].din === 'DIN links', 'die erste Tür hat ihre Angaben');
    p(tueren[1].zyl === 'Doppelzylinder' && tueren[1].aussen === '40' && tueren[1].din === 'DIN rechts' && tueren[1].beschlag === true, 'die zweite ihre');
    p(tueren[2].zyl === 'Halbzylinder' && tueren[2].wl === true && /Kabel liegt schon/.test(tueren[2].notiz || ''), 'die dritte ihre - Offenes steht in der Bemerkung');
    const nummern = tueren.map(x => x.nr);
    p(new Set(nummern).size === 3 && nummern.every(n => n), 'jede Tür hat eine eigene laufende Nummer', nummern.join(','));
    p(await seite4.evaluate(() => window.AppKern.Zustand.projekt.tueren.length) === bereich.vorher + 3, 'genau drei Türen sind dazugekommen');
    p((await seite4.$$('.dialog .diktat')).length === 0 && (await seite4.$$('.dialog .modus-leiste')).length === 0, 'Türformular und Diktat sind geschlossen');
    p((await seite4.$$('.dialog:has-text("Türen eingesprochen") .tuer-zeile')).length === 3, 'die Zusammenfassung listet die drei Türen');
    await seite4.click('.dialog .fuss button:has-text("Weiter einsprechen")');
    await seite4.waitForSelector('.dialog .diktat .diktat-aufnahme', { timeout: 8000 });
    p(await seite4.evaluate(() => document.querySelectorAll('.dialog').length === 2), '„Weiter einsprechen“ öffnet eine neue Tür samt Diktat');
    await seite4.keyboard.press('Escape'); await seite4.waitForTimeout(250);
    p(/Neue Tür aufnehmen/.test(await seite4.textContent('.dialog > .kopf h2')), 'es ist eine neue Tür');
    const strukturNeu = await seite4.evaluate(() => { const s = document.querySelector('.dialog [data-feld="strukturId"] select'); return s ? s.value : null; });
    p(strukturNeu === bereich.id, 'im selben Bereich', String(strukturNeu));
    await seite4.keyboard.press('Escape'); await seite4.waitForTimeout(250);
    fs.writeFileSync(MODUS, 'nur-befehl');
    await seite4.click('button:has-text("+ Neue Tür")');
    await seite4.waitForSelector('.dialog .modus-leiste .diktat-start', { timeout: 10000 });
    await seite4.click('.dialog .modus-leiste .diktat-start');
    await seite4.waitForSelector('.dialog .diktat .diktat-aufnahme', { timeout: 5000 });
    await seite4.click('.dialog .diktat .diktat-aufnahme');
    await seite4.waitForSelector('.dialog .diktat .diktat-laeuft', { timeout: 8000 });
    await seite4.waitForTimeout(1200);
    await seite4.click('.dialog .fuss button:has-text("Aufnahme beenden")');
    await seite4.waitForSelector('.dialog .diktat .meldung.fehler', { timeout: 15000 });
    p(/Befehl/.test(await seite4.textContent('.dialog .diktat .meldung')), 'nur „neue Tür“ ohne Angaben wird als Fehler gemeldet', await seite4.textContent('.dialog .diktat .meldung'));
    fs.writeFileSync(MODUS, '');
    await seite4.close();

    console.log('\n== Fehlerpfade im Dialog ==');
    const seite3 = await ctx.newPage();
    seite3.on('pageerror', e => { if (!istUmgebungsGeraeusch(e.message, e.stack)) konsole.push('PAGEERROR3: ' + e.message); });
    /* Die absichtlich abgewiesene Anfrage (503) meldet der Browser als Netzfehler - das ist kein Fehler der Seite. */
    seite3.on('console', m => { if (m.type() !== 'error') return; const wo = m.location() ? m.location().url : ''; if (/Failed to load resource/.test(m.text())) return; if (!istUmgebungsGeraeusch(m.text(), wo)) konsole.push(m.text()); });
    /* Mikrofon und Recorder lassen sich für die Probe umstellen; jedes Anhalten einer Tonspur wird gezählt. */
    await seite3.addInitScript(() => {
      window.__pruef = { stops: 0, micFehler: null, leer: false };
      const echt = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = function (c) {
        if (window.__pruef.micFehler) { const e = new Error('verweigert'); e.name = window.__pruef.micFehler; return Promise.reject(e); }
        return echt(c).then(s => { s.getTracks().forEach(t => { const st = t.stop.bind(t); t.stop = () => { window.__pruef.stops++; st(); }; }); return s; });
      };
      const MR = window.MediaRecorder;
      window.MediaRecorder = function (strom, opt) {
        const r = new MR(strom, opt);
        if (window.__pruef.leer) {
          const add = r.addEventListener.bind(r);
          r.addEventListener = (n, f) => { if (n === 'dataavailable') return; add(n, f); };
        }
        return r;
      };
      window.MediaRecorder.isTypeSupported = MR.isTypeSupported.bind(MR);
    });
    await seite3.goto(BASIS + '/index.html', { waitUntil: 'load' });
    await seite3.waitForSelector('header.kopf', { timeout: 10000 });
    await ersteProjektOeffnen(seite3, 10000);
    await seite3.evaluate(() => window.App.wechseln('tueren'));
    await seite3.waitForSelector('button:has-text("+ Neue Tür")', { timeout: 10000 });
    await seite3.click('button:has-text("+ Neue Tür")');
    await seite3.waitForSelector('.dialog .modus-leiste .diktat-start', { timeout: 10000 });
    const diktatOeffnen = async () => { await seite3.click('.dialog .modus-leiste .diktat-start'); await seite3.waitForSelector('.dialog .diktat .diktat-aufnahme', { timeout: 5000 }); };
    const fussTexte = async () => seite3.$$eval('.dialog .diktat', d => [...d[0].closest('.dialog').querySelectorAll('.fuss button')].map(b => b.textContent.trim()));
    const meldung = async () => (await seite3.textContent('.dialog .diktat .meldung')) || '';
    const aufnehmen = async (ms) => {
      await seite3.click('.dialog .diktat .diktat-aufnahme');
      await seite3.waitForSelector('.dialog .diktat .diktat-laeuft', { timeout: 8000 });
      await seite3.waitForTimeout(ms);
      await seite3.click('.dialog .fuss button:has-text("Aufnahme beenden")');
    };
    /* 1. Mikrofon verweigert */
    await diktatOeffnen();
    await seite3.evaluate(() => { window.__pruef.micFehler = 'NotAllowedError'; });
    await seite3.click('.dialog .diktat .diktat-aufnahme');
    await seite3.waitForSelector('.dialog .diktat .meldung.fehler', { timeout: 5000 });
    p(/nicht freigegeben/.test(await meldung()), 'ein verweigertes Mikrofon wird verständlich gemeldet', await meldung());
    let knoepfe = await fussTexte();
    p(knoepfe.some(t => /Neu aufnehmen/.test(t)) && !knoepfe.some(t => /erneut senden/.test(t)), 'dann gibt es „Neu aufnehmen“, aber kein „erneut senden“', knoepfe.join(' | '));
    await seite3.click('.dialog .fuss button:has-text("Neu aufnehmen")');
    await seite3.waitForSelector('.dialog .diktat .diktat-aufnahme', { timeout: 5000 });
    p(true, '„Neu aufnehmen“ führt zurück zum Anfang');
    /* 2. Leere Aufnahme */
    await seite3.evaluate(() => { window.__pruef.micFehler = null; window.__pruef.leer = true; });
    await aufnehmen(1500);
    await seite3.waitForSelector('.dialog .diktat .meldung.fehler', { timeout: 8000 });
    p(/leer geblieben/.test(await meldung()), 'eine leere Aufnahme wird nicht gesendet, sondern gemeldet', await meldung());
    p(await seite3.evaluate(() => window.__pruef.stops) >= 1, 'das Mikrofon wurde danach freigegeben');
    await seite3.evaluate(() => { window.__pruef.leer = false; });
    /* 3. Der Server lehnt ab */
    await seite3.route('**/wp-json/aufmass/v1/diktat', route => route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ code: 'nicht_eingerichtet', message: 'Das Einsprechen ist auf dem Server nicht eingerichtet.' }) }));
    await seite3.click('.dialog .fuss button:has-text("Neu aufnehmen")');
    await seite3.waitForSelector('.dialog .diktat .diktat-aufnahme', { timeout: 5000 });
    await aufnehmen(1500);
    await seite3.waitForSelector('.dialog .diktat .meldung.fehler', { timeout: 10000 });
    p(/nicht eingerichtet/.test(await meldung()), 'die Meldung des Servers kommt wörtlich an', await meldung());
    knoepfe = await fussTexte();
    p(knoepfe.some(t => /erneut senden/.test(t)), 'die Aufnahme bleibt erhalten und lässt sich erneut senden', knoepfe.join(' | '));
    await seite3.unroute('**/wp-json/aufmass/v1/diktat');
    await seite3.click('.dialog .fuss button:has-text("Aufnahme erneut senden")');
    await seite3.waitForSelector('.dialog .diktat table.diktat-tabelle', { timeout: 20000 });
    p(true, '„erneut senden“ schickt dieselbe Aufnahme - diesmal mit Erfolg');
    /* 4. Escape schließt nur den Diktat-Dialog */
    await seite3.keyboard.press('Escape');
    await seite3.waitForSelector('.dialog .diktat', { state: 'detached', timeout: 5000 });
    p(await seite3.$('.dialog .modus-leiste') !== null, 'Escape schließt den Diktat-Dialog, das Türformular bleibt offen');
    /* 5. Abbrechen beim Warten */
    await seite3.route('**/wp-json/aufmass/v1/diktat', async route => { await new Promise(r => setTimeout(r, 4000)); await route.continue(); });
    await diktatOeffnen();
    await aufnehmen(1500);
    await seite3.waitForSelector('.dialog .diktat .diktat-wartet', { timeout: 5000 });
    knoepfe = await fussTexte();
    p(knoepfe.length === 1 && /Abbrechen/.test(knoepfe[0]), 'beim Warten gibt es genau einen Knopf: Abbrechen', knoepfe.join(' | '));
    await seite3.click('.dialog .fuss button:has-text("Abbrechen")');
    await seite3.waitForSelector('.dialog .diktat .meldung.fehler', { timeout: 5000 });
    p(/Abgebrochen/.test(await meldung()) && (await fussTexte()).some(t => /erneut senden/.test(t)), 'Abbrechen beendet das Warten und behält die Aufnahme', await meldung());
    await seite3.unroute('**/wp-json/aufmass/v1/diktat');
    /* 6. Verwerfen und Schließen während der Aufnahme geben das Mikrofon frei */
    await seite3.click('.dialog .fuss button:has-text("Neu aufnehmen")');
    await seite3.waitForSelector('.dialog .diktat .diktat-aufnahme', { timeout: 5000 });
    const stopsVorher = await seite3.evaluate(() => window.__pruef.stops);
    await seite3.click('.dialog .diktat .diktat-aufnahme');
    await seite3.waitForSelector('.dialog .diktat .diktat-laeuft', { timeout: 8000 });
    await seite3.click('.dialog .fuss button:has-text("Verwerfen")');
    await seite3.waitForSelector('.dialog .diktat .diktat-aufnahme', { timeout: 5000 });
    p(await seite3.evaluate(() => window.__pruef.stops) > stopsVorher, '„Verwerfen“ während der Aufnahme hält das Mikrofon an');
    const stopsVorher2 = await seite3.evaluate(() => window.__pruef.stops);
    await seite3.click('.dialog .diktat .diktat-aufnahme');
    await seite3.waitForSelector('.dialog .diktat .diktat-laeuft', { timeout: 8000 });
    await seite3.keyboard.press('Escape');
    await seite3.waitForSelector('.dialog .diktat', { state: 'detached', timeout: 5000 });
    p(await seite3.evaluate(() => window.__pruef.stops) > stopsVorher2, 'Schließen während der Aufnahme hält das Mikrofon an');
    /* 7. Ohne Netz */
    await ctx.setOffline(true);
    await diktatOeffnen();
    p(await seite3.$eval('.dialog .diktat .diktat-aufnahme', b => b.disabled) === true && /braucht das Gerät Netz/.test(await seite3.textContent('.dialog .diktat')),
      'ohne Netz ist der Aufnahmeknopf aus und der Grund steht dabei');
    await ctx.setOffline(false);
    await seite3.keyboard.press('Escape');
    await seite3.waitForTimeout(300);
    await seite3.close();

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
