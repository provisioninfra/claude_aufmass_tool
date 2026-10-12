<?php
/* Rechte, Versionskonflikte, Fotos und Sitzungen - durchgespielt, nicht behauptet. */
require_once __DIR__ . '/wp-attrappe.php';

$ok = 0; $fehler = 0;
function pruefe($b, $t, $i = '') {
    global $ok, $fehler;
    if ($b) { $ok++; }
    else { $fehler++; echo "  FEHL $t" . ($i !== '' ? "\n         -> $i" : '') . "\n"; }
}
function fehlertext($e) {
    return is_wp_error($e) ? ($e->get_error_code() . ': ' . $e->get_error_message()) : gettype($e);
}
function mappe($zusatz = array()) {
    return array_merge(array(
        'id' => 'prj-1', 'kunde' => 'Müller & Söhne GmbH', 'objekt' => 'Königsallee 47',
        'anlagenNr' => 'SA-2026-0815', 'tueren' => array(), 'schliessungen' => array(),
        'standorte' => array(), 'matrix' => array()
    ), $zusatz);
}

$weber  = test_benutzer('u-weber', 'M. Weber');
$kraus  = test_benutzer('u-kraus', 'J. Kraus');
$chefin = test_benutzer('u-chefin', 'Dr. Schäfer', 'verwaltung');

echo "\n== Anlegen und Zuständigkeit ==\n";
$p = Aufmass_Projekte::speichern('prj-1', mappe(), 0, $weber);
pruefe(!is_wp_error($p), 'ein neues Aufmaß lässt sich anlegen', fehlertext($p));
pruefe(!is_wp_error($p) && $p['version'] === 1, 'die erste Fassung trägt Version 1');
$z = Aufmass_Projekte::zustaendige_von('prj-1');
pruefe(count($z) === 1 && $z[0]['id'] === 'u-weber', 'wer anlegt, ist zuständig', json_encode($z));

echo "\n== Lesen darf jeder, ändern nur die Zuständigen ==\n";
$gelesen = Aufmass_Projekte::laden('prj-1');
pruefe($gelesen && $gelesen['daten']['kunde'] === 'Müller & Söhne GmbH', 'das Aufmaß ist lesbar');
$e = Aufmass_Projekte::speichern('prj-1', mappe(array('kunde' => 'Fremd')), 1, $kraus);
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_zustaendig',
    'ein Unzuständiger darf nicht ändern', fehlertext($e));
$d = $e instanceof WP_Error ? $e->get_error_data() : array();
pruefe(isset($d['status']) && $d['status'] === 403, 'die Ablehnung kommt als 403');
pruefe(strpos($e->get_error_message(), 'M. Weber') !== false,
    'die Meldung nennt den Zuständigen', $e->get_error_message());
pruefe(Aufmass_Projekte::laden('prj-1')['daten']['kunde'] === 'Müller & Söhne GmbH',
    'der abgewiesene Versuch hat nichts verändert');

$e = Aufmass_Projekte::speichern('prj-1', mappe(array('kunde' => 'Müller & Söhne GmbH 2')), 1, $weber);
pruefe(!is_wp_error($e) && $e['version'] === 2, 'der Zuständige darf ändern', fehlertext($e));

echo "\n== Die Verwaltung darf immer ==\n";
$e = Aufmass_Projekte::speichern('prj-1', mappe(array('kunde' => 'Durch Verwaltung')), 2, $chefin);
pruefe(!is_wp_error($e) && $e['version'] === 3, 'die Verwaltung darf auch ohne Zuständigkeit ändern', fehlertext($e));

echo "\n== Versionskonflikt ==\n";
$e = Aufmass_Projekte::speichern('prj-1', mappe(array('kunde' => 'Veralteter Stand')), 1, $weber);
pruefe(is_wp_error($e) && $e->get_error_code() === 'konflikt',
    'ein veralteter Stand wird als Konflikt gemeldet', fehlertext($e));
$d = $e->get_error_data();
pruefe(isset($d['status']) && $d['status'] === 409, 'der Konflikt kommt als 409');
pruefe(isset($d['server']['daten']['kunde']) && $d['server']['daten']['kunde'] === 'Durch Verwaltung',
    'die Servermappe liegt der Konfliktmeldung bei');
pruefe(Aufmass_Projekte::laden('prj-1')['daten']['kunde'] === 'Durch Verwaltung',
    'beim Konflikt wird nichts überschrieben');
$e = Aufmass_Projekte::speichern('prj-1', mappe(array('kunde' => 'Nach Zusammenführung')), 3, $weber);
pruefe(!is_wp_error($e) && $e['version'] === 4, 'mit der richtigen Version geht es weiter', fehlertext($e));

