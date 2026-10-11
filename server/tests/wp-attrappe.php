<?php
/**
 * wp-attrappe.php — So viel WordPress, wie zum Prüfen nötig ist.
 *
 * Die Logik des Plugins steckt in den inc/-Dateien und hängt nur an einer
 * Handvoll WordPress-Funktionen. Die werden hier nachgebildet, die
 * Datenbank läuft als SQLite im Arbeitsspeicher. Damit lassen sich Rechte,
 * Versionskonflikte und Fotos wirklich durchspielen, statt sie nur zu
 * behaupten.
 */

define('ABSPATH', __DIR__ . '/');
define('ARRAY_A', 'ARRAY_A');
define('AUFMASS_VERSION', '1.0.0-test');
/* Salts wie in einer wp-config.php - daraus entsteht der Schlüssel für
   abgelegte Geheimnisse. Prüfläufe dürfen sie umsetzen (AUFMASS_TEST_SALZ). */
if (!defined('AUTH_KEY')) { define('AUTH_KEY', getenv('AUFMASS_TEST_SALZ') ?: 'pruef-salz-eins'); }
if (!defined('SECURE_AUTH_KEY')) { define('SECURE_AUTH_KEY', 'pruef-salz-zwei'); }
if (!defined('COOKIEPATH')) { define('COOKIEPATH', '/'); }
if (!defined('COOKIE_DOMAIN')) { define('COOKIE_DOMAIN', ''); }

/* --- Optionen ----------------------------------------------------------- */
$GLOBALS['wp_optionen_datei'] = getenv('AUFMASS_TEST_OPT') ?: '';
$GLOBALS['wp_optionen'] = array();
if ($GLOBALS['wp_optionen_datei'] && file_exists($GLOBALS['wp_optionen_datei'])) {
    $GLOBALS['wp_optionen'] = json_decode(file_get_contents($GLOBALS['wp_optionen_datei']), true) ?: array();
}
function wp_optionen_sichern() {
    if ($GLOBALS['wp_optionen_datei']) {
        file_put_contents($GLOBALS['wp_optionen_datei'], json_encode($GLOBALS['wp_optionen']));
    }
}
function get_option($name, $vorgabe = false) {
    return array_key_exists($name, $GLOBALS['wp_optionen']) ? $GLOBALS['wp_optionen'][$name] : $vorgabe;
}
function update_option($name, $wert, $auto = true) { $GLOBALS['wp_optionen'][$name] = $wert; wp_optionen_sichern(); return true; }
function add_option($name, $wert, $x = '', $auto = true) {
    if (!array_key_exists($name, $GLOBALS['wp_optionen'])) { $GLOBALS['wp_optionen'][$name] = $wert; wp_optionen_sichern(); }
    return true;
}
$GLOBALS['wp_zwischen'] = array();
function get_transient($n) { return isset($GLOBALS['wp_zwischen'][$n]) ? $GLOBALS['wp_zwischen'][$n] : false; }
function set_transient($n, $w, $d = 0) { $GLOBALS['wp_zwischen'][$n] = $w; return true; }

/* --- Fehlerobjekte ------------------------------------------------------- */
class WP_Error {
    public $code, $message, $data;
    public function __construct($code = '', $message = '', $data = array()) {
        $this->code = $code; $this->message = $message; $this->data = $data;
    }
    public function get_error_code() { return $this->code; }
    public function get_error_message() { return $this->message; }
    public function get_error_data() { return $this->data; }
}
function is_wp_error($d) { return $d instanceof WP_Error; }

