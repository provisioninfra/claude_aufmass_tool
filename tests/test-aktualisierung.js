/* Eine neue Fassung kommt auf dem Gerät an - auch wenn der Webserver den
 * Dateien lange Haltbarkeiten mitgibt (max-age). Genau daran war ein Gerät
 * nach einem Update hängen geblieben: Der Service Worker holte die "neue"
 * Fassung aus dem Browser-Cache, und das war die alte.
 *
 * Geprüft gegen einen Webserver mit max-age=3600 und einer Kopie von src/,
 * in der die Fassung zwischen den Durchläufen hochgesetzt wird. */
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const { starte, ersteProjektOeffnen } = require('./browser.js');
const { baueTestprojekt, einstellungen } = require('./fixture.js');

const W = path.join(__dirname, '..');
const HAFEN = 9700 + (process.pid % 250);
const BASIS = 'http://127.0.0.1:' + HAFEN;
const ARBEIT = fs.mkdtempSync(path.join(os.tmpdir(), 'aufmass-akt-'));
const SEITE = path.join(ARBEIT, 'seite');
let ok = 0, fehler = 0;
function p(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }
const warte = ms => new Promise(r => setTimeout(r, ms));

const FASSUNG = (/var FASSUNG = '([^']+)'/.exec(fs.readFileSync(path.join(W, 'src/js/app.js'), 'utf8')) || [])[1];
function fassungSetzen(neu) {
  ['js/app.js', 'sw.js'].forEach(rel => {
    const datei = path.join(SEITE, rel);
    const text = fs.readFileSync(datei, 'utf8').replace(/var FASSUNG = '[^']+'/, "var FASSUNG = '" + neu + "'");
    fs.writeFileSync(datei, text, 'utf8');
  });
}
/* Bis zu `ms` warten, bis die Seite eine bestimmte Fassung meldet - auch
   über ein Neuladen hinweg (dann ist der Ausführungsrahmen kurz weg). */
async function fassungAbwarten(seite, erwartet, ms) {
  const bis = Date.now() + ms;
  while (Date.now() < bis) {
    try {
      const f = await seite.evaluate(() => window.AppKern && window.AppKern.FASSUNG);
      if (f === erwartet) return f;
    } catch (e) { /* mitten im Neuladen */ }
    await warte(250);
  }
  try { return await seite.evaluate(() => window.AppKern && window.AppKern.FASSUNG); } catch (e) { return null; }
}

