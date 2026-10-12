<?php
/* Kundenfreigabe per Kurzlink: Anlegen, Rechte, Kundenseite, Prüfung der
   Antwort, Benachrichtigung, Übernahme, Zurückziehen, Drosselung -
   durchgespielt gegen die echten Klassen. */
require_once __DIR__ . '/wp-attrappe.php';

$ok = 0; $fehler = 0;
function pruefe($b, $t, $i = '') {
    global $ok, $fehler;
    if ($b) { $ok++; }
    else { $fehler++; echo "  FEHL $t" . ($i !== '' ? "\n         -> $i" : '') . "\n"; }
}
function fehlertext($e) {
    return is_wp_error($e) ? ($e->get_error_code() . ': ' . $e->get_error_message()) : (is_array($e) ? json_encode($e) : gettype($e));
}
function status_von($e) { $d = is_wp_error($e) ? $e->get_error_data() : array(); return isset($d['status']) ? $d['status'] : 0; }

$_SERVER['REMOTE_ADDR'] = '10.0.0.1';
$weber  = test_benutzer('u-weber', 'M. Weber');
$kraus  = test_benutzer('u-kraus', 'J. Kraus');
$fremd  = test_benutzer('u-fremd', 'F. Fremd');
$chefin = test_benutzer('u-chefin', 'Dr. Schäfer', 'verwaltung');

/* Ein Aufmaß mit drei Türen und drei Schließungen */
$projekt = array('id' => 'prj-f', 'kunde' => 'Müller & Söhne GmbH', 'objekt' => 'Königsallee 47',
    'tueren' => array(array('id' => 't1'), array('id' => 't2'), array('id' => 't3')),
    'schliessungen' => array(array('id' => 's1'), array('id' => 's2'), array('id' => 's3')),
    'standorte' => array(), 'matrix' => array());
$e = Aufmass_Projekte::speichern('prj-f', $projekt, 0, $weber);
pruefe(!is_wp_error($e), 'Vorbereitung: das Aufmaß liegt auf dem Server', fehlertext($e));

/* Freigabedaten, wie sie freigabe.js erzeugt: Spalte s2 ist freigegeben */
function freigabedaten($zusatz = array()) {
    return array_merge(array(
        'f' => 1, 'pid' => 'prj-f', 'kunde' => 'Müller & Söhne GmbH', 'objekt' => 'Königsallee 47',
        'anlage' => 'SA-1', 'hinweis' => 'Bitte nur Reinigung', 'frist' => '30.11.2026', 'firma' => 'Provision Infra GmbH',
        't' => array(array('t1', '01', 'Haupteingang', 'EG'), array('t2', '02', 'Büro', 'EG'), array('t3', '03', 'Lager', 'UG')),
        's' => array(
            array('s1', 'GHS', 'Generalhauptschlüssel', 'Dr. Schäfer'),
            array('s2', 'HM', 'Hausmeister', 'Herr Özdemir', array('a' => 'einzel', 'g' => '', 'p' => array(array('Herr Özdemir', 'Facility', 2)))),
            array('s3', 'IT', 'IT-Abteilung', 'EDV (4)')
        ),
        'm' => '0~9',            /* neun Nullen, lauflängenkodiert */
        'e' => '010010010'       /* nur die mittlere Spalte ist frei */
    ), $zusatz);
}

echo "\n== Lauflängen und Personen wie in freigabe.js ==\n";
pruefe(Aufmass_Freigaben::entpacken('0~9') === '000000000', 'eine Wiederholung wird aufgelöst', Aufmass_Freigaben::entpacken('0~9'));
pruefe(Aufmass_Freigaben::entpacken('a~2b1~4') === 'aab1111', 'gemischt wie das Original', Aufmass_Freigaben::entpacken('a~2b1~4'));
pruefe(Aufmass_Freigaben::entpacken('') === '', 'leer bleibt leer');
$pers = Aufmass_Freigaben::personen_bereinigen(array(array('  Frau Neu ', 'Empfang', '3'), array('', 'leer', 1),
    array('name' => 'Herr Alt', 'funktion' => 'Technik', 'anzahlMedien' => 150), array('Herr Null', '', 0), 'unsinn', array('Herr Tab', "Funk\ttion", -2)));
pruefe(count($pers) === 4, 'Personen ohne Namen und Unsinn fallen heraus', json_encode($pers));
pruefe($pers[0][0] === 'Frau Neu' && $pers[0][2] === 3, 'Name wird beschnitten, Anzahl wird zur Zahl', json_encode($pers[0]));
pruefe($pers[1][2] === 99 && $pers[2][2] === 1 && $pers[3][2] === 1, 'Anzahl bleibt zwischen 1 und 99', json_encode($pers));
pruefe($pers[3][1] === 'Funk tion', 'Steuerzeichen werden zu Leerzeichen', json_encode($pers[3]));

