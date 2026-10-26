<?php
/* Prüft die Ausweisprüfung mit echten RSA-Schlüsseln - und vor allem mit
 * den Angriffen, die bei JWT üblich sind. */
define('ABSPATH', __DIR__ . '/');
require_once __DIR__ . '/../aufmass-sync/inc/jwt.php';

$ok = 0; $fehler = 0;
function pruefe($b, $t, $i = '') {
    global $ok, $fehler;
    if ($b) { $ok++; echo "  OK   $t\n"; }
    else { $fehler++; echo "  FEHL $t" . ($i ? "\n         -> $i" : '') . "\n"; }
}
function b64($roh) { return rtrim(strtr(base64_encode($roh), '+/', '-_'), '='); }

/* --- Schlüsselpaar und passendes JWK ------------------------------------ */
$paar = openssl_pkey_new(array('private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA));
$einzel = openssl_pkey_get_details($paar);
$JWK = array('keys' => array(array(
    'kty' => 'RSA', 'kid' => 'pruef-1', 'alg' => 'RS256', 'use' => 'sig',
    'n' => b64($einzel['rsa']['n']), 'e' => b64($einzel['rsa']['e'])
)));
Aufmass_JWT::$schluessel_vorrat = $JWK;

$CLIENT = '1234567890-abcdef.apps.googleusercontent.com';
$DOMAENE = 'provision-infra.de';

function ausweis($paar, $aenderungen = array(), $kid = 'pruef-1', $alg = 'RS256') {
    $kopf = array('alg' => $alg, 'kid' => $kid, 'typ' => 'JWT');
    $inhalt = array_merge(array(
        'iss' => 'https://accounts.google.com',
        'aud' => '1234567890-abcdef.apps.googleusercontent.com',
        'sub' => '110244747891234567890',
        'email' => 'weber@provision-infra.de',
        'email_verified' => true,
        'hd' => 'provision-infra.de',
        'name' => 'M. Weber',
        'iat' => time() - 30,
        'exp' => time() + 3600
    ), $aenderungen);
    foreach ($aenderungen as $k => $v) { if ($v === null) { unset($inhalt[$k]); } }
    $vorn = b64(json_encode($kopf)) . '.' . b64(json_encode($inhalt));
    openssl_sign($vorn, $sig, $paar, OPENSSL_ALGO_SHA256);
    return $vorn . '.' . b64($sig);
}

echo "\n== Gültiger Ausweis ==\n";
$e = Aufmass_JWT::pruefen(ausweis($paar), $CLIENT, $DOMAENE);
pruefe($e['ok'] === true, 'ein gültiger Ausweis wird angenommen', $e['ok'] ? '' : $e['grund']);
pruefe(isset($e['daten']['sub']) && $e['daten']['sub'] === '110244747891234567890', 'die Benutzerkennung kommt durch');
pruefe($e['daten']['email'] === 'weber@provision-infra.de', 'die Adresse kommt durch');

echo "\n== Angriffe und Fehlfälle ==\n";

/* 1. Unterschrift mit einem FREMDEN Schlüssel */
$fremd = openssl_pkey_new(array('private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA));
$e = Aufmass_JWT::pruefen(ausweis($fremd), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'fremd unterschriebener Ausweis wird abgelehnt', json_encode($e));

/* 2. "alg": "none" - der Klassiker */
$kopf = b64(json_encode(array('alg' => 'none', 'kid' => 'pruef-1', 'typ' => 'JWT')));
$inhalt = b64(json_encode(array('iss' => 'https://accounts.google.com', 'aud' => $CLIENT,
    'sub' => '1', 'email' => 'x@provision-infra.de', 'email_verified' => true,
    'hd' => 'provision-infra.de', 'exp' => time() + 3600)));
$e = Aufmass_JWT::pruefen($kopf . '.' . $inhalt . '.', $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, '"alg: none" wird abgelehnt', json_encode($e));

/* 3. HMAC mit dem öffentlichen Schlüssel als Geheimnis (Verfahrenstausch) */
$kopf = b64(json_encode(array('alg' => 'HS256', 'kid' => 'pruef-1', 'typ' => 'JWT')));
$vorn = $kopf . '.' . $inhalt;
$e = Aufmass_JWT::pruefen($vorn . '.' . b64(hash_hmac('sha256', $vorn, $einzel['key'], true)), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'Verfahrenstausch auf HS256 wird abgelehnt', json_encode($e));

/* 4. Nachträglich veränderter Inhalt bei gültiger alter Unterschrift */
$gut = ausweis($paar);
$t = explode('.', $gut);
$veraendert = json_decode(Aufmass_JWT::b64_entschluesseln($t[1]), true);
$veraendert['email'] = 'angreifer@fremd.de';
$e = Aufmass_JWT::pruefen($t[0] . '.' . b64(json_encode($veraendert)) . '.' . $t[2], $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'nachträglich veränderter Inhalt wird abgelehnt', json_encode($e));

/* 5. Falsche Anwendung (aud) */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('aud' => 'andere-app.apps.googleusercontent.com')), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'Ausweis für eine andere Anwendung wird abgelehnt', json_encode($e));

/* 5b. aud als Liste (laut Norm erlaubt) */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('aud' => array('andere', $CLIENT))), $CLIENT, $DOMAENE);
pruefe($e['ok'] === true, 'aud als Liste mit passendem Eintrag wird angenommen', $e['ok'] ? '' : $e['grund']);
$e = Aufmass_JWT::pruefen(ausweis($paar, array('aud' => array('andere', 'fremd'))), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'aud als Liste ohne passenden Eintrag wird abgelehnt');
$e = Aufmass_JWT::pruefen(ausweis($paar, array('aud' => array(array($CLIENT)))), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'verschachtelter Unsinn in aud wird abgelehnt, ohne Warnung');

