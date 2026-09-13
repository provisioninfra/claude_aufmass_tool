/* =============================================================================
 * reports.js — PDF-Ausgaben: Türliste, Kreuzschließplan, Materialliste
 * ========================================================================== */
(function (global) {
  'use strict';

  var K = global.Katalog;
  var M = global.Model;
  var PDF = global.PDF;

  var FARBE = {
    text:      '#1a1f26',
    grau:      '#5c6670',
    hellgrau:  '#8d969e',
    linie:     '#b9c0c7',
    linieHell: '#dde2e7',
    kopfBg:    '#e8edf2',
    zebraBg:   '#f5f7f9',
    akzent:    '#1a4b8c',
    warn:      '#b3541e',
    fehler:    '#a32020'
  };

  function txt(v) { return (v === null || v === undefined || v === '') ? '' : String(v); }
  function plural(n, ein, viele) { return n + ' ' + (n === 1 ? ein : viele); }
  /* Kategorie nur ausgeben, wenn sie nicht schon in der Bezeichnung steckt. */
  function kategorieZusatz(t) {
    if (!t.kategorie) return '';
    var bez = String(t.bezeichnung || '').toLowerCase();
    var kat = String(t.kategorie).toLowerCase();
    if (bez.indexOf(kat) !== -1) return '';
    var ersterTeil = kat.split(/[\/(]/)[0].trim();
    if (ersterTeil.length > 3 && bez.indexOf(ersterTeil) !== -1) return '';
    return t.kategorie;
  }
  function datumDe(iso) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? (m[3] + '.' + m[2] + '.' + m[1]) : iso;
  }
  function jetztDe() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function dateiName(projekt, suffix) {
    var basis = (projekt.kunde || projekt.name || 'Aufmass').replace(/[^\wäöüÄÖÜß \-]/g, '').trim();
    var objekt = (projekt.objekt || '').replace(/[^\wäöüÄÖÜß \-]/g, '').trim();
    var teile = [basis];
    if (objekt) teile.push(objekt);
    teile.push(suffix);
    teile.push(M.heute());
    return teile.join('_').replace(/\s+/g, '-') + '.pdf';
  }

  /* =========================================================================
   * Gemeinsamer Seitenkopf / Seitenfuß
   * ====================================================================== */
  function kopfUndFussSetzen(doc, projekt, einstellungen, dokumentTitel) {
    einstellungen = einstellungen || {};
    var logoId = einstellungen.logoDataUrl ? doc.bildRegistrieren(einstellungen.logoDataUrl) : null;

    doc.onSeitenkopf = function (d) {
      var x = d.rand.links, y = d.rand.oben;
      var rechts = d.breite - d.rand.rechts;
      var textX = x;

      if (logoId) {
        var gezeichnet = d.bild(logoId, x, y, 32, 14);
        if (gezeichnet) textX = x + gezeichnet.breite + 5;
      }

      d.text(dokumentTitel, textX, y, { size: 13, bold: true, color: FARBE.akzent });
      /* Breite des Firmenblocks rechts dynamisch bestimmen, damit die
         Objektzeile auf schmalen Hochformatseiten nicht unnötig kürzt. */
      var firmaBreite = 0;
      [einstellungen.firma, einstellungen.firmaZusatz, einstellungen.firmaTelefon,
       einstellungen.firmaEmail].forEach(function (z, i) {
        if (!z) return;
        var w = d.textBreite(z, 7.2, i === 0);
        if (w > firmaBreite) firmaBreite = w;
      });
      firmaBreite = Math.min(firmaBreite, 62);
      var titelBreite = Math.max(30, rechts - textX - firmaBreite - 5);

      var zeile2 = [];
      if (projekt.kunde) zeile2.push(projekt.kunde);
      if (projekt.objekt) zeile2.push(projekt.objekt);
      d.text(d.kuerzen(zeile2.join('  |  '), titelBreite, 8.5, false), textX, y + 5.6,
             { size: 8.5, color: FARBE.grau });
      var zeile3 = [];
      if (projekt.anlagenNr) zeile3.push('Anlagen-Nr. ' + projekt.anlagenNr);
      if (projekt.strasse || projekt.ort) {
        zeile3.push([projekt.strasse, [projekt.plz, projekt.ort].filter(Boolean).join(' ')]
          .filter(Boolean).join(', '));
      }
      if (zeile3.length) {
        d.text(d.kuerzen(zeile3.join('  |  '), titelBreite, 7.5, false), textX, y + 10.2,
               { size: 7.5, color: FARBE.hellgrau });
      }

      /* Firmenblock rechts */
      var firma = [];
      if (einstellungen.firma) firma.push(einstellungen.firma);
      if (einstellungen.firmaZusatz) firma.push(einstellungen.firmaZusatz);
      if (einstellungen.firmaTelefon) firma.push(einstellungen.firmaTelefon);
      if (einstellungen.firmaEmail) firma.push(einstellungen.firmaEmail);
      firma.slice(0, 4).forEach(function (z, i) {
        d.text(d.kuerzen(z, firmaBreite + 2, 7.2, i === 0), rechts, y + i * 3.6, {
          size: 7.2, align: 'right', bold: i === 0, color: i === 0 ? FARBE.text : FARBE.hellgrau
        });
      });

      var trennY = y + 15;
      d.linie(x, trennY, rechts, trennY, { color: FARBE.akzent, width: 0.5 });
      d.y = trennY + 5;
    };

    doc.onSeitenfuss = function (d, nr, gesamt) {
      var y = d.hoehe - d.rand.unten + 3;
      var rechts = d.breite - d.rand.rechts;
      d.linie(d.rand.links, y, rechts, y, { color: FARBE.linieHell, width: 0.2 });
      var links = [];
      if (einstellungen.firma) links.push(einstellungen.firma);
      links.push('Aufmaß ' + datumDe(projekt.aufmassDatum));
      if (projekt.bearbeiter) links.push(projekt.bearbeiter);
      d.text(d.kuerzen(links.join('  ·  '), d.inhaltsBreite() - 40, 7, false),
             d.rand.links, y + 1.5, { size: 7, color: FARBE.hellgrau });
      d.text('Stand ' + jetztDe() + '   Seite ' + nr + ' / ' + gesamt,
             rechts, y + 1.5, { size: 7, align: 'right', color: FARBE.hellgrau });
    };
  }

  /* Deckblatt-Datenblock für alle Reports */
  function projektKopfBlock(doc, projekt) {
    var x = doc.rand.links, b = doc.inhaltsBreite();
    var spalte = b / 3;
    var felder = [
      ['Kunde', projekt.kunde],
      ['Objekt', projekt.objekt],
      ['Adresse', [projekt.strasse, [projekt.plz, projekt.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')],
      ['Ansprechpartner', projekt.ansprechpartner],
      ['Telefon', projekt.telefon],
      ['E-Mail', projekt.email],
      ['Anlagen-Nr.', projekt.anlagenNr],
      ['Kunden-Nr.', projekt.kundenNr],
      ['Aufmaßdatum', datumDe(projekt.aufmassDatum)],
      ['Bearbeiter', projekt.bearbeiter]
    ].filter(function (f) { return txt(f[1]); });

    if (!felder.length) return;
    /* Zeilenhöhen aus dem längsten Wert der jeweiligen Rasterzeile ableiten,
       damit lange Kundennamen zweizeilig stehen statt abgeschnitten zu werden. */
    var zeilenAnzahl = Math.ceil(felder.length / 3);
    var zeilenHoehen = [];
    for (var z = 0; z < zeilenAnzahl; z++) {
      var maxH = 0;
      for (var sp2 = 0; sp2 < 3; sp2++) {
        var f2 = felder[z * 3 + sp2];
        if (!f2) continue;
        var h = doc.blockHoehe(txt(f2[1]), spalte - 6, { size: 8.5, bold: true, maxLines: 2 });
        if (h > maxH) maxH = h;
      }
      zeilenHoehen.push(Math.max(4.2, maxH) + 4.2);
    }
    var hoehe = zeilenHoehen.reduce(function (a, c) { return a + c; }, 0) + 3;
    doc.platzPruefen(hoehe + 4);
    var startY = doc.y;
    doc.rechteck(x, startY, b, hoehe, { fill: FARBE.zebraBg, stroke: FARBE.linieHell });
    var yOffsets = [], lauf = 2;
    zeilenHoehen.forEach(function (h2) { yOffsets.push(lauf); lauf += h2; });
    felder.forEach(function (f, i) {
      var sp = i % 3, ze = Math.floor(i / 3);
      var fx = x + sp * spalte + 3, fy = startY + yOffsets[ze];
      doc.text(f[0], fx, fy, { size: 6.8, color: FARBE.hellgrau });
      doc.textBlock(txt(f[1]), fx, fy + 3.4, spalte - 6, { size: 8.5, bold: true, maxLines: 2 });
    });
    doc.y = startY + hoehe + 5;
  }

  /* =========================================================================
   * Tabellenmaschine mit Seitenumbruch und wiederholtem Tabellenkopf
   * spalten: [{titel, key|render, breite, align, size, bold, maxLines}]
   * ====================================================================== */
  function tabelle(doc, spalten, zeilen, opt) {
    opt = opt || {};
    var x0 = doc.rand.links;
    var gesamtBreite = spalten.reduce(function (s, c) { return s + c.breite; }, 0);
    var schrift = opt.size || 7.6;
    var padX = 1.6, padY = 1.4;

    function kopfZeichnen() {
      var kopfHoehe = opt.headerHeight || 6.5;
      doc.platzPruefen(kopfHoehe + 8);
      var y = doc.y;
      doc.rechteck(x0, y, gesamtBreite, kopfHoehe, { fill: FARBE.kopfBg, stroke: FARBE.linie, width: 0.25 });
      var cx = x0;
      spalten.forEach(function (c) {
        var tx = cx + padX;
        if (c.align === 'center') tx = cx + c.breite / 2;
        else if (c.align === 'right') tx = cx + c.breite - padX;
        doc.text(doc.kuerzen(c.titel, c.breite - 2 * padX, 7, true), tx, y + padY + 0.4,
                 { size: 7, bold: true, align: c.align, color: FARBE.text });
        cx += c.breite;
        if (c !== spalten[spalten.length - 1]) {
          doc.linie(cx, y, cx, y + kopfHoehe, { color: FARBE.linie, width: 0.25 });
        }
      });
      doc.y = y + kopfHoehe;
    }

    kopfZeichnen();
    var zebra = 0;

    zeilen.forEach(function (zeile) {
      /* Gruppentrenner */
      if (zeile.__gruppe) {
        doc.platzPruefen(9 + 8);
        if (doc.y === doc.rand.oben + 20 || doc.aktuelleSeite.ops.length < 12) { /* frische Seite */ }
        var gy = doc.y + 1.5;
        doc.rechteck(x0, gy, gesamtBreite, 6.4, { fill: '#dce6f2', stroke: FARBE.linie, width: 0.25 });
        doc.text(doc.kuerzen(zeile.__gruppe, gesamtBreite - 40, 8.2, true), x0 + padX, gy + 1.3,
                 { size: 8.2, bold: true, color: FARBE.akzent });
        if (zeile.__gruppeRechts) {
          doc.text(zeile.__gruppeRechts, x0 + gesamtBreite - padX, gy + 1.5,
                   { size: 7.2, align: 'right', color: FARBE.grau });
        }
        doc.y = gy + 6.4;
        zebra = 0;
        return;
      }

      /* Zeilenhöhe aus dem höchsten Zellinhalt bestimmen */
      var zellen = spalten.map(function (c) {
        var wert = c.render ? c.render(zeile) : txt(zeile[c.key]);
        return { spalte: c, wert: txt(wert) };
      });
      var hoehe = 0;
      zellen.forEach(function (z) {
        var h = doc.blockHoehe(z.wert, z.spalte.breite - 2 * padX, {
          size: z.spalte.size || schrift, bold: z.spalte.bold, maxLines: z.spalte.maxLines || 3
        });
        if (h > hoehe) hoehe = h;
      });
      hoehe += 2 * padY;
      if (hoehe < 5.2) hoehe = 5.2;

      var umbrochen = doc.platzPruefen(hoehe);
      if (umbrochen) { kopfZeichnen(); zebra = 0; }

      var y = doc.y;
      if (zebra % 2 === 1) {
        doc.rechteck(x0, y, gesamtBreite, hoehe, { fill: FARBE.zebraBg });
      }
      if (zeile.__markierung) {
        doc.rechteck(x0, y, 1.2, hoehe, { fill: zeile.__markierung });
      }

      var cx = x0;
      var trenner = [];
      zellen.forEach(function (z, i) {
        var c = z.spalte;
        var tx = cx + padX, ausrichtung = c.align;
        var maxB = c.breite - 2 * padX;
        doc.textBlock(z.wert, tx, y + padY, maxB, {
          size: c.size || schrift, bold: c.bold, align: ausrichtung,
          color: c.color || FARBE.text, maxLines: c.maxLines || 3
        });
        cx += c.breite;
        if (i < spalten.length - 1) trenner.push([cx, y, cx, y + hoehe]);
      });
      trenner.push([x0, y + hoehe, x0 + gesamtBreite, y + hoehe]);
      doc.linienGruppe(trenner, { color: FARBE.linieHell, width: 0.2 });
      doc.y = y + hoehe;
      zebra++;
    });

    /* Rahmen links/rechts der letzten Seite */
    doc.linie(x0, doc.y, x0 + gesamtBreite, doc.y, { color: FARBE.linie, width: 0.3 });
    return doc.y;
  }

  /* =========================================================================
   * 1) TÜRLISTE
   * modus: 'kompakt' = Tabelle | 'detail' = Datenblatt je Tür
   * ====================================================================== */
  function tuerliste(projekt, einstellungen, optionen) {
    optionen = optionen || {};
    var modus = optionen.modus || 'kompakt';
    var mitFotos = optionen.mitFotos !== false;
    var quer = optionen.orientation || (modus === 'kompakt' ? 'landscape' : 'portrait');

    var doc = new PDF.Doc({
      format: 'a4', orientation: quer,
      titel: 'Türliste ' + (projekt.kunde || projekt.name),
      autor: einstellungen && einstellungen.firma || '',
      betreff: 'Aufmaß-Türliste',
      margin: { oben: 12, unten: 14, links: 10, rechts: 10 }
    });
    kopfUndFussSetzen(doc, projekt, einstellungen, 'Türliste / Aufmaßprotokoll');
    doc.neueSeite();
    projektKopfBlock(doc, projekt);

    var gruppen = M.tuerenGruppiert(projekt);
    if (!projekt.tueren.length) {
      doc.text('Für dieses Projekt wurden noch keine Türen erfasst.', doc.rand.links, doc.y,
               { size: 10, color: FARBE.grau });
      return doc;
    }

    if (modus === 'kompakt') {
      tuerlisteKompakt(doc, projekt, gruppen, einstellungen);
    } else {
      tuerlisteDetail(doc, projekt, gruppen, einstellungen, mitFotos);
    }

    zusammenfassung(doc, projekt, einstellungen);
    return doc;
  }

  function zutrittKurz(t) {
    var teile = [];
    if (t.zutrittsseite) teile.push(t.zutrittsseite);
    (t.tueranforderungen || []).forEach(function (a) {
      teile.push(String(a).replace('Flucht- und Rettungsweg', 'Flucht/Panik')
                          .replace('einbruchhemmend (RC)', 'RC')
                          .replace('VdS-Anforderung', 'VdS'));
    });
    return teile.join(', ');
  }

  function zylinderMass(t) {
    if (!t.masseAussen && !t.masseInnen) return '';
    return (t.masseAussen || '–') + ' / ' + (t.masseInnen || '–');
  }

  function tuerlisteKompakt(doc, projekt, gruppen, einstellungen) {
    var b = doc.inhaltsBreite();
    /* Spaltenbreiten als Anteile der verfügbaren Breite (A4 quer: 277 mm) */
    var anteile = [
      { titel: 'Nr.',            breite: 0.052, render: function (t) { return txt(t.nummer); }, bold: true },
      { titel: 'Bezeichnung / Raum', breite: 0.145, render: function (t) {
          var zusatz = kategorieZusatz(t);
          return txt(t.bezeichnung) + (zusatz ? ('\n' + zusatz) : ''); } },
      { titel: 'Anz.',           breite: 0.032, align: 'center', render: function (t) { return String(t.anzahl || 1); } },
      { titel: 'System',         breite: 0.115, render: function (t) {
          var s = t.systemId ? K.systemLabel(t.systemId, einstellungen && einstellungen.eigeneSysteme) : '–';
          return s + (t.systemDetail ? ('\n' + t.systemDetail) : ''); } },
      { titel: 'Zylinder',       breite: 0.125, render: function (t) {
          return K.zylinderText(t) || '–'; } },
      { titel: 'Maß a/i',        breite: 0.055, align: 'center', render: zylinderMass },
      { titel: 'Beschlag / Drücker', breite: 0.115, render: function (t) {
          var b = K.beschlagText(t);
          if (!b) return '–';
          return b + (t.vierkant ? ('\nVK ' + t.vierkant) : ''); } },
      { titel: 'Schloss',        breite: 0.105, render: function (t) {
          var sch = K.schlossText(t);
          if (!sch) return '–';
          var d = [];
          if (t.dornmass) d.push('DM ' + t.dornmass);
          if (t.entfernung) d.push('E ' + t.entfernung);
          return sch + (d.length ? ('\n' + d.join(' / ')) : ''); } },
      { titel: 'Zutritt / Anforderungen', breite: 0.125, render: zutrittKurz },
      { titel: 'DIN',            breite: 0.045, align: 'center', render: function (t) {
          return txt(t.dinRichtung).replace('DIN ', ''); } },
      { titel: 'Bemerkung',      breite: 0.086, render: function (t) {
          var n = [];
          if (t.notiz) n.push(t.notiz);
          if (t.nacharbeit) n.push('! ' + (t.nacharbeitText || 'Nacharbeit'));
          return n.join('\n'); } }
    ];
    var spalten = anteile.map(function (s) {
      var c = {}; for (var k in s) c[k] = s[k];
      c.breite = s.breite * b;
      return c;
    });

    var zeilen = [];
    gruppen.forEach(function (g) {
      var anz = g.tueren.reduce(function (s, t) { return s + (parseInt(t.anzahl, 10) || 1); }, 0);
      zeilen.push({ __gruppe: g.titel,
        __gruppeRechts: plural(g.tueren.length, 'Position', 'Positionen') + '  ·  ' + plural(anz, 'Tür', 'Türen') });
      g.tueren.forEach(function (t) {
        var kopie = Object.create(t);
        kopie.__markierung = t.nacharbeit ? FARBE.fehler : (K.statusById(t.status).farbe);
        zeilen.push(kopie);
      });
    });
    tabelle(doc, spalten, zeilen, { size: 7.2 });
  }

  function tuerlisteDetail(doc, projekt, gruppen, einstellungen, mitFotos) {
    var b = doc.inhaltsBreite();
    var x = doc.rand.links;

    gruppen.forEach(function (g) {
      doc.platzPruefen(16);
      doc.rechteck(x, doc.y, b, 7, { fill: '#dce6f2', stroke: FARBE.linie, width: 0.25 });
      doc.text(g.titel, x + 2, doc.y + 1.6, { size: 9.5, bold: true, color: FARBE.akzent });
      doc.text(plural(g.tueren.length, 'Tür', 'Türen'), x + b - 2, doc.y + 1.9,
               { size: 7.5, align: 'right', color: FARBE.grau });
      doc.y += 10;

      g.tueren.forEach(function (t) {
        tuerDatenblatt(doc, projekt, t, einstellungen, mitFotos);
      });
    });
  }

  function tuerDatenblatt(doc, projekt, t, einstellungen, mitFotos) {
    var x = doc.rand.links, b = doc.inhaltsBreite();
    var fotos = mitFotos ? (t.fotos || []) : [];

    var felder = [
      ['System', t.systemId ? K.systemLabel(t.systemId, einstellungen && einstellungen.eigeneSysteme) : '–'],
      ['Technologie', (K.TECHNOLOGIE.filter(function (x2) {
          return x2.id === K.systemTechnologie(t.systemId, einstellungen && einstellungen.eigeneSysteme);
        })[0] || {}).label || '–'],
      ['Kategorie', t.kategorie],
      ['Anzahl', String(t.anzahl || 1)],
      ['Zylinder', K.zylinderText(t) || (t.brauchtZylinder ? '' : 'kein Zylinder')],
      ['Zylinderlänge außen/innen', zylinderMass(t) ? zylinderMass(t) + ' mm' : ''],
      ['Beschlag / Drücker', K.beschlagText(t) || (t.brauchtBeschlag ? '' : 'kein Beschlag')],
      ['Schloss', K.schlossText(t)],
      ['Wandleser', t.brauchtWandleser ? 'ja' : ''],
      ['Zutrittsseite', t.zutrittsseite],
      ['Bauliche Anforderungen', (t.tueranforderungen || []).join(', '), true],
      ['Systemkomponenten', (t.komponenten || []).join(', '), true],
      ['DIN-Richtung', t.dinRichtung],
      ['Öffnungsrichtung', t.oeffnungsrichtung],
      ['Türblattstärke', t.tuerblattstaerke ? t.tuerblattstaerke + ' mm' : ''],
      ['Dornmaß', t.dornmass ? t.dornmass + ' mm' : ''],
      ['Entfernung', t.entfernung ? t.entfernung + ' mm' : ''],
      ['Vierkant', t.vierkant ? t.vierkant + ' mm' : ''],
      ['Profilbreite', t.profilbreite],
      ['Stulpmaß', t.stulpmass],
      ['Bohrbild', t.bohrbild],
      ['Türmaterial', t.tuermaterial],
      ['Systemdetail', t.systemDetail, true],
      ['Maß-Bemerkung', t.masseBemerkung, true],
      ['Bestand Fabrikat', t.bestandFabrikat],
      ['Bestand Zylinderart', t.bestandZylinderart],
      ['Bestand Länge', t.bestandLaenge],
      ['Bestand Schlüsselanzahl', t.bestandAnzahlSchluessel],
      ['Bestand Bemerkung', t.bestandBemerkung, true],
      ['Funkabdeckung', t.elFunkabdeckung],
      ['Stromversorgung', t.elStromversorgung],
      ['Vernetzung', t.elVernetzung],
      ['Türüberwachung', t.elTuerueberwachung ? 'ja' : ''],
      ['Elektronik-Bemerkung', t.elBemerkung, true]
    ].filter(function (f) { return txt(f[1]) && txt(f[1]) !== '–' || f[0] === 'System'; });

    var spaltenAnzahl = 3;
    var spaltenBreite = b / spaltenAnzahl;
    var kopfHoehe = 8;
    var status = K.statusById(t.status);

    /* Rasterzeilen bilden und ihre Höhe am längsten Wert ausrichten, damit
       lange Werte (z. B. mehrere Zutrittsarten) vollständig lesbar bleiben. */
    var rasterZeilen = [];
    var puffer = [];
    function pufferAbschliessen() {
      if (!puffer.length) return;
      var maxH = 0;
      puffer.forEach(function (f) {
        var h = doc.blockHoehe(txt(f[1]), spaltenBreite - 4, { size: 8, maxLines: 2 });
        if (h > maxH) maxH = h;
      });
      rasterZeilen.push({ felder: puffer.slice(), voll: false, hoehe: Math.max(3.4, maxH) + 4.6 });
      puffer = [];
    }
    felder.forEach(function (f) {
      /* Lange Werte (mehrere Zutrittsarten, Komponentenlisten, Bemerkungen)
         bekommen eine eigene Zeile über die volle Breite, statt zu kürzen. */
      var braucht = doc.blockHoehe(txt(f[1]), spaltenBreite - 4, { size: 8 });
      var passtInSpalte = braucht <= doc.blockHoehe('X', spaltenBreite - 4, { size: 8 }) * 2 + 0.01;
      if (f[2] && !passtInSpalte) {
        pufferAbschliessen();
        rasterZeilen.push({
          felder: [f], voll: true,
          hoehe: doc.blockHoehe(txt(f[1]), b - 4, { size: 8, maxLines: 3 }) + 4.6
        });
        return;
      }
      puffer.push(f);
      if (puffer.length === spaltenAnzahl) pufferAbschliessen();
    });
    pufferAbschliessen();

    var feldHoeheGesamt = rasterZeilen.reduce(function (a, r) { return a + r.hoehe; }, 0);
    var notizHoehe = 0;
    if (t.notiz) notizHoehe += doc.blockHoehe(t.notiz, b - 26, { size: 8 }) + 2;
    if (t.nacharbeit) notizHoehe += doc.blockHoehe(t.nacharbeitText || 'Nacharbeit erforderlich', b - 26, { size: 8 }) + 2;
    var fotoHoehe = fotos.length ? 34 : 0;
    var gesamt = kopfHoehe + feldHoeheGesamt + notizHoehe + fotoHoehe + 8;

    /* Passt das Datenblatt komplett auf eine Seite, wird es nicht zerrissen.
       Andernfalls beginnt es auf einer frischen Seite und wird sauber
       umbrochen - kein Feld darf verloren gehen. */
    if (gesamt <= doc.inhaltsHoehe()) doc.platzPruefen(gesamt);
    else doc.platzPruefen(kopfHoehe + rasterZeilen.slice(0, 3)
      .reduce(function (a, r) { return a + r.hoehe; }, 0));

    function kopfZeichnen(fortsetzung) {
      var startY = doc.y;
      doc.rechteck(x, startY, b, kopfHoehe, { fill: '#eef2f7', stroke: FARBE.linie, width: 0.3 });
      doc.rechteck(x, startY, 1.6, kopfHoehe, { fill: t.nacharbeit ? FARBE.fehler : status.farbe });
      var titel = (t.nummer ? t.nummer + '  ·  ' : '') + (t.bezeichnung || 'ohne Bezeichnung');
      if (fortsetzung) titel += '   (Fortsetzung)';
      doc.text(doc.kuerzen(titel, b - 70, 10.5, true), x + 4, startY + 2, { size: 10.5, bold: true });
      doc.text(status.label + (t.nacharbeit ? '  ·  NACHARBEIT' : ''), x + b - 3, startY + 2.4,
               { size: 7.5, align: 'right', bold: true, color: t.nacharbeit ? FARBE.fehler : status.farbe });
      doc.y = startY + kopfHoehe + 1.5;
    }

    kopfZeichnen(false);

    /* Felder in drei Spalten, mit Seitenumbruch statt Abschneiden */
    rasterZeilen.forEach(function (rz) {
      if (doc.y + rz.hoehe > doc.hoehe - doc.rand.unten) {
        doc.neueSeite();
        kopfZeichnen(true);
      }
      var fy = doc.y;
      if (rz.voll) {
        var fv = rz.felder[0];
        doc.text(fv[0], x + 2, fy, { size: 6.6, color: FARBE.hellgrau });
        doc.textBlock(txt(fv[1]), x + 2, fy + 3.1, b - 4, { size: 8, maxLines: 3 });
      } else {
        rz.felder.forEach(function (f, sp) {
          var fx = x + sp * spaltenBreite + 2;
          doc.text(f[0], fx, fy, { size: 6.6, color: FARBE.hellgrau });
          doc.textBlock(txt(f[1]), fx, fy + 3.1, spaltenBreite - 4, { size: 8, maxLines: 2 });
          if (sp > 0) {
            doc.linie(x + sp * spaltenBreite, fy - 0.5, x + sp * spaltenBreite, fy + rz.hoehe - 1.2,
                      { color: FARBE.linieHell, width: 0.15 });
          }
        });
      }
      doc.y = fy + rz.hoehe;
    });
    doc.y += 1;

    /* Notiz / Nacharbeit */
    if (t.notiz) {
      doc.platzPruefen(8);
      doc.text('Bemerkung', x + 2, doc.y, { size: 6.6, color: FARBE.hellgrau });
      doc.y += doc.textBlock(t.notiz, x + 24, doc.y, b - 26, { size: 8 }) + 1.5;
    }
    if (t.nacharbeit) {
      doc.platzPruefen(8);
      doc.text('Nacharbeit', x + 2, doc.y, { size: 6.6, bold: true, color: FARBE.fehler });
      doc.y += doc.textBlock(t.nacharbeitText || 'Nacharbeit erforderlich', x + 24, doc.y, b - 26,
                             { size: 8, color: FARBE.fehler }) + 1.5;
    }

    /* Fotos */
    if (fotos.length) {
      doc.platzPruefen(34);
      var fx2 = x + 2, maxH = 30;
      fotos.slice(0, 4).forEach(function (foto) {
        var id = doc.bildRegistrieren(foto.dataUrl);
        if (!id) return;
        var gez = doc.bild(id, fx2, doc.y, 42, maxH);
        if (gez) {
          doc.rechteck(fx2, doc.y, gez.breite, gez.hoehe, { stroke: FARBE.linie, width: 0.2 });
          if (foto.beschriftung) {
            doc.text(doc.kuerzen(foto.beschriftung, gez.breite, 6.4, false), fx2, doc.y + gez.hoehe + 0.6,
                     { size: 6.4, color: FARBE.hellgrau });
          }
          fx2 += gez.breite + 3;
        }
      });
      doc.y += maxH + 4;
    }

    doc.linie(x, doc.y, x + b, doc.y, { color: FARBE.linie, width: 0.3 });
    doc.y += 4;
  }

  function zusammenfassung(doc, projekt, einstellungen) {
    var s = M.statistik(projekt);
    var x = doc.rand.links, b = doc.inhaltsBreite();
    doc.platzPruefen(26);
    doc.y += 3;
    doc.text('Zusammenfassung', x, doc.y, { size: 10, bold: true, color: FARBE.akzent });
    doc.y += 6;
    var werte = [
      ['Positionen', String(s.tueren)],
      ['Türen gesamt', String(s.tuerenGesamtAnzahl)],
      ['Fotos', String(s.fotos)],
      ['Nacharbeit', String(s.nacharbeit)],
      ['Schließungen', String(s.schliessungen)],
      ['Berechtigungen', String(s.berechtigungen)]
    ];
    var kw = b / werte.length;
    werte.forEach(function (w, i) {
      var kx = x + i * kw;
      doc.rechteck(kx, doc.y, kw - 2, 12, { fill: FARBE.zebraBg, stroke: FARBE.linieHell });
      doc.text(w[1], kx + kw / 2 - 1, doc.y + 1.5, { size: 12, bold: true, align: 'center', color: FARBE.akzent });
      doc.text(w[0], kx + kw / 2 - 1, doc.y + 7.8, { size: 6.8, align: 'center', color: FARBE.grau });
    });
    doc.y += 16;

    if (projekt.bemerkung) {
      doc.platzPruefen(12);
      doc.text('Projektbemerkung', x, doc.y, { size: 8, bold: true });
      doc.y += 4;
      doc.y += doc.textBlock(projekt.bemerkung, x, doc.y, b, { size: 8, color: FARBE.grau });
    }

    doc.platzPruefen(24);
    doc.y += 8;
    var sb = (b - 10) / 2;
    [['Aufgenommen durch (Datum, Unterschrift)', x],
     ['Kunde / Bestätigung (Datum, Unterschrift)', x + sb + 10]].forEach(function (u) {
      doc.linie(u[1], doc.y + 10, u[1] + sb, doc.y + 10, { color: FARBE.grau, width: 0.3 });
      doc.text(u[0], u[1], doc.y + 11, { size: 7, color: FARBE.hellgrau });
    });
    doc.y += 18;
  }

  /* =========================================================================
   * 2) KREUZSCHLIESSPLAN / ZUTRITTSMATRIX
   * Türen = Zeilen, Schließungen = Spalten. Bei vielen Spalten wird auf
   * mehrere Seitenblöcke umbrochen, die Türspalte wiederholt sich dabei.
   * ====================================================================== */
  function schliessplan(projekt, einstellungen, optionen) {
    optionen = optionen || {};
    var doc = new PDF.Doc({
      format: optionen.format || 'a4', orientation: 'landscape',
      titel: 'Kreuzschließplan ' + (projekt.kunde || projekt.name),
      autor: einstellungen && einstellungen.firma || '',
      betreff: 'Kreuzschließplan / Zutrittsmatrix',
      margin: { oben: 12, unten: 14, links: 10, rechts: 10 }
    });
    kopfUndFussSetzen(doc, projekt, einstellungen, 'Kreuzschließplan / Zutrittsmatrix');
    doc.neueSeite();
    projektKopfBlock(doc, projekt);

    var schliessungen = projekt.schliessungen.slice().sort(function (a, b2) {
      return (a.sort - b2.sort) || String(a.kuerzel).localeCompare(String(b2.kuerzel), 'de', { numeric: true });
    });
    var gruppen = M.tuerenGruppiert(projekt);

    if (!schliessungen.length || !projekt.tueren.length) {
      doc.text('Für den Kreuzschließplan werden mindestens eine Tür und eine Schließung benötigt.',
               doc.rand.links, doc.y, { size: 10, color: FARBE.grau });
      return doc;
    }

    var b = doc.inhaltsBreite();
    var tuerSpalte = Math.min(78, Math.max(52, b * 0.26));
    var spaltenBreite = optionen.spaltenBreite || 7.2;
    var verfuegbar = b - tuerSpalte;
    var proSeite = Math.max(1, Math.floor(verfuegbar / spaltenBreite));

    var bloecke = [];
    for (var i = 0; i < schliessungen.length; i += proSeite) {
      bloecke.push(schliessungen.slice(i, i + proSeite));
    }

    bloecke.forEach(function (block, blockIndex) {
      if (blockIndex > 0) { doc.neueSeite(); doc.y += 2; }
      if (bloecke.length > 1) {
        doc.text('Spaltenblock ' + (blockIndex + 1) + ' von ' + bloecke.length +
                 '  (Schließungen ' + (blockIndex * proSeite + 1) + '–' +
                 (blockIndex * proSeite + block.length) + ' von ' + schliessungen.length + ')',
                 doc.rand.links, doc.y, { size: 7.5, color: FARBE.grau });
        doc.y += 5;
      }
      matrixBlock(doc, projekt, gruppen, block, tuerSpalte, spaltenBreite, einstellungen);
    });

    legende(doc, schliessungen);
    return doc;
  }

  function matrixBlock(doc, projekt, gruppen, block, tuerSpalte, spaltenBreite, einstellungen) {
    var x0 = doc.rand.links;
    var gesamtBreite = tuerSpalte + block.length * spaltenBreite;
    var zeilenHoehe = 5.4;

    /* Kopfhöhe aus dem längsten Spaltentitel ableiten */
    var kopfTexte = block.map(function (s) {
      return (s.kuerzel ? s.kuerzel + ' ' : '') + (s.bezeichnung || '');
    });
    var maxTextBreite = 0;
    kopfTexte.forEach(function (t) {
      var w = doc.textBreite(t, 7, true);
      if (w > maxTextBreite) maxTextBreite = w;
    });
    var medienZeile = 3.4;   /* eigene Zone am Kopfende für die Stückzahl */
    var kopfHoehe = Math.min(60, Math.max(24, maxTextBreite + 6 + medienZeile));

    function kopfZeichnen() {
      doc.platzPruefen(kopfHoehe + 3 * zeilenHoehe);
      var y = doc.y;
      doc.rechteck(x0, y, gesamtBreite, kopfHoehe, { fill: FARBE.kopfBg, stroke: FARBE.linie, width: 0.3 });
      doc.text('Tür / Schließung', x0 + 2, y + kopfHoehe - 5, { size: 7.5, bold: true });
      block.forEach(function (s, i) {
        var cx = x0 + tuerSpalte + i * spaltenBreite;
        doc.linie(cx, y, cx, y + kopfHoehe, { color: FARBE.linie, width: 0.25 });
        var text = doc.kuerzen(kopfTexte[i] || '–', kopfHoehe - medienZeile - 4, 7, true);
        doc.textRotiert(text, cx + spaltenBreite / 2 + 2.4, y + kopfHoehe - medienZeile - 2,
                        { size: 7, bold: true });
        var anz = parseInt(s.anzahlMedien, 10);
        if (anz > 0) {
          doc.text(String(anz), cx + spaltenBreite / 2, y + kopfHoehe - medienZeile + 0.1,
                   { size: 5.6, align: 'center', color: FARBE.grau });
        }
      });
      doc.linie(x0 + tuerSpalte, y, x0 + tuerSpalte, y + kopfHoehe, { color: FARBE.linie, width: 0.4 });
      doc.linie(x0 + tuerSpalte, y + kopfHoehe - medienZeile, x0 + gesamtBreite,
                y + kopfHoehe - medienZeile, { color: FARBE.linie, width: 0.2 });
      doc.text('Stk', x0 + tuerSpalte - 2, y + kopfHoehe - medienZeile + 0.1,
               { size: 5.6, align: 'right', color: FARBE.hellgrau });
      doc.y = y + kopfHoehe;
    }

    kopfZeichnen();
    var zebra = 0;

    gruppen.forEach(function (g) {
      /* Gruppenzeile */
      if (doc.platzPruefen(zeilenHoehe * 3)) { kopfZeichnen(); zebra = 0; }
      var gy = doc.y;
      doc.rechteck(x0, gy, gesamtBreite, 5, { fill: '#dce6f2', stroke: FARBE.linie, width: 0.25 });
      doc.text(doc.kuerzen(g.titel, gesamtBreite - 6, 7.6, true), x0 + 2, gy + 0.9,
               { size: 7.6, bold: true, color: FARBE.akzent });
      doc.y = gy + 5;
      zebra = 0;

      g.tueren.forEach(function (t) {
        if (doc.platzPruefen(zeilenHoehe)) { kopfZeichnen(); zebra = 0; }
        var y = doc.y;
        if (zebra % 2 === 1) doc.rechteck(x0, y, gesamtBreite, zeilenHoehe, { fill: FARBE.zebraBg });

        var label = (t.nummer ? t.nummer + ' ' : '') + (t.bezeichnung || '');
        if (t.anzahl > 1) label += ' (' + t.anzahl + 'x)';
        doc.text(doc.kuerzen(label || '–', tuerSpalte - 4, 7, false), x0 + 2, y + 1.1, { size: 7 });

        var raster = [];
        block.forEach(function (s, i) {
          var cx = x0 + tuerSpalte + i * spaltenBreite;
          var wert = M.getBerechtigung(projekt, t.id, s.id);
          var zeichen = K.berechtigungZeichen(wert);
          raster.push([cx, y, cx, y + zeilenHoehe]);
          if (zeichen) {
            var farbe = wert === 'sperr' ? FARBE.fehler : (wert === 'ja' ? FARBE.akzent : FARBE.warn);
            doc.text(zeichen, cx + spaltenBreite / 2, y + 0.9,
                     { size: 8, bold: true, align: 'center', color: farbe });
          }
        });
        raster.push([x0, y + zeilenHoehe, x0 + gesamtBreite, y + zeilenHoehe]);
        doc.linienGruppe(raster, { color: FARBE.linieHell, width: 0.15 });
        doc.linie(x0 + tuerSpalte, y, x0 + tuerSpalte, y + zeilenHoehe, { color: FARBE.linie, width: 0.4 });
        doc.y = y + zeilenHoehe;
        zebra++;
      });
    });

    /* Summenzeile: Anzahl berechtigter Türen je Schließung */
    if (doc.platzPruefen(zeilenHoehe + 2)) kopfZeichnen();
    var sy = doc.y;
    doc.rechteck(x0, sy, gesamtBreite, zeilenHoehe, { fill: FARBE.kopfBg, stroke: FARBE.linie, width: 0.3 });
    doc.text('Summe berechtigter Türen', x0 + 2, sy + 1.1, { size: 7, bold: true });
    block.forEach(function (s, i) {
      var cx = x0 + tuerSpalte + i * spaltenBreite;
      var summe = 0;
      projekt.tueren.forEach(function (t) {
        var w = M.getBerechtigung(projekt, t.id, s.id);
        if (w !== 'nein' && w !== 'sperr') summe += (parseInt(t.anzahl, 10) || 1);
      });
      doc.linie(cx, sy, cx, sy + zeilenHoehe, { color: FARBE.linie, width: 0.25 });
      doc.text(String(summe), cx + spaltenBreite / 2, sy + 1.1,
               { size: 6.8, align: 'center', bold: true, color: FARBE.akzent });
    });
    doc.y = sy + zeilenHoehe + 4;
  }

  function legende(doc, schliessungen) {
    var x = doc.rand.links, b = doc.inhaltsBreite();
    doc.platzPruefen(30);
    doc.y += 3;
    doc.text('Legende Berechtigungen', x, doc.y, { size: 9, bold: true, color: FARBE.akzent });
    doc.y += 5;
    var lx = x;
    K.BERECHTIGUNG.forEach(function (bt) {
      if (!bt.zeichen) return;
      doc.text(bt.zeichen, lx, doc.y, { size: 8, bold: true, color: FARBE.akzent });
      doc.text('= ' + bt.label, lx + 4, doc.y, { size: 7.5, color: FARBE.grau });
      lx += 5 + doc.textBreite('= ' + bt.label, 7.5, false) + 8;
    });
    doc.y += 7;

    doc.text('Schließungen im Detail', x, doc.y, { size: 9, bold: true, color: FARBE.akzent });
    doc.y += 5;
    var spalten = [
      { titel: 'Kürzel', breite: b * 0.09, key: 'kuerzel', bold: true },
      { titel: 'Bezeichnung', breite: b * 0.26, key: 'bezeichnung' },
      { titel: 'Typ', breite: b * 0.19, render: function (s) {
          var t = K.SCHLIESSUNG_TYPEN.filter(function (x2) { return x2.id === s.typ; })[0];
          return t ? t.label : txt(s.typ); } },
      { titel: 'Person', breite: b * 0.16, key: 'person' },
      { titel: 'Abteilung', breite: b * 0.14, key: 'abteilung' },
      { titel: 'Medien', breite: b * 0.06, align: 'center', render: function (s) {
          return String(s.anzahlMedien || 0); } },
      { titel: 'Bemerkung', breite: b * 0.10, key: 'bemerkung' }
    ];
    tabelle(doc, spalten, schliessungen.slice(), { size: 7.4 });
  }

  /* =========================================================================
   * 3) MATERIALLISTE / STÜCKLISTE
   * ====================================================================== */
  function materialliste(projekt, einstellungen) {
    var doc = new PDF.Doc({
      format: 'a4', orientation: 'portrait',
      titel: 'Materialliste ' + (projekt.kunde || projekt.name),
      autor: einstellungen && einstellungen.firma || '',
      betreff: 'Materialliste / Stückliste',
      margin: { oben: 12, unten: 14, links: 14, rechts: 14 }
    });
    kopfUndFussSetzen(doc, projekt, einstellungen, 'Materialliste / Stückliste');
    doc.neueSeite();
    projektKopfBlock(doc, projekt);

    var liste = M.materialliste(projekt, einstellungen && einstellungen.eigeneSysteme);
    var b = doc.inhaltsBreite();

    if (!liste.systeme.length) {
      doc.text('Keine Positionen vorhanden.', doc.rand.links, doc.y, { size: 10, color: FARBE.grau });
      return doc;
    }

    var gesamtStueck = 0;
    var zeilen = [];
    liste.systeme.forEach(function (sys) {
      var summe = sys.positionen.reduce(function (s, p) { return s + p.menge; }, 0);
      gesamtStueck += summe;
      zeilen.push({ __gruppe: sys.label, __gruppeRechts: sys.tueren + ' Türen  ·  ' + summe + ' Stück' });
      sys.positionen.forEach(function (p) { zeilen.push(p); });
    });

    var spalten = [
      { titel: 'Pos.', breite: b * 0.07, align: 'center', render: function (p, i) { return ''; } },
      { titel: 'Bezeichnung', breite: b * 0.52, key: 'bezeichnung', bold: true },
      { titel: 'Detail / Maß', breite: b * 0.26, key: 'detail' },
      { titel: 'Menge', breite: b * 0.15, align: 'right', bold: true,
        render: function (p) { return String(p.menge) + ' Stk'; } }
    ];
    /* Positionsnummern fortlaufend vergeben */
    var pos = 0;
    spalten[0].render = function (p) { if (p.__gruppe) return ''; pos++; return String(pos); };
    tabelle(doc, spalten, zeilen, { size: 8 });

    doc.y += 2;
    doc.platzPruefen(10);
    doc.rechteck(doc.rand.links, doc.y, b, 7, { fill: FARBE.kopfBg, stroke: FARBE.linie, width: 0.3 });
    doc.text('Gesamtsumme Positionen', doc.rand.links + 2, doc.y + 1.6, { size: 8.5, bold: true });
    doc.text(String(gesamtStueck) + ' Stück', doc.rand.links + b - 2, doc.y + 1.6,
             { size: 8.5, bold: true, align: 'right', color: FARBE.akzent });
    doc.y += 12;

    /* Identmedien */
    if (liste.medien.length) {
      doc.platzPruefen(20);
      doc.text('Identmedien / Schlüssel aus dem Schließplan', doc.rand.links, doc.y,
               { size: 10, bold: true, color: FARBE.akzent });
      doc.y += 6;
      var medienSpalten = [
        { titel: 'Kürzel', breite: b * 0.14, key: 'kuerzel', bold: true },
        { titel: 'Bezeichnung', breite: b * 0.44, key: 'bezeichnung' },
        { titel: 'Typ', breite: b * 0.27, render: function (m) {
            var t = K.SCHLIESSUNG_TYPEN.filter(function (x2) { return x2.id === m.typ; })[0];
            return t ? t.label : txt(m.typ); } },
        { titel: 'Anzahl', breite: b * 0.15, align: 'right', bold: true,
          render: function (m) { return String(m.menge) + ' Stk'; } }
      ];
      tabelle(doc, medienSpalten, liste.medien.slice(), { size: 8 });
      var medienSumme = liste.medien.reduce(function (s, m) { return s + m.menge; }, 0);
      doc.y += 2;
      doc.platzPruefen(10);
      doc.rechteck(doc.rand.links, doc.y, b, 7, { fill: FARBE.kopfBg, stroke: FARBE.linie, width: 0.3 });
      doc.text('Summe Identmedien', doc.rand.links + 2, doc.y + 1.6, { size: 8.5, bold: true });
      doc.text(String(medienSumme) + ' Stück', doc.rand.links + b - 2, doc.y + 1.6,
               { size: 8.5, bold: true, align: 'right', color: FARBE.akzent });
      doc.y += 12;
    }

    doc.platzPruefen(16);
    doc.textBlock('Hinweis: Die Mengen ergeben sich rechnerisch aus dem Aufmaß. ' +
      'Zylinderlängen, Beschläge und Panikfunktionen sind vor Bestellung gegen die ' +
      'tatsächlichen Türmaße und die geltenden Brandschutz- bzw. Fluchtweganforderungen zu prüfen.',
      doc.rand.links, doc.y, b, { size: 7.5, color: FARBE.hellgrau });

    return doc;
  }

  /* =========================================================================
   * 4) PRÜFPROTOKOLL (Plausibilitätsprüfung als PDF)
   * ====================================================================== */
  function pruefprotokoll(projekt, einstellungen) {
    var doc = new PDF.Doc({
      format: 'a4', orientation: 'portrait',
      titel: 'Prüfprotokoll ' + (projekt.kunde || projekt.name),
      margin: { oben: 12, unten: 14, links: 14, rechts: 14 }
    });
    kopfUndFussSetzen(doc, projekt, einstellungen, 'Prüfprotokoll Aufmaß');
    doc.neueSeite();
    projektKopfBlock(doc, projekt);

    var probleme = M.pruefeProjekt(projekt);
    var b = doc.inhaltsBreite();
    if (!probleme.length) {
      doc.text('Keine Auffälligkeiten. Das Aufmaß ist vollständig.', doc.rand.links, doc.y,
               { size: 10, bold: true, color: '#1f7a3d' });
      return doc;
    }
    var reihenfolge = { warn: 0, info: 1 };
    probleme.sort(function (a, b2) { return (reihenfolge[a.schwere] || 9) - (reihenfolge[b2.schwere] || 9); });
    var spalten = [
      { titel: 'Art', breite: b * 0.14, bold: true, render: function (p) {
          return p.schwere === 'warn' ? 'Prüfen' : 'Hinweis'; },
        color: FARBE.warn },
      { titel: 'Feststellung', breite: b * 0.86, key: 'text' }
    ];
    tabelle(doc, spalten, probleme.slice(), { size: 8.5 });
    return doc;
  }

  global.Reports = {
    tuerliste: tuerliste,
    schliessplan: schliessplan,
    materialliste: materialliste,
    pruefprotokoll: pruefprotokoll,
    dateiName: dateiName,
    _intern: { tabelle: tabelle, datumDe: datumDe, FARBE: FARBE }
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Reports; }
})(typeof window !== 'undefined' ? window : globalThis);
