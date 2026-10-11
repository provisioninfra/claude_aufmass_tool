/* =============================================================================
 * catalog.js — Fachlicher Stammdaten-Katalog für Schließanlagen-Aufmaß
 * Kein Framework, kein Build, keine externen Abhängigkeiten.
 * Alle Listen sind bewusst als einfache Arrays gehalten und können vom
 * Anwender in den Einstellungen erweitert werden (siehe store.js -> settings).
 * ========================================================================== */
(function (global) {
  'use strict';

  /* --- Anlagenart des Projekts -------------------------------------------
   * Wird einmal je Projekt festgelegt. Bei "hybrid" wird an der einzelnen
   * Tür nur noch entschieden, ob sie mechanisch oder elektronisch ausgeführt
   * wird - das System selbst steht bereits fest. */
  var ANLAGENART = [
    { id: 'mechanik',    label: 'Mechanische Schließanlage',
      hinweis: 'Ein mechanisches System für das gesamte Objekt.' },
    { id: 'elektronik',  label: 'Elektronische Schließanlage',
      hinweis: 'Ein elektronisches System für das gesamte Objekt.' },
    { id: 'hybrid',      label: 'Hybrid (Mechanik und Elektronik)',
      hinweis: 'Zwei Systeme im Objekt. Je Tür wird nur noch gewählt, welches davon zum Einsatz kommt.' }
  ];

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
      komponenten: [],
      identmedien: ['Smartphone (App)', 'Karte', 'Schlüsselanhänger', 'Kombi-Schlüssel']
    },
    {
      id: 'evva-xesar', hersteller: 'EVVA', name: 'Xesar', typ: 'elektronisch',
      hinweis: 'Eigenständige Anlage mit Xesar-Software, virtuelles Netzwerk über Wandleser.',
      komponenten: [],
      identmedien: ['Karte', 'Schlüsselanhänger', 'Armband', 'Smartphone (sofern freigeschaltet)']
    },
    /* ---------------------- SimonsVoss --------------------------------- */
    {
      id: 'sv-mobilekey', hersteller: 'SimonsVoss', name: 'MobileKey', typ: 'elektronisch',
      hinweis: 'Kleinanlage / Web-App. Für kleinere Objekte ausgelegt.',
      komponenten: [],
      identmedien: ['Transponder', 'Karte', 'Smartphone (App)', 'PinCode-Tastatur']
    },
    {
      id: 'sv-3060', hersteller: 'SimonsVoss', name: 'System 3060', typ: 'elektronisch',
      hinweis: 'Klassisches System 3060 mit LSM-Software.',
      komponenten: [],
      identmedien: ['Transponder', 'SmartCard', 'SmartTag', 'PinCode-Tastatur']
    },
    {
      id: 'sv-ax', hersteller: 'SimonsVoss', name: 'System AX (Digital Cylinder AX)', typ: 'elektronisch',
      hinweis: 'AX-Generation, BLE-fähig, AX-Manager / LSM.',
      komponenten: [],
      identmedien: ['Transponder AX', 'SmartCard (MIFARE)', 'Smartphone (BLE App)', 'PinCode AX']
    },
    /* ---------------------- Weitere ------------------------------------ */
    {
      id: 'keyota', hersteller: 'Keyota', name: 'Keyota', typ: 'elektronisch',
      hinweis: 'Komponentenliste im Menü "Einstellungen" an den konkreten Lieferumfang anpassen.',
      komponenten: [],
      identmedien: ['Smartphone (App)', 'Karte', 'Schlüsselanhänger']
    },
    {
      id: 'nuki', hersteller: 'Nuki', name: 'Nuki', typ: 'elektronisch',
      hinweis: 'Nachrüstlösung, sitzt in der Regel innen auf dem vorhandenen Zylinder (Not- und Gefahrenfunktion beachten).',
      komponenten: [],
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

  /* --- Zylinder ----------------------------------------------------------
   * Bewusst in drei unabhängige Angaben getrennt, damit nichts doppelt
   * gewählt werden muss:
   *   BAUFORM      - was für ein Zylinder (immer genau einer)
   *   AUSFUEHRUNG  - Zusatzfunktionen (mehrere möglich)
   *   Technologie  - ergibt sich aus dem gewählten System, wird nicht gefragt
   * -------------------------------------------------------------------- */
  var ZYLINDER_BAUFORM = [
    'Doppelzylinder',
    'Halbzylinder',
    'Knaufzylinder',
    'Doppelknaufzylinder',
    'Hebelzylinder',
    'Möbelzylinder',
    'Vorhangschloss / Bügelschloss',
    'Briefkastenzylinder',
    'Schaltzylinder',
    'Rundzylinder',
    'Blindzylinder',
    'Motorzylinder EVVA EMZY'
  ];

  var ZYLINDER_AUSFUEHRUNG = [
    'Not- und Gefahrenfunktion',
    'Freidreh',
    'Comfort',
    'Anti-Panik',
    'Wetterschutz',
    'erhöhter Bohrschutz',
    'Ziehschutz',
    'gleichschließend',
    'Sonderlänge'
  ];

  /* Nur bei Knaufzylinder abgefragt */
  var KNAUFSEITE = ['Knauf außen', 'Knauf innen', 'Knauf beidseitig'];

  /* Vollständige Bezeichnung aus den Einzelangaben aufbauen - dieser Text
   * erscheint in Türliste und Materialliste. */
  function zylinderText(tuer) {
    if (!tuer || !tuer.brauchtZylinder) return '';
    var teile = [];
    if (tuer.zylinderBauform) teile.push(tuer.zylinderBauform);
    if (tuer.zylinderKnaufseite && tuer.zylinderBauform === 'Knaufzylinder') {
      teile.push('(' + tuer.zylinderKnaufseite + ')');
    }
    var a = (tuer.zylinderAusfuehrung || []).filter(Boolean);
    if (a.length) teile.push('· ' + a.join(', '));
    return teile.join(' ').trim();
  }

  /* --- Zutrittsseite und Türanforderungen --------------------------------
   * Früher eine gemischte Liste; jetzt getrennt, weil es zwei verschiedene
   * Fragen sind. Zylinderfunktionen (Freidreh, Not- und Gefahrenfunktion)
   * stehen ausschließlich bei der Zylinderausführung.
   * -------------------------------------------------------------------- */
  var ZUTRITTSSEITE = [
    'nur außen',
    'innen und außen',
    'nur innen',
    'Durchgangsfunktion / dauerentriegelt'
  ];

  var TUERANFORDERUNG = [
    'Flucht- und Rettungsweg',
    'Brandschutz',
    'Rauchschutz',
    'einbruchhemmend (RC)',
    'VdS-Anforderung',
    'Nassbereich / Außenbereich',
    'barrierefrei',
    'Zeitsteuerung vorgesehen'
  ];

  /* --- Beschlag ----------------------------------------------------------
   * Bauform, Bestückung und Sicherheitsklasse sind unabhängig voneinander.
   * -------------------------------------------------------------------- */
  var BESCHLAG_BAUFORM = [
    'Rosettengarnitur',
    'Langschildgarnitur',
    'Schutzbeschlag',
    'Wechselgarnitur',
    'Panikbeschlag / Fluchttürbeschlag',
    'Stoßgriff / Ziehgriff',
    'Elektronischer Türbeschlag'
  ];

  var BESCHLAG_BESTUECKUNG = [
    'Drücker / Drücker',
    'Knauf / Drücker',
    'Knauf / Knauf',
    'Drücker / Stoßgriff'
  ];

  /* Nur bei Schutzbeschlag abgefragt */
  var BESCHLAG_SICHERHEIT = ['ES0', 'ES1', 'ES2', 'ES3'];

  /* Wie der Beschlag ausgeführt ist - bestellrelevant, weil elektronische
   * Beschläge je Seite kalkuliert werden. */
  var BESCHLAG_AUSFUEHRUNG = [
    'rein mechanisch',
    'einseitig elektronisch (außen)',
    'einseitig elektronisch (innen)',
    'beidseitig elektronisch'
  ];

  /* --- Feste Maßraster ---------------------------------------------------
   * Überall, wo es ein übliches Raster gibt, wird ausgewählt statt getippt:
   * vor Ort ist das schneller, mit dem Stift treffsicher und verhindert
   * Zahlendreher. Jedes Raster hat zusätzlich "anderes Maß …" - kein Wert
   * ist dadurch ausgeschlossen.
   * -------------------------------------------------------------------- */
  var DORNMASS = ['25', '30', '35', '40', '45', '50', '55', '60', '65', '70',
                  '75', '80', '85', '90', '95', '100', '110', '120'];
  var ENTFERNUNG = ['72', '74', '78', '88', '92', '94'];
  var VIERKANT = ['7', '8', '8,5', '9', '10'];

  /* Profilzylinder: 5-mm-Raster ab 30. 27,5 ist die kürzeste Hälfte,
     10 die feste Innenseite eines Halbzylinders. */
  var ZYLINDER_LAENGE = ['10', '27,5', '30', '35', '40', '45', '50', '55', '60',
                         '65', '70', '75', '80', '85', '90', '95', '100',
                         '105', '110', '115', '120'];
  var TUERBLATTSTAERKE = ['38', '39', '40', '42', '45', '50', '55', '58', '60',
                          '65', '68', '70', '75', '80', '85', '90', '95', '100'];
  var PROFILBREITE = ['40', '45', '50', '55', '60', '65', '70', '75', '80',
                      '85', '90', '100', '110', '120'];
  var STULPLAENGE = ['170', '200', '235', '240', '245', '250', '255', '260',
                     '270', '300', '400', '500', '600', '800', '1000'];
  var VERRIEGELUNGSPUNKTE = ['1', '2', '3', '5', '7'];
  /* Türblattmaße nach DIN 18101 sowie gängige Rohrrahmenbreiten */
  var TUERBREITE = ['610', '735', '860', '885', '985', '1110', '1235'];
  var TUERHOEHE = ['1985', '2010', '2110', '2135'];

  var ANDERES_MASS = 'anderes Maß …';

  function beschlagText(tuer) {
    if (!tuer || !tuer.brauchtBeschlag) return '';
    var teile = [];
    if (tuer.beschlagBauform) teile.push(tuer.beschlagBauform);
    if (tuer.beschlagSicherheit && /Schutzbeschlag/.test(tuer.beschlagBauform || '')) {
      teile.push(tuer.beschlagSicherheit);
    }
    if (tuer.beschlagBestueckung) teile.push('· ' + tuer.beschlagBestueckung);
    if (tuer.beschlagAusfuehrung) teile.push('· ' + tuer.beschlagAusfuehrung);
    return teile.join(' ').trim();
  }

  /* Ist der Beschlag elektronisch? Bestimmt, ob er als elektronische
   * Komponente kalkuliert wird. */
  function beschlagIstElektronisch(tuer) {
    return /elektronisch/i.test(String((tuer && tuer.beschlagAusfuehrung) || ''));
  }

  /* --- Schloss -----------------------------------------------------------
   * Bauform und Funktion getrennt: ein Einsteckschloss kann Panikfunktion
   * haben, ein Panikschloss ist keine eigene Bauform.
   * -------------------------------------------------------------------- */
  var SCHLOSS_BAUFORM = [
    'Einsteckschloss',
    'Rohrrahmenschloss',
    'Mehrfachverriegelung',
    'Motorschloss',
    'Möbelschloss',
    'Elektrischer Türöffner',
    'Haftmagnet'
  ];

  var SCHLOSS_FUNKTION = [
    'Profilzylinder (PZ)',
    'Buntbart',
    'selbstverriegelnd',
    'automatisch verriegelnd',
    'Panik Funktion B (Umschaltfunktion)',
    'Panik Funktion E (Wechselfunktion)',
    'Panik Funktion D (Durchgangsfunktion)',
    'Panik Funktion C',
    'Freilauffunktion'
  ];

  /* --- Einsteckschloss im Detail (optional) ------------------------------
   * Diese Angaben sind beim Bestellen eines Einsteckschlosses entscheidend,
   * gehören aber nicht zur Grundauswahl. Die Fallenart stand früher in der
   * Liste der Funktionen - sie ist jedoch eine Bauart der Falle und keine
   * Funktion des Schlosses. Deshalb steht sie jetzt genau hier.
   * -------------------------------------------------------------------- */
  var STULPFORM = ['Flachstulp eckig', 'Flachstulp abgerundet', 'U-Stulp', 'Winkelstulp'];
  var FALLENART = ['Fallenriegel (Standard)', 'Rollfalle', 'Kreuzfalle', 'Hakenfalle',
                   'Schwenkhaken', 'Bolzenverriegelung'];
  var SCHLOSS_NORM = ['EN 179', 'EN 1125', 'EN 12209', 'EN 14846', 'DIN 18251'];
  var STULPBREITE = ['16', '18', '20', '22', '24', '25', '30', '40'];
  var RIEGELAUSSCHLUSS = ['14', '16', '18', '20', '25', '28', '35', '40', '45'];

  /* --- Türmaße (optional) ------------------------------------------------- */
  var TUER_ANSCHLAG = ['gefälzt', 'stumpf einschlagend', 'unbekannt'];

  /* --- Strom und Kabel an der Tür (optional) ------------------------------
   * Entscheidet bei elektronischen Beschlägen und Motorschlössern darüber,
   * ob zusätzlich verlegt werden muss. */
  var KABELUEBERGANG = ['Kabelübergang vorhanden', 'Leerrohr vorhanden',
                        'nichts vorhanden', 'unbekannt'];

  /* Lesbarer Text der Einsteckschloss-Details für Listen und Ausgaben */
  function schlossDetailText(tuer) {
    if (!tuer || !tuer.brauchtSchloss) return '';
    var teile = [];
    if (tuer.schlossStulpform) teile.push(tuer.schlossStulpform);
    if (tuer.schlossStulpbreite) teile.push('Stulp ' + tuer.schlossStulpbreite + ' mm');
    if (tuer.schlossStulplaenge) teile.push('Stulplänge ' + tuer.schlossStulplaenge + ' mm');
    if (tuer.schlossFallenart) teile.push(tuer.schlossFallenart);
    if (tuer.schlossRiegelausschluss) teile.push('Riegel ' + tuer.schlossRiegelausschluss + ' mm');
    if (tuer.schlossVerriegelungspunkte) teile.push(tuer.schlossVerriegelungspunkte + ' Verriegelungspunkte');
    if (tuer.schlossNorm) teile.push(tuer.schlossNorm);
    return teile.join(' · ');
  }

  function schlossText(tuer) {
    if (!tuer || !tuer.brauchtSchloss) return '';
    var teile = [];
    if (tuer.schlossBauform) teile.push(tuer.schlossBauform);
    if (tuer.schlossFunktion) teile.push('· ' + tuer.schlossFunktion);
    return teile.join(' ').trim();
  }

  /* --- DIN-Richtung ------------------------------------------------------- */
  var DIN_RICHTUNG = ['DIN links', 'DIN rechts', 'Pendeltür', 'Unbekannt'];
  var TUER_OEFFNUNG = ['nach innen öffnend', 'nach außen öffnend', 'unbekannt'];

  /* --- Türkategorien ------------------------------------------------------ */
  var TUERKATEGORIEN = [
    /* Zugänge */
    'Haupteingang',
    'Nebeneingang',
    'Hintereingang / Lieferanteneingang',
    'Personaleingang',
    'Besuchereingang',
    'Windfang / Schleuse',
    /* Innen */
    'Innentür Büro',
    'Innentür Flur',
    'Innentür Besprechung',
    'Innentür Aufenthalt / Pausenraum',
    'Innentür Wohnung',
    'Wohnungseingangstür',
    'Zimmertür',
    /* Technik und Versorgung */
    'Technikraum',
    'Heizungsraum',
    'Elektroraum / HAK',
    'Serverraum / EDV',
    'Aufzugsmaschinenraum',
    'Lüftungszentrale',
    'Wasserübergabe / Hauswasserstation',
    'Müllraum',
    'Putzmittelraum',
    /* Lager und Nebenräume */
    'Lager',
    'Archiv',
    'Werkstatt',
    'Garderobe / Umkleide',
    'Sanitär / WC',
    'Dusche',
    'Keller / Kellerabteil',
    'Dachboden / Spitzboden',
    /* Außen und Verkehrsflächen */
    'Tiefgarage',
    'Garage / Garagentor',
    'Hoftor / Einfahrt',
    'Fahrradraum',
    'Außenanlage / Gartentor',
    'Schranke / Poller',
    /* Sicherheit und Sonderbereiche */
    'Fluchttür / Notausgang',
    'Brandschutztür',
    'Treppenhaustür',
    'Aufzug / Aufzugsschacht',
    'Tresorraum / Wertschutz',
    'Labor',
    'Reinraum',
    'Kühlraum',
    'Arztzimmer / Behandlung',
    'Medikamentenschrank',
    'Klassenraum',
    'Hörsaal / Seminarraum',
    'Produktion / Halle',
    'Verkaufsraum',
    'Kasse / Geldbereich',
    /* Kleinzylinder */
    'Briefkastenanlage',
    'Schrank / Möbel',
    'Spind / Schließfach',
    'Schaltschrank',
    'Vitrine',
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

  /* --- Rang einer Schließung im Plan -------------------------------------
   * Ausschließlich der Rang. Wer das Medium trägt, ist eine andere Frage
   * und steht in TRAEGER_ART - früher standen "Person" und
   * "Personengruppe" mit in dieser Liste, sodass man zweimal dasselbe
   * wählen musste. Beides wird bei der Überführung getrennt. */
  var SCHLIESSUNG_TYPEN = [
    { id: 'ghs',   label: 'GHS (Generalhauptschlüssel)',  kuerzel: 'GHS' },
    { id: 'hs',    label: 'HS (Hauptschlüssel)',          kuerzel: 'HS'  },
    { id: 'gs',    label: 'GS (Gruppenschlüssel)',        kuerzel: 'GS'  },
    { id: 'ugs',   label: 'UGS (Untergruppenschlüssel)',  kuerzel: 'UGS' },
    { id: 'ez',    label: 'EZ (Einzelschließung)',        kuerzel: 'EZ'  },
    { id: 'extern',label: 'Extern (Reinigung, Notdienst)',kuerzel: 'EXT' }
  ];

  /* --- Träger einer Schließung -------------------------------------------
   * Antwort auf die Frage "Wer bekommt dieses Medium?". Bewusst getrennt
   * vom Typ: der Typ sagt, welchen Rang die Schließung im Plan hat
   * (GHS, HS, GS ...), der Träger sagt, wer sie in der Hand hält.
   * -------------------------------------------------------------------- */
  var TRAEGER_ART = [
    { id: 'einzel', label: 'Einzelperson(en)',
      hinweis: 'Namentlich benannte Personen. Jede Person kann eine eigene Anzahl Medien haben.' },
    { id: 'gruppe', label: 'Gruppe',
      hinweis: 'Eine benannte Gruppe (z. B. Reinigung, IT). Auf den Gruppennamen tippen, um die Mitglieder zu hinterlegen.' }
  ];

  /* Kurztext zum Träger für Spaltenköpfe, Listen und PDF */
  function traegerText(schliessung) {
    var s = schliessung || {};
    var personen = (s.personen || []).filter(function (x) { return x && x.name; });
    if (s.traegerArt === 'gruppe') {
      var name = s.gruppenName || s.abteilung || '';
      if (!name) name = 'Gruppe';
      return name + (personen.length ? (' (' + personen.length +
        (personen.length === 1 ? ' Person)' : ' Personen)')) : '');
    }
    if (personen.length) {
      if (personen.length <= 2) {
        return personen.map(function (x) { return x.name; }).join(', ');
      }
      return personen[0].name + ' und ' + (personen.length - 1) + ' weitere';
    }
    /* Angaben aus einer früheren Fassung, falls noch nicht überführt */
    return s.person || s.abteilung || '';
  }

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
  /* Systeme nach Technologie filtern - für die Auswahl im Projekt. */
  function systemeNachTyp(typ, extraSysteme) {
    return SYSTEME.concat(extraSysteme || []).filter(function (s) {
      if (s.id === 'sonstiges') return true;
      if (typ === 'elektronisch') return s.typ === 'elektronisch' || s.typ === 'hybrid';
      if (typ === 'mechanisch') return s.typ === 'mechanisch' || s.typ === 'hybrid';
      return true;
    });
  }

  /* Die Technologie ergibt sich aus dem System und wird deshalb nicht
   * mehr getrennt abgefragt. */
  function systemTechnologie(systemId, extraSysteme) {
    var s = systemById(systemId, extraSysteme);
    return s ? (s.typ || 'offen') : 'offen';
  }
  function istElektronisch(systemId, extraSysteme) {
    var t = systemTechnologie(systemId, extraSysteme);
    return t === 'elektronisch' || t === 'hybrid';
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
    ANLAGENART: ANLAGENART,
    TECHNOLOGIE: TECHNOLOGIE,
    SYSTEME: SYSTEME,
    systemeNachTyp: systemeNachTyp,
    /* Zylinder in unabhängigen Angaben */
    ZYLINDER_BAUFORM: ZYLINDER_BAUFORM,
    ZYLINDER_AUSFUEHRUNG: ZYLINDER_AUSFUEHRUNG,
    KNAUFSEITE: KNAUFSEITE,
    zylinderText: zylinderText,
    /* Beschlag */
    BESCHLAG_BAUFORM: BESCHLAG_BAUFORM,
    BESCHLAG_BESTUECKUNG: BESCHLAG_BESTUECKUNG,
    BESCHLAG_SICHERHEIT: BESCHLAG_SICHERHEIT,
    BESCHLAG_AUSFUEHRUNG: BESCHLAG_AUSFUEHRUNG,
    beschlagIstElektronisch: beschlagIstElektronisch,
    DORNMASS: DORNMASS,
    ENTFERNUNG: ENTFERNUNG,
    VIERKANT: VIERKANT,
    ZYLINDER_LAENGE: ZYLINDER_LAENGE,
    TUERBLATTSTAERKE: TUERBLATTSTAERKE,
    PROFILBREITE: PROFILBREITE,
    STULPLAENGE: STULPLAENGE,
    VERRIEGELUNGSPUNKTE: VERRIEGELUNGSPUNKTE,
    TUERBREITE: TUERBREITE,
    TUERHOEHE: TUERHOEHE,
    ANDERES_MASS: ANDERES_MASS,
    beschlagText: beschlagText,
    /* Schloss */
    SCHLOSS_BAUFORM: SCHLOSS_BAUFORM,
    SCHLOSS_FUNKTION: SCHLOSS_FUNKTION,
    schlossText: schlossText,
    /* Einsteckschloss im Detail (optional) */
    STULPFORM: STULPFORM,
    FALLENART: FALLENART,
    SCHLOSS_NORM: SCHLOSS_NORM,
    STULPBREITE: STULPBREITE,
    RIEGELAUSSCHLUSS: RIEGELAUSSCHLUSS,
    schlossDetailText: schlossDetailText,
    /* Tür */
    TUER_ANSCHLAG: TUER_ANSCHLAG,
    KABELUEBERGANG: KABELUEBERGANG,
    ZUTRITTSSEITE: ZUTRITTSSEITE,
    TUERANFORDERUNG: TUERANFORDERUNG,
    DIN_RICHTUNG: DIN_RICHTUNG,
    TUER_OEFFNUNG: TUER_OEFFNUNG,
    TUERKATEGORIEN: TUERKATEGORIEN,
    TUERMATERIAL: TUERMATERIAL,
    STATUS: STATUS,
    SCHLIESSUNG_TYPEN: SCHLIESSUNG_TYPEN,
    TRAEGER_ART: TRAEGER_ART,
    traegerText: traegerText,
    BERECHTIGUNG: BERECHTIGUNG,
    systemById: systemById,
    systemLabel: systemLabel,
    systemTechnologie: systemTechnologie,
    istElektronisch: istElektronisch,
    statusById: statusById,
    berechtigungZeichen: berechtigungZeichen
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Katalog; }
})(typeof window !== 'undefined' ? window : globalThis);
