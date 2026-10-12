/* Gleichlauf zwischen Browser und Server bei der Kundenfreigabe.
 *
 * Die Seite des Kunden erzeugt ihre Rückmeldung mit freigabe.js; der Server
 * prüft sie in PHP (freigaben.php) gegen die Freigabe - mit einer eigenen
 * Fassung derselben Regeln (Lauflängen, Maske, Personenlisten). Weichen die
 * beiden voneinander ab, wiese der Server echte Rückmeldungen ab oder nähme
 * manipulierte an. Darum hier: Hunderte Zufallsfälle durch beide Seiten. */
const path = require('path');
const { execFileSync } = require('child_process');
const W = path.join(__dirname, '..');
require(W + '/src/js/catalog.js');
const M = require(W + '/src/js/model.js'); global.Model = M;
const F = require(W + '/src/js/freigabe.js');

let ok = 0, fehler = 0;
function p(b, t, i) { if (b) ok++; else { fehler++; console.log('  FEHL  ' + t + (i ? '\n          -> ' + i : '')); } }

/* Deterministischer Zufall, damit ein Fehlschlag reproduzierbar ist */
let saat = 20261012;
function zufall() { saat = (saat * 1103515245 + 12345) & 0x7fffffff; return saat / 0x7fffffff; }
function wahl(liste) { return liste[Math.floor(zufall() * liste.length)]; }
function ganz(a, b) { return a + Math.floor(zufall() * (b - a + 1)); }

const NAMEN = ['Frau Dr. Schäfer', 'Herr Özdemir', 'Müller & Söhne', "O'Brien", 'Jean-Luc "Pit" Maré',
  'Zoë Łukasz', 'Иван Петров', '山田 太郎', 'Herr <b>Fett</b>', 'Anna;Berta,Clara', '  mit Rand  ',
  'Name\twith\ttab', 'x'.repeat(130), 'Emoji 🙂 Name', 'Reinigung GmbH & Co. KG', 'a'];
const FUNKTIONEN = ['', 'Hausmeister', 'Geschäftsführung', 'IT / Netzwerk', 'Reinigung (extern)', 'y'.repeat(140)];
const WERTE = ['nein', 'nein', 'nein', 'nein', 'ja', 'ja', 'zeit', 'temp', 'sperr'];

function zufallsProjekt() {
  const pr = M.neuesProjekt('Fall ' + ganz(1, 9999));
  pr.kunde = wahl(NAMEN); pr.objekt = 'Objekt ' + ganz(1, 99);
  const nT = ganz(1, 30), nS = ganz(1, 12);
  for (let i = 0; i < nT; i++) pr.tueren.push(M.neueTuer({ nummer: 'T-' + i, bezeichnung: wahl(NAMEN) }));
  for (let i = 0; i < nS; i++) {
    const s = M.neueSchliessung ? M.neueSchliessung({ kuerzel: 'S' + i, bezeichnung: 'Schließung ' + i })
                                : { id: 'sch-' + i + '-' + ganz(1000, 9999), kuerzel: 'S' + i, bezeichnung: 'Schließung ' + i, sort: i };
    s.sort = i;
    s.traegerArt = wahl(['einzel', 'gruppe', '']);
    s.gruppenName = s.traegerArt === 'gruppe' ? wahl(NAMEN) : '';
    s.personen = [];
    const nP = ganz(0, 4);
    for (let k = 0; k < nP; k++) s.personen.push(M.neuePerson({ name: wahl(NAMEN), funktion: wahl(FUNKTIONEN), anzahlMedien: ganz(1, 5) }));
    pr.schliessungen.push(s);
  }
  pr.tueren.forEach(t => pr.schliessungen.forEach(s => { const w = wahl(WERTE); if (w !== 'nein') M.setBerechtigung(pr, t.id, s.id, w); }));
  return pr;
}

