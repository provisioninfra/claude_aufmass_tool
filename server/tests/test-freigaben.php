<?php
/* Prüft freigaben.php: Anlegen, Rechte, Kundenseite, Antworten mit
   Mitarbeitern/Gruppen/neuen Spalten, Vorlage und verbindliche Freigabe,
   Übernehmen, Verwerfen, Zurückziehen, Drosselung, Aufräumen. */
require_once __DIR__ . '/wp-attrappe.php';

$ok = 0; $fehler = 0;
function pruefe($b, $t, $i = '') {
    global $ok, $fehler;
    if ($b) { $ok++; echo "  OK   $t\n"; }
    else { $fehler++; echo "  FEHL $t" . ($i !== '' ? "\n         -> $i" : '') . "\n"; }
}
function fehlertext($e) {
    return is_wp_error($e) ? ($e->get_error_code() . ': ' . $e->get_error_message()) : json_encode($e, JSON_UNESCAPED_UNICODE);
}
function status_von($e) { $d = is_wp_error($e) ? $e->get_error_data() : array(); return isset($d['status']) ? $d['status'] : 0; }

$weber  = test_benutzer('u-weber', 'M. Weber');
$kraus  = test_benutzer('u-kraus', 'J. Kraus');
$fremd  = test_benutzer('u-fremd', 'F. Fremd');
$chefin = test_benutzer('u-chefin', 'Dr. Schäfer', 'verwaltung');

/* Ein Aufmaß mit drei Türen und drei Spalten */
$projekt = array('id' => 'prj-f', 'kunde' => 'Müller & Söhne GmbH', 'objekt' => 'Königsallee 47',
    'tueren' => array(array('id' => 't1'), array('id' => 't2'), array('id' => 't3')),
    'schliessungen' => array(array('id' => 's1'), array('id' => 's2'), array('id' => 's3')),
    'mitarbeiter' => array(), 'gruppen' => array(),
    'standorte' => array(), 'matrix' => array());
$e = Aufmass_Projekte::speichern('prj-f', $projekt, 0, $weber);
pruefe(!is_wp_error($e), 'Vorbereitung: das Aufmaß liegt auf dem Server', fehlertext($e));

/* Freigabedaten, wie sie freigabe.js erzeugt: Spalte s2 ist freigegeben,
   der Kunde darf Mitarbeiter und Gruppen pflegen und Spalten aufnehmen */
function freigabedaten($zusatz = array()) {
    return array_merge(array(
        'f' => 2, 'pid' => 'prj-f', 'kunde' => 'Müller & Söhne GmbH', 'objekt' => 'Königsallee 47',
        'anlage' => 'SA-1', 'hinweis' => 'Bitte nur Reinigung', 'frist' => '30.11.2026', 'firma' => 'Provision Infra GmbH',
        'r' => array('m' => 1, 'g' => 1, 's' => 1),
        'mt' => array('Transponder', 'Karte', '', 'Transponder'),
        'gr' => array(array('g1', 'EDV'), array('g2', 'Verwaltung')),
        'ma' => array(
            array('m1', 'Herr Özdemir', array('g1'), array(array('Transponder', 2))),
            array('m2', 'Frau Adler', array('g1', 'g2'), array()),
            array('m3', '   ', array(), array())
        ),
        't' => array(array('t1', '01', 'Haupteingang', 'EG'), array('t2', '02', 'Büro', 'EG'), array('t3', '03', 'Lager', 'UG')),
        's' => array(
            array('s1', 'GHS', 'Generalhauptschlüssel', 'Dr. Schäfer', 'schliessung', ''),
            array('s2', 'HM', 'Hausmeister', 'Mitarbeiter', 'mitarbeiter', 'm1'),
            array('s3', 'IT', 'EDV', 'Gruppe · 2 Mitglieder', 'gruppe', 'g1')
        ),
        'm' => '0~9',            /* neun Nullen, lauflängenkodiert */
        'e' => '010010010'       /* nur die mittlere Spalte ist frei */
    ), $zusatz);
}

echo "\n== Lauflängen und Listen wie in freigabe.js ==\n";
pruefe(Aufmass_Freigaben::entpacken('0~9') === '000000000', 'eine Wiederholung wird aufgelöst', Aufmass_Freigaben::entpacken('0~9'));
pruefe(Aufmass_Freigaben::entpacken('a~2b1~4') === 'aab1111', 'gemischt wie das Original', Aufmass_Freigaben::entpacken('a~2b1~4'));
pruefe(Aufmass_Freigaben::entpacken('') === '', 'leer bleibt leer');
pruefe(Aufmass_Freigaben::packen('000000000') === '0~9' && Aufmass_Freigaben::packen('aab1111') === 'aab1~4', 'packen ist das Gegenstück', Aufmass_Freigaben::packen('aab1111'));
pruefe(Aufmass_Freigaben::entpacken(Aufmass_Freigaben::packen(str_repeat('0', 100) . '1' . str_repeat('2', 36))) === str_repeat('0', 100) . '1' . str_repeat('2', 36), 'packen und entpacken sind umkehrbar');
$ma = Aufmass_Freigaben::mitarbeiter_bereinigen(array(array('  m1 ', 'Frau Neu ', array('g1', 'g1', 'böse id!'), array(array('Karte', '3'), array('Karte', 2), array('', 0))),
    array('', 'leer', array(), array()), array('m2', '', array(), array()), array('m2', "Funk\ttion", 'keine Liste', 5), 'unsinn'), false);
pruefe(count($ma) === 3, 'Mitarbeiter ohne Namen und Unsinn fallen heraus', json_encode($ma));
pruefe($ma[0][0] === 'm1' && $ma[0][2] === array('g1') && $ma[0][3] === array(array('Karte', 5), array('', 1)),
    'Kennung beschnitten, Gruppen entdoppelt und bereinigt, Medien zusammengezogen', json_encode($ma[0]));
