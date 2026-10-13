/* Erzeugt aus website/<seite>/index.html die Fassung zum Einfügen in
 * WordPress: nur der Seiteninhalt zwischen den Marken „INHALT ANFANG" und
 * „INHALT ENDE" samt dem Stilblock id="seite". Kopf, Fuß und Schrift kommen
 * in WordPress vom Theme.
 *
 * Aufruf: node tools/website-wordpress.js [website/einbruchschutz-privat]
 */
const fs = require('fs');
const path = require('path');

const ordner = process.argv[2] || path.join('website', 'einbruchschutz-privat');
const quelle = path.join(ordner, 'index.html');
const ziel = path.join(ordner, 'wordpress-inhalt.html');

const html = fs.readFileSync(quelle, 'utf8');

const stil = /<style id="seite">([\s\S]*?)<\/style>/.exec(html);
const inhalt = /<!-- INHALT ANFANG -->([\s\S]*?)<!-- INHALT ENDE -->/.exec(html);
if (!stil) throw new Error(quelle + ': Stilblock <style id="seite"> fehlt');
if (!inhalt) throw new Error(quelle + ': Marken INHALT ANFANG / INHALT ENDE fehlen');

/* Einrückung des Stilblocks um eine Stufe zurücknehmen */
const css = stil[1].replace(/^ {2}/gm, '').replace(/^\n+|\s+$/g, '');

const ausgabe = [
  '<!-- Einbruchschutz für Haus und Wohnung | provision-infra.de',
  '',
  '     Zum Einfügen in WordPress: Block „Individuelles HTML" (oder Code-Editor,',
  '     bei Elementor das Widget „HTML"). Den gesamten Inhalt dieser Datei',
  '     einfügen. Kopf, Fuß, Menü und Schrift kommen vom Theme der Website.',
  '',
  '     Erzeugt aus index.html mit tools/website-wordpress.js; Änderungen dort',
  '     machen und neu erzeugen. -->',
  '<style>',
  css,
  '</style>',
  inhalt[1].trim(),
  ''
].join('\n');

fs.writeFileSync(ziel, ausgabe);
console.log(ziel + ': ' + ausgabe.length + ' Zeichen, ' + ausgabe.split('\n').length + ' Zeilen');