echo "\n== Anlegen: nur Zuständige, nur vorhandene Aufmaße ==\n";
$e = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), 'http://example.test/aufmasstool/freigabe.html', $fremd);
pruefe(is_wp_error($e) && status_von($e) === 403, 'ein Unzuständiger darf nicht freigeben', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-gibts-nicht', freigabedaten(array('pid' => 'prj-gibts-nicht')), '', $weber);
pruefe(is_wp_error($e) && status_von($e) === 404, 'ein unbekanntes Aufmaß gibt 404', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(array('pid' => 'anderes')), '', $weber);
pruefe(is_wp_error($e) && $e->get_error_code() === 'projekt_falsch', 'Daten eines anderen Aufmaßes werden abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(array('f' => 2)), '', $weber);
pruefe(is_wp_error($e) && $e->get_error_code() === 'format', 'ein fremdes Format wird abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(array('m' => '0~8')), '', $weber);
pruefe(is_wp_error($e) && $e->get_error_code() === 'matrix_unvollstaendig', 'eine Matrix falscher Größe wird abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(array('e' => '01001001x')), '', $weber);
pruefe(is_wp_error($e) && $e->get_error_code() === 'matrix_unlesbar', 'eine Maske mit fremden Zeichen wird abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-f', 'kein array', '', $weber);
pruefe(is_wp_error($e) && status_von($e) === 400, 'ohne Daten gibt es 400', fehlertext($e));

$f = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), 'http://example.test/aufmasstool/freigabe.html', $weber);
pruefe(!is_wp_error($f), 'der Zuständige legt eine Freigabe an', fehlertext($f));
$code = $f['code'];
pruefe(strlen($code) === 10 && preg_match('/^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/', $code) === 1,
    'der Code hat zehn Zeichen aus dem eindeutigen Vorrat', $code);
pruefe($f['status'] === 'offen', 'die Freigabe ist offen', $f['status']);
pruefe($f['kurzlink'] === 'http://example.test/?aufmass_f=' . $code, 'ohne sprechende Permalinks führt der Kurzlink über die Abfragevariable', $f['kurzlink']);
pruefe($f['link'] === 'http://example.test/aufmasstool/freigabe.html#' . $code, 'der lange Link zeigt auf die Seite mit dem Code im Anker', $f['link']);
pruefe($f['erstelltVon'] === 'M. Weber', 'der Ersteller wird genannt', $f['erstelltVon']);
$bis = strtotime(substr($f['gueltigBis'], 0, 19) . ' UTC');
pruefe(abs($bis - (time() + 30 * 86400)) < 120, 'gültig für 30 Tage', $f['gueltigBis']);
pruefe(get_option('aufmass_freigabe_seite') === 'http://example.test/aufmasstool/freigabe.html', 'die Seite wird für unbekannte Codes gemerkt');

update_option('permalink_structure', '/%postname%/');
pruefe(Aufmass_Freigaben::kurzlink($code) === 'http://example.test/f/' . $code, 'mit sprechenden Permalinks lautet der Kurzlink /f/CODE', Aufmass_Freigaben::kurzlink($code));

echo "\n== Die Zielseite muss auf dieser Website liegen ==\n";
pruefe(Aufmass_Freigaben::seite_pruefen('https://boese.example/freigabe.html') === 'http://example.test/aufmasstool/freigabe.html',
    'eine fremde Adresse wird durch die Vorgabe ersetzt');
pruefe(Aufmass_Freigaben::seite_pruefen('http://example.test/werkzeug/freigabe.html?x=1') === 'http://example.test/aufmasstool/freigabe.html',
    'eine Adresse mit Abfrage wird ersetzt');
pruefe(Aufmass_Freigaben::seite_pruefen('http://example.test/werkzeug/freigabe.html') === 'http://example.test/werkzeug/freigabe.html',
    'eine eigene Seite in einem anderen Ordner bleibt erhalten');
pruefe(Aufmass_Freigaben::seite_pruefen('http://example.test/a/../freigabe.html') === 'http://example.test/aufmasstool/freigabe.html',
    'Pfadsprünge werden ersetzt');
pruefe(Aufmass_Freigaben::seite_pruefen('javascript:alert(1)') === 'http://example.test/aufmasstool/freigabe.html',
    'Skriptadressen werden ersetzt');
pruefe(Aufmass_Freigaben::seite_pruefen('') === 'http://example.test/aufmasstool/freigabe.html', 'leer ergibt die Vorgabe');

echo "\n== Gültigkeit aus den Einstellungen ==\n";
update_option('aufmass_freigabe_tage', '0');
$f0 = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
pruefe(!is_wp_error($f0) && $f0['gueltigBis'] === '', '0 Tage heißt unbegrenzt', fehlertext($f0));
update_option('aufmass_freigabe_tage', '14');
$f14 = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
pruefe(!is_wp_error($f14) && abs(strtotime(substr($f14['gueltigBis'], 0, 19) . ' UTC') - (time() + 14 * 86400)) < 120, '14 Tage werden übernommen', $f14['gueltigBis']);
update_option('aufmass_freigabe_tage', '30');
pruefe(Aufmass_Freigaben::tage() === 30, 'die Vorgabe ist 30 Tage');

echo "\n== Der Kunde öffnet den Link ==\n";
$k = Aufmass_Freigaben::oeffentlich($code);
pruefe(!is_wp_error($k), 'der Kunde bekommt die Freigabe', fehlertext($k));
pruefe($k['status'] === 'offen' && $k['antwort'] === null, 'offen, noch ohne Antwort');
pruefe($k['daten']['f'] === 1 && count($k['daten']['t']) === 3 && count($k['daten']['s']) === 3, 'mit Türen und Schließungen');
pruefe($k['daten']['m'] === '0~9' && $k['daten']['e'] === '010010010', 'Matrix und Maske reisen unverändert mit');
pruefe(isset($k['daten']['s'][1][4]['p'][0][0]) && $k['daten']['s'][1][4]['p'][0][0] === 'Herr Özdemir', 'die Inhaberliste der freigegebenen Schließung ist dabei');
pruefe(!isset($k['daten']['s'][0][4]), 'nicht freigegebene Schließungen haben keine Inhaberliste');
pruefe($k['daten']['firma'] === 'Provision Infra GmbH', 'die Firma für die Anrede ist dabei');
$k = Aufmass_Freigaben::oeffentlich(strtoupper($code));
pruefe(!is_wp_error($k), 'Großschreibung im Code ist egal', fehlertext($k));
$k = Aufmass_Freigaben::oeffentlich('gibtsnicht1');
pruefe(is_wp_error($k) && status_von($k) === 404, 'ein unbekannter Code gibt 404', fehlertext($k));
$k = Aufmass_Freigaben::oeffentlich('x');
pruefe(is_wp_error($k) && status_von($k) === 404, 'ein unbrauchbarer Code gibt 404', fehlertext($k));

echo "\n== Drosselung: unbekannte Codes je Herkunft ==\n";
$_SERVER['REMOTE_ADDR'] = '10.0.0.2';
$letzter = null;
for ($i = 0; $i < 30; $i++) { $letzter = Aufmass_Freigaben::oeffentlich('raten' . str_pad((string) $i, 5, '0', STR_PAD_LEFT)); }
pruefe(is_wp_error($letzter) && status_von($letzter) === 404, 'die ersten 30 Fehlversuche bekommen 404', fehlertext($letzter));
$k = Aufmass_Freigaben::oeffentlich('raten99999');
pruefe(is_wp_error($k) && status_von($k) === 429, 'der 31. Versuch wird gedrosselt (429)', fehlertext($k));
$k = Aufmass_Freigaben::oeffentlich($code);
pruefe(!is_wp_error($k), 'ein richtiger Code geht trotzdem - die Drossel gilt nur dem Raten', fehlertext($k));
$_SERVER['REMOTE_ADDR'] = '10.0.0.3';
$k = Aufmass_Freigaben::oeffentlich('raten99999');
pruefe(is_wp_error($k) && status_von($k) === 404, 'eine andere Herkunft zählt getrennt', fehlertext($k));
$_SERVER['REMOTE_ADDR'] = '10.0.0.1';

echo "\n== Die Antwort wird gegen die Freigabe geprüft ==\n";
function antwort($zusatz = array()) {
    return array_merge(array('f' => 1, 'pid' => 'prj-f', 'typ' => 'antwort', 'anzahl' => '3x3',
        'tIds' => array('t1', 't2', 't3'), 'sIds' => array('s1', 's2', 's3'),
        'a' => '1:1,4:2,7:1', 'gesendet' => '2026-10-12T08:00:00Z'), $zusatz);
}
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(), '', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'name_fehlt' && status_von($e) === 400, 'ohne Namen geht nichts', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(), "  \n\t ", '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'name_fehlt', 'nur Leerraum ist kein Name', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '0:1')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_freigegeben', 'ein nicht freigegebenes Feld weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '1:1,9:1')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'ein Feld außerhalb der Matrix weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '1:7')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'ein unbekannter Berechtigungswert weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => 'x;y')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'Kauderwelsch weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('tIds' => array('t1', 't2'))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'veraltet', 'andere Türkennungen passen nicht zur Freigabe', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('pid' => 'anderes')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'projekt_falsch', 'ein anderes Aufmaß passt nicht', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('typ' => 'plan')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'nur Antworten werden angenommen', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('p' => array('0' => array(array('Eindringling', 'Hacker', 1))))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_freigegeben', 'eine Inhaberliste für eine nicht freigegebene Schließung wird abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('p' => array('9' => array()))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'eine Inhaberliste für eine unbekannte Spalte wird abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, 'text', 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'antwort_fehlt', 'ohne Antwort gibt es eine klare Meldung', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => str_repeat('1:1,', 90000))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && status_von($e) === 413, 'eine überlange Antwort wird abgewiesen (413)', fehlertext($e));
pruefe(Aufmass_Freigaben::zeile($code)['status'] === 'offen', 'keiner der abgewiesenen Versuche hat etwas verändert');
pruefe(count($GLOBALS['wp_mails']) === 0, 'und keiner hat eine E-Mail ausgelöst');

echo "\n== Eine gültige Antwort ==\n";
$a = Aufmass_Freigaben::antwort_annehmen($code,
    antwort(array('a' => '1:1,4:2,7:1,4:0', 'p' => array('1' => array(array('Herr Özdemir', 'Facility', 3), array('Frau Neu', 'Empfang', 1), array('', 'leer', 1))))),
    "  Frau  Kundig\n", "Bitte den Hausmeister\nmit 3 Schlüsseln.");
pruefe(!is_wp_error($a), 'die Antwort wird angenommen', fehlertext($a));
pruefe($a['ok'] === true && $a['antwortNr'] === 1, 'als erste Rückmeldung', json_encode($a));
pruefe($a['anzahl'] === 2 && $a['listen'] === 1, 'zwei Berechtigungen (4:0 hebt 4:2 wieder auf) und eine Inhaberliste', json_encode($a));
$z = Aufmass_Freigaben::zeile($code);
pruefe($z['status'] === 'beantwortet', 'die Freigabe ist jetzt beantwortet', $z['status']);
pruefe($z['antwort_name'] === 'Frau Kundig', 'der Name wird einzeilig und beschnitten abgelegt', json_encode($z['antwort_name']));
pruefe($z['antwort_anmerkung'] === "Bitte den Hausmeister\nmit 3 Schlüsseln.", 'die Anmerkung behält ihre Zeilen', json_encode($z['antwort_anmerkung']));
$gespeichert = json_decode($z['antwort'], true);
pruefe($gespeichert['a'] === '1:1,7:1', 'abgelegt wird die bereinigte Antwort', $gespeichert['a']);
pruefe(isset($gespeichert['p']['1']) && count($gespeichert['p']['1']) === 2 && $gespeichert['p']['1'][0][2] === 3,
    'die Inhaberliste ist bereinigt (ohne die namenlose Person)', json_encode($gespeichert['p']));
pruefe(strpos($z['antwort'], '"p":{"1":') !== false, 'die Inhaberlisten sind eine Zuordnung, keine Liste', substr($z['antwort'], 0, 200));
pruefe($gespeichert['gesendet'] !== '2026-10-12T08:00:00Z', 'die Sendezeit stellt der Server, nicht der Kunde');

echo "\n== Benachrichtigung ==\n";
pruefe(count($GLOBALS['wp_mails']) === 1, 'genau eine E-Mail wurde ausgelöst', count($GLOBALS['wp_mails']));
$m = $GLOBALS['wp_mails'][0];
pruefe($m['an'] === array('u-weber@provision-infra.de'), 'an den Ersteller (der auch zuständig ist, nur einmal)', json_encode($m['an']));
pruefe(strpos($m['betreff'], 'Kundenrückmeldung') === 0 && strpos($m['betreff'], 'Müller & Söhne GmbH') !== false, 'der Betreff nennt das Aufmaß', $m['betreff']);
pruefe(strpos($m['text'], 'Frau Kundig') !== false && strpos($m['text'], 'Bitte den Hausmeister') !== false, 'der Text nennt Name und Anmerkung');
pruefe(strpos($m['text'], '2 Berechtigungen, 1 Inhaberliste') !== false, 'und zählt die Änderungen', $m['text']);
pruefe(strpos($m['text'], 'http://example.test/aufmasstool/') !== false, 'und verweist auf das Werkzeug');
pruefe(strpos($m['text'], 'erst übernommen, wenn') !== false, 'und sagt, dass erst geprüft wird');
pruefe(is_array($m['kopf']) && $m['kopf'][0] === 'Content-Type: text/plain; charset=UTF-8', 'als reiner Text');

/* Mit zwei Zuständigen bekommen beide die Mail */
Aufmass_Projekte::zustaendige_setzen('prj-f', array('u-weber', 'u-kraus'), $weber);
$a = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '1:1')), 'Frau Kundig', '');
pruefe(!is_wp_error($a) && $a['antwortNr'] === 2, 'der Kunde kann erneut übertragen (Nr. 2)', fehlertext($a));
$m = $GLOBALS['wp_mails'][1];
sort($m['an']);
pruefe($m['an'] === array('u-kraus@provision-infra.de', 'u-weber@provision-infra.de'), 'Ersteller und alle Zuständigen, ohne Doppelte', json_encode($m['an']));
update_option('aufmass_freigabe_mail', '0');
$a = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '1:1,4:1')), 'Frau Kundig', '');
pruefe(!is_wp_error($a) && $a['antwortNr'] === 3 && count($GLOBALS['wp_mails']) === 2, 'abgeschaltet: keine E-Mail, Antwort trotzdem angenommen');
pruefe($a['benachrichtigt'] === false, 'und die Antwort sagt, dass nicht benachrichtigt wurde');
update_option('aufmass_freigabe_mail', '1');

