/* Gemeinsamer Zugriff auf den vorinstallierten Chromium. */
const { execSync } = require('child_process');
const PW = execSync('npm root -g').toString().trim() + '/playwright';
const { chromium } = require(PW);
const EXE = '/opt/pw-browsers/chromium';
async function starte(opt = {}) {
  return chromium.launch(Object.assign({ executablePath: EXE, args: ['--no-sandbox'] }, opt));
}
/* Öffnet das erste Projekt der Übersicht über die Oberfläche.
 * Seit der Umstellung ist beim Start bewusst kein Projekt aktiv. */
async function ersteProjektOeffnen(page, timeout = 8000) {
  await page.waitForSelector('.projekt-karte, .leer', { timeout });
  const karte = await page.$('.projekt-karte button:has-text("Öffnen")');
  if (!karte) return false;
  await karte.click();
  await page.waitForSelector('nav.reiter button[aria-selected=true]:has-text("Türen")', { timeout });
  await page.waitForTimeout(250);
  return true;
}

/* Geräusche der Prüfumgebung, die nicht vom Werkzeug stammen: Googles
   Anmeldeskript und sein CDN sind hier oft nicht erreichbar (Proxy, kein
   Netz); dann scheitert das Skript in sich selbst ("gis is not defined").
   Text und Fundstelle einer Konsolenmeldung bzw. Meldung und Stapel eines
   Seitenfehlers werden gemeinsam geprüft. */
const UMGEBUNG = /gsi\/client|accounts\.google|gstatic\.com|ERR_CERT|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL_CONNECTION_FAILED|\bgis is not defined/;
function istUmgebungsGeraeusch(...teile) {
  return UMGEBUNG.test(teile.filter(Boolean).join(' '));
}

module.exports = { starte, chromium, EXE, ersteProjektOeffnen, istUmgebungsGeraeusch };
