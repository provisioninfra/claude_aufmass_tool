/* Abgleich, während das Aufmaß geöffnet ist und gerade getippt wird.
 *
 * Der Fall aus der Praxis: Im Büro (Gerät A) wird die Gliederung angelegt -
 * Standort, Gebäude, Bereich. Vor Ort (Gerät B) ist dasselbe Aufmaß
 * geöffnet, und jemand tippt die erste Tür ein. Eine Tür im Formular ist
 * noch nicht im Aufmaß (sie kommt erst mit „Tür speichern“ hinein), aber
 * das Werkzeug gilt schon als „ungesichert“.
 *
 * Genau dann bringt der Abgleich die Gliederung. Sie muss im GEÖFFNETEN
 * Aufmaß ankommen - nicht nur in der Datenbank. Sonst schreibt die nächste
 * Speicherung den Speicherstand ohne Gliederung über den Serverstand, und
 * Gerät A verliert seine Gliederung beim nächsten Abgleich, als hätte B
 * sie gelöscht. Die Türen blieben, die Gebäudestruktur wäre weg.
 *
 * Geprüft gegen den echten PHP-Serverteil (server/tests/mini-server.php). */
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');

const W = path.join(__dirname, '..');
const HAFEN = 8500 + (process.pid % 300);
const BASIS = 'http://127.0.0.1:' + HAFEN;
const ARBEIT = fs.mkdtempSync(path.join(os.tmpdir(), 'aufmass-abgleich-offen-'));

let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