pruefe($ma[2][1] === 'Funk tion' && $ma[2][2] === array() && $ma[2][3] === array(), 'Steuerzeichen werden zu Leerzeichen, Unbrauchbares zu leeren Listen', json_encode($ma[2]));
pruefe($ma[1][0] === '' && $ma[1][1] === 'leer', 'ein Eintrag ohne Kennung bleibt - er gilt beim Übernehmen als neu', json_encode($ma[1]));
$gr = Aufmass_Freigaben::gruppen_bereinigen(array(array('g1', ' EDV '), array('g1', 'doppelt'), array('', 'ohne Kennung'), array('g2', '')), false);
pruefe(count($gr) === 2 && $gr[0][1] === 'EDV' && $gr[1][0] === '', 'Gruppen werden bereinigt und entdoppelt', json_encode($gr));
pruefe(Aufmass_Freigaben::rechte_bereinigen(array('m' => '1', 'x' => 1)) === array('m' => 1, 'g' => 0, 's' => 0), 'Rechte werden auf m/g/s zurechtgestutzt');

echo "\n== Anlegen ==\n";
$e = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $fremd);
pruefe(is_wp_error($e) && status_von($e) === 403, 'ein Unzuständiger darf nicht freigeben', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-x', freigabedaten(array('pid' => 'prj-x')), '', $weber);
pruefe(is_wp_error($e) && status_von($e) === 404, 'ein unbekanntes Aufmaß gibt 404', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(array('pid' => 'prj-y')), '', $weber);
pruefe(is_wp_error($e) && $e->get_error_code() === 'projekt_falsch', 'Daten eines anderen Aufmaßes werden abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(array('f' => 1)), '', $weber);
pruefe(is_wp_error($e) && $e->get_error_code() === 'format', 'das alte Format 1 wird abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(array('m' => '0~8')), '', $weber);
pruefe(is_wp_error($e) && $e->get_error_code() === 'matrix_unvollstaendig', 'eine Matrix falscher Größe wird abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(array('e' => '01001001x')), '', $weber);
pruefe(is_wp_error($e) && $e->get_error_code() === 'matrix_unlesbar', 'eine Maske mit fremden Zeichen wird abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::anlegen('prj-f', null, '', $weber);
pruefe(is_wp_error($e) && status_von($e) === 400, 'ohne Daten gibt es 400', fehlertext($e));

$f = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), 'http://example.test/aufmasstool/freigabe.html', $weber);
pruefe(!is_wp_error($f), 'der Zuständige legt eine Freigabe an', fehlertext($f));
$code = $f['code'];
pruefe(strlen($code) === 10 && preg_match('/^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/', $code) === 1,
    'der Code hat zehn Zeichen ohne verwechselbare', $code);
pruefe($f['status'] === 'offen', 'die Freigabe ist offen', $f['status']);
pruefe($f['rechte'] === array('m' => 1, 'g' => 1, 's' => 1), 'die Rechte stehen in der Beschreibung', json_encode($f['rechte']));
pruefe($f['freigabe'] === null && $f['vorgelegtAm'] === '', 'noch keine Freigabe, nicht vorgelegt');
pruefe($f['kurzlink'] === 'http://example.test/?aufmass_f=' . $code, 'ohne sprechende Permalinks führt der Kurzlink über die Abfragevariable', $f['kurzlink']);
pruefe($f['link'] === 'http://example.test/aufmasstool/freigabe.html#' . $code, 'der lange Link zeigt auf die Seite mit dem Code im Anker', $f['link']);
pruefe($f['erstelltVon'] === 'M. Weber', 'der Ersteller wird genannt', $f['erstelltVon']);
$bis = strtotime(substr($f['gueltigBis'], 0, 19) . ' UTC');
pruefe(abs($bis - (time() + 30 * 86400)) < 120, 'gültig für 30 Tage', $f['gueltigBis']);
pruefe(get_option('aufmass_freigabe_seite') === 'http://example.test/aufmasstool/freigabe.html', 'die Seite wird für unbekannte Codes gemerkt');

update_option('permalink_structure', '/%postname%/');
pruefe(Aufmass_Freigaben::kurzlink($code) === 'http://example.test/f/' . $code, 'mit sprechenden Permalinks lautet der Kurzlink /f/CODE', Aufmass_Freigaben::kurzlink($code));
update_option('permalink_structure', '');

pruefe(Aufmass_Freigaben::seite_pruefen('https://boese.example/freigabe.html') === 'http://example.test/aufmasstool/freigabe.html',
    'eine fremde Seite wird durch die Vorgabe ersetzt (keine offene Weiterleitung)');
pruefe(Aufmass_Freigaben::seite_pruefen('http://example.test/werkzeug/freigabe.html?x=1') === 'http://example.test/aufmasstool/freigabe.html',
    'Abfrageteile sind nicht erlaubt');
pruefe(Aufmass_Freigaben::seite_pruefen('http://example.test/werkzeug/freigabe.html') === 'http://example.test/werkzeug/freigabe.html',
    'eine eigene Seite in einem anderen Ordner geht');
pruefe(Aufmass_Freigaben::seite_pruefen('http://example.test/a/../freigabe.html') === 'http://example.test/aufmasstool/freigabe.html',
    'Punkt-Punkt wird nicht angenommen');
pruefe(Aufmass_Freigaben::seite_pruefen('javascript:alert(1)') === 'http://example.test/aufmasstool/freigabe.html',
    'ein Skript-Link wird nicht angenommen');
pruefe(Aufmass_Freigaben::seite_pruefen('') === 'http://example.test/aufmasstool/freigabe.html', 'leer ergibt die Vorgabe');

update_option('aufmass_freigabe_tage', '0');
$f0 = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
pruefe(!is_wp_error($f0) && $f0['gueltigBis'] === '', '0 Tage heißt unbegrenzt', fehlertext($f0));
update_option('aufmass_freigabe_tage', '14');
$f14 = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
pruefe(!is_wp_error($f14) && abs(strtotime(substr($f14['gueltigBis'], 0, 19) . ' UTC') - (time() + 14 * 86400)) < 120, '14 Tage werden übernommen', $f14['gueltigBis']);
delete_option('aufmass_freigabe_tage');
pruefe(Aufmass_Freigaben::tage() === 30, 'die Vorgabe ist 30 Tage');

echo "\n== Der Kunde holt die Freigabe ==\n";
$k = Aufmass_Freigaben::oeffentlich($code);
pruefe(!is_wp_error($k), 'der Kunde bekommt die Freigabe', fehlertext($k));
pruefe($k['status'] === 'offen' && $k['antwort'] === null, 'offen, noch ohne Antwort');
pruefe($k['daten']['f'] === 2 && count($k['daten']['t']) === 3 && count($k['daten']['s']) === 3, 'mit Türen und Spalten');
pruefe($k['daten']['m'] === '0~9' && $k['daten']['e'] === '010010010', 'Matrix und Maske reisen unverändert mit');
pruefe($k['rechte'] === array('m' => 1, 'g' => 1, 's' => 1) && $k['daten']['r'] === array('m' => 1, 'g' => 1, 's' => 1), 'die Rechte sind dabei');
pruefe(count($k['daten']['ma']) === 2 && $k['daten']['ma'][0][1] === 'Herr Özdemir' && count($k['daten']['gr']) === 2, 'Mitarbeiter und Gruppen sind bereinigt dabei (der namenlose fehlt)', json_encode($k['daten']['ma']));
pruefe($k['daten']['mt'] === array('Transponder', 'Karte'), 'die Medienarten sind entdoppelt und ohne Leere', json_encode($k['daten']['mt']));
pruefe($k['daten']['s'][2][4] === 'gruppe' && $k['daten']['s'][2][5] === 'g1' && $k['daten']['s'][0][5] === '', 'jede Spalte nennt Art und Kennung dahinter');
pruefe($k['daten']['firma'] === 'Provision Infra GmbH', 'die Firma für die Anrede ist dabei');
$k = Aufmass_Freigaben::oeffentlich(strtoupper($code));
pruefe(!is_wp_error($k), 'Großschreibung im Code ist egal', fehlertext($k));
$k = Aufmass_Freigaben::oeffentlich('gibtsnicht1');
pruefe(is_wp_error($k) && status_von($k) === 404, 'ein unbekannter Code gibt 404', fehlertext($k));
$k = Aufmass_Freigaben::oeffentlich('../x');
pruefe(is_wp_error($k) && status_von($k) === 404, 'ein unbrauchbarer Code gibt 404', fehlertext($k));

echo "\n== Drosselung beim Raten ==\n";
$_SERVER['REMOTE_ADDR'] = '10.0.0.2';
$letzter = null;
for ($i = 0; $i < 30; $i++) { $letzter = Aufmass_Freigaben::oeffentlich('raten' . str_pad((string) $i, 5, '0', STR_PAD_LEFT)); }
pruefe(is_wp_error($letzter) && status_von($letzter) === 404, 'die ersten 30 Fehlversuche bekommen 404', fehlertext($letzter));
$k = Aufmass_Freigaben::oeffentlich('ratenxxxxx');
pruefe(is_wp_error($k) && status_von($k) === 429, 'der 31. Versuch wird gedrosselt (429)', fehlertext($k));
$k = Aufmass_Freigaben::oeffentlich($code);
pruefe(!is_wp_error($k), 'ein richtiger Code geht trotzdem - die Drossel gilt nur dem Raten', fehlertext($k));
$_SERVER['REMOTE_ADDR'] = '10.0.0.3';
$k = Aufmass_Freigaben::oeffentlich('ratenyyyyy');
pruefe(is_wp_error($k) && status_von($k) === 404, 'eine andere Herkunft zählt getrennt', fehlertext($k));
$_SERVER['REMOTE_ADDR'] = '10.0.0.1';

echo "\n== Antworten: nur, was freigegeben war ==\n";
function antwort($zusatz = array()) {
    return array_merge(array('f' => 2, 'pid' => 'prj-f', 'typ' => 'antwort', 'anzahl' => '3x3',
        'tIds' => array('t1', 't2', 't3'), 'sIds' => array('s1', 's2', 's3'), 'a' => '', 'gesendet' => '2026-10-12T08:00:00Z'), $zusatz);
}
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '1:1')), '', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'name_fehlt' && status_von($e) === 400, 'ohne Namen geht nichts', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '1:1')), "  \n ", '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'name_fehlt', 'nur Leerraum ist kein Name', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '0:1')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_freigegeben', 'ein nicht freigegebenes Feld weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => 'zz:1')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'ein Feld außerhalb der Matrix weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '1:7')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'ein unbekannter Berechtigungswert weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => 'kauderwelsch')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'Kauderwelsch weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('tIds' => array('t1', 't2', 'tx'))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'veraltet', 'andere Türkennungen passen nicht zur Freigabe', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('pid' => 'prj-x')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'projekt_falsch', 'ein anderes Aufmaß passt nicht', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('typ' => 'plan')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'nur Antworten werden angenommen', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('f' => 1)), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'eine Antwort aus Format 1 wird abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('ma' => 'x')), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'eine Mitarbeiterliste, die keine Liste ist, weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('ma' => array(array('m9', 'Eindringling', array(), array())))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'eine erfundene Mitarbeiterkennung weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('max' => array('m9'))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'das Entfernen einer unbekannten Kennung weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('n' => array(array('gruppe', 'g1', '111')))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'eine neue Spalte für eine Gruppe, die schon eine hat, weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('n' => array(array('gruppe', 'g2', '11')))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'eine neue Spalte mit falscher Zeilenzahl weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('n' => array(array('gruppe', 'g9', '111')))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'unlesbar', 'eine neue Spalte für eine unbekannte Gruppe weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('fr' => array('name' => ' '))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'name_fehlt', 'eine Freigabe ohne Namen weist die Antwort ab', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, null, 'Frau Kunde', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'antwort_fehlt', 'ohne Antwort gibt es eine klare Meldung', fehlertext($e));
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => str_repeat('1:1,', 100000))), 'Frau Kunde', '');
pruefe(is_wp_error($e) && status_von($e) === 413, 'eine überlange Antwort wird abgewiesen (413)', fehlertext($e));
pruefe(Aufmass_Freigaben::zeile($code)['status'] === 'offen', 'keiner der abgewiesenen Versuche hat etwas verändert');
pruefe(count($GLOBALS['wp_mails']) === 0, 'und keiner hat eine E-Mail ausgelöst');

