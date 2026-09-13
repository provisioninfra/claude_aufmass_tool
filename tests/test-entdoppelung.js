/* Weist nach, dass keine Angabe zweimal erfasst werden muss, und dass
 * Aufmaße aus der früheren Fassung vollständig überführt werden. */
const K = require('../src/js/catalog.js');
const M = require('../src/js/model.js');

let ok = 0, fehler = 0;
function pruefe(b, t, i) { if (b) { ok++; console.log('  OK   ' + t); } else { fehler++; console.log('  FEHL ' + t + (i ? '\n         -> ' + i : '')); } }

console.log('\n== Keine Doppelauswahl ==');

/* --- 1. Jede Auswahlliste beschreibt genau eine Dimension --- */
const listen = {
  ZYLINDER_BAUFORM: K.ZYLINDER_BAUFORM,
  ZYLINDER_AUSFUEHRUNG: K.ZYLINDER_AUSFUEHRUNG,
  BESCHLAG_BAUFORM: K.BESCHLAG_BAUFORM,
  BESCHLAG_BESTUECKUNG: K.BESCHLAG_BESTUECKUNG,
  BESCHLAG_SICHERHEIT: K.BESCHLAG_SICHERHEIT,
  SCHLOSS_BAUFORM: K.SCHLOSS_BAUFORM,
  SCHLOSS_FUNKTION: K.SCHLOSS_FUNKTION,
  ZUTRITTSSEITE: K.ZUTRITTSSEITE,
  TUERANFORDERUNG: K.TUERANFORDERUNG
};

/* Begriffe, die jeweils genau einer Liste gehören dürfen */
const EIGENTUEMER = {
  'freidreh': 'ZYLINDER_AUSFUEHRUNG',
  'komfort': 'ZYLINDER_AUSFUEHRUNG',
  'anti-panik': 'ZYLINDER_AUSFUEHRUNG',
  'wetterschutz': 'ZYLINDER_AUSFUEHRUNG',
  'not- und gefahrenfunktion': 'ZYLINDER_AUSFUEHRUNG',
  'halbzylinder': 'ZYLINDER_BAUFORM',
  'doppelzylinder': 'ZYLINDER_BAUFORM',
  'rosetten': 'BESCHLAG_BAUFORM',
  'langschild': 'BESCHLAG_BAUFORM',
  'es1': 'BESCHLAG_SICHERHEIT',
  'es2': 'BESCHLAG_SICHERHEIT',
  'einsteckschloss': 'SCHLOSS_BAUFORM',
  'rohrrahmen': 'SCHLOSS_BAUFORM',
  'brandschutz': 'TUERANFORDERUNG',
  'rauchschutz': 'TUERANFORDERUNG'
};

let verstoesse = [];
Object.entries(EIGENTUEMER).forEach(([begriff, besitzer]) => {
  const gefundenIn = Object.entries(listen)
    .filter(([name, liste]) => liste.some(e => String(e).toLowerCase().includes(begriff)))
    .map(([name]) => name);
  if (gefundenIn.length > 1) {
    verstoesse.push(`"${begriff}" in ${gefundenIn.join(' + ')}`);
  } else if (gefundenIn.length === 1 && gefundenIn[0] !== besitzer) {
    verstoesse.push(`"${begriff}" erwartet in ${besitzer}, gefunden in ${gefundenIn[0]}`);
  }
});
pruefe(verstoesse.length === 0, 'kein Begriff steht in zwei Auswahllisten', verstoesse.join('\n         -> '));

/* --- 2. Technologie steckt nicht mehr in der Bauform --- */
const techInBauform = K.ZYLINDER_BAUFORM.filter(b => /elektronik|digital|mechanisch/i.test(b));
pruefe(techInBauform.length === 0, 'Zylinder-Bauform enthält keine Technologieangabe', techInBauform.join(', '));

/* --- 3. Keine "kein ..."-Einträge mehr (der Schalter deckt das ab) --- */
const negationen = Object.entries(listen)
  .flatMap(([n, l]) => l.filter(e => /^kein/i.test(String(e))).map(e => n + ': ' + e));
pruefe(negationen.length === 0, 'keine "Kein …"-Einträge neben den Schaltern', negationen.join(', '));

