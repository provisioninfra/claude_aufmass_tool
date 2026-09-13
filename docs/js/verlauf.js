/* =============================================================================
 * verlauf.js — Schrittweise Rücknahme von Änderungen
 *
 * Jeder logische Arbeitsschritt legt vorher einen Stand ab. Der Zurück-Knopf
 * stellt den jeweils vorherigen Stand wieder her, beliebig oft.
 *
 * Fotos würden einen solchen Verlauf sprengen, weil sie als Bilddaten im
 * Projekt stehen. Sie werden deshalb ausgelagert und im Stand nur über ihre
 * Kennung geführt; jedes Bild liegt genau einmal im Speicher.
 * ========================================================================== */
(function (global) {
  'use strict';

  var MAX_SCHRITTE = 60;

  var schritte = [];        // [{ stand: '<json>', beschreibung, zeit }]
  var bilder = {};          // fotoId -> dataUrl
  var projektId = null;
  var beiAenderung = null;  // Rückmeldung an die Oberfläche

  /* --- Bilddaten aus- und wieder einlagern -------------------------------- */
  function auslagern(projekt) {
    var kopie = JSON.parse(JSON.stringify(projekt));
    (kopie.tueren || []).forEach(function (t) {
      (t.fotos || []).forEach(function (f) {
        if (f && f.dataUrl && f.id) {
          bilder[f.id] = f.dataUrl;
          f.dataUrl = '';
        }
      });
    });
    return JSON.stringify(kopie);
  }

  function einlagern(text) {
    var projekt = JSON.parse(text);
    (projekt.tueren || []).forEach(function (t) {
      (t.fotos || []).forEach(function (f) {
        if (f && !f.dataUrl && f.id && bilder[f.id]) f.dataUrl = bilder[f.id];
      });
    });
    return projekt;
  }

  /* Bilder freigeben, die in keinem Stand mehr vorkommen. */
  function bilderAufraeumen(aktuellesProjekt) {
    var gebraucht = {};
    function sammeln(p) {
      (p.tueren || []).forEach(function (t) {
        (t.fotos || []).forEach(function (f) { if (f && f.id) gebraucht[f.id] = true; });
      });
    }
    if (aktuellesProjekt) sammeln(aktuellesProjekt);
    schritte.forEach(function (s) {
      try { sammeln(JSON.parse(s.stand)); } catch (e) { /* beschädigter Stand */ }
    });
    Object.keys(bilder).forEach(function (id) { if (!gebraucht[id]) delete bilder[id]; });
  }

  /* --- Verwaltung ---------------------------------------------------------- */

  /* Beim Öffnen eines Projekts beginnt ein neuer Verlauf. */
  function beginnen(projekt) {
    schritte = [];
    bilder = {};
    projektId = projekt ? projekt.id : null;
    melden();
  }

  function beenden() {
    schritte = [];
    bilder = {};
    projektId = null;
    melden();
  }

  /* Vor einem Arbeitsschritt den aktuellen Stand ablegen. */
  function merken(projekt, beschreibung) {
    if (!projekt) return;
    if (projektId && projekt.id !== projektId) beginnen(projekt);
    projektId = projekt.id;

    var stand = auslagern(projekt);
    /* Unveränderte Stände nicht doppelt ablegen */
    if (schritte.length && schritte[schritte.length - 1].stand === stand) return;

    schritte.push({ stand: stand, beschreibung: beschreibung || 'Änderung', zeit: Date.now() });
    if (schritte.length > MAX_SCHRITTE) {
      schritte.shift();
      bilderAufraeumen(projekt);
    }
    melden();
  }

  /* Letzten Stand wiederherstellen. Gibt das wiederhergestellte Projekt
   * zurück oder null, wenn es nichts zurückzunehmen gibt. */
  function zurueck() {
    if (!schritte.length) return null;
    var schritt = schritte.pop();
    var projekt;
    try { projekt = einlagern(schritt.stand); }
    catch (e) { melden(); return null; }
    melden();
    return { projekt: projekt, beschreibung: schritt.beschreibung };
  }

  /* Was würde der nächste Zurück-Schritt rücknehmen? */
  function naechsteBeschreibung() {
    return schritte.length ? schritte[schritte.length - 1].beschreibung : '';
  }
  function anzahl() { return schritte.length; }
  function moeglich() { return schritte.length > 0; }

  /* Ungefährer Speicherbedarf in Byte - für die Anzeige in den Einstellungen. */
  function groesse() {
    var n = 0;
    schritte.forEach(function (s) { n += s.stand.length; });
    Object.keys(bilder).forEach(function (id) { n += bilder[id].length; });
    return n;
  }

  function aufAenderung(rueckruf) { beiAenderung = rueckruf; }
  function melden() { if (beiAenderung) beiAenderung(moeglich(), naechsteBeschreibung(), anzahl()); }

  global.Verlauf = {
    MAX_SCHRITTE: MAX_SCHRITTE,
    beginnen: beginnen,
    beenden: beenden,
    merken: merken,
    zurueck: zurueck,
    moeglich: moeglich,
    anzahl: anzahl,
    naechsteBeschreibung: naechsteBeschreibung,
    groesse: groesse,
    aufAenderung: aufAenderung
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Verlauf; }
})(typeof window !== 'undefined' ? window : globalThis);
