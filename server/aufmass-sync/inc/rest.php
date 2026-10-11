<?php
/**
 * rest.php — Die Schnittstelle, mit der das Werkzeug spricht.
 *
 * Alles unter /wp-json/aufmass/v1/. Jeder Aufruf prüft die Sitzung selbst;
 * es gibt keinen Weg, der ohne Anmeldung an Daten kommt.
 *
 * Schutz vor untergeschobenen Anfragen: Das Sitzungscookie ist auf
 * SameSite=Strict gesetzt und wird deshalb von fremden Seiten gar nicht
 * erst mitgeschickt. Zusätzlich verlangt jede schreibende Anfrage ein
 * eigenes Kopffeld - das kann eine fremde Seite ohne Zustimmung unseres
 * Servers nicht setzen.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Rest {

    const RAUM = 'aufmass/v1';
    const KOPFFELD = 'X-Aufmass-Abgleich';

    public static function starten() {
        register_rest_route(self::RAUM, '/start', array(
            'methods' => 'GET', 'callback' => array(__CLASS__, 'start'),
            'permission_callback' => '__return_true'
        ));
        register_rest_route(self::RAUM, '/anmelden', array(
            'methods' => 'POST', 'callback' => array(__CLASS__, 'anmelden'),
            'permission_callback' => array(__CLASS__, 'schreibschutz')
        ));
        register_rest_route(self::RAUM, '/abmelden', array(
            'methods' => 'POST', 'callback' => array(__CLASS__, 'abmelden'),
            'permission_callback' => array(__CLASS__, 'schreibschutz')
        ));
        register_rest_route(self::RAUM, '/ich', array(
            'methods' => 'GET', 'callback' => array(__CLASS__, 'ich'),
            'permission_callback' => array(__CLASS__, 'angemeldet')
        ));
        register_rest_route(self::RAUM, '/benutzer', array(
            'methods' => 'GET', 'callback' => array(__CLASS__, 'benutzer'),
            'permission_callback' => array(__CLASS__, 'angemeldet')
        ));
        register_rest_route(self::RAUM, '/projekte', array(
            'methods' => 'GET', 'callback' => array(__CLASS__, 'liste'),
            'permission_callback' => array(__CLASS__, 'angemeldet')
        ));
        register_rest_route(self::RAUM, '/projekte/(?P<id>[A-Za-z0-9_-]{1,64})', array(
            array('methods' => 'GET', 'callback' => array(__CLASS__, 'laden'),
                  'permission_callback' => array(__CLASS__, 'angemeldet')),
            array('methods' => 'PUT', 'callback' => array(__CLASS__, 'speichern'),
                  'permission_callback' => array(__CLASS__, 'angemeldet_schreibend')),
            array('methods' => 'DELETE', 'callback' => array(__CLASS__, 'loeschen'),
                  'permission_callback' => array(__CLASS__, 'angemeldet_schreibend'))
        ));
        register_rest_route(self::RAUM, '/projekte/(?P<id>[A-Za-z0-9_-]{1,64})/zustaendige', array(
            'methods' => 'PUT', 'callback' => array(__CLASS__, 'zustaendige'),
            'permission_callback' => array(__CLASS__, 'angemeldet_schreibend')
        ));
        register_rest_route(self::RAUM, '/projekte/(?P<id>[A-Za-z0-9_-]{1,64})/fotos', array(
            'methods' => 'GET', 'callback' => array(__CLASS__, 'fotoliste'),
            'permission_callback' => array(__CLASS__, 'angemeldet')
        ));
        /* Pipedrive: nur lesend, nur die vorgesehenen Wege (siehe pipedrive.php) */
        register_rest_route(self::RAUM, '/pipedrive/(?P<weg>v[12]/[A-Za-z0-9_/]{1,80})', array(
            'methods' => 'GET', 'callback' => array(__CLASS__, 'pipedrive'),
            'permission_callback' => array(__CLASS__, 'angemeldet')
        ));
        register_rest_route(self::RAUM, '/fotos/(?P<id>[A-Za-z0-9_-]{1,64})', array(
            array('methods' => 'GET', 'callback' => array(__CLASS__, 'foto_holen'),
                  'permission_callback' => array(__CLASS__, 'angemeldet')),
            array('methods' => 'PUT', 'callback' => array(__CLASS__, 'foto_ablegen'),
                  'permission_callback' => array(__CLASS__, 'angemeldet_schreibend'))
        ));
    }

    /* ---------------------------------------------------------------- */
    /* Zugangsprüfungen                                                  */
    /* ---------------------------------------------------------------- */
    public static function schreibschutz($anfrage) {
        if (!$anfrage->get_header(self::KOPFFELD)) {
            return new WP_Error('kopffeld_fehlt',
                'Diese Anfrage kam nicht vom Aufmaß-Werkzeug.', array('status' => 400));
        }
        return true;
    }

    public static function angemeldet() {
        $b = Aufmass_Anmeldung::verlangt();
        return is_wp_error($b) ? $b : true;
    }

    public static function angemeldet_schreibend($anfrage) {
        $schutz = self::schreibschutz($anfrage);
        if (is_wp_error($schutz)) { return $schutz; }
        return self::angemeldet();
    }

    /* ---------------------------------------------------------------- */
    /* Endpunkte                                                         */
    /* ---------------------------------------------------------------- */

    /**
     * Öffentlich: Was die Anmeldeseite wissen muss, bevor jemand da ist.
     *
     * Die bestehende Anmeldung wird gleich mitgemeldet. Sonst müsste das
     * Werkzeug beim Start erst einmal blind nachfragen und bekäme eine
     * Abweisung - die in der Entwicklerkonsole wie ein Fehler aussieht,
     * obwohl sie der Normalfall ist.
     */
    public static function start() {
        $benutzer = Aufmass_Anmeldung::aktueller_benutzer();
        return self::antwort(array(
            'eingerichtet' => trim((string) get_option('aufmass_client_id', '')) !== '',
            'clientId' => (string) get_option('aufmass_client_id', ''),
            'domaene' => (string) get_option('aufmass_domaene', ''),
            'angemeldet' => !!$benutzer,
            'benutzer' => $benutzer,
            'marke' => Aufmass_Datenbank::marke(),
            /* Nur OB Pipedrive eingerichtet ist und wo - nie der Schlüssel. */
            'pipedrive' => Aufmass_Pipedrive::eingerichtet(),
            'pipedriveHost' => Aufmass_Pipedrive::eingerichtet() ? Aufmass_Pipedrive::host_anzeige() : '',
            'version' => AUFMASS_VERSION
        ));
    }

    public static function pipedrive($anfrage) {
        $e = Aufmass_Pipedrive::anfrage($anfrage['weg'], $anfrage->get_query_params());
        return is_wp_error($e) ? $e : self::antwort($e);
    }

    public static function anmelden($anfrage) {
        $token = (string) $anfrage->get_param('token');
        if ($token === '') {
            return new WP_Error('kein_ausweis', 'Es wurde kein Google-Ausweis übergeben.', array('status' => 400));
        }
        $e = Aufmass_Anmeldung::anmelden($token);
        if (is_wp_error($e)) { return $e; }
        return self::antwort(array('benutzer' => $e['benutzer']));
    }

    public static function abmelden() {
        Aufmass_Anmeldung::abmelden();
        return self::antwort(array('ok' => true));
    }

    public static function ich() {
        return self::antwort(array(
            'benutzer' => Aufmass_Anmeldung::aktueller_benutzer(),
            'marke' => Aufmass_Datenbank::marke()
        ));
    }

    public static function benutzer() {
        global $wpdb;
        $bt = Aufmass_Datenbank::tabelle('benutzer');
        $zeilen = $wpdb->get_results("SELECT id, name, email, rolle FROM $bt WHERE aktiv = 1 ORDER BY name", ARRAY_A);
        return self::antwort(array('benutzer' => $zeilen ?: array()));
    }

    public static function liste($anfrage) {
        $d = Aufmass_Projekte::liste((string) $anfrage->get_param('seit'));
        /* Mit jedem Abgleich mitgeben, ob Pipedrive hier eingerichtet ist -
           ein neu hinterlegter Schlüssel wirkt so ohne Neuladen. */
        $d['pipedrive'] = Aufmass_Pipedrive::eingerichtet();
        $d['pipedriveHost'] = $d['pipedrive'] ? Aufmass_Pipedrive::host_anzeige() : '';
        return self::antwort($d);
    }

    public static function laden($anfrage) {
        $p = Aufmass_Projekte::laden($anfrage['id']);
        if (!$p) {
            return new WP_Error('unbekannt', 'Dieses Aufmaß gibt es hier nicht.', array('status' => 404));
        }
        return self::antwort($p);
    }

    public static function speichern($anfrage) {
        $benutzer = Aufmass_Anmeldung::aktueller_benutzer();
        $daten = $anfrage->get_param('daten');
        $basis = $anfrage->get_param('basisVersion');

        $e = Aufmass_Projekte::speichern($anfrage['id'], $daten, $basis, $benutzer);
        if (is_wp_error($e)) { return $e; }

        /* Fotos, die nicht mehr vorkommen, mitnehmen. */
        Aufmass_Fotos::verwaiste_aufraeumen($anfrage['id'], is_array($daten) ? $daten : array());
        return self::antwort($e);
    }

    public static function loeschen($anfrage) {
        $e = Aufmass_Projekte::loeschen($anfrage['id'], Aufmass_Anmeldung::aktueller_benutzer());
        return is_wp_error($e) ? $e : self::antwort($e);
    }

    public static function zustaendige($anfrage) {
        $ids = $anfrage->get_param('benutzer');
        $e = Aufmass_Projekte::zustaendige_setzen($anfrage['id'], is_array($ids) ? $ids : array(),
            Aufmass_Anmeldung::aktueller_benutzer());
        return is_wp_error($e) ? $e : self::antwort(array('zustaendige' => $e));
    }

    public static function fotoliste($anfrage) {
        return self::antwort(array('fotos' => Aufmass_Fotos::vorhandene($anfrage['id'])));
    }

    public static function foto_holen($anfrage) {
        $f = Aufmass_Fotos::holen($anfrage['id']);
        if (!$f) {
            return new WP_Error('unbekannt', 'Dieses Foto gibt es hier nicht.', array('status' => 404));
        }
        /* An WordPress vorbei ausliefern: Ein Bild ist kein JSON. */
        nocache_headers();
        header('Content-Type: ' . $f['mime']);
        header('Content-Length: ' . $f['groesse']);
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: inline');
        readfile($f['pfad']);
        exit;
    }

    public static function foto_ablegen($anfrage) {
        $benutzer = Aufmass_Anmeldung::aktueller_benutzer();
        $projekt_id = (string) $anfrage->get_param('projekt');
        if ($projekt_id === '') {
            return new WP_Error('kein_projekt', 'Zu welchem Aufmaß gehört das Foto?', array('status' => 400));
        }
        /* Fotos darf nur hochladen, wer das Aufmaß auch ändern darf. */
        $darf = Aufmass_Projekte::darf_aendern($projekt_id, $benutzer);
        if (is_wp_error($darf)) { return $darf; }

        $e = Aufmass_Fotos::speichern(
            $anfrage['id'], $projekt_id, (string) $anfrage->get_param('tuer'),
            $anfrage->get_body(),
            (string) ($anfrage->get_header('content-type') ?: 'image/jpeg'),
            $benutzer);
        return is_wp_error($e) ? $e : self::antwort($e);
    }

    /* ---------------------------------------------------------------- */
    private static function antwort($daten) {
        $antwort = new WP_REST_Response($daten, 200);
        /* Der Abgleich darf niemals aus einem Zwischenspeicher kommen. */
        $antwort->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        $antwort->header('Pragma', 'no-cache');
        return $antwort;
    }
}

add_action('rest_api_init', array('Aufmass_Rest', 'starten'));

/* Die Schnittstelle ist für eine Anwendung gedacht, nicht für Suchmaschinen
   oder fremde Seiten: keine Freigabe für andere Herkünfte. Das Werkzeug
   liegt unter derselben Adresse und braucht sie nicht. */
add_filter('rest_pre_serve_request', function ($bedient, $ergebnis, $anfrage) {
    if (strpos((string) $anfrage->get_route(), '/' . Aufmass_Rest::RAUM) === 0) {
        header_remove('Access-Control-Allow-Origin');
    }
    return $bedient;
}, 10, 3);
