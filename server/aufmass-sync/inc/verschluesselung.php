<?php
/**
 * verschluesselung.php — Ablage von Geheimnissen (z. B. Pipedrive-Schlüssel).
 *
 * Der Schlüssel zum Ver- und Entschlüsseln entsteht aus zwei Quellen:
 *  - den Salts in der wp-config.php (AUTH_KEY, SECURE_AUTH_KEY) - eine Datei
 *    im Dateisystem, NICHT in der Datenbank
 *  - dem Geheimnis dieser Installation (aufmass_geheimnis) in der Datenbank
 *
 * Wer nur die Datenbank erbeutet (der häufigste Fall: ein Backup, ein Dump,
 * eine SQL-Lücke), kann damit nichts anfangen. Erst Datenbank UND
 * wp-config.php zusammen genügen - und wer beides hat, hat ohnehin den
 * ganzen Server.
 *
 * Verfahren: XSalsa20-Poly1305 (sodium), ersatzweise AES-256-GCM (openssl).
 * Beide prüfen die Unversehrtheit mit; ein manipulierter Wert ergibt
 * keinen Klartext, sondern nichts.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Verschluesselung {

    private static function schluessel() {
        $salz = (defined('AUTH_KEY') ? AUTH_KEY : '') . '|' . (defined('SECURE_AUTH_KEY') ? SECURE_AUTH_KEY : '');
        $geheim = (string) get_option('aufmass_geheimnis', '');
        if (trim($salz, '|') === '' && $geheim === '') { return null; }
        return hash('sha256', $salz . '|' . $geheim, true);   /* 32 Byte */
    }

    /** Liefert eine Zeichenkette für die Datenbank, oder null wenn kein Schlüssel. */
    /** Sieht der Wert aus wie eine Ablage aus verschluesseln()? */
    public static function ist_chiffre($wert) {
        return (bool) preg_match('#^(s1|o1):[A-Za-z0-9+/=]+$#', (string) $wert);
    }

    public static function verschluesseln($klartext) {
        $k = self::schluessel();
        if ($k === null) { return null; }
        $klartext = (string) $klartext;

        if (function_exists('sodium_crypto_secretbox')) {
            $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
            $chiffre = sodium_crypto_secretbox($klartext, $nonce, $k);
            return 's1:' . base64_encode($nonce . $chiffre);
        }
        if (function_exists('openssl_encrypt')) {
            $iv = random_bytes(12);
            $tag = '';
            $chiffre = openssl_encrypt($klartext, 'aes-256-gcm', $k, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
            if ($chiffre === false) { return null; }
            return 'o1:' . base64_encode($iv . $tag . $chiffre);
        }
        return null;
    }

    /** Liefert den Klartext, oder null wenn unlesbar (falscher Schlüssel, manipuliert, leer). */
    public static function entschluesseln($text) {
        $text = (string) $text;
        if ($text === '') { return null; }
        $k = self::schluessel();
        if ($k === null) { return null; }
        $art = substr($text, 0, 3);
        $roh = base64_decode(substr($text, 3), true);
        if ($roh === false) { return null; }

        if ($art === 's1:') {
            if (!function_exists('sodium_crypto_secretbox_open')) { return null; }
            $n = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES;
            if (strlen($roh) <= $n) { return null; }
            $klar = sodium_crypto_secretbox_open(substr($roh, $n), substr($roh, 0, $n), $k);
            return $klar === false ? null : $klar;
        }
        if ($art === 'o1:') {
            if (!function_exists('openssl_decrypt') || strlen($roh) <= 28) { return null; }
            $klar = openssl_decrypt(substr($roh, 28), 'aes-256-gcm', $k, OPENSSL_RAW_DATA,
                substr($roh, 0, 12), substr($roh, 12, 16));
            return $klar === false ? null : $klar;
        }
        return null;
    }
}
