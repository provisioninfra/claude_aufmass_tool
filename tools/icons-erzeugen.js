#!/usr/bin/env node
/* Erzeugt aus icon.svg die PNG-Symbole, die iOS und Android für einen
 * Eintrag auf dem Startbildschirm benötigen. iOS akzeptiert für
 * apple-touch-icon ausschließlich PNG und ignoriert Transparenz, deshalb
 * wird auf einen deckenden Hintergrund gezeichnet. */
const fs = require('fs'), path = require('path');
const { starte } = require('../tests/browser.js');

const QUELLE = path.join(__dirname, '..', 'src');
/* 180 = iPad/iPhone Startbildschirm, 192/512 = Android und Manifest */
const GROESSEN = [180, 192, 512];

(async () => {
  const svg = fs.readFileSync(path.join(QUELLE, 'icon.svg'), 'utf8');
  const browser = await starte();
  const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();

  for (const kante of GROESSEN) {
    const daten = await page.evaluate(async ([svgText, groesse]) => {
      const bild = new Image();
      const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
      await new Promise((fertig, fehler) => {
        bild.onload = fertig; bild.onerror = () => fehler(new Error('SVG nicht lesbar'));
        bild.src = url;
      });
      const c = document.createElement('canvas');
      c.width = groesse; c.height = groesse;
      const g = c.getContext('2d');
      g.fillStyle = '#1a4b8c';            /* deckend: iOS zeigt keine Transparenz */
      g.fillRect(0, 0, groesse, groesse);
      g.drawImage(bild, 0, 0, groesse, groesse);
      return c.toDataURL('image/png');
    }, [svg, kante]);

    const roh = Buffer.from(daten.split(',')[1], 'base64');
    const ziel = path.join(QUELLE, 'icon-' + kante + '.png');
    fs.writeFileSync(ziel, roh);
    console.log('  icon-' + kante + '.png  (' + Math.round(roh.length / 1024) + ' KB)');
  }
  await browser.close();
})();