echo "\n== Der Kunde sieht seine eigene Antwort wieder ==\n";
$k = Aufmass_Freigaben::oeffentlich($code);
pruefe($k['status'] === 'beantwortet' && is_array($k['antwort']) && $k['antwort']['a'] === '1:1,4:1', 'Zustand und letzte Antwort', json_encode($k['antwort']));
pruefe($k['antwortName'] === 'Frau Kundig' && $k['antwortAm'] !== '', 'mit Name und Zeit');

echo "\n== Wartende Antworten: nur für die, die übernehmen dürfen ==\n";
$o = Aufmass_Freigaben::offene_fuer($weber);
pruefe(count($o) === 1 && $o[0]['code'] === $code && $o[0]['antwortNr'] === 3, 'der Zuständige sieht die wartende Antwort', json_encode(array_map(function ($x) { return $x['code']; }, $o)));
pruefe($o[0]['kunde'] === 'Müller & Söhne GmbH' && $o[0]['objekt'] === 'Königsallee 47', 'mit Kunde und Objekt');
pruefe(isset($o[0]['antwort']['a']) && $o[0]['antwort']['a'] === '1:1,4:1', 'und der Antwort selbst');
pruefe(!isset($o[0]['antwort']['p']), 'diese Antwort hat keine Inhaberlisten - dann fehlt der Eintrag ganz');
pruefe(count(Aufmass_Freigaben::offene_fuer($fremd)) === 0, 'ein Unzuständiger sieht nichts');
pruefe(count(Aufmass_Freigaben::offene_fuer($chefin)) === 1, 'die Verwaltung sieht alles');
pruefe(count(Aufmass_Freigaben::offene_fuer(null)) === 0, 'ohne Anmeldung gar nichts');
/* herrenlos: jeder sieht sie, aber niemand wird dadurch still zuständig */
global $wpdb;
$wpdb->delete('wp_aufmass_zustaendig', array('projekt_id' => 'prj-f'));
pruefe(count(Aufmass_Freigaben::offene_fuer($fremd)) === 1, 'bei einem herrenlosen Aufmaß sieht jeder die Antwort');
pruefe(count(Aufmass_Projekte::zustaendige_von('prj-f')) === 0, 'ohne dadurch zuständig zu werden');
Aufmass_Projekte::zustaendige_setzen('prj-f', array('u-weber', 'u-kraus'), $chefin);