/* --- 4. Systemkomponenten wiederholen keine Bauform --- */
const kollisionen = [];
K.SYSTEME.forEach(sys => {
  (sys.komponenten || []).forEach(komp => {
    const k = String(komp).toLowerCase();
    if (/\b(doppelknauf|halbzylinder|doppelzylinder|freidreh|anti-panik|wetterschutz)\b/.test(k)) {
      kollisionen.push(K.systemLabel(sys.id) + ': ' + komp);
    }
  });
});
pruefe(kollisionen.length === 0, 'Systemkomponenten wiederholen keine Zylinderangabe', kollisionen.join('\n         -> '));

/* --- 5. Technologie wird abgeleitet, nicht gefragt --- */
const t = M.neueTuer();
pruefe(!('technologie' in t), 'Technologie ist kein Türfeld mehr (wird abgeleitet)');
pruefe(!('identmedien' in t), 'Identmedien sind kein Türfeld mehr (gehören zur Schließung)');
pruefe(K.systemTechnologie('evva-airkey') === 'elektronisch', 'Technologie wird korrekt aus dem System abgeleitet');
pruefe(K.systemTechnologie('evva-4ks') === 'mechanisch', 'Mechanik wird korrekt abgeleitet');

console.log('\n== Überführung älterer Aufmaße ==');

/* Ein Projekt, wie es die frühere Fassung gespeichert hat */
const alt = {
  id: 'prj-alt', name: 'Altbestand', tueren: [
    { id: 't1', nummer: 'A-01', bezeichnung: 'Haupteingang', brauchtZylinder: true,
      technologie: 'elektronisch', systemId: 'evva-airkey',
      zylinderArt: 'Elektronikzylinder Freidreh / Komfort',
      brauchtBeschlag: true, beschlagArt: 'Schutzbeschlag ES2',
      brauchtSchloss: true, schlossArt: 'Panikschloss Funktion E (Wechselfunktion)',
      zutrittsarten: ['Beidseitig (innen + außen)', 'Flucht- und Rettungsweg (Panik)', 'Brand- und Rauchschutz'],
      identmedien: ['Smartphone (App)'], masseAussen: '35', masseInnen: '40' },
    { id: 't2', nummer: 'A-02', bezeichnung: 'Abstellraum', brauchtZylinder: true,
      zylinderArt: 'Kein Zylinder', zutrittsarten: ['Einseitig (nur außen)'] },
    { id: 't3', nummer: 'A-03', bezeichnung: 'Büro', brauchtZylinder: true,
      zylinderArt: 'Doppelzylinder mit Not- und Gefahrenfunktion',
      brauchtBeschlag: true, beschlagArt: 'Rosettengarnitur Knauf/Drücker',
      masseAussen: '30', masseInnen: '35' }
  ],
  standorte: [], schliessungen: [], matrix: {}
};

const neu = M.migriere(JSON.parse(JSON.stringify(alt)));
const [n1, n2, n3] = neu.tueren;

pruefe(n1.zylinderBauform === 'Doppelknaufzylinder' &&
       n1.zylinderAusfuehrung.join() === 'Freidreh',
  'Zylinder: Bauform und Ausführung sauber getrennt, Sammelbegriff eindeutig aufgelöst',
  JSON.stringify({ b: n1.zylinderBauform, a: n1.zylinderAusfuehrung }));
pruefe(n1.beschlagBauform === 'Schutzbeschlag' && n1.beschlagSicherheit === 'ES2',
  'Beschlag: Bauform und Sicherheitsklasse getrennt',
  JSON.stringify({ b: n1.beschlagBauform, s: n1.beschlagSicherheit }));
pruefe(n1.schlossBauform === 'Einsteckschloss' && /Funktion E/.test(n1.schlossFunktion),
  'Schloss: Bauform und Panikfunktion getrennt',
  JSON.stringify({ b: n1.schlossBauform, f: n1.schlossFunktion }));
pruefe(n1.zutrittsseite === 'innen und außen',
  'Zutrittsseite aus der alten Mischliste gezogen', n1.zutrittsseite);
pruefe(n1.tueranforderungen.includes('Flucht- und Rettungsweg') &&
       n1.tueranforderungen.includes('Brandschutz') &&
       n1.tueranforderungen.includes('Rauchschutz'),
  '"Brand- und Rauchschutz" korrekt in zwei Anforderungen zerlegt',
  JSON.stringify(n1.tueranforderungen));
