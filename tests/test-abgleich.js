/* Zwei Geräte, ein Aufmaß, ein echter Server.
 *
 * Der Abgleich wird nicht gegen eine Nachbildung geprüft, sondern gegen
 * den PHP-Code, der später auch läuft (server/tests/mini-server.php lädt
 * dieselben Klassen wie das Plugin). */
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');

const W = path.join(__dirname, '..');
const HAFEN = 8188 + (process.pid % 300);
const BASIS = 'http://127.0.0.1:' + HAFEN;
const ARBEIT = fs.mkdtempSync(path.join(os.tmpdir(), 'aufmass-abgleich-'));

let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; } else { fehler++; console.log('  FEHL  ' + t + (i ? '\n          -> ' + i : '')); } }

/* --- Google-Schlüssel und Ausweise ------------------------------------- */
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const CLIENT = '111222-pruef.apps.googleusercontent.com';
const DOMAENE = 'provision-infra.de';

function b64(roh) { return Buffer.from(roh).toString('base64url'); }
function ausweis(sub, name) {
  const kopf = b64(JSON.stringify({ alg: 'RS256', kid: 'test-1', typ: 'JWT' }));
  const inhalt = b64(JSON.stringify({
    iss: 'https://accounts.google.com', aud: CLIENT, sub: sub,
    email: sub + '@' + DOMAENE, email_verified: true, hd: DOMAENE, name: name,
    iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600
  }));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(kopf + '.' + inhalt), privateKey);
  return kopf + '.' + inhalt + '.' + sig.toString('base64url');
}

/* Optionen vorbelegen: Client-ID, Domäne und Googles Schlüssel.
   Der Server kommt im Test nicht ins Internet und greift auf diese
   hinterlegte Sicherung zurück - genau wie bei einer Netzstörung. */
const OPT = path.join(ARBEIT, 'optionen.json');
fs.writeFileSync(OPT, JSON.stringify({
  aufmass_client_id: CLIENT,
  aufmass_domaene: DOMAENE,
  aufmass_google_schluessel_sicherung: { keys: [{ kty: 'RSA', kid: 'test-1', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] }
}));

/* --- Ein Gerät ---------------------------------------------------------- */
function geraetBauen(name) {
  const projekte = {}, saetze = {};
  const kekse = {};
  let netz = true;

  const Store = {
    projektLaden: id => Promise.resolve(projekte[id] ? JSON.parse(JSON.stringify(projekte[id])) : null),
    projektSpeichern: pr => { projekte[pr.id] = JSON.parse(JSON.stringify(pr)); return Promise.resolve(pr); },
    projektLoeschen: id => { delete projekte[id]; return Promise.resolve(true); },
    alleProjekte: () => Promise.resolve(Object.values(projekte).map(x => JSON.parse(JSON.stringify(x)))),
    abgleichLesen: id => Promise.resolve(saetze[id] ? JSON.parse(JSON.stringify(saetze[id])) : null),
    abgleichSchreiben: s => { saetze[s.id] = JSON.parse(JSON.stringify(s)); return Promise.resolve(s); },
    abgleichAlle: () => Promise.resolve(Object.values(saetze).map(x => JSON.parse(JSON.stringify(x)))),
    abgleichLoeschen: id => { delete saetze[id]; return Promise.resolve(true); }
  };

  async function meinFetch(url, optionen) {
    if (!netz) { throw new TypeError('fetch failed'); }
    optionen = optionen || {};
    const kopf = Object.assign({}, optionen.headers || {});
    const keks = Object.entries(kekse).map(([k, v]) => k + '=' + v).join('; ');
    if (keks) { kopf['Cookie'] = keks; }
    const antwort = await fetch(url, { method: optionen.method, headers: kopf, body: optionen.body });
    const gesetzt = antwort.headers.getSetCookie ? antwort.headers.getSetCookie() : [];
    gesetzt.forEach(z => {
      const erstes = z.split(';')[0];
      const i = erstes.indexOf('=');
      if (i > 0) {
        const n = erstes.slice(0, i), w = erstes.slice(i + 1);
        if (w === '' || /expires=Thu, 01 Jan 1970/i.test(z)) { delete kekse[n]; } else { kekse[n] = w; }
      }
    });
    return antwort;
  }

  class FileReaderErsatz {
    readAsDataURL(blob) {
      blob.arrayBuffer().then(ab => {
        this.result = 'data:' + (blob.type || 'image/jpeg') + ';base64,' + Buffer.from(ab).toString('base64');
        if (this.onload) { this.onload(); }
      }).catch(e => { if (this.onerror) { this.onerror(e); } });
    }
  }

  const sandkasten = {
    Store, console, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: meinFetch, FileReader: FileReaderErsatz, Blob, Uint8Array, Promise, JSON, Math, Date, Error,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    navigator: { get onLine() { return netz; } },
    document: { hidden: false },
    addEventListener: () => {},
    encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isFinite, String, Object, Array, Number, Boolean
  };
  sandkasten.globalThis = sandkasten;
  vm.createContext(sandkasten);
  vm.runInContext(fs.readFileSync(path.join(W, 'src/js/zusammenfuehren.js'), 'utf8'), sandkasten, { filename: 'zusammenfuehren.js' });
  vm.runInContext(fs.readFileSync(path.join(W, 'src/js/abgleich.js'), 'utf8'), sandkasten, { filename: 'abgleich.js' });

  return {
    name, Store, projekte, saetze,
    A: sandkasten.Abgleich,
    netzAus: () => { netz = false; },
    netzAn: () => { netz = true; }
  };
}

/* --- Testdaten ---------------------------------------------------------- */
function tuer(id, zusatz) {
  return Object.assign({ id, nummer: id.toUpperCase(), bezeichnung: 'Tür ' + id,
    masseAussen: '30', masseInnen: '35', fotos: [] }, zusatz || {});
}
function neuesProjekt() {
  return { id: 'prj-gemeinsam', kunde: 'Müller & Söhne GmbH', objekt: 'Königsallee 47',
    anlagenNr: 'SA-2026-0815', bemerkung: '',
    standorte: [{ id: 'st1', ebene: 'standort', name: 'Düsseldorf', parentId: null, sort: 0 }],
    tueren: [tuer('t1'), tuer('t2'), tuer('t3')],
    schliessungen: [{ id: 's1', kuerzel: 'GHS', bezeichnung: 'General', personen: [] }],
    matrix: { 't1|s1': 'ja' } };
}
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(300, 7), Buffer.from([0xFF, 0xD9])]);