echo "\n== Übernehmen ==\n";
$e = Aufmass_Freigaben::uebernommen_markieren($code, 3, $fremd);
pruefe(is_wp_error($e) && status_von($e) === 403, 'ein Unzuständiger darf nicht übernehmen', fehlertext($e));
$e = Aufmass_Freigaben::uebernommen_markieren($code, 2, $kraus);
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_mehr_offen' && status_von($e) === 409, 'eine veraltete Antwortnummer wird nicht markiert (409)', fehlertext($e));
$d = $e->get_error_data();
pruefe(isset($d['freigabe']['antwortNr']) && $d['freigabe']['antwortNr'] === 3, 'die Meldung liefert den aktuellen Stand mit');
$e = Aufmass_Freigaben::uebernommen_markieren('gibtsnicht1', 1, $kraus);
pruefe(is_wp_error($e) && status_von($e) === 404, 'ein unbekannter Code gibt 404', fehlertext($e));
$u = Aufmass_Freigaben::uebernommen_markieren($code, 3, $kraus);
pruefe(!is_wp_error($u) && $u['status'] === 'uebernommen', 'der Zuständige übernimmt', fehlertext($u));
pruefe($u['uebernommenVon'] === 'J. Kraus' && $u['uebernommenNr'] === 3 && $u['uebernommenAm'] !== '', 'mit Name, Nummer und Zeit', json_encode($u));
pruefe(count(Aufmass_Freigaben::offene_fuer($weber)) === 0, 'danach wartet nichts mehr');
$e = Aufmass_Freigaben::uebernommen_markieren($code, 3, $weber);
pruefe(is_wp_error($e) && status_von($e) === 409, 'ein zweites Übernehmen derselben Antwort wird abgewiesen', fehlertext($e));
$k = Aufmass_Freigaben::oeffentlich($code);
pruefe($k['status'] === 'uebernommen' && is_array($k['antwort']), 'der Kunde sieht: übernommen', $k['status']);

