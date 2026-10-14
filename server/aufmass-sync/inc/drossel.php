<?php
/**
 * drossel.php — Zähler je Herkunft gegen Raten und Hämmern.
 *
 * Gezählt wird in WordPress-Transients mit Ablauf; gespeichert wird nur ein
 * Abdruck der Herkunftsadresse (gekürzter SHA-256), nie die Adresse selbst,
 * und der Abdruck verfällt mit dem Zeitfenster. Bei IPv6 zählt das
 * /64-Netz: Ein Anschluss bekommt dort ganze Blöcke, und wer die Drossel
 * umgehen will, würde sonst einfach die hinteren Stellen durchzählen.
 *
 * Herkunft hinter einem Proxy: Sieht PHP in REMOTE_ADDR eine interne
 * Adresse (10.x, 172.16-31.x, 192.168.x, 100.64-127.x, 127.x, fc00::/7,
 * ::1), kam der Aufruf über einen vorgeschalteten Proxy oder Lastverteiler
 * des Hosters. Dann sähen alle Besucher gleich aus, und 30 Fehlversuche
 * eines Einzelnen sperrten alle. In dem Fall zählt die Adresse, die der
 * Proxy im Kopffeld X-Forwarded-For (hinterster öffentlicher Eintrag) oder
 * X-Real-IP weiterreicht. Kommt der Aufruf direkt von einer öffentlichen
 * Adresse, bleiben die Kopffelder unbeachtet - ein Besucher kann sie frei
 * erfinden. Steht der Proxy des Hosters selbst auf einer öffentlichen
 * Adresse (CDN), schaltet der Haken „hinter Proxy“ in den Einstellungen
 * das Lesen ein; die Einstellungsseite zeigt, was der Server gerade sieht.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Drossel {

    /** Option: Kopffelder des Proxys auch bei öffentlicher REMOTE_ADDR lesen. */
    const OPTION_PROXY = 'aufmass_hinter_proxy';

    /** Die Herkunft für die Drosselung als Merkmal: „v4:<Adresse>“,
     *  „v6:<erste 8 Byte>“ oder „unbekannt“. */
    public static function herkunft() {
        $h = self::herkunft_erklaert();
        return $h['adresse'] === '' ? 'unbekannt' : self::merkmal($h['adresse']);
    }

    /** Wie die Herkunft zustande kommt - für die Anzeige in den
     *  Einstellungen. adresse: die gezählte Adresse; direkt: REMOTE_ADDR in
     *  Reinform; quelle: 'direkt' oder 'kopffeld'; intern: ob REMOTE_ADDR
     *  eine interne Adresse ist; schalter: der Haken „hinter Proxy“;
     *  kopffelder: die gesehenen Kopffelder, gekürzt und nur zur Anzeige. */
    public static function herkunft_erklaert() {
        $direkt = self::adresse(isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
        $intern = $direkt !== '' && self::intern($direkt);
        $schalter = self::hinter_proxy();
        $kopffelder = array();
        foreach (array('X-Forwarded-For' => 'HTTP_X_FORWARDED_FOR', 'X-Real-IP' => 'HTTP_X_REAL_IP') as $name => $feld) {
            if (isset($_SERVER[$feld]) && trim((string) $_SERVER[$feld]) !== '') {
                $kopffelder[$name] = substr(trim(preg_replace('/[^\x20-\x7E]/', '', (string) $_SERVER[$feld])), 0, 200);
            }
        }
        $adresse = $direkt;
        $quelle = 'direkt';
        if ($direkt !== '' && ($intern || $schalter)) {
            $weiter = self::aus_kopffeldern();
            if ($weiter !== '') { $adresse = $weiter; $quelle = 'kopffeld'; }
        }
        return array('adresse' => $adresse, 'direkt' => $direkt, 'quelle' => $quelle,
            'intern' => $intern, 'schalter' => $schalter, 'kopffelder' => $kopffelder);
    }

    public static function hinter_proxy() {
        return function_exists('get_option') && (string) get_option(self::OPTION_PROXY, '0') === '1';
    }

    /** Die Besucheradresse aus den Kopffeldern eines vertrauten Proxys;
     *  '' wenn dort nichts Brauchbares steht. */
    private static function aus_kopffeldern() {
        if (isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $eintraege = array();
            foreach (explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR']) as $e) {
                $a = self::adresse($e);
                if ($a !== '') { $eintraege[] = $a; }
            }
            /* Ein ordentlicher Proxy hängt die Adresse, von der er den
               Aufruf bekam, hinten an. Was davor steht, kann der Besucher
               erfunden haben - darum zählt der hinterste öffentliche
               Eintrag; interne Zwischenstationen dahinter sind unsere. */
            for ($i = count($eintraege) - 1; $i >= 0; $i--) {
                if (!self::intern($eintraege[$i])) { return $eintraege[$i]; }
            }
            /* Nur interne Einträge: ein Besucher aus dem eigenen Netz. */
            if ($eintraege) { return $eintraege[0]; }
        }
        if (isset($_SERVER['HTTP_X_REAL_IP'])) {
            return self::adresse($_SERVER['HTTP_X_REAL_IP']);
        }
        return '';
    }

    /** Eine Adresse in Reinform: ohne Leerraum, Klammern und Port; eine
     *  IPv4-mapped IPv6-Adresse („::ffff:a.b.c.d“, ein IPv4-Besucher hinter
     *  einem Dual-Stack-Listener) als die IPv4-Adresse, die sie ist. Sonst
     *  landeten dort alle Besucher in einem Zähler, weil die ersten acht
     *  Byte für jede solche Adresse null sind. Unbrauchbares wird zu ''. */
    public static function adresse($text) {
        $t = trim((string) $text);
        if ($t === '' || strlen($t) > 64) { return ''; }
        if (preg_match('/^\[([0-9a-fA-F:.]+)\](?::[0-9]{1,5})?$/', $t, $m)) { $t = $m[1]; }
        elseif (preg_match('/^([0-9]{1,3}(?:\.[0-9]{1,3}){3}):[0-9]{1,5}$/', $t, $m)) { $t = $m[1]; }
        if (filter_var($t, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) { return $t; }
        if (filter_var($t, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) === false) { return ''; }
        $roh = @inet_pton($t);
        if ($roh === false || strlen($roh) !== 16) { return ''; }
        if (substr($roh, 0, 12) === "\0\0\0\0\0\0\0\0\0\0\xff\xff") { return inet_ntop(substr($roh, 12)); }
        return inet_ntop($roh);
    }

    /** Interne Adresse: privat, Loopback, Link-Local, Shared Address Space
     *  (100.64/10). So etwas erreicht einen Webserver nur aus dem eigenen
     *  Netz des Hosters, nie direkt aus dem Internet. */
    public static function intern($adresse) {
        if ($adresse === '') { return false; }
        if (filter_var($adresse, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) { return true; }
        return preg_match('/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./', $adresse) === 1;
    }

    private static function merkmal($adresse) {
        if (strpos($adresse, ':') === false) { return 'v4:' . $adresse; }
        $roh = @inet_pton($adresse);
        if ($roh === false || strlen($roh) !== 16) { return 'unbekannt'; }
        return 'v6:' . bin2hex(substr($roh, 0, 8));
    }

    private static function schluessel($art) {
        return 'aufmass_fr_' . $art . '_' . substr(hash('sha256', self::herkunft()), 0, 20);
    }

    /** Zählt einen Versuch; false, wenn die Grenze schon erreicht war. */
    public static function zaehlen($art, $max, $fenster) {
        $schluessel = self::schluessel($art);
        $n = (int) get_transient($schluessel);
        if ($n >= $max) { return false; }
        set_transient($schluessel, $n + 1, $fenster);
        return true;
    }

    /** Nur nachsehen, ohne zu zählen. */
    public static function voll($art, $max) {
        return (int) get_transient(self::schluessel($art)) >= $max;
    }

    /** Zähler zu einem beliebigen Merkmal (z. B. einem Freigabe-Code). */
    public static function zaehlen_fuer($merkmal, $max, $fenster) {
        $schluessel = 'aufmass_fc_' . substr(hash('sha256', (string) $merkmal), 0, 20);
        $n = (int) get_transient($schluessel);
        if ($n >= $max) { return false; }
        set_transient($schluessel, $n + 1, $fenster);
        return true;
    }

    public static function zu_viele() {
        return new WP_Error('zu_viele', 'Zu viele Versuche. Bitte in einigen Minuten erneut versuchen.', array('status' => 429));
    }
}
