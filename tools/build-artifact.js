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
  'catalog.js', 'model.js', 'pdf.js', 'reports.js', 'store.js', 'verlauf.js', 'freigabe.js', 'pipedrive.js',
  'app.js', 'views-projekt.js', 'views-tueren.js', 'views-personen.js', 'views-plan.js', 'main.js'
];

fs.mkdirSync(path.join(ZIEL, 'js'), { recursive: true });
fs.mkdirSync(path.join(ZIEL, 'css'), { recursive: true });

SKRIPTE.forEach(d => fs.copyFileSync(path.join(QUELLE, 'js', d), path.join(ZIEL, 'js', d)));
fs.copyFileSync(path.join(QUELLE, 'css', 'app.css'), path.join(ZIEL, 'css', 'app.css'));

/* Die Darstellung wird vor dem ersten Bild festgelegt - sonst blitzt die
   helle Fassung auf, bevor das Programm die Einstellung gelesen hat.
   Dieselbe Weiche steht in src/index.html im Kopf der Seite; hier liefert
   die Umgebung den Kopf, deshalb steht sie am Anfang des Inhalts. */
const DARSTELLUNG = `<script>
(function () {
  var wahl = 'dunkel';
  try { wahl = localStorage.getItem('aufmass.erscheinungsbild') || wahl; } catch (e) {}
  if (wahl === 'geraet') {
    var dunkel = true;
    try { dunkel = matchMedia('(prefers-color-scheme: dark)').matches; } catch (e2) {}
    wahl = dunkel ? 'dunkel' : 'hell';
  }
  document.documentElement.setAttribute('data-darstellung', wahl === 'hell' ? 'hell' : 'dunkel');
})();
</script>`;

const seite = `<title>Aufmaß Schließanlagen</title>
${DARSTELLUNG}
<link rel="stylesheet" href="css/app.css">

<div id="app">
  <div style="padding:40px;text-align:center;color:#7b88a4;font:15px system-ui,sans-serif">
    Anwendung wird geladen …
  </div>
</div>

${SKRIPTE.map(d => '<script src="js/' + d + '"></script>').join('\n')}
`;
fs.writeFileSync(path.join(ZIEL, 'index.html'), seite, 'utf8');

/* Die Kundenseite wird unverändert übernommen: Sie ist eine eigenständige
   Seite mit eigenem Dokumentgerüst. */
fs.copyFileSync(path.join(QUELLE, 'freigabe.html'), path.join(ZIEL, 'freigabe.html'));
console.log('Fassung für die Veröffentlichung: dist/artifact/  (' +
  (SKRIPTE.length + 2) + ' Dateien)');