echo "\n== Verwerfen ==\n";
$a = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '7:2')), 'Herr Zweit', 'Nachtrag');
pruefe(!is_wp_error($a) && $a['antwortNr'] === 4, 'nach der Übernahme kann der Kunde erneut übertragen', fehlertext($a));
pruefe(count(Aufmass_Freigaben::offene_fuer($weber)) === 1, 'die neue Antwort wartet wieder');
$v = Aufmass_Freigaben::verwerfen($code, 4, $weber);
pruefe(!is_wp_error($v) && $v['status'] === 'verworfen', 'der Zuständige verwirft', fehlertext($v));
pruefe(count(Aufmass_Freigaben::offene_fuer($weber)) === 0, 'danach wartet nichts');
$k = Aufmass_Freigaben::oeffentlich($code);
pruefe($k['status'] === 'offen' && $k['antwort'] === null, 'der Kunde sieht die Freigabe wieder als offen, ohne die verworfene Antwort', $k['status']);

echo "\n== Liste je Aufmaß ==\n";
$l = Aufmass_Freigaben::liste('prj-f');
pruefe(count($l) === 3, 'alle drei Freigaben des Aufmaßes', count($l));
pruefe($l[0]['code'] === $f14['code'], 'neueste zuerst', $l[0]['code']);
$meine = array_values(array_filter($l, function ($x) use ($code) { return $x['code'] === $code; }));
pruefe(count($meine) === 1 && $meine[0]['status'] === 'verworfen' && $meine[0]['antwortNr'] === 4, 'mit dem aktuellen Zustand');
pruefe(!isset($meine[0]['daten']), 'aber ohne die ganzen Plandaten');
pruefe(count(Aufmass_Freigaben::liste('prj-x')) === 0, 'ein fremdes Aufmaß hat keine');

echo "\n== Zurückziehen ==\n";
$e = Aufmass_Freigaben::zurueckziehen($f0['code'], $fremd);
pruefe(is_wp_error($e) && status_von($e) === 403, 'nur Zuständige ziehen zurück', fehlertext($e));
$r = Aufmass_Freigaben::zurueckziehen($f0['code'], $weber);
pruefe(!is_wp_error($r) && $r['status'] === 'zurueckgezogen', 'ein offener Link wird zurückgezogen', fehlertext($r));
$zz = Aufmass_Freigaben::zeile($f0['code']);
pruefe($zz !== null && $zz['daten'] === '', 'die Plandaten des Links sind damit sofort entfernt (Datensparsamkeit)',
    $zz ? strlen((string) $zz['daten']) . ' Zeichen' : 'keine Zeile');
$k = Aufmass_Freigaben::oeffentlich($f0['code']);
pruefe(is_wp_error($k) && $k->get_error_code() === 'zurueckgezogen' && status_von($k) === 410, 'der Kunde bekommt 410', fehlertext($k));
$e = Aufmass_Freigaben::antwort_annehmen($f0['code'], antwort(), 'Frau Spät', '');
pruefe(is_wp_error($e) && status_von($e) === 410, 'und kann nichts mehr übertragen', fehlertext($e));
/* Ein beantworteter Link: die Antwort bleibt zur Prüfung, der Link ist tot */
$a = Aufmass_Freigaben::antwort_annehmen($f14['code'], antwort(array('a' => '1:1')), 'Frau Dritt', '');
pruefe(!is_wp_error($a), 'Vorbereitung: der 14-Tage-Link wird beantwortet', fehlertext($a));
$r = Aufmass_Freigaben::zurueckziehen($f14['code'], $weber);
pruefe(!is_wp_error($r) && $r['status'] === 'beantwortet', 'die wartende Antwort bleibt erhalten', fehlertext($r));
$k = Aufmass_Freigaben::oeffentlich($f14['code']);
pruefe(is_wp_error($k) && $k->get_error_code() === 'abgelaufen', 'der Kunde kommt trotzdem nicht mehr hinein', fehlertext($k));
pruefe(count(Aufmass_Freigaben::offene_fuer($weber)) === 1, 'die Antwort wartet weiter auf die Prüfung');
$zz = Aufmass_Freigaben::zeile($f14['code']);
pruefe($zz['daten'] === '' && $zz['antwort'] !== '' && $zz['antwort_name'] === 'Frau Dritt',
    'auch hier sind die Plandaten weg - die Antwort samt Name bleibt zur Prüfung', json_encode(array(strlen($zz['daten']), $zz['antwort_name'])));
$offen = Aufmass_Freigaben::offene_fuer($weber);
pruefe(is_array($offen[0]['antwort']) && !isset($offen[0]['daten']),
    'die Prüfung auf dem Gerät bekommt die Antwort und braucht die Plandaten nicht', implode(',', array_keys($offen[0])));
