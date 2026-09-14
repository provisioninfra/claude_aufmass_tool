/* Prüft die Pipedrive-Anbindung gegen einen simulierten Dienst:
 * Datenübernahme, Verknüpfung, Fehlerfälle und – besonders wichtig –
 * dass der Zugriffsschlüssel das Gerät nicht verlässt. */
const path = require('path');
const { starte, ersteProjektOeffnen } = require('./browser.js');
const SEITE = 'file://' + path.join(__dirname, '..', 'src', 'index.html');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

/* Antworten, wie Pipedrive sie liefert */
const ANTWORTEN = {
  '/api/v1/users/me': { success: true, data: {
    id: 42, name: 'M. Weber', email: 'weber@provision-infra.de',
    company_name: 'Provision Infra GmbH', company_id: 7, company_domain: 'provisioninfra' } },
  '/api/v2/pipelines': { success: true, data: [
    { id: 1, name: 'Vertrieb', order_nr: 1 },
    { id: 2, name: 'Neukunden Funnel', order_nr: 2 } ] },
  '/api/v2/stages': { success: true, data: [
    { id: 10, name: 'Erstkontakt', order_nr: 1, pipeline_id: 2 },
    { id: 11, name: 'Workshop / Aufmaß v.O.', order_nr: 2, pipeline_id: 2 },
    { id: 12, name: 'Angebot', order_nr: 3, pipeline_id: 2 } ] },
  '/api/v2/deals': { success: true, data: [
    { id: 5001, title: 'Schließanlage Bürogebäude Königsallee', value: 18500, currency: 'EUR',
      pipeline_id: 2, stage_id: 11, status: 'open', org_id: 301, person_id: 901,
      add_time: '2026-09-01T09:00:00Z', update_time: '2026-09-12T14:20:00Z' },
    { id: 5002, title: 'Wohnanlage Nordpark – 40 Türen', value: 32000, currency: 'EUR',
      pipeline_id: 2, stage_id: 11, status: 'open', org_id: 302, person_id: null,
      add_time: '2026-09-05T08:00:00Z', update_time: '2026-09-11T10:00:00Z' },
    { id: 5003, title: 'Noch im Erstkontakt – kein Aufmaß', value: 9000, currency: 'EUR',
      pipeline_id: 2, stage_id: 10, status: 'open', org_id: 301, person_id: null,
      add_time: '2026-09-08T08:00:00Z', update_time: '2026-09-13T10:00:00Z' } ] },
  '/api/v2/organizations/301': { success: true, data: {
    id: 301, name: 'Müller & Söhne Immobilienverwaltung GmbH',
    address: { route: 'Königsallee', street_number: '47', postal_code: '40212',
               locality: 'Düsseldorf', country: 'Deutschland' },
    'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678': 'Bestandsobjekt' } },
  '/api/v2/organizations/302': { success: true, data: {
    id: 302, name: 'Nordpark Wohnbau eG',
    address: 'Parkstraße 8, 40468 Düsseldorf' } },
  '/api/v2/persons/901': { success: true, data: {
    id: 901, name: 'Frau Dr. Schäfer', first_name: 'Anna', last_name: 'Schäfer',
    phones: [{ value: '0211/554433-0', primary: true }],
    emails: [{ value: 'schaefer@mueller-soehne.example', primary: true }], org_id: 301 } }
};

