<?php
/**
 * pipedrive.php — Weiterleitung an Pipedrive, mit dem Schlüssel auf dem Server.
 *
 * Bisher lag der Pipedrive-Zugriffsschlüssel auf jedem Gerät einzeln. Er
 * gilt dort mit allen Rechten des Pipedrive-Kontos - auf einem iPad, das
 * abhandenkommt, ist das ein Problem. Jetzt liegt er einmal hier,
 * verschlüsselt (siehe verschluesselung.php), und verlässt den Server nie.
 *
 * Das Werkzeug ruft diese Weiterleitung auf; die setzt den Schlüssel ein
 * und gibt Pipedrives Antwort zurück. Es werden ausschließlich lesende
 * Abfragen durchgelassen, und nur die wenigen, die das Werkzeug braucht.
 * Eine andere Adresse, ein anderes Verfahren, ein unbekannter Parameter:
 * abgewiesen.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Pipedrive {

    const STANDARD_HOST = 'api.pipedrive.com';

    /** Was das Werkzeug abfragt - und sonst nichts. */
    const ERLAUBT = array(
        '#^v1/users/me$#',
        '#^v2/pipelines$#',
        '#^v2/stages$#',
        '#^v2/deals$#',
        '#^v2/deals/[0-9]{1,12}$#',
        '#^v2/organizations/[0-9]{1,12}$#',
        '#^v2/persons/[0-9]{1,12}$#'
    );
    /** Parameter, die durchgereicht werden - mit ihrer Form. */
    const PARAMETER = array(
        'pipeline_id' => '/^[0-9]{1,12}$/',
        'stage_id' => '/^[0-9]{1,12}$/',
        'status' => '/^[a-z_]{1,24}$/',
        'limit' => '/^[0-9]{1,3}$/',
        'sort_by' => '/^[a-z_]{1,32}$/',
        'sort_direction' => '/^(asc|desc)$/'
    );

    /* ---------------------------------------------------------------- */
    /* Einrichtung                                                       */
    /* ---------------------------------------------------------------- */
    public static function token_setzen($klartext) {
        $klartext = trim((string) $klartext);
        if ($klartext === '') { delete_option('aufmass_pipedrive_token'); return true; }
        $chiffre = Aufmass_Verschluesselung::verschluesseln($klartext);
        if ($chiffre === null) { return false; }
        update_option('aufmass_pipedrive_token', $chiffre, false);
        return true;
    }

    /** Der Klartext - nur für die Weiterleitung selbst. Niemals ausgeben. */
    public static function token_lesen() {
        $chiffre = (string) get_option('aufmass_pipedrive_token', '');
        if ($chiffre === '') { return null; }
        $klar = Aufmass_Verschluesselung::entschluesseln($chiffre);
        return ($klar === null || trim($klar) === '') ? null : trim($klar);
    }

    /** Ein Schlüssel ist hinterlegt, lässt sich aber nicht mehr lesen. */
    public static function token_unlesbar() {
        return (string) get_option('aufmass_pipedrive_token', '') !== '' && self::token_lesen() === null;
    }

    public static function eingerichtet() {
        return self::token_lesen() !== null;
    }

    /**
     * Die Adresse der Pipedrive-Schnittstelle.
     * Eine eigene Firmenadresse wird angenommen; ein Schema nur dann, wenn
     * es auf den eigenen Rechner zeigt - sonst immer https. Ein Schlüssel
     * darf nie unverschlüsselt über das Netz gehen.
     */
    public static function host() {
        $roh = trim((string) get_option('aufmass_pipedrive_host', ''));
        if ($roh === '') { return 'https://' . self::STANDARD_HOST; }
        $schema = 'https';
        if (preg_match('#^(https?)://#i', $roh, $t)) {
            $schema = strtolower($t[1]);
            $roh = preg_replace('#^https?://#i', '', $roh);
        }
        $roh = preg_replace('#/.*$#', '', $roh);
        $roh = preg_replace('/[^A-Za-z0-9.\-:]/', '', $roh);
        if ($roh === '') { return 'https://' . self::STANDARD_HOST; }
        $lokal = preg_match('/^(127\.0\.0\.1|localhost)(:[0-9]+)?$/', $roh) === 1;
        if ($schema === 'http' && !$lokal) { $schema = 'https'; }
        return $schema . '://' . $roh;
    }

    /** Die Adresse ohne Schema, so wie das Werkzeug sie für Verweise braucht. */
    public static function host_anzeige() {
        return preg_replace('#^https?://#', '', self::host());
    }

    /* ---------------------------------------------------------------- */
    /* Weiterleitung                                                     */
    /* ---------------------------------------------------------------- */

    /**
     * @return array|WP_Error  ['status'=>int,'daten'=>mixed] - Pipedrives
     *         Antwort samt Statuscode, oder ein Fehler, wenn Pipedrive
     *         nicht erreichbar war oder die Anfrage nicht erlaubt ist.
     */
    public static function anfrage($weg, $parameter) {
        $weg = trim((string) $weg, '/');
        $erlaubt = false;
        foreach (self::ERLAUBT as $muster) { if (preg_match($muster, $weg)) { $erlaubt = true; break; } }
        if (!$erlaubt) {
            return new WP_Error('nicht_erlaubt', 'Diese Pipedrive-Abfrage ist nicht vorgesehen.', array('status' => 403));
        }
        $token = self::token_lesen();
        if ($token === null) {
            return new WP_Error('nicht_eingerichtet',
                'Pipedrive ist auf dem Server nicht eingerichtet.' .
                (self::token_unlesbar() ? ' Der hinterlegte Schlüssel ist nicht mehr lesbar - bitte neu eintragen.' : ''),
                array('status' => 503));
        }

        $sauber = array();
        foreach ((array) $parameter as $k => $w) {
            if (!isset(self::PARAMETER[$k])) { continue; }
            $w = (string) $w;
            if ($w === '' || !preg_match(self::PARAMETER[$k], $w)) { continue; }
            if ($k === 'limit') { $w = (string) min(500, max(1, (int) $w)); }
            $sauber[$k] = $w;
        }
        $url = self::host() . '/api/' . $weg;
        if (count($sauber)) { $url .= '?' . http_build_query($sauber, '', '&', PHP_QUERY_RFC3986); }

        $antwort = wp_remote_get($url, array(
            'timeout' => 25,
            'redirection' => 0,
            'headers' => array('x-api-token' => $token, 'Accept' => 'application/json'),
            'user-agent' => 'Aufmass-Werkzeug/' . AUFMASS_VERSION
        ));
        if (is_wp_error($antwort)) {
            return new WP_Error('nicht_erreichbar',
                'Pipedrive war vom Server aus nicht erreichbar: ' . $antwort->get_error_message(),
                array('status' => 502));
        }
        $status = (int) wp_remote_retrieve_response_code($antwort);
        $daten = json_decode((string) wp_remote_retrieve_body($antwort), true);
        /* Was auch immer Pipedrive sagt, der Schlüssel darf nicht darin
           stehen - zur Sicherheit wird er aus der Antwort getilgt. */
        $text = wp_json_encode($daten === null ? new stdClass() : $daten);
        if ($text !== false && strpos($text, $token) !== false) {
            $daten = json_decode(str_replace($token, '[entfernt]', $text), true);
        }
        return array('status' => $status, 'daten' => $daten);
    }
}
