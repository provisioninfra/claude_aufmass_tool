<?php
/**
 * mini-server.php — Ein winziger Webserver für den Durchlauf mit zwei Geräten.
 *
 * Er bildet die REST-Wege des Plugins nach und benutzt dabei DIESELBEN
 * Klassen wie im Betrieb (inc/projekte.php, inc/anmeldung.php, …). Damit
 * prüft der Abgleich im Werkzeug nicht gegen eine Nachbildung, sondern
 * gegen die echte Serverlogik.
 *
 * Start:  php -S 127.0.0.1:8188 server/tests/mini-server.php
 */
require_once __DIR__ . '/wp-attrappe.php';

header('Cache-Control: no-store');
$weg = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$art = $_SERVER['REQUEST_METHOD'];
$koerper = file_get_contents('php://input');
$json = json_decode($koerper, true);

function raus($daten, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($daten, JSON_UNESCAPED_UNICODE);
    exit;
}
function fehler($e) {
    $d = $e->get_error_data();
    $status = isset($d['status']) ? $d['status'] : 400;
    $antwort = array('code' => $e->get_error_code(), 'message' => $e->get_error_message());
    unset($d['status']);
    if (count($d)) { $antwort['data'] = $d; }
    raus($antwort, $status);
}
/* Jede schreibende Anfrage braucht das eigene Kopffeld - wie im Plugin. */
function kopffeldPruefen() {
    if (empty($_SERVER['HTTP_X_AUFMASS_ABGLEICH'])) {
        raus(array('code' => 'kopffeld_fehlt', 'message' => 'Diese Anfrage kam nicht vom Aufmaß-Werkzeug.'), 400);
    }
}
function benutzerOderRaus() {
    $b = Aufmass_Anmeldung::aktueller_benutzer();
    if (!$b) { raus(array('code' => 'nicht_angemeldet', 'message' => 'Bitte anmelden.'), 401); }
    return $b;
}

$basis = '/wp-json/aufmass/v1';
if (strpos($weg, $basis) !== 0) {
    /* Alles außerhalb der Schnittstelle liefert der eingebaute Webserver
       selbst aus - so lässt sich das Werkzeug im Browser prüfen. */
    $datei = __DIR__ . '/../../dist/aufmasstool' . $weg;
    if ($weg === '/' || substr($weg, -1) === '/') { $datei .= 'index.html'; }
    if (is_file($datei)) {
        $endungen = array('html' => 'text/html; charset=utf-8', 'js' => 'text/javascript',
            'css' => 'text/css', 'json' => 'application/json', 'webmanifest' => 'application/manifest+json',
            'svg' => 'image/svg+xml', 'png' => 'image/png', 'txt' => 'text/plain; charset=utf-8');
        $e = strtolower(pathinfo($datei, PATHINFO_EXTENSION));
        header('Content-Type: ' . (isset($endungen[$e]) ? $endungen[$e] : 'application/octet-stream'));
        readfile($datei);
        exit;
    }
    raus(array('message' => 'unbekannter Weg'), 404);
}
$rest = substr($weg, strlen($basis));