$u = Aufmass_Freigaben::uebernommen_markieren($f14['code'], 1, $weber);
pruefe(!is_wp_error($u) && $u['status'] === 'abgelaufen', 'nach der Übernahme gilt der Link als abgelaufen', fehlertext($u));

echo "\n== Ablauf ==\n";
$fa = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
$wpdb->update('wp_aufmass_freigaben', array('gueltig_bis' => '2020-01-01 00:00:00.000000'), array('code' => $fa['code']));
$k = Aufmass_Freigaben::oeffentlich($fa['code']);
pruefe(is_wp_error($k) && $k->get_error_code() === 'abgelaufen' && status_von($k) === 410, 'ein abgelaufener Link gibt 410', fehlertext($k));
$l = Aufmass_Freigaben::liste('prj-f');
$dieser = array_values(array_filter($l, function ($x) use ($fa) { return $x['code'] === $fa['code']; }));
pruefe($dieser[0]['status'] === 'abgelaufen', 'und steht als abgelaufen in der Liste');

echo "\n== Gelöschtes Aufmaß ==\n";
Aufmass_Projekte::speichern('prj-g', array('id' => 'prj-g', 'kunde' => 'Weg', 'tueren' => array(array('id' => 't1')), 'schliessungen' => array(array('id' => 's1'))), 0, $weber);
$fg = Aufmass_Freigaben::anlegen('prj-g', array('f' => 1, 'pid' => 'prj-g', 't' => array(array('t1', '1', 'Tür', '')), 's' => array(array('s1', 'A', 'A', '', array('a' => '', 'g' => '', 'p' => array()))), 'm' => '0', 'e' => '1'), '', $weber);
pruefe(!is_wp_error($fg), 'Vorbereitung: Freigabe für ein zweites Aufmaß', fehlertext($fg));
$a = Aufmass_Freigaben::antwort_annehmen($fg['code'], array('f' => 1, 'pid' => 'prj-g', 'typ' => 'antwort', 'tIds' => array('t1'), 'sIds' => array('s1'), 'a' => '0:1'), 'Frau G', '');
pruefe(!is_wp_error($a), 'Vorbereitung: beantwortet', fehlertext($a));
Aufmass_Projekte::loeschen('prj-g', $weber);
$k = Aufmass_Freigaben::oeffentlich($fg['code']);
pruefe(is_wp_error($k) && status_von($k) === 410, 'nach dem Löschen des Aufmaßes ist der Link tot', fehlertext($k));
pruefe(count(array_filter(Aufmass_Freigaben::offene_fuer($weber), function ($x) use ($fg) { return $x['code'] === $fg['code']; })) === 0,
    'und die Antwort wartet nicht mehr');
$e = Aufmass_Freigaben::anlegen('prj-g', array('f' => 1, 'pid' => 'prj-g', 't' => array(array('t1')), 's' => array(array('s1')), 'm' => '0', 'e' => '1'), '', $weber);
pruefe(is_wp_error($e) && status_von($e) === 410, 'für ein gelöschtes Aufmaß gibt es keine neue Freigabe', fehlertext($e));

echo "\n== Umleitung des Kurzlinks ==\n";
pruefe(Aufmass_Freigaben::umleitung_ziel($code) === 'http://example.test/aufmasstool/freigabe.html#' . $code, 'ein bekannter Code führt zur Seite mit Anker');
pruefe(Aufmass_Freigaben::umleitung_ziel('GIBTSNICHT') === 'http://example.test/aufmasstool/freigabe.html#gibtsnicht', 'ein unbekannter Code führt zur gemerkten Seite (die es erklärt)');
pruefe(Aufmass_Freigaben::umleitung_ziel('../x') === '', 'ein unbrauchbarer Code führt nirgendwohin');
pruefe(Aufmass_Freigaben::umleitung_ziel('a b') === '', 'auch mit Leerzeichen nicht');

echo "\n== Drosselung beim Übertragen ==\n";
$_SERVER['REMOTE_ADDR'] = '10.0.0.9';
$fs = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
$letzter = null;
for ($i = 0; $i < 12; $i++) { $letzter = Aufmass_Freigaben::antwort_annehmen($fs['code'], antwort(array('a' => '1:1')), 'Frau Fleißig', ''); }
pruefe(!is_wp_error($letzter), 'zwölf Übertragungen in zehn Minuten gehen durch', fehlertext($letzter));
$e = Aufmass_Freigaben::antwort_annehmen($fs['code'], antwort(array('a' => '1:1')), 'Frau Fleißig', '');
pruefe(is_wp_error($e) && status_von($e) === 429, 'die dreizehnte wird gedrosselt', fehlertext($e));
$_SERVER['REMOTE_ADDR'] = '10.0.0.1';

echo "\n== Herkunft für die Drosselung ==\n";
$_SERVER['REMOTE_ADDR'] = '2001:db8:abcd:1234:1111:2222:3333:4444';
$h1 = Aufmass_Freigaben::herkunft();
$_SERVER['REMOTE_ADDR'] = '2001:db8:abcd:1234:ffff:eeee:dddd:cccc';
$h2 = Aufmass_Freigaben::herkunft();
$_SERVER['REMOTE_ADDR'] = '2001:db8:abcd:1235::1';
$h3 = Aufmass_Freigaben::herkunft();
pruefe($h1 === $h2, 'zwei IPv6-Adressen aus demselben /64-Netz zählen als eine Herkunft', "$h1 / $h2");
pruefe($h1 !== $h3, 'ein anderes /64-Netz zählt getrennt', "$h1 / $h3");
$_SERVER['REMOTE_ADDR'] = '203.0.113.7';
pruefe(Aufmass_Freigaben::herkunft() === 'v4:203.0.113.7', 'IPv4 zählt je Adresse', Aufmass_Freigaben::herkunft());
unset($_SERVER['REMOTE_ADDR']);
pruefe(Aufmass_Freigaben::herkunft() === 'unbekannt', 'ohne Adresse: unbekannt');
$_SERVER['REMOTE_ADDR'] = '10.0.0.1';

