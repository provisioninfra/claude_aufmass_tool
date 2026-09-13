/* Gemeinsamer Zugriff auf den vorinstallierten Chromium. */
const { execSync } = require('child_process');
const PW = execSync('npm root -g').toString().trim() + '/playwright';
const { chromium } = require(PW);
const EXE = '/opt/pw-browsers/chromium';
async function starte(opt = {}) {
  return chromium.launch(Object.assign({ executablePath: EXE, args: ['--no-sandbox'] }, opt));
}
module.exports = { starte, chromium, EXE };