/* Ohne Rechte wird jede Liste abgewiesen */
$fo = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(array('r' => array())), '', $weber);
pruefe(!is_wp_error($fo) && $fo['rechte'] === array('m' => 0, 'g' => 0, 's' => 0), 'ein Link ohne Rechte', fehlertext($fo));
foreach (array('ma' => array(), 'max' => array('m1'), 'gr' => array(), 'grx' => array('g2'), 'n' => array(array('gruppe', 'g2', '111'))) as $feld => $wert) {
    $e = Aufmass_Freigaben::antwort_annehmen($fo['code'], antwort(array($feld => $wert)), 'Frau Kunde', '');
    pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_freigegeben', "ohne Recht wird '$feld' abgewiesen", fehlertext($e));
}
$e = Aufmass_Freigaben::antwort_annehmen($fo['code'], antwort(array('a' => '1:1')), 'Frau Kunde', '');
pruefe(!is_wp_error($e) && $e['listen'] === 0, 'Berechtigungen gehen auch ohne Listenrechte', fehlertext($e));
pruefe(!is_wp_error(Aufmass_Freigaben::verwerfen($fo['code'], 1, $weber)), 'Vorbereitung: diese Rückmeldung wird wieder verworfen');

echo "\n== Eine gute Antwort mit Listen, neuer Spalte und Freigabe ==\n";
$GLOBALS['wp_mails'] = array();
$a = Aufmass_Freigaben::antwort_annehmen($code,
    antwort(array('a' => '1:1,4:2,7:1,4:0',
        'ma' => array(
            array('m1', 'Herr Özdemir', array('g1', 'neu-g1', 'g9'), array(array('Transponder', 3))),
            array('m2', 'Frau Adler', array('g1', 'g2'), array()),
            array('neu-ab12', 'Frau Neu', array('neu-g1'), array(array('Karte', 1), array('Karte', 1))),
            array('', 'leer', array(), array())
        ),
        'max' => array('m2', 'm2'),
        'gr' => array(array('g1', 'EDV'), array('g2', 'Verwaltung (neu)'), array('neu-g1', 'Empfang'), array('neu-g2', '  ')),
        'n' => array(array('gruppe', 'neu-g1', '1~3'), array('mitarbeiter', 'neu-ab12', '002')),
        'fr' => array('name' => "Frau\nChefin", 'funktion' => 'GF', 'art' => 'erfunden'))),
    "  Frau   Kundig \n Zeile2 ", "Bitte den Hausmeister\nmit 3 Schlüsseln.");
