/* Erzeugt ein echtes Test-JPEG via Chromium-Canvas (wie die App es tut). */
const { starte } = require('./browser.js');
(async () => {
  const browser = await starte();
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0,0,640,480);
    grad.addColorStop(0,'#2a5d9e'); grad.addColorStop(1,'#c9d6e5');
    g.fillStyle = grad; g.fillRect(0,0,640,480);
    g.fillStyle = '#ffffff'; g.font = 'bold 46px sans-serif';
    g.fillText('TÜR-FOTO', 150, 230);
    g.fillStyle = '#1a1f26'; g.fillRect(80,300,180,120);
    g.strokeStyle='#fff'; g.lineWidth=6; g.strokeRect(80,300,180,120);
    return c.toDataURL('image/jpeg', 0.8);
  });
  await browser.close();
  require('fs').writeFileSync(__dirname + '/out/foto.txt', dataUrl);
  console.log('JPEG erzeugt, Länge:', dataUrl.length, 'Präfix:', dataUrl.slice(0,30));
})();
