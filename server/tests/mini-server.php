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
/* Der Kurzlink: wie WordPress ihn über die Umschreibregel bzw. die
   Abfragevariable auflöst - eine Weiterleitung auf die Freigabeseite. */
if (preg_match('#^/f/([A-Za-z0-9]{1,32})/?$#', $weg, $t) || ($weg === '/' && isset($_GET['aufmass_f']))) {
    $code = isset($t[1]) ? $t[1] : $_GET['aufmass_f'];
    $ziel = Aufmass_Freigaben::umleitung_ziel($code);
    if ($ziel === '') { raus(array('message' => 'unbekannter Kurzlink'), 404); }
    http_response_code(302);
    header('Location: ' . $ziel);
    exit;
}
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
    $aus = array('eingerichtet' => get_option('aufmass_client_id', '') !== '',
        'clientId' => get_option('aufmass_client_id', ''),
        'domaene' => get_option('aufmass_domaene', ''),
        'angemeldet' => !!$b, 'benutzer' => $b,
        'marke' => Aufmass_Datenbank::marke());
    /* Wie im Plugin: Anbindungen und Fassung nur für Angemeldete */
    if ($b) {
        $aus['pipedrive'] = Aufmass_Pipedrive::eingerichtet();
        $aus['pipedriveHost'] = $aus['pipedrive'] ? Aufmass_Pipedrive::host_anzeige() : '';
        $aus['version'] = '1.2.0-test';
    }
    raus($aus);
}
if (preg_match('#^/pipedrive/(v[12]/[A-Za-z0-9_/]{1,80})$#', $rest, $t) && $art === 'GET') {
    benutzerOderRaus();
    $e = Aufmass_Pipedrive::anfrage($t[1], $_GET);
    if (is_wp_error($e)) { fehler($e); }
    raus($e);
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
    $b = benutzerOderRaus();
    $d = Aufmass_Projekte::liste(isset($_GET['seit']) ? $_GET['seit'] : '');
    $d['pipedrive'] = Aufmass_Pipedrive::eingerichtet();
    $d['pipedriveHost'] = $d['pipedrive'] ? Aufmass_Pipedrive::host_anzeige() : '';
    $d['antworten'] = Aufmass_Freigaben::offene_fuer($b);
    raus($d);
}
/* --- Kundenfreigabe --- */
if ($rest === '/freigaben' && $art === 'GET') {
    benutzerOderRaus();
    if (empty($_GET['projekt'])) { raus(array('code' => 'projekt_fehlt', 'message' => 'Für welches Aufmaß?'), 400); }
    raus(array('freigaben' => Aufmass_Freigaben::liste($_GET['projekt'])));
}
if ($rest === '/freigaben' && $art === 'POST') {
    kopffeldPruefen();
    $b = benutzerOderRaus();
    $e = Aufmass_Freigaben::anlegen(isset($json['projektId']) ? $json['projektId'] : '',
        isset($json['daten']) ? $json['daten'] : null, isset($json['seite']) ? $json['seite'] : '', $b,
        !empty($json['vorlegen']));
    if (is_wp_error($e)) { fehler($e); }
    raus($e);
}
if (preg_match('#^/freigaben/([A-Za-z0-9]{6,16})/vorlegen$#', $rest, $t) && $art === 'POST') {
    kopffeldPruefen();
    $b = benutzerOderRaus();
    $e = Aufmass_Freigaben::vorlegen($t[1], isset($json['daten']) ? $json['daten'] : null, $b);
    if (is_wp_error($e)) { fehler($e); }
    raus(array('freigabe' => $e));
}
if (preg_match('#^/freigaben/([A-Za-z0-9]{6,16})/freigeben$#', $rest, $t) && $art === 'POST') {
    kopffeldPruefen();
    if (strlen($koerper) > Aufmass_Freigaben::KOERPER_MAX) {
        raus(array('code' => 'zu_gross', 'message' => 'Die Anfrage ist zu umfangreich.'), 413);
    }
    $e = Aufmass_Freigaben::freigeben($t[1], isset($json['name']) ? $json['name'] : '',
        isset($json['funktion']) ? $json['funktion'] : '', isset($json['anmerkung']) ? $json['anmerkung'] : '');
    if (is_wp_error($e)) { fehler($e); }
    raus($e);
}
if (preg_match('#^/freigaben/([A-Za-z0-9]{6,16})$#', $rest, $t) && $art === 'GET') {
    $e = Aufmass_Freigaben::oeffentlich($t[1]);
    if (is_wp_error($e)) { fehler($e); }
    raus($e);
}
if (preg_match('#^/freigaben/([A-Za-z0-9]{6,16})/antwort$#', $rest, $t) && $art === 'POST') {
    kopffeldPruefen();
    if (strlen($koerper) > Aufmass_Freigaben::KOERPER_MAX) {
        raus(array('code' => 'zu_gross', 'message' => 'Die Rückmeldung ist zu umfangreich.'), 413);
    }
    $e = Aufmass_Freigaben::antwort_annehmen($t[1], isset($json['antwort']) ? $json['antwort'] : null,
        isset($json['name']) ? $json['name'] : '', isset($json['anmerkung']) ? $json['anmerkung'] : '');
    if (is_wp_error($e)) { fehler($e); }
    raus($e);
}
if (preg_match('#^/freigaben/([A-Za-z0-9]{6,16})/(uebernommen|verwerfen|zurueckziehen)$#', $rest, $t) && $art === 'POST') {
    kopffeldPruefen();
    $b = benutzerOderRaus();
    $nr = isset($json['antwortNr']) ? (int) $json['antwortNr'] : 0;
    if ($t[2] === 'uebernommen') { $e = Aufmass_Freigaben::uebernommen_markieren($t[1], $nr, $b); }
    elseif ($t[2] === 'verwerfen') { $e = Aufmass_Freigaben::verwerfen($t[1], $nr, $b); }
    else { $e = Aufmass_Freigaben::zurueckziehen($t[1], $b); }
    if (is_wp_error($e)) { fehler($e); }
    raus(array('freigabe' => $e));
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
