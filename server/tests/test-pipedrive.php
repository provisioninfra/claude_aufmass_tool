<?php
/* Verschlüsselte Ablage und Weiterleitung an Pipedrive. */
require_once __DIR__ . '/wp-attrappe.php';

$ok = 0; $fehler = 0;
function pruefe($b, $t, $i = '') {
    global $ok, $fehler;
    if ($b) { $ok++; } else { $fehler++; echo "  FEHL $t" . ($i !== '' ? "\n         -> $i" : '') . "\n"; }
}
function fehlertext($e) { return is_wp_error($e) ? ($e->get_error_code() . ': ' . $e->get_error_message()) : gettype($e); }

update_option('aufmass_geheimnis', bin2hex(random_bytes(32)));
$TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';

echo "\n== Verschlüsselte Ablage ==\n";
$chiffre = Aufmass_Verschluesselung::verschluesseln($TOKEN);
pruefe($chiffre !== null && $chiffre !== $TOKEN, 'der Schlüssel wird verschlüsselt abgelegt', $chiffre);
pruefe(strpos($chiffre, $TOKEN) === false, 'der Klartext steht nicht im abgelegten Wert');
pruefe(Aufmass_Verschluesselung::entschluesseln($chiffre) === $TOKEN, 'und lässt sich wieder lesen');
$zweimal = Aufmass_Verschluesselung::verschluesseln($TOKEN);
pruefe($zweimal !== $chiffre, 'zweimal verschlüsselt ergibt zwei verschiedene Werte (zufällige Nonce)');
$manipuliert = substr($chiffre, 0, -4) . 'AAAA';
pruefe(Aufmass_Verschluesselung::entschluesseln($manipuliert) === null, 'ein manipulierter Wert ergibt nichts, keinen Müll');
pruefe(Aufmass_Verschluesselung::entschluesseln('') === null, 'leer ergibt nichts');
pruefe(Aufmass_Verschluesselung::entschluesseln('x9:unsinn') === null, 'unbekannte Form ergibt nichts');
pruefe(Aufmass_Verschluesselung::entschluesseln('s1:!!!') === null, 'kaputtes Base64 ergibt nichts');
/* Anderes Installationsgeheimnis -> unlesbar */
$geheim = get_option('aufmass_geheimnis');
update_option('aufmass_geheimnis', 'anderes');
pruefe(Aufmass_Verschluesselung::entschluesseln($chiffre) === null, 'mit anderem Installationsgeheimnis unlesbar');
update_option('aufmass_geheimnis', $geheim);
pruefe(Aufmass_Verschluesselung::entschluesseln($chiffre) === $TOKEN, 'mit dem richtigen wieder lesbar');
/* Andere Salts -> unlesbar: in einem eigenen Prozess, weil Konstanten feststehen */
$nachbar = escapeshellarg(__DIR__ . '/wp-attrappe.php');
$aus = shell_exec('AUFMASS_TEST_SALZ=anderes-salz php -r ' . escapeshellarg(
    'require ' . var_export(__DIR__ . '/wp-attrappe.php', true) . ';' .
    'update_option("aufmass_geheimnis", ' . var_export($geheim, true) . ');' .
    'var_export(Aufmass_Verschluesselung::entschluesseln(' . var_export($chiffre, true) . '));'));
pruefe(trim((string) $aus) === 'NULL', 'mit anderen wp-config-Salts ist der Wert unlesbar (Datenbank allein genügt nicht)', $aus);
pruefe(function_exists('sodium_crypto_secretbox') ? strpos($chiffre, 's1:') === 0 : strpos($chiffre, 'o1:') === 0,
    'das Verfahren ist gekennzeichnet (' . substr($chiffre, 0, 3) . ')');

echo "\n== Einrichtung ==\n";
pruefe(Aufmass_Pipedrive::eingerichtet() === false, 'ohne Schlüssel ist Pipedrive nicht eingerichtet');
pruefe(Aufmass_Pipedrive::token_setzen($TOKEN) === true, 'der Schlüssel lässt sich hinterlegen');
pruefe(Aufmass_Pipedrive::eingerichtet() === true, 'danach ist Pipedrive eingerichtet');
pruefe(get_option('aufmass_pipedrive_token') !== $TOKEN, 'in der Datenbank steht nicht der Klartext');
pruefe(Aufmass_Pipedrive::token_lesen() === $TOKEN, 'die Weiterleitung kann ihn lesen');
update_option('aufmass_pipedrive_token', 's1:AAAA');
pruefe(Aufmass_Pipedrive::token_unlesbar() === true, 'ein unlesbarer Schlüssel wird als solcher erkannt');
pruefe(Aufmass_Pipedrive::eingerichtet() === false, 'und gilt nicht als eingerichtet');
Aufmass_Pipedrive::token_setzen($TOKEN);
pruefe(Aufmass_Pipedrive::token_setzen('  ') === true && Aufmass_Pipedrive::eingerichtet() === false, 'leer setzen entfernt den Schlüssel');
Aufmass_Pipedrive::token_setzen($TOKEN);

