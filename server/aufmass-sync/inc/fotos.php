<?php
/**
 * fotos.php — Fotos als eigene Dateien.
 *
 * Fotos sind der mit Abstand größte Teil eines Aufmaßes. Lägen sie mit in
 * den Projektdaten, müsste bei jeder kleinen Änderung an einer Tür das
 * gesamte Bildmaterial durch PHP und in die Datenbank geschoben werden -
 * bei gedeckeltem Speicher und gedeckelter Laufzeit auf einem geteilten
 * Webspace geht das schief.
 *
 * Darum: Die Projektdaten enthalten nur die Kennung des Fotos, die Bytes
 * liegen als Datei. Jedes Foto wird genau einmal übertragen.
 *
 * Die Dateien liegen in einem eigenen Ordner unterhalb von uploads, der
 * gegen direkten Zugriff gesperrt ist: Ein Foto zeigt eine fremde Tür und
 * manchmal den eingebauten Zylinder - das geht niemanden etwas an, der
 * zufällig die Adresse errät.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Fotos {

    const GROESSE_MAX = 12582912;   /* 12 MiB je Foto */
    const ERLAUBT = array('image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp');

    public static function ordner() {
        $auf = wp_upload_dir();
        return trailingslashit($auf['basedir']) . 'aufmass-fotos';
    }

    public static function ablage_vorbereiten() {
        $ordner = self::ordner();
        if (!file_exists($ordner)) { wp_mkdir_p($ordner); }

        /* Gegen direkten Zugriff sperren. Apache liest .htaccess; bei
           nginx greift das nicht, deshalb liegen die Dateien zusätzlich
           unter einem nicht erratbaren Namen (siehe dateiname()). */
        $ht = $ordner . '/.htaccess';
        if (!file_exists($ht)) {
            file_put_contents($ht, "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
        }
        $index = $ordner . '/index.html';
        if (!file_exists($index)) { file_put_contents($index, ''); }
    }

    /**
     * Der Dateiname enthält einen Zufallsteil. Damit ist eine Datei auch
     * dann nicht zu erraten, wenn der Webserver den Ordner doch ausliefert.
     */
    private static function dateiname($id, $endung) {
        return substr(preg_replace('/[^A-Za-z0-9_-]/', '', (string) $id), 0, 40)
            . '-' . bin2hex(random_bytes(8)) . '.' . $endung;
    }

    public static function speichern($id, $projekt_id, $tuer_id, $bytes, $mime, $benutzer) {
        global $wpdb;

        if (!isset(self::ERLAUBT[$mime])) {
            return new WP_Error('falsches_format',
                'Nur JPEG, PNG oder WebP. Empfangen: ' . $mime, array('status' => 415));
        }
        $laenge = strlen($bytes);
        if ($laenge === 0) {
            return new WP_Error('leer', 'Das Foto enthält keine Daten.', array('status' => 400));
        }
        if ($laenge > self::GROESSE_MAX) {
            return new WP_Error('zu_gross',
                'Das Foto ist zu groß (' . size_format($laenge) . ').', array('status' => 413));
        }
        /* Nicht dem angegebenen Typ glauben, sondern in die Datei sehen. */
        $erkannt = self::typ_erkennen($bytes);
        if ($erkannt !== $mime) {
            return new WP_Error('falscher_inhalt',
                'Der Inhalt passt nicht zum angegebenen Format.', array('status' => 415));
        }

        $tab = Aufmass_Datenbank::tabelle('fotos');
        $vorhanden = $wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE id = %s", $id), ARRAY_A);
        if ($vorhanden) {
            /* Ein Foto ändert sich nicht. Zweiter Versuch = schon da. */
            return self::beschreiben($vorhanden);
        }

        self::ablage_vorbereiten();
        $datei = self::dateiname($id, self::ERLAUBT[$mime]);
        $ziel = self::ordner() . '/' . $datei;
        if (file_put_contents($ziel, $bytes) === false) {
            return new WP_Error('nicht_gespeichert',
                'Das Foto ließ sich nicht ablegen. Bitte den Speicherplatz prüfen.',
                array('status' => 500));
        }

        $eingetragen = $wpdb->insert($tab, array(
            'id' => $id,
            'projekt_id' => $projekt_id,
            'tuer_id' => (string) $tuer_id,
            'datei' => $datei,
            'mime' => $mime,
            'groesse' => $laenge,
            'erstellt_am' => Aufmass_Datenbank::jetzt(),
            'hochgeladen_von' => $benutzer['id']
        ));
        if ($eingetragen === false) {
            /* Zwei Geräte haben dasselbe Foto gleichzeitig hochgeladen: Die
               Zeile des anderen gilt, die eigene Datei wäre eine Waise. */
            @unlink($ziel);
            $andere = $wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE id = %s", $id), ARRAY_A);
            if ($andere) { return self::beschreiben($andere); }
            return new WP_Error('nicht_gespeichert',
                'Das Foto ließ sich nicht eintragen. Bitte erneut versuchen.',
                array('status' => 500));
        }
        return self::beschreiben($wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE id = %s", $id), ARRAY_A));
    }

    public static function holen($id) {
        global $wpdb;
        $tab = Aufmass_Datenbank::tabelle('fotos');
        $z = $wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE id = %s", $id), ARRAY_A);
        if (!$z) { return null; }
        $pfad = self::ordner() . '/' . $z['datei'];
        if (!file_exists($pfad)) { return null; }
        return array('mime' => $z['mime'], 'pfad' => $pfad, 'groesse' => (int) $z['groesse']);
    }

    /** Welche Fotos eines Aufmaßes liegen hier schon? */
    public static function vorhandene($projekt_id) {
        global $wpdb;
        $tab = Aufmass_Datenbank::tabelle('fotos');
        return $wpdb->get_col($wpdb->prepare("SELECT id FROM $tab WHERE projekt_id = %s", $projekt_id)) ?: array();
    }

    public static function loeschen($id) {
        global $wpdb;
        $tab = Aufmass_Datenbank::tabelle('fotos');
        $z = $wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE id = %s", $id), ARRAY_A);
        if (!$z) { return false; }
        $pfad = self::ordner() . '/' . $z['datei'];
        if (file_exists($pfad)) { @unlink($pfad); }
        $wpdb->delete($tab, array('id' => $id));
        return true;
    }

    /**
     * Fotos wegräumen, die in keinem Aufmaß mehr vorkommen. Wird nach dem
     * Speichern eines Aufmaßes aufgerufen - nur für dieses Aufmaß.
     */
    public static function verwaiste_aufraeumen($projekt_id, $daten) {
        $gebraucht = array();
        foreach ((isset($daten['tueren']) && is_array($daten['tueren']) ? $daten['tueren'] : array()) as $tuer) {
            foreach ((isset($tuer['fotos']) && is_array($tuer['fotos']) ? $tuer['fotos'] : array()) as $foto) {
                if (!empty($foto['id'])) { $gebraucht[$foto['id']] = true; }
            }
        }
        $weg = 0;
        foreach (self::vorhandene($projekt_id) as $id) {
            if (!isset($gebraucht[$id])) { self::loeschen($id); $weg++; }
        }
        return $weg;
    }

    private static function beschreiben($z) {
        return array('id' => $z['id'], 'groesse' => (int) $z['groesse'], 'mime' => $z['mime'],
            'vorhanden' => true);
    }

    /** Format am Dateianfang erkennen, nicht am behaupteten Typ. */
    public static function typ_erkennen($bytes) {
        if (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) { return 'image/jpeg'; }
        if (strncmp($bytes, "\x89PNG\r\n\x1a\n", 8) === 0) { return 'image/png'; }
        if (strncmp($bytes, 'RIFF', 4) === 0 && substr($bytes, 8, 4) === 'WEBP') { return 'image/webp'; }
        return '';
    }
}
