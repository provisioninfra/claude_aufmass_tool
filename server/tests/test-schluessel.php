<?php
/* Zugangsschlüssel für Programme: erzeugen, ausweisen, Grenzen, Ablauf,
   Widerruf, Sperre, Höchstzahl, Drossel - durchgespielt gegen die echten
   Klassen (wp-attrappe.php stellt WordPress nach). */
require_once __DIR__ . '/wp-attrappe.php';

$ok = 0; $fehler = 0;
function pruefe($b, $t, $i = '') {
    global $ok, $fehler;
    if ($b) { $ok++; echo "  OK   $t\n"; }
    else { $fehler++; echo "  FEHL $t" . ($i !== '' ? "\n         -> $i" : '') . "\n"; }
}
function code($e) { return is_wp_error($e) ? $e->get_error_code() : gettype($e); }
/* Eine Anfrage mit dieser Kopfzeile stellen - ohne Cookie. */
function mit($kopf, $feld = 'HTTP_AUTHORIZATION') {
    Aufmass_Anmeldung::zuruecksetzen();
    unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['HTTP_X_AUFMASS_SCHLUESSEL']);
    $_COOKIE = array();
    if ($kopf !== null) { $_SERVER[$feld] = $kopf; }
    return Aufmass_Anmeldung::aktueller_benutzer();
}
function grund() { $e = Aufmass_Anmeldung::verlangt(); return is_wp_error($e) ? $e->get_error_code() : 'ok'; }

$weber  = test_benutzer('u-weber', 'M. Weber');
$kraus  = test_benutzer('u-kraus', 'J. Kraus');
$chefin = test_benutzer('u-chefin', 'Dr. Schäfer', 'verwaltung');
global $wpdb;

echo "\n== Erzeugen ==\n";
$e = Aufmass_Schluessel::erzeugen($weber, "Claude Code\n  Büro", 'schreiben', 90);
pruefe(!is_wp_error($e) && preg_match('/^aufm_[0-9a-f]{16}_[A-Za-z0-9_-]{48}$/', $e['schluessel']) === 1,
    'ein Schlüssel hat die Form aufm_<16 Hex>_<48 Zeichen>', is_wp_error($e) ? code($e) : $e['schluessel']);
pruefe($e['eintrag']['name'] === 'Claude Code Büro' && $e['eintrag']['rechte'] === 'schreiben', 'der Name wird einzeilig, die Rechte übernommen', json_encode($e['eintrag']));
pruefe(abs(strtotime($e['eintrag']['gueltigBis']) - (time() + 90 * 86400)) < 120, 'er läuft in 90 Tagen ab', $e['eintrag']['gueltigBis']);
pruefe($e['eintrag']['zuletztAm'] === '' && $e['eintrag']['abgelaufen'] === false, 'noch nie benutzt, nicht abgelaufen');
$lesen = Aufmass_Schluessel::erzeugen($weber, 'Auswertung', 'lesen', 0);
pruefe($lesen['eintrag']['rechte'] === 'lesen' && abs(strtotime($lesen['eintrag']['gueltigBis']) - (time() + 365 * 86400)) < 120,
    'Vorgabe: nur lesen, ein Jahr gültig');
$komisch = Aufmass_Schluessel::erzeugen($weber, '', 'admin', 5000);
pruefe($komisch['eintrag']['rechte'] === 'lesen' && $komisch['eintrag']['name'] === 'Zugangsschlüssel'
    && abs(strtotime($komisch['eintrag']['gueltigBis']) - (time() + 730 * 86400)) < 120,
    'unbekannte Rechte werden zu „lesen“, ohne Namen gilt eine Vorgabe, höchstens zwei Jahre', json_encode($komisch['eintrag']));
$liste = Aufmass_Schluessel::liste('u-weber');
pruefe(count($liste) === 3 && !isset($liste[0]['pruefwert']) && !isset($liste[0]['schluessel']), 'die Liste nennt drei Schlüssel - ohne Geheimnis', count($liste));
$geheim = substr($e['schluessel'], -48);
pruefe(strpos(json_encode($liste), $geheim) === false && strpos(json_encode($wpdb->get_results('SELECT * FROM wp_aufmass_schluessel', ARRAY_A)), $geheim) === false,
    'das Geheimnis steht weder in der Liste noch in der Datenbank');