(async () => {
  const browser = await starte();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const konsolenFehler = [];
  page.on('pageerror', e => konsolenFehler.push(e.message));

  /* Simulierter Dienst: hält fest, was angefragt wurde */
  const anfragen = [];
  let antwortModus = 'gut';
  await ctx.route('**://*.pipedrive.com/**', async route => {
    const url = new URL(route.request().url());
    anfragen.push({
      pfad: url.pathname, verfahren: route.request().method(),
      schluessel: route.request().headers()['x-api-token'] || '',
      suchteil: url.search
    });
    if (antwortModus === 'schluessel-falsch') {
      return route.fulfill({ status: 401, contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'invalid token' }) });
    }
    if (antwortModus === 'nicht-erreichbar') return route.abort('failed');
    const daten = ANTWORTEN[url.pathname];
    if (!daten) return route.fulfill({ status: 404, contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'not found' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(daten) });
  });

  console.log('\n== Pipedrive-Anbindung ==');
  await page.goto(SEITE, { waitUntil: 'load' });
  await page.waitForSelector('header.kopf');

  /* --- Verbindung in den Einstellungen --- */
  await page.evaluate(() => window.App.wechseln('einstellungen'));
  await page.waitForTimeout(400);
  const pdAbschnitt = await page.$$eval('h2', hs => hs.map(h => h.textContent));
  pruefe(pdAbschnitt.includes('Pipedrive'), 'Pipedrive-Abschnitt in den Einstellungen');

  const warnung = await page.textContent('.karte:has(h2:text("Pipedrive")) .meldung.warn');
  pruefe(/nicht auf reines Lesen beschränken/.test(warnung),
    'die Rechte-Einschränkung wird offen benannt', warnung.trim().slice(0, 70));

  await page.fill('input[type=password]', 'test-schluessel-123');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Verbindung prüfen")');
  await page.waitForSelector('.meldung.ok', { timeout: 8000 });
  const erfolg = await page.textContent('.meldung.ok');
  pruefe(/M\. Weber/.test(erfolg), 'Verbindung wird geprüft und der Benutzer angezeigt', erfolg.trim().slice(0, 60));

  const pipelineAuswahl = await page.$$eval('select option', os => os.map(o => o.textContent));
  pruefe(pipelineAuswahl.includes('Neukunden Funnel'), 'die Pipelines werden geladen');

  const pipelineWahl = page.locator('select').filter({ has: page.locator('option:text("Neukunden Funnel")') }).first();
  await pipelineWahl.selectOption({ label: 'Neukunden Funnel' });
  await page.waitForTimeout(800);

  /* --- Phase festlegen --- */
  const phasenWahl = page.locator('select').filter({
    has: page.locator('option:text("Workshop / Aufmaß v.O.")') }).first();
  const phasen = await phasenWahl.locator('option').allTextContents();
  pruefe(phasen.includes('Workshop / Aufmaß v.O.'), 'die Phasen der Pipeline werden geladen',
    phasen.join(' | '));
  await phasenWahl.selectOption({ label: 'Workshop / Aufmaß v.O.' });
  await page.waitForTimeout(500);
  const regel = await page.textContent('.regel-anzeige');
  pruefe(/Workshop \/ Aufmaß v\.O\./.test(regel) && /noch kein Aufmaß/.test(regel),
    'die Übernahmeregel wird im Klartext angezeigt', regel.trim().slice(0, 110));

  /* --- Deal übernehmen --- */
  await page.evaluate(() => window.App.wechseln('projekte'));
  await page.waitForTimeout(400);
  const pdKnopf = await page.$('button:has-text("Aus Pipedrive")');
  pruefe(!!pdKnopf, 'der Knopf „Aus Pipedrive“ erscheint nach dem Verbinden');

  await pdKnopf.click();
  await page.waitForSelector('.dialog .deal-offen .tuer-zeile', { timeout: 8000 });
  const dealZeilen = await page.$$eval('.dialog .deal-offen .tuer-zeile', n => n.length);
  pruefe(dealZeilen === 2, 'nur Deals der festgelegten Phase werden angeboten (' + dealZeilen + ' von 3)');
  const titelListe = await page.$$eval('.dialog .deal-offen .tuer-zeile .bez', n => n.map(x => x.textContent));
  pruefe(!titelListe.some(t => /Erstkontakt/.test(t)),
    'ein Deal aus einer anderen Phase wird nicht angeboten', titelListe.join(' | '));
  const ersterDeal = await page.textContent('.dialog .tuer-zeile .bez');
  pruefe(/Königsallee/.test(ersterDeal), 'Dealtitel wird angezeigt', ersterDeal.trim());

  const gefiltert = anfragen.filter(a => a.pfad === '/api/v2/deals');
  const letzteAbfrage = gefiltert.length ? gefiltert[gefiltert.length - 1].suchteil : '';
  pruefe(/pipeline_id=2/.test(letzteAbfrage), 'die Pipeline wird als Filter mitgegeben', letzteAbfrage);
  pruefe(/stage_id=11/.test(letzteAbfrage), 'die Phase wird als Filter mitgegeben', letzteAbfrage);

  await page.click('.dialog .deal-offen .tuer-zeile');
  await page.waitForSelector('nav.reiter button[aria-selected=true]:text("Stammdaten")', { timeout: 8000 });
  await page.waitForTimeout(600);

  /* --- Übernommene Daten prüfen --- */
  const werte = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    return { kunde: p.kunde, strasse: p.strasse, plz: p.plz, ort: p.ort,
             ansprechpartner: p.ansprechpartner, telefon: p.telefon, email: p.email,
             objekt: p.objekt, pipedrive: p.pipedrive };
  });
  pruefe(werte.kunde === 'Müller & Söhne Immobilienverwaltung GmbH', 'Firmenname übernommen', werte.kunde);
  pruefe(werte.strasse === 'Königsallee 47', 'Straße aus dem Adressobjekt', werte.strasse);
  pruefe(werte.plz === '40212' && werte.ort === 'Düsseldorf', 'PLZ und Ort übernommen',
    werte.plz + ' ' + werte.ort);
  pruefe(werte.ansprechpartner === 'Frau Dr. Schäfer', 'Ansprechpartner übernommen', werte.ansprechpartner);
  pruefe(werte.telefon === '0211/554433-0', 'Telefon der Hauptnummer übernommen', werte.telefon);
  pruefe(/schaefer@/.test(werte.email), 'E-Mail übernommen', werte.email);
  pruefe(werte.pipedrive && werte.pipedrive.dealId === 5001, 'Deal ist verknüpft',
    JSON.stringify(werte.pipedrive && werte.pipedrive.dealId));
  pruefe(werte.pipedrive && werte.pipedrive.orgId === 301, 'Organisation ist verknüpft');
  pruefe(werte.pipedrive && /\/deal\/5001$/.test(werte.pipedrive.dealLink || ''),
    'Link zurück zum Deal wird erzeugt', werte.pipedrive && werte.pipedrive.dealLink);

  const verknuepfung = await page.textContent('.meldung.info');
  pruefe(/Deal-Nr\. 5001/.test(verknuepfung), 'die Verknüpfung ist in den Stammdaten sichtbar');

  /* --- Der Schlüssel darf das Gerät nicht verlassen --- */
  console.log('\n== Zugriffsschlüssel bleibt auf dem Gerät ==');
  const nurGet = anfragen.every(a => a.verfahren === 'GET');
  pruefe(nurGet, 'ausschließlich lesende Abfragen an Pipedrive',
    anfragen.filter(a => a.verfahren !== 'GET').map(a => a.verfahren + ' ' + a.pfad).join(', '));
  const imHeader = anfragen.every(a => a.schluessel === 'test-schluessel-123');
  pruefe(imHeader, 'der Schlüssel wird im Kopf übergeben, nicht in der Adresse');
  const inAdresse = anfragen.some(a => /token|api_token/i.test(a.suchteil));
  pruefe(!inAdresse, 'der Schlüssel steht in keiner Adresse (bliebe sonst in Protokollen stehen)');

  const imProjekt = await page.evaluate(() =>
    JSON.stringify(window.AppKern.Zustand.projekt).indexOf('test-schluessel-123'));
  pruefe(imProjekt === -1, 'der Schlüssel steht in keinem Projekt');

  const imExport = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const e = window.AppKern.Zustand.einstellungen;
    return JSON.stringify(window.Store.exportDaten(p, e, false)).indexOf('test-schluessel-123');
  });
  pruefe(imExport === -1, 'der Schlüssel steht in keiner Exportdatei');

  const imFreigabelink = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    const d = window.Freigabe.erstellen(p, { freigegebeneSchliessungen: [] });
    return JSON.stringify(d).indexOf('test-schluessel-123');
  });
  pruefe(imFreigabelink === -1, 'der Schlüssel steht in keinem Freigabe-Link');

  /* --- Fehlerfälle --- */
  console.log('\n== Fehlerfälle ==');
  antwortModus = 'schluessel-falsch';
  await page.evaluate(() => window.App.wechseln('einstellungen'));
  await page.waitForTimeout(400);
  await page.click('button:has-text("Verbindung prüfen")');
  await page.waitForSelector('.meldung.fehler', { timeout: 8000 });
  const abgelehnt = await page.textContent('.meldung.fehler');
  pruefe(/abgelehnt/.test(abgelehnt), 'ein ungültiger Schlüssel wird verständlich gemeldet',
    abgelehnt.trim().slice(0, 70));
  pruefe(/Persönliche Einstellungen/.test(abgelehnt), 'die Meldung nennt den Weg zur Abhilfe');

  antwortModus = 'nicht-erreichbar';
  await page.evaluate(() => window.App.wechseln('einstellungen'));
  await page.waitForTimeout(400);
  await page.click('button:has-text("Verbindung prüfen")');
  await page.waitForSelector('.meldung.fehler', { timeout: 10000 });
  const keineVerbindung = await page.textContent('.meldung.fehler');
  pruefe(/Verbindung/.test(keineVerbindung), 'eine abgewiesene Abfrage wird gemeldet',
    keineVerbindung.trim().slice(0, 60));
  pruefe(/Zwischendienst/.test(keineVerbindung),
    'der Fall „Browser-Abfrage nicht erlaubt“ wird erklärt');

  /* --- Zweiter Deal ohne Ansprechpartner, Adresse als Text --- */
  antwortModus = 'gut';
  await page.evaluate(() => window.App.wechseln('projekte'));
  await page.waitForTimeout(500);
  await page.click('button:has-text("Aus Pipedrive")');
  await page.waitForSelector('.dialog .deal-offen .tuer-zeile', { timeout: 8000 });
  const zeilen = await page.$$('.dialog .deal-offen .tuer-zeile');
  const angeboten = await page.$$eval('.dialog .deal-offen .tuer-zeile .bez',
    n => n.map(x => x.textContent));
  pruefe(!angeboten.some(t => /Königsallee/.test(t)),
    'ein Deal mit vorhandenem Aufmaß wird nicht mehr angeboten', angeboten.join(' | '));
  const aufklapp = await page.textContent('.dialog details summary');
  pruefe(/Bereits übernommen/.test(aufklapp),
    'übernommene Deals stehen separat zum Nachschlagen', aufklapp.trim());
  await zeilen[0].click();
  await page.waitForTimeout(1200);
  const zweites = await page.evaluate(() => {
    const p = window.AppKern.Zustand.projekt;
    return { kunde: p.kunde, strasse: p.strasse, plz: p.plz, ort: p.ort,
             ansprechpartner: p.ansprechpartner };
  });
  pruefe(zweites.kunde === 'Nordpark Wohnbau eG', 'zweiter Deal übernommen', zweites.kunde);
  pruefe(zweites.strasse === 'Parkstraße 8' && zweites.plz === '40468',
    'eine als Text gelieferte Adresse wird zerlegt',
    JSON.stringify(zweites.strasse + ' / ' + zweites.plz + ' ' + zweites.ort));
  pruefe(zweites.ansprechpartner === '', 'ein fehlender Ansprechpartner stört nicht');

  /* --- Die Regel im Einzelnen --- */
  console.log('\n== Übernahmeregel ==');
  const regelFaelle = await page.evaluate(() => {
    const e = { pipedrivePipelineId: '2', pipedrivePhaseId: '11' };
    const projekte = [{ id: 'x', pipedrive: { dealId: 7001 } }];
    const f = [
      [{ id: 7001, pipelineId: 2, phaseId: 11, status: 'open' }, 'Aufmaß liegt vor'],
      [{ id: 7002, pipelineId: 2, phaseId: 11, status: 'open' }, 'in Phase, ohne Aufmaß'],
      [{ id: 7003, pipelineId: 2, phaseId: 12, status: 'open' }, 'andere Phase'],
      [{ id: 7004, pipelineId: 1, phaseId: 11, status: 'open' }, 'andere Pipeline'],
      [{ id: 7005, pipelineId: 2, phaseId: 11, status: 'won' }, 'bereits gewonnen'],
      [{ id: 7006, pipelineId: 2, phaseId: 11, status: 'lost' }, 'verloren']
    ];
    return f.map(([deal, bez]) => {
      const r = window.Pipedrive.istZuUebernehmen(deal, e, projekte);
      return { bez, uebernehmen: r.uebernehmen, grund: r.grund };
    });
  });
  const erwartet = { 'Aufmaß liegt vor': false, 'in Phase, ohne Aufmaß': true, 'andere Phase': false,
                     'andere Pipeline': false, 'bereits gewonnen': false, 'verloren': false };
  regelFaelle.forEach(f => {
    pruefe(f.uebernehmen === erwartet[f.bez],
      'Regel: ' + f.bez + ' → ' + (f.uebernehmen ? 'übernehmen' : f.grund));
  });

  pruefe(konsolenFehler.length === 0, 'keine JavaScript-Fehler', konsolenFehler.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\nErgebnis Pipedrive: ${ok} ok, ${fehler} Fehler`);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Abbruch:', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