pruefe(!is_wp_error($a), 'die Antwort wird angenommen', fehlertext($a));
pruefe($a['ok'] === true && $a['antwortNr'] === 1 && $a['freigabe'] === true, 'als erste Rückmeldung, mit Freigabe', json_encode($a));
pruefe($a['anzahl'] === 2 && $a['listen'] === 4, 'zwei Berechtigungen (4:0 hebt 4:2 wieder auf), zwei Listen und zwei neue Spalten', json_encode($a));
$z = Aufmass_Freigaben::zeile($code);
pruefe($z['status'] === 'beantwortet', 'die Freigabe ist jetzt beantwortet', $z['status']);
pruefe($z['antwort_name'] === 'Frau Kundig Zeile2', 'der Name wird einzeilig und beschnitten abgelegt', json_encode($z['antwort_name']));
pruefe($z['freigabe_name'] === 'Frau Chefin' && $z['freigabe_funktion'] === 'GF' && $z['freigabe_art'] === 'mit_antwort' && $z['freigabe_am'] !== null,
    'die verbindliche Freigabe ist mit Name und Funktion vermerkt - die Art stellt der Server', json_encode(array($z['freigabe_name'], $z['freigabe_funktion'], $z['freigabe_art'])));
$gespeichert = json_decode($z['antwort'], true);
pruefe($gespeichert['a'] === '1:1,7:1', 'abgelegt wird die bereinigte Antwort', $gespeichert['a']);
pruefe(count($gespeichert['ma']) === 4 && $gespeichert['ma'][0][2] === array('g1', 'neu-g1') && $gespeichert['ma'][2][3] === array(array('Karte', 2)),
    'die Mitarbeiterliste ist bereinigt: unbekannte Gruppen weg, neue Gruppen erlaubt, Medien zusammengezogen', json_encode($gespeichert['ma']));
pruefe($gespeichert['max'] === array('m2') && count($gespeichert['gr']) === 3 && !isset($gespeichert['grx']),
    'Entfernte entdoppelt, Gruppen ohne Namen weg', json_encode(array($gespeichert['max'], $gespeichert['gr'])));
