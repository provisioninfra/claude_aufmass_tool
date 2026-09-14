/* =============================================================================
 * freigabe.js — Kunden-Freigabe der Zutrittsmatrix
 *
 * Der Kunde erhält einen Link, öffnet die Matrix im Browser und trägt in den
 * freigegebenen Feldern seine Berechtigungen ein. Seine Antwort kommt als
 * kurzer Rückschlüssel oder als Datei zurück und wird hier eingelesen.
 *
 * Es gibt bewusst keinen Server: Die Daten stehen im Adress-Anker (#) des
 * Links. Dieser Teil einer Adresse wird von Browsern niemals an einen Server
 * gesendet - die Aufmaßdaten verlassen also weder Ihr Gerät noch das des
 * Kunden.
 * ========================================================================== */
(function (global) {
  'use strict';

  var FORMAT = 1;
  /* Zeichen je Berechtigungsstufe - ein Zeichen pro Zelle hält die Daten klein */
  var WERTE = ['nein', 'ja', 'zeit', 'temp', 'sperr'];
  var ZEICHEN = ['0', '1', '2', '3', '4'];

  function wertZuZeichen(w) {
    var i = WERTE.indexOf(w || 'nein');
    return ZEICHEN[i === -1 ? 0 : i];
  }
  function zeichenZuWert(z) {
    var i = ZEICHEN.indexOf(z);
    return WERTE[i === -1 ? 0 : i];
  }

  /* --- Lauflängenkodierung: Matrizen bestehen überwiegend aus Nullen ------
   * Wiederholungen werden mit einem Trennzeichen eingeleitet, das in den
   * Daten selbst nicht vorkommt. Ohne dieses Zeichen ließe sich "04" sowohl
   * als "einmal 0, einmal 4" wie auch als "viermal 0" lesen. */
  var WIEDERHOLUNG = '~';

  function packen(text) {
    var aus = '', i = 0;
    while (i < text.length) {
      var z = text[i], n = 1;
      while (i + n < text.length && text[i + n] === z) n++;
      if (n > 3) {
        /* In Blöcken zählen, damit der Zähler einstellig bleibt (max 35) */
        var rest = n;
        while (rest > 0) {
          var block = Math.min(rest, 35);
          if (block > 3) { aus += z + WIEDERHOLUNG + block.toString(36); }
          else { for (var k = 0; k < block; k++) aus += z; }
          rest -= block;
        }
      } else {
        for (var j = 0; j < n; j++) aus += z;
      }
      i += n;
    }
    return aus;
  }

  function entpacken(text) {
    var aus = '', i = 0;
    while (i < text.length) {
      var z = text[i];
      if (text[i + 1] === WIEDERHOLUNG) {
        var n = parseInt(text[i + 2], 36);
        if (!isFinite(n) || n < 1) n = 1;
        for (var k = 0; k < n; k++) aus += z;
        i += 3;
      } else {
        aus += z; i += 1;
      }
    }
    return aus;
  }

  /* --- Text sicher in eine Adresse verpacken ------------------------------ */
  function textZuAnker(text) {
    var bytes = unescape(encodeURIComponent(text));
    var b64 = (typeof btoa === 'function') ? btoa(bytes)
            : Buffer.from(bytes, 'binary').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function ankerZuText(anker) {
    var b64 = String(anker || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bytes = (typeof atob === 'function') ? atob(b64)
              : Buffer.from(b64, 'base64').toString('binary');
    return decodeURIComponent(escape(bytes));
  }

  /* =========================================================================
   * Freigabe erzeugen
   * ======================================================================
   * optionen: { freigegebeneSchliessungen: [id, ...], nurLeereFelder,
   *             hinweis, frist }
   */
  function erstellen(projekt, optionen) {
    optionen = optionen || {};
    var M = global.Model;
    var frei = optionen.freigegebeneSchliessungen || [];

    var schliessungen = projekt.schliessungen.slice().sort(function (a, b) {
      return (a.sort - b.sort) || String(a.kuerzel).localeCompare(String(b.kuerzel), 'de', { numeric: true });
    });

    /* Türen in der Reihenfolge der Gliederung, mit ihrem Bereich */
    var tueren = [];
    M.tuerenGruppiert(projekt).forEach(function (g) {
      g.tueren.forEach(function (t) {
        tueren.push({ id: t.id, nr: t.nummer || '', bez: t.bezeichnung || '', bereich: g.titel });
      });
    });

    /* Matrix und Freigabemaske als je eine Zeichenkette */
    var matrix = '', maske = '';
    tueren.forEach(function (t) {
      schliessungen.forEach(function (s) {
        var wert = M.getBerechtigung(projekt, t.id, s.id);
        matrix += wertZuZeichen(wert);
        var darf = frei.indexOf(s.id) !== -1;
        if (darf && optionen.nurLeereFelder && wert !== 'nein') darf = false;
        maske += darf ? '1' : '0';
      });
    });

    var daten = {
      f: FORMAT,
      pid: projekt.id,
      kunde: projekt.kunde || '',
      objekt: projekt.objekt || '',
      anlage: projekt.anlagenNr || '',
      hinweis: optionen.hinweis || '',
      frist: optionen.frist || '',
      firma: optionen.firma || '',
      t: tueren.map(function (t) { return [t.id, t.nr, t.bez, t.bereich]; }),
      s: schliessungen.map(function (s) {
        return [s.id, s.kuerzel || '', s.bezeichnung || '', s.person || s.abteilung || ''];
      }),
      m: packen(matrix),
      e: packen(maske)
    };
    return daten;
  }

  function alsAnker(daten) { return textZuAnker(JSON.stringify(daten)); }

  function ausAnker(anker) {
    var daten = JSON.parse(ankerZuText(anker));
    if (!daten || daten.f !== FORMAT) throw new Error('Der Link stammt aus einer anderen Fassung des Werkzeugs.');
    daten.matrix = entpacken(daten.m);
    daten.maske = entpacken(daten.e);
    var erwartet = daten.t.length * daten.s.length;
    if (daten.matrix.length !== erwartet || daten.maske.length !== erwartet) {
      throw new Error('Der Link ist unvollständig. Bitte vollständig kopieren.');
    }
    return daten;
  }

  /* =========================================================================
   * Antwort des Kunden
   * ====================================================================== */

  /* Nur die Abweichungen zurückgeben - das hält die Antwort kurz. */
  function antwortErstellen(daten, geaenderteMatrix) {
    var aenderungen = [];
    for (var i = 0; i < geaenderteMatrix.length; i++) {
      if (geaenderteMatrix[i] !== daten.matrix[i] && daten.maske[i] === '1') {
        aenderungen.push(i.toString(36) + ':' + geaenderteMatrix[i]);
      }
    }
    return {
      f: FORMAT, pid: daten.pid, typ: 'antwort',
      anzahl: daten.t.length + 'x' + daten.s.length,
      tIds: daten.t.map(function (t) { return t[0]; }),
      sIds: daten.s.map(function (s) { return s[0]; }),
      a: aenderungen.join(','),
      gesendet: new Date().toISOString()
    };
  }

  function antwortAlsSchluessel(antwort) { return textZuAnker(JSON.stringify(antwort)); }

  function antwortAusSchluessel(schluessel) {
    var roh = String(schluessel || '').trim();
    /* Auch eine vollständige Adresse wird angenommen */
    var raute = roh.indexOf('#');
    if (raute !== -1) roh = roh.slice(raute + 1);
    if (roh.indexOf('antwort=') === 0) roh = roh.slice(8);
    var antwort;
    try { antwort = JSON.parse(ankerZuText(roh)); }
    catch (e) { throw new Error('Der Rückschlüssel ist nicht lesbar. Bitte vollständig einfügen.'); }
    if (!antwort || antwort.typ !== 'antwort') throw new Error('Das ist keine Kundenantwort.');
    if (antwort.f !== FORMAT) throw new Error('Die Antwort stammt aus einer anderen Fassung.');
    return antwort;
  }

  /* Antwort in das Projekt übernehmen. Gibt einen Bericht zurück. */
  function antwortUebernehmen(projekt, antwort, optionen) {
    optionen = optionen || {};
    var M = global.Model;
    if (antwort.pid !== projekt.id && !optionen.fremdesProjektZulassen) {
      throw new Error('Die Antwort gehört zu einem anderen Projekt.');
    }
    var tIds = antwort.tIds || [], sIds = antwort.sIds || [];
    var spalten = sIds.length;
    var uebernommen = 0, uebersprungen = 0;
    var liste = [];

    (antwort.a ? antwort.a.split(',') : []).forEach(function (eintrag) {
      if (!eintrag) return;
      var teile = eintrag.split(':');
      var index = parseInt(teile[0], 36);
      var wert = zeichenZuWert(teile[1]);
      var zeile = Math.floor(index / spalten), spalte = index % spalten;
      var tuerId = tIds[zeile], schliessungId = sIds[spalte];
      if (!tuerId || !schliessungId) { uebersprungen++; return; }
      /* Nur übernehmen, wenn Tür und Schließung noch vorhanden sind */
      var tuer = projekt.tueren.filter(function (t) { return t.id === tuerId; })[0];
      var sch = projekt.schliessungen.filter(function (s) { return s.id === schliessungId; })[0];
      if (!tuer || !sch) { uebersprungen++; return; }
      var vorher = M.getBerechtigung(projekt, tuerId, schliessungId);
      if (vorher === wert) return;
      M.setBerechtigung(projekt, tuerId, schliessungId, wert);
      uebernommen++;
      liste.push({
        tuer: tuer.nummer || tuer.bezeichnung,
        schliessung: sch.kuerzel || sch.bezeichnung,
        vorher: vorher, nachher: wert
      });
    });
    return { uebernommen: uebernommen, uebersprungen: uebersprungen, aenderungen: liste };
  }

  global.Freigabe = {
    FORMAT: FORMAT,
    WERTE: WERTE, ZEICHEN: ZEICHEN,
    wertZuZeichen: wertZuZeichen, zeichenZuWert: zeichenZuWert,
    erstellen: erstellen, alsAnker: alsAnker, ausAnker: ausAnker,
    antwortErstellen: antwortErstellen,
    antwortAlsSchluessel: antwortAlsSchluessel,
    antwortAusSchluessel: antwortAusSchluessel,
    antwortUebernehmen: antwortUebernehmen,
    _intern: { packen: packen, entpacken: entpacken, textZuAnker: textZuAnker, ankerZuText: ankerZuText }
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Freigabe; }
})(typeof window !== 'undefined' ? window : globalThis);
