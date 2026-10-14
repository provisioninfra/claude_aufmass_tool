<?php
/* Tür einsprechen: Schlüsselablage, Schema, Erkennung und Zuordnung über
 * eine Attrappe von OpenAI, Grenzen und Fehlerbilder. */
require_once __DIR__ . '/wp-attrappe.php';

$ok = 0; $fehler = 0;
function pruefe($b, $t, $i = '') {
    global $ok, $fehler;
    if ($b) { $ok++; echo "  OK   $t\n"; } else { $fehler++; echo "  FEHL $t" . ($i !== '' ? "\n         -> $i" : '') . "\n"; }
}
function fehlertext($e) { return is_wp_error($e) ? ($e->get_error_code() . ': ' . $e->get_error_message()) : (is_array($e) ? json_encode($e, JSON_UNESCAPED_UNICODE) : gettype($e)); }
function status_von($e) { $d = is_wp_error($e) ? $e->get_error_data() : null; return is_array($d) && isset($d['status']) ? $d['status'] : 0; }

update_option('aufmass_geheimnis', bin2hex(random_bytes(32)));
$SCHLUESSEL = 'sk-proj-PruefSchluessel1234567890abcdefghij';
$BENUTZER = array('id' => 'u-diktat', 'name' => 'D. Diktat', 'email' => 'd.diktat@provision-infra.de');

/* Die Attrappe: merkt sich jede Anfrage und gibt vorbereitete Antworten der Reihe nach zurück. */
$rufe = array(); $antworten = array();
$GLOBALS['wp_remote_attrappe'] = function ($url, $args) use (&$rufe, &$antworten) {
    $rufe[] = array('url' => $url, 'args' => $args);
    $a = array_shift($antworten);
    if ($a === null) { return array('response' => array('code' => 500), 'body' => '{"error":{"message":"keine Antwort vorbereitet"}}', 'headers' => array()); }
    if (is_wp_error($a)) { return $a; }
    return array('response' => array('code' => $a[0]), 'body' => is_string($a[1]) ? $a[1] : json_encode($a[1], JSON_UNESCAPED_UNICODE), 'headers' => array());
};
function antwort_text($t) { return array(200, array('text' => $t)); }
function antwort_chat($inhalt) {
    return array(200, array('choices' => array(array('index' => 0, 'message' => array('role' => 'assistant',
        'content' => is_string($inhalt) ? $inhalt : json_encode($inhalt, JSON_UNESCAPED_UNICODE))))));
}
function zuruecksetzen() {
    global $rufe, $antworten;
    $rufe = array(); $antworten = array();
    /* Drosseln zurücksetzen */
    wp_zwischen_laden(); $GLOBALS['wp_zwischen'] = array(); wp_zwischen_sichern();
}

$FELDER = array(
    array('name' => 'bezeichnung', 'typ' => 'text', 'frage' => 'Bezeichnung oder Raum'),
    array('name' => 'zylinderBauform', 'typ' => 'wahl', 'frage' => 'Bauform des Zylinders', 'werte' => array('Doppelzylinder', 'Halbzylinder', 'Knaufzylinder')),
    array('name' => 'masseAussen', 'typ' => 'zahl', 'frage' => 'Länge außen in mm'),
    array('name' => 'masseInnen', 'typ' => 'zahl', 'frage' => 'Länge innen in mm'),
    array('name' => 'dinRichtung', 'typ' => 'wahl', 'frage' => 'DIN-Richtung', 'werte' => array('DIN links', 'DIN rechts')),
    array('name' => 'zylinderAusfuehrung', 'typ' => 'mehrfach', 'frage' => 'Ausführung', 'werte' => array('BSZ (beidseitig schließbar)', 'VdS', 'SKG'), 'hinweis' => 'Not- und Gefahrenfunktion = BSZ'),
    array('name' => 'brauchtWandleser', 'typ' => 'ja_nein', 'frage' => 'Wandleser vorhanden'),
    array('name' => 'notiz', 'typ' => 'text', 'frage' => 'Bemerkung')
);
$TON = str_repeat("\x1a\x45\xdf\xa3", 400);   /* irgendwelche Bytes - die Attrappe hört nicht zu */