pruefe($gespeichert['n'] === array(array('gruppe', 'neu-g1', '111'), array('mitarbeiter', 'neu-ab12', '002')), 'neue Spalten reisen mit (drei Zeilen: noch ohne Lauflänge)', json_encode($gespeichert['n']));
pruefe($gespeichert['fr'] === array('name' => 'Frau Chefin', 'funktion' => 'GF', 'art' => 'mit_antwort'), 'die Freigabe steht bereinigt in der Antwort', json_encode($gespeichert['fr']));
pruefe($gespeichert['gesendet'] !== '2026-10-12T08:00:00Z', 'die Sendezeit stellt der Server, nicht der Kunde');

pruefe(count($GLOBALS['wp_mails']) === 1, 'genau eine E-Mail wurde ausgelöst', count($GLOBALS['wp_mails']));
$m = $GLOBALS['wp_mails'][0];
pruefe($m['an'] === array('u-weber@provision-infra.de'), 'an den Ersteller (der auch zuständig ist, nur einmal)', json_encode($m['an']));
pruefe(strpos($m['betreff'], 'Verbindliche Freigabe') === 0 && strpos($m['betreff'], 'Müller & Söhne GmbH') !== false, 'der Betreff nennt die Freigabe und das Aufmaß', $m['betreff']);
pruefe(strpos($m['text'], 'Frau Kundig') !== false && strpos($m['text'], 'Bitte den Hausmeister') !== false && strpos($m['text'], 'GF') !== false, 'der Text nennt Name, Funktion und Anmerkung');
pruefe(strpos($m['text'], '2 Berechtigungen, 4 Listen bzw. neue Spalten') !== false, 'und zählt die Änderungen', $m['text']);
pruefe(strpos($m['text'], 'danach ist der Link für den Kunden gesperrt') !== false, 'und sagt, dass der Link danach gesperrt ist');
pruefe(is_array($m['kopf']) && $m['kopf'][0] === 'Content-Type: text/plain; charset=UTF-8', 'als reiner Text');

echo "\n== Nach einer Freigabe darf der Kunde nicht mehr ==\n";
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '1:1')), 'Frau Kundig', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'freigegeben' && status_von($e) === 409, 'auch vor der Prüfung ist der Link für Änderungen zu', fehlertext($e));
$k = Aufmass_Freigaben::oeffentlich($code);
pruefe($k['status'] === 'beantwortet' && isset($k['antwort']['fr']) && $k['freigabe']['name'] === 'Frau Chefin', 'der Kunde sieht seine Freigabe', json_encode($k['freigabe']));

echo "\n== Wartende Antworten: nur für die, die übernehmen dürfen ==\n";
$o = Aufmass_Freigaben::offene_fuer($weber);
pruefe(count($o) === 1 && $o[0]['code'] === $code && $o[0]['antwortNr'] === 1, 'der Zuständige sieht die wartende Antwort', json_encode(array_map(function ($x) { return $x['code']; }, $o)));
pruefe($o[0]['kunde'] === 'Müller & Söhne GmbH' && $o[0]['objekt'] === 'Königsallee 47', 'mit Kunde und Objekt');
pruefe(isset($o[0]['antwort']['a']) && $o[0]['antwort']['a'] === '1:1,7:1' && isset($o[0]['antwort']['n']), 'und der Antwort selbst');
pruefe($o[0]['freigabe']['art'] === 'mit_antwort', 'samt der Freigabe');
pruefe(count(Aufmass_Freigaben::offene_fuer($fremd)) === 0, 'ein Unzuständiger sieht nichts');
pruefe(count(Aufmass_Freigaben::offene_fuer($chefin)) === 1, 'die Verwaltung sieht alles');
pruefe(count(Aufmass_Freigaben::offene_fuer(null)) === 0, 'ohne Anmeldung gar nichts');
global $wpdb;
$wpdb->delete('wp_aufmass_zustaendig', array('projekt_id' => 'prj-f'));
pruefe(count(Aufmass_Freigaben::offene_fuer($fremd)) === 1, 'bei einem herrenlosen Aufmaß sieht jeder die Antwort');
pruefe(count(Aufmass_Projekte::zustaendige_von('prj-f')) === 0, 'ohne dadurch zuständig zu werden');
Aufmass_Projekte::zustaendige_setzen('prj-f', array('u-weber', 'u-kraus'), $chefin);

echo "\n== Übernehmen - mit Freigabe wird der Link zu ==\n";
$e = Aufmass_Freigaben::uebernommen_markieren($code, 1, $fremd);
pruefe(is_wp_error($e) && status_von($e) === 403, 'ein Unzuständiger darf nicht übernehmen', fehlertext($e));
$e = Aufmass_Freigaben::uebernommen_markieren($code, 2, $kraus);
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_mehr_offen' && status_von($e) === 409, 'eine falsche Antwortnummer wird nicht markiert (409)', fehlertext($e));
$d = $e->get_error_data();
pruefe(isset($d['freigabe']['antwortNr']) && $d['freigabe']['antwortNr'] === 1, 'die Meldung liefert den aktuellen Stand mit');
$e = Aufmass_Freigaben::uebernommen_markieren('gibtsnicht1', 1, $kraus);
pruefe(is_wp_error($e) && status_von($e) === 404, 'ein unbekannter Code gibt 404', fehlertext($e));
$u = Aufmass_Freigaben::uebernommen_markieren($code, 1, $kraus);
pruefe(!is_wp_error($u) && $u['status'] === 'freigegeben', 'der Zuständige übernimmt - mit Freigabe heißt der Zustand „freigegeben“', fehlertext($u));
pruefe($u['uebernommenVon'] === 'J. Kraus' && $u['uebernommenNr'] === 1 && $u['uebernommenAm'] !== '', 'mit Name, Nummer und Zeit', json_encode($u));
pruefe(count(Aufmass_Freigaben::offene_fuer($weber)) === 0, 'danach wartet nichts mehr');
$e = Aufmass_Freigaben::uebernommen_markieren($code, 1, $weber);
pruefe(is_wp_error($e) && status_von($e) === 409, 'ein zweites Übernehmen derselben Antwort wird abgewiesen', fehlertext($e));
$k = Aufmass_Freigaben::oeffentlich($code);
pruefe($k['status'] === 'freigegeben' && is_array($k['antwort']) && $k['freigabe']['name'] === 'Frau Chefin', 'der Kunde sieht: freigegeben', $k['status']);
$e = Aufmass_Freigaben::antwort_annehmen($code, antwort(array('a' => '1:1')), 'Frau Kundig', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'freigegeben', 'und kann nichts mehr übertragen', fehlertext($e));
$wpdb->update('wp_aufmass_freigaben', array('gueltig_bis' => '2020-01-01 00:00:00.000000'), array('code' => $code));
pruefe(Aufmass_Freigaben::oeffentlich($code)['status'] === 'freigegeben', 'ein freigegebener Link bleibt zur Ansicht offen, auch nach dem Ablaufdatum');
$wpdb->update('wp_aufmass_freigaben', array('gueltig_bis' => null), array('code' => $code));

