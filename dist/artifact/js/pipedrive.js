/* =============================================================================
 * pipedrive.js — Anbindung an Pipedrive (ausschließlich lesend)
 *
 * Das Werkzeug holt Deals und die zugehörigen Stammdaten ab. Es schreibt
 * nichts nach Pipedrive zurück: Es werden ausschließlich GET-Abfragen
 * gestellt, und die Aufrufhülle lässt kein anderes Verfahren zu.
 *
 * Der Zugriffsschlüssel liegt ausschließlich im Speicher dieses Geräts. Er
 * wird nie in ein Projekt, einen Export oder einen Freigabe-Link geschrieben.
 * ========================================================================== */
(function (global) {
  'use strict';

  var STANDARD_HOST = 'api.pipedrive.com';

  /* --- Fehler mit verständlicher Ursache ---------------------------------- */
  function PipedriveFehler(text, art, zusatz) {
    var e = new Error(text);
    e.art = art || 'unbekannt';
    e.zusatz = zusatz || '';
    return e;
  }

  function hostAus(einstellungen) {
    var roh = String((einstellungen && einstellungen.pipedriveHost) || '').trim();
    if (!roh) return STANDARD_HOST;
    /* Auch eine vollständige Adresse aus dem Browser wird angenommen */
    roh = roh.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
    return roh || STANDARD_HOST;
  }

  /* =========================================================================
   * Eine lesende Abfrage. Andere Verfahren sind hier nicht vorgesehen.
   * ====================================================================== */
  function holen(einstellungen, pfad, parameter) {
    var schluessel = (einstellungen && einstellungen.pipedriveToken || '').trim();
    if (!schluessel) {
      return Promise.reject(PipedriveFehler(
        'Es ist kein Pipedrive-Zugriffsschlüssel hinterlegt.', 'kein-schluessel',
        'Unter Einstellungen den Schlüssel eintragen.'));
    }
    var host = hostAus(einstellungen);
    var url = 'https://' + host + pfad;
    var teile = [];
    Object.keys(parameter || {}).forEach(function (k) {
      var w = parameter[k];
      if (w === undefined || w === null || w === '') return;
      teile.push(encodeURIComponent(k) + '=' + encodeURIComponent(w));
    });
    if (teile.length) url += (url.indexOf('?') === -1 ? '?' : '&') + teile.join('&');

    var abbruch = new AbortController();
    var zeitgeber = setTimeout(function () { abbruch.abort(); }, 25000);

    return fetch(url, {
      method: 'GET',                       /* ausschließlich lesend */
      headers: { 'x-api-token': schluessel, 'Accept': 'application/json' },
      signal: abbruch.signal,
      mode: 'cors',
      credentials: 'omit'
    }).then(function (antwort) {
      clearTimeout(zeitgeber);
      if (antwort.status === 401 || antwort.status === 403) {
        throw PipedriveFehler('Der Zugriffsschlüssel wurde abgelehnt.', 'schluessel-ungueltig',
          'Bitte den Schlüssel in Pipedrive prüfen: Einstellungen → Persönliche Einstellungen → API.');
      }
      if (antwort.status === 429) {
        throw PipedriveFehler('Pipedrive hat zu viele Abfragen gemeldet.', 'zu-viele',
          'Bitte einen Moment warten und erneut versuchen.');
      }
      if (antwort.status === 404) {
        throw PipedriveFehler('Der angefragte Eintrag wurde nicht gefunden.', 'nicht-gefunden', '');
      }
      if (!antwort.ok) {
        throw PipedriveFehler('Pipedrive antwortete mit Fehler ' + antwort.status + '.', 'antwort-fehler', '');
      }
      return antwort.json();
    }).then(function (daten) {
      if (daten && daten.success === false) {
        throw PipedriveFehler(daten.error || 'Pipedrive meldet einen Fehler.', 'antwort-fehler',
          daten.error_info || '');
      }
      return daten;
    }).catch(function (fehler) {
      clearTimeout(zeitgeber);
      if (fehler && fehler.art) throw fehler;
      if (fehler && fehler.name === 'AbortError') {
        throw PipedriveFehler('Pipedrive hat nicht rechtzeitig geantwortet.', 'zeitueberschreitung',
          'Bitte Netzverbindung prüfen und erneut versuchen.');
      }
      /* Ein fehlgeschlagenes fetch ohne Statuscode deutet auf eine
       * abgewiesene Browser-Abfrage hin - meist CORS oder keine Verbindung. */
      throw PipedriveFehler('Die Verbindung zu Pipedrive kam nicht zustande.', 'verbindung',
        'Mögliche Ursachen: keine Internetverbindung, falsche Adresse, oder Pipedrive ' +
        'lässt die Abfrage aus dem Browser nicht zu. In diesem Fall ist ein Zwischendienst nötig.');
    });
  }

  /* =========================================================================
   * Abfragen
   * ====================================================================== */

  /* Verbindung prüfen und den angemeldeten Benutzer zurückgeben. */
  function verbindungPruefen(einstellungen) {
    return holen(einstellungen, '/api/v1/users/me').then(function (d) {
      var u = d && d.data;
      if (!u) throw PipedriveFehler('Unerwartete Antwort von Pipedrive.', 'antwort-fehler', '');
      return {
        name: u.name || '', email: u.email || '',
        firma: (u.company_name || ''), firmaId: u.company_id,
        domain: u.company_domain || ''
      };
    });
  }

  function pipelines(einstellungen) {
    return holen(einstellungen, '/api/v2/pipelines', { limit: 100 }).then(function (d) {
      return (d && d.data || []).map(function (p) {
        return { id: p.id, name: p.name || '', reihenfolge: p.order_nr };
      }).sort(function (a, b) { return (a.reihenfolge || 0) - (b.reihenfolge || 0); });
    });
  }

  function phasen(einstellungen, pipelineId) {
    return holen(einstellungen, '/api/v2/stages', { pipeline_id: pipelineId, limit: 100 })
      .then(function (d) {
        return (d && d.data || []).map(function (s) {
          return { id: s.id, name: s.name || '', reihenfolge: s.order_nr };
        }).sort(function (a, b) { return (a.reihenfolge || 0) - (b.reihenfolge || 0); });
      });
  }

  /* Ein Deal aus der Antwort in die Form dieses Werkzeugs bringen. */
  function dealAbbilden(deal, pipelineId) {
    return {
      id: deal.id,
      titel: deal.title || '',
      wert: deal.value, waehrung: deal.currency || '',
      pipelineId: deal.pipeline_id || pipelineId || null,
      phaseId: deal.stage_id,
      status: deal.status || '',
      orgId: deal.org_id || null,
      personId: deal.person_id || null,
      besitzerId: deal.owner_id || deal.user_id || null,
      erstellt: deal.add_time || '',
      geaendert: deal.update_time || '',
      phaseSeit: deal.stage_change_time || deal.update_time || ''
    };
  }

  /* Offene Deals einer Pipeline, auf Wunsch auf eine Phase eingegrenzt.
   * Die Phase wird sowohl in der Abfrage mitgegeben als auch anschliessend
   * geprueft - so greift die Eingrenzung auch dann, wenn die Schnittstelle
   * den Parameter einmal nicht beruecksichtigt.
   *
   * Mit optionen.ohneNachfilter unterbleibt die zweite Pruefung; das wird
   * fuer die Diagnose gebraucht, die sehen will, was ungefiltert ankommt. */
  function deals(einstellungen, pipelineId, optionen) {
    optionen = optionen || {};
    var phaseId = optionen.phaseId;
    return holen(einstellungen, '/api/v2/deals', {
      pipeline_id: pipelineId,
      stage_id: phaseId,
      status: optionen.status || 'open',
      limit: optionen.limit || 100,
      sort_by: 'update_time',
      sort_direction: 'desc'
    }).then(function (d) {
      var liste = (d && d.data || []).map(function (deal) {
        return dealAbbilden(deal, pipelineId);
      });
      if (!optionen.ohneNachfilter) {
        if (pipelineId) {
          liste = liste.filter(function (deal) {
            return String(deal.pipelineId) === String(pipelineId);
          });
        }
        if (phaseId) {
          liste = liste.filter(function (deal) {
            return String(deal.phaseId) === String(phaseId);
          });
        }
      }
      return liste;
    });
  }

  /* =========================================================================
   * Regel: Für welchen Deal soll ein Aufmaß entstehen?
   * ======================================================================
   * Ein Aufmaß entsteht, wenn der Deal in der festgelegten Pipeline und
   * Phase steht und zu ihm noch kein Projekt vorliegt. Dieselbe Prüfung
   * gilt gleichermaßen für einen neu angelegten wie für einen in die Phase
   * verschobenen Deal - maßgeblich ist allein, wo er jetzt steht.
   *
   * Bewusst ohne Seiteneffekte, damit ein späterer Webhook-Dienst dieselbe
   * Entscheidung mit denselben Daten treffen kann.
   */
  function istZuUebernehmen(deal, einstellungen, vorhandeneProjekte) {
    if (!deal) return { uebernehmen: false, code: 'kein-deal', grund: 'kein Deal' };

    var pipelineId = einstellungen && einstellungen.pipedrivePipelineId;
    var phaseId = einstellungen && einstellungen.pipedrivePhaseId;

    if (pipelineId && String(deal.pipelineId || '') !== String(pipelineId)) {
      return { uebernehmen: false, code: 'pipeline', grund: 'andere Pipeline' };
    }
    if (phaseId && String(deal.phaseId || '') !== String(phaseId)) {
      return { uebernehmen: false, code: 'phase', grund: 'andere Phase' };
    }
    if (deal.status && deal.status !== 'open') {
      return { uebernehmen: false, code: 'status', grund: 'Deal ist nicht offen' };
    }
    var vorhanden = projektZuDeal(deal.id, vorhandeneProjekte);
    if (vorhanden) {
      return { uebernehmen: false, code: 'vorhanden', grund: 'Aufmaß vorhanden', projekt: vorhanden };
    }
    return { uebernehmen: true, code: 'offen', grund: '' };
  }

  /* Gibt es zu diesem Deal bereits ein Aufmaß? */
  function projektZuDeal(dealId, projekte) {
    if (!dealId) return null;
    var treffer = (projekte || []).filter(function (p) {
      return p && p.pipedrive && String(p.pipedrive.dealId) === String(dealId);
    });
    return treffer[0] || null;
  }

  function organisation(einstellungen, orgId) {
    if (!orgId) return Promise.resolve(null);
    return holen(einstellungen, '/api/v2/organizations/' + orgId).then(function (d) {
      var o = d && d.data;
      if (!o) return null;
      return {
        id: o.id,
        name: o.name || '',
        adresse: adresseLesen(o.address),
        eigene: eigeneFelderLesen(o)
      };
    });
  }

  function person(einstellungen, personId) {
    if (!personId) return Promise.resolve(null);
    return holen(einstellungen, '/api/v2/persons/' + personId).then(function (d) {
      var p = d && d.data;
      if (!p) return null;
      return {
        id: p.id,
        name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' '),
        telefon: erstesFeld(p.phones || p.phone, 'value'),
        email: erstesFeld(p.emails || p.email, 'value'),
        orgId: p.org_id || null
      };
    });
  }

  /* Adressfelder kommen je nach Fassung als Objekt oder als Text. */
  function adresseLesen(adresse) {
    if (!adresse) return { strasse: '', plz: '', ort: '', land: '', gesamt: '' };
    if (typeof adresse === 'string') {
      return { strasse: '', plz: '', ort: '', land: '', gesamt: adresse };
    }
    var strasse = [adresse.street_number ? (adresse.route || '') + ' ' + adresse.street_number
                                         : (adresse.route || '')].join('').trim();
    return {
      strasse: strasse || adresse.sublocality || '',
      plz: adresse.postal_code || '',
      ort: adresse.locality || adresse.admin_area_level_2 || '',
      land: adresse.country || '',
      gesamt: adresse.value || adresse.formatted_address || ''
    };
  }

  /* Aus "Am Hafen 12, 40213 Düsseldorf" die Bestandteile gewinnen, falls
   * Pipedrive nur den Gesamttext liefert. */
  function adresseZerlegen(gesamt) {
    var text = String(gesamt || '').trim();
    if (!text) return null;
    var teile = text.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    var ergebnis = { strasse: '', plz: '', ort: '' };
    if (teile.length >= 2) {
      ergebnis.strasse = teile[0];
      var plzOrt = /^(\d{4,5})\s+(.+)$/.exec(teile[1]);
      if (plzOrt) { ergebnis.plz = plzOrt[1]; ergebnis.ort = plzOrt[2]; }
      else { ergebnis.ort = teile[1]; }
    } else {
      ergebnis.strasse = text;
    }
    return ergebnis;
  }

  function erstesFeld(wert, schluessel) {
    if (!wert) return '';
    if (typeof wert === 'string') return wert;
    if (Array.isArray(wert)) {
      if (!wert.length) return '';
      var erster = wert.filter(function (e) { return e && e.primary; })[0] || wert[0];
      return (typeof erster === 'string') ? erster : (erster[schluessel] || '');
    }
    return wert[schluessel] || '';
  }

  /* Eigene Felder tragen in Pipedrive lange Schlüssel; sie werden für eine
   * spätere Zuordnung unverändert mitgeführt. */
  function eigeneFelderLesen(objekt) {
    var aus = {};
    Object.keys(objekt || {}).forEach(function (k) {
      if (/^[0-9a-f]{40}$/i.test(k) && objekt[k] !== null && objekt[k] !== '') {
        aus[k] = objekt[k];
      }
    });
    return aus;
  }

  /* =========================================================================
   * Deal mit allen Stammdaten in einem Zug
   * ====================================================================== */
  function dealVollstaendig(einstellungen, deal) {
    return Promise.all([
      organisation(einstellungen, deal.orgId),
      person(einstellungen, deal.personId)
    ]).then(function (teile) {
      return { deal: deal, organisation: teile[0], person: teile[1] };
    });
  }

  /* =========================================================================
   * Übernahme in ein Projekt
   * ======================================================================
   * Bewusst als reine Abbildung ohne Seiteneffekte: Dieselbe Funktion kann
   * später ein Webhook-Dienst verwenden, der dieselben Daten liefert.
   */
  function aufProjektAbbilden(projekt, daten, einstellungen) {
    var deal = daten.deal || {};
    var org = daten.organisation;
    var pers = daten.person;
    var host = hostAus(einstellungen).replace(/^api\./, '');
    var uebernommen = [];

    function setzen(feld, wert, bezeichnung) {
      if (wert === undefined || wert === null || String(wert).trim() === '') return;
      if (String(projekt[feld] || '').trim() !== '') return;   /* Vorhandenes nicht überschreiben */
      projekt[feld] = String(wert).trim();
      uebernommen.push(bezeichnung);
    }

    if (org) {
      setzen('kunde', org.name, 'Kunde');
      var adresse = org.adresse || {};
      if (!adresse.strasse && adresse.gesamt) {
        var zerlegt = adresseZerlegen(adresse.gesamt);
        if (zerlegt) adresse = { strasse: zerlegt.strasse, plz: zerlegt.plz, ort: zerlegt.ort };
      }
      setzen('strasse', adresse.strasse, 'Straße');
      setzen('plz', adresse.plz, 'PLZ');
      setzen('ort', adresse.ort, 'Ort');
    }
    if (pers) {
      setzen('ansprechpartner', pers.name, 'Ansprechpartner');
      setzen('telefon', pers.telefon, 'Telefon');
      setzen('email', pers.email, 'E-Mail');
    }
    setzen('objekt', deal.titel, 'Objekt');
    if (!projekt.name || projekt.name === 'Neues Aufmaß') {
      projekt.name = deal.titel || projekt.name;
    }

    /* Verknüpfung festhalten - Grundlage für eine spätere Automatik */
    projekt.pipedrive = {
      dealId: deal.id || null,
      orgId: (org && org.id) || deal.orgId || null,
      personId: (pers && pers.id) || deal.personId || null,
      pipelineId: deal.pipelineId || null,
      dealTitel: deal.titel || '',
      host: host,
      dealLink: deal.id ? ('https://' + host + '/deal/' + deal.id) : '',
      uebernommen: new Date().toISOString()
    };
    return { projekt: projekt, uebernommen: uebernommen };
  }

  /* =========================================================================
   * Diagnose: Warum wird kein Deal angeboten?
   * ======================================================================
   * Diese Abfrage beantwortet genau eine Frage: Was liefert Pipedrive
   * tatsaechlich, und woran scheitert die Uebernahmeregel? Sie liest die
   * offenen Deals bewusst OHNE Pipeline- und Phasenfilter und prueft erst
   * danach jeden Deal gegen die eingestellte Regel. So wird sichtbar, ob
   * ueberhaupt Deals ankommen, ob sie in der erwarteten Pipeline stehen und
   * in welcher Phase sie tatsaechlich liegen.
   *
   * Der Bericht enthaelt niemals den Zugriffsschluessel.
   */
  function diagnose(einstellungen, vorhandeneProjekte) {
    var e = einstellungen || {};
    var bericht = {
      host: hostAus(e),
      pipelineId: String(e.pipedrivePipelineId || ''),
      pipelineName: e.pipedrivePipelineName || '',
      phaseId: String(e.pipedrivePhaseId || ''),
      phaseName: e.pipedrivePhaseName || '',
      schritte: [],
      deals: [],
      phasen: [],
      zahlen: { gelesen: 0, inPipeline: 0, inPhase: 0, uebernehmbar: 0,
                vorhanden: 0, nichtOffen: 0, gefiltert: null },
      grenze: 200,
      hinweise: []
    };

    function schritt(name, ok, text) {
      bericht.schritte.push({ name: name, ok: !!ok, text: text || '' });
    }
    function hinweis(text) {
      if (bericht.hinweise.indexOf(text) === -1) bericht.hinweise.push(text);
    }

    return verbindungPruefen(e).then(function (u) {
      schritt('Zugang', true, 'Angemeldet als ' + (u.name || '–') +
        (u.firma ? ('  ·  ' + u.firma) : ''));
      return pipelines(e);
    }).then(function (liste) {
      bericht.pipelines = liste;
      if (!bericht.pipelineId) {
        schritt('Pipeline', true, 'Keine Pipeline festgelegt – es werden alle gelesen.');
      } else {
        var treffer = liste.filter(function (pl) {
          return String(pl.id) === bericht.pipelineId; })[0];
        if (treffer) {
          bericht.pipelineName = treffer.name;
          schritt('Pipeline', true, '„' + treffer.name + '“  (Nr. ' + treffer.id + ')');
        } else {
          schritt('Pipeline', false, 'Die gespeicherte Pipeline Nr. ' + bericht.pipelineId +
            ' gibt es in diesem Konto nicht (mehr).');
          hinweis('Die eingestellte Pipeline passt zu keiner Pipeline in Pipedrive. ' +
                  'Bitte unter Einstellungen erneut auswählen.');
        }
      }
      return bericht.pipelineId ? phasen(e, bericht.pipelineId) : Promise.resolve([]);
    }).then(function (liste) {
      bericht.phasen = liste;
      if (!bericht.pipelineId) {
        schritt('Phase', true, 'Ohne Pipeline gibt es keine Phaseneingrenzung.');
      } else if (!bericht.phaseId) {
        schritt('Phase', true, 'Keine Phase festgelegt – alle Phasen der Pipeline zählen.');
      } else {
        var ph = liste.filter(function (x) { return String(x.id) === bericht.phaseId; })[0];
        if (ph) {
          bericht.phaseName = ph.name;
          schritt('Phase', true, '„' + ph.name + '“  (Nr. ' + ph.id + ')');
        } else {
          schritt('Phase', false, 'Die gespeicherte Phase Nr. ' + bericht.phaseId +
            ' gehört nicht zu dieser Pipeline.');
          hinweis('Die eingestellte Phase gehört nicht zur eingestellten Pipeline. ' +
                  'Das ist der häufigste Grund dafür, dass kein Deal angeboten wird: ' +
                  'Bitte unter Einstellungen Pipeline und danach Phase neu auswählen.');
        }
      }
      /* Bewusst ohne Pipeline- und Phasenfilter lesen */
      return deals(e, undefined, { status: 'open', limit: bericht.grenze, ohneNachfilter: true });
    }).then(function (alle) {
      bericht.zahlen.gelesen = alle.length;
      schritt('Offene Deals', alle.length > 0,
        alle.length + (alle.length === 1 ? ' offener Deal im Konto gelesen'
                                         : ' offene Deals im Konto gelesen') +
        (alle.length >= bericht.grenze ? ' (Obergrenze erreicht – es können mehr sein)' : ''));
      if (!alle.length) {
        hinweis('Pipedrive liefert überhaupt keine offenen Deals. Dann kann auch kein ' +
                'Aufmaß angeboten werden.');
      }

      var phasenName = {};
      bericht.phasen.forEach(function (ph) { phasenName[String(ph.id)] = ph.name; });
      var pipelineName = {};
      (bericht.pipelines || []).forEach(function (pl) { pipelineName[String(pl.id)] = pl.name; });

      bericht.deals = alle.map(function (deal) {
        var pr = istZuUebernehmen(deal, e, vorhandeneProjekte);
        return {
          id: deal.id, titel: deal.titel, status: deal.status,
          pipelineId: deal.pipelineId,
          pipelineName: pipelineName[String(deal.pipelineId)] || '',
          phaseId: deal.phaseId,
          phaseName: phasenName[String(deal.phaseId)] || '',
          geaendert: deal.geaendert,
          code: pr.code, grund: pr.grund, uebernehmen: pr.uebernehmen
        };
      });

      bericht.zahlen.inPipeline = bericht.deals.filter(function (d) {
        return !bericht.pipelineId || String(d.pipelineId || '') === bericht.pipelineId; }).length;
      bericht.zahlen.inPhase = bericht.deals.filter(function (d) {
        return d.code !== 'pipeline' && d.code !== 'phase'; }).length;
      bericht.zahlen.uebernehmbar = bericht.deals.filter(function (d) { return d.uebernehmen; }).length;
      bericht.zahlen.vorhanden = bericht.deals.filter(function (d) { return d.code === 'vorhanden'; }).length;
      bericht.zahlen.nichtOffen = bericht.deals.filter(function (d) { return d.code === 'status'; }).length;

      if (bericht.pipelineId && bericht.zahlen.gelesen && !bericht.zahlen.inPipeline) {
        hinweis('Kein einziger offener Deal steht in der eingestellten Pipeline „' +
                (bericht.pipelineName || bericht.pipelineId) + '“.');
      } else if (bericht.phaseId && bericht.zahlen.inPipeline && !bericht.zahlen.inPhase) {
        hinweis('In der Pipeline stehen ' + bericht.zahlen.inPipeline + ' offene Deals, aber ' +
                'keiner davon in der Phase „' + (bericht.phaseName || bericht.phaseId) +
                '“. Erst wenn ein Deal in diese Phase geschoben wird, wird er angeboten.');
      } else if (bericht.zahlen.inPhase && !bericht.zahlen.uebernehmbar) {
        hinweis('Alle passenden Deals haben bereits ein Aufmaß. Unter „Bereits übernommen“ ' +
                'im Dialog lässt sich das vorhandene Aufmaß öffnen.');
      }

      /* Gegenprobe: liefert dieselbe Abfrage MIT Filter dasselbe Ergebnis? */
      return deals(e, bericht.pipelineId || undefined, {
        phaseId: bericht.phaseId || undefined, status: 'open', limit: bericht.grenze,
        ohneNachfilter: true
      }).then(function (gefiltert) {
        bericht.zahlen.gefiltert = gefiltert.length;
        var erwartet = bericht.zahlen.inPhase;
        schritt('Gefilterte Abfrage', gefiltert.length === erwartet,
          gefiltert.length + ' Deal(s) – erwartet waren ' + erwartet);
        if (gefiltert.length !== erwartet) {
          hinweis('Die eingegrenzte Abfrage an Pipedrive liefert eine andere Anzahl als die ' +
                  'eigene Nachprüfung (' + gefiltert.length + ' statt ' + erwartet + '). ' +
                  'Das Werkzeug prüft die Eingrenzung deshalb selbst nach – angeboten werden ' +
                  'nur die tatsächlich passenden Deals. Bitte diesen Bericht weitergeben.');
        }
        return bericht;
      }, function () {
        schritt('Gefilterte Abfrage', false, 'Die eingegrenzte Abfrage schlug fehl.');
        return bericht;
      });
    });
  }

  global.Pipedrive = {
    STANDARD_HOST: STANDARD_HOST,
    hostAus: hostAus,
    verbindungPruefen: verbindungPruefen,
    pipelines: pipelines,
    phasen: phasen,
    deals: deals,
    diagnose: diagnose,
    istZuUebernehmen: istZuUebernehmen,
    projektZuDeal: projektZuDeal,
    organisation: organisation,
    person: person,
    dealVollstaendig: dealVollstaendig,
    aufProjektAbbilden: aufProjektAbbilden,
    _intern: { adresseLesen: adresseLesen, adresseZerlegen: adresseZerlegen,
               erstesFeld: erstesFeld, eigeneFelderLesen: eigeneFelderLesen, holen: holen }
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.Pipedrive; }
})(typeof window !== 'undefined' ? window : globalThis);