/* --- Google-Schlüssel und Ausweise (wie in test-abgleich.js) ------------ */
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
    iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600, nonce: Math.random().toString(36).slice(2)
  }));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(kopf + '.' + inhalt), privateKey);
  return kopf + '.' + inhalt + '.' + sig.toString('base64url');
}
const OPT = path.join(ARBEIT, 'optionen.json');
fs.writeFileSync(OPT, JSON.stringify({
  aufmass_client_id: CLIENT,
  aufmass_domaene: DOMAENE,
  aufmass_google_schluessel_sicherung: { keys: [{ kty: 'RSA', kid: 'test-1', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] }
}));

/* --- Ein Gerät mit Oberfläche: Zustand.projekt ist das geöffnete Aufmaß --- */
function geraetBauen(name) {
  const projekte = {}, saetze = {}, kekse = {};
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
  /* Der Kern der Oberfläche, so weit der Abgleich ihn braucht */
  const AppKern = {
    Zustand: { projekt: null, ungesichert: false, speichertGerade: false },
    alsGeaendertMarkieren() { AppKern.Zustand.ungesichert = true; },
    schrittMerken() {},
    speichern() { return geraet.speichern(); }
  };
  let gezeichnet = 0;
  const sandkasten = {
    Store, AppKern, App: { zeichnen() { gezeichnet++; } }, Verlauf: { beginnen() {} },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: meinFetch, Blob, Uint8Array, Promise, JSON, Math, Date, Error,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    navigator: { onLine: true }, document: { hidden: false }, addEventListener: () => {},
    encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isFinite, String, Object, Array, Number, Boolean
  };
  sandkasten.globalThis = sandkasten;
  vm.createContext(sandkasten);
  vm.runInContext(fs.readFileSync(path.join(W, 'src/js/zusammenfuehren.js'), 'utf8'), sandkasten, { filename: 'zusammenfuehren.js' });
  vm.runInContext(fs.readFileSync(path.join(W, 'src/js/abgleich.js'), 'utf8'), sandkasten, { filename: 'abgleich.js' });

  const geraet = {
    name, Store, projekte, saetze, AppKern,
    A: sandkasten.Abgleich,
    gezeichnet: () => gezeichnet,
    /* Das Aufmaß öffnen: ab jetzt hält die Oberfläche eine eigene Fassung */
    async oeffnen(id) { AppKern.Zustand.projekt = await Store.projektLaden(id); AppKern.Zustand.ungesichert = false; return AppKern.Zustand.projekt; },
    offen: () => AppKern.Zustand.projekt,
    /* Tippen im Formular: ungesichert, aber noch nichts im Aufmaß */
    tippen() { AppKern.alsGeaendertMarkieren(); },
    /* Wie App.speichern: Speicher in die Datenbank, dann Meldung an den Abgleich */
    async speichern() {
      const pr = AppKern.Zustand.projekt;
      await Store.projektSpeichern(pr);
      await sandkasten.Abgleich.projektGeaendert(pr);
      AppKern.Zustand.ungesichert = false;
    }
  };
  return geraet;
}

function tuer(id, zusatz) {
  return Object.assign({ id, nummer: id.toUpperCase(), bezeichnung: 'Tür ' + id, strukturId: null, fotos: [] }, zusatz || {});
}
function neuesProjekt() {
  return { id: 'prj-ibsen', kunde: 'Ibsen', objekt: 'Verwaltung', anlagenNr: 'SA-1', bemerkung: '',
    standorte: [], tueren: [tuer('t1')], schliessungen: [], matrix: {}, mitarbeiter: [], gruppen: [] };
}
const GLIEDERUNG = [
  { id: 'st-1', ebene: 'standort', name: 'Standort Ibsen', parentId: null, bemerkung: '', sort: 0 },
  { id: 'geb-1', ebene: 'gebaeude', name: 'Haus 1', parentId: 'st-1', bemerkung: '', sort: 0 },
  { id: 'ber-1', ebene: 'bereich', name: 'Erdgeschoss', parentId: 'geb-1', bemerkung: '', sort: 0 }
];
const namen = pr => (pr && pr.standorte || []).map(k => k.name).join(' > ') || '(keine Gliederung)';
/* Lage eines Geräts für Fehlermeldungen: Abgleichzustand und Satz */
const lage = G => { const z = G.A.zustand(), s = G.saetze['prj-ibsen'] || {};
  return 'Fehler=' + JSON.stringify(z.letzterFehler) + ' Konflikte=' + z.konflikte.length + ' offen=' + z.offen +
    ' Satz{version=' + s.version + ', schmutzig=' + s.schmutzig + ', fehler=' + JSON.stringify(s.fehler) + '}'; };

(async () => {
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
    const A = geraetBauen('Büro');
    const B = geraetBauen('Vor Ort');
    await A.A.einrichten({ basisUrl: BASIS }); await A.A.anmelden(ausweis('u-buero', 'Büro'));
    await B.A.einrichten({ basisUrl: BASIS }); await B.A.anmelden(ausweis('u-vorort', 'Vor Ort'));
    p(A.A.zustand().angemeldet && B.A.zustand().angemeldet, 'beide Geräte sind angemeldet');

    console.log('\n== Ausgangslage: ein Aufmaß auf beiden Geräten, auf B geöffnet ==');
    const pr = neuesProjekt();
    await A.Store.projektSpeichern(pr); await A.A.projektGeaendert(pr); await A.A.jetzt();
    await A.A.zustaendigeSetzen('prj-ibsen', ['u-buero', 'u-vorort']);
    await B.A.jetzt();
    const beiB = await B.oeffnen('prj-ibsen');
    p(beiB && beiB.tueren.length === 1 && beiB.standorte.length === 0, 'B hat das Aufmaß geholt und geöffnet - noch ohne Gliederung');

    console.log('\n== A legt die Gliederung an, B tippt derweil die erste Tür ==');
    const pa = await A.Store.projektLaden('prj-ibsen');
    pa.standorte = JSON.parse(JSON.stringify(GLIEDERUNG));
    await A.Store.projektSpeichern(pa); await A.A.projektGeaendert(pa); await A.A.jetzt();
    p(A.A.zustand().offen === 0, 'die Gliederung von A ist auf dem Server');

    B.tippen();                                   /* Türformular offen, noch nichts im Aufmaß */
    p(B.AppKern.Zustand.ungesichert === true && JSON.stringify(B.offen().standorte) === '[]',
      'auf B gilt: ungesichert, aber im Aufmaß hat sich nichts geändert');
    await B.A.jetzt();                            /* der Abgleich bringt die Gliederung */
    p(B.A.zustand().konflikte.length === 0, 'der Abgleich sieht keinen Streit');
    const inDb = await B.Store.projektLaden('prj-ibsen');
    p(inDb.standorte.length === 3, 'die Gliederung steht in der Datenbank von B', namen(inDb));
    p(B.offen().standorte.length === 3, 'und im GEÖFFNETEN Aufmaß auf B - auch während getippt wird', namen(B.offen()));
    p(B.gezeichnet() > 0, 'die Oberfläche wurde neu gezeichnet');

    console.log('\n== B speichert die Tür, beide gleichen ab ==');
    B.offen().tueren.push(tuer('t-b-eingang', { bezeichnung: 'Eingang', strukturId: 'ber-1' }));
    await B.speichern();
    await B.A.jetzt();
    await A.A.jetzt();
    const nachherA = await A.Store.projektLaden('prj-ibsen');
    p(nachherA.standorte.length === 3, 'A hat seine Gliederung noch', namen(nachherA));
    p(nachherA.tueren.some(t => t.id === 't-b-eingang'), 'und die neue Tür von B', nachherA.tueren.map(t => t.id).join());
    await B.A.jetzt();
    const nachherB = await B.Store.projektLaden('prj-ibsen');
    p(nachherB.standorte.length === 3 && B.offen().standorte.length === 3, 'B hat die Gliederung in Datenbank und Speicher', namen(nachherB) + ' / ' + namen(B.offen()));
    p(nachherB.tueren.length === 2 && B.offen().tueren.length === 2, 'und beide Türen', nachherB.tueren.map(t => t.id).join());
    p(JSON.stringify(nachherA.standorte) === JSON.stringify(GLIEDERUNG), 'die Gliederung ist unverändert, Knoten für Knoten');
    const t1A = nachherA.tueren.find(t => t.id === 't1');
    const ohneNull = o => JSON.stringify(o, (k, v) => (v === null ? '' : v));
    p(ohneNull(t1A) === ohneNull(tuer('t1')), 'die vorhandene Tür ist unverändert (null und leer gelten gleich)', JSON.stringify(t1A));

    console.log('\n== Umgekehrt: A tippt in den Stammdaten, B legt derweil einen Bereich an ==');
    await A.oeffnen('prj-ibsen');
    B.offen().standorte.push({ id: 'ber-2', ebene: 'bereich', name: 'Obergeschoss', parentId: 'geb-1', bemerkung: '', sort: 1 });
    await B.speichern(); await B.A.jetzt();
    A.offen().bemerkung = 'Schlüssel liegen beim Hausmeister';   /* live gebundenes Feld, noch ungesichert */
    A.tippen();
    await A.A.jetzt();
    p(A.offen().standorte.length === 4, 'der neue Bereich kommt im geöffneten Aufmaß von A an', namen(A.offen()) + ' | A: ' + lage(A) + ' | B: ' + lage(B));
    p(A.offen().bemerkung === 'Schlüssel liegen beim Hausmeister', 'die ungesicherte Eingabe von A bleibt dabei erhalten', A.offen().bemerkung);
    await A.speichern(); await A.A.jetzt(); await B.A.jetzt();
    const endeB = await B.Store.projektLaden('prj-ibsen');
    p(endeB.standorte.length === 4 && endeB.bemerkung === 'Schlüssel liegen beim Hausmeister', 'B bekommt die Bemerkung und behält alle vier Knoten', namen(endeB));

    console.log('\n== Konflikt auflösen, während weitergearbeitet wird ==');
    /* A und B ändern dieselbe Angabe; A löst auf, hat aber inzwischen
       weitergetippt - diese Arbeit darf die Auflösung nicht zurückdrehen. */
    B.offen().tueren.find(x => x.id === 't1').tuerblattstaerke = '45';
    await B.speichern(); await B.A.jetzt();
    A.offen().tueren.find(x => x.id === 't1').tuerblattstaerke = '70';
    await A.speichern(); await A.A.jetzt();
    p(A.A.zustand().konflikte.length === 1, 'A bekommt die Rückfrage zur Türblattstärke', lage(A) + ' | Türen A: ' + A.offen().tueren.map(t => t.id + ':' + t.tuerblattstaerke).join() + ' | B: ' + lage(B));
    if (A.A.zustand().konflikte.length !== 1) { throw new Error('ohne Rückfrage geht es hier nicht weiter'); }
    A.offen().tueren.find(x => x.id === 't1').notiz = 'nach der Rückfrage getippt';     /* weitergearbeitet */
    A.tippen();
    const streit = A.A.zustand().konflikte[0];
    await A.A.konfliktAufloesen('prj-ibsen', { [streit.konflikte[0].id]: 'server' });
    const t1Nachher = A.offen().tueren.find(x => x.id === 't1');
    p(t1Nachher.tuerblattstaerke === '45', 'die gewählte Fassung steht im geöffneten Aufmaß', t1Nachher.tuerblattstaerke);
    p(t1Nachher.notiz === 'nach der Rückfrage getippt', 'die Eingabe von zwischendurch bleibt erhalten', t1Nachher.notiz);
    p(A.offen().standorte.length === 4, 'und die Gliederung ist vollständig', namen(A.offen()));

    p(serverFehler === '', 'der Server lief ohne PHP-Warnungen', serverFehler.slice(0, 200));
  } catch (e) {
    fehler++;
    console.log('  FEHL Abbruch: ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 3).join('\n'));
  } finally {
    server.kill();
    try { fs.rmSync(ARBEIT, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nErgebnis Abgleich bei geöffnetem Aufmaß: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})();