echo "\n== Rückmeldung ohne Freigabe, dann Verwerfen ==\n";
$fb = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
$a = Aufmass_Freigaben::antwort_annehmen($fb['code'], antwort(array('a' => '7:2')), 'Herr Zweit', 'Nachtrag');
pruefe(!is_wp_error($a) && $a['antwortNr'] === 1 && $a['freigabe'] === false, 'eine Rückmeldung ohne Freigabe', fehlertext($a));
pruefe(strpos($GLOBALS['wp_mails'][count($GLOBALS['wp_mails']) - 1]['betreff'], 'Kundenrückmeldung') === 0, 'die E-Mail dazu heißt Kundenrückmeldung');
$u = Aufmass_Freigaben::uebernommen_markieren($fb['code'], 1, $weber);
pruefe(!is_wp_error($u) && $u['status'] === 'uebernommen', 'übernommen - ohne Freigabe bleibt der Link für den Kunden offen', fehlertext($u));
$a = Aufmass_Freigaben::antwort_annehmen($fb['code'], antwort(array('a' => '7:1', 'fr' => array('name' => 'Herr Zweit'))), 'Herr Zweit', '');
pruefe(!is_wp_error($a) && $a['antwortNr'] === 2 && $a['freigabe'] === true, 'der Kunde kann erneut übertragen - diesmal mit Freigabe', fehlertext($a));
pruefe(count(Aufmass_Freigaben::offene_fuer($weber)) === 1, 'die neue Antwort wartet wieder');
$v = Aufmass_Freigaben::verwerfen($fb['code'], 2, $weber);
pruefe(!is_wp_error($v) && $v['status'] === 'verworfen' && $v['freigabe'] === null, 'der Zuständige verwirft - die Freigabe gilt damit nicht', fehlertext($v));
pruefe(count(Aufmass_Freigaben::offene_fuer($weber)) === 0, 'danach wartet nichts');
$k = Aufmass_Freigaben::oeffentlich($fb['code']);
pruefe($k['status'] === 'offen' && $k['antwort'] === null && $k['freigabe'] === null, 'der Kunde sieht die Freigabe wieder als offen, ohne die verworfene Antwort', $k['status']);
$a = Aufmass_Freigaben::antwort_annehmen($fb['code'], antwort(array('a' => '7:1')), 'Herr Zweit', '');
pruefe(!is_wp_error($a) && $a['antwortNr'] === 3, 'und darf wieder übertragen', fehlertext($a));
Aufmass_Freigaben::verwerfen($fb['code'], 3, $weber);

echo "\n== Zur verbindlichen Freigabe vorlegen ==\n";
$e = Aufmass_Freigaben::vorlegen($fb['code'], freigabedaten(), $fremd);
pruefe(is_wp_error($e) && status_von($e) === 403, 'nur Zuständige legen vor', fehlertext($e));
$e = Aufmass_Freigaben::vorlegen('gibtsnicht1', freigabedaten(), $weber);
pruefe(is_wp_error($e) && status_von($e) === 404, 'ein unbekannter Code gibt 404', fehlertext($e));
$fc = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
Aufmass_Freigaben::antwort_annehmen($fc['code'], antwort(array('a' => '1:1')), 'Frau Wartet', '');
$e = Aufmass_Freigaben::vorlegen($fc['code'], freigabedaten(), $weber);
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_geprueft' && status_von($e) === 409, 'solange eine Rückmeldung wartet, wird nicht vorgelegt', fehlertext($e));
$v = Aufmass_Freigaben::vorlegen($fb['code'], freigabedaten(array('m' => '1~9', 'hinweis' => 'Endstand')), $weber);
pruefe(!is_wp_error($v) && $v['status'] === 'vorgelegt' && $v['vorgelegtAm'] !== '' && $v['rechte'] === array('m' => 0, 'g' => 0, 's' => 0),
    'der Plan liegt vor - ohne Rechte', fehlertext($v));
$k = Aufmass_Freigaben::oeffentlich($fb['code']);
pruefe($k['status'] === 'vorgelegt' && $k['daten']['m'] === '1~9' && $k['daten']['e'] === '0~9' && $k['daten']['hinweis'] === 'Endstand',
    'der Kunde sieht den neuen Stand, kein Feld ist frei', json_encode(array($k['status'], $k['daten']['m'], $k['daten']['e'])));
