<?php
/**
 * fake-openai.php — Eine Attrappe von OpenAI für Prüfläufe.
 *
 * Antwortet auf die zwei Wege, die das Plugin benutzt (Erkennung und
 * Zuordnung) sowie auf die Modellliste - nur mit dem richtigen Schlüssel,
 * sonst 401 wie bei OpenAI. Jede Anfrage wird protokolliert, damit ein
 * Prüflauf nachsehen kann, was wirklich ankam: welche Datei, welches
 * Modell, welche Sprache, welches Schema - und was nicht (der Schlüssel
 * im Browser).
 *
 * Start:  php -S 127.0.0.1:8190 server/tests/fake-openai.php
 */
$weg = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$erwartet = getenv('AUFMASS_TEST_OAI_KEY') ?: 'sk-pruefschluessel';
$auth = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
$log = getenv('AUFMASS_TEST_OAI_LOG');
$roh = file_get_contents('php://input');
$ua = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
function raus($d, $status = 200) {
    http_response_code($status); header('Content-Type: application/json');
    echo json_encode($d, JSON_UNESCAPED_UNICODE); exit;
}
function protokoll($eintrag) {
    global $log, $weg, $ua;
    if ($log) { file_put_contents($log, json_encode(array_merge(array('weg' => $weg, 'ua' => $ua), $eintrag), JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND); }
}
if ($auth !== 'Bearer ' . $erwartet) {
    protokoll(array('fehler' => 'auth', 'auth' => substr($auth, 0, 12)));
    raus(array('error' => array('message' => 'Incorrect API key provided', 'type' => 'invalid_request_error', 'code' => 'invalid_api_key')), 401);
}
if ($weg === '/v1/models' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    protokoll(array());
    raus(array('object' => 'list', 'data' => array(
        array('id' => 'gpt-4o-transcribe', 'object' => 'model'), array('id' => 'gpt-4.1-mini', 'object' => 'model'),
        array('id' => 'whisper-1', 'object' => 'model'))));
}
if ($weg === '/v1/audio/transcriptions' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $datei = isset($_FILES['file']) ? $_FILES['file'] : null;
    protokoll(array('modell' => isset($_POST['model']) ? $_POST['model'] : '', 'sprache' => isset($_POST['language']) ? $_POST['language'] : '',
        'prompt' => isset($_POST['prompt']) ? substr($_POST['prompt'], 0, 600) : '',
        'datei' => $datei ? array('name' => $datei['name'], 'typ' => $datei['type'], 'groesse' => (int) $datei['size']) : null));
    if (!$datei || (int) $datei['size'] < 1) {
        raus(array('error' => array('message' => 'Audio file might be corrupted or unsupported', 'type' => 'invalid_request_error')), 400);
    }
    raus(array('text' => getenv('AUFMASS_TEST_OAI_TEXT') ?: 'Tür Nummer 7, Büro Empfang, Halbzylinder 35 10, DIN links, Beschlag Rosettengarnitur Drücker Drücker, Dornmaß 55, Wandleser außen vorhanden, Kabel liegt schon.'));
}
if ($weg === '/v1/chat/completions' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $json = json_decode($roh, true);
    $schema = isset($json['response_format']['json_schema']['schema']) ? $json['response_format']['json_schema']['schema'] : array();
    $eig = isset($schema['properties']) && is_array($schema['properties']) ? $schema['properties'] : array();
    $nachrichten = isset($json['messages']) ? $json['messages'] : array();
    $letzte = count($nachrichten) ? $nachrichten[count($nachrichten) - 1] : array();
    protokoll(array('modell' => isset($json['model']) ? $json['model'] : '',
        'strict' => !empty($json['response_format']['json_schema']['strict']),
        'felder' => count($eig), 'pflicht' => isset($schema['required']) ? count($schema['required']) : 0,
        'text' => isset($letzte['content']) ? substr($letzte['content'], 0, 160) : ''));
    /* Wie ein striktes Modell: jedes Feld kommt vor, meist leer. */
    $aus = array();
    foreach ($eig as $name => $def) { $aus[$name] = (isset($def['type']) && $def['type'] === 'array') ? array() : null; }
    $vorgabe = array('nummer' => '7', 'bezeichnung' => 'Büro Empfang', 'zylinderBauform' => 'Halbzylinder',
        'masseAussen' => 35, 'masseInnen' => 10, 'dinRichtung' => 'DIN links', 'beschlagBauform' => 'Rosettengarnitur',
        'beschlagBestueckung' => 'Drücker / Drücker', 'dornmass' => 55, 'brauchtWandleser' => true,
        'brauchtBeschlag' => true, 'offen' => array('Kabel liegt schon'));
    foreach ($vorgabe as $k => $w) { if (array_key_exists($k, $aus)) { $aus[$k] = $w; } }
    raus(array('id' => 'chatcmpl-pruef', 'object' => 'chat.completion', 'model' => isset($json['model']) ? $json['model'] : '',
        'choices' => array(array('index' => 0, 'finish_reason' => 'stop',
            'message' => array('role' => 'assistant', 'content' => json_encode($aus, JSON_UNESCAPED_UNICODE)))),
        'usage' => array('prompt_tokens' => 10, 'completion_tokens' => 10, 'total_tokens' => 20)));
}
raus(array('error' => array('message' => 'not found')), 404);