echo "\n== Einrichtung ==\n";
pruefe(Aufmass_Diktat::eingerichtet() === false, 'ohne Schlüssel ist das Einsprechen nicht eingerichtet');
$e = Aufmass_Diktat::verarbeiten(array('tonBytes' => $TON, 'tonMime' => 'audio/webm', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_eingerichtet' && status_von($e) === 503, 'dann wird ein Diktat mit 503 abgewiesen', fehlertext($e));
pruefe(count($rufe) === 0, 'und OpenAI wird gar nicht erst gefragt');
pruefe(Aufmass_Diktat::schluessel_setzen($SCHLUESSEL) === true && Aufmass_Diktat::eingerichtet() === true, 'der Schlüssel lässt sich hinterlegen');
pruefe(get_option('aufmass_openai_schluessel') !== $SCHLUESSEL && strpos((string) get_option('aufmass_openai_schluessel'), $SCHLUESSEL) === false, 'in der Datenbank steht nicht der Klartext');
pruefe(Aufmass_Diktat::schluessel_lesen() === $SCHLUESSEL, 'der Server kann ihn lesen');
update_option('aufmass_openai_schluessel', 's1:AAAA');
pruefe(Aufmass_Diktat::schluessel_unlesbar() === true && Aufmass_Diktat::eingerichtet() === false, 'ein unlesbarer Schlüssel gilt nicht als eingerichtet');
$e = Aufmass_Diktat::verarbeiten(array('tonBytes' => $TON, 'tonMime' => 'audio/webm', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && strpos($e->get_error_message(), 'nicht mehr lesbar') !== false, 'und die Meldung sagt das', fehlertext($e));
Aufmass_Diktat::schluessel_setzen($SCHLUESSEL);
pruefe(Aufmass_Diktat::schluessel_setzen('') === true && Aufmass_Diktat::eingerichtet() === false, 'leer setzen entfernt den Schlüssel');
Aufmass_Diktat::schluessel_setzen($SCHLUESSEL);

echo "\n== Adresse und Modelle ==\n";
update_option('aufmass_openai_host', '');
pruefe(Aufmass_Diktat::host() === 'https://api.openai.com', 'ohne Angabe api.openai.com', Aufmass_Diktat::host());
update_option('aufmass_openai_host', 'eu.api.openai.com');
pruefe(Aufmass_Diktat::host() === 'https://eu.api.openai.com', 'die EU-Adresse wird übernommen');
update_option('aufmass_openai_host', 'http://boese.example/pfad');
pruefe(Aufmass_Diktat::host() === 'https://boese.example', 'http wird zu https, ein Pfad fällt weg', Aufmass_Diktat::host());
update_option('aufmass_openai_host', 'http://127.0.0.1:8190');
pruefe(Aufmass_Diktat::host() === 'http://127.0.0.1:8190', 'nur der eigene Rechner darf http (Prüfläufe)');
update_option('aufmass_openai_host', '');
pruefe(Aufmass_Diktat::modell('erkennung') === 'gpt-4o-transcribe' && Aufmass_Diktat::modell('zuordnung') === 'gpt-4.1-mini', 'die Modelle haben Vorgaben');
update_option('aufmass_diktat_modell_zuordnung', 'gpt-5-mini');
pruefe(Aufmass_Diktat::modell('zuordnung') === 'gpt-5-mini', 'ein eigener Modellname wird übernommen');
update_option('aufmass_diktat_modell_zuordnung', 'gpt 5; rm -rf');
pruefe(Aufmass_Diktat::modell('zuordnung') === 'gpt-4.1-mini', 'ein unbrauchbarer Name fällt auf die Vorgabe zurück');
update_option('aufmass_diktat_modell_zuordnung', '');

echo "\n== Das Feldschema ==\n";
$s = Aufmass_Diktat::schema_pruefen(json_encode($FELDER));
pruefe(is_array($s) && count($s) === 8 && $s[1]['werte'][1] === 'Halbzylinder' && $s[5]['hinweis'] === 'Not- und Gefahrenfunktion = BSZ', 'ein gutes Schema geht als JSON-Text durch', fehlertext($s));
pruefe($s[0]['frage'] === 'Bezeichnung oder Raum' && $s[0]['werte'] === array(), 'Textfelder haben keine Werte');
$e = Aufmass_Diktat::schema_pruefen(array());
pruefe(is_wp_error($e) && status_von($e) === 400, 'ein leeres Schema wird abgewiesen');
$e = Aufmass_Diktat::schema_pruefen(array(array('name' => 'x', 'typ' => 'wahl')));
pruefe(is_wp_error($e) && strpos($e->get_error_message(), 'fehlen die Werte') !== false, 'ein Auswahlfeld ohne Werte wird abgewiesen', fehlertext($e));
$e = Aufmass_Diktat::schema_pruefen(array(array('name' => 'offen', 'typ' => 'text')));
pruefe(is_wp_error($e), 'der Name „offen“ ist reserviert');
$e = Aufmass_Diktat::schema_pruefen(array(array('name' => 'a', 'typ' => 'text'), array('name' => 'a', 'typ' => 'zahl')));
pruefe(is_wp_error($e), 'doppelte Namen werden abgewiesen');
$e = Aufmass_Diktat::schema_pruefen(array(array('name' => '1abc', 'typ' => 'text')));
pruefe(is_wp_error($e), 'ein Name muss mit einem Buchstaben beginnen');
$e = Aufmass_Diktat::schema_pruefen(array(array('name' => 'a', 'typ' => 'datum')));
pruefe(is_wp_error($e), 'eine unbekannte Feldart wird abgewiesen');
$viele = array(); for ($i = 0; $i < 81; $i++) { $viele[] = array('name' => 'f' . $i, 'typ' => 'text'); }
$e = Aufmass_Diktat::schema_pruefen($viele);
pruefe(is_wp_error($e) && strpos($e->get_error_message(), 'zu viele') !== false, '81 Felder sind zu viele');
$s = Aufmass_Diktat::schema_pruefen(array(array('name' => 'w', 'typ' => 'wahl', 'werte' => array(' A ', 'A', '', "B\x01", 42), 'frage' => str_repeat('F', 200), 'hinweis' => "H\nI")));
pruefe(is_array($s) && $s[0]['werte'] === array('A', 'B', '42') && strlen($s[0]['frage']) === 120, 'Werte werden bereinigt und entdoppelt, die Frage gekürzt', json_encode($s));
$w = Aufmass_Diktat::woerter_pruefen(json_encode(array('Keyota-Leser', 'EVVA AirKey', '<script>', 'x', str_repeat('y', 50), 'Keyota-Leser')));
pruefe($w === array('Keyota-Leser', 'EVVA AirKey'), 'eigene Fachwörter: nur Wörter, entdoppelt, nichts Technisches', json_encode($w));

echo "\n== Das JSON-Schema für OpenAI ==\n";
$felder = Aufmass_Diktat::schema_pruefen($FELDER);
$js = Aufmass_Diktat::schema_bauen($felder);
pruefe($js['type'] === 'object' && $js['additionalProperties'] === false, 'ein Objekt ohne Zusätze');
pruefe(count($js['required']) === 9 && in_array('offen', $js['required'], true), 'jedes Feld ist Pflicht, dazu „offen“ (strict)');
pruefe($js['properties']['zylinderBauform']['anyOf'][0]['enum'] === array('Doppelzylinder', 'Halbzylinder', 'Knaufzylinder')
    && $js['properties']['zylinderBauform']['anyOf'][1]['type'] === 'null', 'ein Auswahlfeld ist Aufzählung oder null');
pruefe($js['properties']['zylinderAusfuehrung']['type'] === 'array' && $js['properties']['zylinderAusfuehrung']['items']['enum'][1] === 'VdS', 'ein Mehrfachfeld ist eine Liste aus der Aufzählung');
pruefe(strpos($js['properties']['zylinderAusfuehrung']['description'], 'Not- und Gefahrenfunktion') !== false, 'der Hinweis steht in der Beschreibung');
pruefe($js['properties']['masseAussen']['anyOf'][0]['type'] === 'number' && $js['properties']['brauchtWandleser']['anyOf'][0]['type'] === 'boolean', 'Zahl und Ja/Nein haben ihre Typen');

echo "\n== Ein Diktat: Ton -> Text -> Felder ==\n";
zuruecksetzen();
$antworten[] = antwort_text('Büro Empfang, Halbzylinder fünfunddreißig zehn, DIN links, mit VdS, Wandleser ist da, Kabel liegt schon.');
$antworten[] = antwort_chat(array('bezeichnung' => '  Büro Empfang ', 'zylinderBauform' => 'Halbzylinder', 'masseAussen' => 35, 'masseInnen' => '10',
    'dinRichtung' => 'din links', 'zylinderAusfuehrung' => array('vds', 'Unsinn', 'VdS'), 'brauchtWandleser' => true,
    'notiz' => str_repeat('x', 600), 'erfunden' => 'nein', 'offen' => array('Kabel liegt schon', 42, ' Tür klemmt ', 'Kabel liegt schon')));
$e = Aufmass_Diktat::verarbeiten(array('tonBytes' => $TON, 'tonMime' => 'audio/webm;codecs=opus', 'felder' => json_encode($FELDER),
    'woerter' => json_encode(array('Keyota-Leser'))), $BENUTZER);
pruefe(!is_wp_error($e), 'das Diktat geht durch', fehlertext($e));
pruefe(count($rufe) === 2, 'zwei Anfragen an OpenAI: Erkennung und Zuordnung', (string) count($rufe));
$r1 = $rufe[0]; $r2 = isset($rufe[1]) ? $rufe[1] : array('url' => '', 'args' => array());
pruefe($r1['url'] === 'https://api.openai.com/v1/audio/transcriptions' && $r1['args']['method'] === 'POST', 'die Erkennung geht an audio/transcriptions', $r1['url']);
pruefe($r1['args']['headers']['Authorization'] === 'Bearer ' . $SCHLUESSEL, 'mit dem Schlüssel im Kopffeld - vom Server gesetzt');
pruefe(strpos($r1['args']['headers']['Content-Type'], 'multipart/form-data; boundary=') === 0, 'als Formular mit Datei');
$k = $r1['args']['body'];
pruefe(strpos($k, 'name="file"; filename="aufnahme.webm"') !== false && strpos($k, 'Content-Type: audio/webm') !== false, 'die Datei heißt nach ihrem Format (ohne codecs-Zusatz)');
pruefe(strpos($k, $TON) !== false, 'und enthält die Aufnahme');
pruefe(preg_match('/name="model"\r\n\r\ngpt-4o-transcribe\r\n/', $k) === 1 && preg_match('/name="language"\r\n\r\nde\r\n/', $k) === 1, 'Modell und Sprache Deutsch sind gesetzt');
pruefe(strpos($k, 'Dornmaß') !== false && strpos($k, 'Keyota-Leser') !== false, 'die Fachwörter samt eigenen Begriffen sind die Vorgabe');
pruefe((int) $r1['args']['timeout'] >= 60 && strpos($r1['args']['user-agent'], 'Aufmass-Werkzeug/') === 0, 'mit Geduld und der Kennung des Servers');
pruefe($r2['url'] === 'https://api.openai.com/v1/chat/completions' && $r2['args']['headers']['Content-Type'] === 'application/json', 'die Zuordnung geht an chat/completions');
$j = json_decode($r2['args']['body'], true);
pruefe($j['model'] === 'gpt-4.1-mini' && $j['temperature'] === 0, 'mit dem Zuordnungsmodell und Temperatur 0');
pruefe($j['response_format']['type'] === 'json_schema' && $j['response_format']['json_schema']['strict'] === true
    && count($j['response_format']['json_schema']['schema']['properties']) === 9, 'mit striktem JSON-Schema aus den Feldern');
pruefe($j['messages'][0]['role'] === 'system' && strpos($j['messages'][0]['content'], 'Nichts erfinden') !== false, 'die Anweisung verbietet Erfinden');
pruefe(strpos($j['messages'][1]['content'], 'Halbzylinder fünfunddreißig zehn') !== false, 'der erkannte Text ist die Eingabe');
pruefe($e['text'] === 'Büro Empfang, Halbzylinder fünfunddreißig zehn, DIN links, mit VdS, Wandleser ist da, Kabel liegt schon.', 'der erkannte Text kommt zurück');
$f = $e['felder'];
pruefe($f['bezeichnung'] === 'Büro Empfang', 'Text wird getrimmt', json_encode($f));
pruefe($f['zylinderBauform'] === 'Halbzylinder' && $f['masseAussen'] === 35 && $f['masseInnen'] === 10, 'Auswahl und Zahlen kommen an (auch eine Zahl als Text)');
pruefe($f['dinRichtung'] === 'DIN links', 'Groß- und Kleinschreibung wird auf den erlaubten Wert gezogen');
pruefe($f['zylinderAusfuehrung'] === array('VdS'), 'Mehrfach: nur erlaubte Werte, entdoppelt', json_encode($f['zylinderAusfuehrung']));
pruefe($f['brauchtWandleser'] === true, 'Ja/Nein kommt als Wahrheitswert');
pruefe(strlen($f['notiz']) === 500, 'ein langer Text wird gekürzt');
pruefe(!isset($f['erfunden']), 'ein erfundenes Feld fällt weg');
pruefe($e['offen'] === array('Kabel liegt schon', 'Tür klemmt'), 'offene Angaben: nur Texte, getrimmt, entdoppelt', json_encode($e['offen']));
pruefe(strpos(json_encode($e), $SCHLUESSEL) === false, 'der Schlüssel steht nirgends im Ergebnis');

echo "\n== Nur Text (nach einer Korrektur im Werkzeug) ==\n";
zuruecksetzen();
$antworten[] = antwort_chat(array('bezeichnung' => 'Lager', 'offen' => array()));
$e = Aufmass_Diktat::verarbeiten(array('text' => "  Lager \x00 hinten ", 'felder' => $FELDER), $BENUTZER);
pruefe(!is_wp_error($e) && count($rufe) === 1 && strpos($rufe[0]['url'], 'chat/completions') !== false, 'ein Text wird ohne Erkennung direkt zugeordnet', fehlertext($e));
pruefe($e['text'] === 'Lager hinten' && $e['felder'] === array('bezeichnung' => 'Lager') && $e['offen'] === array(), 'Steuerzeichen fliegen raus, das Ergebnis ist schlank', json_encode($e));
pruefe(!isset($e['felder']['brauchtWandleser']), 'null-Werte des Modells erscheinen nicht');
$e = Aufmass_Diktat::verarbeiten(array('text' => '   ', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'keine_aufnahme' && status_von($e) === 400, 'weder Ton noch Text: 400', fehlertext($e));

echo "\n== Was das Modell auch noch sagen könnte ==\n";
zuruecksetzen();
$antworten[] = antwort_chat('das ist kein JSON');
$e = Aufmass_Diktat::verarbeiten(array('text' => 'Lager', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'unbrauchbar' && status_von($e) === 502, 'kein JSON: 502 unbrauchbar', fehlertext($e));
$antworten[] = array(200, array('choices' => array(array('message' => array('role' => 'assistant', 'content' => null, 'refusal' => 'Ich kann dabei nicht helfen.')))));
$e = Aufmass_Diktat::verarbeiten(array('text' => 'Lager', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'abgelehnt' && status_von($e) === 422, 'eine Weigerung des Modells: 422', fehlertext($e));
$antworten[] = array(200, array('choices' => array(array('message' => array('role' => 'assistant', 'content' => array(array('type' => 'text', 'text' => '{"bezeichnung":"Flur","offen":[]}')))))));
$e = Aufmass_Diktat::verarbeiten(array('text' => 'Flur', 'felder' => $FELDER), $BENUTZER);
pruefe(!is_wp_error($e) && $e['felder'] === array('bezeichnung' => 'Flur'), 'Inhalt in Teilen wird zusammengesetzt', fehlertext($e));
$antworten[] = antwort_chat(array('masseAussen' => 'fünfunddreißig', 'masseInnen' => 1e12, 'brauchtWandleser' => 'true', 'zylinderBauform' => 7, 'offen' => 'kein Array'));
$e = Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), $BENUTZER);
pruefe(!is_wp_error($e) && $e['felder'] === array() && $e['offen'] === array(), 'unpassende Typen fallen alle weg', fehlertext($e));

echo "\n== Die Erkennung: Grenzen ==\n";
zuruecksetzen();
$e = Aufmass_Diktat::verarbeiten(array('tonBytes' => str_repeat('a', Aufmass_Diktat::TON_MAX + 1), 'tonMime' => 'audio/webm', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && status_von($e) === 413, 'mehr als 10 MB: 413', fehlertext($e));
$e = Aufmass_Diktat::verarbeiten(array('tonBytes' => $TON, 'tonMime' => 'video/mp4', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && status_von($e) === 415, 'ein fremdes Format: 415', fehlertext($e));
$e = Aufmass_Diktat::verarbeiten(array('tonBytes' => '', 'tonMime' => 'audio/webm', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && status_von($e) === 400, 'eine leere Aufnahme: 400', fehlertext($e));
pruefe(count($rufe) === 0, 'OpenAI wurde dafür nie bemüht');
$e = Aufmass_Diktat::verarbeiten(array('ton' => array('error' => 3, 'size' => 10, 'tmp_name' => '', 'type' => 'audio/mp4'), 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && status_von($e) === 400 && $e->get_error_code() === 'keine_aufnahme', 'ein abgebrochener Upload: 400', fehlertext($e));
$e = Aufmass_Diktat::verarbeiten(array('ton' => array('error' => 1, 'size' => 10, 'tmp_name' => '', 'type' => 'audio/mp4'), 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && status_von($e) === 413 && $e->get_error_code() === 'zu_gross', 'ein vom Server abgewiesener Upload (zu groß für PHP): 413 mit Hinweis', fehlertext($e));
pruefe(count($rufe) === 0, 'auch dafür wurde OpenAI nicht bemüht');
$tmp = tempnam(sys_get_temp_dir(), 'ton'); file_put_contents($tmp, $TON);
$antworten[] = antwort_text('Keller');
$antworten[] = antwort_chat(array('bezeichnung' => 'Keller', 'offen' => array()));
$e = Aufmass_Diktat::verarbeiten(array('ton' => array('error' => 0, 'size' => strlen($TON), 'tmp_name' => $tmp, 'type' => 'audio/mp4', 'name' => 'blob'), 'felder' => $FELDER), $BENUTZER);
unlink($tmp);
pruefe(!is_wp_error($e) && $e['felder'] === array('bezeichnung' => 'Keller'), 'ein Upload wie aus $_FILES geht durch', fehlertext($e));
pruefe(strpos($rufe[0]['args']['body'], 'filename="aufnahme.mp4"') !== false, 'eine Aufnahme vom iPad (mp4) heißt entsprechend');
zuruecksetzen();
$antworten[] = antwort_text('   ');
$e = Aufmass_Diktat::verarbeiten(array('tonBytes' => $TON, 'tonMime' => 'audio/ogg', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'nichts_verstanden' && status_von($e) === 422 && count($rufe) === 1, 'nichts verstanden: 422, keine Zuordnung mehr', fehlertext($e));

echo "\n== Wenn OpenAI nicht mitspielt ==\n";
zuruecksetzen();
$antworten[] = array(401, array('error' => array('message' => 'Incorrect API key provided: ' . $SCHLUESSEL)));
$e = Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'openai_schluessel' && status_von($e) === 502, 'ein abgelehnter Schlüssel: 502 mit klarer Meldung', fehlertext($e));
pruefe(strpos($e->get_error_message(), $SCHLUESSEL) === false && strpos($e->get_error_message(), '[entfernt]') !== false, 'der Schlüssel wird aus OpenAIs Meldung getilgt');
$antworten[] = array(429, array('error' => array('message' => 'You exceeded your current quota')));
$e = Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'openai_ueberlastet' && status_von($e) === 503 && strpos($e->get_error_message(), 'quota') !== false, 'Kontingent erschöpft: 503', fehlertext($e));
$antworten[] = array(404, array('error' => array('message' => 'The model `gpt-9` does not exist')));
$e = Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'openai_modell', 'ein unbekanntes Modell wird benannt', fehlertext($e));
$antworten[] = array(500, 'kaputt');
$e = Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'openai_fehler' && status_von($e) === 502, 'ein Serverfehler bei OpenAI: 502', fehlertext($e));
$antworten[] = new WP_Error('http_request_failed', 'cURL error 28: Operation timed out');
$e = Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_erreichbar' && status_von($e) === 502, 'nicht erreichbar: 502', fehlertext($e));
$antworten[] = array(400, array('error' => array('message' => 'Audio file might be corrupted or unsupported')));
$e = Aufmass_Diktat::verarbeiten(array('tonBytes' => $TON, 'tonMime' => 'audio/wav', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'unbrauchbar' && status_von($e) === 422, 'eine unbrauchbare Aufnahme laut OpenAI: 422', fehlertext($e));

echo "\n== Modell ohne Temperatur ==\n";
zuruecksetzen();
update_option('aufmass_diktat_modell_zuordnung', 'gpt-5-mini');
$antworten[] = antwort_chat(array('offen' => array()));
Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), $BENUTZER);
$j = json_decode($rufe[0]['args']['body'], true);
pruefe($j['model'] === 'gpt-5-mini' && !array_key_exists('temperature', $j), 'eine neuere Modellreihe bekommt keine Temperatur mitgeschickt', json_encode(array_keys($j)));
update_option('aufmass_diktat_modell_zuordnung', '');

echo "\n== Das Schema trotz magic quotes ==\n";
zuruecksetzen();
$antworten[] = antwort_chat(array('bezeichnung' => 'Keller', 'offen' => array()));
$e = Aufmass_Diktat::verarbeiten(array('text' => 'Keller', 'felder' => addslashes(json_encode($FELDER))), $BENUTZER);
pruefe(!is_wp_error($e) && $e['felder'] === array('bezeichnung' => 'Keller'), 'ein mit Schrägstrichen entstelltes Schema wird trotzdem gelesen', fehlertext($e));

echo "\n== Drossel je Person ==\n";
zuruecksetzen();
for ($i = 0; $i < 20; $i++) { Aufmass_Diktat::verarbeiten(array('tonBytes' => $TON, 'tonMime' => 'video/mp4', 'felder' => $FELDER), $BENUTZER); }
for ($i = 0; $i < 20; $i++) { Aufmass_Diktat::verarbeiten(array('text' => '', 'felder' => $FELDER), $BENUTZER); }
$antworten[] = antwort_chat(array('offen' => array()));
$e = Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), $BENUTZER);
pruefe(!is_wp_error($e), 'unbrauchbare Anfragen zählen nicht gegen das Kontingent', fehlertext($e));
zuruecksetzen();
$letzter = null;
for ($i = 0; $i < 12; $i++) { $antworten[] = antwort_chat(array('offen' => array())); $letzter = Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), $BENUTZER); }
pruefe(!is_wp_error($letzter), 'zwölf Diktate in einer Minute gehen durch', fehlertext($letzter));
$e = Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'zu_viele' && status_von($e) === 429, 'das dreizehnte wird gedrosselt', fehlertext($e));
$antworten[] = antwort_chat(array('offen' => array()));
$e = Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), array('id' => 'u-andere'));
pruefe(!is_wp_error($e), 'eine andere Person darf weiter', fehlertext($e));
zuruecksetzen();
for ($i = 0; $i < Aufmass_Diktat::JE_TAG; $i++) { Aufmass_Drossel::zaehlen_fuer('diktat-tag-u-diktat', Aufmass_Diktat::JE_TAG, 86400); }
$e = Aufmass_Diktat::verarbeiten(array('text' => 'x', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'kontingent' && status_von($e) === 429 && count($rufe) === 0, 'das Tageskontingent sperrt, bevor OpenAI gefragt wird', fehlertext($e));
zuruecksetzen();

echo "\n== Verbindung prüfen ==\n";
$antworten[] = array(200, array('object' => 'list', 'data' => array(array('id' => 'gpt-4o-transcribe'), array('id' => 'gpt-4.1-mini'), array('id' => 'whisper-1'))));
$e = Aufmass_Diktat::verbindung_pruefen();
pruefe(!is_wp_error($e) && $e['modelle'] === 3 && $e['erkennung'] === true && $e['zuordnung'] === true, 'die Modellliste bestätigt Schlüssel und Modelle', fehlertext($e));
pruefe($rufe[0]['url'] === 'https://api.openai.com/v1/models' && $rufe[0]['args']['method'] === 'GET' && $rufe[0]['args']['headers']['Authorization'] === 'Bearer ' . $SCHLUESSEL, 'über GET /v1/models mit dem Schlüssel');
update_option('aufmass_diktat_modell_erkennung', 'whisper-9');
$antworten[] = array(200, array('data' => array(array('id' => 'gpt-4.1-mini'))));
$e = Aufmass_Diktat::verbindung_pruefen();
pruefe(!is_wp_error($e) && $e['erkennung'] === false && $e['zuordnung'] === true, 'ein fehlendes Modell wird gemeldet', fehlertext($e));
update_option('aufmass_diktat_modell_erkennung', '');
$antworten[] = array(401, array('error' => array('message' => 'Incorrect API key provided')));
$e = Aufmass_Diktat::verbindung_pruefen();
pruefe(is_wp_error($e) && $e->get_error_code() === 'openai_schluessel', 'ein falscher Schlüssel wird gemeldet', fehlertext($e));

echo "\n== Einstellungsseite ==\n";
require_once __DIR__ . '/../aufmass-sync/inc/einstellungen.php';
function seite_rendern() { ob_start(); Aufmass_Einstellungen::seite(); return ob_get_clean(); }
$_POST = array(); $_GET = array();
$html = seite_rendern();
pruefe(preg_match('/Warning|Notice|Deprecated|Fatal/', $html) === 0, 'die Seite entsteht ohne PHP-Meldungen');
pruefe(strpos($html, 'Tür einsprechen (OpenAI)') !== false && strpos($html, 'Hinterlegt.') !== false && strpos($html, 'aufmass_diktat_pruefen=1') !== false, 'sie zeigt den Abschnitt mit hinterlegtem Schlüssel und der Prüfung');
pruefe(strpos($html, $SCHLUESSEL) === false, 'der Schlüssel selbst steht nicht auf der Seite');
pruefe(strpos($html, 'name="aufmass_openai_entfernen"') !== false, 'und lässt sich entfernen');
$_GET = array('aufmass_diktat_pruefen' => '1');
$antworten[] = array(200, array('data' => array(array('id' => 'gpt-4o-transcribe'), array('id' => 'gpt-4.1-mini'))));
$html = seite_rendern();
pruefe(strpos($html, 'notice-success') !== false && strpos($html, 'Beide Modelle sind verfügbar') !== false, 'die Prüfung meldet Erfolg auf der Seite', substr($html, 0, 200));
$antworten[] = array(401, array('error' => array('message' => 'Incorrect API key provided')));
$html = seite_rendern();
pruefe(strpos($html, 'notice-error') !== false && strpos($html, 'nimmt den hinterlegten Schlüssel nicht an') !== false, 'und einen abgelehnten Schlüssel');
$_GET = array();
Aufmass_Diktat::schluessel_setzen('');
$html = seite_rendern();
pruefe(strpos($html, 'Noch nicht hinterlegt') !== false && strpos($html, 'aufmass_diktat_pruefen=1') === false, 'ohne Schlüssel: Hinweis, kein Prüf-Knopf');
/* Die Prüfungen der Einstellungen */
$_POST = array();
$c = Aufmass_Einstellungen::openai_schluessel_pruefen('sk-proj-abcdefghijklmnopqrstuvwxyz');
pruefe($c !== '' && Aufmass_Verschluesselung::ist_chiffre($c), 'ein Schlüssel wird beim Speichern verschlüsselt');
pruefe(Aufmass_Einstellungen::openai_schluessel_pruefen($c) === $c, 'die verschlüsselte Fassung geht im zweiten Durchlauf unverändert durch');
update_option('aufmass_openai_schluessel', $c);
pruefe(Aufmass_Einstellungen::openai_schluessel_pruefen('') === $c, 'leer heißt unverändert');
pruefe(Aufmass_Einstellungen::openai_schluessel_pruefen('kein-schluessel') === $c, 'ein unpassender Wert lässt den alten stehen');
$_POST = array('aufmass_openai_entfernen' => '1');
pruefe(Aufmass_Einstellungen::openai_schluessel_pruefen('') === '', 'der Haken entfernt den Schlüssel');
$_POST = array();
pruefe(Aufmass_Einstellungen::openai_host_pruefen('https://eu.api.openai.com/v1/') === 'eu.api.openai.com', 'die Adresse wird auf den Host gekürzt');
pruefe(Aufmass_Einstellungen::openai_host_pruefen('nicht gültig') === '', 'eine unbrauchbare Adresse wird nicht übernommen');
pruefe(Aufmass_Einstellungen::modell_zuordnung_pruefen('gpt-4.1') === 'gpt-4.1' && Aufmass_Einstellungen::modell_zuordnung_pruefen('x y') === '', 'Modellnamen werden geprüft');

echo "\n== Der Befehl „neue Tür“ zerlegt die Aufnahme ==\n";
$seg = Aufmass_Diktat::segmente('Büro Empfang, Halbzylinder 35 10. Neue Tür. Lager hinten, DIN rechts. Nächste Tür: Technikraum.');
pruefe($seg === array('Büro Empfang, Halbzylinder 35 10', 'Lager hinten, DIN rechts', 'Technikraum'), 'drei Türen, Satzzeichen um den Befehl fallen weg', json_encode($seg, JSON_UNESCAPED_UNICODE));
pruefe(Aufmass_Diktat::segmente('Neue Tür: Lager') === array('Lager'), 'ein Befehl am Anfang ergibt keinen leeren Teil');
pruefe(Aufmass_Diktat::segmente('Lager, neue Türe Keller, noch eine Tür Flur') === array('Lager', 'Keller', 'Flur'), 'auch „Türe“ und „noch eine Tür“ zählen', json_encode(Aufmass_Diktat::segmente('Lager, neue Türe Keller, noch eine Tür Flur'), JSON_UNESCAPED_UNICODE));
pruefe(Aufmass_Diktat::segmente('Haustür neu, zwei neue Türen, Türen neu') === array('Haustür neu, zwei neue Türen, Türen neu'), '„Haustür“, „neue Türen“ oder „Türen neu“ sind kein Befehl');
pruefe(Aufmass_Diktat::segmente('neue tür') === array(), 'nur der Befehl: nichts übrig');
pruefe(Aufmass_Diktat::segmente('Lager') === array('Lager'), 'ohne Befehl bleibt der Text ein Teil');
zuruecksetzen();
$antworten[] = antwort_text('Büro Empfang. Neue Tür. Lager hinten, DIN rechts. Nächste Tür: Technikraum');
$antworten[] = antwort_chat(array('bezeichnung' => 'Büro Empfang', 'offen' => array()));
$antworten[] = antwort_chat(array('bezeichnung' => 'Lager hinten', 'dinRichtung' => 'DIN rechts', 'offen' => array('Regal im Weg')));
$antworten[] = antwort_chat(array('bezeichnung' => 'Technikraum', 'offen' => array()));
$e = Aufmass_Diktat::verarbeiten(array('tonBytes' => $TON, 'tonMime' => 'audio/webm', 'felder' => $FELDER), $BENUTZER);
pruefe(!is_wp_error($e) && $e['serie'] === true && count($e['tueren']) === 3, 'eine Aufnahme mit zwei Befehlen ergibt drei Türen', fehlertext($e));
pruefe(count($rufe) === 4, 'eine Erkennung, drei Zuordnungen', (string) count($rufe));
pruefe($e['tueren'][1]['text'] === 'Lager hinten, DIN rechts' && $e['tueren'][1]['felder']['dinRichtung'] === 'DIN rechts' && $e['tueren'][1]['offen'] === array('Regal im Weg'),
    'jede Tür hat ihren Text, ihre Felder und ihr Offenes', json_encode($e['tueren'][1], JSON_UNESCAPED_UNICODE));
pruefe($e['felder'] === array('bezeichnung' => 'Büro Empfang') && strpos($e['text'], 'Neue Tür') !== false, 'der erste Teil steht wie bisher oben, der ganze Text bleibt');
$j = json_decode($rufe[2]['args']['body'], true);
pruefe(strpos($j['messages'][1]['content'], 'Lager hinten, DIN rechts') !== false && strpos($j['messages'][1]['content'], 'Technikraum') === false, 'jede Zuordnung sieht nur ihren Teil');
zuruecksetzen();
$antworten[] = antwort_chat(array('bezeichnung' => 'Lager', 'offen' => array()));
$e = Aufmass_Diktat::verarbeiten(array('text' => 'Lager', 'felder' => $FELDER), $BENUTZER);
pruefe(!is_wp_error($e) && $e['serie'] === false && count($e['tueren']) === 1, 'ohne Befehl: keine Serie, eine Tür', fehlertext($e));
zuruecksetzen();
$antworten[] = antwort_text('Neue Tür. Neue Tür.');
$e = Aufmass_Diktat::verarbeiten(array('tonBytes' => $TON, 'tonMime' => 'audio/webm', 'felder' => $FELDER), $BENUTZER);
pruefe(is_wp_error($e) && $e->get_error_code() === 'nichts_verstanden' && count($rufe) === 1, 'nur Befehle: nichts verstanden, keine Zuordnung', fehlertext($e));
zuruecksetzen();
$antworten[] = antwort_text(implode(' neue Tür ', array_fill(0, 35, 'Tür')));
for ($i = 0; $i < 30; $i++) { $antworten[] = antwort_chat(array('offen' => array())); }
$e = Aufmass_Diktat::verarbeiten(array('tonBytes' => $TON, 'tonMime' => 'audio/webm', 'felder' => $FELDER), $BENUTZER);
pruefe(!is_wp_error($e) && count($e['tueren']) === 30 && count($rufe) === 31, 'höchstens 30 Türen je Aufnahme', fehlertext($e));
zuruecksetzen();

echo "\n== Zufällige Eingaben erzeugen keine PHP-Meldungen ==\n";
$meldungen = array();
set_error_handler(function ($nr, $text, $datei, $zeile) use (&$meldungen) { $meldungen[] = $text . ' (' . basename($datei) . ':' . $zeile . ')'; return true; });
mt_srand(7);
function zufall($tiefe = 0) {
    $arten = array('null', 'bool', 'int', 'float', 'str', 'arr', 'obj');
    $a = $arten[mt_rand(0, $tiefe > 2 ? 4 : 6)];
    switch ($a) {
        case 'null': return null;
        case 'bool': return (bool) mt_rand(0, 1);
        case 'int': return mt_rand(-1000000, 1000000);
        case 'float': return mt_rand(-10000, 10000) / 7;
        case 'str':
            $t = array('', ' ', 'DIN links', 'din links ', "x\x00y", str_repeat('ä', 300), '27,5', '35', 'VdS', 'Unsinn', '<script>', "\xff\xfe", 'wahl', 'text', 'zahl');
            return $t[mt_rand(0, count($t) - 1)];
        case 'arr': $n = mt_rand(0, 4); $r = array(); for ($i = 0; $i < $n; $i++) { $r[] = zufall($tiefe + 1); } return $r;
        default:
            $r = array();
            foreach (array('name', 'typ', 'werte', 'frage', 'hinweis', 'offen', 'bezeichnung', 'masseAussen', 'dinRichtung', 'zylinderAusfuehrung', 'brauchtWandleser') as $k) {
                if (mt_rand(0, 1)) { $r[$k] = zufall($tiefe + 1); }
            }
            return $r;
    }
}
$felderOk = Aufmass_Diktat::schema_pruefen($FELDER);
$ergebnisse = 0;
for ($i = 0; $i < 400; $i++) {
    $s = Aufmass_Diktat::schema_pruefen(zufall());
    if (!is_wp_error($s)) { Aufmass_Diktat::schema_bauen($s); }
    Aufmass_Diktat::woerter_pruefen(zufall());
    $z = zufall();
    $r = Aufmass_Diktat::ergebnis_bereinigen(is_array($z) ? $z : array('offen' => $z, 'masseAussen' => $z, 'dinRichtung' => $z, 'zylinderAusfuehrung' => $z, 'bezeichnung' => $z, 'brauchtWandleser' => $z), $felderOk);
    if (is_array($r) && isset($r['felder'], $r['offen'])) { $ergebnisse++; }
}
restore_error_handler();
pruefe(count($meldungen) === 0, '400 zufällige Schemata, Wörterlisten und Modellantworten ohne Warnung oder Notice', implode(' | ', array_slice($meldungen, 0, 3)));
pruefe($ergebnisse === 400, 'und jede Bereinigung liefert die erwartete Form');

echo "\nErgebnis Diktat: $ok ok, $fehler Fehler\n";
exit($fehler ? 1 : 0);