/* --- Kleinkram ----------------------------------------------------------- */
function wp_json_encode($d, $f = 0) { return json_encode($d, $f | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
function size_format($b, $n = 0) {
    $e = array('B', 'KB', 'MB', 'GB'); $i = 0;
    while ($b >= 1024 && $i < 3) { $b /= 1024; $i++; }
    return round($b, $n) . ' ' . $e[$i];
}
function is_ssl() { return true; }
function wp_upload_dir() {
    $basis = getenv('AUFMASS_TEST_UPLOADS') ?: (sys_get_temp_dir() . '/aufmass-test-uploads');
    if (!is_dir($basis)) { mkdir($basis, 0777, true); }
    return array('basedir' => $basis, 'baseurl' => 'http://example.test/uploads');
}
function trailingslashit($p) { return rtrim($p, '/\\') . '/'; }
function wp_mkdir_p($p) { return is_dir($p) || mkdir($p, 0777, true); }
function nocache_headers() {}
function mysql2date($f, $d) { return date($f, strtotime($d)); }
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function add_action() {} function add_filter() {} function register_rest_route() {}
function register_setting() {} function add_options_page() {} function add_settings_error() {}
function current_user_can() { return true; } function wp_nonce_field() {}
function check_admin_referer() { return true; } function settings_fields() {}
function submit_button() {}
/* Ausgehende Anfragen: Ein Prüflauf kann eine Antwort unterschieben
   ($GLOBALS['wp_remote_attrappe']); der Mini-Server ruft eine Attrappe von
   Pipedrive auf dem eigenen Rechner wirklich auf. Alles andere: kein Netz. */
$GLOBALS['wp_remote_attrappe'] = null;
$GLOBALS['wp_remote_letzte'] = null;
function wp_remote_get($url, $args = array()) {
    $GLOBALS['wp_remote_letzte'] = array('url' => $url, 'args' => $args);
    if (is_callable($GLOBALS['wp_remote_attrappe'])) { return call_user_func($GLOBALS['wp_remote_attrappe'], $url, $args); }
    if (!preg_match('#^http://127\.0\.0\.1(:[0-9]+)?/#', $url)) { return new WP_Error('offline', 'kein Netz im Test'); }
    $kopf = array();
    foreach ((isset($args['headers']) ? $args['headers'] : array()) as $k => $w) { $kopf[] = $k . ': ' . $w; }
    $c = curl_init($url);
    curl_setopt_array($c, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $kopf,
        CURLOPT_TIMEOUT => isset($args['timeout']) ? (int) $args['timeout'] : 10, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_USERAGENT => isset($args['user-agent']) ? $args['user-agent'] : 'WordPress-Attrappe'));
    $body = curl_exec($c);
    if ($body === false) { $f = curl_error($c); curl_close($c); return new WP_Error('http', $f); }
    $code = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
    curl_close($c);
    return array('response' => array('code' => $code), 'body' => $body, 'headers' => array());
}
function wp_remote_retrieve_response_code($a) { return is_array($a) && isset($a['response']['code']) ? $a['response']['code'] : 0; }
function wp_remote_retrieve_body($a) { return is_array($a) && isset($a['body']) ? $a['body'] : ''; }
function wp_remote_retrieve_header($a, $n) { return is_array($a) && isset($a['headers'][$n]) ? $a['headers'][$n] : ''; }
function delete_option($name) { unset($GLOBALS['wp_optionen'][$name]); wp_optionen_sichern(); return true; }
function delete_transient($n) { unset($GLOBALS['wp_zwischen'][$n]); return true; }
function wp_next_scheduled() { return true; } function wp_schedule_event() {}
function wp_clear_scheduled_hook() {}
function plugin_dir_path($f) { return dirname($f) . '/'; }
function plugin_dir_url($f) { return 'http://example.test/plugin/'; }
function register_activation_hook() {} function register_deactivation_hook() {}

class WP_REST_Response {
    public $daten, $status, $kopf = array();
    public function __construct($d, $s = 200) { $this->daten = $d; $this->status = $s; }
    public function header($n, $w) { $this->kopf[$n] = $w; }
    public function get_data() { return $this->daten; }
}

/* --- Datenbank ----------------------------------------------------------- */
class WPDB_Attrappe {
    public $prefix = 'wp_';
    private $pdo;
    public $letzter_fehler = '';

    public function __construct() {
        /* Für den Durchlauf mit zwei Geräten muss der Stand zwischen den
           Anfragen erhalten bleiben - dann eine Datei statt Arbeitsspeicher. */
        $datei = getenv('AUFMASS_TEST_DB');
        $neu = !$datei || !file_exists($datei);
        $this->pdo = new PDO('sqlite:' . ($datei ?: ':memory:'));
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->exec('PRAGMA busy_timeout = 4000');
        if ($neu) { $this->tabellen(); }
    }

    private function tabellen() {
        /* Dieselben Spalten wie in datenbank.php, nur in SQLite-Schreibweise. */
        $this->pdo->exec("CREATE TABLE wp_aufmass_benutzer (
            id TEXT PRIMARY KEY, email TEXT DEFAULT '', name TEXT DEFAULT '', bild TEXT DEFAULT '',
            rolle TEXT DEFAULT 'mitarbeit', aktiv INTEGER DEFAULT 1,
            erste_anmeldung TEXT, letzte_anmeldung TEXT)");
        $this->pdo->exec("CREATE TABLE wp_aufmass_projekte (
            id TEXT PRIMARY KEY, kunde TEXT DEFAULT '', objekt TEXT DEFAULT '', anlagen_nr TEXT DEFAULT '',
            daten TEXT NOT NULL, version INTEGER DEFAULT 1,
            angelegt_am TEXT, angelegt_von TEXT DEFAULT '',
            geaendert_am TEXT, geaendert_von TEXT DEFAULT '',
            geloescht INTEGER DEFAULT 0, geloescht_am TEXT)");
        $this->pdo->exec("CREATE TABLE wp_aufmass_zustaendig (
            projekt_id TEXT, benutzer_id TEXT, seit TEXT, PRIMARY KEY (projekt_id, benutzer_id))");
        $this->pdo->exec("CREATE TABLE wp_aufmass_fotos (
            id TEXT PRIMARY KEY, projekt_id TEXT, tuer_id TEXT DEFAULT '', datei TEXT DEFAULT '',
            mime TEXT DEFAULT 'image/jpeg', groesse INTEGER DEFAULT 0,
            erstellt_am TEXT, hochgeladen_von TEXT DEFAULT '')");
        $this->pdo->exec("CREATE TABLE wp_aufmass_sitzungen (
            id TEXT PRIMARY KEY, pruefwert TEXT DEFAULT '', benutzer_id TEXT, geraet TEXT DEFAULT '',
            erstellt_am TEXT, gesehen_am TEXT, gueltig_bis TEXT)");
    }

    public function get_charset_collate() { return ''; }

    /** %s und %d einsetzen - wie WordPress, nur schlanker. */
    public function prepare($sql, ...$werte) {
        if (count($werte) === 1 && is_array($werte[0])) { $werte = $werte[0]; }
        $i = 0;
        return preg_replace_callback('/%[sdf]/', function ($t) use (&$i, $werte) {
            $w = array_key_exists($i, $werte) ? $werte[$i] : null; $i++;
            if ($t[0] === '%d') { return (string) (int) $w; }
            if ($t[0] === '%f') { return (string) (float) $w; }
            if ($w === null) { return 'NULL'; }
            return "'" . str_replace("'", "''", (string) $w) . "'";
        }, $sql);
    }

    private function anpassen($sql) {
        /* MySQL-Eigenheiten für SQLite übersetzen */
        return str_ireplace('INSERT IGNORE INTO', 'INSERT OR IGNORE INTO', $sql);
    }

    public function query($sql) {
        try { return $this->pdo->exec($this->anpassen($sql)); }
        catch (Exception $e) { $this->letzter_fehler = $e->getMessage(); return false; }
    }
    public function get_results($sql, $art = ARRAY_A) {
        try { return $this->pdo->query($this->anpassen($sql))->fetchAll(PDO::FETCH_ASSOC); }
        catch (Exception $e) { $this->letzter_fehler = $e->getMessage(); return array(); }
    }
    public function get_row($sql, $art = ARRAY_A) {
        $r = $this->get_results($sql, $art);
        return count($r) ? $r[0] : null;
    }
    public function get_col($sql) {
        $raus = array();
        foreach ($this->get_results($sql) as $z) { $raus[] = reset($z); }
        return $raus;
    }
    public function get_var($sql) {
        $z = $this->get_row($sql);
        return $z ? reset($z) : null;
    }
    public function insert($tabelle, $daten) {
        $spalten = array_keys($daten);
        $werte = array_map(function ($w) { return $w === null ? 'NULL' : "'" . str_replace("'", "''", (string) $w) . "'"; },
            array_values($daten));
        return $this->query("INSERT INTO $tabelle (" . implode(',', $spalten) . ") VALUES (" . implode(',', $werte) . ")");
    }
    public function update($tabelle, $daten, $wo) {
        $setzen = array();
        foreach ($daten as $k => $w) {
            $setzen[] = "$k = " . ($w === null ? 'NULL' : "'" . str_replace("'", "''", (string) $w) . "'");
        }
        $b = array();
        foreach ($wo as $k => $w) { $b[] = "$k = '" . str_replace("'", "''", (string) $w) . "'"; }
        return $this->query("UPDATE $tabelle SET " . implode(', ', $setzen) . " WHERE " . implode(' AND ', $b));
    }
    public function delete($tabelle, $wo) {
        $b = array();
        foreach ($wo as $k => $w) { $b[] = "$k = '" . str_replace("'", "''", (string) $w) . "'"; }
        return $this->query("DELETE FROM $tabelle WHERE " . implode(' AND ', $b));
    }
}

$GLOBALS['wpdb'] = new WPDB_Attrappe();

require_once __DIR__ . '/../aufmass-sync/inc/datenbank.php';
require_once __DIR__ . '/../aufmass-sync/inc/jwt.php';
require_once __DIR__ . '/../aufmass-sync/inc/anmeldung.php';
require_once __DIR__ . '/../aufmass-sync/inc/projekte.php';
require_once __DIR__ . '/../aufmass-sync/inc/fotos.php';
require_once __DIR__ . '/../aufmass-sync/inc/verschluesselung.php';
require_once __DIR__ . '/../aufmass-sync/inc/pipedrive.php';

/* Im reinen Prüflauf gibt es keine Kopfzeilen; im Mini-Server schon. */
Aufmass_Anmeldung::$cookie_schreiben = (php_sapi_name() !== 'cli');

/* Hilfsmittel für die Tests */
function test_benutzer($id, $name, $rolle = 'mitarbeit') {
    global $wpdb;
    $wpdb->insert('wp_aufmass_benutzer', array(
        'id' => $id, 'email' => $id . '@provision-infra.de', 'name' => $name,
        'rolle' => $rolle, 'aktiv' => 1,
        'erste_anmeldung' => Aufmass_Datenbank::jetzt(),
        'letzte_anmeldung' => Aufmass_Datenbank::jetzt()));
    return array('id' => $id, 'email' => $id . '@provision-infra.de', 'name' => $name,
                 'bild' => '', 'rolle' => $rolle);
}