echo "\n== Herrenloses Aufmaß ==\n";
global $wpdb;
Aufmass_Projekte::speichern('prj-2', mappe(array('id' => 'prj-2', 'kunde' => 'Verwaist')), 0, $weber);
$wpdb->delete('wp_aufmass_zustaendig', array('projekt_id' => 'prj-2'));
pruefe(count(Aufmass_Projekte::zustaendige_von('prj-2')) === 0, 'Vorbereitung: keine Zuständigen mehr');
$e = Aufmass_Projekte::speichern('prj-2', mappe(array('id' => 'prj-2', 'kunde' => 'Übernommen')), 1, $kraus);
pruefe(!is_wp_error($e), 'ein Aufmaß ohne Zuständige darf übernommen werden', fehlertext($e));
$z = Aufmass_Projekte::zustaendige_von('prj-2');
pruefe(count($z) === 1 && $z[0]['id'] === 'u-kraus', 'wer übernimmt, wird zuständig', json_encode($z));

echo "\n== Zuständige verwalten ==\n";
$e = Aufmass_Projekte::zustaendige_setzen('prj-1', array('u-weber', 'u-kraus'), $weber);
pruefe(!is_wp_error($e) && count($e) === 2, 'zwei Zuständige lassen sich setzen', fehlertext($e));
$e = Aufmass_Projekte::speichern('prj-1', mappe(array('kunde' => 'Jetzt auch Kraus')), 4, $kraus);
pruefe(!is_wp_error($e), 'der neu Zuständige darf nun ändern', fehlertext($e));
$e = Aufmass_Projekte::zustaendige_setzen('prj-1', array(), $kraus);
pruefe(!is_wp_error($e) && count($e) === 1 && $e[0]['id'] === 'u-kraus',
    'eine leere Liste lässt den Handelnden stehen, statt alle auszusperren', json_encode($e));
$e = Aufmass_Projekte::zustaendige_setzen('prj-1', array('gibt-es-nicht'), $kraus);
pruefe(!is_wp_error($e) && count($e) === 1 && $e[0]['id'] === 'u-kraus',
    'unbekannte Benutzer werden nicht eingetragen', json_encode($e));

echo "\n== Löschen ist ein Papierkorb ==\n";
$e = Aufmass_Projekte::loeschen('prj-2', $weber);
pruefe(is_wp_error($e), 'ein Unzuständiger darf nicht löschen', fehlertext($e));
$e = Aufmass_Projekte::loeschen('prj-2', $kraus);
pruefe(!is_wp_error($e), 'der Zuständige darf löschen', fehlertext($e));
$p2 = Aufmass_Projekte::laden('prj-2');
pruefe($p2 && $p2['geloescht'] === true, 'gelöscht heißt gekennzeichnet, nicht weg');
pruefe($p2['daten']['kunde'] === 'Übernommen', 'die Daten bleiben für eine Wiederherstellung erhalten');
$e = Aufmass_Projekte::loeschen('gibt-es-nicht', $weber);
pruefe(is_wp_error($e) && $e->get_error_data()['status'] === 404, 'ein unbekanntes Aufmaß meldet 404');
$e = Aufmass_Projekte::speichern('prj-2', mappe(array('id' => 'prj-2', 'kunde' => 'Zurückgeholt')), $p2['version'], $kraus);
pruefe(!is_wp_error($e) && $e['geloescht'] === false, 'erneutes Speichern holt es aus dem Papierkorb', fehlertext($e));

echo "\n== Liste und Marke ==\n";
$alles = Aufmass_Projekte::liste('');
pruefe(count($alles['projekte']) === 2, 'die Liste nennt beide Aufmaße', count($alles['projekte']));
pruefe($alles['marke'] !== '' && strtotime($alles['marke']) > 0, 'die Liste bringt eine Marke mit', $alles['marke']);
pruefe(isset($alles['projekte'][0]['zustaendige']), 'die Liste nennt die Zuständigen');
pruefe(!isset($alles['projekte'][0]['daten']), 'die Liste schleppt keine Projektdaten mit');
pruefe(count(Aufmass_Projekte::liste('völliger-unsinn')['projekte']) === 2,
    'eine unlesbare Marke liefert sicherheitshalber alles');

/* Der Server zieht beim Abholen eine Sicherheitsspanne ab (siehe
   datenbank.php): Lieber eine Zeile doppelt ausliefern als eine verpassen.
   Um das Abholen selbst zu prüfen, muss die Marke daher jenseits dieser
   Spanne liegen - sonst prüfte der Test nur die Spanne. */
