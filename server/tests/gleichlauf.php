<?php
/* Gleichlauf-Prüfung: nimmt Fälle als JSON von der Standardeingabe entgegen
   und lässt sie durch dieselben Klassen laufen wie das Plugin. Wird von
   tests/test-gleichlauf.js gesteuert (Zufallsfälle aus freigabe.js). */
require_once __DIR__ . '/wp-attrappe.php';

$eingabe = json_decode(stream_get_contents(STDIN), true);
$aus = array();
foreach ($eingabe as $fall) {
    $e = array();
    $sauber = Aufmass_Freigaben::daten_pruefen($fall['daten'], $fall['daten']['pid']);
    if (is_wp_error($sauber)) {
        $e['datenOk'] = false; $e['datenFehler'] = $sauber->get_error_code() . ': ' . $sauber->get_error_message();
        $aus[] = $e; continue;
    }
    $e['datenOk'] = true;
    $e['matrix'] = Aufmass_Freigaben::entpacken($sauber['m']);
    $e['maske'] = Aufmass_Freigaben::entpacken($sauber['e']);
    $e['s'] = $sauber['s'];
    $a = Aufmass_Freigaben::antwort_pruefen($sauber, $fall['antwort']);
    if (is_wp_error($a)) {
        $e['ok'] = false; $e['code'] = $a->get_error_code(); $e['meldung'] = $a->get_error_message();
    } else {
        $e['ok'] = true; $e['a'] = $a['antwort']['a']; $e['anzahl'] = $a['anzahl']; $e['listen'] = $a['listen'];
        $e['p'] = isset($a['antwort']['p']) ? $a['antwort']['p'] : null;
    }
    $aus[] = $e;
}
echo json_encode($aus, JSON_UNESCAPED_UNICODE);
