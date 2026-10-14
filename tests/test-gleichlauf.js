/* Gleichlauf zwischen Browser und Server bei der Kundenfreigabe.
 *
 * Die Seite des Kunden erzeugt ihre Rückmeldung mit freigabe.js; der Server
 * prüft sie in PHP (freigaben.php) gegen die Freigabe - mit einer eigenen
 * Fassung derselben Regeln (Lauflängen, Maske, Rechte, Mitarbeiter- und
 * Gruppenlisten, neue Spalten). Weichen die beiden voneinander ab, wiese
 * der Server echte Rückmeldungen ab oder nähme manipulierte an. Darum hier:
 * Hunderte Zufallsfälle durch beide Seiten. */
const path = require('path');
const { execFileSync } = require('child_process');
const W = path.join(__dirname, '..');
require(W + '/src/js/catalog.js');
const M = require(W + '/src/js/model.js'); global.Model = M;
const F = require(W + '/src/js/freigabe.js');

let ok = 0, fehler = 0;
function p(b, t, i) { if (b) ok++; else { fehler++; console.log('  FEHL  ' + t + (i ? '\n          -> ' + i : '')); } }

/* Deterministischer Zufall, damit ein Fehlschlag reproduzierbar ist */
let saat = 20261013;
function zufall() { saat = (saat * 1103515245 + 12345) & 0x7fffffff; return saat / 0x7fffffff; }
function wahl(liste) { return liste[Math.floor(zufall() * liste.length)]; }
function ganz(a, b) { return a + Math.floor(zufall() * (b - a + 1)); }

const NAMEN = ['Frau Dr. Schäfer', 'Herr Özdemir', 'Müller & Söhne', "O'Brien", 'Jean-Luc "Pit" Maré',
  'Zoë Łukasz', 'Иван Петров', '山田 太郎', 'Herr <b>Fett</b>', 'Anna;Berta,Clara', '  mit Rand  ',
  'Name\twith\ttab', 'x'.repeat(130), 'Emoji 🙂 Name', 'Reinigung GmbH & Co. KG', 'a'];
const MEDIEN = ['', 'Transponder', 'Karte', 'Schlüssel', 'Smartphone (App)', 'y'.repeat(70)];
const WERTE = ['nein', 'nein', 'nein', 'nein', 'ja', 'ja', 'zeit', 'temp', 'sperr'];
const HEIKEL = /[\t ]|x{130}|🙂|y{70}/;

function zufallsProjekt() {
  const pr = M.neuesProjekt('Fall ' + ganz(1, 9999));
  pr.kunde = wahl(NAMEN); pr.objekt = 'Objekt ' + ganz(1, 99);
  const nT = ganz(1, 30), nG = ganz(0, 4), nM = ganz(0, 8);
  for (let i = 0; i < nT; i++) pr.tueren.push(M.neueTuer({ nummer: 'T-' + i, bezeichnung: wahl(NAMEN) }));
  for (let i = 0; i < nG; i++) pr.gruppen.push(M.neueGruppe({ name: wahl(NAMEN) }));
  for (let i = 0; i < nM; i++) {
    const gruppen = pr.gruppen.filter(() => zufall() < 0.4).map(g => g.id);
    const medien = [];
    const nMed = ganz(0, 3);
    for (let k = 0; k < nMed; k++) medien.push({ typ: wahl(MEDIEN), anzahl: ganz(0, 1200) });
    pr.mitarbeiter.push(M.neuerMitarbeiter({ name: wahl(NAMEN), gruppen, medien }));
  }
  /* Spalten: ein paar Schließungen, dazu zufällig Gruppen und Mitarbeiter */
  const nS = ganz(1, 6);
  for (let i = 0; i < nS; i++) {
    const s = M.neueSchliessung({ kuerzel: 'S' + i, bezeichnung: 'Schließung ' + i, sort: i,
      traeger: pr.mitarbeiter.filter(() => zufall() < 0.3).map(m => m.id) });
    if (!s.traeger.length && zufall() < 0.5) s.medien = [{ typ: wahl(MEDIEN), anzahl: ganz(1, 5) }];
    pr.schliessungen.push(s);
  }
  pr.gruppen.forEach(g => { if (zufall() < 0.6) M.spalteFuer(pr, 'gruppe', g.id); });
  pr.mitarbeiter.forEach(m => { if (zufall() < 0.2) M.spalteFuer(pr, 'mitarbeiter', m.id); });
  pr.tueren.forEach(t => pr.schliessungen.forEach(s => { const w = wahl(WERTE); if (w !== 'nein') M.setBerechtigung(pr, t.id, s.id, w); }));
  return pr;
}

const faelle = [];
const erwartungen = [];
const ANZAHL = 160;
let neuZaehler = 0;
function neuId() { return 'neu-' + (neuZaehler++).toString(36) + ganz(10, 99); }

