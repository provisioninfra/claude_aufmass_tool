<?php
/**
 * einstellungen.php — Einrichtungsseite im WordPress-Verwaltungsbereich.
 *
 * Hier werden die beiden Angaben eingetragen, die der Abgleich braucht:
 * die Google-Client-ID und die Organisationsdomäne. Beides ist nicht
 * geheim - die Client-ID steht ohnehin im Browser. Ein Client-Geheimnis
 * wird für dieses Verfahren nicht benötigt und darf hier gar nicht erst
 * hinterlegt werden.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Einstellungen {

    public static function menue() {
        add_options_page('Aufmaß-Abgleich', 'Aufmaß-Abgleich', 'manage_options',
            'aufmass-sync', array(__CLASS__, 'seite'));
    }

    public static function registrieren() {
        register_setting('aufmass_sync', 'aufmass_client_id', array(
            'type' => 'string', 'sanitize_callback' => array(__CLASS__, 'client_pruefen'), 'default' => ''
        ));
        register_setting('aufmass_sync', 'aufmass_domaene', array(
            'type' => 'string', 'sanitize_callback' => array(__CLASS__, 'domaene_pruefen'), 'default' => ''
        ));
        /* Der Pipedrive-Schlüssel wird verschlüsselt abgelegt. Das Formular
           zeigt ihn nie an; ein leeres Feld heißt "unverändert lassen". */
        register_setting('aufmass_sync', 'aufmass_pipedrive_token', array(
            'type' => 'string', 'sanitize_callback' => array(__CLASS__, 'pipedrive_token_pruefen'), 'default' => ''
        ));
        register_setting('aufmass_sync', 'aufmass_pipedrive_host', array(
            'type' => 'string', 'sanitize_callback' => array(__CLASS__, 'pipedrive_host_pruefen'), 'default' => ''
        ));
        /* Kundenfreigabe: Gültigkeit der Links und Benachrichtigung */
        register_setting('aufmass_sync', 'aufmass_freigabe_tage', array(
            'type' => 'integer', 'sanitize_callback' => array(__CLASS__, 'tage_pruefen'), 'default' => 30
        ));
        register_setting('aufmass_sync', 'aufmass_freigabe_mail', array(
            'type' => 'string', 'sanitize_callback' => array(__CLASS__, 'schalter_pruefen'), 'default' => '1'
        ));
    }

    public static function tage_pruefen($wert) {
        $wert = trim((string) $wert);
        if ($wert === '' || !preg_match('/^[0-9]{1,4}$/', $wert)) {
            add_settings_error('aufmass_sync', 'freigabe_tage',
                'Die Gültigkeit muss eine Zahl von Tagen sein (0 = unbegrenzt).');
            return (int) get_option('aufmass_freigabe_tage', 30);
        }
        $t = (int) $wert;
        return $t > 3650 ? 3650 : $t;
    }

    public static function schalter_pruefen($wert) {
        return ((string) $wert === '1') ? '1' : '0';
    }

    public static function pipedrive_token_pruefen($wert) {
        /* Ausdrücklich entfernen */
        /* Die Seite selbst ist durch manage_options und den Nonce von
           options.php geschützt - das genügt hier. */
        if (!empty($_POST['aufmass_pipedrive_entfernen'])) { return ''; }
        $wert = trim((string) $wert);
        if ($wert === '') { return (string) get_option('aufmass_pipedrive_token', ''); }   /* unverändert */
        /* Beim ERSTEN Speichern ruft WordPress die Prüfung zweimal auf:
           update_option() prüft, findet keine Option vor und reicht an
           add_option() weiter - das prüft erneut, diesmal mit der bereits
           verschlüsselten Fassung. Die darf nicht als „kein Token“
           abgewiesen werden, sonst ließe sich der Schlüssel nie erstmals
           hinterlegen. */
        if (Aufmass_Verschluesselung::ist_chiffre($wert)) { return $wert; }
        if (!preg_match('/^[A-Za-z0-9]{20,128}$/', $wert)) {
            add_settings_error('aufmass_sync', 'pipedrive',
                'Der Pipedrive-Schlüssel sieht nicht wie ein API-Token aus (nur Buchstaben und Ziffern, 20-128 Zeichen).');
            return (string) get_option('aufmass_pipedrive_token', '');
        }
        $chiffre = Aufmass_Verschluesselung::verschluesseln($wert);
        if ($chiffre === null) {
            add_settings_error('aufmass_sync', 'pipedrive',
                'Der Schlüssel konnte nicht verschlüsselt abgelegt werden (weder sodium noch openssl verfügbar).');
            return (string) get_option('aufmass_pipedrive_token', '');
        }
        return $chiffre;
    }

    public static function pipedrive_host_pruefen($wert) {
        $wert = trim((string) $wert);
        if ($wert === '') { return ''; }
        $wert = preg_replace('#^https?://#i', '', $wert);
        $wert = preg_replace('#/.*$#', '', $wert);
        if (!preg_match('/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i', $wert)) {
            add_settings_error('aufmass_sync', 'pipedrive_host', 'Das ist keine gültige Pipedrive-Adresse.');
            return (string) get_option('aufmass_pipedrive_host', '');
        }
        return strtolower($wert);
    }

    public static function client_pruefen($wert) {
        $wert = trim((string) $wert);
        if ($wert === '') { return ''; }
        if (!preg_match('/^[0-9]+-[A-Za-z0-9_]+\.apps\.googleusercontent\.com$/', $wert)) {
            add_settings_error('aufmass_sync', 'client',
                'Die Client-ID sieht nicht wie eine Google-Client-ID aus. Sie endet auf .apps.googleusercontent.com.');
            return get_option('aufmass_client_id', '');
        }
        return $wert;
    }

    public static function domaene_pruefen($wert) {
        $wert = strtolower(trim((string) $wert));
        $wert = preg_replace('#^https?://#', '', $wert);
        $wert = trim($wert, '/ ');
        if ($wert === '') {
            add_settings_error('aufmass_sync', 'domaene',
                'Ohne Domäne darf sich jedes Google-Konto anmelden. Bitte die Organisationsdomäne eintragen.',
                'warning');
            return '';
        }
        if (!preg_match('/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/', $wert)) {
            add_settings_error('aufmass_sync', 'domaene', 'Das ist keine gültige Domäne.');
            return get_option('aufmass_domaene', '');
        }
        return $wert;
    }

    public static function seite() {
        if (!current_user_can('manage_options')) { return; }
        global $wpdb;
        $bt = Aufmass_Datenbank::tabelle('benutzer');
        $pt = Aufmass_Datenbank::tabelle('projekte');
        $benutzer = $wpdb->get_results("SELECT * FROM $bt ORDER BY name", ARRAY_A) ?: array();
        $anzahl = (int) $wpdb->get_var("SELECT COUNT(*) FROM $pt WHERE geloescht = 0");

        /* Zugang sperren oder freigeben */
        if (isset($_POST['aufmass_benutzer']) && check_admin_referer('aufmass_benutzer')) {
            $id = sanitize_text_field(wp_unslash($_POST['aufmass_benutzer']));
            $aktiv = isset($_POST['aufmass_aktiv']) ? (int) $_POST['aufmass_aktiv'] : 0;
            $wpdb->update($bt, array('aktiv' => $aktiv), array('id' => $id));
            if (!$aktiv) { Aufmass_Anmeldung::alle_beenden($id); }
            echo '<div class="notice notice-success"><p>Zugang ' . ($aktiv ? 'freigegeben' : 'gesperrt und alle Geräte abgemeldet') . '.</p></div>';
            $benutzer = $wpdb->get_results("SELECT * FROM $bt ORDER BY name", ARRAY_A) ?: array();
        }
        /* Einen gesperrten Zugang endgültig löschen (Löschkonzept): Name,
           Adresse, Sitzungen und Zuständigkeiten verschwinden, die Aufmaße
           bleiben. Nur gesperrte Zugänge lassen sich löschen - ein Klick zu
           viel soll niemanden mitten in der Arbeit aussperren. */
        if (isset($_POST['aufmass_benutzer_loeschen']) && check_admin_referer('aufmass_benutzer_loeschen')) {
            $id = sanitize_text_field(wp_unslash($_POST['aufmass_benutzer_loeschen']));
            $z = $wpdb->get_row($wpdb->prepare("SELECT id, aktiv FROM $bt WHERE id = %s", $id), ARRAY_A);
            if ($z && (int) $z['aktiv'] === 0) {
                Aufmass_Anmeldung::zugang_loeschen($id);
                echo '<div class="notice notice-success"><p>Zugang gelöscht. Die Aufmaße bleiben erhalten.</p></div>';
            } else {
                echo '<div class="notice notice-error"><p>Nur ein gesperrter Zugang lässt sich löschen.</p></div>';
            }
            $benutzer = $wpdb->get_results("SELECT * FROM $bt ORDER BY name", ARRAY_A) ?: array();
        }
        ?>
        <div class="wrap">
          <h1>Aufmaß-Abgleich</h1>
          <p>Das Aufmaß-Werkzeug gleicht Projekte, Fotos und Zuständigkeiten über diesen Server ab.
             Zurzeit liegen hier <strong><?php echo (int) $anzahl; ?></strong> Aufmaße.</p>

          <form method="post" action="options.php">
            <?php settings_fields('aufmass_sync'); ?>
            <table class="form-table" role="presentation">
              <tr>
                <th scope="row"><label for="aufmass_client_id">Google-Client-ID</label></th>
                <td>
                  <input name="aufmass_client_id" id="aufmass_client_id" type="text" class="regular-text code"
                         value="<?php echo esc_attr(get_option('aufmass_client_id', '')); ?>"
                         placeholder="123456789-abc.apps.googleusercontent.com">
                  <p class="description">Aus der Google Cloud Console, Bereich „Anmeldedaten“.
                     Ein <strong>Client-Geheimnis wird nicht gebraucht</strong> und darf hier nicht eingetragen werden.</p>
                </td>
              </tr>
              <tr>
                <th scope="row"><label for="aufmass_domaene">Organisationsdomäne</label></th>
                <td>
                  <input name="aufmass_domaene" id="aufmass_domaene" type="text" class="regular-text code"
                         value="<?php echo esc_attr(get_option('aufmass_domaene', '')); ?>"
                         placeholder="provision-infra.de">
                  <p class="description">Nur Google-Konten dieser Organisation dürfen sich anmelden.
                     <strong>Bleibt das Feld leer, darf sich jedes beliebige Google-Konto anmelden.</strong></p>
                </td>
              </tr>
            </table>

            <h2>Pipedrive</h2>
            <p>Mit dem Schlüssel hier kann jedes angemeldete Gerät Aufmaße aus Pipedrive-Deals anlegen -
               ohne dass der Schlüssel auf den Geräten liegt. Er wird verschlüsselt abgelegt; der
               Schlüssel dafür steckt in der <code>wp-config.php</code>, nicht in der Datenbank.</p>
            <?php $pd_da = Aufmass_Pipedrive::eingerichtet(); $pd_kaputt = Aufmass_Pipedrive::token_unlesbar(); ?>
            <table class="form-table" role="presentation">
              <tr>
                <th scope="row"><label for="aufmass_pipedrive_token">Pipedrive-Zugriffsschlüssel</label></th>
                <td>
                  <?php if ($pd_da) : ?>
                    <p><strong style="color:#1b7a44">✓ Hinterlegt.</strong> Zum Ändern neuen Schlüssel eintragen, sonst leer lassen.</p>
                  <?php elseif ($pd_kaputt) : ?>
                    <p><strong style="color:#a32020">Der hinterlegte Schlüssel ist nicht mehr lesbar.</strong>
                       Das passiert, wenn die Salts in der wp-config.php geändert wurden. Bitte neu eintragen.</p>
                  <?php else : ?>
                    <p>Noch nicht hinterlegt.</p>
                  <?php endif; ?>
                  <input name="aufmass_pipedrive_token" id="aufmass_pipedrive_token" type="password" class="regular-text code"
                         value="" autocomplete="new-password" placeholder="API-Token aus Pipedrive">
                  <p class="description">In Pipedrive unter Einstellungen → Persönliche Einstellungen → API.
                     Er gilt mit allen Rechten dieses Pipedrive-Kontos; das Werkzeug liest nur.</p>
                  <?php if ($pd_da || $pd_kaputt) : ?>
                    <label><input type="checkbox" name="aufmass_pipedrive_entfernen" value="1"> Schlüssel entfernen</label>
                  <?php endif; ?>
                </td>
              </tr>
              <tr>
                <th scope="row"><label for="aufmass_pipedrive_host">Pipedrive-Adresse</label></th>
                <td>
                  <input name="aufmass_pipedrive_host" id="aufmass_pipedrive_host" type="text" class="regular-text code"
                         value="<?php echo esc_attr(get_option('aufmass_pipedrive_host', '')); ?>"
                         placeholder="api.pipedrive.com">
                  <p class="description">Leer lassen für die Standardadresse. Nur ändern, wenn Pipedrive eine eigene Firmenadresse vorgibt.</p>
                </td>
              </tr>
            </table>

            <h2>Kundenfreigabe</h2>
            <p>Aus dem Schließplan heraus bekommt der Kunde einen kurzen Link. Er trägt seine
               Berechtigungen ein und klickt auf „Übertragen“. Die Rückmeldung wartet dann im Werkzeug,
               bis eine zuständige Person sie geprüft und übernommen hat.</p>
            <?php
              $fr_tage = (int) get_option('aufmass_freigabe_tage', 30);
              $fr_mail = Aufmass_Freigaben::mail_gewuenscht();
              $fr_beispiel = Aufmass_Freigaben::kurzlink('k7m2p9x4qa');
              $fr_sprechend = (string) get_option('permalink_structure', '') !== '';
              $ft = Aufmass_Datenbank::tabelle('freigaben');
              $fr_offen = (int) $wpdb->get_var("SELECT COUNT(*) FROM $ft WHERE status = 'beantwortet'");
            ?>
            <table class="form-table" role="presentation">
              <tr>
                <th scope="row"><label for="aufmass_freigabe_tage">Gültigkeit der Links</label></th>
                <td>
                  <input name="aufmass_freigabe_tage" id="aufmass_freigabe_tage" type="number" min="0" max="3650"
                         class="small-text" value="<?php echo esc_attr($fr_tage); ?>"> Tage
                  <p class="description">Nach dieser Zeit meldet der Link „abgelaufen“. 0 = unbegrenzt.
                     Jeder Link lässt sich im Werkzeug jederzeit zurückziehen.</p>
                </td>
              </tr>
              <tr>
                <th scope="row">Benachrichtigung</th>
                <td>
                  <input type="hidden" name="aufmass_freigabe_mail" value="0">
                  <label><input type="checkbox" name="aufmass_freigabe_mail" value="1" <?php checked($fr_mail); ?>>
                    Bei jeder Rückmeldung eine E-Mail an den Ersteller des Links und alle Zuständigen des Aufmaßes senden</label>
                  <p class="description">Versand über die E-Mail-Funktion von WordPress
                     (Absender <code>wordpress@<?php echo esc_html(parse_url(home_url(), PHP_URL_HOST)); ?></code>,
                     sofern kein Mail-Plugin etwas anderes vorgibt).</p>
                </td>
              </tr>
              <tr>
                <th scope="row">So sieht ein Link aus</th>
                <td>
                  <code><?php echo esc_html($fr_beispiel); ?></code>
                  <?php if (!$fr_sprechend) : ?>
                    <p class="description" style="color:#a32020">Die Permalinks stehen auf „Einfach“. Mit einer
                       anderen Einstellung unter <em>Einstellungen → Permalinks</em> wird der Link kürzer:
                       <code><?php echo esc_html(home_url('/f/k7m2p9x4qa')); ?></code></p>
                  <?php else : ?>
                    <p class="description">Der Link führt auf die Freigabeseite des Werkzeugs. Zurzeit warten
                       <strong><?php echo $fr_offen; ?></strong> Rückmeldungen auf eine Prüfung.</p>
                  <?php endif; ?>
                </td>
              </tr>
            </table>
            <?php submit_button(); ?>
          </form>

          <h2>Zugänge</h2>
          <?php if (!count($benutzer)) : ?>
            <p>Noch niemand angemeldet. Die <em>erste</em> Anmeldung erhält automatisch die Verwaltung.</p>
          <?php else : ?>
          <table class="widefat striped">
            <thead><tr><th>Name</th><th>Adresse</th><th>Rolle</th><th>Zuletzt</th><th>Zugang</th></tr></thead>
            <tbody>
            <?php foreach ($benutzer as $b) : ?>
              <tr>
                <td><strong><?php echo esc_html($b['name']); ?></strong></td>
                <td><code><?php echo esc_html($b['email']); ?></code></td>
                <td><?php echo $b['rolle'] === 'verwaltung' ? 'Verwaltung' : 'Mitarbeit'; ?></td>
                <td><?php echo $b['letzte_anmeldung'] ? esc_html(mysql2date('d.m.Y H:i', $b['letzte_anmeldung'])) : '–'; ?></td>
                <td>
                  <form method="post" style="margin:0;display:inline">
                    <?php wp_nonce_field('aufmass_benutzer'); ?>
                    <input type="hidden" name="aufmass_benutzer" value="<?php echo esc_attr($b['id']); ?>">
                    <input type="hidden" name="aufmass_aktiv" value="<?php echo (int) $b['aktiv'] ? 0 : 1; ?>">
                    <?php if ((int) $b['aktiv']) : ?>
                      <button class="button button-small">sperren</button>
                    <?php else : ?>
                      <button class="button button-small button-primary">freigeben</button>
                    <?php endif; ?>
                  </form>
                  <?php if (!(int) $b['aktiv']) : ?>
                  <form method="post" style="margin:0 0 0 .5em;display:inline"
                        onsubmit="return confirm('Diesen Zugang endgültig löschen? Name, Adresse und Zuständigkeiten dieser Person werden entfernt. Die Aufmaße bleiben.');">
                    <?php wp_nonce_field('aufmass_benutzer_loeschen'); ?>
                    <input type="hidden" name="aufmass_benutzer_loeschen" value="<?php echo esc_attr($b['id']); ?>">
                    <button class="button button-small button-link-delete">löschen</button>
                  </form>
                  <?php endif; ?>
                </td>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>
          <p class="description">Sperren meldet sofort alle Geräte dieser Person ab. Löschen entfernt danach
             Name, Adresse, Sitzungen und Zuständigkeiten dieser Person – die Aufmaße bleiben erhalten.</p>
          <?php endif; ?>

          <h2>Aufbewahrung</h2>
          <p>Was das Plugin ablegt und wann es von selbst wieder verschwindet (ein täglicher
             WordPress-Zeitplan räumt auf):</p>
          <ul style="list-style:disc;margin-left:1.5em">
            <li><strong>Zugänge:</strong> Google-Kennung, Name, E-Mail-Adresse, erste und letzte Anmeldung.
                Kein Profilbild. Bleiben, bis der Zugang hier gelöscht wird.</li>
            <li><strong>Sitzungen:</strong> je Gerät <?php echo (int) Aufmass_Anmeldung::DAUER_TAGE; ?> Tage,
                dann von selbst weg; Sperren beendet sie sofort.</li>
            <li><strong>Aufmaße, Fotos, Zuständigkeiten:</strong> bis zum Löschen im Werkzeug, danach noch
                <?php echo (int) Aufmass_Projekte::PAPIERKORB_TAGE; ?> Tage im Papierkorb, dann endgültig entfernt.</li>
            <li><strong>Kundenfreigaben:</strong> die Plandaten eines Links bis zu seinem Ablauf oder Rückzug
                (dann sofort entfernt); die Rückmeldung des Kunden – Name, Anmerkung, Eintragungen – bis
                <?php echo (int) Aufmass_Freigaben::AUFBEWAHRUNG_TAGE; ?> Tage nach der Prüfung.</li>
            <li><strong>Drosselung:</strong> ein Zähler je Herkunft (gekürzter, gehashter Adressbereich,
                keine IP-Adresse) für zehn Minuten.</li>
          </ul>
        </div>
        <?php
    }
}

add_action('admin_menu', array('Aufmass_Einstellungen', 'menue'));
add_action('admin_init', array('Aufmass_Einstellungen', 'registrieren'));
