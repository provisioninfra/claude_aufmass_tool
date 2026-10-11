<?php
/**
 * anmeldung.php — Anmeldung über Google und eigene Sitzungen.
 *
 * Ablauf: Der Browser holt bei Google einen Ausweis, schickt ihn einmal
 * hierher, der Server prüft ihn (siehe jwt.php) und stellt daraufhin eine
 * eigene Sitzung aus. Danach spielt Google keine Rolle mehr - das Gerät
 * weist sich über ein Cookie aus.
 *
 * Die Sitzungen stehen in der Datenbank. Das ist aufwendiger als ein
 * selbsttragendes Cookie, hat aber einen Grund: Nur so lässt sich ein
 * Gerät nachträglich abmelden. Verlässt jemand das Unternehmen oder geht
 * ein iPad verloren, ist der Zugang sofort zu entziehen.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Anmeldung {

    const COOKIE = 'aufmass_sitzung';
    /** Wie lange eine Sitzung ohne Nutzung gilt, in Tagen. */
    const DAUER_TAGE = 30;

    private static $benutzer = null;
    private static $geprueft = false;
    /** Nur für Prüfläufe ohne Browser: dort gibt es keine Kopfzeilen. */
    public static $cookie_schreiben = true;

    /* ---------------------------------------------------------------- */
    /* Anmelden                                                          */
    /* ---------------------------------------------------------------- */
    public static function anmelden($token) {
        $client = trim((string) get_option('aufmass_client_id', ''));
        $domaene = trim((string) get_option('aufmass_domaene', ''));
        if ($client === '') {
            return new WP_Error('nicht_eingerichtet',
                'Der Abgleich ist noch nicht eingerichtet: Es fehlt die Google-Client-ID.',
                array('status' => 503));
        }

        $ergebnis = Aufmass_JWT::pruefen($token, $client, $domaene);
        if (empty($ergebnis['ok'])) {
            return new WP_Error('anmeldung_abgelehnt', $ergebnis['grund'], array('status' => 401));
        }
        $a = $ergebnis['daten'];

        global $wpdb;
        $tab = Aufmass_Datenbank::tabelle('benutzer');
        $jetzt = Aufmass_Datenbank::jetzt();
        $vorhanden = $wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE id = %s", $a['sub']), ARRAY_A);

        if ($vorhanden) {
            if ((int) $vorhanden['aktiv'] !== 1) {
                return new WP_Error('gesperrt',
                    'Dieser Zugang wurde gesperrt. Bitte in der Verwaltung melden.',
                    array('status' => 403));
            }
            $wpdb->update($tab, array(
                'email' => $a['email'],
                'name' => isset($a['name']) ? $a['name'] : $vorhanden['name'],
                'bild' => isset($a['picture']) ? $a['picture'] : '',
                'letzte_anmeldung' => $jetzt
            ), array('id' => $a['sub']));
            $rolle = $vorhanden['rolle'];
        } else {
            /* Die erste Anmeldung bekommt die Verwaltung - sonst könnte
               niemand die weiteren Zugänge freischalten. */
            $erster = (int) $wpdb->get_var("SELECT COUNT(*) FROM $tab") === 0;
            $rolle = $erster ? 'verwaltung' : 'mitarbeit';
            $wpdb->insert($tab, array(
                'id' => $a['sub'],
                'email' => $a['email'],
                'name' => isset($a['name']) ? $a['name'] : $a['email'],
                'bild' => isset($a['picture']) ? $a['picture'] : '',
                'rolle' => $rolle,
                'aktiv' => 1,
                'erste_anmeldung' => $jetzt,
                'letzte_anmeldung' => $jetzt
            ));
        }

        $sitzung = self::sitzung_anlegen($a['sub']);
        return array(
            'benutzer' => array(
                'id' => $a['sub'],
                'email' => $a['email'],
                'name' => isset($a['name']) ? $a['name'] : $a['email'],
                'bild' => isset($a['picture']) ? $a['picture'] : '',
                'rolle' => $rolle
            ),
            'sitzung' => $sitzung
        );
    }

    /* ---------------------------------------------------------------- */
    /* Sitzungen                                                         */
    /* ---------------------------------------------------------------- */
    private static function sitzung_anlegen($benutzer_id) {
        global $wpdb;
        $id = bin2hex(random_bytes(16));
        $geheim = bin2hex(random_bytes(32));
        $bis = gmdate('Y-m-d H:i:s.000000', time() + self::DAUER_TAGE * 86400);

        $wpdb->insert(Aufmass_Datenbank::tabelle('sitzungen'), array(
            'id' => $id,
            /* In der Datenbank steht nur der Abdruck: Wer sie liest, kann
               damit keine Sitzung übernehmen. */
            'pruefwert' => hash('sha256', $geheim),
            'benutzer_id' => $benutzer_id,
            'geraet' => self::geraet_beschreiben(),
            'erstellt_am' => Aufmass_Datenbank::jetzt(),
            'gesehen_am' => Aufmass_Datenbank::jetzt(),
            'gueltig_bis' => $bis
        ));

        $wert = $id . '.' . $geheim;
        self::cookie_setzen($wert, time() + self::DAUER_TAGE * 86400);
        return $wert;
    }

    public static function abmelden() {
        $wert = self::cookie_lesen();
        if ($wert) {
            list($id) = array_pad(explode('.', $wert, 2), 2, '');
            global $wpdb;
            $wpdb->delete(Aufmass_Datenbank::tabelle('sitzungen'), array('id' => $id));
        }
        self::cookie_setzen('', time() - 3600);
        self::$benutzer = null;
        self::$geprueft = true;
    }

    /** Alle Sitzungen eines Benutzers beenden (z. B. Gerät verloren). */
    public static function alle_beenden($benutzer_id) {
        global $wpdb;
        return (int) $wpdb->delete(Aufmass_Datenbank::tabelle('sitzungen'),
            array('benutzer_id' => $benutzer_id));
    }

    public static function sitzungen_aufraeumen() {
        global $wpdb;
        $tab = Aufmass_Datenbank::tabelle('sitzungen');
        $wpdb->query($wpdb->prepare("DELETE FROM $tab WHERE gueltig_bis < %s",
            gmdate('Y-m-d H:i:s.000000')));
    }

    /* ---------------------------------------------------------------- */
    /* Wer ist gerade angemeldet?                                        */
    /* ---------------------------------------------------------------- */
    public static function aktueller_benutzer() {
        if (self::$geprueft) { return self::$benutzer; }
        self::$geprueft = true;
        self::$benutzer = null;

        $wert = self::cookie_lesen();
        if (!$wert) { return null; }
        $teile = explode('.', $wert, 2);
        if (count($teile) !== 2 || $teile[0] === '' || $teile[1] === '') { return null; }

        global $wpdb;
        $st = Aufmass_Datenbank::tabelle('sitzungen');
        $bt = Aufmass_Datenbank::tabelle('benutzer');
        $sitzung = $wpdb->get_row($wpdb->prepare("SELECT * FROM $st WHERE id = %s", $teile[0]), ARRAY_A);
        if (!$sitzung) { return null; }

        /* Zeitunabhängiger Vergleich: Sonst ließe sich der Abdruck
           zeichenweise erraten. */
        if (!hash_equals((string) $sitzung['pruefwert'], hash('sha256', $teile[1]))) { return null; }
        if (strtotime($sitzung['gueltig_bis']) < time()) { return null; }

        $benutzer = $wpdb->get_row($wpdb->prepare("SELECT * FROM $bt WHERE id = %s",
            $sitzung['benutzer_id']), ARRAY_A);
        if (!$benutzer || (int) $benutzer['aktiv'] !== 1) { return null; }

        /* Gültigkeit mitlaufen lassen, aber nicht bei jedem Aufruf
           schreiben - der Abgleich fragt im Minutentakt. */
        if (strtotime($sitzung['gesehen_am']) < time() - 3600) {
            $wpdb->update($st, array(
                'gesehen_am' => Aufmass_Datenbank::jetzt(),
                'gueltig_bis' => gmdate('Y-m-d H:i:s.000000', time() + self::DAUER_TAGE * 86400)
            ), array('id' => $teile[0]));
        }

        self::$benutzer = array(
            'id' => $benutzer['id'],
            'email' => $benutzer['email'],
            'name' => $benutzer['name'],
            'bild' => $benutzer['bild'],
            'rolle' => $benutzer['rolle']
        );
        return self::$benutzer;
    }

    public static function verlangt() {
        $b = self::aktueller_benutzer();
        if (!$b) {
            return new WP_Error('nicht_angemeldet',
                'Bitte mit dem Google-Konto der Organisation anmelden.',
                array('status' => 401));
        }
        return $b;
    }

    public static function ist_verwaltung() {
        $b = self::aktueller_benutzer();
        return $b && $b['rolle'] === 'verwaltung';
    }

    /* ---------------------------------------------------------------- */
    /* Hilfsmittel                                                       */
    /* ---------------------------------------------------------------- */
    private static function cookie_lesen() {
        return isset($_COOKIE[self::COOKIE]) ? (string) $_COOKIE[self::COOKIE] : '';
    }

    private static function cookie_setzen($wert, $bis) {
        $_COOKIE[self::COOKIE] = $wert;
        if (!self::$cookie_schreiben || headers_sent()) { return; }
        $pfad = defined('COOKIEPATH') && COOKIEPATH ? COOKIEPATH : '/';
        setcookie(self::COOKIE, $wert, array(
            'expires' => $bis,
            'path' => $pfad,
            'domain' => defined('COOKIE_DOMAIN') && COOKIE_DOMAIN ? COOKIE_DOMAIN : '',
            'secure' => is_ssl(),
            'httponly' => true,
            /* Strict: Das Cookie wird bei Aufrufen von fremden Seiten gar
               nicht erst mitgeschickt. Zusammen mit dem verlangten
               Kopffeld (siehe rest.php) ist das der Schutz vor
               untergeschobenen Anfragen. */
            'samesite' => 'Strict'
        ));
    }

    private static function geraet_beschreiben() {
        $roh = isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : '';
        $roh = preg_replace('/[^\x20-\x7E]/', '', $roh);
        if (stripos($roh, 'iPad') !== false) { return 'iPad'; }
        if (stripos($roh, 'iPhone') !== false) { return 'iPhone'; }
        if (stripos($roh, 'Android') !== false) { return 'Android-Gerät'; }
        if (stripos($roh, 'Macintosh') !== false) { return 'Mac'; }
        if (stripos($roh, 'Windows') !== false) { return 'Windows-Rechner'; }
        return substr($roh, 0, 120);
    }
}
