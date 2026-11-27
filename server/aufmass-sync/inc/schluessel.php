<?php
/**
 * schluessel.php — Zugangsschlüssel für Programme (API).
 *
 * Ein Zugangsschlüssel ist ein Ausweis für Werkzeuge ohne Browser - etwa
 * Claude Code, ein Skript oder eine Auswertung. Er gehört einer Person und
 * hat deren Rechte an den Aufmaßen (wer ein Aufmaß nicht ändern darf, darf
 * es auch über seinen Schlüssel nicht). Zusätzlich trägt er eine eigene
 * Grenze: „lesen“ oder „schreiben“. Er läuft ab und lässt sich jederzeit
 * widerrufen. In der Datenbank steht nur ein Abdruck; der Schlüssel selbst
 * wird genau einmal angezeigt, beim Erzeugen.
 *
 * Form: aufm_<Kennung, 16 Hex>_<Geheimnis, 48 Zeichen>. Die Kennung erlaubt
 * das Nachschlagen ohne Suche, das Geheimnis wird über den Abdruck
 * (SHA-256) zeitunabhängig verglichen.
 *
 * Schlüssel werden nur in einer angemeldeten Browsersitzung erzeugt und
 * widerrufen - ein abhandengekommener Schlüssel kann sich damit nicht
 * selbst vermehren. Übergeben wird er als „Authorization: Bearer …“ oder,
 * wo ein Server diese Kopfzeile verschluckt, als „X-Aufmass-Schluessel“.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Schluessel {

    const KOPFFELD = 'X-Aufmass-Schluessel';
    const JE_PERSON_MAX = 20;
    const TAGE_VORGABE = 365;
    const TAGE_MAX = 730;
    const NAME_MAX = 120;
    /** Fehlversuche je Herkunft in zehn Minuten, dann 429. */
    const DROSSEL_FEHLVERSUCHE = 30;
    const RECHTE = array('lesen', 'schreiben');

    private static function tabelle() { return Aufmass_Datenbank::tabelle('schluessel'); }

    /* ---------------------------------------------------------------- */
    /* Erzeugen, auflisten, widerrufen                                  */
    /* ---------------------------------------------------------------- */
    public static function erzeugen($benutzer, $name, $rechte, $tage) {
        global $wpdb;
        if (!$benutzer || empty($benutzer['id'])) {
            return new WP_Error('nicht_angemeldet', 'Nicht angemeldet.', array('status' => 401));
        }
        if (!is_scalar($name)) { $name = ''; }        /* ein Feld, kein Gebilde */
        $name = trim(preg_replace('/\s+/', ' ', preg_replace('/[\x00-\x1F\x7F]/', '', (string) $name)));
        if ($name === '') { $name = 'Zugangsschlüssel'; }
        $name = function_exists('mb_substr') ? mb_substr($name, 0, self::NAME_MAX) : substr($name, 0, self::NAME_MAX);
        $rechte = (is_scalar($rechte) && in_array((string) $rechte, self::RECHTE, true)) ? (string) $rechte : 'lesen';
        $tage = is_scalar($tage) ? (int) $tage : 0;
        if ($tage <= 0) { $tage = self::TAGE_VORGABE; }
        if ($tage > self::TAGE_MAX) { $tage = self::TAGE_MAX; }

        $tab = self::tabelle();
        $anzahl = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM $tab WHERE benutzer_id = %s AND aktiv = 1", $benutzer['id']));
        if ($anzahl >= self::JE_PERSON_MAX) {
            return new WP_Error('zu_viele_schluessel',
                'Es sind schon ' . self::JE_PERSON_MAX . ' Schlüssel aktiv. Bitte zuerst einen widerrufen.',
                array('status' => 400));
        }

        $id = bin2hex(random_bytes(8));
        $geheim = rtrim(strtr(base64_encode(random_bytes(36)), '+/', '-_'), '=');
        $jetzt = Aufmass_Datenbank::jetzt();
        $ok = $wpdb->insert($tab, array(
            'id' => $id,
            'benutzer_id' => $benutzer['id'],
            'name' => $name,
            'pruefwert' => hash('sha256', $geheim),
            'rechte' => $rechte,
            'aktiv' => 1,
            'erstellt_am' => $jetzt,
            'gueltig_bis' => gmdate('Y-m-d H:i:s', time() + $tage * 86400) . '.000000',
            'zuletzt_am' => null
        ));
        if ($ok === false) {
            return new WP_Error('datenbank', 'Der Schlüssel ließ sich nicht ablegen.', array('status' => 500));
        }
        $zeile = $wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE id = %s", $id), ARRAY_A);
        return array('schluessel' => 'aufm_' . $id . '_' . $geheim, 'eintrag' => self::beschreiben($zeile));
    }

    /** Die eigenen Schlüssel - ohne Geheimnis, das gibt es nicht mehr. */
    public static function liste($benutzer_id) {
        global $wpdb;
        $tab = self::tabelle();
        $zeilen = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $tab WHERE benutzer_id = %s AND aktiv = 1 ORDER BY erstellt_am DESC", (string) $benutzer_id), ARRAY_A);
        $aus = array();
        foreach (($zeilen ?: array()) as $z) { $aus[] = self::beschreiben($z); }
        return $aus;
    }

    /** Einen Schlüssel widerrufen: den eigenen, oder als Verwaltung jeden. */
    public static function widerrufen($id, $benutzer) {
        global $wpdb;
        $id = preg_replace('/[^0-9a-f]/', '', strtolower((string) $id));
        $tab = self::tabelle();
        $z = $id !== '' ? $wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE id = %s", $id), ARRAY_A) : null;
        if (!$z || (int) $z['aktiv'] !== 1) {
            return new WP_Error('unbekannt', 'Diesen Schlüssel gibt es nicht (mehr).', array('status' => 404));
        }
        if (!$benutzer || ($z['benutzer_id'] !== $benutzer['id'] && $benutzer['rolle'] !== 'verwaltung')) {
            return new WP_Error('fremd', 'Dieser Schlüssel gehört jemand anderem.', array('status' => 403));
        }
        $wpdb->update($tab, array('aktiv' => 0), array('id' => $id));
        return array('ok' => true, 'id' => $id);
    }

    /** Alle Schlüssel einer Person widerrufen (Sperre, Löschung). */
    public static function alle_widerrufen($benutzer_id) {
        global $wpdb;
        return (int) $wpdb->update(self::tabelle(), array('aktiv' => 0), array('benutzer_id' => (string) $benutzer_id, 'aktiv' => 1));
    }

    /** Wie viele Schlüssel einer Person gerade gelten. */
    public static function anzahl($benutzer_id) {
        global $wpdb;
        $tab = self::tabelle();
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM $tab WHERE benutzer_id = %s AND aktiv = 1 AND (gueltig_bis IS NULL OR gueltig_bis > %s)",
            (string) $benutzer_id, gmdate('Y-m-d H:i:s.000000')));
    }

    /** Täglich: widerrufene und lange abgelaufene Einträge entfernen. */
    public static function aufraeumen() {
        global $wpdb;
        $tab = self::tabelle();
        $grenze = gmdate('Y-m-d H:i:s', time() - 30 * 86400) . '.000000';
        $wpdb->query($wpdb->prepare(
            "DELETE FROM $tab WHERE aktiv = 0 OR (gueltig_bis IS NOT NULL AND gueltig_bis < %s)", $grenze));
    }

    /* ---------------------------------------------------------------- */
    /* Prüfen                                                            */
    /* ---------------------------------------------------------------- */

    /** Der Schlüssel aus der Anfrage, oder '' wenn keiner mitkam. */
    public static function aus_anfrage() {
        $kopf = '';
        foreach (array('HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION') as $feld) {
            if (!empty($_SERVER[$feld])) { $kopf = (string) $_SERVER[$feld]; break; }
        }
        if ($kopf === '' && function_exists('getallheaders')) {
            foreach ((array) getallheaders() as $n => $w) {
                if (strtolower((string) $n) === 'authorization') { $kopf = (string) $w; break; }
            }
        }
        if ($kopf !== '' && preg_match('/^\s*Bearer\s+(aufm_[A-Za-z0-9_-]+)\s*$/i', $kopf, $m)) { return $m[1]; }
        if (!empty($_SERVER['HTTP_X_AUFMASS_SCHLUESSEL'])) {
            $w = trim((string) $_SERVER['HTTP_X_AUFMASS_SCHLUESSEL']);
            if (preg_match('/^aufm_[A-Za-z0-9_-]+$/', $w)) { return $w; }
        }
        return '';
    }

    /**
     * Einen Schlüssel prüfen. Liefert array('benutzer' => …, 'schluessel' => Zeile)
     * oder einen WP_Error (401 ungültig/abgelaufen, 429 gedrosselt).
     */
    public static function pruefen($token) {
        global $wpdb;
        if (Aufmass_Drossel::voll('schluessel', self::DROSSEL_FEHLVERSUCHE)) { return Aufmass_Drossel::zu_viele(); }
        $ungueltig = function () {
            Aufmass_Drossel::zaehlen('schluessel', self::DROSSEL_FEHLVERSUCHE, 600);
            return new WP_Error('schluessel_ungueltig', 'Dieser Zugangsschlüssel gilt nicht.', array('status' => 401));
        };
        if (!preg_match('/^aufm_([0-9a-f]{16})_([A-Za-z0-9_-]{40,64})$/', (string) $token, $m)) { return $ungueltig(); }
        $tab = self::tabelle();
        $z = $wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE id = %s", $m[1]), ARRAY_A);
        if (!$z || !hash_equals((string) $z['pruefwert'], hash('sha256', $m[2]))) { return $ungueltig(); }
        if ((int) $z['aktiv'] !== 1) {
            Aufmass_Drossel::zaehlen('schluessel', self::DROSSEL_FEHLVERSUCHE, 600);
            return new WP_Error('schluessel_widerrufen', 'Dieser Zugangsschlüssel wurde widerrufen.', array('status' => 401));
        }
        if ($z['gueltig_bis'] && strtotime($z['gueltig_bis'] . ' UTC') < time()) {
            return new WP_Error('schluessel_abgelaufen', 'Dieser Zugangsschlüssel ist abgelaufen. Bitte im Werkzeug einen neuen erzeugen.', array('status' => 401));
        }
        $bt = Aufmass_Datenbank::tabelle('benutzer');
        $b = $wpdb->get_row($wpdb->prepare("SELECT * FROM $bt WHERE id = %s", $z['benutzer_id']), ARRAY_A);
        if (!$b || (int) $b['aktiv'] !== 1) {
            return new WP_Error('gesperrt', 'Der Zugang, zu dem dieser Schlüssel gehört, ist gesperrt.', array('status' => 401));
        }
        /* Zuletzt benutzt: höchstens einmal je Stunde schreiben. */
        if (!$z['zuletzt_am'] || strtotime($z['zuletzt_am'] . ' UTC') < time() - 3600) {
            $wpdb->update($tab, array('zuletzt_am' => Aufmass_Datenbank::jetzt()), array('id' => $z['id']));
        }
        return array(
            'benutzer' => array('id' => $b['id'], 'email' => $b['email'], 'name' => $b['name'], 'rolle' => $b['rolle']),
            'schluessel' => $z
        );
    }

    /* ---------------------------------------------------------------- */
    /* Hilfsmittel                                                       */
    /* ---------------------------------------------------------------- */
    public static function beschreiben($z) {
        return array(
            'id' => $z['id'],
            'name' => (string) $z['name'],
            'rechte' => (string) $z['rechte'],
            'erstelltAm' => self::iso($z['erstellt_am']),
            'gueltigBis' => self::iso($z['gueltig_bis']),
            'zuletztAm' => self::iso($z['zuletzt_am']),
            'abgelaufen' => !empty($z['gueltig_bis']) && strtotime($z['gueltig_bis'] . ' UTC') < time()
        );
    }

    private static function iso($zeit) {
        if (!$zeit) { return ''; }
        return str_replace(' ', 'T', substr((string) $zeit, 0, 19)) . 'Z';
    }
}
