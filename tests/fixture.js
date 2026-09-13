/* Erzeugt ein realistisches Testprojekt für die Report-Tests. */
require('../src/js/catalog.js');
const M = require('../src/js/model.js');

function baueTestprojekt(opt = {}) {
  const p = M.neuesProjekt('Aufmaß Musterobjekt');
  Object.assign(p, {
    kunde: 'Müller & Söhne Immobilienverwaltung GmbH',
    kundenNr: 'K-10432',
    objekt: 'Bürogebäude Königsallee 47',
    strasse: 'Königsallee 47', plz: '40212', ort: 'Düsseldorf',
    ansprechpartner: 'Frau Dr. Schäfer', telefon: '0211 / 55 44 33-0',
    email: 'schaefer@mueller-soehne.example',
    anlagenNr: 'SA-2026-0815', bearbeiter: 'M. Weber',
    bemerkung: 'Umstellung der Altanlage auf EVVA AirKey im Außenbereich, Innenbereich mechanisch 4KS. Tiefgarage später in Bauabschnitt 2.'
  });

  const standort = M.neuerStrukturknoten('standort', 'Standort Düsseldorf');
  p.standorte.push(standort);
  const hausA = M.neuerStrukturknoten('gebaeude', 'Haus A (Verwaltung)', standort.id);
  const hausB = M.neuerStrukturknoten('gebaeude', 'Haus B (Lager & Technik)', standort.id);
  hausA.sort = 1; hausB.sort = 2;
  p.standorte.push(hausA, hausB);
  const egA = M.neuerStrukturknoten('bereich', 'Erdgeschoss', hausA.id);
  const ogA = M.neuerStrukturknoten('bereich', '1. Obergeschoss', hausA.id);
  const ugB = M.neuerStrukturknoten('bereich', 'Untergeschoss / Technik', hausB.id);
  egA.sort = 1; ogA.sort = 2; ugB.sort = 1;
  p.standorte.push(egA, ogA, ugB);

  const tueren = [
    { nummer:'A-EG-01', bezeichnung:'Haupteingang Königsallee', strukturId:egA.id, kategorie:'Haupteingang',
      technologie:'elektronisch', systemId:'evva-airkey', systemDetail:'mit mech. Notschlüssel-Rückfallebene',
      brauchtZylinder:true, zylinderArt:'Elektronikzylinder (Doppelknauf)',
      brauchtBeschlag:true, beschlagArt:'Schutzbeschlag ES1',
      brauchtSchloss:true, schlossArt:'Panikschloss Funktion B (Umschaltfunktion)',
      zutrittsarten:['Beidseitig (innen + außen)','Flucht- und Rettungsweg (Panik)','Sicherheitstür / einbruchhemmend (RC)'],
      identmedien:['Smartphone (App)','Karte'], komponenten:['AirKey Wandleser'],
      masseAussen:'40', masseInnen:'45', tuerblattstaerke:'68', dornmass:'65', entfernung:'92', vierkant:'9',
      tuermaterial:'Alu (Rohrrahmen)', dinRichtung:'DIN links', oeffnungsrichtung:'nach außen öffnend',
      profilbreite:'60', bestandFabrikat:'Kaba gege', bestandZylinderart:'Doppelzylinder', bestandLaenge:'35/40',
      bestandAnzahlSchluessel:'12', elFunkabdeckung:'gut', elStromversorgung:'Batterie', elVernetzung:'online',
      elTuerueberwachung:true, status:'aufgemessen', anzahl:1,
      notiz:'Türschließer vorhanden, Freilauf gewünscht. Kabelzuführung für Wandleser bauseits vorhanden.' },
    { nummer:'A-EG-02', bezeichnung:'Nebeneingang Hof', strukturId:egA.id, kategorie:'Nebeneingang',
      technologie:'elektronisch', systemId:'evva-airkey',
      brauchtZylinder:true, zylinderArt:'Elektronikzylinder (Doppelknauf)',
      zutrittsarten:['Einseitig (nur außen)'], identmedien:['Smartphone (App)'],
      masseAussen:'35', masseInnen:'35', tuerblattstaerke:'55', dinRichtung:'DIN rechts',
      status:'aufgemessen', anzahl:1, elFunkabdeckung:'mittel', elStromversorgung:'Batterie' },
    { nummer:'A-EG-03', bezeichnung:'Büro Empfang', strukturId:egA.id, kategorie:'Innentür Büro',
      technologie:'mechanisch', systemId:'evva-4ks',
      brauchtZylinder:true, zylinderArt:'Doppelzylinder mit Not- und Gefahrenfunktion',
      brauchtBeschlag:true, beschlagArt:'Rosettengarnitur Drücker/Drücker',
      zutrittsarten:['Not- und Gefahrenfunktion (beidseitig steckbar)'], identmedien:['Schlüssel'],
      masseAussen:'30', masseInnen:'35', dornmass:'55', entfernung:'72', vierkant:'8',
      dinRichtung:'DIN links', status:'aufgemessen', anzahl:4,
      notiz:'4 baugleiche Bürotüren im Flur Empfang.' },
    { nummer:'A-OG-01', bezeichnung:'Serverraum EDV', strukturId:ogA.id, kategorie:'Serverraum / EDV',
      technologie:'elektronisch', systemId:'sv-ax', systemDetail:'AX .SmartCore',
      brauchtZylinder:true, zylinderArt:'Elektronikzylinder Freidreh / Komfort',
      brauchtSchloss:true, schlossArt:'Einsteckschloss PZ selbstverriegelnd',
      zutrittsarten:['Beidseitig (innen + außen)','Comfort / Freidreh','VdS-Anforderung'],
      identmedien:['Transponder AX','SmartCard (MIFARE)'], komponenten:['SmartRelais AX / 3 Advanced'],
      masseAussen:'35', masseInnen:'45', tuerblattstaerke:'48', dornmass:'55',
      dinRichtung:'DIN rechts', status:'klaerung', anzahl:1,
      elFunkabdeckung:'schlecht', elVernetzung:'virtuelles Netzwerk',
      nacharbeit:true, nacharbeitText:'Funkabdeckung im Serverraum unzureichend – RouterNode im Flur erforderlich, Position mit IT abstimmen.',
      notiz:'Zutritt nur für IT-Abteilung und GL.' },
    { nummer:'A-OG-02', bezeichnung:'Büro Geschäftsleitung', strukturId:ogA.id, kategorie:'Innentür Büro',
      technologie:'mechanisch', systemId:'evva-4ks', brauchtZylinder:true, zylinderArt:'Doppelzylinder',
      brauchtBeschlag:true, beschlagArt:'Rosettengarnitur Knauf/Drücker',
      zutrittsarten:['Beidseitig (innen + außen)'], identmedien:['Schlüssel'],
      masseAussen:'30', masseInnen:'30', vierkant:'8', dinRichtung:'DIN links',
      status:'aufgemessen', anzahl:1 },
    { nummer:'A-OG-03', bezeichnung:'Archiv / Aktenlager', strukturId:ogA.id, kategorie:'Lager / Archiv',
      technologie:'mechanisch', systemId:'evva-4ks', brauchtZylinder:true, zylinderArt:'Halbzylinder',
      zutrittsarten:['Einseitig (nur außen)'], identmedien:['Schlüssel'],
      masseAussen:'35', masseInnen:'10', status:'offen', anzahl:1 },
    { nummer:'B-UG-01', bezeichnung:'Heizungsraum', strukturId:ugB.id, kategorie:'Technikraum / Heizung',
      technologie:'mechanisch', systemId:'evva-4ks', brauchtZylinder:true, zylinderArt:'Doppelzylinder',
      zutrittsarten:['Beidseitig (innen + außen)','Brandschutztür'],
      brauchtSchloss:true, schlossArt:'Einsteckschloss PZ',
      identmedien:['Schlüssel'], masseAussen:'30', masseInnen:'35', dornmass:'65',
      dinRichtung:'DIN rechts', status:'aufgemessen', anzahl:1,
      notiz:'T30-Tür, Zulassung beachten.' },
    { nummer:'B-UG-02', bezeichnung:'Elektro-Hauptverteilung', strukturId:ugB.id, kategorie:'Elektroraum / HAK',
      technologie:'mechanisch', systemId:'evva-4ks', brauchtZylinder:true, zylinderArt:'Halbzylinder',
      zutrittsarten:['Einseitig (nur außen)'], identmedien:['Schlüssel'],
      masseAussen:'30', masseInnen:'10', status:'aufgemessen', anzahl:1 },
    { nummer:'B-UG-03', bezeichnung:'Notausgang Hofseite', strukturId:ugB.id, kategorie:'Fluchttür / Notausgang',
      technologie:'hybrid', systemId:'evva-akb',
      brauchtZylinder:true, zylinderArt:'Elektronikzylinder Anti-Panik',
      brauchtSchloss:true, schlossArt:'Panikschloss Funktion E (Wechselfunktion)',
      brauchtBeschlag:true, beschlagArt:'Panikbeschlag / Fluchttürbeschlag',
      zutrittsarten:['Flucht- und Rettungsweg (Panik)','Brand- und Rauchschutz'],
      identmedien:['Smartphone (App)','Schlüssel'],
      masseAussen:'35', masseInnen:'40', dornmass:'65', entfernung:'92', vierkant:'9',
      dinRichtung:'DIN rechts', oeffnungsrichtung:'nach außen öffnend',
      status:'aufgemessen', anzahl:1,
      notiz:'Fluchtwegtür nach EltVTR, Zustimmung Brandschutzbeauftragter liegt vor.' },
    { nummer:'B-UG-04', bezeichnung:'Lagerraum 3 (ohne Zuordnung geprüft)', strukturId:null,
      kategorie:'Lager / Archiv', technologie:'offen', systemId:'', brauchtZylinder:true,
      zylinderArt:'', status:'offen', anzahl:1, notiz:'Raum war verschlossen, Aufmaß nachholen.' },
    { nummer:'A-EG-04', bezeichnung:'Briefkastenanlage (12 Fächer)', strukturId:egA.id,
      kategorie:'Briefkastenanlage', technologie:'mechanisch', systemId:'evva-4ks',
      brauchtZylinder:true, zylinderArt:'Briefkastenzylinder', identmedien:['Schlüssel'],
      masseAussen:'', masseInnen:'', status:'aufgemessen', anzahl:12,
      notiz:'Gleichschließend je Mietpartei gewünscht.' },
    { nummer:'A-EG-05', bezeichnung:'Tiefgaragentor', strukturId:egA.id, kategorie:'Tiefgarage / Garagentor',
      technologie:'elektronisch', systemId:'nuki', brauchtZylinder:false,
      brauchtWandleser:true, komponenten:['Nuki Opener (Türsprechanlage)','Nuki Bridge'],
      zutrittsarten:['Einseitig (nur außen)','Zeitgesteuert'], identmedien:['Smartphone (App)'],
      status:'klaerung', anzahl:1, elStromversorgung:'12V', elFunkabdeckung:'gut',
      notiz:'Anbindung an vorhandene Torsteuerung prüfen (Potentialfreier Kontakt).' }
  ];
  tueren.forEach(t => p.tueren.push(M.neueTuer(t)));

  const schliessungen = [
    { kuerzel:'GHS', bezeichnung:'Generalhauptschlüssel', typ:'ghs', anzahlMedien:3, person:'Geschäftsführung', abteilung:'GL' },
    { kuerzel:'HS-A', bezeichnung:'Hauptschlüssel Haus A', typ:'hs', anzahlMedien:2, person:'Objektleitung' },
    { kuerzel:'HS-B', bezeichnung:'Hauptschlüssel Haus B', typ:'hs', anzahlMedien:2, person:'Technik' },
    { kuerzel:'HM', bezeichnung:'Hausmeister', typ:'person', anzahlMedien:2, person:'Herr Özdemir', abteilung:'Facility' },
    { kuerzel:'IT', bezeichnung:'IT-Abteilung', typ:'gruppe', anzahlMedien:4, abteilung:'EDV' },
    { kuerzel:'VW', bezeichnung:'Verwaltung', typ:'gruppe', anzahlMedien:11, abteilung:'Verwaltung' },
    { kuerzel:'REIN', bezeichnung:'Reinigungsfirma Glanz GmbH', typ:'extern', anzahlMedien:5, bemerkung:'Mo–Fr 18–22 Uhr' },
    { kuerzel:'NOT', bezeichnung:'Notdienst / Feuerwehr', typ:'extern', anzahlMedien:1, bemerkung:'Schlüsseldepot' },
    { kuerzel:'EZ-GL', bezeichnung:'Einzelschließung GL-Büro', typ:'ez', anzahlMedien:2 },
    { kuerzel:'EZ-ARCH', bezeichnung:'Einzelschließung Archiv', typ:'ez', anzahlMedien:2 },
    { kuerzel:'MP-01', bezeichnung:'Mietpartei 01', typ:'ez', anzahlMedien:3 },
    { kuerzel:'MP-02', bezeichnung:'Mietpartei 02', typ:'ez', anzahlMedien:3 }
  ];
  schliessungen.forEach((s, i) => p.schliessungen.push(M.neueSchliessung(Object.assign({ sort: i }, s))));

  /* Berechtigungen setzen */
  const T = n => p.tueren.find(t => t.nummer === n).id;
  const S = k => p.schliessungen.find(s => s.kuerzel === k).id;
  p.tueren.forEach(t => M.setBerechtigung(p, t.id, S('GHS'), 'ja'));
  ['A-EG-01','A-EG-02','A-EG-03','A-OG-01','A-OG-02','A-OG-03','A-EG-04','A-EG-05']
    .forEach(n => M.setBerechtigung(p, T(n), S('HS-A'), 'ja'));
  ['B-UG-01','B-UG-02','B-UG-03'].forEach(n => M.setBerechtigung(p, T(n), S('HS-B'), 'ja'));
  ['A-EG-01','A-EG-02','B-UG-01','B-UG-02','B-UG-03','A-EG-05']
    .forEach(n => M.setBerechtigung(p, T(n), S('HM'), 'ja'));
  ['A-EG-01','A-OG-01'].forEach(n => M.setBerechtigung(p, T(n), S('IT'), 'ja'));
  M.setBerechtigung(p, T('A-OG-01'), S('VW'), 'sperr');
  ['A-EG-01','A-EG-03','A-OG-02','A-OG-03'].forEach(n => M.setBerechtigung(p, T(n), S('VW'), 'ja'));
  ['A-EG-01','A-EG-03','A-OG-02'].forEach(n => M.setBerechtigung(p, T(n), S('REIN'), 'zeit'));
  M.setBerechtigung(p, T('A-EG-01'), S('NOT'), 'ja');
  M.setBerechtigung(p, T('A-OG-02'), S('EZ-GL'), 'ja');
  M.setBerechtigung(p, T('A-OG-03'), S('EZ-ARCH'), 'ja');
  M.setBerechtigung(p, T('A-EG-01'), S('MP-01'), 'ja');
  M.setBerechtigung(p, T('A-EG-04'), S('MP-01'), 'ja');
  M.setBerechtigung(p, T('A-EG-01'), S('MP-02'), 'temp');
  M.setBerechtigung(p, T('A-EG-04'), S('MP-02'), 'ja');

  if (opt.fotoDataUrl) {
    p.tueren[0].fotos.push({ id:'f1', dataUrl: opt.fotoDataUrl, beschriftung:'Ansicht außen', erstellt:new Date().toISOString() });
    p.tueren[0].fotos.push({ id:'f2', dataUrl: opt.fotoDataUrl, beschriftung:'Schlosskasten', erstellt:new Date().toISOString() });
    p.tueren[3].fotos.push({ id:'f3', dataUrl: opt.fotoDataUrl, beschriftung:'Bestandszylinder', erstellt:new Date().toISOString() });
  }
  return p;
}

const einstellungen = {
  firma: 'Provision Infra GmbH',
  firmaZusatz: 'Schließsysteme & Zutrittslösungen',
  firmaTelefon: '+49 (0) 000 / 000 00-0',
  firmaEmail: 'info@provision-infra.de',
  eigeneSysteme: []
};

module.exports = { baueTestprojekt, einstellungen };