for (let n = 0; n < ANZAHL; n++) {
  const pr = zufallsProjekt();
  const frei = pr.schliessungen.filter(() => zufall() < 0.5).map(s => s.id);
  if (!frei.length) frei.push(pr.schliessungen[0].id);
  const rechte = { m: zufall() < 0.7 ? 1 : 0, g: zufall() < 0.6 ? 1 : 0, s: zufall() < 0.5 ? 1 : 0 };
  const daten = F.erstellen(pr, { freigegebeneSchliessungen: frei, nurLeereFelder: zufall() < 0.3, rechte,
    medienArten: wahl([[], ['Transponder', 'Karte'], MEDIEN]),
    hinweis: wahl(['', 'Bitte nur Reinigung', 'x'.repeat(600)]), frist: '30.11.2026', firma: 'Provision Infra GmbH' });
  /* Rundlauf über den Anker wie beim langen Link */
  const rund = F.ausAnker(F.alsAnker(daten));
  p(rund.matrix.length === daten.t.length * daten.s.length, 'Anker-Rundlauf: Matrixgröße stimmt', n);

  /* Der Kunde ändert: freie Felder umschalten, Listen bearbeiten, Spalten aufnehmen */
  const arbeit = rund.matrix.split('');
  const FOLGE = ['nein', 'ja', 'zeit'];
  for (let i = 0; i < arbeit.length; i++) {
    if (rund.maske[i] === '1' && zufall() < 0.25) {
      const jetzt = F.zeichenZuWert(arbeit[i]);
      const pos = FOLGE.indexOf(jetzt);
      arbeit[i] = F.wertZuZeichen(FOLGE[(pos === -1 ? 0 : pos + ganz(1, 2)) % FOLGE.length]);
    }
  }
  const gruppen = rund.gr.map(g => g.slice());
  const mitarbeiter = rund.ma.map(m => [m[0], m[1], m[2].slice(), m[3].map(x => x.slice())]);
  const entfernteGr = [], entfernteMa = [], neueSpalten = [];
  let heikel = false;
  function spalteVorhanden(art, id) {
    return rund.s.some(s => s[4] === art && s[5] === id) || neueSpalten.some(x => x[0] === art && x[1] === id);
  }
  if (rechte.g && zufall() < 0.7) {
    const r = zufall();
    if (r < 0.4) { const g = [neuId(), wahl(NAMEN)]; gruppen.push(g); heikel = heikel || HEIKEL.test(g[1]); }
    else if (r < 0.7 && gruppen.length) { const g = wahl(gruppen); g[1] = wahl(NAMEN); heikel = heikel || HEIKEL.test(g[1]); }
    else if (gruppen.length) {
      const i = ganz(0, gruppen.length - 1);
      const g = gruppen[i];
      if (!spalteVorhanden('gruppe', g[0])) {
        gruppen.splice(i, 1);
        if (!/^neu-/.test(g[0])) entfernteGr.push(g[0]);
        mitarbeiter.forEach(m => { m[2] = m[2].filter(x => x !== g[0]); });
      }
    }
    if (zufall() < 0.3) gruppen.push([neuId(), '   ']);   /* ohne Namen - fällt heraus */
  }
  if (rechte.m && zufall() < 0.8) {
    const r = zufall();
    if (r < 0.4) {
      const m = [neuId(), wahl(NAMEN), gruppen.filter(() => zufall() < 0.4).map(g => g[0]), [[wahl(MEDIEN), ganz(0, 120)], [wahl(MEDIEN), 1]]];
      mitarbeiter.push(m); heikel = heikel || HEIKEL.test(m[1] + m[3].map(x => x[0]).join());
    } else if (r < 0.7 && mitarbeiter.length) {
      const m = wahl(mitarbeiter); m[1] = wahl(NAMEN); m[3] = [[wahl(MEDIEN), ganz(1, 3)]];
      heikel = heikel || HEIKEL.test(m[1] + m[3][0][0]);
    } else if (mitarbeiter.length) {
      const i = ganz(0, mitarbeiter.length - 1);
      const m = mitarbeiter[i];
      if (!spalteVorhanden('mitarbeiter', m[0])) { mitarbeiter.splice(i, 1); if (!/^neu-/.test(m[0])) entfernteMa.push(m[0]); }
    }
    if (zufall() < 0.3) mitarbeiter.push([neuId(), '', [], []]);   /* ohne Namen - fällt heraus */
  }
  if (rechte.s && zufall() < 0.7) {
    const kandidatenG = gruppen.filter(g => String(g[1]).trim() && !spalteVorhanden('gruppe', g[0]));
    const kandidatenM = mitarbeiter.filter(m => String(m[1]).trim() && !spalteVorhanden('mitarbeiter', m[0]));
    if (kandidatenG.length && zufall() < 0.7) {
      const g = wahl(kandidatenG);
      neueSpalten.push(['gruppe', g[0], rund.t.map(() => F.wertZuZeichen(wahl(['nein', 'nein', 'ja', 'zeit']))).join('')]);
    }
    if (kandidatenM.length && zufall() < 0.5) {
      const m = wahl(kandidatenM);
      neueSpalten.push(['mitarbeiter', m[0], rund.t.map(() => F.wertZuZeichen(wahl(['nein', 'ja']))).join('')]);
    }
  }
  const fr = zufall() < 0.3 ? { name: wahl(NAMEN), funktion: wahl(['', 'GF', 'Hausverwaltung']) } : null;
  if (fr) heikel = heikel || HEIKEL.test(fr.name + fr.funktion);
  /* Wie die Kundenseite: Spalten für namenlose Einträge fallen weg */
  const gueltigeG = {}, gueltigeM = {};
  F.gruppenBereinigen(gruppen).forEach(g => { if (g[0]) gueltigeG[g[0]] = true; });
  F.mitarbeiterBereinigen(mitarbeiter).forEach(m => { if (m[0]) gueltigeM[m[0]] = true; });
  const n2 = neueSpalten.filter(x => x[0] === 'gruppe' ? gueltigeG[x[1]] : gueltigeM[x[1]]);
  /* Wie die Kundenseite: ohne Recht wird die Liste nie gesendet */
  const maGeaendert = rechte.m && (entfernteMa.length > 0 || !F.listenGleich(F.mitarbeiterBereinigen(mitarbeiter), F.mitarbeiterBereinigen(rund.ma)));
  const grGeaendert = rechte.g && (entfernteGr.length > 0 || !F.listenGleich(F.gruppenBereinigen(gruppen), F.gruppenBereinigen(rund.gr)));
  const antwort = F.antwortErstellen(rund, arbeit.join(''), {
    ma: maGeaendert ? mitarbeiter : null, max: rechte.m ? entfernteMa : [], gr: grGeaendert ? gruppen : null, grx: rechte.g ? entfernteGr : [],
    n: rechte.s ? n2 : [], fr
  });
  /* Namen in Listen, die PHP härter bereinigt als JS: Steuerzeichen zu
     Leerzeichen, Überlängen nach Zeichen statt UTF-16-Einheiten */
  heikel = heikel || rund.ma.some(m => HEIKEL.test(m[1] + m[3].map(x => x[0]).join())) || rund.gr.some(g => HEIKEL.test(g[1]));
  faelle.push({ daten, antwort });
  erwartungen.push({ art: 'echt', daten, antwort, matrix: rund.matrix, maske: rund.maske, heikel, rechte });

  /* Dazu ein manipulierter Fall: ein nicht freigegebenes Feld */
  const gesperrt = [];
  for (let i = 0; i < rund.maske.length; i++) if (rund.maske[i] === '0') gesperrt.push(i);
  if (gesperrt.length) {
    const i = wahl(gesperrt);
    const boese = Object.assign({}, antwort, { a: (antwort.a ? antwort.a + ',' : '') + i.toString(36) + ':1' });
    faelle.push({ daten, antwort: boese });
    erwartungen.push({ art: 'manipuliert', grund: 'nicht_freigegeben' });
  }
  /* Und etwas, wofür der Link kein Recht gab */
  if (!rechte.g) {
    faelle.push({ daten, antwort: Object.assign({}, antwort, { gr: rund.gr.concat([[neuId(), 'Eindringling']]) }) });
    erwartungen.push({ art: 'manipuliert', grund: 'nicht_freigegeben' });
  } else if (!rechte.s) {
    faelle.push({ daten, antwort: Object.assign({}, antwort, { n: [['gruppe', rund.gr.length ? rund.gr[0][0] : 'neu-x', '1'.repeat(rund.t.length)]] }) });
    erwartungen.push({ art: 'manipuliert', grund: 'nicht_freigegeben' });
  } else if (!rechte.m) {
    faelle.push({ daten, antwort: Object.assign({}, antwort, { max: rund.ma.length ? [rund.ma[0][0]] : ['x'] }) });
    erwartungen.push({ art: 'manipuliert', grund: rund.ma.length ? 'nicht_freigegeben' : 'nicht_freigegeben' });
  }
  /* Eine erfundene Kennung: weist die ganze Antwort ab */
  if (rechte.m) {
    faelle.push({ daten, antwort: Object.assign({}, antwort, { ma: (antwort.ma || rund.ma).concat([['ma-erfunden-1', 'Fremd', [], []]]) }) });
    erwartungen.push({ art: 'manipuliert', grund: 'unlesbar' });
  }
}