if ($rest === '/start' && $art === 'GET') {
    $b = Aufmass_Anmeldung::aktueller_benutzer();
    raus(array('eingerichtet' => get_option('aufmass_client_id', '') !== '',
        'clientId' => get_option('aufmass_client_id', ''),
        'domaene' => get_option('aufmass_domaene', ''),
        'angemeldet' => !!$b, 'benutzer' => $b,
        'marke' => Aufmass_Datenbank::marke(), 'version' => '1.0.0-test'));
}
if ($rest === '/anmelden' && $art === 'POST') {
    kopffeldPruefen();
    $e = Aufmass_Anmeldung::anmelden(isset($json['token']) ? $json['token'] : '');
    if (is_wp_error($e)) { fehler($e); }
    raus(array('benutzer' => $e['benutzer']));
}
if ($rest === '/abmelden' && $art === 'POST') {
    kopffeldPruefen(); Aufmass_Anmeldung::abmelden(); raus(array('ok' => true));
}
if ($rest === '/ich' && $art === 'GET') {
    raus(array('benutzer' => benutzerOderRaus(), 'marke' => Aufmass_Datenbank::marke()));
}
if ($rest === '/benutzer' && $art === 'GET') {
    benutzerOderRaus();
    global $wpdb;
    raus(array('benutzer' => $wpdb->get_results(
        'SELECT id, name, email, rolle FROM wp_aufmass_benutzer WHERE aktiv = 1 ORDER BY name', ARRAY_A)));
}
if ($rest === '/projekte' && $art === 'GET') {
    benutzerOderRaus();
    raus(Aufmass_Projekte::liste(isset($_GET['seit']) ? $_GET['seit'] : ''));
}
if (preg_match('#^/projekte/([A-Za-z0-9_-]{1,64})$#', $rest, $t)) {
    $id = $t[1];
    if ($art === 'GET') {
        benutzerOderRaus();
        $p = Aufmass_Projekte::laden($id);
        if (!$p) { raus(array('code' => 'unbekannt', 'message' => 'Nicht gefunden.'), 404); }
        raus($p);
    }
    if ($art === 'PUT') {
        kopffeldPruefen();
        $b = benutzerOderRaus();
        $e = Aufmass_Projekte::speichern($id, isset($json['daten']) ? $json['daten'] : null,
            isset($json['basisVersion']) ? $json['basisVersion'] : 0, $b);
        if (is_wp_error($e)) { fehler($e); }
        Aufmass_Fotos::verwaiste_aufraeumen($id, isset($json['daten']) ? $json['daten'] : array());
        raus($e);
    }
    if ($art === 'DELETE') {
        kopffeldPruefen();
        $e = Aufmass_Projekte::loeschen($id, benutzerOderRaus());
        if (is_wp_error($e)) { fehler($e); }
        raus($e);
    }
}
if (preg_match('#^/projekte/([A-Za-z0-9_-]{1,64})/zustaendige$#', $rest, $t) && $art === 'PUT') {
    kopffeldPruefen();
    $e = Aufmass_Projekte::zustaendige_setzen($t[1],
        isset($json['benutzer']) ? $json['benutzer'] : array(), benutzerOderRaus());
    if (is_wp_error($e)) { fehler($e); }
    raus(array('zustaendige' => $e));
}
if (preg_match('#^/projekte/([A-Za-z0-9_-]{1,64})/fotos$#', $rest, $t) && $art === 'GET') {
    benutzerOderRaus();
    raus(array('fotos' => Aufmass_Fotos::vorhandene($t[1])));
}
if (preg_match('#^/fotos/([A-Za-z0-9_-]{1,64})$#', $rest, $t)) {
    $id = $t[1];
    if ($art === 'GET') {
        benutzerOderRaus();
        $f = Aufmass_Fotos::holen($id);
        if (!$f) { raus(array('code' => 'unbekannt', 'message' => 'Foto nicht gefunden.'), 404); }
        http_response_code(200);
        header('Content-Type: ' . $f['mime']);
        header('Content-Length: ' . $f['groesse']);
        readfile($f['pfad']);
        exit;
    }
    if ($art === 'PUT') {
        kopffeldPruefen();
        $b = benutzerOderRaus();
        $projekt = isset($_GET['projekt']) ? $_GET['projekt'] : '';
        $darf = Aufmass_Projekte::darf_aendern($projekt, $b);
        if (is_wp_error($darf)) { fehler($darf); }
        $e = Aufmass_Fotos::speichern($id, $projekt, isset($_GET['tuer']) ? $_GET['tuer'] : '',
            $koerper, isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : 'image/jpeg', $b);
        if (is_wp_error($e)) { fehler($e); }
        raus($e);
    }
}
raus(array('message' => 'unbekannter Weg: ' . $art . ' ' . $rest), 404);