/* 6. Abgelaufen */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('exp' => time() - 3600, 'iat' => time() - 7200)), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'abgelaufener Ausweis wird abgelehnt', json_encode($e));

/* 7. Privates Google-Konto ohne hd */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('hd' => null, 'email' => 'privat@gmail.com')), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'privates gmail-Konto wird abgelehnt', json_encode($e));

/* 8. Fremde Organisation */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('hd' => 'fremde-firma.de', 'email' => 'x@fremde-firma.de')), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'fremde Organisation wird abgelehnt', json_encode($e));

/* 9. hd stimmt, Adresse aber nicht (untergeschobene Angabe) */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('hd' => 'provision-infra.de', 'email' => 'x@fremd.de')), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'hd ohne passende Adresse wird abgelehnt', json_encode($e));

/* 9b. Adresse endet nur zufällig ähnlich */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('email' => 'x@boeseprovision-infra.de')), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'ähnlich aussehende Domäne wird abgelehnt', json_encode($e));

/* 10. Adresse nicht bestätigt */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('email_verified' => false)), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'unbestätigte Adresse wird abgelehnt', json_encode($e));

/* 11. Falscher Aussteller */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('iss' => 'https://boeser-aussteller.de')), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'fremder Aussteller wird abgelehnt', json_encode($e));

/* 12. Unbekannte Schlüsselkennung */
$e = Aufmass_JWT::pruefen(ausweis($paar, array(), 'unbekannt-99'), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'unbekannte Schlüsselkennung wird abgelehnt', json_encode($e));

/* 13. Unsinn */
foreach (array('', 'abc', 'a.b', 'a.b.c.d', '....', str_repeat('x', 5000)) as $mies) {
    $e = Aufmass_JWT::pruefen($mies, $CLIENT, $DOMAENE);
    pruefe(is_array($e) && $e['ok'] === false, 'unsinnige Eingabe ' . json_encode(substr($mies, 0, 8)) . ' endet geordnet');
}

/* 14. Ohne Domäne ist die Anmeldung gesperrt - nicht offen */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('hd' => null, 'email' => 'privat@gmail.com')), $CLIENT, '');
pruefe($e['ok'] === false && strpos($e['grund'], 'gesperrt') !== false, 'ohne festgelegte Domäne wird kein Ausweis angenommen', json_encode($e));
$e = Aufmass_JWT::pruefen(ausweis($paar), $CLIENT, '');
pruefe($e['ok'] === false, 'auch ein Konto der Organisation nicht - erst die Einrichtung macht die Anmeldung auf', json_encode($e));
$e = Aufmass_JWT::pruefen(ausweis($paar), '', $DOMAENE);
pruefe($e['ok'] === false, 'ohne Client-ID ebenso wenig', json_encode($e));

