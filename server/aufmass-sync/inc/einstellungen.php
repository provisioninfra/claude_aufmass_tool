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
        /* Neue Konten der Organisation: sofort dabei oder erst nach Freigabe */
        register_setting('aufmass_sync', 'aufmass_neue_freigeben', array(
            'type' => 'string', 'sanitize_callback' => array(__CLASS__, 'schalter_pruefen'), 'default' => '0'
        ));
        /* Hinter einem Proxy mit öffentlicher Adresse (CDN): Besucheradresse
           aus dessen Kopffeld lesen - siehe Aufmass_Drossel::herkunft(). */
        register_setting('aufmass_sync', Aufmass_Drossel::OPTION_PROXY, array(
            'type' => 'string', 'sanitize_callback' => array(__CLASS__, 'schalter_pruefen'), 'default' => '0'
        ));
        /* Tür einsprechen: OpenAI-Schlüssel (verschlüsselt), Adresse, Modelle */
        register_setting('aufmass_sync', 'aufmass_openai_schluessel', array(
            'type' => 'string', 'sanitize_callback' => array(__CLASS__, 'openai_schluessel_pruefen'), 'default' => ''
        ));
        register_setting('aufmass_sync', 'aufmass_openai_host', array(
            'type' => 'string', 'sanitize_callback' => array(__CLASS__, 'openai_host_pruefen'), 'default' => ''
        ));
        register_setting('aufmass_sync', 'aufmass_diktat_modell_erkennung', array(
            'type' => 'string', 'sanitize_callback' => array(__CLASS__, 'modell_erkennung_pruefen'), 'default' => ''
        ));
        register_setting('aufmass_sync', 'aufmass_diktat_modell_zuordnung', array(
            'type' => 'string', 'sanitize_callback' => array(__CLASS__, 'modell_zuordnung_pruefen'), 'default' => ''
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

    public static function openai_schluessel_pruefen($wert) {
        if (!empty($_POST['aufmass_openai_entfernen'])) { return ''; }
        $wert = trim((string) $wert);
        if ($wert === '') { return (string) get_option('aufmass_openai_schluessel', ''); }   /* unverändert */
        if (Aufmass_Verschluesselung::ist_chiffre($wert)) { return $wert; }   /* zweiter Durchlauf beim ersten Speichern */
        if (!preg_match('/^sk-[A-Za-z0-9_\-]{16,256}$/', $wert)) {
            add_settings_error('aufmass_sync', 'openai',
                'Der OpenAI-Schlüssel sieht nicht wie ein API-Schlüssel aus - er beginnt mit „sk-“.');
            return (string) get_option('aufmass_openai_schluessel', '');
        }
        $chiffre = Aufmass_Verschluesselung::verschluesseln($wert);
        if ($chiffre === null) {
            add_settings_error('aufmass_sync', 'openai',
                'Der Schlüssel konnte nicht verschlüsselt abgelegt werden (weder sodium noch openssl verfügbar).');
            return (string) get_option('aufmass_openai_schluessel', '');
        }
        return $chiffre;
    }

    public static function openai_host_pruefen($wert) {
        $wert = trim((string) $wert);
        if ($wert === '') { return ''; }
        $wert = preg_replace('#^https?://#i', '', $wert);
        $wert = preg_replace('#/.*$#', '', $wert);
        if (!preg_match('/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i', $wert)) {
            add_settings_error('aufmass_sync', 'openai_host', 'Das ist keine gültige OpenAI-Adresse.');
            return (string) get_option('aufmass_openai_host', '');
        }
        return strtolower($wert);
    }

    public static function modell_erkennung_pruefen($wert) { return self::modell_pruefen($wert, 'aufmass_diktat_modell_erkennung'); }
    public static function modell_zuordnung_pruefen($wert) { return self::modell_pruefen($wert, 'aufmass_diktat_modell_zuordnung'); }
    private static function modell_pruefen($wert, $option) {
        $wert = trim((string) $wert);
        if ($wert === '') { return ''; }
        if (!preg_match('/^[a-z0-9][a-z0-9.:_\-]{1,60}$/i', $wert)) {
            add_settings_error('aufmass_sync', 'modell',
                'Ein Modellname besteht aus Buchstaben, Ziffern, Punkt, Doppelpunkt, Unter- und Bindestrich.');
            return (string) get_option($option, '');
        }
        return $wert;
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
                'Ohne Organisationsdomäne ist die Anmeldung gesperrt - bitte die Domäne eintragen.',
                'error');
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
        /* Verbindung zu OpenAI prüfen: holt nur die Modellliste - kostenlos. */
        if (isset($_GET['aufmass_diktat_pruefen']) && check_admin_referer('aufmass_diktat_pruefen')) {
            $e = Aufmass_Diktat::verbindung_pruefen();
            if (is_wp_error($e)) {
                echo '<div class="notice notice-error"><p>OpenAI: ' . esc_html($e->get_error_message()) . '</p></div>';
            } else {
                $fehlt = array();
                if (!$e['erkennung']) { $fehlt[] = Aufmass_Diktat::modell('erkennung'); }
                if (!$e['zuordnung']) { $fehlt[] = Aufmass_Diktat::modell('zuordnung'); }
                echo '<div class="notice ' . ($fehlt ? 'notice-warning' : 'notice-success') . '"><p>OpenAI antwortet, der Schlüssel gilt ('
                    . (int) $e['modelle'] . ' Modelle verfügbar).'
                    . ($fehlt ? ' Nicht darunter: ' . esc_html(implode(', ', $fehlt)) . ' - bitte die Modellnamen prüfen.' : ' Beide Modelle sind verfügbar.')
                    . '</p></div>';
            }
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
                  <p class="description">Nur Google-Workspace-Konten dieser Organisation dürfen sich anmelden -
                     geprüft an der Organisationsangabe des Ausweises <em>und</em> an der Adresse.
                     <strong>Bleibt das Feld leer, ist die Anmeldung gesperrt.</strong></p>
                </td>
              </tr>
              <tr>
                <th scope="row">Neue Zugänge</th>
                <td>
                  <input type="hidden" name="aufmass_neue_freigeben" value="0">
                  <label><input type="checkbox" name="aufmass_neue_freigeben" value="1" <?php checked(Aufmass_Anmeldung::neue_erst_freigeben()); ?>>
                    Neue Konten der Organisation erst nach Freigabe durch die Verwaltung zulassen</label>
                  <p class="description">Ohne Haken ist jedes Konto der Organisation sofort dabei. Mit Haken wird
                     der Zugang angelegt, bleibt aber gesperrt, bis er unten unter „Zugänge“ freigegeben wird.
                     Die erste Anmeldung erhält in jedem Fall die Verwaltung.</p>
                </td>
              </tr>
              <tr>
                <th scope="row">Herkunft der Aufrufe</th>
                <td>
                  <?php $hk = Aufmass_Drossel::herkunft_erklaert(); ?>
                  <p>Dieser Aufruf kommt für den Server von
                     <code><?php echo esc_html($hk['adresse'] !== '' ? $hk['adresse'] : 'unbekannt'); ?></code><?php
                     if ($hk['quelle'] === 'kopffeld') : ?> - weitergereicht vom Proxy
                       <code><?php echo esc_html($hk['direkt']); ?></code> über dessen Kopffeld.<?php
                     elseif ($hk['intern']) : ?> - eine interne Adresse ohne Kopffeld: Der Server sieht alle Besucher
                       gleich. Bitte beim Hoster nachfragen, wie er die Besucheradresse weiterreicht.<?php
                     elseif ($hk['schalter']) : ?> - der Haken unten ist gesetzt, aber dieser Aufruf trägt kein Kopffeld;
                       gezählt wird die direkte Adresse.<?php
                     else : ?>.<?php endif; ?></p>
                  <?php if ($hk['kopffelder']) : ?>
                    <p class="description">Gesehene Kopffelder:
                      <?php foreach ($hk['kopffelder'] as $n => $w) : ?><code><?php echo esc_html($n . ': ' . $w); ?></code> <?php endforeach; ?></p>
                  <?php endif; ?>
                  <input type="hidden" name="aufmass_hinter_proxy" value="0">
                  <label><input type="checkbox" name="aufmass_hinter_proxy" value="1" <?php checked($hk['schalter']); ?>>
                    Die Website läuft hinter einem Proxy oder CDN: Besucheradresse aus dessen Kopffeld lesen</label>
                  <p class="description">Fehlversuche bei der Anmeldung und Aufrufe der Kundenseite werden je Besucheradresse
                     gedrosselt. <strong>Probe:</strong> diese Seite einmal vom Telefon über Mobilfunk öffnen. Steht oben dann eine
                     andere Adresse als am Bürorechner, ist alles richtig - Haken aus lassen, sonst könnten Besucher ihre
                     Adresse frei vorgeben. Steht von überall dieselbe Adresse, sieht der Server nur den Proxy des Hosters -
                     dann den Haken setzen. Aus einem internen Netz des Hosters wird das Kopffeld ohnehin von selbst gelesen.</p>
                </td>
              </tr>
            </table>
            <p class="description">Sicherheit der Anmeldung: Der Ausweis von Google wird gegen Googles aktuelle
               Schlüssel geprüft (nur RS256), muss für diese Client-ID ausgestellt sein, darf höchstens zehn Minuten
               alt sein und gilt genau einmal. Das Kennwort bleibt bei Google; der Server sieht es nie.</p>

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

            <h2>Tür einsprechen (OpenAI)</h2>
            <p>Mit einem OpenAI-Schlüssel können die Angaben zu einer Tür im Werkzeug eingesprochen werden:
               Die Aufnahme wird von OpenAI in Text verwandelt und den Feldern des Türformulars zugeordnet. Das
               Werkzeug zeigt das Ergebnis als Vorschlag; übernommen wird erst nach Bestätigung. Der Schlüssel wird
               wie der Pipedrive-Schlüssel verschlüsselt abgelegt und verlässt den Server nie. Gespeichert wird
               nichts - weder Aufnahme noch Text. Kosten: unter einem Cent je Tür, abgerechnet über das OpenAI-Konto.
               Je Person sind <?php echo (int) Aufmass_Diktat::JE_MINUTE; ?> Diktate je Minute und
               <?php echo (int) Aufmass_Diktat::JE_TAG; ?> je Tag möglich.</p>
            <?php $oa_da = Aufmass_Diktat::eingerichtet(); $oa_kaputt = Aufmass_Diktat::schluessel_unlesbar(); ?>
            <table class="form-table" role="presentation">
              <tr>
                <th scope="row"><label for="aufmass_openai_schluessel">OpenAI-Schlüssel</label></th>
                <td>
                  <?php if ($oa_da) : ?>
                    <p><strong style="color:#1b7a44">✓ Hinterlegt.</strong> Zum Ändern neuen Schlüssel eintragen, sonst leer lassen.
                       <a class="button" href="<?php echo esc_url(wp_nonce_url(admin_url('options-general.php?page=aufmass-sync&aufmass_diktat_pruefen=1'), 'aufmass_diktat_pruefen')); ?>">Verbindung prüfen</a>
                       <span class="description">kostenlos - holt nur die Modellliste</span></p>
                  <?php elseif ($oa_kaputt) : ?>
                    <p><strong style="color:#a32020">Der hinterlegte Schlüssel ist nicht mehr lesbar.</strong>
                       Das passiert, wenn die Salts in der wp-config.php geändert wurden. Bitte neu eintragen.</p>
                  <?php else : ?>
                    <p>Noch nicht hinterlegt - das Einsprechen ist im Werkzeug ausgeblendet.</p>
                  <?php endif; ?>
                  <input name="aufmass_openai_schluessel" id="aufmass_openai_schluessel" type="password" class="regular-text code"
                         value="" autocomplete="new-password" placeholder="sk-…">
                  <p class="description">Aus dem OpenAI-Konto unter platform.openai.com → API keys. Ein Projektschlüssel genügt.
                     Das ChatGPT-Abo deckt die Schnittstelle nicht ab; sie wird nach Nutzung abgerechnet.</p>
                  <?php if ($oa_da || $oa_kaputt) : ?>
                    <label><input type="checkbox" name="aufmass_openai_entfernen" value="1"> Schlüssel entfernen</label>
                  <?php endif; ?>
                </td>
              </tr>
              <tr>
                <th scope="row"><label for="aufmass_openai_host">OpenAI-Adresse</label></th>
                <td>
                  <input name="aufmass_openai_host" id="aufmass_openai_host" type="text" class="regular-text code"
                         value="<?php echo esc_attr(get_option('aufmass_openai_host', '')); ?>" placeholder="api.openai.com">
                  <p class="description">Leer lassen für api.openai.com. Für die Verarbeitung in der EU <code>eu.api.openai.com</code>
                     eintragen - das setzt ein OpenAI-Projekt mit EU-Datenresidenz voraus.</p>
                </td>
              </tr>
              <tr>
                <th scope="row">Modelle</th>
                <td>
                  <label for="aufmass_diktat_modell_erkennung">Erkennung (Ton → Text)</label><br>
                  <input name="aufmass_diktat_modell_erkennung" id="aufmass_diktat_modell_erkennung" type="text" class="regular-text code"
                         value="<?php echo esc_attr(get_option('aufmass_diktat_modell_erkennung', '')); ?>"
                         placeholder="<?php echo esc_attr(Aufmass_Diktat::MODELL_ERKENNUNG); ?>"><br>
                  <label for="aufmass_diktat_modell_zuordnung">Zuordnung (Text → Felder)</label><br>
                  <input name="aufmass_diktat_modell_zuordnung" id="aufmass_diktat_modell_zuordnung" type="text" class="regular-text code"
                         value="<?php echo esc_attr(get_option('aufmass_diktat_modell_zuordnung', '')); ?>"
                         placeholder="<?php echo esc_attr(Aufmass_Diktat::MODELL_ZUORDNUNG); ?>">
                  <p class="description">Leer lassen für die Vorgaben. Nur ändern, wenn OpenAI ein Modell abkündigt oder ein besseres
                     anbietet. „Verbindung prüfen“ sagt, ob die Modelle für den Schlüssel verfügbar sind.</p>
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
