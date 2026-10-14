<?php
/**
 * uninstall.php — Wird nur beim endgültigen Löschen des Plugins ausgeführt.
 *
 * Deaktivieren löscht nichts. Erst wer das Plugin über WordPress wirklich
 * entfernt, räumt damit auch die Aufmaße ab. Das ist eine bewusste
 * Entscheidung: Hier liegen die Arbeitsergebnisse mehrerer Monate.
 */
if (!defined('WP_UNINSTALL_PLUGIN')) { exit; }

/* Sicherheitsnetz: Ohne ausdrückliche Freigabe bleiben die Daten stehen.
   Wer wirklich alles löschen will, setzt in der wp-config.php:
       define('AUFMASS_DATEN_LOESCHEN', true);
   Ohne diese Zeile verschwindet nur die Einrichtung, nicht die Arbeit. */
global $wpdb;

delete_option('aufmass_client_id');
delete_option('aufmass_domaene');
delete_option('aufmass_neue_freigeben');
delete_option('aufmass_hinter_proxy');
delete_option('aufmass_openai_schluessel');
delete_option('aufmass_openai_host');
delete_option('aufmass_diktat_modell_erkennung');
delete_option('aufmass_diktat_modell_zuordnung');
delete_option('aufmass_schema');
delete_option('aufmass_google_schluessel_sicherung');
delete_option('aufmass_freigabe_tage');
delete_option('aufmass_freigabe_mail');
delete_option('aufmass_freigabe_seite');
delete_option('aufmass_rewrite_stand');
delete_option('aufmass_pipedrive_token');
delete_option('aufmass_pipedrive_host');
delete_transient('aufmass_google_schluessel');

if (defined('AUFMASS_DATEN_LOESCHEN') && AUFMASS_DATEN_LOESCHEN === true) {
    foreach (array('sitzungen', 'zustaendig', 'fotos', 'freigaben', 'projekte', 'benutzer') as $t) {
        $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'aufmass_' . $t);
    }
    delete_option('aufmass_geheimnis');
    /* Auch die Bilddateien */
    $auf = wp_upload_dir();
    $ordner = trailingslashit($auf['basedir']) . 'aufmass-fotos';
    if (is_dir($ordner)) {
        foreach (glob($ordner . '/*') as $datei) { if (is_file($datei)) { @unlink($datei); } }
        /* glob() übergeht Punktdateien - die Schutzdatei einzeln entfernen */
        @unlink($ordner . '/.htaccess');
        @rmdir($ordner);
    }
}