sleep(Aufmass_Datenbank::SPANNE);
usleep(250000);
$marke = Aufmass_Projekte::liste('')['marke'];
pruefe(count(Aufmass_Projekte::liste($marke)['projekte']) === 0,
    'nach Ruhe meldet die Liste keine Änderungen mehr',
    json_encode(array_column(Aufmass_Projekte::liste($marke)['projekte'], 'id')));

$stand = Aufmass_Projekte::laden('prj-1')['version'];
$e = Aufmass_Projekte::speichern('prj-1', mappe(array('kunde' => 'Frisch')), $stand, $kraus);
pruefe(!is_wp_error($e), 'Vorbereitung: prj-1 wird geändert', fehlertext($e));
$neu = Aufmass_Projekte::liste($marke);
pruefe(count($neu['projekte']) === 1 && $neu['projekte'][0]['id'] === 'prj-1',
    'seit der Marke wird nur das Geänderte geliefert',
    json_encode(array_column($neu['projekte'], 'id')));
pruefe($neu['projekte'][0]['geaendertVon'] === 'J. Kraus',
    'die Liste nennt, wer zuletzt geändert hat', $neu['projekte'][0]['geaendertVon']);

/* Eine Änderung unmittelbar vor dem Abholen darf nicht verlorengehen. */
$marke2 = Aufmass_Projekte::liste('')['marke'];
$stand = Aufmass_Projekte::laden('prj-1')['version'];
Aufmass_Projekte::speichern('prj-1', mappe(array('kunde' => 'Ganz frisch')), $stand, $kraus);
pruefe(count(Aufmass_Projekte::liste($marke2)['projekte']) === 1,
    'eine Änderung unmittelbar nach der Marke wird mitgeliefert',
    count(Aufmass_Projekte::liste($marke2)['projekte']));

/* Auch das Löschen muss sich abgleichen - sonst bliebe es auf anderen
   Geräten für immer stehen. */
$marke3 = Aufmass_Projekte::liste('')['marke'];
Aufmass_Projekte::loeschen('prj-2', $kraus);
$nachLoeschen = Aufmass_Projekte::liste($marke3);
$gefunden = null;
foreach ($nachLoeschen['projekte'] as $x) { if ($x['id'] === 'prj-2') { $gefunden = $x; } }
pruefe($gefunden !== null, 'ein gelöschtes Aufmaß taucht im Abgleich auf');
pruefe($gefunden && $gefunden['geloescht'] === true, 'und ist dort als gelöscht gekennzeichnet');
Aufmass_Projekte::speichern('prj-2', mappe(array('id' => 'prj-2', 'kunde' => 'Wieder da')),
    Aufmass_Projekte::laden('prj-2')['version'], $kraus);

echo "\n== Fotos gehören nicht in die Projektdaten ==\n";
$mitFoto = mappe(array('tueren' => array(array('id' => 't1', 'nummer' => 'A-01',
    'fotos' => array(array('id' => 'f1', 'dataUrl' => 'data:image/jpeg;base64,' . str_repeat('A', 5000),
                           'beschriftung' => 'Ansicht außen'))))));
$v = Aufmass_Projekte::laden('prj-1')['version'];
$e = Aufmass_Projekte::speichern('prj-1', $mitFoto, $v, $kraus);
pruefe(!is_wp_error($e), 'ein Aufmaß mit Foto lässt sich speichern', fehlertext($e));
$zurueck = Aufmass_Projekte::laden('prj-1');
pruefe($zurueck['daten']['tueren'][0]['fotos'][0]['dataUrl'] === '',
    'die Bilddaten werden auf dem Server entfernt');
pruefe($zurueck['daten']['tueren'][0]['fotos'][0]['id'] === 'f1', 'der Fotoeintrag bleibt erhalten');
pruefe($zurueck['daten']['tueren'][0]['fotos'][0]['beschriftung'] === 'Ansicht außen',
    'die Beschriftung bleibt erhalten');
$roh = $wpdb->get_var("SELECT LENGTH(daten) FROM wp_aufmass_projekte WHERE id = 'prj-1'");
pruefe((int) $roh < 2000, 'die abgelegten Daten bleiben klein (' . $roh . ' Zeichen)');

echo "\n== Zu große Mappe ==\n";
$riesig = mappe(array('bemerkung' => str_repeat('x', 9 * 1024 * 1024)));
$e = Aufmass_Projekte::speichern('prj-3', $riesig, 0, $weber);
pruefe(is_wp_error($e) && $e->get_error_code() === 'zu_gross', 'eine zu große Mappe wird abgewiesen', fehlertext($e));
pruefe($e->get_error_data()['status'] === 413, 'mit Status 413');