/* 14b. Alter und Zeitfenster */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('iat' => time() - 1200)), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false && strpos($e['grund'], 'zu alt') !== false, 'ein 20 Minuten alter Ausweis wird abgelehnt - auch wenn er noch nicht abgelaufen ist', json_encode($e));
$e = Aufmass_JWT::pruefen(ausweis($paar, array('iat' => time() - 500)), $CLIENT, $DOMAENE);
pruefe($e['ok'] === true, 'ein wenige Minuten alter Ausweis geht durch', $e['ok'] ? '' : $e['grund']);
$e = Aufmass_JWT::pruefen(ausweis($paar, array('iat' => null)), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'ohne Ausstellungszeit wird abgelehnt', json_encode($e));
$e = Aufmass_JWT::pruefen(ausweis($paar, array('iat' => time() + 600)), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'ein Ausweis aus der Zukunft wird abgelehnt', json_encode($e));
$e = Aufmass_JWT::pruefen(ausweis($paar, array('nbf' => time() + 600)), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'ein noch nicht gültiger Ausweis (nbf) wird abgelehnt', json_encode($e));
$e = Aufmass_JWT::pruefen(ausweis($paar, array('exp' => 'bald')), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'ein unlesbares Ablaufdatum wird abgelehnt', json_encode($e));

/* 14c. azp, hd und Adresse */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('azp' => 'andere-app.apps.googleusercontent.com')), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'ein fremdes azp wird abgelehnt', json_encode($e));
$e = Aufmass_JWT::pruefen(ausweis($paar, array('azp' => $CLIENT)), $CLIENT, $DOMAENE);
pruefe($e['ok'] === true, 'das eigene azp geht durch', $e['ok'] ? '' : $e['grund']);
$e = Aufmass_JWT::pruefen(ausweis($paar, array('hd' => array('provision-infra.de'))), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'hd als Liste wird abgelehnt', json_encode($e));
$e = Aufmass_JWT::pruefen(ausweis($paar, array('email' => 'weber@provision-infra.de weber@fremd.de')), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'zwei Adressen in einem Feld werden abgelehnt', json_encode($e));
$e = Aufmass_JWT::pruefen(ausweis($paar, array('sub' => 'kein sub!')), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'eine unbrauchbare Benutzerkennung wird abgelehnt', json_encode($e));
$e = Aufmass_JWT::pruefen(ausweis($paar, array('sub' => 12345)), $CLIENT, $DOMAENE);
pruefe($e['ok'] === true && $e['daten']['sub'] === '12345', 'die Benutzerkennung wird als Text geführt', json_encode($e));
$e = Aufmass_JWT::pruefen(str_repeat('a', 9000), $CLIENT, $DOMAENE);
pruefe($e['ok'] === false, 'ein überlanger Ausweis wird abgewiesen, ohne ihn zu entziffern');

/* 15. Groß-/Kleinschreibung der Domäne darf nicht stören */
$e = Aufmass_JWT::pruefen(ausweis($paar, array('hd' => 'Provision-Infra.DE', 'email' => 'Weber@Provision-Infra.DE')), $CLIENT, $DOMAENE);
pruefe($e['ok'] === true, 'Großschreibung in der Domäne stört nicht', $e['ok'] ? '' : $e['grund']);

echo "\n== Schlüsselbau aus JWK ==\n";
$s = Aufmass_JWT::schluessel_aus_jwk(b64($einzel['rsa']['n']), b64($einzel['rsa']['e']));
pruefe($s !== null, 'aus n und e entsteht ein brauchbarer Schlüssel');
$d = $s ? openssl_pkey_get_details($s) : null;
pruefe($d && $d['rsa']['n'] === $einzel['rsa']['n'], 'der Modulus bleibt unverändert');
pruefe($d && $d['rsa']['e'] === $einzel['rsa']['e'], 'der Exponent bleibt unverändert');
pruefe(Aufmass_JWT::schluessel_aus_jwk('', '') === null, 'leere Angaben ergeben keinen Schlüssel');
pruefe(Aufmass_JWT::schluessel_aus_jwk('!!!nicht-base64!!!', 'AQAB') === null, 'unsinnige Angaben ergeben keinen Schlüssel');

/* Ein Schlüssel mit gesetztem obersten Bit (führende Null nötig) */
for ($i = 0; $i < 3; $i++) {
    $p2 = openssl_pkey_new(array('private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA));
    $d2 = openssl_pkey_get_details($p2);
    $s2 = Aufmass_JWT::schluessel_aus_jwk(b64($d2['rsa']['n']), b64($d2['rsa']['e']));
    $g2 = $s2 ? openssl_pkey_get_details($s2) : null;
    pruefe($g2 && $g2['rsa']['n'] === $d2['rsa']['n'], 'Schlüssel ' . ($i + 1) . ' wird korrekt aufgebaut');
}

echo "\nErgebnis JWT: $ok ok, $fehler Fehler\n";
exit($fehler ? 1 : 0);
