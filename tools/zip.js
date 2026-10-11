/* Ein kleiner ZIP-Schreiber.
 *
 * Nur so viel, wie zum Verpacken des Plugins nötig ist: Einträge mit
 * deflate, lokale Kopfsätze, zentrales Verzeichnis, Abschluss. Bewusst
 * ohne fremdes Paket - das Projekt kommt insgesamt ohne aus, und ein
 * mitgeschlepptes Paket müsste dauerhaft gepflegt werden. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* CRC-32, wie es das ZIP-Format verlangt */
const TABELLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
    t[i] = c;
  }
  return t;
})();
function crc32(puffer) {
  let c = -1;
  for (let i = 0; i < puffer.length; i++) { c = TABELLE[(c ^ puffer[i]) & 0xFF] ^ (c >>> 8); }
  return (c ^ -1) >>> 0;
}

/* MS-DOS-Zeit, die das Format seit 1980 mit sich führt */
function dosZeit(d) {
  const jahr = Math.max(1980, d.getFullYear());
  return {
    zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
    datum: ((jahr - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

function dateienSammeln(wurzel, unter) {
  const voll = path.join(wurzel, unter || '');
  return fs.readdirSync(voll, { withFileTypes: true }).reduce((raus, e) => {
    if (e.name === '.DS_Store') { return raus; }
    const rel = unter ? (unter + '/' + e.name) : e.name;
    return raus.concat(e.isDirectory() ? dateienSammeln(wurzel, rel) : [rel]);
  }, []);
}

/** Packt einen Ordner. Der Ordnername bleibt im Archiv erhalten. */
function packen(ordner, zielDatei) {
  const eltern = path.dirname(ordner);
  const name = path.basename(ordner);
  const dateien = dateienSammeln(ordner, '').map(r => name + '/' + r);

  const lokale = [];
  const zentrale = [];
  let versatz = 0;

  dateien.forEach(rel => {
    const quelle = path.join(eltern, rel);
    const roh = fs.readFileSync(quelle);
    const gepackt = zlib.deflateRawSync(roh, { level: 9 });
    const kleiner = gepackt.length < roh.length;
    const nutzen = kleiner ? gepackt : roh;
    const verfahren = kleiner ? 8 : 0;
    const nameRoh = Buffer.from(rel, 'utf8');
    const z = dosZeit(fs.statSync(quelle).mtime);
    const summe = crc32(roh);

    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0);
    kopf.writeUInt16LE(20, 4);              /* benötigte Fassung */
    kopf.writeUInt16LE(0x0800, 6);          /* Namen in UTF-8 */
    kopf.writeUInt16LE(verfahren, 8);
    kopf.writeUInt16LE(z.zeit, 10);
    kopf.writeUInt16LE(z.datum, 12);
    kopf.writeUInt32LE(summe, 14);
    kopf.writeUInt32LE(nutzen.length, 18);
    kopf.writeUInt32LE(roh.length, 22);
    kopf.writeUInt16LE(nameRoh.length, 26);
    kopf.writeUInt16LE(0, 28);
    lokale.push(kopf, nameRoh, nutzen);

    const eintrag = Buffer.alloc(46);
    eintrag.writeUInt32LE(0x02014b50, 0);
    eintrag.writeUInt16LE(20, 4);           /* erzeugt von */
    eintrag.writeUInt16LE(20, 6);
    eintrag.writeUInt16LE(0x0800, 8);
    eintrag.writeUInt16LE(verfahren, 10);
    eintrag.writeUInt16LE(z.zeit, 12);
    eintrag.writeUInt16LE(z.datum, 14);
    eintrag.writeUInt32LE(summe, 16);
    eintrag.writeUInt32LE(nutzen.length, 20);
    eintrag.writeUInt32LE(roh.length, 24);
    eintrag.writeUInt16LE(nameRoh.length, 28);
    eintrag.writeUInt32LE(versatz, 42);
    zentrale.push(eintrag, nameRoh);

    versatz += kopf.length + nameRoh.length + nutzen.length;
  });

  const verzeichnis = Buffer.concat(zentrale);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(dateien.length, 8);
  ende.writeUInt16LE(dateien.length, 10);
  ende.writeUInt32LE(verzeichnis.length, 12);
  ende.writeUInt32LE(versatz, 16);

  fs.mkdirSync(path.dirname(zielDatei), { recursive: true });
  fs.writeFileSync(zielDatei, Buffer.concat(lokale.concat([verzeichnis, ende])));
  return { dateien: dateien.length, groesse: fs.statSync(zielDatei).size };
}

module.exports = { packen, crc32 };
