/* =============================================================================
 * catalog.js — Fachlicher Stammdaten-Katalog für Schließanlagen-Aufmaß
 * Kein Framework, kein Build, keine externen Abhängigkeiten.
 * Alle Listen sind bewusst als einfache Arrays gehalten und können vom
 * Anwender in den Einstellungen erweitert werden (siehe store.js -> settings).
 * ========================================================================== */
(function (global) {
  'use strict';

  /* --- Technologie-Grundtyp einer Tür ------------------------------------ */
  var TECHNOLOGIE = [
    { id: 'mechanisch',  label: 'Mechanisch' },
    { id: 'elektronisch', label: 'Elektronisch' },
    { id: 'hybrid',      label: 'Hybrid (mech. + elektr.)' },
    { id: 'offen',       label: 'Noch offen / zu klären' }
  ];

  /* --- Schließsysteme -----------------------------------------------------
   * "komponenten" = typische Bauteile, die an einer Tür verbaut werden.
   * Diese Liste steuert die Materialliste und die Vorauswahl im Türformular.
   * ---------------------------------------------------------------------- */
  var SYSTEME = [
    /* ---------------------- EVVA Elektronik ---------------------------- */
    {
      id: 'evva-airkey', hersteller: 'EVVA', name: 'AirKey', typ: 'elektronisch',
      hinweis: 'Cloud-basiert, Smartphone (NFC/BLE) und Karte/Schlüsselanhänger.',
      komponenten: [
        'AirKey Zylinder Doppelknauf',
        'AirKey Zylinder Halbzylinder',
        'AirKey Zylinder Knauf/Knauf-Modul',
        'AirKey Hebelzylinder',
        'AirKey Wandleser',
        'AirKey Vorhangschloss',
        'AirKey Zylinder Komfort (Freidreh)',
        'AirKey Schlüsselanhänger',
        'AirKey Karte'
      ],
      identmedien: ['Smartphone (App)', 'Karte', 'Schlüsselanhänger', 'Kombi-Schlüssel']
    },
    {
      id: 'evva-xesar', hersteller: 'EVVA', name: 'Xesar', typ: 'elektronisch',
      hinweis: 'Eigenständige Anlage mit Xesar-Software, virtuelles Netzwerk über Wandleser.',
      komponenten: [
        'Xesar Zylinder Doppelknauf',
        'Xesar Zylinder Halbzylinder',
        'Xesar Hebelzylinder',
        'Xesar Beschlag (Türbeschlag)',
        'Xesar Wandleser',
        'Xesar Wandleser mit Tastatur',
        'Xesar Schrankschloss',
        'Xesar Online-Wandleser',
        'Xesar Codierstation',
        'Xesar Identmedium Karte'
      ],
      identmedien: ['Karte', 'Schlüsselanhänger', 'Armband', 'Smartphone (sofern freigeschaltet)']
    },
    /* ---------------------- SimonsVoss --------------------------------- */
    {
      id: 'sv-mobilekey', hersteller: 'SimonsVoss', name: 'MobileKey', typ: 'elektronisch',
      hinweis: 'Kleinanlage / Web-App. Für kleinere Objekte ausgelegt.',
      komponenten: [
        'MobileKey Digitaler Zylinder',
        'MobileKey Halbzylinder',
        'MobileKey SmartHandle',
        'MobileKey SmartRelais',
        'MobileKey WebApp Stick / GatewayNode',
        'MobileKey Transponder',
        'MobileKey Karte'
      ],
      identmedien: ['Transponder', 'Karte', 'Smartphone (App)', 'PinCode-Tastatur']
    },
    {
      id: 'sv-3060', hersteller: 'SimonsVoss', name: 'System 3060', typ: 'elektronisch',
      hinweis: 'Klassisches System 3060 mit LSM-Software.',
      komponenten: [
        'Digitaler Schließzylinder 3061',
        'Digitaler Halbzylinder 3061',
        'SmartHandle 3062',
        'SmartRelais 3063 / 2',
        'SmartLocker / Möbelschloss',
        'Digitaler Zylinder Freidreh (FD)',
        'Digitaler Zylinder Anti-Panik (AP)',
        'Digitaler Zylinder Wetterschutz (WP)',
        'Transponder 3064',
        'SmartCard / SmartTag',
        'Programmiergerät / SmartCD',
        'RouterNode / LockNode (WaveNet)'
      ],
      identmedien: ['Transponder', 'SmartCard', 'SmartTag', 'PinCode-Tastatur']
    },
    {
      id: 'sv-ax', hersteller: 'SimonsVoss', name: 'System AX (Digital Cylinder AX)', typ: 'elektronisch',
      hinweis: 'AX-Generation, BLE-fähig, AX-Manager / LSM.',
      komponenten: [
        'Digitaler Schließzylinder AX',
        'Digitaler Halbzylinder AX',
        'SmartHandle AX',
        'SmartRelais AX / 3 Advanced',
        'SmartLocker AX',
        'Zylinder AX Freidreh (FD)',
        'Zylinder AX Anti-Panik (AP)',
        'Zylinder AX Wetterschutz (WP)',
        'Zylinder AX .SmartCore',
        'Transponder AX',
        'SmartCard AX / MIFARE',
        'PinCode AX Tastatur',
        'RouterNode 2 / AccessNode'
      ],
      identmedien: ['Transponder AX', 'SmartCard (MIFARE)', 'Smartphone (BLE App)', 'PinCode AX']
    },
    /* ---------------------- Weitere ------------------------------------ */
    {
      id: 'keyota', hersteller: 'Keyota', name: 'Keyota', typ: 'elektronisch',
      hinweis: 'Komponentenliste im Menü "Einstellungen" an den konkreten Lieferumfang anpassen.',
      komponenten: [
        'Keyota Zylinder',
        'Keyota Halbzylinder',
        'Keyota Beschlag',
        'Keyota Wandleser',
        'Keyota Identmedium'
      ],
      identmedien: ['Smartphone (App)', 'Karte', 'Schlüsselanhänger']
    },
    {
      id: 'nuki', hersteller: 'Nuki', name: 'Nuki', typ: 'elektronisch',
      hinweis: 'Nachrüstlösung, sitzt in der Regel innen auf dem vorhandenen Zylinder (Not- und Gefahrenfunktion beachten).',
      komponenten: [
        'Nuki Smart Lock',
        'Nuki Smart Lock Pro',
        'Nuki Smart Lock Ultra',
        'Nuki Opener (Türsprechanlage)',
        'Nuki Keypad',
        'Nuki Fob',
        'Nuki Bridge',
        'Nuki Universalzylinder / passender Zylinder'
      ],
      identmedien: ['Smartphone (App)', 'Keypad-Code', 'Fob', 'Fingerprint (geräteabhängig)']
    },
    /* ---------------------- EVVA Mechanik ------------------------------ */
    {
      id: 'evva-4ks', hersteller: 'EVVA', name: '4KS', typ: 'mechanisch',
      hinweis: 'Mechanisches Wendeschlüsselsystem.', komponenten: [], identmedien: ['Schlüssel']
    },
    {
      id: 'evva-3ksplus', hersteller: 'EVVA', name: '3KS plus', typ: 'mechanisch',
      hinweis: 'Mechanisches Wendeschlüsselsystem.', komponenten: [], identmedien: ['Schlüssel']
    },
    {
      id: 'evva-mcs', hersteller: 'EVVA', name: 'MCS', typ: 'mechanisch',
      hinweis: 'Magnetcodesystem, höchste Sicherheitsstufe.', komponenten: [], identmedien: ['Schlüssel']
    },
    {
      id: 'evva-ics', hersteller: 'EVVA', name: 'ICS', typ: 'mechanisch',
      hinweis: 'Mechanisches System mit Kurvenbahn.', komponenten: [], identmedien: ['Schlüssel']
    },
    {
      id: 'evva-eps', hersteller: 'EVVA', name: 'EPS', typ: 'mechanisch',
      hinweis: 'Mechanisches Wendeschlüsselsystem.', komponenten: [], identmedien: ['Schlüssel']
    },
    {
      id: 'evva-dual', hersteller: 'EVVA', name: 'Dual', typ: 'mechanisch',
      hinweis: 'Mechanisches System.', komponenten: [], identmedien: ['Schlüssel']
    },
    {
      id: 'evva-a5', hersteller: 'EVVA', name: 'A5', typ: 'mechanisch',
      hinweis: 'Mechanisches Bohrmuldensystem.', komponenten: [], identmedien: ['Schlüssel']
    },
    {
      id: 'evva-fps', hersteller: 'EVVA', name: 'FPS', typ: 'mechanisch',
      hinweis: 'Mechanisches Wendeschlüsselsystem.', komponenten: [], identmedien: ['Schlüssel']
    },
    {
      id: 'evva-akb', hersteller: 'EVVA', name: 'AirKey kombiniert (mech. Notschlüssel)', typ: 'hybrid',
      hinweis: 'Elektronische Tür mit mechanischer Rückfallebene.', komponenten: [], identmedien: ['Schlüssel', 'Smartphone', 'Karte']
    },
    {
      id: 'sonstiges', hersteller: 'Sonstige', name: 'Sonstiges / Fremdfabrikat', typ: 'offen',
      hinweis: 'Freitext im Feld "Systemdetail" nutzen.', komponenten: [], identmedien: []
    }
  ];

  /* --- Zylinderarten ------------------------------------------------------ */
  var ZYLINDERARTEN = [
    'Doppelzylinder',
    'Doppelzylinder mit Not- und Gefahrenfunktion',
    'Knaufzylinder (Knauf außen)',
    'Knaufzylinder (Knauf innen)',
    'Doppelknaufzylinder (beidseitig Knauf)',
    'Halbzylinder',
    'Elektronikzylinder (Doppelknauf)',
    'Elektronikzylinder (Halbzylinder)',
    'Elektronikzylinder Freidreh / Komfort',
    'Elektronikzylinder Anti-Panik',
    'Elektronikzylinder Wetterschutz',
    'Hebelzylinder',
    'Möbelzylinder',
    'Vorhangschloss / Bügelschloss',
    'Briefkastenzylinder',
    'Schaltzylinder / Schließzylinder für Schaltschloss',
    'Rundzylinder',
    'Blindzylinder',
    'Kein Zylinder'
  ];

  /* --- Zutritts- / Funktionsart ------------------------------------------ */
  var ZUTRITTSARTEN = [
    'Einseitig (nur außen)',
    'Beidseitig (innen + außen)',
    'Comfort / Freidreh',
    'Not- und Gefahrenfunktion (beidseitig steckbar)',
    'VdS-Anforderung',
    'Flucht- und Rettungsweg (Panik)',
    'Brandschutztür',
    'Rauchschutztür',
    'Brand- und Rauchschutz',
    'Sicherheitstür / einbruchhemmend (RC)',
    'Nur mechanische Verriegelung',
    'Dauerentriegelt / Tagesfreischaltung',
    'Zeitgesteuert'
  ];

  /* --- Beschlags-/Drückerarten ------------------------------------------- */
  var BESCHLAGARTEN = [
    'Rosettengarnitur Drücker/Drücker',
    'Rosettengarnitur Knauf/Drücker',
    'Langschildgarnitur Drücker/Drücker',
    'Langschildgarnitur Knauf/Drücker',
    'Schutzbeschlag ES0',
    'Schutzbeschlag ES1',
    'Schutzbeschlag ES2',
    'Schutzbeschlag ES3',
    'Wechselgarnitur',
    'Panikbeschlag / Fluchttürbeschlag',
    'Stoßgriff / Ziehgriff',
    'Elektronischer Türbeschlag',
    'Kein Beschlag erforderlich'
  ];

  /* --- Schlossarten ------------------------------------------------------- */
  var SCHLOSSARTEN = [
    'Einsteckschloss Buntbart',
    'Einsteckschloss PZ',
    'Einsteckschloss PZ selbstverriegelnd',
    'Rohrrahmenschloss PZ',
    'Panikschloss Funktion B (Umschaltfunktion)',
    'Panikschloss Funktion E (Wechselfunktion)',
    'Panikschloss Funktion D (Durchgangsfunktion)',
    'Mehrfachverriegelung (mechanisch)',
    'Mehrfachverriegelung (automatisch/selbstverriegelnd)',
    'Motorschloss',
    'Elektrischer Türöffner',
    'Haftmagnet',
    'Möbelschloss',
    'Unbekannt / vor Ort prüfen'
  ];

  /* --- DIN-Richtung ------------------------------------------------------- */
  var DIN_RICHTUNG = ['DIN links', 'DIN rechts', 'Pendeltür', 'Unbekannt'];
  var TUER_OEFFNUNG = ['nach innen öffnend', 'nach außen öffnend', 'unbekannt'];

  /* --- Türkategorien ------------------------------------------------------ */
  var TUERKATEGORIEN = [
    'Haupteingang',
    'Nebeneingang',
    'Hintereingang / Lieferantentür',
    'Innentür Büro',
    'Innentür Flur',
    'Technikraum / Heizung',
    'Elektroraum / HAK',
    'Serverraum / EDV',
    'Lager / Archiv',
    'Sanitär / WC',
    'Aufzug / Aufzugsschacht',
    'Tiefgarage / Garagentor',
    'Fluchttür / Notausgang',
    'Hoftor / Außenanlage',
    'Briefkastenanlage',
    'Schrank / Möbel / Spind',
    'Sonstige'
  ];

  /* --- Türblattmaterial --------------------------------------------------- */
  var TUERMATERIAL = [
    'Holz', 'Stahl / Metall', 'Alu (Rohrrahmen)', 'Kunststoff',
    'Glas / Ganzglastür', 'Alu-Glas', 'Holz-Glas', 'Sonstiges'
  ];

  /* --- Aufmaß-Status ------------------------------------------------------ */
  var STATUS = [
    { id: 'offen',        label: 'Offen',          farbe: '#9aa3ad' },
    { id: 'aufgemessen',  label: 'Aufgemessen',    farbe: '#1f9d55' },
    { id: 'klaerung',     label: 'Klärung nötig',  farbe: '#e0761a' },
    { id: 'nacharbeit',   label: 'Nacharbeit',     farbe: '#c62828' },
    { id: 'freigegeben',  label: 'Freigegeben',    farbe: '#1565c0' }
  ];

  /* --- Schließungs-/Gruppentypen für den Schließplan ---------------------- */
  var SCHLIESSUNG_TYPEN = [
    { id: 'ghs',   label: 'GHS (Generalhauptschlüssel)',  kuerzel: 'GHS' },
    { id: 'hs',    label: 'HS (Hauptschlüssel)',          kuerzel: 'HS'  },
    { id: 'gs',    label: 'GS (Gruppenschlüssel)',        kuerzel: 'GS'  },
    { id: 'ugs',   label: 'UGS (Untergruppenschlüssel)',  kuerzel: 'UGS' },
    { id: 'ez',    label: 'EZ (Einzelschließung)',        kuerzel: 'EZ'  },
    { id: 'person',label: 'Person / Mitarbeiter',         kuerzel: 'P'   },
    { id: 'gruppe',label: 'Personengruppe / Abteilung',   kuerzel: 'GR'  },
    { id: 'extern',label: 'Extern (Reinigung, Notdienst)',kuerzel: 'EXT' }
  ];

  /* --- Berechtigungswerte in der Matrix ----------------------------------- */
  var BERECHTIGUNG = [
    { id: 'nein',  zeichen: '',   label: 'nicht berechtigt' },
    { id: 'ja',    zeichen: 'X',  label: 'berechtigt' },
    { id: 'zeit',  zeichen: 'Z',  label: 'berechtigt, zeitbeschränkt' },
    { id: 'temp',  zeichen: 'T',  label: 'temporär / befristet' },
    { id: 'sperr', zeichen: '–',  label: 'ausdrücklich gesperrt' }
  ];

  /* --- Hilfsfunktionen ---------------------------------------------------- */
  function systemById(id, extraSysteme) {
    var alle = SYSTEME.concat(extraSysteme || []);
    for (var i = 0; i < alle.length; i++) { if (alle[i].id === id) return alle[i]; }
    return null;
  }
  function systemLabel(id, extraSysteme) {
    var s = systemById(id, extraSysteme);
    if (!s) return id ? String(id) : 'Ohne Systemzuordnung';
    /* "Nuki Nuki" vermeiden, wenn Hersteller und Produktname identisch sind */
    if (!s.hersteller || s.hersteller === s.name) return s.name;
    if (s.name.indexOf(s.hersteller) === 0) return s.name;
    return s.hersteller + ' ' + s.name;
  }
  function statusById(id) {
    for (var i = 0; i < STATUS.length; i++) { if (STATUS[i].id === id) return STATUS[i]; }
    return STATUS[0];
  }
  function berechtigungZeichen(id) {
    for (var i = 0; i < BERECHTIGUNG.length; i++) { if (BERECHTIGUNG[i].id === id) return BERECHTIGUNG[i].zeichen; }
    return '';
  }

  global.Katalog = {
    TECHNOLOGIE: TECHNOLOGIE,
    SYSTEME: SYSTEME,
    ZYLINDERARTEN: ZYLINDERARTEN,
    ZUTRITTSARTEN: ZUTRITTSARTEN,
    BESCHLAGARTEN: BESCHLAGARTEN,
    SCHLOSSARTEN: SCHLOSSARTEN,
    DIN_RICHTUNG: DIN_RICHTUNG,
    TUER_OEFFNUNG: TUER_OEFFNUNG,
    TUERKATEGORIEN: TUERKATEGORIEN,
    TUERMATERIAL: TUERMATERIAL,
    STATUS: STATUS,
    SCHLIESSUNG_TYPEN: SCHLIESSUNG_TYPEN,
    BERECHTIGUNG: BERECHTIGUNG,
    systemById: systemById,
    systemLabel: systemLabel,
    statusById: statusById,
    berechtigungZeichen: berechtigungZeichen
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Katalog; }
})(typeof window !== 'undefined' ? window : globalThis);
