<?php
/**
 * projekte.php — Die gemeinsame Ablage der Aufmaße.
 *
 * Regel für die Rechte (so abgestimmt): Jeder Angemeldete der Organisation
 * sieht alle Aufmaße. Ändern darf nur, wer für das Aufmaß zuständig ist.
 *
 * Zwei Ausnahmen, die in der Praxis nötig sind:
 *  - Wer ein Aufmaß neu anlegt, wird selbst zuständig.
 *  - Ein Aufmaß ohne jede Zuständigkeit darf jeder übernehmen. Ohne diese
 *    Regel wäre ein Aufmaß für immer gesperrt, sobald der einzige
 *    Zuständige das Unternehmen verlässt.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Projekte {

    /** Obergrenze für die Projektdaten ohne Fotos. */
    const GROESSE_MAX = 8388608;   /* 8 MiB */

    private static function tabelle_projekte() {
        return Aufmass_Datenbank::tabelle('projekte');
    }

    /* ---------------------------------------------------------------- */
    /* Lesen                                                             */
    /* ---------------------------------------------------------------- */

    /**
     * Was hat sich seit der Marke geändert? Schlanke Liste ohne die
     * eigentlichen Daten - das Gerät holt nur, was es wirklich braucht.
     */
    public static function liste($seit = '') {
        global $wpdb;
        $tab = Aufmass_Datenbank::tabelle('projekte');
        $marke = Aufmass_Datenbank::marke();

        if ($seit !== '') {
            $ab = Aufmass_Datenbank::marke_zu_zeit($seit);
            $zeilen = $wpdb->get_results($wpdb->prepare(
                "SELECT id, kunde, objekt, anlagen_nr, version, geaendert_am, geaendert_von,
                        angelegt_von, geloescht
                 FROM $tab WHERE geaendert_am > %s ORDER BY geaendert_am ASC", $ab), ARRAY_A);
        } else {
            $zeilen = $wpdb->get_results(
                "SELECT id, kunde, objekt, anlagen_nr, version, geaendert_am, geaendert_von,
                        angelegt_von, geloescht
                 FROM $tab ORDER BY geaendert_am ASC", ARRAY_A);
        }

        $zustaendige = self::zustaendige_sammeln(array_column($zeilen ?: array(), 'id'));
        $namen = self::namen_sammeln();
        $aus = array();
        foreach (($zeilen ?: array()) as $z) {
            $aus[] = array(
                'id' => $z['id'],
                'kunde' => $z['kunde'],
                'objekt' => $z['objekt'],
                'anlagenNr' => $z['anlagen_nr'],
                'version' => (int) $z['version'],
                'geaendertAm' => self::iso($z['geaendert_am']),
                'geaendertVon' => isset($namen[$z['geaendert_von']]) ? $namen[$z['geaendert_von']] : '',
                'geloescht' => (int) $z['geloescht'] === 1,
                'zustaendige' => isset($zustaendige[$z['id']]) ? $zustaendige[$z['id']] : array()
            );
        }
        return array('marke' => $marke, 'projekte' => $aus);
    }

    public static function laden($id) {
        global $wpdb;
        $tab = Aufmass_Datenbank::tabelle('projekte');
        $z = $wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE id = %s", $id), ARRAY_A);
        if (!$z) { return null; }
        $daten = json_decode($z['daten'], true);
        if (!is_array($daten)) { $daten = array(); }
        $namen = self::namen_sammeln();
        return array(
            'id' => $z['id'],
            'version' => (int) $z['version'],
            'geaendertAm' => self::iso($z['geaendert_am']),
            'geaendertVon' => isset($namen[$z['geaendert_von']]) ? $namen[$z['geaendert_von']] : '',
            'geloescht' => (int) $z['geloescht'] === 1,
            'zustaendige' => self::zustaendige_von($id),
            'daten' => $daten
        );
    }

    /* ---------------------------------------------------------------- */
    /* Schreiben                                                         */
    /* ---------------------------------------------------------------- */

    /**
     * Speichert ein Aufmaß. $basis ist die Version, auf der das Gerät
     * aufgebaut hat. Stimmt sie nicht mehr, hat in der Zwischenzeit jemand
     * anderes gespeichert: Dann wird NICHT überschrieben, sondern die
     * Servermappe zurückgegeben, damit das Gerät zusammenführen kann.
     */
    public static function speichern($id, $daten, $basis, $benutzer) {
        global $wpdb;
        $tab = Aufmass_Datenbank::tabelle('projekte');

        if (!is_array($daten)) {
            return new WP_Error('daten_fehlen', 'Es wurden keine Projektdaten übergeben.', array('status' => 400));
        }
        /* Fotos gehören nicht in die Projektdaten - sie haben einen eigenen
           Weg. Hier wird das durchgesetzt, nicht nur erwartet. */
        $daten = self::fotos_entladen($daten);
        $json = wp_json_encode($daten);
        if ($json === false) {
            return new WP_Error('daten_unlesbar', 'Die Projektdaten ließen sich nicht verarbeiten.', array('status' => 400));
        }
        if (strlen($json) > self::GROESSE_MAX) {
            return new WP_Error('zu_gross',
                'Dieses Aufmaß ist zu umfangreich für die Übertragung (' .
                size_format(strlen($json)) . '). Bitte in zwei Aufmaße teilen.',
                array('status' => 413));
        }

        $vorhanden = $wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE id = %s", $id), ARRAY_A);
        $jetzt = Aufmass_Datenbank::jetzt();

        /* --- Neu --- */
        if (!$vorhanden) {
            $wpdb->insert($tab, array(
                'id' => $id,
                'kunde' => self::kurz(isset($daten['kunde']) ? $daten['kunde'] : '', 255),
                'objekt' => self::kurz(isset($daten['objekt']) ? $daten['objekt'] : '', 255),
                'anlagen_nr' => self::kurz(isset($daten['anlagenNr']) ? $daten['anlagenNr'] : '', 100),
                'daten' => $json,
                'version' => 1,
                'angelegt_am' => $jetzt,
                'angelegt_von' => $benutzer['id'],
                'geaendert_am' => $jetzt,
                'geaendert_von' => $benutzer['id'],
                'geloescht' => 0
            ));
            /* Wer anlegt, ist zuständig. */
            self::zustaendig_hinzufuegen($id, $benutzer['id']);
            return self::laden($id);
        }

        /* --- Rechte --- */
        $darf = self::darf_aendern($id, $benutzer);
        if (is_wp_error($darf)) { return $darf; }

        /* --- Versionsabgleich --- */
        $basis = (int) $basis;
        if ($basis !== (int) $vorhanden['version']) {
            $server = self::laden($id);
            return new WP_Error('konflikt',
                'Dieses Aufmaß wurde zwischenzeitlich von einer anderen Stelle geändert.',
                array('status' => 409, 'server' => $server));
        }

        /* Die Version steht mit in der WHERE-Bedingung: Zwischen dem Lesen
           oben und dem Schreiben hier kann ein zweites Gerät mit derselben
           Basis gespeichert haben. Ohne diese Bedingung überschriebe der
           Zweite den Ersten stillschweigend - ein verlorener Stand, den
           niemand bemerkt. So trifft die Änderung nur die erwartete Version;
           sonst gibt es den Konflikt wie oben, samt Serverstand. */
        $betroffen = $wpdb->update($tab, array(
            'kunde' => self::kurz(isset($daten['kunde']) ? $daten['kunde'] : '', 255),
            'objekt' => self::kurz(isset($daten['objekt']) ? $daten['objekt'] : '', 255),
            'anlagen_nr' => self::kurz(isset($daten['anlagenNr']) ? $daten['anlagenNr'] : '', 100),
            'daten' => $json,
            'version' => (int) $vorhanden['version'] + 1,
            'geaendert_am' => $jetzt,
            'geaendert_von' => $benutzer['id'],
            /* Ein erneutes Speichern holt ein gelöschtes Aufmaß zurück. */
            'geloescht' => 0,
            'geloescht_am' => null
        ), array('id' => $id, 'version' => (int) $vorhanden['version']));
        if (!$betroffen) {
            return new WP_Error('konflikt',
                'Dieses Aufmaß wurde im selben Augenblick von einer anderen Stelle geändert.',
                array('status' => 409, 'server' => self::laden($id)));
        }

        return self::laden($id);
    }

    /** Löschen heißt Papierkorb: Die Mappe bleibt, wird aber überall ausgeblendet. */
    public static function loeschen($id, $benutzer) {
        global $wpdb;
        $tab = Aufmass_Datenbank::tabelle('projekte');
        $vorhanden = $wpdb->get_row($wpdb->prepare("SELECT id FROM $tab WHERE id = %s", $id), ARRAY_A);
        if (!$vorhanden) {
            return new WP_Error('unbekannt', 'Dieses Aufmaß gibt es hier nicht.', array('status' => 404));
        }
        $darf = self::darf_aendern($id, $benutzer);
        if (is_wp_error($darf)) { return $darf; }

        $jetzt = Aufmass_Datenbank::jetzt();
        /* Die Version zählt die Datenbank selbst hoch - in einem Schritt,
           ohne Lücke zwischen Lesen und Schreiben. */
        $wpdb->query($wpdb->prepare(
            "UPDATE $tab SET geloescht = 1, geloescht_am = %s, geaendert_am = %s, geaendert_von = %s, version = version + 1 WHERE id = %s",
            $jetzt, $jetzt, $benutzer['id'], $id));
        return array('ok' => true);
    }

    /** Nach so vielen Tagen im Papierkorb wird ein Aufmaß endgültig entfernt. */
    const PAPIERKORB_TAGE = 90;

    /**
     * Täglich: gelöschte Aufmaße, deren Papierkorbfrist abgelaufen ist,
     * endgültig entfernen - samt Fotos, Zuständigkeiten und Freigaben.
     * Bis dahin lässt sich ein versehentlich gelöschtes Aufmaß noch
     * zurückholen (ein erneutes Speichern von einem Gerät genügt).
     */
    public static function papierkorb_leeren($tage = null) {
        global $wpdb;
        $tage = $tage === null ? self::PAPIERKORB_TAGE : (int) $tage;
        $tab = self::tabelle_projekte();
        $grenze = gmdate('Y-m-d H:i:s', time() - $tage * 86400) . '.000000';
        $ids = $wpdb->get_col($wpdb->prepare(
            "SELECT id FROM $tab WHERE geloescht = 1 AND geloescht_am IS NOT NULL AND geloescht_am < %s", $grenze));
        $ft = Aufmass_Datenbank::tabelle('fotos');
        foreach (($ids ?: array()) as $id) {
            foreach (($wpdb->get_col($wpdb->prepare("SELECT id FROM $ft WHERE projekt_id = %s", $id)) ?: array()) as $foto_id) {
                Aufmass_Fotos::loeschen($foto_id);
            }
            $wpdb->delete(Aufmass_Datenbank::tabelle('zustaendig'), array('projekt_id' => $id));
            if (class_exists('Aufmass_Freigaben')) { Aufmass_Freigaben::alle_loeschen($id); }
            $wpdb->delete($tab, array('id' => $id));
        }
        return count($ids ?: array());
    }

    /* ---------------------------------------------------------------- */
    /* Zuständigkeiten                                                   */
    /* ---------------------------------------------------------------- */
    public static function darf_aendern($id, $benutzer) {
        global $wpdb;
        if (!$benutzer) {
            return new WP_Error('nicht_angemeldet', 'Nicht angemeldet.', array('status' => 401));
        }
        /* Erst prüfen, ob es das Aufmaß überhaupt gibt.
         *
         * Ohne diese Prüfung griffe weiter unten die Regel "ein Aufmaß ohne
         * Zuständige darf jeder übernehmen" auch für eine frei erfundene
         * Kennung - und jeder Angemeldete könnte Fotos und Zuständigkeiten
         * an Aufmaße hängen, die es gar nicht gibt. */
        $tab = self::tabelle_projekte();
        $da = $wpdb->get_var($wpdb->prepare("SELECT id FROM $tab WHERE id = %s", $id));
        if (!$da) {
            return new WP_Error('unbekannt', 'Dieses Aufmaß gibt es hier nicht.', array('status' => 404));
        }
        if ($benutzer['rolle'] === 'verwaltung') { return true; }

        $liste = self::zustaendige_von($id);
        if (!count($liste)) {
            /* Herrenloses Aufmaß: übernehmen statt aussperren. */
            self::zustaendig_hinzufuegen($id, $benutzer['id']);
            return true;
        }
        foreach ($liste as $z) {
            if ($z['id'] === $benutzer['id']) { return true; }
        }
        $namen = array();
        foreach ($liste as $z) { $namen[] = $z['name']; }
        return new WP_Error('nicht_zustaendig',
            'Für dieses Aufmaß ist ' . implode(' und ', $namen) . ' zuständig. '
            . 'Du kannst es lesen, aber nicht ändern.',
            array('status' => 403));
    }

    /**
     * Dieselbe Frage wie darf_aendern(), aber OHNE Nebenwirkung: Ein
     * herrenloses Aufmaß wird hier nicht übernommen, nur gemeldet. Das
     * braucht der Abgleich, wenn er bei jedem Durchgang nachsieht, welche
     * Kundenrückmeldungen diese Person übernehmen dürfte - das darf
     * niemanden still zum Zuständigen machen.
     */
    public static function darf_pruefen($id, $benutzer) {
        if (!$benutzer) { return false; }
        if ($benutzer['rolle'] === 'verwaltung') { return true; }
        $liste = self::zustaendige_von($id);
        if (!count($liste)) { return true; }
        foreach ($liste as $z) {
            if ($z['id'] === $benutzer['id']) { return true; }
        }
        return false;
    }

    public static function zustaendige_setzen($id, $benutzer_ids, $benutzer) {
        global $wpdb;
        $darf = self::darf_aendern($id, $benutzer);
        if (is_wp_error($darf)) { return $darf; }

        $tab = Aufmass_Datenbank::tabelle('zustaendig');
        $bt = Aufmass_Datenbank::tabelle('benutzer');
        $gueltig = $wpdb->get_col("SELECT id FROM $bt WHERE aktiv = 1");

        $wpdb->delete($tab, array('projekt_id' => $id));
        $gesetzt = 0;
        foreach ((array) $benutzer_ids as $bid) {
            if (!in_array($bid, $gueltig, true)) { continue; }
            self::zustaendig_hinzufuegen($id, $bid);
            $gesetzt++;
        }
        /* Niemand zuständig wäre ein Aufmaß, das keiner mehr bearbeitet.
           Dann bleibt der, der die Änderung vorgenommen hat. */
        if ($gesetzt === 0) { self::zustaendig_hinzufuegen($id, $benutzer['id']); }

        /* Die Änderung muss sich auch abgleichen: Marke fortschreiben. */
        $pt = Aufmass_Datenbank::tabelle('projekte');
        $wpdb->update($pt, array('geaendert_am' => Aufmass_Datenbank::jetzt()), array('id' => $id));
        return self::zustaendige_von($id);
    }

    private static function zustaendig_hinzufuegen($projekt_id, $benutzer_id) {
        global $wpdb;
        $wpdb->query($wpdb->prepare(
            'INSERT IGNORE INTO ' . Aufmass_Datenbank::tabelle('zustaendig')
            . ' (projekt_id, benutzer_id, seit) VALUES (%s, %s, %s)',
            $projekt_id, $benutzer_id, Aufmass_Datenbank::jetzt()));
    }

    public static function zustaendige_von($projekt_id) {
        $alle = self::zustaendige_sammeln(array($projekt_id));
        return isset($alle[$projekt_id]) ? $alle[$projekt_id] : array();
    }

    private static function zustaendige_sammeln($projekt_ids) {
        global $wpdb;
        $projekt_ids = array_values(array_filter((array) $projekt_ids));
        if (!count($projekt_ids)) { return array(); }
        $zt = Aufmass_Datenbank::tabelle('zustaendig');
        $bt = Aufmass_Datenbank::tabelle('benutzer');
        $platz = implode(',', array_fill(0, count($projekt_ids), '%s'));
        $zeilen = $wpdb->get_results($wpdb->prepare(
            "SELECT z.projekt_id, b.id, b.name, b.email
             FROM $zt z JOIN $bt b ON b.id = z.benutzer_id
             WHERE z.projekt_id IN ($platz) AND b.aktiv = 1", $projekt_ids), ARRAY_A);
        $aus = array();
        foreach (($zeilen ?: array()) as $z) {
            if (!isset($aus[$z['projekt_id']])) { $aus[$z['projekt_id']] = array(); }
            $aus[$z['projekt_id']][] = array('id' => $z['id'], 'name' => $z['name'], 'email' => $z['email']);
        }
        return $aus;
    }

    /* ---------------------------------------------------------------- */
    /* Hilfsmittel                                                       */
    /* ---------------------------------------------------------------- */

    /** Entfernt die Bilddaten, behält aber jeden Fotoeintrag. */
    public static function fotos_entladen($daten) {
        if (empty($daten['tueren']) || !is_array($daten['tueren'])) { return $daten; }
        foreach ($daten['tueren'] as $i => $tuer) {
            if (empty($tuer['fotos']) || !is_array($tuer['fotos'])) { continue; }
            foreach ($tuer['fotos'] as $j => $foto) {
                if (isset($foto['dataUrl'])) { $daten['tueren'][$i]['fotos'][$j]['dataUrl'] = ''; }
            }
        }
        return $daten;
    }

    private static function namen_sammeln() {
        global $wpdb;
        static $vorrat = null;
        if ($vorrat !== null) { return $vorrat; }
        $bt = Aufmass_Datenbank::tabelle('benutzer');
        $vorrat = array();
        foreach (($wpdb->get_results("SELECT id, name FROM $bt", ARRAY_A) ?: array()) as $z) {
            $vorrat[$z['id']] = $z['name'];
        }
        return $vorrat;
    }

    private static function kurz($text, $laenge) {
        $text = is_string($text) ? $text : '';
        return function_exists('mb_substr') ? mb_substr($text, 0, $laenge) : substr($text, 0, $laenge);
    }

    private static function iso($zeit) {
        if (!$zeit) { return ''; }
        return str_replace(' ', 'T', substr($zeit, 0, 26)) . 'Z';
    }
}