pruefe($k['antwort'] === null, 'die frühere Rückmeldung wird dabei nicht mehr gezeigt');
$e = Aufmass_Freigaben::antwort_annehmen($fb['code'], antwort(array('a' => '')), 'Frau Kundig', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'vorgelegt' && status_von($e) === 409, 'eine Rückmeldung auf einen vorgelegten Plan wird abgewiesen', fehlertext($e));
$e = Aufmass_Freigaben::freigeben($fc['code'], 'Frau Chefin', 'GF', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_vorgelegt' && status_von($e) === 409, 'freigeben geht nur bei vorgelegten Plänen', fehlertext($e));
$e = Aufmass_Freigaben::freigeben($fb['code'], '', 'GF', '');
pruefe(is_wp_error($e) && $e->get_error_code() === 'name_fehlt', 'freigeben braucht einen Namen', fehlertext($e));
$anzahlMails = count($GLOBALS['wp_mails']);
$g = Aufmass_Freigaben::freigeben($fb['code'], " Frau\tChefin ", 'Geschäftsführung', 'Passt so.');
pruefe(!is_wp_error($g) && $g['ok'] === true && $g['freigabe'] === true, 'der Kunde gibt den vorgelegten Plan frei', fehlertext($g));
$z = Aufmass_Freigaben::zeile($fb['code']);
pruefe($z['status'] === 'beantwortet' && $z['freigabe_art'] === 'nachtraeglich' && $z['freigabe_name'] === 'Frau Chefin' && $z['freigabe_funktion'] === 'Geschäftsführung',
    'die Freigabe wartet als Rückmeldung mit Art „nachträglich“', json_encode(array($z['status'], $z['freigabe_art'], $z['freigabe_name'])));
$gespeichert = json_decode($z['antwort'], true);
pruefe($gespeichert['a'] === '' && $gespeichert['fr']['art'] === 'nachtraeglich' && $gespeichert['tIds'] === array('t1', 't2', 't3'), 'die Antwort dazu ist leer bis auf die Freigabe', json_encode($gespeichert));
pruefe(count($GLOBALS['wp_mails']) === $anzahlMails + 1 && strpos(end($GLOBALS['wp_mails'])['betreff'], 'Verbindliche Freigabe') === 0
    && strpos(end($GLOBALS['wp_mails'])['text'], 'vorgelegte Schließplan verbindlich freigegeben') !== false,
    'die E-Mail meldet die Freigabe des vorgelegten Plans', end($GLOBALS['wp_mails'])['betreff']);
$e = Aufmass_Freigaben::freigeben($fb['code'], 'Nochmal', '', '');
pruefe(is_wp_error($e) && status_von($e) === 409, 'eine zweite Freigabe wird abgewiesen', fehlertext($e));
$o = Aufmass_Freigaben::offene_fuer($weber);
pruefe(count($o) === 2 && in_array($fb['code'], array($o[0]['code'], $o[1]['code']), true), 'die Freigabe wartet bei den Zuständigen', json_encode(array_map(function ($x) { return $x['code']; }, $o)));
$u = Aufmass_Freigaben::uebernommen_markieren($fb['code'], (int) $z['antwort_nr'], $weber);
pruefe(!is_wp_error($u) && $u['status'] === 'freigegeben' && $u['freigabe']['art'] === 'nachtraeglich', 'nach dem Übernehmen gilt der Link als freigegeben', fehlertext($u));
$e = Aufmass_Freigaben::vorlegen($fb['code'], freigabedaten(), $weber);
pruefe(!is_wp_error($e) && $e['status'] === 'vorgelegt' && $e['freigabe'] === null, 'ein freigegebener Plan lässt sich erneut vorlegen - wir dürfen weiter ändern', fehlertext($e));
Aufmass_Freigaben::verwerfen($fc['code'], 1, $weber);
$vf = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber, true);
pruefe(!is_wp_error($vf) && $vf['status'] === 'vorgelegt' && $vf['rechte'] === array('m' => 0, 'g' => 0, 's' => 0), 'ein Link lässt sich gleich als Vorlage anlegen', fehlertext($vf));

echo "\n== Liste je Aufmaß ==\n";
$l = Aufmass_Freigaben::liste('prj-f');
pruefe(count($l) === 7, 'alle sieben Freigaben des Aufmaßes', count($l));
pruefe($l[0]['code'] === $vf['code'], 'neueste zuerst', $l[0]['code']);
$meine = array_values(array_filter($l, function ($x) use ($code) { return $x['code'] === $code; }));
pruefe(count($meine) === 1 && $meine[0]['status'] === 'freigegeben' && $meine[0]['antwortNr'] === 1, 'mit dem aktuellen Zustand');
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
$e = Aufmass_Freigaben::vorlegen($f0['code'], freigabedaten(), $weber);
pruefe(is_wp_error($e) && status_von($e) === 410, 'ein toter Link lässt sich nicht mehr vorlegen', fehlertext($e));
/* Ein beantworteter Link: die Antwort bleibt zur Prüfung, der Link ist tot */
$a = Aufmass_Freigaben::antwort_annehmen($f14['code'], antwort(array('a' => '1:1')), 'Frau Dritt', '');
pruefe(!is_wp_error($a), 'Vorbereitung: der 14-Tage-Link wird beantwortet', fehlertext($a));
$r = Aufmass_Freigaben::zurueckziehen($f14['code'], $weber);
pruefe(!is_wp_error($r) && $r['status'] === 'beantwortet', 'die wartende Antwort bleibt erhalten', fehlertext($r));
$k = Aufmass_Freigaben::oeffentlich($f14['code']);
pruefe(is_wp_error($k) && $k->get_error_code() === 'abgelaufen', 'der Kunde kommt trotzdem nicht mehr hinein', fehlertext($k));
$zz = Aufmass_Freigaben::zeile($f14['code']);
pruefe($zz['daten'] === '' && $zz['antwort'] !== '' && $zz['antwort_name'] === 'Frau Dritt',
    'auch hier sind die Plandaten weg - die Antwort samt Name bleibt zur Prüfung', json_encode(array(strlen($zz['daten']), $zz['antwort_name'])));
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
function kleine_daten($pid) {
    return array('f' => 2, 'pid' => $pid, 't' => array(array('t1', '1', 'Tür', '')), 's' => array(array('s1', 'A', 'A', '', 'schliessung', '')), 'm' => '0', 'e' => '1');
}
Aufmass_Projekte::speichern('prj-g', array('id' => 'prj-g', 'kunde' => 'Weg', 'tueren' => array(array('id' => 't1')), 'schliessungen' => array(array('id' => 's1'))), 0, $weber);
$fg = Aufmass_Freigaben::anlegen('prj-g', kleine_daten('prj-g'), '', $weber);
pruefe(!is_wp_error($fg), 'Vorbereitung: Freigabe für ein zweites Aufmaß', fehlertext($fg));
$a = Aufmass_Freigaben::antwort_annehmen($fg['code'], array('f' => 2, 'pid' => 'prj-g', 'typ' => 'antwort', 'tIds' => array('t1'), 'sIds' => array('s1'), 'a' => '0:1'), 'Frau G', '');
pruefe(!is_wp_error($a), 'Vorbereitung: beantwortet', fehlertext($a));
Aufmass_Projekte::loeschen('prj-g', $weber);
$k = Aufmass_Freigaben::oeffentlich($fg['code']);
pruefe(is_wp_error($k) && status_von($k) === 410, 'nach dem Löschen des Aufmaßes ist der Link tot', fehlertext($k));
pruefe(count(array_filter(Aufmass_Freigaben::offene_fuer($weber), function ($x) use ($fg) { return $x['code'] === $fg['code']; })) === 0,
    'und die Antwort wartet nicht mehr');
