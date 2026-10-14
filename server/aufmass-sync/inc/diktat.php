<?php
/**
 * diktat.php — Tür einsprechen.
 *
 * Die Tonaufnahme aus dem Werkzeug wird bei OpenAI in Text verwandelt,
 * und dieser Text wird den Feldern des Türformulars zugeordnet. Der
 * OpenAI-Schlüssel liegt verschlüsselt hier auf dem Server - genau wie der
 * Pipedrive-Schlüssel (verschluesselung.php) - und verlässt ihn nie. Die
 * Geräte sprechen nur mit diesem Server.
 *
 * Ablauf je Diktat:
 *   1. Aufnahme (webm, mp4, ogg, mp3 oder wav; höchstens 10 MiB) wird an
 *      „audio/transcriptions“ gegeben, Sprache Deutsch, mit Fachwörtern als
 *      Vorgabe gegen Verhörer. Ergebnis: der gesprochene Text.
 *   2. Text und das Feldschema des Werkzeugs gehen an „chat/completions“
 *      mit festem JSON-Schema (strict). Ergebnis: je Feld ein Wert oder
 *      null, dazu die Liste „offen“ mit allem, was zu keinem Feld passte.
 *   3. Das Ergebnis wird hier noch einmal gegen das Schema geprüft: nur
 *      bekannte Felder, nur erlaubte Werte. Das Werkzeug zeigt es als
 *      Vorschlag; übernommen wird erst nach Bestätigung durch den Menschen.
 *
 * Das Schema bringt das Werkzeug mit - es kennt den Katalog; der Server
 * prüft Form und Umfang. Gespeichert wird nichts: weder Ton noch Text noch
 * Ergebnis. Je Person sind die Diktate gedrosselt (Minute und Tag).
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Diktat {

    const STANDARD_HOST = 'api.openai.com';
    const MODELL_ERKENNUNG = 'gpt-4o-transcribe';
    const MODELL_ZUORDNUNG = 'gpt-4.1-mini';
    const TON_MAX = 10485760;      /* 10 MiB - drei Minuten Aufnahme sind rund 1 bis 3 MiB */
    const TEXT_MAX = 20000;
    const FELDER_MAX = 80;
    const WERTE_MAX = 80;
    const WOERTER_MAX = 40;
    const JE_MINUTE = 12;
    const JE_TAG = 400;
    /* Innerhalb üblicher Laufzeitgrenzen eines Hosters (60-120 s je Anfrage) */
    const ZEIT_ERKENNUNG = 60;
    const ZEIT_ZUORDNUNG = 45;

    /** Tonformate des Werkzeugs und die Dateiendung, an der OpenAI das Format erkennt. */
    const FORMATE = array(
        'audio/webm' => 'webm', 'audio/mp4' => 'mp4', 'audio/x-m4a' => 'm4a', 'audio/m4a' => 'm4a',
        'audio/mpeg' => 'mp3', 'audio/mp3' => 'mp3', 'audio/ogg' => 'ogg', 'audio/wav' => 'wav',
        'audio/x-wav' => 'wav', 'audio/wave' => 'wav', 'audio/flac' => 'flac'
    );
    const TYPEN = array('text', 'zahl', 'wahl', 'mehrfach', 'ja_nein');

    /** Fachwörter als Vorgabe für die Erkennung - so wird aus „Dornmaß“
     *  kein „Dornmast“. Eigene Begriffe des Werkzeugs kommen dazu. */
    const VOKABULAR = 'Aufmaß einer Tür für eine Schließanlage. Fachwörter: Profilzylinder, Doppelzylinder, Halbzylinder, Knaufzylinder, Länge außen, Länge innen, BSZ, beidseitig schließbar, Not- und Gefahrenfunktion, Freidreh, VdS, SKG, Dornmaß, Entfernung, Vierkant, Türblattstärke, DIN links, DIN rechts, Rosettengarnitur, Langschildgarnitur, Schutzbeschlag, Wechselgarnitur, Panikbeschlag, Drücker, Knauf, Stoßgriff, Einsteckschloss, Rohrrahmenschloss, Mehrfachverriegelung, Motorschloss, Panikfunktion, Stulp, Fallenart, Riegelausschluss, Wandleser, Kabelübergang, Leerrohr, Türöffner, Nacharbeit, Haupteingang, Technikraum.';

    /** Die Anweisung an das Modell für die Zuordnung. */
    const ANWEISUNG = "Du bist Teil eines Aufmaß-Werkzeugs für Schließanlagen. Ein Monteur hat beim Aufmaß einer Tür Angaben eingesprochen; der Text wurde automatisch erkannt und kann Hörfehler enthalten. Ordne die Angaben den Feldern des Formulars zu und antworte ausschließlich mit dem JSON nach dem vorgegebenen Schema.\n"
        . "Regeln:\n"
        . "Der Text ist frei gesprochen - ganze Sätze, Stichworte oder beides, meist ohne Feldnamen („das ist die Tür zum Lager, da kommt ein Halbzylinder rein, außen fünfunddreißig, innen zehn, Beschlag mit Drücker innen und außen, der Wandleser sitzt rechts außen“). Erkenne die Angaben aus dem Zusammenhang.\n"
        . "1. Trage nur ein, was gesagt wurde. Nichts erfinden, nichts aus anderen Angaben ableiten, keine Vorgaben annehmen.\n"
        . "2. Auswahlfelder: genau einer der erlaubten Werte, wörtlich wie in der Liste. Passt keiner eindeutig, bleibt das Feld null und die Angabe steht in „offen“. Bei Mehrfachfeldern alle zutreffenden Werte, sonst eine leere Liste.\n"
        . "3. Zahlen als Ziffern, auch wenn sie als Wörter gesprochen wurden („fünfunddreißig“ = 35, „siebenundzwanzig Komma fünf“ = 27.5). Maße in Millimetern ohne Einheit; Zentimeter umrechnen (9 cm = 90), Meter ebenso (2,10 m = 2100). Zwei Längen beim Zylinder („fünfunddreißig vierzig“, „35 auf 40“, „35/40“) bedeuten außen 35 und innen 40, sofern nichts anderes gesagt wurde. Ein Halbzylinder hat innen 10.\n"
        . "4. „DIN links“ und „DIN rechts“ sind die DIN-Richtung - ebenso „Anschlag links/rechts“ oder „links/rechts angeschlagen“.\n"
        . "5. Wird ein Bauteil genannt (Zylinder, Beschlag, Schloss, Wandleser), gilt es als vorhanden: das zugehörige Ja/Nein-Feld wird true. Was ausdrücklich verneint wird („kein Beschlag“), wird false.\n"
        . "6. Die Beschreibungen der Felder nennen Synonyme - nutze sie.\n"
        . "7. Alles, was zu keinem Feld passt oder zweifelhaft ist, kommt kurz und wörtlich in die Liste „offen“. Nichts geht verloren.\n"
        . "8. Bemerkungen des Monteurs („Tür klemmt“) gehören in das Feld für die Bemerkung, falls es eines gibt, sonst in „offen“.";

    /* ---------------------------------------------------------------- */
    /* Einrichtung                                                       */
    /* ---------------------------------------------------------------- */
    public static function schluessel_setzen($klartext) {
        $klartext = trim((string) $klartext);
        if ($klartext === '') { delete_option('aufmass_openai_schluessel'); return true; }
        $chiffre = Aufmass_Verschluesselung::verschluesseln($klartext);
        if ($chiffre === null) { return false; }
        update_option('aufmass_openai_schluessel', $chiffre, false);
        return true;
    }

    /** Der Klartext - nur für die Anfragen selbst. Niemals ausgeben. */
    public static function schluessel_lesen() {
        $chiffre = (string) get_option('aufmass_openai_schluessel', '');
        if ($chiffre === '') { return null; }
        $klar = Aufmass_Verschluesselung::entschluesseln($chiffre);
        return ($klar === null || trim($klar) === '') ? null : trim($klar);
    }

    public static function schluessel_unlesbar() {
        return (string) get_option('aufmass_openai_schluessel', '') !== '' && self::schluessel_lesen() === null;
    }

    public static function eingerichtet() {
        return self::schluessel_lesen() !== null;
    }

    /** Die Adresse der OpenAI-Schnittstelle: api.openai.com, oder
     *  eu.api.openai.com für die Verarbeitung in der EU. Immer https -
     *  außer auf dem eigenen Rechner (Prüfläufe). */
    public static function host() {
        $roh = trim((string) get_option('aufmass_openai_host', ''));
        if ($roh === '') { return 'https://' . self::STANDARD_HOST; }
        $schema = 'https';
        if (preg_match('#^(https?)://#i', $roh, $t)) {
            $schema = strtolower($t[1]);
            $roh = preg_replace('#^https?://#i', '', $roh);
        }
        $roh = preg_replace('#/.*$#', '', $roh);
        $roh = preg_replace('/[^A-Za-z0-9.\-:]/', '', $roh);
        if ($roh === '') { return 'https://' . self::STANDARD_HOST; }
        $lokal = preg_match('/^(127\.0\.0\.1|localhost)(:[0-9]+)?$/', $roh) === 1;
        if ($schema === 'http' && !$lokal) { $schema = 'https'; }
        return $schema . '://' . $roh;
    }

    public static function host_anzeige() {
        return preg_replace('#^https?://#', '', self::host());
    }

    /** Das Modell für 'erkennung' oder 'zuordnung' - aus den Einstellungen,
     *  sonst die Vorgabe. Ein Modellname ist nie mehr als ein Name. */
    public static function modell($art) {
        $vorgabe = $art === 'erkennung' ? self::MODELL_ERKENNUNG : self::MODELL_ZUORDNUNG;
        $eigen = trim((string) get_option('aufmass_diktat_modell_' . $art, ''));
        return preg_match('/^[a-z0-9][a-z0-9.:_\-]{1,60}$/i', $eigen) ? $eigen : $vorgabe;
    }

    /* ---------------------------------------------------------------- */
    /* Eingaben prüfen                                                   */
    /* ---------------------------------------------------------------- */

    /**
     * Das Feldschema des Werkzeugs in geprüfter Form: Liste von
     * [name, typ, frage, hinweis, werte]. Ein Schema, das nicht passt,
     * wird als Ganzes abgewiesen - stillschweigend Weglassen wäre
     * schwerer zu bemerken.
     * @return array|WP_Error
     */
    public static function schema_pruefen($roh) {
        if (is_string($roh)) {
            if (strlen($roh) > 65536) { return self::fehler('schema', 'Das Feldschema ist zu umfangreich.', 400); }
            $decodiert = json_decode($roh, true, 6);
            /* Kommt das Schema mit Schrägstrichen vor den Anführungszeichen
               an (magic quotes eines Hosters), ein zweiter Versuch. */
            if (!is_array($decodiert) && strpos($roh, '\\"') !== false) { $decodiert = json_decode(stripslashes($roh), true, 6); }
            $roh = $decodiert;
        }
        if (!is_array($roh) || !count($roh)) { return self::fehler('schema', 'Es fehlt das Feldschema des Werkzeugs.', 400); }
        if (count($roh) > self::FELDER_MAX) { return self::fehler('schema', 'Das Feldschema hat zu viele Felder.', 400); }
        $aus = array(); $namen = array();
        foreach ($roh as $f) {
            if (!is_array($f) || !isset($f['name'], $f['typ']) || !is_scalar($f['name']) || !is_scalar($f['typ'])) {
                return self::fehler('schema', 'Ein Feld im Schema ist unvollständig.', 400);
            }
            $name = (string) $f['name'];
            if (!preg_match('/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/', $name) || isset($namen[$name]) || $name === 'offen') {
                return self::fehler('schema', 'Der Feldname „' . self::text_bereinigen($name, 40) . '“ ist nicht zulässig.', 400);
            }
            $typ = (string) $f['typ'];
            if (!in_array($typ, self::TYPEN, true)) { return self::fehler('schema', 'Unbekannte Feldart „' . self::text_bereinigen($typ, 20) . '“.', 400); }
            $werte = array();
            if ($typ === 'wahl' || $typ === 'mehrfach') {
                if (!isset($f['werte']) || !is_array($f['werte'])) { return self::fehler('schema', 'Dem Auswahlfeld „' . $name . '“ fehlen die Werte.', 400); }
                foreach ($f['werte'] as $w) {
                    if (!is_string($w) && !is_numeric($w)) { continue; }
                    $w = self::text_bereinigen((string) $w, 80);
                    if ($w !== '' && !in_array($w, $werte, true)) { $werte[] = $w; }
                }
                if (!count($werte)) { return self::fehler('schema', 'Dem Auswahlfeld „' . $name . '“ fehlen die Werte.', 400); }
                if (count($werte) > self::WERTE_MAX) { return self::fehler('schema', 'Das Auswahlfeld „' . $name . '“ hat zu viele Werte.', 400); }
            }
            $frage = (isset($f['frage']) && is_scalar($f['frage'])) ? self::text_bereinigen((string) $f['frage'], 120) : '';
            $aus[] = array(
                'name' => $name, 'typ' => $typ,
                'frage' => $frage !== '' ? $frage : $name,
                'hinweis' => (isset($f['hinweis']) && is_scalar($f['hinweis'])) ? self::text_bereinigen((string) $f['hinweis'], 240) : '',
                'werte' => $werte
            );
            $namen[$name] = true;
        }
        return $aus;
    }

    /** Eigene Fachwörter des Werkzeugs (eigene Systeme, Zylinderarten …)
     *  für die Erkennung: nur Wörter, nichts, was wie eine Anweisung wirkt. */
    public static function woerter_pruefen($roh) {
        if (is_string($roh)) { $roh = json_decode($roh, true, 3); }
        if (!is_array($roh)) { return array(); }
        $aus = array();
        foreach ($roh as $w) {
            if (!is_string($w) || strlen($w) > 160) { continue; }
            $w = self::text_bereinigen($w, 160);
            if ($w === '' || (function_exists('mb_strlen') ? mb_strlen($w, 'UTF-8') : strlen($w)) > 40 || !preg_match('/^[\p{L}\p{N} .,\-\/()&+]{2,40}$/u', $w)) { continue; }
            if (!in_array($w, $aus, true)) { $aus[] = $w; }
            if (count($aus) >= self::WOERTER_MAX) { break; }
        }
        return $aus;
    }

    /* ---------------------------------------------------------------- */
    /* Verarbeiten                                                       */
    /* ---------------------------------------------------------------- */

    /**
     * Ein Diktat verarbeiten.
     * $eingabe: ton (Datei-Eintrag wie in $_FILES: tmp_name, type, size,
     *           error) ODER tonBytes + tonMime ODER text (schon erkannter
     *           Text, etwa nach einer Korrektur im Werkzeug); felder (das
     *           Schema, als JSON-Text oder Liste); woerter (optional).
     * @return array|WP_Error  ['text' => …, 'felder' => [...], 'offen' => [...]]
     */
    public static function verarbeiten($eingabe, $benutzer) {
        if (!self::eingerichtet()) {
            return self::fehler('nicht_eingerichtet',
                'Das Einsprechen ist auf dem Server nicht eingerichtet.' .
                (self::schluessel_unlesbar() ? ' Der hinterlegte OpenAI-Schlüssel ist nicht mehr lesbar - bitte neu eintragen.' : ''), 503);
        }
        $felder = self::schema_pruefen(isset($eingabe['felder']) ? $eingabe['felder'] : null);
        if (is_wp_error($felder)) { return $felder; }
        $woerter = self::woerter_pruefen(isset($eingabe['woerter']) ? $eingabe['woerter'] : null);

        /* Erst die Eingabe prüfen - eine unbrauchbare Anfrage soll kein
           Diktat vom Kontingent abziehen. */
        $text = '';
        $bytes = null; $mime = '';
        if (isset($eingabe['ton']) && is_array($eingabe['ton'])) {
            $t = $eingabe['ton'];
            $hochladefehler = isset($t['error']) ? (int) $t['error'] : 0;
            if ($hochladefehler === 1 || $hochladefehler === 2) {
                return self::fehler('zu_gross', 'Die Aufnahme ist für diesen Server zu groß (höchstens 10 MB). Bitte kürzer sprechen.', 413);
            }
            if ($hochladefehler !== 0) { return self::fehler('keine_aufnahme', 'Die Aufnahme kam nicht vollständig an. Bitte erneut senden.', 400); }
            if (isset($t['size']) && (int) $t['size'] > self::TON_MAX) { return self::fehler('zu_gross', 'Die Aufnahme ist zu groß (höchstens 10 MB).', 413); }
            $bytes = (isset($t['tmp_name']) && is_string($t['tmp_name']) && $t['tmp_name'] !== '' && is_file($t['tmp_name']))
                ? (string) file_get_contents($t['tmp_name']) : '';
            $mime = isset($t['type']) ? (string) $t['type'] : '';
        } elseif (isset($eingabe['tonBytes'])) {
            $bytes = (string) $eingabe['tonBytes'];
            $mime = isset($eingabe['tonMime']) ? (string) $eingabe['tonMime'] : '';
        }
        if ($bytes !== null) {
            $form = self::ton_pruefen($bytes, $mime);
            if (is_wp_error($form)) { return $form; }
        } else {
            $text = isset($eingabe['text']) ? self::text_bereinigen((string) $eingabe['text'], self::TEXT_MAX) : '';
            if ($text === '') { return self::fehler('keine_aufnahme', 'Es kam weder eine Aufnahme noch ein Text an.', 400); }
        }

        /* Drossel je Person: schützt das Guthaben, nicht nur den Server.
           Die Minute zuerst - sonst zählte ein gedrosselter Versuch
           trotzdem für den Tag. */
        $wer = is_array($benutzer) && !empty($benutzer['id']) ? (string) $benutzer['id'] : 'unbekannt';
        if (!Aufmass_Drossel::zaehlen_fuer('diktat-minute-' . $wer, self::JE_MINUTE, 60)) {
            return self::fehler('zu_viele', 'Zu viele Diktate in kurzer Zeit. Bitte eine Minute warten.', 429);
        }
        if (!Aufmass_Drossel::zaehlen_fuer('diktat-tag-' . $wer, self::JE_TAG, 86400)) {
            return self::fehler('kontingent', 'Das Tageskontingent für Diktate ist erreicht. Morgen geht es weiter.', 429);
        }

        if ($bytes !== null) {
            $erkannt = self::erkennen($bytes, $mime, $woerter);
            if (is_wp_error($erkannt)) { return $erkannt; }
            $text = $erkannt;
        }
        if ($text === '') {
            return self::fehler('nichts_verstanden', 'In der Aufnahme war nichts zu verstehen. Bitte näher am Gerät und deutlich sprechen.', 422);
        }
        $zu = self::zuordnen($text, $felder);
        if (is_wp_error($zu)) { return $zu; }
        return array('text' => $text, 'felder' => $zu['felder'], 'offen' => $zu['offen']);
    }

    /** Länge und Format einer Aufnahme prüfen. @return string|WP_Error die Dateiendung */
    public static function ton_pruefen($bytes, $mime) {
        $laenge = strlen((string) $bytes);
        if ($laenge === 0) { return self::fehler('keine_aufnahme', 'Die Aufnahme ist leer. Bitte prüfen, ob das Mikrofon funktioniert.', 400); }
        if ($laenge > self::TON_MAX) { return self::fehler('zu_gross', 'Die Aufnahme ist zu groß (höchstens 10 MB).', 413); }
        $rein = self::mime_rein($mime);
        if (!isset(self::FORMATE[$rein])) {
            return self::fehler('format', 'Dieses Tonformat wird nicht unterstützt: ' . self::text_bereinigen($mime === '' ? 'unbekannt' : $mime, 40), 415);
        }
        return self::FORMATE[$rein];
    }

    /** Ton -> Text. @return string|WP_Error */
    public static function erkennen($bytes, $mime, $woerter) {
        $endung = self::ton_pruefen($bytes, $mime);
        if (is_wp_error($endung)) { return $endung; }
        $rein = self::mime_rein($mime);
        $vorgabe = self::VOKABULAR . (count($woerter) ? ' Außerdem: ' . implode(', ', $woerter) . '.' : '');
        $vorgabe = function_exists('mb_substr') ? mb_substr($vorgabe, 0, 1200, 'UTF-8') : substr($vorgabe, 0, 1200);
        $grenze = '----AufmassDiktat' . bin2hex(random_bytes(12));
        $koerper = self::multipart(array(
            'model' => self::modell('erkennung'),
            'language' => 'de',
            'response_format' => 'json',
            'prompt' => $vorgabe
        ), array('name' => 'aufnahme.' . $endung, 'mime' => $rein, 'bytes' => $bytes), $grenze);
        $daten = self::senden('/v1/audio/transcriptions', array('Content-Type' => 'multipart/form-data; boundary=' . $grenze),
            $koerper, self::ZEIT_ERKENNUNG, 'erkennung');
        if (is_wp_error($daten)) { return $daten; }
        if (!isset($daten['text']) || !is_string($daten['text'])) {
            return self::fehler('unbrauchbar', 'OpenAI hat keinen Text zurückgegeben.', 502);
        }
        return self::text_bereinigen($daten['text'], self::TEXT_MAX);
    }

    /** Text -> Felder. @return array|WP_Error ['felder' => …, 'offen' => …] */
    public static function zuordnen($text, $felder) {
        $modell = self::modell('zuordnung');
        $koerper = array(
            'model' => $modell,
            'messages' => array(
                array('role' => 'system', 'content' => self::ANWEISUNG),
                array('role' => 'user', 'content' => "Gesprochener Text:\n" . $text)
            ),
            'response_format' => array('type' => 'json_schema', 'json_schema' => array(
                'name' => 'tuer_aufmass', 'strict' => true, 'schema' => self::schema_bauen($felder)))
        );
        /* Neuere Modellreihen nehmen keine Temperatur an; die 4er-Reihe
           soll bei 0 so vorhersagbar wie möglich zuordnen. */
        if (preg_match('/^gpt-4/i', $modell)) { $koerper['temperature'] = 0; }
        $daten = self::senden('/v1/chat/completions', array('Content-Type' => 'application/json'),
            wp_json_encode($koerper), self::ZEIT_ZUORDNUNG, 'zuordnung');
        if (is_wp_error($daten)) { return $daten; }
        $nachricht = isset($daten['choices'][0]['message']) && is_array($daten['choices'][0]['message']) ? $daten['choices'][0]['message'] : null;
        if (!$nachricht) { return self::fehler('unbrauchbar', 'OpenAI hat keine Zuordnung zurückgegeben.', 502); }
        if (!empty($nachricht['refusal'])) {
            return self::fehler('abgelehnt', 'Das Modell hat die Zuordnung abgelehnt: ' . self::text_bereinigen((string) $nachricht['refusal'], 160), 422);
        }
        $inhalt = isset($nachricht['content']) ? $nachricht['content'] : '';
        if (is_array($inhalt)) {
            $teile = array();
            foreach ($inhalt as $teil) { if (is_array($teil) && isset($teil['text'])) { $teile[] = (string) $teil['text']; } }
            $inhalt = implode('', $teile);
        }
        $roh = json_decode((string) $inhalt, true, 8);
        if (!is_array($roh)) { return self::fehler('unbrauchbar', 'Die Zuordnung von OpenAI war nicht lesbar.', 502); }
        return self::ergebnis_bereinigen($roh, $felder);
    }

    /** Das JSON-Schema für die Zuordnung - strict: jedes Feld Pflicht,
     *  nichts Zusätzliches, Auswahlwerte als Aufzählung. */
    public static function schema_bauen($felder) {
        $eig = array(); $pflicht = array();
        foreach ($felder as $f) {
            switch ($f['typ']) {
                case 'wahl':
                    $def = array('anyOf' => array(array('type' => 'string', 'enum' => $f['werte']), array('type' => 'null')));
                    break;
                case 'mehrfach':
                    $def = array('type' => 'array', 'items' => array('type' => 'string', 'enum' => $f['werte']));
                    break;
                case 'zahl':
                    $def = array('anyOf' => array(array('type' => 'number'), array('type' => 'null')));
                    break;
                case 'ja_nein':
                    $def = array('anyOf' => array(array('type' => 'boolean'), array('type' => 'null')));
                    break;
                default:
                    $def = array('anyOf' => array(array('type' => 'string'), array('type' => 'null')));
            }
            $def['description'] = $f['frage'] . ($f['hinweis'] !== '' ? ' - ' . $f['hinweis'] : '');
            $eig[$f['name']] = $def;
            $pflicht[] = $f['name'];
        }
        $eig['offen'] = array('type' => 'array', 'items' => array('type' => 'string'),
            'description' => 'Angaben aus dem Text, die zu keinem Feld passen oder unklar sind - kurz und wörtlich. Leer, wenn alles zugeordnet wurde.');
        $pflicht[] = 'offen';
        return array('type' => 'object', 'properties' => $eig, 'required' => $pflicht, 'additionalProperties' => false);
    }

    /** Die Antwort des Modells gegen das Schema prüfen: nur bekannte Felder,
     *  nur erlaubte Werte, passende Typen. Alles andere fällt weg. */
    public static function ergebnis_bereinigen($roh, $felder) {
        $aus = array();
        foreach ($felder as $f) {
            $name = $f['name'];
            if (!array_key_exists($name, $roh) || $roh[$name] === null) { continue; }
            $w = $roh[$name];
            switch ($f['typ']) {
                case 'text':
                    if (is_string($w) || is_numeric($w)) {
                        $t = self::text_bereinigen((string) $w, 500);
                        if ($t !== '') { $aus[$name] = $t; }
                    }
                    break;
                case 'zahl':
                    if ((is_int($w) || is_float($w) || (is_string($w) && is_numeric(trim($w)))) && is_finite((float) $w)) {
                        $z = is_string($w) ? trim($w) + 0 : $w;
                        if (abs($z) <= 1000000000) { $aus[$name] = $z; }
                    }
                    break;
                case 'ja_nein':
                    if (is_bool($w)) { $aus[$name] = $w; }
                    break;
                case 'wahl':
                    $t = self::wert_finden($w, $f['werte']);
                    if ($t !== null) { $aus[$name] = $t; }
                    break;
                case 'mehrfach':
                    if (is_array($w)) {
                        $liste = array();
                        foreach ($w as $e) {
                            $t = self::wert_finden($e, $f['werte']);
                            if ($t !== null && !in_array($t, $liste, true)) { $liste[] = $t; }
                        }
                        if (count($liste)) { $aus[$name] = $liste; }
                    }
                    break;
            }
        }
        $offen = array();
        if (isset($roh['offen']) && is_array($roh['offen'])) {
            foreach ($roh['offen'] as $o) {
                if (!is_string($o)) { continue; }
                $t = self::text_bereinigen($o, 200);
                if ($t !== '' && !in_array($t, $offen, true)) { $offen[] = $t; }
                if (count($offen) >= 30) { break; }
            }
        }
        return array('felder' => $aus, 'offen' => $offen);
    }

    /** Prüft Schlüssel und Adresse ohne Kosten: holt die Modellliste und
     *  sieht nach, ob die eingestellten Modelle darin vorkommen.
     *  @return array|WP_Error ['modelle' => n, 'erkennung' => bool, 'zuordnung' => bool] */
    public static function verbindung_pruefen() {
        $schluessel = self::schluessel_lesen();
        if ($schluessel === null) { return self::fehler('nicht_eingerichtet', 'Es ist kein OpenAI-Schlüssel hinterlegt.', 503); }
        $antwort = wp_remote_get(self::host() . '/v1/models', array(
            'timeout' => 20, 'redirection' => 0,
            'headers' => array('Authorization' => 'Bearer ' . $schluessel, 'Accept' => 'application/json'),
            'user-agent' => 'Aufmass-Werkzeug/' . AUFMASS_VERSION
        ));
        if (is_wp_error($antwort)) {
            return self::fehler('nicht_erreichbar', 'OpenAI war vom Server aus nicht erreichbar: ' . self::text_bereinigen($antwort->get_error_message(), 160), 502);
        }
        $status = (int) wp_remote_retrieve_response_code($antwort);
        $daten = json_decode((string) wp_remote_retrieve_body($antwort), true);
        if ($status !== 200) { return self::openai_fehler($status, $daten, 'pruefung', $schluessel); }
        $ids = array();
        foreach ((isset($daten['data']) && is_array($daten['data'])) ? $daten['data'] : array() as $m) {
            if (is_array($m) && isset($m['id'])) { $ids[] = (string) $m['id']; }
        }
        return array('modelle' => count($ids),
            'erkennung' => in_array(self::modell('erkennung'), $ids, true),
            'zuordnung' => in_array(self::modell('zuordnung'), $ids, true));
    }

    /* ---------------------------------------------------------------- */
    /* Intern                                                            */
    /* ---------------------------------------------------------------- */

    /** Eine Anfrage an OpenAI. @return array|WP_Error die JSON-Antwort */
    private static function senden($weg, $zusatzKopf, $koerper, $zeit, $was) {
        $schluessel = self::schluessel_lesen();
        if ($schluessel === null) { return self::fehler('nicht_eingerichtet', 'Das Einsprechen ist auf dem Server nicht eingerichtet.', 503); }
        $antwort = wp_remote_post(self::host() . $weg, array(
            'timeout' => $zeit, 'redirection' => 0,
            'headers' => array_merge(array('Authorization' => 'Bearer ' . $schluessel, 'Accept' => 'application/json'), $zusatzKopf),
            'body' => $koerper,
            'user-agent' => 'Aufmass-Werkzeug/' . AUFMASS_VERSION
        ));
        if (is_wp_error($antwort)) {
            $m = str_replace($schluessel, '[entfernt]', (string) $antwort->get_error_message());
            return self::fehler('nicht_erreichbar', 'OpenAI war vom Server aus nicht erreichbar: ' . self::text_bereinigen($m, 160), 502);
        }
        $status = (int) wp_remote_retrieve_response_code($antwort);
        $roh = (string) wp_remote_retrieve_body($antwort);
        $daten = json_decode($roh, true);
        if ($status < 200 || $status >= 300) { return self::openai_fehler($status, $daten, $was, $schluessel); }
        return is_array($daten) ? $daten : array();
    }

    /** Was OpenAI sagt, in eine verständliche Meldung - ohne den Schlüssel. */
    private static function openai_fehler($status, $daten, $was, $schluessel) {
        $meldung = (is_array($daten) && isset($daten['error']['message']) && is_string($daten['error']['message']))
            ? self::text_bereinigen($daten['error']['message'], 160) : '';
        if ($schluessel !== null && $schluessel !== '' && $meldung !== '') { $meldung = str_replace($schluessel, '[entfernt]', $meldung); }
        $zusatz = $meldung !== '' ? ' (' . $meldung . ')' : '';
        if ($status === 401 || $status === 403) {
            return self::fehler('openai_schluessel', 'OpenAI nimmt den hinterlegten Schlüssel nicht an. Bitte in WordPress unter Einstellungen → Aufmaß-Abgleich prüfen.' . $zusatz, 502);
        }
        if ($status === 429) {
            return self::fehler('openai_ueberlastet', 'OpenAI nimmt gerade keine Anfragen an - Kontingent oder Guthaben erschöpft, oder zu viele Anfragen. Bitte später erneut versuchen.' . $zusatz, 503);
        }
        if ($status === 413) {
            return self::fehler('zu_gross', 'Die Aufnahme ist für OpenAI zu groß. Bitte kürzer sprechen.', 413);
        }
        if ($status === 400 && $was === 'erkennung') {
            return self::fehler('unbrauchbar', 'OpenAI konnte die Aufnahme nicht verarbeiten.' . $zusatz, 422);
        }
        if ($status === 404 && $was !== 'pruefung') {
            return self::fehler('openai_modell', 'OpenAI kennt das eingestellte Modell nicht. Bitte die Modellnamen in WordPress prüfen.' . $zusatz, 502);
        }
        return self::fehler('openai_fehler', 'OpenAI meldete einen Fehler (' . $status . ').' . $zusatz, 502);
    }

    private static function multipart($teile, $datei, $grenze) {
        $b = '';
        foreach ($teile as $name => $wert) {
            $b .= '--' . $grenze . "\r\n" . 'Content-Disposition: form-data; name="' . $name . '"' . "\r\n\r\n" . $wert . "\r\n";
        }
        $b .= '--' . $grenze . "\r\n" . 'Content-Disposition: form-data; name="file"; filename="' . $datei['name'] . '"' . "\r\n"
            . 'Content-Type: ' . $datei['mime'] . "\r\n\r\n" . $datei['bytes'] . "\r\n--" . $grenze . "--\r\n";
        return $b;
    }

    private static function mime_rein($mime) {
        $m = strtolower(trim((string) $mime));
        $m = preg_replace('/;.*$/', '', $m);
        return trim($m);
    }

    /** Ohne Steuerzeichen, einzeiliger Leerraum, gekürzt. */
    private static function text_bereinigen($t, $max) {
        $t = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string) $t);
        if ($t === null) { $t = ''; }
        $t = preg_replace('/[ \t]+/', ' ', $t);
        $t = trim($t);
        if (function_exists('mb_substr')) { return mb_substr($t, 0, $max, 'UTF-8'); }
        return substr($t, 0, $max);
    }

    /** Den erlaubten Wert zu einer Antwort des Modells: wörtlich, sonst
     *  ohne Rücksicht auf Groß- und Kleinschreibung und Leerraum. */
    private static function wert_finden($w, $werte) {
        if (!is_string($w) && !is_numeric($w)) { return null; }
        $w = trim((string) $w);
        if ($w === '') { return null; }
        if (in_array($w, $werte, true)) { return $w; }
        $norm = function ($s) { return function_exists('mb_strtolower') ? mb_strtolower(preg_replace('/\s+/', ' ', trim($s)), 'UTF-8') : strtolower(trim($s)); };
        $ziel = $norm($w);
        foreach ($werte as $erlaubt) { if ($norm($erlaubt) === $ziel) { return $erlaubt; } }
        return null;
    }

    private static function fehler($code, $text, $status) {
        return new WP_Error($code, $text, array('status' => $status));
    }
}