echo "\n== Drosselung auch für gültige Aufrufe ==\n";
$_SERVER['REMOTE_ADDR'] = '10.0.0.20';
$fl = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
$letzter = null;
for ($i = 0; $i < 120; $i++) { $letzter = Aufmass_Freigaben::oeffentlich($fl['code']); }
pruefe(!is_wp_error($letzter), '120 Aufrufe in zehn Minuten gehen durch', fehlertext($letzter));
$k = Aufmass_Freigaben::oeffentlich($fl['code']);
pruefe(is_wp_error($k) && status_von($k) === 429, 'der 121. wird gedrosselt', fehlertext($k));
$_SERVER['REMOTE_ADDR'] = '10.0.0.21';
pruefe(!is_wp_error(Aufmass_Freigaben::oeffentlich($fl['code'])), 'eine andere Herkunft darf weiter lesen');

echo "\n== Je Link höchstens 40 Übertragungen am Tag - egal woher ==\n";
$fk = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
$angenommen = 0;
for ($i = 0; $i < 40; $i++) {
    /* jede Übertragung von einer anderen Herkunft - die Drossel je Herkunft greift nicht */
    $_SERVER['REMOTE_ADDR'] = '198.51.100.' . ($i + 1);
    $a = Aufmass_Freigaben::antwort_annehmen($fk['code'], antwort(array('a' => '1:1')), 'Herr Fleißig', '');
    if (!is_wp_error($a)) { $angenommen++; }
}
pruefe($angenommen === 40, '40 Übertragungen von 40 Herkünften werden angenommen', (string) $angenommen);
$_SERVER['REMOTE_ADDR'] = '198.51.100.250';
$e = Aufmass_Freigaben::antwort_annehmen($fk['code'], antwort(array('a' => '1:1')), 'Herr Fleißig', '');
pruefe(is_wp_error($e) && status_von($e) === 429, 'die 41. wird abgewiesen, obwohl die Herkunft neu ist', fehlertext($e));
$anzahlMails = count($GLOBALS['wp_mails']);
$e = Aufmass_Freigaben::antwort_annehmen($fk['code'], antwort(array('a' => '1:1')), 'Herr Fleißig', '');
pruefe(count($GLOBALS['wp_mails']) === $anzahlMails, 'und löst keine E-Mail mehr aus');
$_SERVER['REMOTE_ADDR'] = '10.0.0.1';

echo "\n== Die E-Mail bleibt sauber, was auch immer der Kunde eingibt ==\n";
Aufmass_Projekte::speichern('prj-m', array('id' => 'prj-m', 'kunde' => "Böse\r\nBcc: opfer@example.com", 'objekt' => 'Haus',
    'tueren' => array(array('id' => 't1')), 'schliessungen' => array(array('id' => 's1'))), 0, $weber);
$fm = Aufmass_Freigaben::anlegen('prj-m', array('f' => 1, 'pid' => 'prj-m', 't' => array(array('t1', '1', 'Tür', '')),
    's' => array(array('s1', 'A', 'A', '', array('a' => '', 'g' => '', 'p' => array()))), 'm' => '0', 'e' => '1'), '', $weber);
$lang = str_repeat('Sehr lange Anmerkung. ', 60);
$a = Aufmass_Freigaben::antwort_annehmen($fm['code'],
    array('f' => 1, 'pid' => 'prj-m', 'typ' => 'antwort', 'tIds' => array('t1'), 'sIds' => array('s1'), 'a' => '0:1'),
    "Herr\nUmbruch\r\nSubject: Gewonnen", "Bitte hier klicken: http://boese.example\n" . $lang);
pruefe(!is_wp_error($a), 'Vorbereitung: Übertragung angenommen', fehlertext($a));
$m = $GLOBALS['wp_mails'][count($GLOBALS['wp_mails']) - 1];
pruefe(strpos($m['betreff'], "\n") === false && strpos($m['betreff'], "\r") === false, 'der Betreff enthält keinen Zeilenumbruch', json_encode($m['betreff']));
pruefe(strpos($m['betreff'], 'Bcc:') !== false && strpos($m['betreff'], "\r\n") === false, 'ein eingeschleuster Zeilenumbruch im Kundennamen des Aufmaßes wird zu einem Leerzeichen', json_encode($m['betreff']));
pruefe(strpos($m['text'], 'Herr Umbruch Subject: Gewonnen') !== false, 'der Name des Kunden steht einzeilig im Text', json_encode($m['text']));
pruefe(strpos($m['text'], 'ungeprüft') !== false, 'der Text kennzeichnet die Angaben des Kunden als ungeprüft');
pruefe(strpos($m['text'], '[…]') !== false && strpos($m['text'], $lang) === false, 'eine überlange Anmerkung wird in der Mail gekürzt');
pruefe(strpos($m['text'], 'http://boese.example') !== false, 'der Inhalt selbst bleibt sichtbar - gekennzeichnet, nicht versteckt');

