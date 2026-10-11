<?php
/**
 * fake-pipedrive.php — Eine Attrappe von Pipedrive für Prüfläufe.
 *
 * Antwortet wie Pipedrives Schnittstelle auf die wenigen Wege, die das
 * Werkzeug benutzt. Nur mit dem richtigen Schlüssel im Kopffeld; alles
 * andere wird wie bei Pipedrive mit 401 abgewiesen. Jede Anfrage wird
 * in eine Datei geschrieben, damit ein Prüflauf nachsehen kann, was
 * wirklich ankam - und was nicht (etwa ein Schlüssel im Browser).
 *
 * Start:  php -S 127.0.0.1:8189 server/tests/fake-pipedrive.php
 */
$weg = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$erwartet = getenv('AUFMASS_TEST_PD_TOKEN') ?: 'pruefschluessel';
$kopf = isset($_SERVER['HTTP_X_API_TOKEN']) ? $_SERVER['HTTP_X_API_TOKEN'] : '';
$log = getenv('AUFMASS_TEST_PD_LOG');
if ($log) {
    file_put_contents($log, json_encode(array('weg' => $weg, 'query' => $_GET, 'token' => $kopf,
        'ua' => isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '')) . "\n", FILE_APPEND);
}
header('Content-Type: application/json');
function raus($d, $status = 200) { http_response_code($status); echo json_encode($d); exit; }

if ($kopf !== $erwartet) { raus(array('success' => false, 'error' => 'unauthorized access', 'errorCode' => 401), 401); }

if ($weg === '/api/v1/users/me') {
    raus(array('success' => true, 'data' => array('id' => 7, 'name' => 'Pipedrive Prüfer',
        'email' => 'pruefer@provision-infra.de', 'company_name' => 'Provision Infra GmbH',
        'company_id' => 42, 'company_domain' => 'provisioninfra', 'api_token' => $erwartet)));
}
if ($weg === '/api/v2/pipelines') {
    raus(array('success' => true, 'data' => array(
        array('id' => 1, 'name' => 'Neukunden Funnel', 'order_nr' => 1),
        array('id' => 2, 'name' => 'Bestandskunden', 'order_nr' => 2))));
}
if ($weg === '/api/v2/stages') {
    $pl = isset($_GET['pipeline_id']) ? (int) $_GET['pipeline_id'] : 0;
    raus(array('success' => true, 'data' => $pl === 1 ? array(
        array('id' => 11, 'name' => 'Erstkontakt', 'order_nr' => 1, 'pipeline_id' => 1),
        array('id' => 12, 'name' => 'Workshop / Aufmaß v.O.', 'order_nr' => 2, 'pipeline_id' => 1)) : array()));
}
if ($weg === '/api/v2/deals') {
    raus(array('success' => true, 'data' => array(
        array('id' => 501, 'title' => 'Bürogebäude Königsallee 47', 'status' => 'open', 'pipeline_id' => 1,
              'stage_id' => 12, 'org_id' => 90, 'person_id' => 70, 'update_time' => '2026-10-01T10:00:00Z',
              'add_time' => '2026-09-20T10:00:00Z', 'value' => 12000, 'currency' => 'EUR'),
        array('id' => 502, 'title' => 'Lagerhalle Hafen', 'status' => 'open', 'pipeline_id' => 1,
              'stage_id' => 11, 'org_id' => 91, 'person_id' => null, 'update_time' => '2026-10-02T10:00:00Z',
              'add_time' => '2026-09-25T10:00:00Z', 'value' => 4000, 'currency' => 'EUR'))));
}
if (preg_match('#^/api/v2/deals/(\d+)$#', $weg, $t)) {
    raus(array('success' => true, 'data' => array('id' => (int) $t[1], 'title' => 'Deal ' . $t[1], 'status' => 'open',
        'pipeline_id' => 1, 'stage_id' => 12, 'org_id' => 90, 'person_id' => 70)));
}
if (preg_match('#^/api/v2/organizations/(\d+)$#', $weg, $t)) {
    raus(array('success' => true, 'data' => array('id' => (int) $t[1], 'name' => 'Müller & Söhne GmbH',
        'address' => array('value' => 'Königsallee 47, 40212 Düsseldorf', 'street_number' => '47',
            'route' => 'Königsallee', 'postal_code' => '40212', 'locality' => 'Düsseldorf'))));
}
if (preg_match('#^/api/v2/persons/(\d+)$#', $weg, $t)) {
    raus(array('success' => true, 'data' => array('id' => (int) $t[1], 'name' => 'Dr. Schäfer',
        'phones' => array(array('value' => '0211 55 44 33-0', 'primary' => true)),
        'emails' => array(array('value' => 'schaefer@mueller-soehne.example', 'primary' => true)), 'org_id' => 90)));
}
raus(array('success' => false, 'error' => 'not found'), 404);
