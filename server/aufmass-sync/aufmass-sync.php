<?php
/**
 * Plugin Name:       Aufmaß-Abgleich
 * Plugin URI:        https://www.provision-infra.de/
 * Description:       Gemeinsame Ablage für das Aufmaß-Werkzeug: Projekte, Fotos und Zuständigkeiten werden zwischen allen Geräten abgeglichen. Anmeldung über das Google-Konto der Organisation.
 * Version:           1.1.2
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

define('AUFMASS_VERSION', '1.1.2');
define('AUFMASS_SCHEMA', 2);
define('AUFMASS_PFAD', plugin_dir_path(__FILE__));
define('AUFMASS_URL', plugin_dir_url(__FILE__));

require_once AUFMASS_PFAD . 'inc/datenbank.php';
require_once AUFMASS_PFAD . 'inc/drossel.php';
require_once AUFMASS_PFAD . 'inc/jwt.php';
require_once AUFMASS_PFAD . 'inc/anmeldung.php';
require_once AUFMASS_PFAD . 'inc/projekte.php';
require_once AUFMASS_PFAD . 'inc/fotos.php';
require_once AUFMASS_PFAD . 'inc/freigaben.php';
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
    /* Der Kurzlink /f/CODE braucht eine Umschreibregel - und WordPress
       muss sie einmal in seine Liste übernehmen. */
    aufmass_kurzlink_anmelden();
    flush_rewrite_rules(false);
    update_option('aufmass_rewrite_stand', AUFMASS_VERSION, false);
}

/* ---------------------------------------------------------------------
 * Kurzlink für die Kundenfreigabe: https://<domäne>/f/<code>
 *
 * WordPress leitet die Adresse auf die Freigabeseite des Werkzeugs um,
 * mit dem Code im Anker. Ohne sprechende Permalinks gibt es den Weg /f/
 * nicht; dann lautet der Link https://<domäne>/?aufmass_f=<code> - und
 * genau das liefert das Plugin dem Werkzeug dann auch als Kurzlink.
 * ------------------------------------------------------------------ */
function aufmass_kurzlink_anmelden() {
    add_rewrite_rule('^f/([A-Za-z0-9]{6,16})/?$', 'index.php?aufmass_f=$matches[1]', 'top');
}
add_action('init', function () {
    aufmass_kurzlink_anmelden();
    /* Nach einer Aktualisierung per ZIP läuft die Aktivierung nicht
       erneut - die Regel wird dann hier einmalig übernommen. */
    if ((string) get_option('aufmass_rewrite_stand', '') !== AUFMASS_VERSION) {
        flush_rewrite_rules(false);
        update_option('aufmass_rewrite_stand', AUFMASS_VERSION, false);
    }
});
add_filter('query_vars', function ($vars) {
    $vars[] = 'aufmass_f';
    return $vars;
});
/* Vor der kanonischen Umleitung von WordPress (Priorität 10): Sonst
   bekäme der Kunde erst einen Umweg über /f/CODE/ mit Schrägstrich. */
add_action('template_redirect', function () {
    $code = get_query_var('aufmass_f', '');
    if ($code === '' || $code === null) { return; }
    nocache_headers();
    header('X-Robots-Tag: noindex, nofollow');
    $ziel = Aufmass_Freigaben::umleitung_ziel($code);
    if ($ziel === '') {
        global $wp_query;
        $wp_query->set_404();
        status_header(404);
        return;
    }
    /* wp_safe_redirect lässt nur Ziele auf dieser Website zu. */
    wp_safe_redirect($ziel, 302);
    exit;
}, 1);

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
add_action('aufmass_aufraeumen', function () {
    Aufmass_Anmeldung::sitzungen_aufraeumen();
    Aufmass_Freigaben::aufraeumen();
    Aufmass_Projekte::papierkorb_leeren();
});