echo "\n== Aufräumen ==\n";
$alt = gmdate('Y-m-d H:i:s', time() - 200 * 86400) . '.000000';
$wpdb->update('wp_aufmass_freigaben', array('geaendert_am' => $alt), array('code' => $f0['code']));          /* zurückgezogen, alt */
$wpdb->update('wp_aufmass_freigaben', array('gueltig_bis' => $alt, 'status' => 'beantwortet'), array('code' => $fa['code']));  /* abgelaufen, aber mit wartender Antwort */
/* Ein gestern abgelaufener, nie beantworteter Link: bleibt als Eintrag, verliert aber seine Plandaten */
$fb = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
$wpdb->update('wp_aufmass_freigaben', array('gueltig_bis' => gmdate('Y-m-d H:i:s', time() - 86400) . '.000000'), array('code' => $fb['code']));
$vorher = (int) $wpdb->get_var('SELECT COUNT(*) FROM wp_aufmass_freigaben');
Aufmass_Freigaben::aufraeumen();
$zb = Aufmass_Freigaben::zeile($fb['code']);
pruefe($zb !== null && $zb['daten'] === '', 'ein frisch abgelaufener Link verliert sofort seine Plandaten', $zb ? strlen($zb['daten']) . ' Zeichen' : 'weg');
$k = Aufmass_Freigaben::oeffentlich($fb['code']);
pruefe(is_wp_error($k) && $k->get_error_code() === 'abgelaufen' && status_von($k) === 410, 'der Kunde sieht dann „abgelaufen“ - keinen Serverfehler', fehlertext($k));
$lb = array_values(array_filter(Aufmass_Freigaben::liste('prj-f'), function ($x) use ($fb) { return $x['code'] === $fb['code']; }));
pruefe(count($lb) === 1 && $lb[0]['status'] === 'abgelaufen', 'und im Werkzeug steht er als abgelaufen', json_encode($lb));
pruefe(Aufmass_Freigaben::zeile($fa['code'])['daten'] !== '', 'die Plandaten einer wartenden Antwort bleiben bis zur Prüfung');
$nachher = (int) $wpdb->get_var('SELECT COUNT(*) FROM wp_aufmass_freigaben');
pruefe($nachher === $vorher - 1, 'eine alte, zurückgezogene Freigabe wird gelöscht', "$vorher -> $nachher");
pruefe(Aufmass_Freigaben::zeile($f0['code']) === null, 'und zwar genau die');
pruefe(Aufmass_Freigaben::zeile($fa['code']) !== null, 'eine abgelaufene mit wartender Antwort bleibt');
pruefe(Aufmass_Freigaben::zeile($code) !== null, 'frisch Erledigtes bleibt');

echo "\n== Papierkorb leeren ==\n";
/* Zwei gelöschte Aufmaße mit Foto und Freigabe: eines seit 100 Tagen im
   Papierkorb, eines seit gestern. Nur das alte ist fällig. */
$jpeg = "\xFF\xD8\xFF\xE0" . str_repeat("\x00", 200) . "\xFF\xD9";
$pfade = array();
foreach (array('prj-alt' => 100, 'prj-jung' => 1) as $pid => $tage) {
    $e = Aufmass_Projekte::speichern($pid, array('id' => $pid, 'kunde' => 'K', 'objekt' => 'O',
        'tueren' => array(array('id' => 't1')), 'schliessungen' => array(array('id' => 's1'))), 0, $weber);
    pruefe(!is_wp_error($e), "Vorbereitung: $pid liegt", fehlertext($e));
    $e = Aufmass_Fotos::speichern('foto-' . $pid, $pid, 't1', $jpeg, 'image/jpeg', $weber);
    pruefe(!is_wp_error($e), "Vorbereitung: $pid hat ein Foto", fehlertext($e));
    $pfade[$pid] = Aufmass_Fotos::holen('foto-' . $pid)['pfad'];
    $e = Aufmass_Freigaben::anlegen($pid, array('f' => 1, 'pid' => $pid, 't' => array(array('t1', '1', 'Tür', '')),
        's' => array(array('s1', 'A', 'A', '', array('a' => '', 'g' => '', 'p' => array()))), 'm' => '0', 'e' => '1'), '', $weber);
    pruefe(!is_wp_error($e), "Vorbereitung: $pid hat eine Freigabe", fehlertext($e));
    $e = Aufmass_Projekte::loeschen($pid, $weber);
    pruefe(!is_wp_error($e), "Vorbereitung: $pid liegt im Papierkorb", fehlertext($e));
    $wpdb->update('wp_aufmass_projekte', array('geloescht_am' => gmdate('Y-m-d H:i:s', time() - $tage * 86400) . '.000000'), array('id' => $pid));
}
pruefe(file_exists($pfade['prj-alt']) && file_exists($pfade['prj-jung']), 'Vorbereitung: beide Fotodateien liegen auf der Platte');
$n = Aufmass_Projekte::papierkorb_leeren();
pruefe($n === 1, 'genau ein Aufmaß war fällig', $n);
pruefe(Aufmass_Projekte::laden('prj-alt') === null, 'das alte ist endgültig weg');
pruefe(count(Aufmass_Fotos::vorhandene('prj-alt')) === 0 && !file_exists($pfade['prj-alt']), 'samt Foto - auch die Datei auf der Platte');
pruefe(count(Aufmass_Freigaben::liste('prj-alt')) === 0, 'samt Freigaben');
pruefe((int) $wpdb->get_var("SELECT COUNT(*) FROM wp_aufmass_zustaendig WHERE projekt_id = 'prj-alt'") === 0, 'samt Zuständigkeiten');
$jung = Aufmass_Projekte::laden('prj-jung');
pruefe($jung !== null && $jung['geloescht'] === true, 'das junge bleibt im Papierkorb');
pruefe(count(Aufmass_Fotos::vorhandene('prj-jung')) === 1 && file_exists($pfade['prj-jung']) && count(Aufmass_Freigaben::liste('prj-jung')) === 1,
    'mit Foto und Freigabe');
pruefe(Aufmass_Projekte::papierkorb_leeren(0) >= 1 && Aufmass_Projekte::laden('prj-jung') === null && !file_exists($pfade['prj-jung']),
    'mit Frist 0 wird auch das junge samt Foto geleert');

echo "\nErgebnis Freigaben: $ok ok, $fehler Fehler\n";
exit($fehler ? 1 : 0);
