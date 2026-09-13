#!/usr/bin/env node
/* Erzeugt die Fassung für die gehostete Veröffentlichung.
 * Dort liefert die Umgebung das Dokumentgerüst (doctype/html/head/body),
 * deshalb wird hier nur der Seiteninhalt ausgegeben. Programm und
 * Gestaltung liegen als eigene Dateien daneben. */
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'src');
const ZIEL = path.join(WURZEL, 'dist', 'artifact');

const SKRIPTE = [
  'catalog.js', 'model.js', 'pdf.js', 'reports.js', 'store.js', 'verlauf.js',
  'app.js', 'views-projekt.js', 'views-tueren.js', 'views-plan.js', 'main.js'
];

fs.mkdirSync(path.join(ZIEL, 'js'), { recursive: true });
fs.mkdirSync(path.join(ZIEL, 'css'), { recursive: true });

SKRIPTE.forEach(d => fs.copyFileSync(path.join(QUELLE, 'js', d), path.join(ZIEL, 'js', d)));
fs.copyFileSync(path.join(QUELLE, 'css', 'app.css'), path.join(ZIEL, 'css', 'app.css'));

const seite = `<title>Aufmaß Schließanlagen</title>
<link rel="stylesheet" href="css/app.css">

<div id="app">
  <div style="padding:40px;text-align:center;color:#5c6670;font:15px system-ui,sans-serif">
    Anwendung wird geladen …
  </div>
</div>

${SKRIPTE.map(d => '<script src="js/' + d + '"></script>').join('\n')}
`;
fs.writeFileSync(path.join(ZIEL, 'index.html'), seite, 'utf8');
console.log('Fassung für die Veröffentlichung: dist/artifact/  (' +
  (SKRIPTE.length + 2) + ' Dateien)');