(async () => {
  /* --- Server starten --- */
  const server = spawn('php', ['-S', '127.0.0.1:' + HAFEN, '-t', W, path.join(W, 'server/tests/mini-server.php')], {
    env: Object.assign({}, process.env, {
      AUFMASS_TEST_DB: path.join(ARBEIT, 'daten.sqlite'),
      AUFMASS_TEST_OPT: OPT,
      AUFMASS_TEST_UPLOADS: path.join(ARBEIT, 'uploads')
    }),
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let serverFehler = '';
  server.stderr.on('data', d => { const t = String(d); if (/Fatal|Parse error|Warning/.test(t)) { serverFehler += t; } });

  for (let i = 0; i < 60; i++) {
    try { const a = await fetch(BASIS + '/wp-json/aufmass/v1/start'); if (a.ok) { break; } } catch (e) {}
    await new Promise(r => setTimeout(r, 150));
  }

  try {
    console.log('\n== Anmeldung ==');
    const A = geraetBauen('iPad Weber');
    const B = geraetBauen('Büro Kraus');

    let z = await A.A.einrichten({ basisUrl: BASIS });
    p(z.eingerichtet === true, 'der Server meldet sich als eingerichtet', JSON.stringify(z));
    p(z.clientId === CLIENT, 'die Client-ID kommt beim Werkzeug an');
    p(z.angemeldet === false, 'ohne Anmeldung ist niemand angemeldet');

    await A.A.anmelden(ausweis('u-weber', 'M. Weber'));
    p(A.A.zustand().angemeldet === true, 'Gerät A ist angemeldet');
    p(A.A.zustand().benutzer.name === 'M. Weber', 'und kennt den Namen', JSON.stringify(A.A.zustand().benutzer));

    await B.A.einrichten({ basisUrl: BASIS });
    await B.A.anmelden(ausweis('u-kraus', 'J. Kraus'));
    p(B.A.zustand().angemeldet === true, 'Gerät B ist angemeldet');

    let abgelehnt = null;
    const C = geraetBauen('Fremd');
    await C.A.einrichten({ basisUrl: BASIS });
    try { await C.A.anmelden(ausweis('u-fremd', 'Fremd') .replace(/./, 'x')); }
    catch (e) { abgelehnt = e.message; }
    p(abgelehnt !== null, 'ein manipulierter Ausweis wird abgelehnt', String(abgelehnt));

    console.log('\n== Ein Aufmaß entsteht auf Gerät A ==');
    const pr = neuesProjekt();
    await A.Store.projektSpeichern(pr);
    await A.A.projektGeaendert(pr);
    p(A.A.zustand().offen === 1, 'A merkt sich: eines ist noch nicht gesendet', A.A.zustand().offen);
    await A.A.jetzt();
    p(A.A.zustand().offen === 0, 'nach dem Abgleich ist nichts mehr offen', A.A.zustand().offen);
    p(A.saetze['prj-gemeinsam'].version === 1, 'A kennt die Version vom Server', JSON.stringify(A.saetze['prj-gemeinsam'] && A.saetze['prj-gemeinsam'].version));

    console.log('\n== Gerät B holt es ab ==');
    await B.A.jetzt();
    const beiB = await B.Store.projektLaden('prj-gemeinsam');
    p(beiB !== null, 'B hat das Aufmaß bekommen');
    p(beiB && beiB.kunde === 'Müller & Söhne GmbH', 'mit den richtigen Stammdaten', beiB && beiB.kunde);
    p(beiB && beiB.tueren.length === 3, 'und allen drei Türen', beiB && beiB.tueren.length);
    p(beiB && beiB.matrix['t1|s1'] === 'ja', 'und dem Kreuzschließplan');

    console.log('\n== Zwei Leute, verschiedene Türen ==');
    /* B ist nicht zuständig - zuerst eintragen lassen */
    await A.A.zustaendigeSetzen('prj-gemeinsam', ['u-weber', 'u-kraus']);
    await A.A.jetzt(); await B.A.jetzt();

    let pa = await A.Store.projektLaden('prj-gemeinsam');
    pa.tueren[0].tuerblattstaerke = '68';
    await A.Store.projektSpeichern(pa); await A.A.projektGeaendert(pa);

    let pb = await B.Store.projektLaden('prj-gemeinsam');
    pb.tueren[2].dornmass = '65';
    await B.Store.projektSpeichern(pb); await B.A.projektGeaendert(pb);

    await A.A.jetzt();
    await B.A.jetzt();
    await A.A.jetzt();

    pa = await A.Store.projektLaden('prj-gemeinsam');
    pb = await B.Store.projektLaden('prj-gemeinsam');
    p(pa.tueren[0].tuerblattstaerke === '68' && pa.tueren[2].dornmass === '65',
      'A hat beide Änderungen', JSON.stringify([pa.tueren[0].tuerblattstaerke, pa.tueren[2].dornmass]));
    p(pb.tueren[0].tuerblattstaerke === '68' && pb.tueren[2].dornmass === '65',
      'B hat beide Änderungen', JSON.stringify([pb.tueren[0].tuerblattstaerke, pb.tueren[2].dornmass]));
    p(A.A.zustand().konflikte.length === 0 && B.A.zustand().konflikte.length === 0,
      'ohne Rückfrage - verschiedene Türen sind kein Streit');

    console.log('\n== Neue Türen auf beiden Geräten ==');
    pa = await A.Store.projektLaden('prj-gemeinsam');
    pa.tueren.push(tuer('t-a1', { bezeichnung: 'Von A' }));
    await A.Store.projektSpeichern(pa); await A.A.projektGeaendert(pa);
    pb = await B.Store.projektLaden('prj-gemeinsam');
    pb.tueren.push(tuer('t-b1', { bezeichnung: 'Von B' }));
    await B.Store.projektSpeichern(pb); await B.A.projektGeaendert(pb);

    await A.A.jetzt(); await B.A.jetzt(); await A.A.jetzt(); await B.A.jetzt();
    pa = await A.Store.projektLaden('prj-gemeinsam');
    pb = await B.Store.projektLaden('prj-gemeinsam');
    p(pa.tueren.length === 5, 'A sieht fünf Türen', pa.tueren.map(t => t.id).join());
    p(pb.tueren.length === 5, 'B sieht fünf Türen', pb.tueren.map(t => t.id).join());
    p(pa.tueren.map(t => t.id).sort().join() === pb.tueren.map(t => t.id).sort().join(),
      'beide Geräte haben dieselben Türen');

    console.log('\n== Echter Konflikt ==');
    pa = await A.Store.projektLaden('prj-gemeinsam');
    pa.tueren[1].tuerblattstaerke = '70';
    await A.Store.projektSpeichern(pa); await A.A.projektGeaendert(pa);
    pb = await B.Store.projektLaden('prj-gemeinsam');
    pb.tueren[1].tuerblattstaerke = '45';
    await B.Store.projektSpeichern(pb); await B.A.projektGeaendert(pb);

    await A.A.jetzt();
    await B.A.jetzt();
    p(B.A.zustand().konflikte.length === 1, 'B bekommt genau eine Rückfrage',
      JSON.stringify(B.A.zustand().konflikte.map(x => x.konflikte.length)));
    const streit = B.A.zustand().konflikte[0];
    p(streit.konflikte.length === 1, 'über genau eine Angabe', JSON.stringify(streit.konflikte));
    p(streit.konflikte[0].feldName === 'Türblattstärke', 'benannt im Klartext', streit.konflikte[0].feldName);
    p(streit.konflikte[0].meins === '45' && streit.konflikte[0].server === '70',
      'beide Werte liegen bei', JSON.stringify([streit.konflikte[0].meins, streit.konflikte[0].server]));
    p(streit.wer === 'M. Weber', 'B erfährt, wer die andere Fassung geschrieben hat', streit.wer);

    await B.A.konfliktAufloesen('prj-gemeinsam', { [streit.konflikte[0].id]: 'server' });
    p(B.A.zustand().konflikte.length === 0, 'nach der Entscheidung ist die Rückfrage weg');
    await A.A.jetzt(); await B.A.jetzt();
    pa = await A.Store.projektLaden('prj-gemeinsam');
    pb = await B.Store.projektLaden('prj-gemeinsam');
    p(pb.tueren[1].tuerblattstaerke === '70', 'B hat die gewählte Fassung', pb.tueren[1].tuerblattstaerke);
    p(pa.tueren[1].tuerblattstaerke === '70', 'A ebenfalls', pa.tueren[1].tuerblattstaerke);

    console.log('\n== Ohne Netz weiterarbeiten ==');
    B.netzAus();
    pb = await B.Store.projektLaden('prj-gemeinsam');
    pb.tueren[0].notiz = 'Im Keller aufgenommen, kein Empfang';
    pb.tueren.push(tuer('t-keller', { bezeichnung: 'Technikraum UG' }));
    await B.Store.projektSpeichern(pb);
    await B.A.projektGeaendert(pb);
    await B.A.jetzt();
    p(B.A.zustand().offen === 1, 'ohne Netz bleibt die Arbeit als offen stehen', B.A.zustand().offen);
    p(B.A.zustand().erreichbar === false, 'und der Zustand sagt: nicht erreichbar');
    const imKeller = await B.Store.projektLaden('prj-gemeinsam');
    p(imKeller.tueren.length === 6, 'die Arbeit ohne Netz ist trotzdem gespeichert', imKeller.tueren.length);

    B.netzAn();
    await B.A.jetzt();
    p(B.A.zustand().offen === 0, 'mit Netz wird nachgeholt', B.A.zustand().offen);
    p(B.A.zustand().erreichbar === true, 'und der Zustand stimmt wieder');
    await A.A.jetzt();
    pa = await A.Store.projektLaden('prj-gemeinsam');
    p(pa.tueren.length === 6 && pa.tueren.some(t => t.id === 't-keller'),
      'A bekommt die Kellertür', pa.tueren.map(t => t.id).join());
    p(pa.tueren[0].notiz === 'Im Keller aufgenommen, kein Empfang', 'samt Bemerkung', pa.tueren[0].notiz);

    console.log('\n== Fotos ==');
    pa = await A.Store.projektLaden('prj-gemeinsam');
    pa.tueren[0].fotos.push({ id: 'foto-1', beschriftung: 'Ansicht außen',
      dataUrl: 'data:image/jpeg;base64,' + JPEG.toString('base64'), erstellt: new Date().toISOString() });
    await A.Store.projektSpeichern(pa); await A.A.projektGeaendert(pa);
    await A.A.jetzt();
    await B.A.jetzt();
    pb = await B.Store.projektLaden('prj-gemeinsam');
    const fotoB = pb.tueren[0].fotos[0];
    p(fotoB && fotoB.id === 'foto-1', 'B kennt das Foto', JSON.stringify(fotoB && fotoB.id));
    p(fotoB && fotoB.beschriftung === 'Ansicht außen', 'mit Bildunterschrift');
    p(fotoB && /^data:image\/jpeg;base64,/.test(fotoB.dataUrl || ''), 'und hat die Bilddaten geholt',
      String(fotoB && (fotoB.dataUrl || '').slice(0, 40)));
    const zurueck = Buffer.from((fotoB.dataUrl || '').split(',')[1] || '', 'base64');
    p(zurueck.equals(JPEG), 'das Bild kam unverändert an', zurueck.length + ' statt ' + JPEG.length);

    console.log('\n== Ein neues Aufmaß, das von Anfang an Fotos hat ==');
    /* Der Normalfall vor Ort: Tür aufnehmen, fotografieren, später erst
       ins Netz kommen. Dann geht alles auf einmal raus. */
    const vorOrt = Object.assign(neuesProjekt(), { id: 'prj-vorort', kunde: 'Neubau Hafenstraße' });
    vorOrt.tueren[0].fotos.push({ id: 'foto-vorort', beschriftung: 'Haustür',
      dataUrl: 'data:image/jpeg;base64,' + JPEG.toString('base64'), erstellt: new Date().toISOString() });
    B.netzAus();
    await B.Store.projektSpeichern(vorOrt);
    await B.A.projektGeaendert(vorOrt);
    await B.A.jetzt();
    p(B.A.zustand().offen === 1, 'ohne Netz wartet das neue Aufmaß', B.A.zustand().offen);
    B.netzAn();
    await B.A.jetzt();
    p(B.A.zustand().offen === 0, 'mit Netz geht es raus', B.A.zustand().offen);
    await A.A.jetzt();
    const beiAvorOrt = await A.Store.projektLaden('prj-vorort');
    p(beiAvorOrt !== null, 'A bekommt das neue Aufmaß');
    const fotoA = beiAvorOrt && beiAvorOrt.tueren[0].fotos[0];
    p(fotoA && fotoA.id === 'foto-vorort', 'samt Fotoeintrag', JSON.stringify(fotoA && fotoA.id));
    p(fotoA && /^data:image\/jpeg;base64,/.test(fotoA.dataUrl || ''),
      'und das Foto selbst kam mit - obwohl es zusammen mit dem neuen Aufmaß entstand',
      String(fotoA && (fotoA.dataUrl || '').slice(0, 30)));
    const bytesA = Buffer.from((fotoA.dataUrl || '').split(',')[1] || '', 'base64');
    p(bytesA.equals(JPEG), 'unverändert', bytesA.length + ' statt ' + JPEG.length);

    console.log('\n== Wer nicht zuständig ist ==');
    await A.A.zustaendigeSetzen('prj-gemeinsam', ['u-weber']);
    await A.A.jetzt(); await B.A.jetzt();
    pb = await B.Store.projektLaden('prj-gemeinsam');
    pb.tueren[0].notiz = 'Versuch ohne Zuständigkeit';
    await B.Store.projektSpeichern(pb); await B.A.projektGeaendert(pb);
    await B.A.jetzt();
    const satzB = B.saetze['prj-gemeinsam'];
    p(satzB.schmutzig === true, 'B behält die Änderung lokal, sie geht nicht verloren');
    p(/zuständig/i.test(satzB.fehler || ''), 'und erfährt den Grund', satzB.fehler);
    await A.A.jetzt();
    pa = await A.Store.projektLaden('prj-gemeinsam');
    p(pa.tueren[0].notiz !== 'Versuch ohne Zuständigkeit', 'bei A ist nichts angekommen', pa.tueren[0].notiz);

    console.log('\n== Löschen wirkt auf allen Geräten ==');
    await A.A.zustaendigeSetzen('prj-gemeinsam', ['u-weber', 'u-kraus']);
    await B.A.jetzt();
    const zweites = Object.assign(neuesProjekt(), { id: 'prj-zweites', kunde: 'Zweites Objekt' });
    await A.Store.projektSpeichern(zweites);
    await A.A.projektGeaendert(zweites);
    await A.A.jetzt(); await B.A.jetzt();
    p(await B.Store.projektLaden('prj-zweites') !== null, 'B hat das zweite Aufmaß');
    await A.Store.projektLoeschen('prj-zweites');
    await A.A.projektGeloescht('prj-zweites');
    await B.A.jetzt();
    p(await B.Store.projektLaden('prj-zweites') === null, 'nach dem Löschen ist es auch bei B weg');

    console.log('\n== Löschen ohne Netz ==');
    /* Vor Ort gelöscht, Empfang kommt erst später: Das Löschen muss
       nachgeholt werden wie jede andere Änderung auch. */
    const spaeter = Object.assign(neuesProjekt(), { id: 'prj-spaeter', kunde: 'Später löschen' });
    await A.Store.projektSpeichern(spaeter); await A.A.projektGeaendert(spaeter);
    await A.A.jetzt();
    await A.A.zustaendigeSetzen('prj-spaeter', ['u-weber', 'u-kraus']);
    await A.A.jetzt(); await B.A.jetzt();
    p(await B.Store.projektLaden('prj-spaeter') !== null, 'Vorbereitung: beide Geräte haben das Aufmaß');
    B.netzAus();
    await B.Store.projektLoeschen('prj-spaeter');
    await B.A.projektGeloescht('prj-spaeter');
    p(await B.Store.projektLaden('prj-spaeter') === null, 'B hat es ohne Netz gelöscht');
    B.netzAn();
    await B.A.jetzt();
    p(await B.Store.projektLaden('prj-spaeter') === null, 'nach dem Abgleich ist es bei B weiterhin weg (kommt nicht zurück)');
    await A.A.jetzt();
    p(await A.Store.projektLaden('prj-spaeter') === null, 'das Löschen ohne Netz kommt bei A an');

    console.log('\n== Löschen ohne Zuständigkeit ==');
    /* Nur Zuständige dürfen löschen. Wer es trotzdem versucht, bekommt das
       Aufmaß zurück - sofort, nicht irgendwann still. */
    const fremdes = Object.assign(neuesProjekt(), { id: 'prj-fremd', kunde: 'Gehört Weber' });
    await A.Store.projektSpeichern(fremdes); await A.A.projektGeaendert(fremdes);
    await A.A.jetzt(); await B.A.jetzt();
    p(await B.Store.projektLaden('prj-fremd') !== null, 'Vorbereitung: B sieht das Aufmaß von A');
    await B.Store.projektLoeschen('prj-fremd');
    await B.A.projektGeloescht('prj-fremd');
    await B.A.jetzt();
    const zurueckGeholt = await B.Store.projektLaden('prj-fremd');
    p(zurueckGeholt !== null && zurueckGeholt.kunde === 'Gehört Weber', 'B bekommt es sofort zurück, weil B nicht zuständig ist',
      JSON.stringify(zurueckGeholt && zurueckGeholt.kunde));
    p(B.A.zustand().offen === 0, 'und es bleibt kein Grabstein liegen', B.A.zustand().offen);
    await A.A.jetzt();
    p(await A.Store.projektLaden('prj-fremd') !== null, 'bei A ist nichts passiert');

    console.log('\n== Zweimal hintereinander geändert, dazwischen zusammengeführt ==');
    /* A ändert eine Angabe zweimal kurz nacheinander, B arbeitet derweil an
       einer anderen Tür. Beim zweiten Mal darf B NICHT gefragt werden: B hat
       diese Angabe nie angefasst. */
    const doppel = Object.assign(neuesProjekt(), { id: 'prj-doppel', kunde: 'Doppelt geändert' });
    await A.Store.projektSpeichern(doppel); await A.A.projektGeaendert(doppel);
    await A.A.jetzt();
    await A.A.zustaendigeSetzen('prj-doppel', ['u-weber', 'u-kraus']);
    await A.A.jetzt(); await B.A.jetzt();
    let da = await A.Store.projektLaden('prj-doppel'); da.tueren[0].tuerblattstaerke = '60';
    await A.Store.projektSpeichern(da); await A.A.projektGeaendert(da); await A.A.jetzt();
    let db = await B.Store.projektLaden('prj-doppel'); db.tueren[2].dornmass = '55';
    await B.Store.projektSpeichern(db); await B.A.projektGeaendert(db);
    await B.A._intern.holen();                /* B führt zusammen, hat aber noch nicht gesendet */
    da = await A.Store.projektLaden('prj-doppel'); da.tueren[0].tuerblattstaerke = '62';
    await A.Store.projektSpeichern(da); await A.A.projektGeaendert(da); await A.A.jetzt();
    await B.A._intern.senden();              /* jetzt erst sendet B - und bekommt 409 */
    p(B.A.zustand().konflikte.length === 0,
      'B wird nicht nach einer Angabe gefragt, die B nie angefasst hat',
      JSON.stringify(B.A.zustand().konflikte.map(k => k.konflikte.map(x => x.feldName + ': ' + x.meins + '/' + x.server))));
    await B.A.jetzt(); await A.A.jetzt();
    db = await B.Store.projektLaden('prj-doppel'); da = await A.Store.projektLaden('prj-doppel');
    p(db.tueren[0].tuerblattstaerke === '62' && da.tueren[0].tuerblattstaerke === '62', 'die zweite Änderung von A steht auf beiden Geräten',
      JSON.stringify([db.tueren[0].tuerblattstaerke, da.tueren[0].tuerblattstaerke]));
    p(db.tueren[2].dornmass === '55' && da.tueren[2].dornmass === '55', 'und die Änderung von B ebenfalls');

    console.log('\n== Schlüssel, die den Bauplan treffen würden ==');
    /* Was vom Server kommt, ist JSON - ein "__proto__" darin ist dort eine
       gewöhnliche Eigenschaft und darf beim Mitziehen des geöffneten
       Aufmaßes nicht in den Bauplan des Objekts wandern. */
    const ziel = { id: 'z', kunde: 'A', tueren: [{ id: 't1', bezeichnung: 'alt' }] };
    const giftig = JSON.parse('{"id":"z","kunde":"B","__proto__":{"vergiftet":true},"constructor":{"x":1},"tueren":[{"id":"t1","bezeichnung":"neu","__proto__":{"vergiftet":true}}]}');
    A.A._intern.inPlatzUebernehmen(ziel, giftig);
    p(ziel.kunde === 'B' && ziel.tueren[0].bezeichnung === 'neu', 'das Mitziehen übernimmt die Angaben');
    p(!('vergiftet' in ziel) && !('vergiftet' in ziel.tueren[0]), 'aber keinen __proto__-Schlüssel', Object.keys(ziel).join());
    p(Object.getPrototypeOf(ziel) === Object.prototype && !({}).vergiftet, 'der Bauplan bleibt unberührt');

    console.log('\n== Nichts Fremdes im Gepäck ==');
    const satz = A.saetze['prj-gemeinsam'];
    p(satz.basis && !JSON.stringify(satz.basis).includes('data:image'),
      'die Basis trägt keine Bilddaten mit sich');
    const gesendet = A.A._intern.ohneBilddaten(await A.Store.projektLaden('prj-gemeinsam'));
    p(!JSON.stringify(gesendet).includes('data:image'), 'und gesendet wird ebenfalls ohne Bilddaten');
    p(JSON.stringify(gesendet).includes('foto-1'), 'der Fotoeintrag selbst bleibt erhalten');

    p(serverFehler === '', 'der Server hat keine Fehler gemeldet', serverFehler.slice(0, 400));

  } catch (e) {
    p(false, 'Durchlauf ohne Ausnahme', e.stack || String(e));
  } finally {
    server.kill();
    try { fs.rmSync(ARBEIT, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\nErgebnis Abgleich: ' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})();
