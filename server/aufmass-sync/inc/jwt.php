<?php
/**
 * jwt.php — Prüfung des Google-Ausweises (ID-Token).
 *
 * Der Browser holt sich bei Google einen unterschriebenen Ausweis. Dieser
 * Ausweis darf NIEMALS einfach geglaubt werden: Wer die Schnittstelle
 * kennt, kann sich sonst einen beliebigen Ausweis ausdenken. Darum wird
 * hier die Unterschrift gegen Googles öffentliche Schlüssel geprüft und
 * anschließend jede einzelne Angabe kontrolliert.
 *
 * Bewusst ohne fremde Bibliothek: Die Prüfung ist überschaubar, und eine
 * mitgelieferte Bibliothek müsste dauerhaft mitgepflegt werden.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_JWT {

    const SCHLUESSEL_URL = 'https://www.googleapis.com/oauth2/v3/certs';
    const AUSSTELLER = array('https://accounts.google.com', 'accounts.google.com');
    /** Toleranz für ungenaue Uhren, in Sekunden. */
    const UHRSPANNE = 120;
    /** Ein Ausweis wird hier nur kurz nach seiner Ausstellung angenommen:
     *  Der Browser schickt ihn sofort nach dem Klick. Ein älterer Ausweis
     *  ist ein kopierter - auch wenn Google ihn noch eine Stunde gelten
     *  ließe. In Sekunden. */
    const HOECHSTALTER = 600;
    /** Länger ist kein Google-Ausweis - alles darüber wird gar nicht erst entziffert. */
    const LAENGE_MAX = 8192;

    /** Für Tests: Schlüssel von Hand setzen, statt sie bei Google zu holen. */
    public static $schluessel_vorrat = null;

    /* ---------------------------------------------------------------- */
    /* Base64 nach URL-Art                                               */
    /* ---------------------------------------------------------------- */
    public static function b64_entschluesseln($text) {
        $text = strtr((string) $text, '-_', '+/');
        $rest = strlen($text) % 4;
        if ($rest) { $text .= str_repeat('=', 4 - $rest); }
        $roh = base64_decode($text, true);
        return $roh === false ? null : $roh;
    }

    public static function b64_verschluesseln($roh) {
        return rtrim(strtr(base64_encode($roh), '+/', '-_'), '=');
    }

    /* ---------------------------------------------------------------- */
    /* Aus den Angaben eines JWK einen öffentlichen Schlüssel bauen       */
    /* ---------------------------------------------------------------- */
    private static function der_laenge($laenge) {
        if ($laenge < 0x80) { return chr($laenge); }
        $bytes = '';
        while ($laenge > 0) { $bytes = chr($laenge & 0xFF) . $bytes; $laenge >>= 8; }
        return chr(0x80 | strlen($bytes)) . $bytes;
    }

    private static function der_zahl($roh) {
        $roh = ltrim($roh, "\x00");
        if ($roh === '') { $roh = "\x00"; }
        /* Führendes Nullbyte, wenn das oberste Bit gesetzt ist: Sonst
           läse ASN.1 die Zahl als negativ. */
        if (ord($roh[0]) & 0x80) { $roh = "\x00" . $roh; }
        return "\x02" . self::der_laenge(strlen($roh)) . $roh;
    }

    private static function der_folge($inhalt) {
        return "\x30" . self::der_laenge(strlen($inhalt)) . $inhalt;
    }

    /**
     * Baut aus Modulus (n) und Exponent (e) einen PEM-Schlüssel.
     * Aufbau nach RFC 5280: SubjectPublicKeyInfo.
     */
    public static function schluessel_aus_jwk($n_b64, $e_b64) {
        $n = self::b64_entschluesseln($n_b64);
        $e = self::b64_entschluesseln($e_b64);
        if ($n === null || $e === null || $n === '' || $e === '') { return null; }

        $rsa = self::der_folge(self::der_zahl($n) . self::der_zahl($e));
        /* OID 1.2.840.113549.1.1.1 (rsaEncryption) mit NULL-Parameter */
        $oid = "\x30\x0d\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00";
        /* Das führende Nullbyte zählt die ungenutzten Bits des BIT STRING */
        $bit = "\x03" . self::der_laenge(strlen($rsa) + 1) . "\x00" . $rsa;
        $der = self::der_folge($oid . $bit);

        $pem = "-----BEGIN PUBLIC KEY-----\n"
             . chunk_split(base64_encode($der), 64, "\n")
             . "-----END PUBLIC KEY-----\n";
        $schluessel = openssl_pkey_get_public($pem);
        return $schluessel ?: null;
    }

    /* ---------------------------------------------------------------- */
    /* Googles Schlüssel holen (und zwischenspeichern)                    */
    /* ---------------------------------------------------------------- */
    public static function schluessel_holen($erzwingen = false) {
        if (self::$schluessel_vorrat !== null) { return self::$schluessel_vorrat; }

        if (!$erzwingen) {
            $zwischen = get_transient('aufmass_google_schluessel');
            if (is_array($zwischen) && !empty($zwischen['keys'])) { return $zwischen; }
        }

        /* Auf Vorrat höchstens einmal je Minute bei Google nachfragen: Wer
           mit erfundenen Schlüsselkennungen hämmert, soll damit keine
           Abrufe auslösen können. */
        if ($erzwingen) {
            if (get_transient('aufmass_google_schluessel_neu')) {
                $alt = get_transient('aufmass_google_schluessel');
                return is_array($alt) ? $alt : null;
            }
            set_transient('aufmass_google_schluessel_neu', 1, 60);
        }
        $antwort = wp_remote_get(self::SCHLUESSEL_URL, array('timeout' => 10, 'sslverify' => true));
        if (is_wp_error($antwort) || (int) wp_remote_retrieve_response_code($antwort) !== 200) {
            /* Lieber der alte Schlüsselstand als gar keine Anmeldung */
            $alt = get_option('aufmass_google_schluessel_sicherung');
            return is_array($alt) ? $alt : null;
        }
        $daten = json_decode(wp_remote_retrieve_body($antwort), true);
        if (!is_array($daten) || empty($daten['keys'])) { return null; }

        /* Google nennt im Cache-Control, wie lange die Schlüssel gelten. */
        $dauer = 3600;
        $steuerung = wp_remote_retrieve_header($antwort, 'cache-control');
        /* WordPress liefert mehrfach gesetzte Kopffelder als Array */
        if (is_array($steuerung)) { $steuerung = implode(', ', $steuerung); }
        if ($steuerung && preg_match('/max-age=(\d+)/', (string) $steuerung, $treffer)) {
            $dauer = max(300, min(86400, (int) $treffer[1]));
        }
        set_transient('aufmass_google_schluessel', $daten, $dauer);
        update_option('aufmass_google_schluessel_sicherung', $daten, false);
        return $daten;
    }

    /* ---------------------------------------------------------------- */
    /* Die eigentliche Prüfung                                           */
    /* ---------------------------------------------------------------- */

    /**
     * Prüft einen Google-Ausweis vollständig.
     *
     * @param string $token    Der Ausweis aus dem Browser.
     * @param string $client   Die erwartete Client-ID (aud).
     * @param string $domaene  Die erwartete Organisation (hd). Ohne Domäne
     *                         wird kein Ausweis angenommen - die Anmeldung
     *                         ist dann gesperrt, nicht offen.
     * @return array  ['ok'=>true,'daten'=>[...]] oder ['ok'=>false,'grund'=>'...']
     */
    public static function pruefen($token, $client, $domaene) {
        $token = (string) $token;
        $client = trim((string) $client);
        $domaene = strtolower(trim((string) $domaene));
        if ($client === '') { return self::nein('Es ist keine Google-Client-ID festgelegt.'); }
        if ($domaene === '') { return self::nein('Es ist keine Organisationsdomäne festgelegt. Die Anmeldung ist gesperrt.'); }
        if ($token === '' || strlen($token) > self::LAENGE_MAX) { return self::nein('Der Ausweis ist unvollständig.'); }
        $teile = explode('.', $token);
        if (count($teile) !== 3) { return self::nein('Der Ausweis ist unvollständig.'); }

        $kopf = json_decode((string) self::b64_entschluesseln($teile[0]), true);
        $inhalt = json_decode((string) self::b64_entschluesseln($teile[1]), true);
        $unterschrift = self::b64_entschluesseln($teile[2]);
        if (!is_array($kopf) || !is_array($inhalt) || $unterschrift === null) {
            return self::nein('Der Ausweis ist nicht lesbar.');
        }

        /* Nur RS256. "alg: none" und HMAC-Verfahren werden ausdrücklich
           abgelehnt - das ist die klassische Lücke bei JWT. */
        if (!isset($kopf['alg']) || $kopf['alg'] !== 'RS256') {
            return self::nein('Unerwartetes Signaturverfahren.');
        }
        if (empty($kopf['kid'])) { return self::nein('Dem Ausweis fehlt die Schlüsselkennung.'); }

        $vorrat = self::schluessel_holen();
        $schluessel = self::schluessel_suchen($vorrat, $kopf['kid']);
        if (!$schluessel) {
            /* Google wechselt die Schlüssel regelmäßig: einmal neu holen. */
            $vorrat = self::schluessel_holen(true);
            $schluessel = self::schluessel_suchen($vorrat, $kopf['kid']);
        }
        if (!$schluessel) { return self::nein('Der Signaturschlüssel ist unbekannt.'); }

        $oeffentlich = self::schluessel_aus_jwk($schluessel['n'], $schluessel['e']);
        if (!$oeffentlich) { return self::nein('Der Signaturschlüssel ist unbrauchbar.'); }

        $geprueft = openssl_verify($teile[0] . '.' . $teile[1], $unterschrift, $oeffentlich, OPENSSL_ALGO_SHA256);
        if ($geprueft !== 1) { return self::nein('Die Unterschrift stimmt nicht.'); }

        /* --- Jetzt erst die Angaben im Ausweis --- */
        $jetzt = time();
        if (empty($inhalt['iss']) || !in_array($inhalt['iss'], self::AUSSTELLER, true)) {
            return self::nein('Der Ausweis stammt nicht von Google.');
        }
        /* aud darf laut Norm auch eine Liste sein; Google schickt eine
           Zeichenkette. Beides wird angenommen, Unerwartetes abgewiesen. */
        $aud = isset($inhalt['aud']) ? $inhalt['aud'] : null;
        $audPasst = false;
        foreach ((is_array($aud) ? $aud : array($aud)) as $eintrag) {
            if (is_string($eintrag) && $eintrag !== '' && hash_equals((string) $client, $eintrag)) { $audPasst = true; }
        }
        if (!$audPasst) {
            return self::nein('Der Ausweis wurde für eine andere Anwendung ausgestellt.');
        }
        /* azp (authorized party) nennt Google nur bei manchen Ausweisen -
           wenn, dann muss es unsere Anwendung sein. */
        if (isset($inhalt['azp']) && (!is_string($inhalt['azp']) || !hash_equals($client, $inhalt['azp']))) {
            return self::nein('Der Ausweis wurde für eine andere Anwendung ausgestellt.');
        }
        if (empty($inhalt['exp']) || !is_numeric($inhalt['exp']) || $jetzt > ((int) $inhalt['exp'] + self::UHRSPANNE)) {
            return self::nein('Der Ausweis ist abgelaufen. Bitte erneut anmelden.');
        }
        if (!isset($inhalt['iat']) || !is_numeric($inhalt['iat'])) {
            return self::nein('Dem Ausweis fehlt die Ausstellungszeit.');
        }
        if (((int) $inhalt['iat'] - self::UHRSPANNE) > $jetzt) {
            return self::nein('Der Ausweis liegt in der Zukunft. Bitte die Uhr des Geräts prüfen.');
        }
        if ($jetzt - (int) $inhalt['iat'] > self::HOECHSTALTER + self::UHRSPANNE) {
            return self::nein('Der Ausweis ist zu alt. Bitte erneut anmelden.');
        }
        if (isset($inhalt['nbf']) && is_numeric($inhalt['nbf']) && ((int) $inhalt['nbf'] - self::UHRSPANNE) > $jetzt) {
            return self::nein('Der Ausweis gilt noch nicht. Bitte die Uhr des Geräts prüfen.');
        }
        if (empty($inhalt['sub'])) { return self::nein('Dem Ausweis fehlt die Benutzerkennung.'); }
        if (empty($inhalt['email'])) { return self::nein('Dem Ausweis fehlt die Adresse.'); }
        /* email_verified kann als echter Wahrheitswert oder als Text kommen */
        $bestaetigt = isset($inhalt['email_verified']) ? $inhalt['email_verified'] : false;
        if ($bestaetigt !== true && $bestaetigt !== 'true') {
            return self::nein('Die Adresse ist bei Google nicht bestätigt.');
        }

        /* Die eigentliche Zugangsregel: nur die eigene Organisation. Der
           Wert hd steht ausschließlich bei Google-Workspace-Konten - ein
           privates gmail.com-Konto hat ihn nicht und fällt damit heraus.
           Google setzt hd nur, wenn das Konto wirklich zu dieser Workspace-
           Organisation gehört; ein Konto kann ihn sich nicht selbst geben. */
        $hd = isset($inhalt['hd']) && is_string($inhalt['hd']) ? strtolower(trim($inhalt['hd'])) : '';
        if ($hd === '' || $hd !== $domaene) {
            return self::nein('Dieses Konto gehört nicht zu ' . $domaene . '.');
        }
        /* Doppelt gesichert: auch die Adresse muss auf die Domäne enden -
           genau eine Adresse, ohne Leerraum, hd allein genügt uns nicht. */
        $adresse = strtolower(trim((string) $inhalt['email']));
        if (!preg_match('/^[^@\s]+@[^@\s]+$/', $adresse)
            || substr($adresse, -(strlen($domaene) + 1)) !== '@' . $domaene) {
            return self::nein('Die Adresse gehört nicht zu ' . $domaene . '.');
        }
        $inhalt['email'] = $adresse;
        $inhalt['sub'] = (string) $inhalt['sub'];
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $inhalt['sub'])) {
            return self::nein('Die Benutzerkennung des Ausweises ist unbrauchbar.');
        }

        return array('ok' => true, 'daten' => $inhalt);
    }

    private static function schluessel_suchen($vorrat, $kid) {
        if (!is_array($vorrat) || empty($vorrat['keys'])) { return null; }
        foreach ($vorrat['keys'] as $k) {
            if (isset($k['kid']) && hash_equals((string) $k['kid'], (string) $kid)
                && isset($k['n'], $k['e'])) {
                if (isset($k['kty']) && $k['kty'] !== 'RSA') { continue; }
                /* Ein Schlüssel, der laut Google nicht zum Unterschreiben
                   oder für ein anderes Verfahren bestimmt ist, zählt nicht. */
                if (isset($k['use']) && $k['use'] !== 'sig') { continue; }
                if (isset($k['alg']) && $k['alg'] !== 'RS256') { continue; }
                return $k;
            }
        }
        return null;
    }

    private static function nein($grund) {
        return array('ok' => false, 'grund' => $grund);
    }
}