const roh = execFileSync('php', [path.join(W, 'server/tests/gleichlauf.php')], { input: JSON.stringify(faelle), maxBuffer: 64 * 1024 * 1024 });
const ergebnisse = JSON.parse(roh.toString());
p(ergebnisse.length === faelle.length, 'PHP hat alle Fälle beantwortet', ergebnisse.length + ' / ' + faelle.length);

let echte = 0, streng = 0, manipulierte = 0;
ergebnisse.forEach((e, i) => {
  const erw = erwartungen[i];
  if (erw.art === 'manipuliert') {
    manipulierte++;
    p(e.datenOk && e.ok === false && e.code === erw.grund, 'manipulierte Rückmeldung wird abgewiesen (' + erw.grund + ')', JSON.stringify(e).slice(0, 200));
    return;
  }
  echte++;
  p(e.datenOk, 'die Freigabe aus freigabe.js wird vom Server angenommen', e.datenFehler);
  if (!e.datenOk) return;
  p(e.matrix === erw.matrix && e.maske === erw.maske, 'PHP und JS entpacken Matrix und Maske gleich',
    (e.matrix || '').slice(0, 40) + ' / ' + erw.matrix.slice(0, 40));
  p(JSON.stringify(e.rechte) === JSON.stringify(erw.rechte), 'die Rechte kommen unverändert an', JSON.stringify(e.rechte));
  p(e.ok === true, 'eine echte Rückmeldung wird nie abgewiesen', JSON.stringify({ code: e.code, meldung: e.meldung, rechte: e.rechte })
    + '\n             antwort: ' + JSON.stringify({ ma: erw.antwort.ma, max: erw.antwort.max, gr: erw.antwort.gr, grx: erw.antwort.grx, n: erw.antwort.n, fr: erw.antwort.fr }).slice(0, 900)
    + '\n             link-gr: ' + JSON.stringify(erw.daten.gr).slice(0, 300) + '\n             link-ma: ' + JSON.stringify(erw.daten.ma).slice(0, 600));
  if (!e.ok) return;
  p(e.a === erw.antwort.a, 'die Berechtigungsänderungen kommen unverändert an', e.a + ' / ' + erw.antwort.a);
  p(JSON.stringify(e.n || null) === JSON.stringify(erw.antwort.n || null), 'neue Spalten kommen unverändert an', JSON.stringify(e.n) + ' / ' + JSON.stringify(erw.antwort.n));
  p(JSON.stringify(e.max || null) === JSON.stringify(erw.antwort.max || null) && JSON.stringify(e.grx || null) === JSON.stringify(erw.antwort.grx || null),
    'entfernte Kennungen kommen unverändert an');
  p((e.fr === null) === !erw.antwort.fr, 'die verbindliche Freigabe kommt an, wenn es eine gab', JSON.stringify(e.fr));
  if (!erw.heikel) {
    streng++;
    p(JSON.stringify(e.ma || null) === JSON.stringify(erw.antwort.ma || null), 'die Mitarbeiterliste ist nach beiden Bereinigungen gleich',
      String(JSON.stringify(erw.antwort.ma)).slice(0, 160) + '\n             php: ' + String(JSON.stringify(e.ma)).slice(0, 160));
    p(JSON.stringify(e.gr || null) === JSON.stringify(erw.antwort.gr || null), 'die Gruppenliste ist nach beiden Bereinigungen gleich',
      String(JSON.stringify(erw.antwort.gr)).slice(0, 160) + '\n             php: ' + String(JSON.stringify(e.gr)).slice(0, 160));
    if (erw.antwort.fr) p(e.fr && e.fr.name === erw.antwort.fr.name && e.fr.funktion === erw.antwort.fr.funktion, 'Name und Funktion der Freigabe sind gleich');
  } else {
    /* Steuerzeichen, Überlängen, Emoji: PHP bereinigt härter (Steuerzeichen
       raus, Zeichen statt UTF-16-Einheiten). Dann gilt nur: dieselben
       Listen sind betroffen, und kein Eintrag ohne Namen bleibt übrig. */
    p((e.ma === null) === !erw.antwort.ma && (e.gr === null) === !erw.antwort.gr, 'heikle Zeichen: beide Seiten sehen dieselben betroffenen Listen');
    p((e.ma || []).every(x => x[1] !== '' && x[3].every(y => y[1] >= 1 && y[1] <= 999)) && (e.gr || []).every(x => x[1] !== ''),
      'heikle Zeichen: kein Eintrag ohne Namen, Anzahl im Rahmen');
  }
});
console.log('  ' + echte + ' echte, davon ' + streng + ' streng verglichen; ' + manipulierte + ' manipulierte Rückmeldungen');
console.log('\nErgebnis Gleichlauf: ' + ok + ' ok, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