$e = Aufmass_Freigaben::anlegen('prj-g', kleine_daten('prj-g'), '', $weber);
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
$fm = Aufmass_Freigaben::anlegen('prj-m', kleine_daten('prj-m'), '', $weber);
$lang = str_repeat('Sehr lange Anmerkung. ', 60);
$a = Aufmass_Freigaben::antwort_annehmen($fm['code'],
    array('f' => 2, 'pid' => 'prj-m', 'typ' => 'antwort', 'tIds' => array('t1'), 'sIds' => array('s1'), 'a' => '0:1'),
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
$wpdb->update('wp_aufmass_freigaben', array('geaendert_am' => $alt), array('code' => $code));              /* freigegeben, alt */
/* Ein gestern abgelaufener, nie beantworteter Link: bleibt als Eintrag, verliert aber seine Plandaten */
$fb2 = Aufmass_Freigaben::anlegen('prj-f', freigabedaten(), '', $weber);
$wpdb->update('wp_aufmass_freigaben', array('gueltig_bis' => gmdate('Y-m-d H:i:s', time() - 86400) . '.000000'), array('code' => $fb2['code']));
$vorher = (int) $wpdb->get_var('SELECT COUNT(*) FROM wp_aufmass_freigaben');
Aufmass_Freigaben::aufraeumen();
$zb = Aufmass_Freigaben::zeile($fb2['code']);
pruefe($zb !== null && $zb['daten'] === '', 'ein frisch abgelaufener Link verliert sofort seine Plandaten', $zb ? strlen($zb['daten']) . ' Zeichen' : 'weg');
$k = Aufmass_Freigaben::oeffentlich($fb2['code']);
pruefe(is_wp_error($k) && $k->get_error_code() === 'abgelaufen' && status_von($k) === 410, 'der Kunde sieht dann „abgelaufen“ - keinen Serverfehler', fehlertext($k));
$lb = array_values(array_filter(Aufmass_Freigaben::liste('prj-f'), function ($x) use ($fb2) { return $x['code'] === $fb2['code']; }));
pruefe(count($lb) === 1 && $lb[0]['status'] === 'abgelaufen', 'und im Werkzeug steht er als abgelaufen', json_encode($lb));
pruefe(Aufmass_Freigaben::zeile($fa['code'])['daten'] !== '', 'die Plandaten einer wartenden Antwort bleiben bis zur Prüfung');
$nachher = (int) $wpdb->get_var('SELECT COUNT(*) FROM wp_aufmass_freigaben');
pruefe($nachher === $vorher - 2, 'eine alte, zurückgezogene und eine alte, freigegebene Freigabe werden gelöscht', "$vorher -> $nachher");
pruefe(Aufmass_Freigaben::zeile($f0['code']) === null && Aufmass_Freigaben::zeile($code) === null, 'und zwar genau die');
pruefe(Aufmass_Freigaben::zeile($fa['code']) !== null, 'eine abgelaufene mit wartender Antwort bleibt');
pruefe(Aufmass_Freigaben::zeile($fb['code']) !== null, 'frisch Erledigtes bleibt');

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
    $e = Aufmass_Freigaben::anlegen($pid, kleine_daten($pid), '', $weber);
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

echo "\n== Herkunft für die Drosselung: IPv4 hinter einem Dual-Stack-Listener ==\n";
$_SERVER['REMOTE_ADDR'] = '::ffff:10.0.0.9';
$h1 = Aufmass_Drossel::herkunft();
$_SERVER['REMOTE_ADDR'] = '::ffff:10.0.0.8';
$h2 = Aufmass_Drossel::herkunft();
$_SERVER['REMOTE_ADDR'] = '::1';
$h3 = Aufmass_Drossel::herkunft();
$_SERVER['REMOTE_ADDR'] = '2001:db8:1:2:3:4:5:6';
$h4 = Aufmass_Drossel::herkunft();
pruefe($h1 === 'v4:10.0.0.9', 'eine IPv4-mapped-Adresse zählt als ihre IPv4-Adresse', $h1);
pruefe($h1 !== $h2 && $h1 !== $h3 && $h2 !== $h3, 'drei Besucher, drei Zähler - nicht einer für alle', "$h1 / $h2 / $h3");
pruefe($h4 === 'v6:20010db800010002', 'echtes IPv6 zählt weiter als /64-Netz', $h4);
$_SERVER['REMOTE_ADDR'] = '10.0.0.1';

echo "\nErgebnis Freigaben: $ok ok, $fehler Fehler\n";
exit($fehler ? 1 : 0);