echo "\n== Adresse ==\n";
update_option('aufmass_pipedrive_host', '');
pruefe(Aufmass_Pipedrive::host() === 'https://api.pipedrive.com', 'ohne Angabe die Standardadresse', Aufmass_Pipedrive::host());
update_option('aufmass_pipedrive_host', 'meinefirma.pipedrive.com');
pruefe(Aufmass_Pipedrive::host() === 'https://meinefirma.pipedrive.com', 'eine Firmenadresse wird übernommen');
update_option('aufmass_pipedrive_host', 'http://meinefirma.pipedrive.com/irgendwas?x=1');
pruefe(Aufmass_Pipedrive::host() === 'https://meinefirma.pipedrive.com', 'http nach außen wird zu https, Pfad fällt weg', Aufmass_Pipedrive::host());
update_option('aufmass_pipedrive_host', 'http://127.0.0.1:8189');
pruefe(Aufmass_Pipedrive::host() === 'http://127.0.0.1:8189', 'http bleibt nur auf dem eigenen Rechner (Prüfläufe)');
pruefe(Aufmass_Pipedrive::host_anzeige() === '127.0.0.1:8189', 'die Anzeige kommt ohne Schema');
update_option('aufmass_pipedrive_host', "boese.de\r\nX-Injected: 1");
pruefe(preg_match('/[\r\n ]/', Aufmass_Pipedrive::host()) === 0, 'Steuerzeichen fallen aus der Adresse', Aufmass_Pipedrive::host());
update_option('aufmass_pipedrive_host', '');

echo "\n== Weiterleitung: Positivliste ==\n";
$gesehen = array();
$GLOBALS['wp_remote_attrappe'] = function ($url, $args) use (&$gesehen) {
    $gesehen[] = array('url' => $url, 'args' => $args);
    return array('response' => array('code' => 200),
        'body' => json_encode(array('success' => true, 'data' => array('name' => 'Prüfer', 'api_token' => $GLOBALS['TOKEN_GLOBAL']))), 'headers' => array());
};
$GLOBALS['TOKEN_GLOBAL'] = $TOKEN;
foreach (array('v1/users/me', 'v2/pipelines', 'v2/stages', 'v2/deals', 'v2/deals/501', 'v2/organizations/90', 'v2/persons/70') as $weg) {
    $e = Aufmass_Pipedrive::anfrage($weg, array());
    pruefe(!is_wp_error($e) && $e['status'] === 200, 'erlaubt: ' . $weg, fehlertext($e));
}
foreach (array('v1/deals', 'v2/deals/501/followers', 'v2/users', 'v1/activities', '../wp-admin', 'v2/deals/abc', 'v2/persons/', 'v2/deals/1;rm') as $weg) {
    $e = Aufmass_Pipedrive::anfrage($weg, array());
    pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_erlaubt', 'abgewiesen: ' . $weg, fehlertext($e));
}
$vorher = count($gesehen);
Aufmass_Pipedrive::anfrage('v1/activities', array());
pruefe(count($gesehen) === $vorher, 'eine abgewiesene Abfrage erreicht Pipedrive gar nicht erst');

echo "\n== Weiterleitung: Schlüssel und Parameter ==\n";
$gesehen = array();
$e = Aufmass_Pipedrive::anfrage('v2/deals', array('pipeline_id' => '1', 'stage_id' => '12', 'status' => 'open',
    'limit' => '999', 'sort_by' => 'update_time', 'sort_direction' => 'desc',
    'api_token' => 'eingeschleust', 'fields' => 'alles', 'limit2' => '5', 'status2' => 'x'));
$letzte = $gesehen[count($gesehen) - 1];
pruefe(isset($letzte['args']['headers']['x-api-token']) && $letzte['args']['headers']['x-api-token'] === $TOKEN,
    'der Schlüssel geht im Kopffeld mit', json_encode($letzte['args']['headers']));
pruefe(strpos($letzte['url'], $TOKEN) === false, 'der Schlüssel steht nicht in der Adresse (Protokolle!)');
pruefe(strpos($letzte['url'], 'api_token') === false && strpos($letzte['url'], 'fields') === false,
    'fremde Parameter werden nicht durchgereicht', $letzte['url']);
pruefe(strpos($letzte['url'], 'limit=500') !== false, 'limit wird auf 500 gedeckelt', $letzte['url']);
pruefe(strpos($letzte['url'], 'pipeline_id=1') !== false && strpos($letzte['url'], 'sort_direction=desc') !== false,
    'erlaubte Parameter kommen an', $letzte['url']);
pruefe(strpos($letzte['url'], 'https://api.pipedrive.com/api/v2/deals?') === 0, 'die Adresse ist richtig gebaut', $letzte['url']);
$e = Aufmass_Pipedrive::anfrage('v2/deals', array('pipeline_id' => '1 OR 1=1', 'status' => 'open;drop'));
$letzte = $gesehen[count($gesehen) - 1];
pruefe(strpos($letzte['url'], 'pipeline_id') === false && strpos($letzte['url'], 'status') === false,
    'Parameter mit falscher Form fallen heraus', $letzte['url']);