echo "\n== Ausweisen über die Anfrage ==\n";
$b = mit('Bearer ' . $e['schluessel']);
pruefe($b && $b['id'] === 'u-weber' && Aufmass_Anmeldung::ueber_schluessel() && Aufmass_Anmeldung::schreiben_erlaubt(),
    'der Schreibschlüssel weist M. Weber aus und darf schreiben', json_encode($b));
$sb = Aufmass_Anmeldung::schluessel_beschreibung();
pruefe($sb && $sb['id'] === $e['eintrag']['id'] && $sb['rechte'] === 'schreiben', 'die Anfrage kennt ihren Schlüssel');
$b2 = mit('Bearer ' . $lesen['schluessel']);
pruefe($b2 && $b2['id'] === 'u-weber' && !Aufmass_Anmeldung::schreiben_erlaubt(), 'der Leseschlüssel weist aus, darf aber nicht schreiben');
$b3 = mit($e['schluessel'], 'HTTP_X_AUFMASS_SCHLUESSEL');
pruefe($b3 && $b3['id'] === 'u-weber', 'auch als Kopfzeile X-Aufmass-Schluessel (wenn ein Server „Authorization“ verschluckt)');
$b4 = mit('bearer   ' . $e['schluessel'] . '  ');
pruefe($b4 && $b4['id'] === 'u-weber', 'Groß-/Kleinschreibung und Leerraum um das Wort Bearer stören nicht');
$zeile = $wpdb->get_row($wpdb->prepare('SELECT * FROM wp_aufmass_schluessel WHERE id = %s', $e['eintrag']['id']), ARRAY_A);
pruefe(!empty($zeile['zuletzt_am']), 'die letzte Nutzung wird vermerkt', json_encode($zeile['zuletzt_am']));
$falsch = substr($e['schluessel'], 0, -4) . ($e['schluessel'][strlen($e['schluessel']) - 1] === 'a' ? 'bbbb' : 'aaaa');
pruefe(mit('Bearer ' . $falsch) === null && grund() === 'schluessel_ungueltig', 'ein Zeichen anders: ungültig, mit eigenem Grund', grund());
pruefe(mit('Bearer aufm_kauderwelsch') === null && grund() === 'schluessel_ungueltig', 'Kauderwelsch: ungültig');
pruefe(mit('Bearer aufm_' . str_repeat('0', 16) . '_' . $geheim) === null && grund() === 'schluessel_ungueltig', 'richtiges Geheimnis zur falschen Kennung: ungültig');
pruefe(mit('Basic ' . base64_encode('a:b')) === null && grund() === 'nicht_angemeldet', 'ein anderes Verfahren wird übergangen - dann zählt das Cookie, hier keines');
pruefe(mit(null) === null && grund() === 'nicht_angemeldet' && !Aufmass_Anmeldung::ueber_schluessel(), 'ohne Kopfzeile: nicht angemeldet, kein Schlüssel');
pruefe(Aufmass_Anmeldung::schreiben_erlaubt() === true, 'ohne Schlüssel gilt für das Schreiben allein das Cookie');

