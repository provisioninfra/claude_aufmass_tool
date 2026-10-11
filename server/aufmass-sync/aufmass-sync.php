<?php
/**
 * Plugin Name:       Aufmaß-Abgleich
 * Plugin URI:        https://www.provision-infra.de/
 * Description:       Gemeinsame Ablage für das Aufmaß-Werkzeug: Projekte, Fotos und Zuständigkeiten werden zwischen allen Geräten abgeglichen. Anmeldung über das Google-Konto der Organisation.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Provision Infra GmbH
 * Text Domain:       aufmass-sync
 *
 * Das Werkzeug selbst bleibt eine reine Browseranwendung. Dieses Plugin
 * fügt nur die gemeinsame Ablage hinzu: Es nimmt Projekte entgegen, gibt
 * sie wieder heraus und merkt sich, wer wofür zuständig ist. Die Geräte
 * arbeiten weiterhin eigenständig und auch ohne Netz.
 */

if (!defined('ABSPATH')) { exit; }

define('AUFMASS_VERSION', '1.0.0');
define('AUFMASS_SCHEMA', 1);
define('AUFMASS_PFAD', plugin_dir_path(__FILE__));
define('AUFMASS_URL', plugin_dir_url(__FILE__));

require_once AUFMASS_PFAD . 'inc/datenbank.php';
require_once AUFMASS_PFAD . 'inc/jwt.php';
require_once AUFMASS_PFAD . 'inc/anmeldung.php';
require_once AUFMASS_PFAD . 'inc/projekte.php';
require_once AUFMASS_PFAD . 'inc/fotos.php';
require_once AUFMASS_PFAD . 'inc/verschluesselung.php';
require_once AUFMASS_PFAD . 'inc/pipedrive.php';
require_once AUFMASS_PFAD . 'inc/rest.php';
require_once AUFMASS_PFAD . 'inc/einstellungen.php';

register_activation_hook(__FILE__, 'aufmass_aktivieren');
register_deactivation_hook(__FILE__, 'aufmass_deaktivieren');

function aufmass_aktivieren() {
    Aufmass_Datenbank::tabellen_anlegen();
    Aufmass_Fotos::ablage_vorbereiten();
    /* Ein eigenes Geheimnis je Installation: Damit werden die Sitzungs-
       kennungen unterschrieben. Es verlässt den Server nie. */
    if (!get_option('aufmass_geheimnis')) {
        add_option('aufmass_geheimnis', bin2hex(random_bytes(32)), '', false);
    }
    update_option('aufmass_schema', AUFMASS_SCHEMA, false);
}

function aufmass_deaktivieren() {
    /* Daten bleiben erhalten - Deaktivieren ist kein Löschen. Das Ent-
       fernen der Tabellen geschieht nur über uninstall.php. */
    wp_clear_scheduled_hook('aufmass_aufraeumen');
}

/* Schema nachziehen, falls das Plugin ohne erneute Aktivierung
   aktualisiert wurde. */
add_action('plugins_loaded', function () {
    if ((int) get_option('aufmass_schema', 0) < AUFMASS_SCHEMA) {
        Aufmass_Datenbank::tabellen_anlegen();
        update_option('aufmass_schema', AUFMASS_SCHEMA, false);
    }
});

/* Abgelaufene Sitzungen einmal täglich wegräumen. */
add_action('init', function () {
    if (!wp_next_scheduled('aufmass_aufraeumen')) {
        wp_schedule_event(time() + 3600, 'daily', 'aufmass_aufraeumen');
    }
});
add_action('aufmass_aufraeumen', function () { Aufmass_Anmeldung::sitzungen_aufraeumen(); });