pruefe(!is_wp_error($e) && !empty($e['daten']['data']) && $e['daten']['data']['api_token'] === '[entfernt]',
    'taucht der Schlüssel in Pipedrives Antwort auf, wird er getilgt', json_encode($e));
pruefe(strpos(json_encode($e), $TOKEN) === false, 'die Antwort an das Werkzeug enthält den Schlüssel nirgends');

echo "\n== Weiterleitung: Fehlerfälle ==\n";
$GLOBALS['wp_remote_attrappe'] = function () { return array('response' => array('code' => 401),
    'body' => json_encode(array('success' => false, 'error' => 'unauthorized access')), 'headers' => array()); };
$e = Aufmass_Pipedrive::anfrage('v1/users/me', array());
pruefe(!is_wp_error($e) && $e['status'] === 401 && $e['daten']['success'] === false,
    'Pipedrives 401 kommt als Status in der Antwort an - nicht als Abmeldung vom eigenen Server', json_encode($e));
$GLOBALS['wp_remote_attrappe'] = function () { return array('response' => array('code' => 429), 'body' => '', 'headers' => array()); };
$e = Aufmass_Pipedrive::anfrage('v1/users/me', array());
pruefe(!is_wp_error($e) && $e['status'] === 429, 'ein 429 wird durchgereicht');
$GLOBALS['wp_remote_attrappe'] = function () { return array('response' => array('code' => 200), 'body' => 'kein json', 'headers' => array()); };
$e = Aufmass_Pipedrive::anfrage('v1/users/me', array());
pruefe(!is_wp_error($e) && $e['status'] === 200, 'eine unlesbare Antwort stürzt nicht ab', fehlertext($e));
$GLOBALS['wp_remote_attrappe'] = function () { return new WP_Error('http', 'Verbindung abgelehnt'); };
$e = Aufmass_Pipedrive::anfrage('v1/users/me', array());
pruefe(is_wp_error($e) && $e->get_error_data()['status'] === 502, 'nicht erreichbar ergibt 502', fehlertext($e));
pruefe(strpos($e->get_error_message(), $TOKEN) === false, 'auch die Fehlermeldung nennt den Schlüssel nicht');
Aufmass_Pipedrive::token_setzen('');
$e = Aufmass_Pipedrive::anfrage('v1/users/me', array());
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_eingerichtet' && $e->get_error_data()['status'] === 503,
    'ohne Schlüssel meldet die Weiterleitung "nicht eingerichtet"', fehlertext($e));
update_option('aufmass_pipedrive_token', 's1:AAAA');
$e = Aufmass_Pipedrive::anfrage('v1/users/me', array());
pruefe(is_wp_error($e) && strpos($e->get_error_message(), 'nicht mehr lesbar') !== false,
    'ein unlesbarer Schlüssel wird benannt, nicht verschwiegen', fehlertext($e));
$GLOBALS['wp_remote_attrappe'] = null;

echo "\n== Der Schlüssel lässt sich auch beim ERSTEN Speichern hinterlegen ==\n";
/* WordPress prüft beim ersten Speichern zweimal (update_option -> add_option);
   der zweite Durchlauf bekommt die bereits verschlüsselte Fassung. */
if (!function_exists('add_settings_error')) { function add_settings_error() { $GLOBALS['aufmass_test_fehler'][] = func_get_args(); } }
require_once __DIR__ . '/../aufmass-sync/inc/einstellungen.php';
$GLOBALS['aufmass_test_fehler'] = array();
$klartext = 'abcdefghij1234567890ABCDEFGHIJ';
$erster = Aufmass_Einstellungen::pipedrive_token_pruefen($klartext);
$zweiter = Aufmass_Einstellungen::pipedrive_token_pruefen($erster);
pruefe(Aufmass_Verschluesselung::ist_chiffre($erster), 'der erste Durchlauf verschlüsselt', substr((string) $erster, 0, 12));
pruefe($zweiter === $erster, 'der zweite Durchlauf reicht die Chiffre unverändert durch', substr((string) $zweiter, 0, 12));
pruefe(count($GLOBALS['aufmass_test_fehler']) === 0, 'und meldet keinen Fehler', count($GLOBALS['aufmass_test_fehler']));
pruefe(Aufmass_Verschluesselung::entschluesseln($zweiter) === $klartext, 'gespeichert wird der richtige Schlüssel');
pruefe(!Aufmass_Verschluesselung::ist_chiffre('s1:nicht base64!!') && !Aufmass_Verschluesselung::ist_chiffre($klartext), 'ein Klartext gilt nie als Chiffre');

echo "\nErgebnis Pipedrive-Server: $ok ok, $fehler Fehler\n";
exit($fehler ? 1 : 0);
