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
  STULPFORM: K.STULPFORM,
  FALLENART: K.FALLENART,
  SCHLOSS_NORM: K.SCHLOSS_NORM,
  TUER_ANSCHLAG: K.TUER_ANSCHLAG,
  KABELUEBERGANG: K.KABELUEBERGANG
};

/* Begriffe, die jeweils genau einer Liste gehören dürfen */
const EIGENTUEMER = {
  'freidreh': 'ZYLINDER_AUSFUEHRUNG',
  'komfort': 'ZYLINDER_AUSFUEHRUNG',
  'anti-panik': 'ZYLINDER_AUSFUEHRUNG',
  'wetterschutz': 'ZYLINDER_AUSFUEHRUNG',
  'bsz': 'ZYLINDER_AUSFUEHRUNG',
  'monitoring': 'ZYLINDER_AUSFUEHRUNG',
  'halbzylinder': 'ZYLINDER_BAUFORM',
  'doppelzylinder': 'ZYLINDER_BAUFORM',
  'rosetten': 'BESCHLAG_BAUFORM',
  'langschild': 'BESCHLAG_BAUFORM',
  'es1': 'BESCHLAG_SICHERHEIT',
  'es2': 'BESCHLAG_SICHERHEIT',
  'einsteckschloss': 'SCHLOSS_BAUFORM',
  'rohrrahmen': 'SCHLOSS_BAUFORM',
  /* Die Rollfalle ist eine Bauart der Falle und keine Funktion des
     Schlosses - sonst müsste man sich zwischen Panikfunktion und
     Rollfalle entscheiden, obwohl beides zusammen vorkommt. */
  'rollfalle': 'FALLENART',
  'stulp': 'STULPFORM',
  'leerrohr': 'KABELUEBERGANG'
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
pruefe(!('zutrittsseite' in n1) && !('tueranforderungen' in n1),
  'Zutrittsseite und bauliche Anforderungen gibt es seit Fassung 1.2 nicht mehr - sie werden nicht mitgeschleppt',
  JSON.stringify({ z: n1.zutrittsseite, a: n1.tueranforderungen }));
pruefe(n1.masseAussen === '35' && n1.masseInnen === '40', 'Maße bleiben unverändert erhalten');
pruefe(n2.brauchtZylinder === false, '"Kein Zylinder" wird zum ausgeschalteten Bauteil');
pruefe(n3.zylinderBauform === 'Doppelzylinder' &&
       n3.zylinderAusfuehrung.includes('BSZ (beidseitig schließbar)') &&
       !n3.zylinderAusfuehrung.includes('Not- und Gefahrenfunktion'),
  'Not- und Gefahrenfunktion wird zur Ausführung „BSZ (beidseitig schließbar)“',
  JSON.stringify({ b: n3.zylinderBauform, a: n3.zylinderAusfuehrung }));
pruefe(n3.beschlagBestueckung === 'Knauf / Drücker', 'Bestückung aus dem Beschlagstext gezogen', n3.beschlagBestueckung);

/* Keine Altfelder bleiben übrig */
const reste = neu.tueren.flatMap(t2 =>
  ['zylinderArt', 'beschlagArt', 'schlossArt', 'zutrittsarten', 'technologie', 'identmedien', 'zutrittsseite', 'tueranforderungen']
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

console.log('\n== Rang im Plan und Träger sind zwei Fragen ==');
/* Früher stand "Person" und "Personengruppe" mit in der Typenliste. Dann
   musste man zweimal dasselbe wählen: den Rang und wer das Medium trägt. */
const typBegriffe = K.SCHLIESSUNG_TYPEN.map(x => x.label.toLowerCase());
pruefe(!typBegriffe.some(x => /person|gruppe\b/.test(x) && !/gruppenschlüssel|untergruppen/.test(x)),
  'der Rang im Plan enthält keine Angabe zum Träger',
  typBegriffe.filter(x => /person|gruppe\b/.test(x)).join(', '));
pruefe(K.SPALTEN_ART.map(x => x.id).join(',') === 'gruppe,mitarbeiter,schliessung',
  'eine Spalte ist Gruppe, Mitarbeiter oder Schließung');

/* Ein Schließplan aus Fassung 1.1: Personen je Schließung werden zur
   zentralen Mitarbeiterliste, Gruppen zu eigenen Gruppen mit Mitgliedern */
const altPlan = { id: 'prj-alt-plan', name: 'Alt', tueren: [], standorte: [], matrix: {},
  schliessungen: [
    { id: 's1', kuerzel: 'HM', bezeichnung: 'Hausmeister', typ: 'person',
      anzahlMedien: 2, person: 'Herr Özdemir', abteilung: 'Facility' },
    { id: 's2', kuerzel: 'IT', bezeichnung: 'IT-Abteilung', typ: 'gruppe', traegerArt: 'gruppe', gruppenName: 'EDV',
      personen: [{ id: 'per-a', name: 'Frau Adler', funktion: '', anzahlMedien: 2 }, { id: 'per-b', name: 'Herr Bauer', anzahlMedien: 1 }],
      anzahlMedien: 3, medienTyp: 'Transponder' },
    { id: 's3', kuerzel: 'GHS', bezeichnung: 'General', typ: 'ghs', anzahlMedien: 2, medienTyp: 'Schlüssel', medienVonHand: true }
  ] };
const neuPlan = M.migriere(JSON.parse(JSON.stringify(altPlan)));
const [p1, p2, p3] = neuPlan.schliessungen;
pruefe(p1.art === 'schliessung' && p1.typ === '' && p1.traeger.length === 1,
  'aus "Person" wird eine Schließung mit einem Träger, der Rang bleibt offen statt erfunden',
  JSON.stringify({ art: p1.art, typ: p1.typ, traeger: p1.traeger }));
const oez = M.mitarbeiterVon(neuPlan, p1.traeger[0]);
pruefe(oez && oez.name === 'Herr Özdemir' && oez.funktion === 'Facility' && M.mitarbeiterMedienAnzahl(oez) === 2,
  'Name und Abteilung werden zum Mitarbeiter mit seiner Medienzahl', JSON.stringify(oez));
pruefe(p2.art === 'gruppe' && M.gruppeVon(neuPlan, p2.gruppeId) && M.gruppeVon(neuPlan, p2.gruppeId).name === 'EDV',
  'aus "Personengruppe" wird eine benannte Gruppe', JSON.stringify(p2));
pruefe(M.gruppenMitglieder(neuPlan, p2.gruppeId).length === 2 && M.medienAnzahl(neuPlan, p2) === 3,
  'die Mitglieder stehen in der Mitarbeiterliste, die Medienzahl bleibt 3', String(M.medienAnzahl(neuPlan, p2)));
pruefe(M.gruppenMitglieder(neuPlan, p2.gruppeId).every(m => m.medien[0] && m.medien[0].typ === 'Transponder'),
  'die Art des Mediums wandert zu den Mitgliedern');
pruefe(p3.art === 'schliessung' && M.medienAnzahl(neuPlan, p3) === 2 && p3.medien[0].typ === 'Schlüssel',
  'eine von Hand gezählte Schließung behält ihre eigene Medienliste', JSON.stringify(p3.medien));
pruefe(neuPlan.schliessungen.every(s => !('personen' in s) && !('traegerArt' in s) && !('anzahlMedien' in s)),
  'keine Altfelder bleiben an den Spalten zurück');
/* Zweimal überführen darf nichts verdoppeln */
const nochmal = M.migriere(JSON.parse(JSON.stringify(neuPlan)));
pruefe(nochmal.mitarbeiter.length === neuPlan.mitarbeiter.length && nochmal.gruppen.length === neuPlan.gruppen.length,
  'erneute Überführung verdoppelt weder Mitarbeiter noch Gruppen');

console.log('\n== Rollfalle gehört zur Falle, nicht zur Funktion ==');
pruefe(!K.SCHLOSS_FUNKTION.includes('Rollfalle'),
  'die Rollfalle steht nicht mehr unter den Funktionen');
pruefe(K.FALLENART.includes('Rollfalle'), 'die Rollfalle steht unter den Fallenarten');
const altRolle = { brauchtSchloss: true, schlossBauform: 'Einsteckschloss', schlossFunktion: 'Rollfalle' };
M.tuerUeberfuehren(altRolle);
pruefe(altRolle.schlossFallenart === 'Rollfalle' && altRolle.schlossFunktion === '',
  'eine früher als Funktion erfasste Rollfalle wandert zur Fallenart',
  JSON.stringify(altRolle));

/* Nach der Überführung muss jeder Wert in seiner Auswahlliste stehen -
   sonst zeigt das Formular ein leeres Feld, obwohl Daten vorhanden sind. */
const altTexte = ['Einsteckschloss Rollfalle', 'Einsteckschloss Panik B',
                  'Einsteckschloss Panik Funktion E', 'Rohrrahmenschloss Rollfalle Panik D',
                  'Panikschloss selbstverriegelnd', 'Einsteckschloss Buntbart'];
const ungueltig = [];
altTexte.forEach(txt => {
  const t = { schlossArt: txt, zutrittsarten: [] };
  M.tuerUeberfuehren(t);
  if (t.schlossFunktion && !K.SCHLOSS_FUNKTION.includes(t.schlossFunktion)) {
    ungueltig.push(txt + ' -> Funktion "' + t.schlossFunktion + '"');
  }
  if (t.schlossFallenart && !K.FALLENART.includes(t.schlossFallenart)) {
    ungueltig.push(txt + ' -> Fallenart "' + t.schlossFallenart + '"');
  }
  if (t.schlossBauform && !K.SCHLOSS_BAUFORM.includes(t.schlossBauform)) {
    ungueltig.push(txt + ' -> Bauform "' + t.schlossBauform + '"');
  }
});
pruefe(ungueltig.length === 0,
  'jede überführte Angabe steht in ihrer Auswahlliste', ungueltig.join('\n         -> '));

/* Funktion und Fallenart schließen sich nicht aus */
const beides = { schlossArt: 'Rohrrahmenschloss Rollfalle Panik D', zutrittsarten: [] };
M.tuerUeberfuehren(beides);
pruefe(/Panik Funktion D/.test(beides.schlossFunktion) && beides.schlossFallenart === 'Rollfalle',
  'Panikfunktion und Rollfalle bleiben beide erhalten',
  JSON.stringify({ f: beides.schlossFunktion, r: beides.schlossFallenart }));

console.log('\n== Pflichtangaben kommen aus einer Quelle ==');
const pProj = M.neuesProjekt('Pflicht');
pProj.anlagenart = 'mechanik'; pProj.systemMechanik = 'evva-4ks';
const standort = M.neuerStrukturknoten('standort', 'Standort');
pProj.standorte.push(standort);
const pTuer = M.neueTuer({ nummer: '001' });
pProj.tueren.push(pTuer);
const fehlen1 = M.pflichtfelder(pProj, pTuer).map(x => x.schluessel);
pruefe(fehlen1.includes('bezeichnung') && fehlen1.includes('strukturId') &&
       fehlen1.includes('zylinderBauform') && !fehlen1.includes('zutrittsseite'),
  'die Pflichtangaben eines Zylinders werden benannt - ohne die abgeschaffte Zutrittsseite', fehlen1.join(', '));
pruefe(!fehlen1.includes('schlossBauform') && !fehlen1.includes('beschlagBauform'),
  'nach abgewählten Bauteilen wird nicht gefragt', fehlen1.join(', '));
/* Die Längen hängen an der Bauform: Beim Briefkastenzylinder gibt es keine.
   Deshalb werden sie erst verlangt, wenn die Bauform bekannt ist. */
pruefe(!fehlen1.includes('masseAussen'),
  'ohne bekannte Bauform wird noch keine Länge verlangt', fehlen1.join(', '));
pTuer.zylinderBauform = 'Doppelzylinder';
const fehlen2 = M.pflichtfelder(pProj, pTuer).map(x => x.schluessel);
pruefe(fehlen2.includes('masseAussen') && fehlen2.includes('masseInnen'),
  'mit der Bauform werden beide Längen zur Pflicht', fehlen2.join(', '));

/* Der Bestellbezug: ohne Längen kein Zylinder - außer dort, wo es keine gibt */
pTuer.zylinderBauform = 'Briefkastenzylinder';
pruefe(!M.pflichtfelder(pProj, pTuer).some(x => x.schluessel === 'masseAussen'),
  'beim Briefkastenzylinder wird keine Länge verlangt');
pTuer.zylinderBauform = 'Halbzylinder';
const halb = M.pflichtfelder(pProj, pTuer).map(x => x.schluessel);
pruefe(halb.includes('masseAussen') && !halb.includes('masseInnen'),
  'beim Halbzylinder wird nur die Außenlänge verlangt', halb.join(', '));

/* Status folgt der Vollständigkeit, überschreibt aber keine eigene Wahl */
M.statusAusPruefung(pProj, pTuer);
pruefe(pTuer.status === 'klaerung', 'unvollständige Tür wird auf „Klärung nötig“ gesetzt', pTuer.status);
pTuer.bezeichnung = 'Tür'; pTuer.strukturId = standort.id; pTuer.masseAussen = '30';
M.statusAusPruefung(pProj, pTuer);
pruefe(pTuer.status === 'aufgemessen', 'vollständige Tür gilt als aufgemessen', pTuer.status);
pTuer.statusVonHand = true; pTuer.status = 'freigegeben'; pTuer.masseAussen = '';
M.statusAusPruefung(pProj, pTuer);
pruefe(pTuer.status === 'freigegeben', 'ein selbst gewählter Status wird nicht überschrieben', pTuer.status);

/* Freiwillige Felder bleiben freiwillig */
const freiwillig = ['schlossStulpform', 'schlossFallenart', 'schlossNorm', 'schlossRiegelausschluss',
                    'tuerbreite', 'tuerhoehe', 'tuerAnschlag', 'elKabeluebergang',
                    'elLeitungsweg', 'bestandFabrikat', 'bohrbild', 'profilbreite', 'notiz'];
const alleTuer = M.neueTuer({ brauchtZylinder: true, brauchtBeschlag: true, brauchtSchloss: true,
                              brauchtWandleser: true, schlossBauform: 'Einsteckschloss',
                              beschlagAusfuehrung: 'beidseitig elektronisch' });
const pflichtNamen = Object.keys(M.pflichtSchluessel(pProj, alleTuer));
const falsch = freiwillig.filter(k => pflichtNamen.includes(k));
pruefe(falsch.length === 0, 'kein freiwilliges Feld wird zur Pflicht', falsch.join(', '));

/* Stromversorgung und Vernetzung sind ausdrücklich freiwillig - auch
   beim Wandleser und beim elektronischen Beschlag, wo sie früher
   verlangt wurden. */
const elTuer = M.neueTuer({ bezeichnung: 'Tor', etage: 'EG', strukturId: (pProj.standorte[0] || {}).id || null,
  brauchtZylinder: false, brauchtWandleser: true,
  brauchtBeschlag: true, beschlagBauform: 'Rosettengarnitur', beschlagAusfuehrung: 'elektronisch',
  beschlagBestueckung: 'Drücker / Drücker', tuerblattstaerke: '40', dornmass: '55', entfernung: '72',
  vierkant: '8', dinRichtung: 'DIN links' });
const elPflicht = Object.keys(M.pflichtSchluessel(pProj, elTuer));
pruefe(elPflicht.indexOf('elStromversorgung') === -1 && elPflicht.indexOf('elVernetzung') === -1,
  'Stromversorgung und Vernetzung sind keine Pflichtangaben (Wandleser, elektronischer Beschlag)', elPflicht.join(', '));
pruefe(M.pflichtfelder(pProj, elTuer).length === 0, 'eine solche Tür gilt ohne beide Angaben als vollständig',
  M.pflichtfelder(pProj, elTuer).map(x => x.schluessel).join(', '));

console.log('\n== Materialliste: eigene Maßspalten je Bauteilart ==');
const { baueTestprojekt } = require('./fixture.js');
const mp = M.migriere(baueTestprojekt());
const ml = M.materialliste(mp);
const zylPos = ml.systeme.flatMap(x => x.positionen).filter(x => x.gruppe === 'Zylinder')
  .filter(x => x.felder.laengeAussen);
pruefe(zylPos.every(x => x.felder.laengeAussen && x.felder.gesamtlaenge),
  'jeder Zylinder führt Außenlänge und Gesamtlänge getrennt',
  zylPos.filter(x => !x.felder.gesamtlaenge).map(x => x.bezeichnung).join(', '));
const summe = zylPos[0];
pruefe(Number(summe.felder.gesamtlaenge) ===
       Number(summe.felder.laengeAussen) + Number(summe.felder.laengeInnen),
  'die Gesamtlänge ist die Summe der beiden Längen',
  JSON.stringify(summe.felder));
const besPos = ml.systeme.flatMap(x => x.positionen).filter(x => x.gruppe === 'Beschlag');
pruefe(besPos.every(x => x.felder && 'dornmass' in x.felder && 'vierkant' in x.felder &&
                         'tuerblattstaerke' in x.felder && 'din' in x.felder),
  'jeder Beschlag führt Türstärke, Dornmaß, Entfernung, Nuss und DIN einzeln');
const schlossPos = ml.systeme.flatMap(x => x.positionen).filter(x => x.gruppe === 'Schloss');
pruefe(schlossPos.every(x => x.felder && 'stulp' in x.felder && 'fallenart' in x.felder),
  'jedes Schloss führt Stulp und Fallenart einzeln');
/* Jede Systemgruppe ist nach Bauteilart getrennt - sonst passen die
   Spalten nicht zum Inhalt */
const arten = ml.gliederung.flatMap(a => a.gruppen).flatMap(g => g.arten || []);
pruefe(arten.length > 0 && arten.every(a => a.positionen.every(x => x.gruppe === a.art)),
  'in jeder Spaltengruppe steht nur eine Bauteilart (' + arten.length + ' Gruppen)');

/* Zwei Beschläge mit gleicher Bezeichnung, aber anderer DIN-Richtung sind
   verschiedene Artikel und dürfen nicht zusammenfallen */
const probe = M.neuesProjekt('DIN');
probe.anlagenart = 'mechanik'; probe.systemMechanik = 'evva-4ks';
['DIN links', 'DIN rechts'].forEach((din, i) => {
  probe.tueren.push(M.neueTuer({ nummer: '00' + (i + 1), brauchtZylinder: false,
    brauchtBeschlag: true, beschlagBauform: 'Rosettengarnitur',
    beschlagBestueckung: 'Drücker / Drücker', dornmass: '55', entfernung: '72',
    vierkant: '8', tuerblattstaerke: '40', dinRichtung: din }));
});
const dinListe = M.materialliste(probe).systeme.flatMap(x => x.positionen);
pruefe(dinListe.length === 2, 'Beschläge mit anderer DIN-Richtung bleiben getrennt',
  dinListe.map(x => x.bezeichnung + ' ' + x.felder.din + ' = ' + x.menge).join(' | '));

console.log(`\nErgebnis: ${ok} ok, ${fehler} Fehler`);
process.exit(fehler ? 1 : 0);