pruefe(n1.masseAussen === '35' && n1.masseInnen === '40', 'Maße bleiben unverändert erhalten');
pruefe(n2.brauchtZylinder === false, '"Kein Zylinder" wird zum ausgeschalteten Bauteil');
pruefe(n3.zylinderBauform === 'Doppelzylinder' &&
       n3.zylinderAusfuehrung.includes('Not- und Gefahrenfunktion'),
  'Not- und Gefahrenfunktion wird zur Ausführung',
  JSON.stringify({ b: n3.zylinderBauform, a: n3.zylinderAusfuehrung }));
pruefe(n3.beschlagBestueckung === 'Knauf / Drücker', 'Bestückung aus dem Beschlagstext gezogen', n3.beschlagBestueckung);

/* Keine Altfelder bleiben übrig */
const reste = neu.tueren.flatMap(t2 =>
  ['zylinderArt', 'beschlagArt', 'schlossArt', 'zutrittsarten', 'technologie', 'identmedien']
    .filter(f => f in t2).map(f => t2.nummer + '.' + f));
pruefe(reste.length === 0, 'keine Altfelder bleiben zurück', reste.join(', '));

/* Mehrfaches Überführen darf nichts verändern */
const zweimal = M.migriere(JSON.parse(JSON.stringify(neu)));
pruefe(JSON.stringify(zweimal.tueren) === JSON.stringify(neu.tueren),
  'erneutes Überführen ändert nichts mehr');

/* --- Anzeigetexte --- */
console.log('\n== Zusammengesetzte Bezeichnungen ==');
pruefe(K.zylinderText(n1) === 'Doppelknaufzylinder · Freidreh',
  'Zylindertext wird korrekt zusammengesetzt', K.zylinderText(n1));
pruefe(K.beschlagText(n1) === 'Schutzbeschlag ES2', 'Beschlagtext korrekt', K.beschlagText(n1));
pruefe(K.zylinderText({ brauchtZylinder: false, zylinderBauform: 'Doppelzylinder' }) === '',
  'ausgeschaltetes Bauteil erzeugt keinen Text');


console.log('\n== Schließsystem gilt für das ganze Projekt ==');

const t2 = M.neueTuer();
pruefe(!('systemId' in t2), 'die Tür trägt kein eigenes System mehr');
pruefe('tuerTechnologie' in t2, 'die Tür trägt nur noch die Hybrid-Entscheidung');

const projekt = M.neuesProjekt('Anlagentest');
const tuer = M.neueTuer({ nummer: 'T1' });
projekt.tueren.push(tuer);

projekt.anlagenart = 'mechanik'; projekt.systemMechanik = 'evva-4ks';
pruefe(M.tuerSystemId(projekt, tuer) === 'evva-4ks',
  'reine Mechanik: System kommt ohne Zutun aus dem Projekt');
pruefe(M.tuerTechnologie(projekt, tuer) === 'mechanik', 'Technologie folgt der Anlagenart');
pruefe(M.anlageVollstaendig(projekt), 'Mechanikanlage ist vollständig');

projekt.anlagenart = 'elektronik'; projekt.systemElektronik = 'evva-airkey';
pruefe(M.tuerSystemId(projekt, tuer) === 'evva-airkey',
  'reine Elektronik: System kommt ohne Zutun aus dem Projekt');
pruefe(M.istTuerElektronisch(projekt, tuer), 'Tür gilt als elektronisch');

projekt.anlagenart = 'hybrid';
pruefe(M.tuerSystemId(projekt, tuer) === '', 'Hybrid: ohne Entscheidung kein System');
pruefe(!M.pruefeProjekt(projekt).every(x => !/Ausführung/.test(x.text)),
  'Hybrid ohne Entscheidung wird im Prüfprotokoll gemeldet');
tuer.tuerTechnologie = 'mechanik';
pruefe(M.tuerSystemId(projekt, tuer) === 'evva-4ks', 'Hybrid: mechanische Tür bekommt das Mechaniksystem');
tuer.tuerTechnologie = 'elektronik';
pruefe(M.tuerSystemId(projekt, tuer) === 'evva-airkey', 'Hybrid: elektronische Tür bekommt das Elektroniksystem');