(async () => {
  fs.cpSync(path.join(W, 'src'), SEITE, { recursive: true });
  /* max-age=3600: so wie ein Hoster, der Skripte lange im Browser hält */
  const server = spawn('npx', ['http-server', SEITE, '-p', String(HAFEN), '-c3600', '--silent'],
    { stdio: 'ignore', detached: true });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASIS + '/index.html')).ok) break; } catch (e) {} await warte(150); }

  const browser = await starte();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 860 } });
    const seite = await ctx.newPage();
    const konsole = [];
    seite.on('pageerror', e => konsole.push('PAGEERROR: ' + e.message));
    /* Der Prüf-Webserver hat keine Schnittstelle: 404 für /wp-json/ ist hier der Normalfall. */
    seite.on('console', m => {
      if (m.type() !== 'error') return;
      const wo = (m.location() && m.location().url) || '';
      if (/wp-json/.test(wo) || /wp-json|ERR_/.test(m.text())) return;
      konsole.push(m.text() + '  @ ' + wo);
    });

    console.log('\n== Erster Besuch: Offline-Ablage wird eingerichtet ==');
    const kopfzeile = await fetch(BASIS + '/js/app.js');
    p(/max-age=3600/.test(kopfzeile.headers.get('cache-control') || ''), 'der Prüf-Webserver gibt Skripten eine lange Haltbarkeit mit',
      kopfzeile.headers.get('cache-control'));
    await seite.goto(BASIS + '/index.html', { waitUntil: 'load' });
    await seite.waitForSelector('header.kopf', { timeout: 10000 });
    const bereit = await seite.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100));
      return !!(reg && reg.active) && !!navigator.serviceWorker.controller;
    });
    p(bereit, 'der Service Worker ist aktiv und steuert die Seite');
    p((await seite.evaluate(() => window.AppKern.FASSUNG)) === FASSUNG, 'die Seite nennt die Fassung aus app.js (' + FASSUNG + ')');
    const ablage = await seite.evaluate(async () => {
      const namen = await caches.keys();
      const c = await caches.open(namen[0]);
      return { name: namen[0], anzahl: (await c.keys()).length };
    });
    p(ablage.name === 'aufmass-tool-' + FASSUNG, 'die Ablage trägt den Namen der Fassung', ablage.name);
    p(ablage.anzahl >= 25, 'und enthält alle Dateien (' + ablage.anzahl + ')');

    await seite.evaluate(() => window.App.wechseln('einstellungen'));
    await warte(300);
    const eins = await seite.textContent('main.inhalt');
    p(/Über dieses Werkzeug/.test(eins) && eins.indexOf('Fassung des Werkzeugs: ' + FASSUNG) !== -1,
      'die Einstellungen zeigen „Über dieses Werkzeug“ mit der Fassung');
    p(/Offline-Ablage: eingerichtet/.test(eins), 'und dass die Offline-Ablage eingerichtet ist');
    p(await seite.$('button:has-text("Auf neue Fassung prüfen")') !== null, 'mit dem Knopf „Auf neue Fassung prüfen“');

    console.log('\n== Neue Fassung auf dem Server: Übersicht ohne offenes Aufmaß → startet von selbst neu ==');
    fassungSetzen('9.9.9');
    await seite.goto(BASIS + '/index.html', { waitUntil: 'load' });
    await seite.waitForSelector('header.kopf', { timeout: 10000 });
    const sofort = await seite.evaluate(() => window.AppKern.FASSUNG);
    p(sofort === FASSUNG || sofort === '9.9.9', 'direkt nach dem Laden läuft noch die alte oder schon die neue Fassung', sofort);
    const danach = await fassungAbwarten(seite, '9.9.9', 15000);
    p(danach === '9.9.9', 'kurz darauf läuft die neue Fassung - trotz max-age im Browser-Cache', String(danach));
    const ablage2 = await seite.evaluate(async () => (await caches.keys()).join(','));
    p(ablage2 === 'aufmass-tool-9.9.9', 'die alte Ablage ist weggeräumt, nur die neue bleibt', ablage2);

    console.log('\n== Neue Fassung, während ein Aufmaß offen ist → Hinweis statt Abbruch ==');
    const projekt = baueTestprojekt();
    await seite.evaluate(async ([pr, e]) => {
      await window.Store.projektSpeichern(pr);
      await window.Store.einstellungenSpeichern(e);
    }, [projekt, einstellungen]);
    await seite.evaluate(() => window.App.zeichnen());
    await warte(300);
    p(await ersteProjektOeffnen(seite), 'ein Aufmaß ist geöffnet');
    await seite.evaluate(() => {
      const t = window.AppKern.Zustand.projekt;
      t.bemerkung = 'Eingabe kurz vor dem Neustart';
      window.AppKern.alsGeaendertMarkieren();
    });
    fassungSetzen('9.9.10');
    const geprueft = await seite.evaluate(() => window.Aktualisierung.pruefen());
    p(geprueft === true, 'der Knopf „Auf neue Fassung prüfen“ stößt die Prüfung an');
    await seite.waitForSelector('.fassung-hinweis', { timeout: 15000 });
    const hinweis = await seite.textContent('.fassung-hinweis');
    p(/neue Fassung/i.test(hinweis) && /gespeichert/.test(hinweis), 'der Hinweis erscheint und verspricht, zuerst zu speichern', hinweis.trim());
    p((await seite.evaluate(() => window.AppKern.FASSUNG)) === '9.9.9', 'die Seite wurde NICHT einfach neu geladen - das Aufmaß ist noch offen');
    p((await seite.evaluate(() => window.AppKern.Zustand.projekt.bemerkung)) === 'Eingabe kurz vor dem Neustart', 'die Eingabe ist noch da');
    await seite.click('.fassung-hinweis button:has-text("Jetzt neu starten")');
    const nachNeustart = await fassungAbwarten(seite, '9.9.10', 15000);
    p(nachNeustart === '9.9.10', 'nach „Jetzt neu starten“ läuft die neueste Fassung', String(nachNeustart));
    await seite.waitForSelector('header.kopf', { timeout: 10000 });
    const erhalten = await seite.evaluate(async () => {
      const alle = await window.Store.alleProjekte();
      return alle.length === 1 ? alle[0].bemerkung : 'Anzahl: ' + alle.length;
    });
    p(erhalten === 'Eingabe kurz vor dem Neustart', 'das Aufmaß samt letzter Eingabe wurde vor dem Neustart gespeichert', String(erhalten));

    console.log('\n== Sauberkeit ==');
    p(konsole.length === 0, 'keine Fehler in der Konsole', konsole.join(' | ').slice(0, 300));
  } catch (e) {
    p(false, 'Durchlauf ohne Ausnahme', e.stack || String(e));
  } finally {
    await browser.close();
    try { process.kill(-server.pid); } catch (e) { try { server.kill(); } catch (e2) {} }
    try { fs.rmSync(ARBEIT, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nErgebnis Aktualisierung: ' + ok + ' ok, ' + fehler + ' Fehler');
  process.exit(fehler ? 1 : 0);
})();
