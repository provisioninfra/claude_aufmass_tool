<?php
/**
 * drossel.php — Zähler je Herkunft gegen Raten und Hämmern.
 *
 * Gezählt wird in WordPress-Transients mit Ablauf; gespeichert wird nur ein
 * Abdruck der Herkunftsadresse (gekürzter SHA-256), nie die Adresse selbst,
 * und der Abdruck verfällt mit dem Zeitfenster. Bei IPv6 zählt das
 * /64-Netz: Ein Anschluss bekommt dort ganze Blöcke, und wer die Drossel
 * umgehen will, würde sonst einfach die hinteren Stellen durchzählen.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Drossel {

    /** Die Herkunft für die Drosselung - REMOTE_ADDR lässt sich, anders
     *  als ein X-Forwarded-For-Kopffeld, nicht vom Aufrufer vorgeben. */
    public static function herkunft() {
        $ip = isset($_SERVER['REMOTE_ADDR']) ? trim((string) $_SERVER['REMOTE_ADDR']) : '';
        if ($ip === '') { return 'unbekannt'; }
        if (strpos($ip, ':') !== false) {
            $roh = @inet_pton($ip);
            if ($roh !== false && strlen($roh) === 16) {
                /* „::ffff:a.b.c.d“: ein IPv4-Besucher hinter einem
                   Dual-Stack-Listener. Die ersten acht Byte sind dann für
                   JEDE Adresse null - alle Besucher landeten in einem
                   Zähler, und 30 Fehlversuche eines Einzelnen sperrten
                   alle. Deshalb als die IPv4-Adresse zählen, die es ist. */
                if (substr($roh, 0, 12) === "\0\0\0\0\0\0\0\0\0\0\xff\xff") {
                    return 'v4:' . inet_ntop(substr($roh, 12));
                }
                return 'v6:' . bin2hex(substr($roh, 0, 8));
            }
        }
        return 'v4:' . $ip;
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
