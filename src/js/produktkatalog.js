/* =============================================================================
 * produktkatalog.js — Lieferbare Längen, Varianten und Optionen je System
 *
 * Bewusst NICHT im Programmcode festgeschrieben: Kataloge ändern sich, der
 * Code nicht. Die Daten kommen aus einer austauschbaren Katalogdatei, die
 * unter Einstellungen eingelesen und ersetzt werden kann.
 *
 * Solange kein Katalog geladen ist, arbeitet das Werkzeug wie bisher
 * weiter - nur ohne Längenprüfung und ohne Variantenvorschläge.
 * ========================================================================== */
(function (global) {
  'use strict';

  var KATALOG_VERSION = 1;

  /* --- Bauteilarten, nach denen gefiltert wird --------------------------- */
  var BAUTEILARTEN = [
    { id: 'zylinder',  label: 'Zylinder' },
    { id: 'beschlag',  label: 'Beschlag / Drücker' },
    { id: 'schloss',   label: 'Schloss' },
    { id: 'leser',     label: 'Wandleser / Zutrittsleser' },
    { id: 'medium',    label: 'Identmedium' },
    { id: 'zubehoer',  label: 'Zubehör' },
    { id: 'sonstiges', label: 'Sonstiges' }
  ];

  /* Der geladene Katalog; null bedeutet: es liegt keiner vor. */
  var aktuell = null;

  function setzen(katalog) { aktuell = katalog || null; return aktuell; }
  function geladen() { return !!(aktuell && aktuell.systeme); }
  function katalog() { return aktuell; }

  function quelleText() {
    if (!geladen()) return '';
    var t = [];
    if (aktuell.quelle) t.push(aktuell.quelle);
    if (aktuell.stand) t.push('Stand ' + aktuell.stand);
    return t.join(', ');
  }

  /* --- Zugriff ------------------------------------------------------------ */

  /* Alle Bauteile eines Systems, optional auf eine Bauteilart eingegrenzt. */
  function bauteile(systemId, art) {
    if (!geladen() || !systemId) return [];
    var sys = aktuell.systeme[systemId];
    if (!sys || !Array.isArray(sys.bauteile)) return [];
    if (!art) return sys.bauteile.slice();
    return sys.bauteile.filter(function (b) { return b.art === art; });
  }

  function bauteilFinden(systemId, bauteilId) {
    var liste = bauteile(systemId);
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].id === bauteilId) return liste[i];
    }
    return null;
  }

  /* Freitextsuche über alle Systeme oder innerhalb eines Systems.
   * Sucht in Bezeichnung, Kurzform, Varianten und Suchbegriffen. */
  function suchen(text, systemId, art, maxTreffer) {
    if (!geladen()) return [];
    var q = String(text || '').trim().toLowerCase();
    var treffer = [];
    var systemIds = systemId ? [systemId] : Object.keys(aktuell.systeme);

    systemIds.forEach(function (sid) {
      var sys = aktuell.systeme[sid];
      if (!sys || !Array.isArray(sys.bauteile)) return;
      sys.bauteile.forEach(function (b) {
        if (art && b.art !== art) return;
        if (!q) { treffer.push({ systemId: sid, bauteil: b, gewicht: 0 }); return; }
        var heuhaufen = [
          b.bezeichnung, b.kurz, b.hinweis,
          (b.varianten || []).map(function (v) { return v.bezeichnung; }).join(' '),
          (b.suchbegriffe || []).join(' ')
        ].join(' ').toLowerCase();
        var pos = heuhaufen.indexOf(q);
        if (pos === -1) return;
        /* Treffer am Wortanfang der Bezeichnung wiegen schwerer */
        var gewicht = 100 - pos;
        if (String(b.bezeichnung || '').toLowerCase().indexOf(q) === 0) gewicht += 1000;
        treffer.push({ systemId: sid, bauteil: b, gewicht: gewicht });
      });
    });

    treffer.sort(function (a, b) {
      return (b.gewicht - a.gewicht) ||
        String(a.bauteil.bezeichnung).localeCompare(String(b.bauteil.bezeichnung), 'de');
    });
    return maxTreffer ? treffer.slice(0, maxTreffer) : treffer;
  }

  /* =========================================================================
   * Längenraster
   * ======================================================================
   * Ein Raster beschreibt, welche Längen tatsächlich lieferbar sind -
   * entweder als ausdrückliche Liste ("werte") oder als Schrittfolge
   * (min/max/schritt). Beides darf gemeinsam vorkommen.
   */

  /* Liefert alle zulässigen Werte einer Seite ('aussen' | 'innen'). */
  function rasterWerte(raster, seite) {
    if (!raster) return [];
    var r = (seite && raster[seite]) ? raster[seite] : raster;
    var werte = [];
    if (Array.isArray(r.werte)) {
      r.werte.forEach(function (w) {
        var z = Number(w);
        if (isFinite(z)) werte.push(z);
      });
    }
    if (isFinite(r.min) && isFinite(r.max) && isFinite(r.schritt) && r.schritt > 0) {
      for (var w2 = Number(r.min); w2 <= Number(r.max) + 1e-9; w2 += Number(r.schritt)) {
        var gerundet = Math.round(w2 * 100) / 100;
        if (werte.indexOf(gerundet) === -1) werte.push(gerundet);
      }
    }
    werte.sort(function (a, b) { return a - b; });
    return werte;
  }

  /* Prüft eine gemessene Länge gegen das Raster.
   * Ergebnis: { lieferbar, gemessen, vorschlag, werte, grund } */
  function laengePruefen(raster, seite, gemessen) {
    var zahl = parseFloat(String(gemessen).replace(',', '.'));
    var werte = rasterWerte(raster, seite);
    if (!isFinite(zahl)) return { lieferbar: null, grund: 'keine Zahl', werte: werte };
    if (!werte.length) return { lieferbar: null, grund: 'kein Raster hinterlegt', werte: werte };

    if (werte.indexOf(zahl) !== -1) {
      return { lieferbar: true, gemessen: zahl, vorschlag: zahl, werte: werte };
    }
    if (zahl < werte[0]) {
      return { lieferbar: false, gemessen: zahl, vorschlag: werte[0],
               grund: 'unter der kleinsten lieferbaren Länge', werte: werte };
    }
    if (zahl > werte[werte.length - 1]) {
      return { lieferbar: false, gemessen: zahl, vorschlag: werte[werte.length - 1],
               grund: 'über der größten lieferbaren Länge', werte: werte };
    }
    /* Nächstgrößeres Maß: ein Zylinder darf überstehen, nicht zu kurz sein. */
    var naechstGroesser = werte.filter(function (w) { return w > zahl; })[0];
    return { lieferbar: false, gemessen: zahl, vorschlag: naechstGroesser,
             grund: 'nicht im Raster', werte: werte };
  }

  /* Bequemer Zugriff für eine Tür: prüft außen und innen zugleich. */
  function tuerLaengenPruefen(tuer) {
    if (!geladen() || !tuer || !tuer.brauchtZylinder) return null;
    var bauteil = tuer.katalogBauteilId
      ? bauteilFinden(tuer.systemId, tuer.katalogBauteilId)
      : bauteilNachZylinderart(tuer.systemId, tuer.zylinderArt);
    if (!bauteil || !bauteil.laengenRaster) return null;
    return {
      bauteil: bauteil,
      aussen: tuer.masseAussen ? laengePruefen(bauteil.laengenRaster, 'aussen', tuer.masseAussen) : null,
      innen:  tuer.masseInnen  ? laengePruefen(bauteil.laengenRaster, 'innen',  tuer.masseInnen)  : null
    };
  }

  /* Ordnet einer frei gewählten Zylinderart ein Katalogbauteil zu, damit
   * auch ohne ausdrückliche Katalogauswahl geprüft werden kann. */
  function bauteilNachZylinderart(systemId, zylinderArt) {
    if (!zylinderArt) return null;
    var kandidaten = bauteile(systemId, 'zylinder');
    var gesucht = String(zylinderArt).toLowerCase();
    for (var i = 0; i < kandidaten.length; i++) {
      var b = kandidaten[i];
      if (String(b.bezeichnung || '').toLowerCase() === gesucht) return b;
      if ((b.entsprichtZylinderart || []).some(function (z) {
        return String(z).toLowerCase() === gesucht;
      })) return b;
    }
    return null;
  }

  /* =========================================================================
   * Einlesen und Prüfen einer Katalogdatei
   * ====================================================================== */
  function pruefeKatalog(daten) {
    var fehler = [];
    if (!daten || typeof daten !== 'object') {
      fehler.push('Die Datei enthält kein Objekt.');
      return { gueltig: false, fehler: fehler };
    }
    if (daten.typ !== 'schliessanlagen-produktkatalog') {
      fehler.push('Es handelt sich nicht um eine Produktkatalog-Datei.');
    }
    if (!daten.systeme || typeof daten.systeme !== 'object') {
      fehler.push('Der Abschnitt "systeme" fehlt.');
    }
    if (fehler.length) return { gueltig: false, fehler: fehler };

    var warnungen = [];
    var anzahlBauteile = 0, anzahlRaster = 0, anzahlVarianten = 0;
    Object.keys(daten.systeme).forEach(function (sid) {
      var sys = daten.systeme[sid];
      if (!sys || !Array.isArray(sys.bauteile)) {
        warnungen.push('System "' + sid + '" hat keine Bauteilliste.');
        return;
      }
      var idsGesehen = {};
      sys.bauteile.forEach(function (b, i) {
        if (!b.id) { warnungen.push('System "' + sid + '", Bauteil ' + (i + 1) + ': ohne Kennung.'); return; }
        if (idsGesehen[b.id]) warnungen.push('System "' + sid + '": Kennung "' + b.id + '" doppelt.');
        idsGesehen[b.id] = true;
        if (!b.bezeichnung) warnungen.push('System "' + sid + '", "' + b.id + '": ohne Bezeichnung.');
        if (b.art && !BAUTEILARTEN.some(function (a) { return a.id === b.art; })) {
          warnungen.push('System "' + sid + '", "' + b.id + '": unbekannte Bauteilart "' + b.art + '".');
        }
        anzahlBauteile++;
        if (b.laengenRaster) {
          var wa = rasterWerte(b.laengenRaster, 'aussen');
          var wi = rasterWerte(b.laengenRaster, 'innen');
          if (!wa.length && !wi.length) {
            warnungen.push('System "' + sid + '", "' + b.id + '": Längenraster ohne verwertbare Werte.');
          } else { anzahlRaster++; }
        }
        anzahlVarianten += (b.varianten || []).length;
      });
    });

    return {
      gueltig: true, fehler: [], warnungen: warnungen,
      zusammenfassung: {
        systeme: Object.keys(daten.systeme).length,
        bauteile: anzahlBauteile,
        laengenraster: anzahlRaster,
        varianten: anzahlVarianten,
        quelle: daten.quelle || '', stand: daten.stand || ''
      }
    };
  }

  function importParsen(text) {
    var daten;
    try { daten = JSON.parse(text); }
    catch (e) { throw new Error('Die Datei ist keine gültige JSON-Datei.'); }
    var pruefung = pruefeKatalog(daten);
    if (!pruefung.gueltig) throw new Error(pruefung.fehler.join(' '));
    return { katalog: daten, pruefung: pruefung };
  }

  function leererKatalog(quelle) {
    return {
      typ: 'schliessanlagen-produktkatalog',
      version: KATALOG_VERSION,
      quelle: quelle || '',
      stand: '',
      erstellt: new Date().toISOString(),
      systeme: {}
    };
  }

  global.Produktkatalog = {
    KATALOG_VERSION: KATALOG_VERSION,
    BAUTEILARTEN: BAUTEILARTEN,
    setzen: setzen,
    geladen: geladen,
    katalog: katalog,
    quelleText: quelleText,
    bauteile: bauteile,
    bauteilFinden: bauteilFinden,
    bauteilNachZylinderart: bauteilNachZylinderart,
    suchen: suchen,
    rasterWerte: rasterWerte,
    laengePruefen: laengePruefen,
    tuerLaengenPruefen: tuerLaengenPruefen,
    pruefeKatalog: pruefeKatalog,
    importParsen: importParsen,
    leererKatalog: leererKatalog
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Produktkatalog; }
})(typeof window !== 'undefined' ? window : globalThis);
