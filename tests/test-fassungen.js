/* Prüft die veröffentlichten Fassungen gegen das Quellverzeichnis.
 *
 * Es gibt vier Ausgabewege: src/ (Entwicklung), dist/aufmass-tool.html
 * (Einzeldatei), dist/artifact/ (gehostet) und docs/ (GitHub Pages).
 * Jede davon muss alles enthalten, was ihre Seiten anfordern - eine
 * fehlende Datei fällt im Betrieb nur dadurch auf, dass etwas still
 * nicht mehr geht (so fehlte docs/sw.js, und damit der Offline-Betrieb). */
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'src');
let ok = 0, fehler = 0;
function pruefe(b, t, i) {
  if (b) { ok++; console.log('  OK   ' + t); }
  else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); }
}

/* Welche Dateien fordert eine Seite an? */
function angeforderteDateien(htmlPfad) {
  const html = fs.readFileSync(htmlPfad, 'utf8');
  const raus = new Set();
  const muster = [
    /<script[^>]+src="([^"]+)"/g,
    /<link[^>]+href="([^"]+)"/g,
    /navigator\.serviceWorker\.register\('([^']+)'\)/g
  ];
  muster.forEach(m => {
    let tr;
    while ((tr = m.exec(html)) !== null) {
      const ziel = tr[1];
      if (/^(https?:|data:|#|mailto:)/.test(ziel)) continue;
      raus.add(ziel.replace(/^\.\//, ''));
    }
  });
  return Array.from(raus);
}

/* Der Service Worker legt eine Liste an - auch die muss vorhanden sein. */
function swDateien(swPfad) {
  if (!fs.existsSync(swPfad)) return [];
  const text = fs.readFileSync(swPfad, 'utf8');
  const block = /DATEIEN\s*=\s*\[([\s\S]*?)\]/.exec(text) || /var\s+\w+\s*=\s*\[([\s\S]*?)\]/.exec(text);
  if (!block) return [];
  return (block[1].match(/'([^']+)'/g) || [])
    .map(s => s.slice(1, -1).replace(/^\.\//, ''))
    .filter(s => s && !/^https?:/.test(s));
}

console.log('\n== Veröffentlichte Fassungen ==');

/* --- 1. Die Verzeichnisfassungen: vollständig und inhaltsgleich ---------- */
[['docs', 'GitHub Pages'], ['dist/artifact', 'gehostete Fassung']].forEach(([ordner, name]) => {
  const ziel = path.join(WURZEL, ordner);
  if (!fs.existsSync(ziel)) { pruefe(false, name + ' ist vorhanden', ordner + ' fehlt'); return; }

  ['index.html', 'freigabe.html'].forEach(seite => {
    const seitenPfad = path.join(ziel, seite);
    if (!fs.existsSync(seitenPfad)) {
      /* dist/artifact hat bewusst keine eigene Freigabeseite */
      if (ordner === 'dist/artifact' && seite === 'freigabe.html') return;
      pruefe(false, name + ': ' + seite + ' vorhanden', 'fehlt');
      return;
    }
    const gefordert = angeforderteDateien(seitenPfad);
    const fehlend = gefordert.filter(d => !fs.existsSync(path.join(ziel, d)));
    pruefe(fehlend.length === 0,
      name + ': ' + seite + ' findet alle ' + gefordert.length + ' angeforderten Dateien',
      'fehlen: ' + fehlend.join(', '));
  });

  /* Der Service Worker muss seine eigene Liste ausliefern können */
  const sw = path.join(ziel, 'sw.js');
  if (fs.existsSync(path.join(ziel, 'index.html')) &&
      /serviceWorker\.register/.test(fs.readFileSync(path.join(ziel, 'index.html'), 'utf8'))) {
    pruefe(fs.existsSync(sw), name + ': der angemeldete Service Worker liegt auch dort',
      'sw.js fehlt, der Offline-Betrieb wäre still ohne Wirkung');
    const liste = swDateien(sw);
    const fehlendSw = liste.filter(d => !fs.existsSync(path.join(ziel, d)));
    pruefe(fehlendSw.length === 0, name + ': der Service Worker legt nur vorhandene Dateien ab (' + liste.length + ')',
      'fehlen: ' + fehlendSw.join(', '));
  }

  /* Inhaltsgleich mit der Quelle - sonst ist eine Fassung veraltet */
  function dateienUnter(wurzel, unter) {
    const voll = path.join(wurzel, unter || '');
    if (!fs.existsSync(voll)) return [];
    return fs.readdirSync(voll, { withFileTypes: true }).reduce((raus, e) => {
      const rel = path.join(unter || '', e.name);
      return raus.concat(e.isDirectory() ? dateienUnter(wurzel, rel) : [rel]);
    }, []);
  }
  const quellDateien = dateienUnter(QUELLE, '');
  const abweichend = [], nichtDa = [];
  /* dist/artifact/index.html wird eigens erzeugt: Dort liefert die Umgebung
     das Dokumentgerüst, die Seite enthält nur den Inhalt. */
  const eigenErzeugt = ordner === 'dist/artifact' ? ['index.html'] : [];
  quellDateien.forEach(rel => {
    /* Nur das vergleichen, was diese Fassung überhaupt mitbringt */
    if (eigenErzeugt.indexOf(rel) !== -1) return;
    const dort = path.join(ziel, rel);
    if (!fs.existsSync(dort)) return;
    if (!fs.readFileSync(path.join(QUELLE, rel)).equals(fs.readFileSync(dort))) abweichend.push(rel);
  });
  pruefe(abweichend.length === 0, name + ': alle übernommenen Dateien sind auf dem Stand der Quelle',
    'abweichend: ' + abweichend.join(', '));

  /* Jede Datei, die die Quelle ausliefert, muss auch hier liegen.
     Das gilt für docs/ - eine vollständige Spiegelung von src/.
     dist/artifact wird dagegen eigens erzeugt (tools/build-artifact.js)
     und lässt den Abgleich bewusst weg: Dort gibt es keinen eigenen
     Server, den das Werkzeug fragen könnte. Diese Fassung wird oben
     gegen ihre EIGENE index.html geprüft. */
  if (ordner === 'docs') {
    const quellGefordert = ['index.html', 'freigabe.html']
      .filter(s => fs.existsSync(path.join(QUELLE, s)))
      .reduce((raus, s) => raus.concat(angeforderteDateien(path.join(QUELLE, s))), [])
      .concat(['sw.js']);
    Array.from(new Set(quellGefordert)).forEach(d => {
      if (!fs.existsSync(path.join(QUELLE, d))) return;
      if (!fs.existsSync(path.join(ziel, d))) nichtDa.push(d);
    });
    pruefe(nichtDa.length === 0, name + ': keine von der Quelle ausgelieferte Datei fehlt',
      'fehlen: ' + nichtDa.join(', '));
  }
});

/* --- 1a. Die gehostete Fassung kennt bewusst keinen Abgleich ------------- */
const artOrdner = path.join(WURZEL, 'dist', 'artifact');
if (fs.existsSync(path.join(artOrdner, 'index.html'))) {
  const seite = fs.readFileSync(path.join(artOrdner, 'index.html'), 'utf8');
  pruefe(seite.indexOf('abgleich') === -1,
    'gehostete Fassung: bindet den Abgleich nicht ein (dort gibt es keinen eigenen Server)');
  pruefe(!fs.existsSync(path.join(artOrdner, 'js', 'abgleich.js')),
    'gehostete Fassung: liefert die Abgleichdateien auch nicht mit aus');
}

/* --- 1b. Die eigens erzeugte Seite muss die Darstellung vorab setzen ----- */
const artSeite = path.join(WURZEL, 'dist', 'artifact', 'index.html');
if (fs.existsSync(artSeite)) {
  const text = fs.readFileSync(artSeite, 'utf8');
  pruefe(text.indexOf("setAttribute('data-darstellung'") !== -1,
    'gehostete Fassung: die Darstellung wird vor dem ersten Bild gesetzt',
    'ohne diese Weiche blitzt die helle Fassung auf');
  pruefe(text.indexOf('#5c6670') === -1,
    'gehostete Fassung: der Ladehinweis nutzt keine Farbe von vor der Umstellung');
}

/* --- 1c. Die Fassung für den Webserver ----------------------------------- */
const onlineOrdner = path.join(WURZEL, 'dist', 'aufmasstool');
if (!fs.existsSync(onlineOrdner)) {
  pruefe(false, 'Fassung für den Webserver vorhanden', 'dist/aufmasstool fehlt - "node tools/build-online.js" ausführen');
} else {
  const seite = path.join(onlineOrdner, 'index.html');
  const gefordert = angeforderteDateien(seite);
  const fehlend = gefordert.filter(d => !fs.existsSync(path.join(onlineOrdner, d)));
  pruefe(fehlend.length === 0,
    'Webserver-Fassung: alle ' + gefordert.length + ' angeforderten Dateien sind da',
    'fehlen: ' + fehlend.join(', '));
  const text = fs.readFileSync(seite, 'utf8');
  pruefe(/js\/abgleich\.js/.test(text) && /js\/zusammenfuehren\.js/.test(text) && /js\/abgleich-ui\.js/.test(text),
    'Webserver-Fassung: der Abgleich ist eingebunden');
  pruefe(fs.existsSync(path.join(onlineOrdner, 'sw.js')),
    'Webserver-Fassung: der Service Worker liegt dabei (Offline-Betrieb)');
  const sw = fs.readFileSync(path.join(onlineOrdner, 'sw.js'), 'utf8');
  pruefe(/\/wp-json\//.test(sw),
    'Webserver-Fassung: der Service Worker nimmt die Schnittstelle vom Zwischenspeicher aus',
    'sonst käme die Projektliste von gestern');
  const swFehlt = swDateien(path.join(onlineOrdner, 'sw.js'))
    .filter(d => !fs.existsSync(path.join(onlineOrdner, d)));
  pruefe(swFehlt.length === 0, 'Webserver-Fassung: der Service Worker legt nur Vorhandenes ab',
    'fehlen: ' + swFehlt.join(', '));
  /* Alle Quelldateien müssen auf dem aktuellen Stand sein */
  const alt = [];
  ['index.html', 'css/app.css', 'js/abgleich.js', 'js/zusammenfuehren.js', 'js/abgleich-ui.js',
   'js/main.js', 'js/app.js', 'js/store.js', 'sw.js'].forEach(d => {
    if (!fs.readFileSync(path.join(QUELLE, d)).equals(fs.readFileSync(path.join(onlineOrdner, d)))) { alt.push(d); }
  });
  pruefe(alt.length === 0, 'Webserver-Fassung: auf dem Stand der Quelle', 'veraltet: ' + alt.join(', '));
}

/* --- 1d. Das Plugin zum Hochladen ---------------------------------------- */
const pluginZip = path.join(WURZEL, 'dist', 'aufmass-abgleich-plugin.zip');
if (!fs.existsSync(pluginZip)) {
  pruefe(false, 'Plugin-ZIP vorhanden', 'dist/aufmass-abgleich-plugin.zip fehlt');
} else {
  const roh = fs.readFileSync(pluginZip);
  pruefe(roh.readUInt32LE(0) === 0x04034b50, 'Plugin-ZIP: gültiger Dateianfang');
  /* Abschlusssatz suchen und die Einträge zählen */
  let ende = -1;
  for (let i = roh.length - 22; i >= 0 && ende < 0; i--) {
    if (roh.readUInt32LE(i) === 0x06054b50) { ende = i; }
  }
  pruefe(ende >= 0, 'Plugin-ZIP: Abschlusssatz vorhanden');
  if (ende >= 0) {
    const anzahl = roh.readUInt16LE(ende + 10);
    const inQuelle = (function zaehlen(o) {
      return fs.readdirSync(o, { withFileTypes: true })
        .filter(e => e.name !== '.DS_Store')
        .reduce((n, e) => n + (e.isDirectory() ? zaehlen(path.join(o, e.name)) : 1), 0);
    })(path.join(WURZEL, 'server', 'aufmass-sync'));
    pruefe(anzahl === inQuelle,
      'Plugin-ZIP: enthält alle ' + inQuelle + ' Dateien des Plugins', 'im Archiv: ' + anzahl);
  }
  /* Die Hauptdatei muss im Archiv zu finden sein - sonst erkennt
     WordPress das Paket nicht als Plugin. */
  pruefe(roh.includes(Buffer.from('aufmass-sync/aufmass-sync.php')),
    'Plugin-ZIP: die Hauptdatei liegt im erwarteten Unterordner');
}

/* --- 2. Die Einzeldateien: eigenständig und gleich ----------------------- */
const einzel = [
  [path.join(WURZEL, 'dist', 'aufmass-tool.html'), 'dist/aufmass-tool.html'],
  [path.join(WURZEL, 'docs', 'aufmass-tool-einzeldatei.html'), 'docs/aufmass-tool-einzeldatei.html']
];
const inhalte = [];
einzel.forEach(([pfad, name]) => {
  if (!fs.existsSync(pfad)) { pruefe(false, name + ' ist vorhanden', 'fehlt'); return; }
  const text = fs.readFileSync(pfad, 'utf8');
  inhalte.push(text);
  pruefe(!/<script[^>]+src=|<link[^>]+href="(?!data:)[^"]*\.css"/.test(text),
    name + ': lädt keine Datei von außen nach');
  pruefe(text.indexOf('serviceWorker') === -1, name + ': enthält keine Service-Worker-Anmeldung');
  /* Die Einzeldatei ist die Fassung ohne Server. Sie darf den Abgleich
     nicht mitbringen - sonst verlangte sie unterwegs eine Anmeldung. */
  pruefe(text.indexOf('global.Abgleich = {') === -1 && text.indexOf('global.AbgleichUI = {') === -1,
    name + ': enthält keinen Abgleich');
  pruefe(text.indexOf('accounts.google.com') === -1,
    name + ': kennt keine Google-Anmeldung');
  /* Alle Module müssen enthalten sein */
  ['Katalog', 'Model', 'PDF', 'Reports', 'Store', 'Verlauf', 'Freigabe', 'Pipedrive',
   'AppKern', 'ViewsProjekt', 'ViewsTueren', 'ViewsPlan'].forEach(m => {
    if (text.indexOf('global.' + m + ' =') === -1 && text.indexOf('global.' + m + '=') === -1) {
      pruefe(false, name + ': enthält das Modul ' + m);
    }
  });
  pruefe(true, name + ': enthält alle Module');
});
if (inhalte.length === 2) {
  pruefe(inhalte[0] === inhalte[1], 'beide Einzeldateien sind identisch',
    'Längen: ' + inhalte[0].length + ' / ' + inhalte[1].length);
}

/* --- 3. Die Einzeldatei ist auf dem Stand der Quelle --------------------- */
if (inhalte.length) {
  const css = fs.readFileSync(path.join(QUELLE, 'css', 'app.css'), 'utf8');
  pruefe(inhalte[0].indexOf(css.trim().slice(0, 400)) !== -1,
    'die Einzeldatei enthält das aktuelle Stylesheet');
  ['catalog.js', 'model.js', 'app.js', 'views-tueren.js', 'views-plan.js', 'reports.js'].forEach(d => {
    const js = fs.readFileSync(path.join(QUELLE, 'js', d), 'utf8');
    /* Eine kennzeichnende Zeile aus der Mitte der Datei */
    const zeilen = js.split('\n').filter(z => z.trim().length > 40 && !/^\s*[*\/]/.test(z));
    const probe = zeilen[Math.floor(zeilen.length / 2)];
    pruefe(probe && inhalte[0].indexOf(probe) !== -1,
      'die Einzeldatei enthält den aktuellen Stand von ' + d,
      'vermisste Zeile: ' + String(probe).trim().slice(0, 70));
  });
}

console.log('\nErgebnis Fassungen: ' + ok + ' ok, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