/* Fehlende Anlage wird gemeldet */
const ohne = M.neuesProjekt('Ohne Anlage');
pruefe(M.pruefeProjekt(ohne).some(x => /Art der Anlage/.test(x.text)),
  'fehlende Anlagenart wird gemeldet');
ohne.anlagenart = 'hybrid';
pruefe(M.pruefeProjekt(ohne).some(x => /Schließsystem/.test(x.text)),
  'fehlendes System wird gemeldet');

/* Systemauswahl nach Technologie gefiltert */
const elektronikAuswahl = K.systemeNachTyp('elektronisch').map(x => x.id);
pruefe(!elektronikAuswahl.includes('evva-4ks'), 'Mechaniksystem erscheint nicht in der Elektronikauswahl');
const mechanikAuswahl = K.systemeNachTyp('mechanisch').map(x => x.id);
pruefe(!mechanikAuswahl.includes('evva-airkey'), 'Elektroniksystem erscheint nicht in der Mechanikauswahl');

console.log('\n== Überführung: Anlage aus den Türen erschließen ==');
const altMitSystem = {
  id: 'p', name: 'Alt', standorte: [], schliessungen: [], matrix: {},
  tueren: [
    { id: 'a', nummer: '1', systemId: 'evva-4ks', anzahl: 8 },
    { id: 'b', nummer: '2', systemId: 'evva-airkey', anzahl: 3 },
    { id: 'c', nummer: '3', systemId: 'nuki', anzahl: 1 }
  ]
};
const erschlossen = M.migriere(altMitSystem);
pruefe(erschlossen.anlagenart === 'hybrid', 'gemischtes Altprojekt wird als Hybridanlage erkannt', erschlossen.anlagenart);
pruefe(erschlossen.systemMechanik === 'evva-4ks', 'häufigstes Mechaniksystem übernommen', erschlossen.systemMechanik);
pruefe(erschlossen.systemElektronik === 'evva-airkey', 'häufigstes Elektroniksystem übernommen', erschlossen.systemElektronik);
pruefe(erschlossen.tueren[0].tuerTechnologie === 'mechanik' &&
       erschlossen.tueren[1].tuerTechnologie === 'elektronik',
  'je Tür wird die Ausführung festgehalten');
pruefe(/Nuki/.test(erschlossen.tueren[2].systemNotiz || ''),
  'abweichendes System bleibt als Hinweis erhalten, statt verloren zu gehen',
  erschlossen.tueren[2].systemNotiz);
pruefe(erschlossen.tueren.every(x => !('systemId' in x)), 'kein Türsystem bleibt zurück');

/* Reines Mechanikprojekt */
const nurMech = M.migriere({ id: 'q', name: 'M', standorte: [], schliessungen: [], matrix: {},
  tueren: [{ id: 'a', nummer: '1', systemId: 'evva-3ksplus', anzahl: 4 }] });
pruefe(nurMech.anlagenart === 'mechanik', 'reines Mechanikprojekt wird erkannt', nurMech.anlagenart);
pruefe(!nurMech.tueren[0].tuerTechnologie, 'bei reiner Anlage bleibt die Türangabe leer');

console.log('\n== Ausführungen einzeln wählbar ==');
pruefe(K.ZYLINDER_AUSFUEHRUNG.includes('Freidreh') && K.ZYLINDER_AUSFUEHRUNG.includes('Comfort'),
  'Freidreh und Comfort sind getrennte Optionen');
pruefe(!K.ZYLINDER_AUSFUEHRUNG.some(a => /\//.test(a)),
  'keine Ausführung fasst mehrere Begriffe zusammen',
  K.ZYLINDER_AUSFUEHRUNG.filter(a => /\//.test(a)).join(', '));
const altAusf = { zylinderAusfuehrung: ['Freidreh / Komfort'], brauchtZylinder: true };
M.tuerUeberfuehren(altAusf);
pruefe(altAusf.zylinderAusfuehrung.includes('Freidreh'),
  'frühere Sammelbezeichnung wird aufgelöst', JSON.stringify(altAusf.zylinderAusfuehrung));

console.log(`\nErgebnis: ${ok} ok, ${fehler} Fehler`);
process.exit(fehler ? 1 : 0);