echo "\n== Fotoablage ==\n";
$jpeg = "\xFF\xD8\xFF\xE0" . str_repeat("\x00", 200) . "\xFF\xD9";
$png  = "\x89PNG\r\n\x1a\n" . str_repeat("\x00", 100);
$e = Aufmass_Fotos::speichern('f1', 'prj-1', 't1', $jpeg, 'image/jpeg', $kraus);
pruefe(!is_wp_error($e) && $e['vorhanden'] === true, 'ein JPEG lässt sich ablegen', fehlertext($e));
$f = Aufmass_Fotos::holen('f1');
pruefe($f && file_exists($f['pfad']) && filesize($f['pfad']) === strlen($jpeg),
    'das Foto liegt vollständig auf der Platte');
pruefe(file_get_contents($f['pfad']) === $jpeg, 'die Bytes sind unverändert');
pruefe(strpos(basename($f['pfad']), 'f1-') === 0 && strlen(basename($f['pfad'])) > 20,
    'der Dateiname trägt einen Zufallsteil', basename($f['pfad']));
$e2 = Aufmass_Fotos::speichern('f1', 'prj-1', 't1', $jpeg, 'image/jpeg', $kraus);
pruefe(!is_wp_error($e2), 'ein zweiter Versuch mit demselben Foto ist unschädlich', fehlertext($e2));
pruefe(count($wpdb->get_results("SELECT id FROM wp_aufmass_fotos WHERE id = 'f1'")) === 1,
    'und legt keine zweite Zeile an');

$e = Aufmass_Fotos::speichern('f-pdf', 'prj-1', 't1', '%PDF-1.4 ...', 'application/pdf', $kraus);
pruefe(is_wp_error($e) && $e->get_error_data()['status'] === 415, 'ein PDF wird abgewiesen', fehlertext($e));
$e = Aufmass_Fotos::speichern('f-luege', 'prj-1', 't1', '<?php echo "boese"; ?>', 'image/jpeg', $kraus);
pruefe(is_wp_error($e) && $e->get_error_code() === 'falscher_inhalt',
    'als Bild ausgegebener Schadcode wird am Inhalt erkannt', fehlertext($e));
$e = Aufmass_Fotos::speichern('f-png-als-jpeg', 'prj-1', 't1', $png, 'image/jpeg', $kraus);
pruefe(is_wp_error($e), 'ein PNG mit falscher Typangabe wird abgewiesen', fehlertext($e));
$e = Aufmass_Fotos::speichern('f-png', 'prj-1', 't1', $png, 'image/png', $kraus);
pruefe(!is_wp_error($e), 'ein richtig benanntes PNG geht durch', fehlertext($e));
$e = Aufmass_Fotos::speichern('f-leer', 'prj-1', 't1', '', 'image/jpeg', $kraus);
pruefe(is_wp_error($e) && $e->get_error_code() === 'leer', 'ein leeres Foto wird abgewiesen');
$e = Aufmass_Fotos::speichern('f-riesig', 'prj-1', 't1',
    "\xFF\xD8\xFF" . str_repeat('x', 13 * 1024 * 1024), 'image/jpeg', $kraus);
pruefe(is_wp_error($e) && $e->get_error_code() === 'zu_gross', 'ein zu großes Foto wird abgewiesen');

pruefe(Aufmass_Fotos::typ_erkennen($jpeg) === 'image/jpeg', 'JPEG wird am Dateianfang erkannt');
pruefe(Aufmass_Fotos::typ_erkennen($png) === 'image/png', 'PNG wird am Dateianfang erkannt');
pruefe(Aufmass_Fotos::typ_erkennen('RIFF' . str_repeat('x', 4) . 'WEBP') === 'image/webp', 'WebP wird erkannt');
pruefe(Aufmass_Fotos::typ_erkennen('GIF89a') === '', 'GIF gilt nicht als erlaubtes Format');

echo "\n== Verwaiste Fotos aufräumen ==\n";
$vorher = count(Aufmass_Fotos::vorhandene('prj-1'));
pruefe($vorher === 2, 'zwei Fotos liegen zu prj-1', $vorher);
$pfadPng = Aufmass_Fotos::holen('f-png')['pfad'];
$weg = Aufmass_Fotos::verwaiste_aufraeumen('prj-1', $mitFoto);   /* enthält nur f1 */
pruefe($weg === 1, 'ein nicht mehr verwendetes Foto wird weggeräumt', $weg);
pruefe(!file_exists($pfadPng), 'die Datei ist auch von der Platte verschwunden');
pruefe(Aufmass_Fotos::holen('f1') !== null, 'das noch verwendete Foto bleibt');