echo "\n== Ablauf, Widerruf, Sperre ==\n";
$id = $e['eintrag']['id'];
$wpdb->update('wp_aufmass_schluessel', array('gueltig_bis' => '2020-01-01 00:00:00.000000'), array('id' => $id));
pruefe(mit('Bearer ' . $e['schluessel']) === null && grund() === 'schluessel_abgelaufen', 'abgelaufen: ungültig, mit eigenem Grund', grund());
$li = Aufmass_Schluessel::liste('u-weber');
$abgelaufene = array_values(array_filter($li, function ($x) use ($id) { return $x['id'] === $id; }));
pruefe(count($abgelaufene) === 1 && $abgelaufene[0]['abgelaufen'] === true, 'die Liste kennzeichnet ihn als abgelaufen');
$wpdb->update('wp_aufmass_schluessel', array('gueltig_bis' => gmdate('Y-m-d H:i:s', time() + 86400) . '.000000'), array('id' => $id));
pruefe(mit('Bearer ' . $e['schluessel']) !== null, 'mit neuem Ablauf gilt er wieder');
$w = Aufmass_Schluessel::widerrufen($id, $kraus);
pruefe(is_wp_error($w) && $w->get_error_data()['status'] === 403, 'ein anderer Mitarbeiter kann ihn nicht widerrufen', code($w));
$w = Aufmass_Schluessel::widerrufen('zzzz', $weber);
pruefe(is_wp_error($w) && $w->get_error_data()['status'] === 404, 'eine unbekannte Kennung: 404');
$w = Aufmass_Schluessel::widerrufen($id, $chefin);
pruefe(!is_wp_error($w) && $w['ok'] === true, 'die Verwaltung kann jeden Schlüssel widerrufen', code($w));
pruefe(mit('Bearer ' . $e['schluessel']) === null && grund() === 'schluessel_widerrufen', 'widerrufen: ungültig, mit eigenem Grund', grund());
pruefe(count(Aufmass_Schluessel::liste('u-weber')) === 2, 'die Liste führt ihn nicht mehr');
$w = Aufmass_Schluessel::widerrufen($lesen['eintrag']['id'], $weber);
pruefe(!is_wp_error($w), 'den eigenen Schlüssel widerruft man selbst');
$k = Aufmass_Schluessel::erzeugen($kraus, 'Skript', 'lesen', 10);
Aufmass_Anmeldung::alle_beenden('u-weber');
pruefe(count(Aufmass_Schluessel::liste('u-weber')) === 0 && mit('Bearer ' . $komisch['schluessel']) === null,
    'eine Sperre (alle Geräte abmelden) widerruft alle Schlüssel der Person');
pruefe(mit('Bearer ' . $k['schluessel']) !== null, 'die Schlüssel anderer bleiben davon unberührt');
$wpdb->update('wp_aufmass_benutzer', array('aktiv' => 0), array('id' => 'u-kraus'));
pruefe(mit('Bearer ' . $k['schluessel']) === null && grund() === 'gesperrt', 'ein gesperrter Zugang zählt auch mit gültigem Schlüssel nicht', grund());
$wpdb->update('wp_aufmass_benutzer', array('aktiv' => 1), array('id' => 'u-kraus'));
pruefe(mit('Bearer ' . $k['schluessel']) !== null, 'freigegeben gilt er wieder');

echo "\n== Höchstzahl und Aufräumen ==\n";
$letzter = null;
for ($i = 0; $i < 20; $i++) { $letzter = Aufmass_Schluessel::erzeugen($chefin, 'Nr ' . $i, 'lesen', 30); }
pruefe(!is_wp_error($letzter) && count(Aufmass_Schluessel::liste('u-chefin')) === 20, 'zwanzig Schlüssel je Person sind möglich');
$zuviel = Aufmass_Schluessel::erzeugen($chefin, 'Nr 21', 'lesen', 30);
pruefe(is_wp_error($zuviel) && $zuviel->get_error_code() === 'zu_viele_schluessel', 'der einundzwanzigste wird abgewiesen', code($zuviel));
pruefe(Aufmass_Schluessel::anzahl('u-chefin') === 20 && Aufmass_Schluessel::anzahl('u-weber') === 0, 'die Zählung je Person stimmt');
Aufmass_Schluessel::aufraeumen();
pruefe((int) $wpdb->get_var('SELECT COUNT(*) FROM wp_aufmass_schluessel WHERE aktiv = 0') === 0, 'Aufräumen entfernt widerrufene Einträge');
pruefe((int) $wpdb->get_var('SELECT COUNT(*) FROM wp_aufmass_schluessel WHERE aktiv = 1') === 21, 'und lässt die gültigen stehen');

echo "\n== Hämmern ==\n";
for ($i = 0; $i < 30; $i++) { mit('Bearer aufm_' . str_repeat('0', 16) . '_' . str_repeat('a', 48)); }
pruefe(mit('Bearer ' . $k['schluessel']) === null && grund() === 'zu_viele', 'nach 30 Fehlversuchen von einer Herkunft: gedrosselt - auch für gültige Schlüssel', grund());
pruefe(mit('Bearer ' . $k['schluessel']) === null && Aufmass_Anmeldung::verlangt()->get_error_data()['status'] === 429, 'mit Antwort 429');

echo "\nErgebnis Zugangsschlüssel: $ok ok, $fehler Fehler\n";
exit($fehler ? 1 : 0);