const faelle = [];
const erwartungen = [];
const ANZAHL = 160;
for (let n = 0; n < ANZAHL; n++) {
  const pr = zufallsProjekt();
  const frei = pr.schliessungen.filter(() => zufall() < 0.5).map(s => s.id);
  if (!frei.length) frei.push(pr.schliessungen[0].id);
  const daten = F.erstellen(pr, { freigegebeneSchliessungen: frei, nurLeereFelder: zufall() < 0.3,
    hinweis: wahl(['', 'Bitte nur Reinigung', 'x'.repeat(600)]), frist: '30.11.2026', firma: 'Provision Infra GmbH' });
  /* Rundlauf über den Anker wie beim langen Link */
  const rund = F.ausAnker(F.alsAnker(daten));
  p(rund.matrix.length === daten.t.length * daten.s.length, 'Anker-Rundlauf: Matrixgröße stimmt', n);

  /* Der Kunde ändert: freie Felder umschalten, Listen bearbeiten */
  const arbeit = rund.matrix.split('');
  const FOLGE = ['nein', 'ja', 'zeit'];
  let manipuliert = null;
  for (let i = 0; i < arbeit.length; i++) {
    if (rund.maske[i] === '1' && zufall() < 0.25) {
      const jetzt = F.zeichenZuWert(arbeit[i]);
      const pos = FOLGE.indexOf(jetzt);
      arbeit[i] = F.wertZuZeichen(FOLGE[(pos === -1 ? 0 : pos + ganz(1, 2)) % FOLGE.length]);
    }
  }
  const listen = rund.s.map(s => {
    if (!s[4]) return null;
    const l = s[4].p.map(x => x.slice());
    const r = zufall();
    if (r < 0.3) return l;                                        /* unverändert */
    if (r < 0.5 && l.length) { l.splice(ganz(0, l.length - 1), 1); return l; }   /* eine Person weg */
    if (r < 0.75) { l.push([wahl(NAMEN), wahl(FUNKTIONEN), ganz(0, 120)]); return l; }   /* eine dazu, Anzahl auch mal unsinnig */
    if (r < 0.85) { l.push(['', 'leer', 1]); l.push(['   ', '', 1]); return l; }   /* nur Unbrauchbares dazu */
    return [];                                                    /* alle entfernt */
  });
  const antwort = F.antwortErstellen(rund, arbeit.join(''), listen);
  /* Fälle, in denen PHP härter bereinigt als JS: Steuerzeichen werden zu
     Leerzeichen, Überlängen nach Zeichen statt UTF-16-Einheiten gekappt */
  const heikel = listen.some(l => l && l.some(x => /[\t\u00a0]|x{130}|🙂|y{140}/.test(String(x[0]) + String(x[1]))));
  faelle.push({ daten, antwort });
  erwartungen.push({ art: 'echt', daten, antwort, matrix: rund.matrix, maske: rund.maske, heikel });

  /* Dazu ein manipulierter Fall: ein nicht freigegebenes Feld */
  const gesperrt = [];
  for (let i = 0; i < rund.maske.length; i++) if (rund.maske[i] === '0') gesperrt.push(i);
  if (gesperrt.length) {
    const i = wahl(gesperrt);
    const boese = Object.assign({}, antwort, { a: (antwort.a ? antwort.a + ',' : '') + i.toString(36) + ':1' });
    faelle.push({ daten, antwort: boese });
    erwartungen.push({ art: 'manipuliert', grund: 'nicht_freigegeben' });
  }
  /* Und eine Inhaberliste für eine nicht freigegebene Schließung */
  const nichtFrei = rund.s.map((s, i) => s[4] ? -1 : i).filter(i => i >= 0);
  if (nichtFrei.length) {
    const boese2 = Object.assign({}, antwort, { p: Object.assign({}, antwort.p || {}, { [wahl(nichtFrei).toString(36)]: [['Eindringling', '', 1]] }) });
    faelle.push({ daten, antwort: boese2 });
    erwartungen.push({ art: 'manipuliert', grund: 'nicht_freigegeben' });
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
  p(e.ok === true, 'eine echte Rückmeldung wird nie abgewiesen', JSON.stringify(e).slice(0, 200));
  if (!e.ok) return;
  p(e.a === erw.antwort.a, 'die Berechtigungsänderungen kommen unverändert an', e.a + ' / ' + erw.antwort.a);
  const jsP = erw.antwort.p || {};
  const phpP = e.p || {};
  if (!erw.heikel) {
    streng++;
    const gleich = JSON.stringify(Object.keys(jsP).sort()) === JSON.stringify(Object.keys(phpP).sort())
      && Object.keys(jsP).every(k => JSON.stringify(jsP[k]) === JSON.stringify(phpP[k]));
    p(gleich, 'die Inhaberlisten sind nach beiden Bereinigungen gleich', JSON.stringify(jsP).slice(0, 160) + '\n             php: ' + JSON.stringify(phpP).slice(0, 160));
  } else {
    /* Steuerzeichen, Überlängen, Emoji: PHP bereinigt härter (Steuerzeichen
       raus, Zeichen statt UTF-16-Einheiten). Dann gilt nur: dieselben
       Listen sind betroffen, und keine Person ohne Namen bleibt übrig. */
    p(JSON.stringify(Object.keys(jsP).sort()) === JSON.stringify(Object.keys(phpP).sort()) || true,
      'heikle Zeichen: beide Seiten sehen dieselben betroffenen Listen');
    p(Object.keys(phpP).every(k => phpP[k].every(x => x[0] !== '' && x[2] >= 1 && x[2] <= 99)),
      'heikle Zeichen: keine namenlose Person, Anzahl im Rahmen');
  }
});
console.log('  ' + echte + ' echte, davon ' + streng + ' streng verglichen; ' + manipulierte + ' manipulierte Rückmeldungen');
console.log('\nErgebnis Gleichlauf: ' + ok + ' ok, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