echo "\n== Sitzungen ==\n";
function b64t($roh) { return rtrim(strtr(base64_encode($roh), '+/', '-_'), '='); }
$paar = openssl_pkey_new(array('private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA));
$det = openssl_pkey_get_details($paar);
Aufmass_JWT::$schluessel_vorrat = array('keys' => array(array('kty' => 'RSA', 'kid' => 's1',
    'n' => b64t($det['rsa']['n']), 'e' => b64t($det['rsa']['e']))));
update_option('aufmass_client_id', '111-abc.apps.googleusercontent.com');
update_option('aufmass_domaene', 'provision-infra.de');

function token($paar, $zusatz = array()) {
    $kopf = b64t(json_encode(array('alg' => 'RS256', 'kid' => 's1', 'typ' => 'JWT')));
    $inhalt = b64t(json_encode(array_merge(array(
        'iss' => 'https://accounts.google.com', 'aud' => '111-abc.apps.googleusercontent.com',
        'sub' => 'u-neu', 'email' => 'neu@provision-infra.de', 'email_verified' => true,
        'hd' => 'provision-infra.de', 'name' => 'Neue Person',
        'iat' => time() - 10, 'exp' => time() + 3600), $zusatz)));
    openssl_sign($kopf . '.' . $inhalt, $sig, $paar, OPENSSL_ALGO_SHA256);
    return $kopf . '.' . $inhalt . '.' . b64t($sig);
}

$_COOKIE = array();
$e = Aufmass_Anmeldung::anmelden(token($paar));
pruefe(!is_wp_error($e) && $e['benutzer']['id'] === 'u-neu', 'die Anmeldung legt den Benutzer an', fehlertext($e));
pruefe($e['benutzer']['rolle'] === 'mitarbeit', 'ein weiterer Benutzer bekommt nur Mitarbeit', $e['benutzer']['rolle']);
$cookie = $e['sitzung'];
pruefe(strpos($cookie, '.') > 0, 'das Sitzungscookie besteht aus Kennung und Geheimnis');

$_COOKIE['aufmass_sitzung'] = $cookie;
$ref = new ReflectionClass('Aufmass_Anmeldung');
function vergessen() {
    $r = new ReflectionClass('Aufmass_Anmeldung');
    foreach (array('benutzer' => null, 'geprueft' => false) as $n => $w) {
        $e = $r->getProperty($n); $e->setAccessible(true); $e->setValue(null, $w);
    }
}
vergessen();
$b = Aufmass_Anmeldung::aktueller_benutzer();
pruefe($b && $b['id'] === 'u-neu', 'mit dem Cookie wird der Benutzer wiedererkannt', json_encode($b));

list($sid, $geheim) = explode('.', $cookie, 2);
$_COOKIE['aufmass_sitzung'] = $sid . '.' . str_repeat('0', strlen($geheim));
vergessen();
pruefe(Aufmass_Anmeldung::aktueller_benutzer() === null, 'ein falsches Geheimnis wird abgewiesen');
$_COOKIE['aufmass_sitzung'] = 'fremd.' . $geheim;
vergessen();
pruefe(Aufmass_Anmeldung::aktueller_benutzer() === null, 'eine fremde Sitzungskennung wird abgewiesen');
foreach (array('', 'ohnepunkt', '.', 'a.', '.b') as $mies) {
    $_COOKIE['aufmass_sitzung'] = $mies; vergessen();
    pruefe(Aufmass_Anmeldung::aktueller_benutzer() === null,
        'unsinniges Cookie ' . json_encode($mies) . ' wird abgewiesen');
}

$abdruck = $wpdb->get_var("SELECT pruefwert FROM wp_aufmass_sitzungen WHERE id = '$sid'");
pruefe($abdruck !== $geheim && strlen($abdruck) === 64,
    'in der Datenbank steht nur der Abdruck, nicht das Geheimnis');

$_COOKIE['aufmass_sitzung'] = $cookie;
$wpdb->update('wp_aufmass_sitzungen', array('gueltig_bis' => gmdate('Y-m-d H:i:s.000000', time() - 60)), array('id' => $sid));
vergessen();
pruefe(Aufmass_Anmeldung::aktueller_benutzer() === null, 'eine abgelaufene Sitzung gilt nicht mehr');
$wpdb->update('wp_aufmass_sitzungen', array('gueltig_bis' => gmdate('Y-m-d H:i:s.000000', time() + 86400)), array('id' => $sid));

$wpdb->update('wp_aufmass_benutzer', array('aktiv' => 0), array('id' => 'u-neu'));
vergessen();
pruefe(Aufmass_Anmeldung::aktueller_benutzer() === null, 'ein gesperrter Zugang kommt nicht mehr durch');
$e = Aufmass_Anmeldung::anmelden(token($paar));
pruefe(is_wp_error($e) && $e->get_error_code() === 'gesperrt', 'ein Gesperrter kann sich nicht neu anmelden', fehlertext($e));
$wpdb->update('wp_aufmass_benutzer', array('aktiv' => 1), array('id' => 'u-neu'));

vergessen();
pruefe(Aufmass_Anmeldung::aktueller_benutzer() !== null, 'nach Freigabe geht es wieder');
Aufmass_Anmeldung::alle_beenden('u-neu');
vergessen();
pruefe(Aufmass_Anmeldung::aktueller_benutzer() === null, 'Abmelden aller Geräte wirkt sofort');

$e = Aufmass_Anmeldung::anmelden(token($paar, array('hd' => 'fremd.de', 'email' => 'x@fremd.de')));
pruefe(is_wp_error($e) && $e->get_error_data()['status'] === 401,
    'ein fremdes Konto wird auch hier abgewiesen', fehlertext($e));
update_option('aufmass_client_id', '');
$e = Aufmass_Anmeldung::anmelden(token($paar));
pruefe(is_wp_error($e) && $e->get_error_code() === 'nicht_eingerichtet',
    'ohne Client-ID meldet der Server, dass er nicht eingerichtet ist', fehlertext($e));
update_option('aufmass_client_id', '111-abc.apps.googleusercontent.com');

echo "\n== Gehämmerte Anmeldung ==\n";
/* Jede Prüfung eines Ausweises kostet eine RSA-Unterschrift. Wer mit
   erfundenen Ausweisen hämmert, wird je Herkunft gedrosselt - echte
   Anmeldungen zählen nicht mit. */
$_SERVER['REMOTE_ADDR'] = '203.0.113.9';
$stati = array();
for ($i = 0; $i < 30; $i++) {
    $e = Aufmass_Anmeldung::anmelden('kein.ausweis.' . $i);
    $stati[] = is_wp_error($e) ? $e->get_error_data()['status'] : 200;
}
pruefe(count(array_unique($stati)) === 1 && $stati[0] === 401, '30 erfundene Ausweise: jedes Mal 401', implode(',', array_unique($stati)));
$e = Aufmass_Anmeldung::anmelden('kein.ausweis.31');
pruefe(is_wp_error($e) && $e->get_error_code() === 'zu_viele' && $e->get_error_data()['status'] === 429, 'der 31. Versuch wird gedrosselt (429)', fehlertext($e));
$e = Aufmass_Anmeldung::anmelden(token($paar));
pruefe(is_wp_error($e) && $e->get_error_data()['status'] === 429, 'bis dahin gilt auch ein echter Ausweis dieser Herkunft nicht', fehlertext($e));
$_SERVER['REMOTE_ADDR'] = '203.0.113.10';
$e = Aufmass_Anmeldung::anmelden(token($paar));
pruefe(!is_wp_error($e), 'eine andere Herkunft meldet sich weiter an', fehlertext($e));
/* IPv6: das /64-Netz zählt, nicht die einzelne Adresse - sonst reichte ein Netz voller Adressen */
$_SERVER['REMOTE_ADDR'] = '2001:db8:1:2:aaaa::1';
for ($i = 0; $i < 30; $i++) { Aufmass_Anmeldung::anmelden('kein.ausweis.' . $i); }
$_SERVER['REMOTE_ADDR'] = '2001:db8:1:2:bbbb::2';
$e = Aufmass_Anmeldung::anmelden(token($paar));
pruefe(is_wp_error($e) && $e->get_error_data()['status'] === 429, 'bei IPv6 zählt das ganze /64-Netz', fehlertext($e));
$_SERVER['REMOTE_ADDR'] = '2001:db8:1:3::1';
$e = Aufmass_Anmeldung::anmelden(token($paar));
pruefe(!is_wp_error($e), 'ein anderes /64-Netz ist davon unberührt', fehlertext($e));
$_SERVER['REMOTE_ADDR'] = '203.0.113.11';
for ($i = 0; $i < 35; $i++) { $e = Aufmass_Anmeldung::anmelden(token($paar)); }
pruefe(!is_wp_error($e), '35 echte Anmeldungen hintereinander bleiben ungedrosselt', fehlertext($e));
pruefe(Aufmass_Drossel::voll('anmelden', 1) === false, 'und hinterlassen keinen Zähler');
$_SERVER['REMOTE_ADDR'] = '10.0.0.1';

echo "\n== Zugang löschen ==\n";
$neu = array('id' => 'u-neu', 'email' => 'neu@provision-infra.de', 'name' => 'Neue Person', 'bild' => '', 'rolle' => 'mitarbeit');
$e = Aufmass_Anmeldung::anmelden(token($paar));
$_COOKIE['aufmass_sitzung'] = $e['sitzung']; vergessen();
pruefe(Aufmass_Anmeldung::aktueller_benutzer() !== null, 'Vorbereitung: u-neu ist angemeldet');
$e = Aufmass_Projekte::speichern('prj-neu', mappe(array('id' => 'prj-neu', 'kunde' => 'Von Neu')), 0, $neu);
pruefe(!is_wp_error($e) && count(Aufmass_Projekte::zustaendige_von('prj-neu')) === 1, 'Vorbereitung: u-neu ist für ein Aufmaß zuständig', fehlertext($e));
pruefe(Aufmass_Anmeldung::zugang_loeschen('u-neu') === true, 'der Zugang wird gelöscht');
pruefe((int) $wpdb->get_var("SELECT COUNT(*) FROM wp_aufmass_benutzer WHERE id = 'u-neu'") === 0, 'Name und Adresse sind weg');
pruefe((int) $wpdb->get_var("SELECT COUNT(*) FROM wp_aufmass_sitzungen WHERE benutzer_id = 'u-neu'") === 0, 'alle Sitzungen sind weg');
vergessen();
pruefe(Aufmass_Anmeldung::aktueller_benutzer() === null, 'das Cookie des Geräts gilt nicht mehr');
pruefe(count(Aufmass_Projekte::zustaendige_von('prj-neu')) === 0, 'die Zuständigkeit ist weg');
$p = Aufmass_Projekte::laden('prj-neu');
pruefe($p && $p['daten']['kunde'] === 'Von Neu' && $p['geaendertVon'] === '', 'das Aufmaß bleibt - „geändert von“ zeigt ins Leere', json_encode($p ? $p['geaendertVon'] : null));
$e = Aufmass_Projekte::speichern('prj-neu', mappe(array('id' => 'prj-neu', 'kunde' => 'Übernommen von Kraus')), $p['version'], $kraus);
pruefe(!is_wp_error($e), 'das nun herrenlose Aufmaß kann übernommen werden', fehlertext($e));

echo "\n== Einstellungsseite: Zugänge sperren und löschen ==\n";
require_once __DIR__ . '/../aufmass-sync/inc/einstellungen.php';
function seite_rendern() { ob_start(); Aufmass_Einstellungen::seite(); return ob_get_clean(); }
$geht = test_benutzer('u-geht', 'G. Geht');
$e = Aufmass_Anmeldung::anmelden(token($paar, array('sub' => 'u-geht', 'email' => 'u-geht@provision-infra.de', 'name' => 'G. Geht')));
pruefe(!is_wp_error($e), 'Vorbereitung: u-geht ist mit einem Gerät angemeldet', fehlertext($e));
$_POST = array();
$html = seite_rendern();
pruefe(preg_match('/Warning|Notice|Deprecated|Fatal/', $html) === 0, 'die Seite entsteht ohne PHP-Meldungen');
pruefe(strpos($html, 'u-geht@provision-infra.de') !== false && strpos($html, '>sperren<') !== false, 'sie listet die Zugänge mit „sperren“');
pruefe(strpos($html, 'aufmass_benutzer_loeschen') === false, 'ein aktiver Zugang hat keinen Löschknopf');
pruefe(strpos($html, '<h2>Aufbewahrung</h2>') !== false && strpos($html, '90 Tage im Papierkorb') !== false && strpos($html, '180 Tage') !== false,
    'sie nennt die Aufbewahrungsfristen');
$_POST = array('aufmass_benutzer_loeschen' => 'u-geht');
$html = seite_rendern();
pruefe(strpos($html, 'Nur ein gesperrter Zugang') !== false && (int) $wpdb->get_var("SELECT COUNT(*) FROM wp_aufmass_benutzer WHERE id = 'u-geht'") === 1,
    'ein aktiver Zugang lässt sich nicht löschen');
$_POST = array('aufmass_benutzer' => 'u-geht', 'aufmass_aktiv' => '0');
$html = seite_rendern();
pruefe((int) $wpdb->get_var("SELECT aktiv FROM wp_aufmass_benutzer WHERE id = 'u-geht'") === 0 && strpos($html, 'gesperrt und alle Geräte abgemeldet') !== false,
    'sperren über die Seite');
pruefe((int) $wpdb->get_var("SELECT COUNT(*) FROM wp_aufmass_sitzungen WHERE benutzer_id = 'u-geht'") === 0, 'das Gerät ist damit abgemeldet');
pruefe(preg_match('/name="aufmass_benutzer_loeschen" value="u-geht"/', $html) === 1, 'jetzt gibt es den Löschknopf');
$_POST = array('aufmass_benutzer_loeschen' => 'u-geht');
$html = seite_rendern();
pruefe(strpos($html, 'Zugang gelöscht') !== false && (int) $wpdb->get_var("SELECT COUNT(*) FROM wp_aufmass_benutzer WHERE id = 'u-geht'") === 0,
    'ein gesperrter Zugang lässt sich löschen');
pruefe(strpos($html, 'u-geht@provision-infra.de') === false, 'und steht nicht mehr auf der Seite');
$_POST = array('aufmass_benutzer_loeschen' => 'gibt-es-nicht');
$html = seite_rendern();
pruefe(strpos($html, 'Nur ein gesperrter Zugang') !== false, 'eine erfundene Kennung wird abgewiesen');
$_POST = array();

echo "\n== Erfundene Kennungen ==\n";
/* Ohne Existenzprüfung griffe die Regel "herrenlos darf jeder übernehmen"
   auch für eine frei erfundene Kennung. */
$e = Aufmass_Projekte::darf_aendern('gibt-es-gar-nicht', $weber);
pruefe(is_wp_error($e) && $e->get_error_data()['status'] === 404,
    'eine erfundene Projektkennung wird abgewiesen, nicht übernommen', fehlertext($e));
pruefe((int) $wpdb->get_var("SELECT COUNT(*) FROM wp_aufmass_zustaendig WHERE projekt_id = 'gibt-es-gar-nicht'") === 0,
    'und es entsteht keine Zuständigkeit für ein Phantom');
$e = Aufmass_Projekte::zustaendige_setzen('auch-nicht-da', array('u-weber'), $weber);
pruefe(is_wp_error($e), 'Zuständige für ein unbekanntes Aufmaß zu setzen scheitert', fehlertext($e));
$e = Aufmass_Projekte::darf_aendern('gibt-es-gar-nicht', $chefin);
pruefe(is_wp_error($e), 'auch die Verwaltung bekommt kein Phantom', fehlertext($e));

echo "\n== Eingaben, die nicht passen ==\n";
$e = Aufmass_Projekte::speichern('prj-1', 'kein Array', 99, $kraus);
pruefe(is_wp_error($e) && $e->get_error_code() === 'daten_fehlen',
    'Daten, die kein Datensatz sind, werden abgewiesen', fehlertext($e));
$e = Aufmass_Projekte::speichern('prj-1', null, 99, $kraus);
pruefe(is_wp_error($e), 'null wird abgewiesen', fehlertext($e));
$stand = Aufmass_Projekte::laden('prj-1');
$e = Aufmass_Projekte::speichern('prj-1', mappe(array('kunde' => "Robert'); DROP TABLE wp_aufmass_projekte;--")),
    $stand['version'], $kraus);
pruefe(!is_wp_error($e), 'ein Kundenname mit SQL-Zeichen lässt sich speichern', fehlertext($e));
pruefe((int) $wpdb->get_var("SELECT COUNT(*) FROM wp_aufmass_projekte") >= 2,
    'und die Tabelle steht noch');
pruefe(Aufmass_Projekte::laden('prj-1')['daten']['kunde'] === "Robert'); DROP TABLE wp_aufmass_projekte;--",
    'der Text kommt unverändert zurück');

echo "\n== Serverzeit läuft nie rückwärts ==\n";
/* Die Änderungszeit entsteht aus zwei Uhrabfragen. Fällt dazwischen die
   Sekundengrenze, läge der Wert eine Sekunde zurück - und ein Abgleich
   könnte eine Zeile verpassen. Über zwei Sekundengrenzen hinweg prüfen. */
$letzte = ''; $rueckwaerts = 0; $start = microtime(true); $n = 0;
while (microtime(true) - $start < 2.2) {
    $j = Aufmass_Datenbank::jetzt();
    if ($letzte !== '' && strcmp($j, $letzte) < 0) { $rueckwaerts++; }
    $letzte = $j; $n++;
}
pruefe($rueckwaerts === 0, 'jetzt() läuft über ' . $n . ' Aufrufe und zwei Sekundengrenzen nie rückwärts', $rueckwaerts . ' Rückschritte');
$m = Aufmass_Datenbank::marke(); $j = Aufmass_Datenbank::jetzt();
pruefe(abs(strtotime(substr($m, 0, 19)) - strtotime(substr($j, 0, 19))) <= 1, 'marke() und jetzt() zeigen dieselbe Uhr');
pruefe(preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/', $j) === 1, 'jetzt() hat immer sechs Nachkommastellen', $j);

echo "\nErgebnis Server: $ok ok, $fehler Fehler\n";
exit($fehler ? 1 : 0);
