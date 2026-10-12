<?php
/**
 * freigaben.php — Kundenfreigabe über einen kurzen Link.
 *
 * Bisher stand der gesamte Plan im Anker eines sehr langen Links. Jetzt
 * liegt die Freigabe hier auf dem Server, und der Kunde bekommt nur noch
 * einen kurzen Code. Er öffnet den Link, trägt ein, klickt auf
 * „Übertragen“ - und seine Rückmeldung wartet im Werkzeug, bis eine
 * zuständige Person sie geprüft und übernommen hat. Erst dann ändert
 * sich etwas am Aufmaß.
 *
 * Der Code ist das einzige Geheimnis des Links. Darum:
 *  - zehn Zeichen aus 31 (rund 50 Bit), aus dem Zufallsgenerator des
 *    Systems, ohne verwechselbare Zeichen
 *  - Aufrufe mit unbekanntem Code werden je Herkunftsadresse gedrosselt
 *  - ein Link läuft ab und lässt sich jederzeit zurückziehen
 *  - der Server prüft jede Antwort gegen die Freigabe: Angenommen werden
 *    nur Felder, die freigegeben waren - alles andere wird abgewiesen,
 *    auch wenn jemand die Seite umgebaut hat
 *  - die Antwort wird vor dem Ablegen bereinigt und auf das Nötige
 *    gekürzt; was die Geräte später bekommen, ist diese geprüfte Fassung
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Freigaben {

    /** Zeichenvorrat ohne verwechselbare Zeichen (kein 0/o, 1/l/i). */
    const ZEICHEN = 'abcdefghjkmnpqrstuvwxyz23456789';
    const LAENGE = 10;
    const FORMAT = 1;

    const DATEN_MAX = 2097152;        /* 2 MiB: der Plan ohne Fotos */
    const ANTWORT_MAX = 262144;       /* 256 KiB: nur die Abweichungen */
    const TEXT_MAX = 500;
    const NAME_MAX = 120;
    const ANMERKUNG_MAX = 2000;
    const PERSONEN_MAX = 200;
    const TUEREN_MAX = 5000;
    const SCHLIESSUNGEN_MAX = 500;

    /** Obergrenze für den rohen Anfragekörper beim Übertragen (vor dem Entziffern). */
    const KOERPER_MAX = 393216;       /* 384 KiB */

    /* Drosselung je Herkunftsadresse, jeweils innerhalb von zehn Minuten */
    const DROSSEL_FENSTER = 600;
    const DROSSEL_UNBEKANNT = 30;     /* Aufrufe mit unbekanntem Code */
    const DROSSEL_LESEN = 120;        /* Aufrufe mit gültigem Code */
    const DROSSEL_SENDEN = 12;        /* angenommene Übertragungen */
    const DROSSEL_ABGEWIESEN = 30;    /* abgewiesene Übertragungen */
    /* Je Freigabe-Link, innerhalb eines Tages - gegen Mailfluten über
       wechselnde Herkunftsadressen. */
    const DROSSEL_JE_CODE = 40;
    const DROSSEL_JE_CODE_FENSTER = 86400;

    /** Vorgabe: so viele Tage gilt ein Link (0 = unbegrenzt). */
    const TAGE_VORGABE = 30;
    /** Erledigte und abgelaufene Freigaben nach so vielen Tagen löschen. */
    const AUFBEWAHRUNG_TAGE = 180;

    private static function tabelle() { return Aufmass_Datenbank::tabelle('freigaben'); }

    /* ---------------------------------------------------------------- */
    /* Einstellungen                                                     */
    /* ---------------------------------------------------------------- */
    public static function tage() {
        $t = get_option('aufmass_freigabe_tage', self::TAGE_VORGABE);
        if ($t === '' || $t === false || $t === null) { return self::TAGE_VORGABE; }
        $t = (int) $t;
        if ($t < 0) { $t = 0; }
        return $t > 3650 ? 3650 : $t;
    }

    public static function mail_gewuenscht() {
        $w = get_option('aufmass_freigabe_mail', '1');
        return $w === '1' || $w === 1 || $w === true;
    }

    /** Der kurze Link, wie der Kunde ihn bekommt. */
    public static function kurzlink($code) {
        $struktur = (string) get_option('permalink_structure', '');
        if ($struktur !== '') { return home_url('/f/' . $code); }
        /* Ohne sprechende Permalinks kennt WordPress den Weg /f/ nicht;
           die Abfragevariable funktioniert immer. */
        return home_url('/?aufmass_f=' . $code);
    }

    /* ---------------------------------------------------------------- */
    /* Code                                                              */
    /* ---------------------------------------------------------------- */
    public static function code_erzeugen() {
        $z = self::ZEICHEN;
        $n = strlen($z);
        $aus = '';
        for ($i = 0; $i < self::LAENGE; $i++) { $aus .= $z[random_int(0, $n - 1)]; }
        return $aus;
    }

    public static function code_bereinigen($code) {
        $code = strtolower(trim((string) $code));
        return preg_match('/^[a-z0-9]{6,16}$/', $code) ? $code : '';
    }

    /* ---------------------------------------------------------------- */
    /* Anlegen                                                           */
    /* ---------------------------------------------------------------- */
    public static function anlegen($projekt_id, $daten, $seite, $benutzer) {
        global $wpdb;
        $projekt_id = (string) $projekt_id;
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $projekt_id)) {
            return new WP_Error('projekt_fehlt', 'Zu welchem Aufmaß gehört die Freigabe?', array('status' => 400));
        }
        /* Freigeben darf, wer das Aufmaß auch ändern darf. Die Prüfung
           meldet 404, wenn das Aufmaß noch nicht auf dem Server liegt. */
        $darf = Aufmass_Projekte::darf_aendern($projekt_id, $benutzer);
        if (is_wp_error($darf)) { return $darf; }
        if (self::projekt_weg($projekt_id)) {
            return new WP_Error('geloescht', 'Dieses Aufmaß ist gelöscht.', array('status' => 410));
        }
        $sauber = self::daten_pruefen($daten, $projekt_id);
        if (is_wp_error($sauber)) { return $sauber; }
        $seite = self::seite_pruefen($seite);

        $tab = self::tabelle();
        $code = '';
        for ($i = 0; $i < 10; $i++) {
            $kandidat = self::code_erzeugen();
            $da = $wpdb->get_var($wpdb->prepare("SELECT code FROM $tab WHERE code = %s", $kandidat));
            if (!$da) { $code = $kandidat; break; }
        }
        if ($code === '') {
            return new WP_Error('kein_code', 'Es ließ sich kein freier Code erzeugen. Bitte erneut versuchen.', array('status' => 500));
        }
        $jetzt = Aufmass_Datenbank::jetzt();
        $tage = self::tage();
        $bis = $tage > 0 ? gmdate('Y-m-d H:i:s', time() + $tage * 86400) . '.000000' : null;
        $ok = $wpdb->insert($tab, array(
            'code' => $code,
            'projekt_id' => $projekt_id,
            'seite' => $seite,
            'daten' => wp_json_encode($sauber),
            'status' => 'offen',
            'erstellt_am' => $jetzt,
            'erstellt_von' => $benutzer['id'],
            'gueltig_bis' => $bis,
            'antwort' => null,
            'antwort_nr' => 0,
            'antwort_name' => '',
            'antwort_anmerkung' => '',
            'antwort_anzahl' => 0,
            'antwort_listen' => 0,
            'uebernommen_nr' => 0,
            'uebernommen_von' => '',
            'geaendert_am' => $jetzt
        ));
        if ($ok === false) {
            return new WP_Error('datenbank', 'Die Freigabe ließ sich nicht ablegen.', array('status' => 500));
        }
        /* Gemerkt für den Fall, dass ein Code aufgerufen wird, den es nicht
           (mehr) gibt: Dann führt der Kurzlink trotzdem zur Seite, und die
           erklärt es. */
        update_option('aufmass_freigabe_seite', $seite, false);
        return self::beschreiben(self::zeile($code), false);
    }

    /**
     * Die Freigabedaten kommen vom angemeldeten Werkzeug - und werden
     * trotzdem geprüft und auf die bekannten Felder zurechtgestutzt. Was
     * hier liegt, bekommt später der Kunde zu sehen.
     */
    public static function daten_pruefen($daten, $projekt_id) {
        if (!is_array($daten)) {
            return new WP_Error('daten_fehlen', 'Es wurden keine Freigabedaten übergeben.', array('status' => 400));
        }
        if (!isset($daten['f']) || (int) $daten['f'] !== self::FORMAT) {
            return new WP_Error('format', 'Die Freigabedaten stammen aus einer anderen Fassung des Werkzeugs.', array('status' => 400));
        }
        if (!isset($daten['pid']) || !is_scalar($daten['pid']) || (string) $daten['pid'] !== (string) $projekt_id) {
            return new WP_Error('projekt_falsch', 'Die Freigabedaten gehören zu einem anderen Aufmaß.', array('status' => 400));
        }
        if (empty($daten['t']) || !is_array($daten['t']) || empty($daten['s']) || !is_array($daten['s'])) {
            return new WP_Error('leer', 'Die Freigabe enthält keine Türen oder keine Schließungen.', array('status' => 400));
        }
        if (count($daten['t']) > self::TUEREN_MAX || count($daten['s']) > self::SCHLIESSUNGEN_MAX) {
            return new WP_Error('zu_gross', 'Diese Freigabe ist zu umfangreich.', array('status' => 413));
        }
        $t = array();
        foreach ($daten['t'] as $zeile) {
            if (!is_array($zeile) || !isset($zeile[0]) || self::text($zeile[0], 64) === '') {
                return new WP_Error('tuer_unlesbar', 'Eine Tür in der Freigabe ist nicht lesbar.', array('status' => 400));
            }
            $t[] = array(
                self::text($zeile[0], 64),
                self::text(isset($zeile[1]) ? $zeile[1] : '', 100),
                self::text(isset($zeile[2]) ? $zeile[2] : '', 255),
                self::text(isset($zeile[3]) ? $zeile[3] : '', 255)
            );
        }
        $s = array();
        foreach ($daten['s'] as $zeile) {
            if (!is_array($zeile) || !isset($zeile[0]) || self::text($zeile[0], 64) === '') {
                return new WP_Error('schliessung_unlesbar', 'Eine Schließung in der Freigabe ist nicht lesbar.', array('status' => 400));
            }
            $e = array(
                self::text($zeile[0], 64),
                self::text(isset($zeile[1]) ? $zeile[1] : '', 60),
                self::text(isset($zeile[2]) ? $zeile[2] : '', 255),
                self::text(isset($zeile[3]) ? $zeile[3] : '', self::TEXT_MAX)
            );
            /* Der fünfte Wert kennzeichnet eine freigegebene Schließung:
               Dafür darf der Kunde auch die Inhaber eintragen. */
            if (isset($zeile[4]) && is_array($zeile[4])) {
                $e[] = array(
                    'a' => self::text(isset($zeile[4]['a']) ? $zeile[4]['a'] : '', 20),
                    'g' => self::text(isset($zeile[4]['g']) ? $zeile[4]['g'] : '', self::NAME_MAX),
                    'p' => self::personen_bereinigen(isset($zeile[4]['p']) ? $zeile[4]['p'] : array())
                );
            }
            $s[] = $e;
        }
        $m = (isset($daten['m']) && is_string($daten['m'])) ? $daten['m'] : '';
        $e = (isset($daten['e']) && is_string($daten['e'])) ? $daten['e'] : '';
        $matrix = self::entpacken($m);
        $maske = self::entpacken($e);
        $erwartet = count($t) * count($s);
        if (strlen($matrix) !== $erwartet || strlen($maske) !== $erwartet) {
            return new WP_Error('matrix_unvollstaendig', 'Die Matrix passt nicht zur Zahl der Türen und Schließungen.', array('status' => 400));
        }
        if (!preg_match('/^[0-4]*$/', $matrix) || !preg_match('/^[01]*$/', $maske)) {
            return new WP_Error('matrix_unlesbar', 'Die Matrix ist nicht lesbar.', array('status' => 400));
        }
        $sauber = array(
            'f' => self::FORMAT,
            'pid' => (string) $projekt_id,
            'kunde' => self::text(isset($daten['kunde']) ? $daten['kunde'] : '', self::TEXT_MAX),
            'objekt' => self::text(isset($daten['objekt']) ? $daten['objekt'] : '', self::TEXT_MAX),
            'anlage' => self::text(isset($daten['anlage']) ? $daten['anlage'] : '', 100),
            'hinweis' => self::text(isset($daten['hinweis']) ? $daten['hinweis'] : '', self::TEXT_MAX),
            'frist' => self::text(isset($daten['frist']) ? $daten['frist'] : '', 100),
            'firma' => self::text(isset($daten['firma']) ? $daten['firma'] : '', self::TEXT_MAX),
            't' => $t,
            's' => $s,
            'm' => $m,
            'e' => $e
        );
        $json = wp_json_encode($sauber);
        if ($json === false || strlen($json) > self::DATEN_MAX) {
            return new WP_Error('zu_gross', 'Diese Freigabe ist zu umfangreich für die Übertragung.', array('status' => 413));
        }
        return $sauber;
    }

    /**
     * Die Seite, auf die der Kurzlink führt. Sie muss auf derselben
     * Website liegen wie WordPress - sonst wäre der Kurzlink eine offene
     * Weiterleitung zu beliebigen Adressen.
     */
    public static function seite_pruefen($seite) {
        $vorgabe = home_url('/aufmasstool/freigabe.html');
        $seite = trim((string) $seite);
        if ($seite === '' || strlen($seite) > 500) { return $vorgabe; }
        $s = function_exists('wp_parse_url') ? wp_parse_url($seite) : parse_url($seite);
        $h = function_exists('wp_parse_url') ? wp_parse_url(home_url('/')) : parse_url(home_url('/'));
        if (!is_array($s) || !is_array($h) || empty($s['scheme']) || empty($s['host']) || empty($h['host'])) { return $vorgabe; }
        if (!in_array(strtolower($s['scheme']), array('http', 'https'), true)) { return $vorgabe; }
        if (strtolower($s['host']) !== strtolower($h['host'])) { return $vorgabe; }
        $sp = isset($s['port']) ? (int) $s['port'] : 0;
        $hp = isset($h['port']) ? (int) $h['port'] : 0;
        if ($sp !== $hp) { return $vorgabe; }
        if (!empty($s['query']) || !empty($s['fragment']) || !empty($s['user']) || !empty($s['pass'])) { return $vorgabe; }
        $pfad = isset($s['path']) ? $s['path'] : '';
        if (!preg_match('#^/[A-Za-z0-9_./-]*\.html$#', $pfad) || strpos($pfad, '..') !== false) { return $vorgabe; }
        return strtolower($s['scheme']) . '://' . strtolower($s['host']) . ($sp ? ':' . $sp : '') . $pfad;
    }

    /* ---------------------------------------------------------------- */
    /* Für den Kunden (ohne Anmeldung)                                   */
    /* ---------------------------------------------------------------- */
    public static function oeffentlich($code) {
        $code = self::code_bereinigen($code);
        $z = $code !== '' ? self::zeile($code) : null;
        if (!$z) {
            if (!self::drossel('unbekannt', self::DROSSEL_UNBEKANNT)) { return self::zu_viele(); }
            return new WP_Error('unbekannt',
                'Diesen Freigabe-Link gibt es nicht. Bitte prüfen Sie, ob er vollständig kopiert wurde.',
                array('status' => 404));
        }
        $sperre = self::gesperrt($z);
        if ($sperre) { return $sperre; }
        /* Auch gültige Aufrufe werden gezählt - großzügig, ein Kunde lädt
           die Seite ein paarmal. Wer sie im Sekundentakt abruft, will den
           Server beschäftigen, nicht eintragen. */
        if (!self::drossel('lesen', self::DROSSEL_LESEN)) { return self::zu_viele(); }

        $daten = json_decode($z['daten'], true);
        if (!is_array($daten)) {
            return new WP_Error('unlesbar', 'Die Freigabe ist beschädigt.', array('status' => 500));
        }
        $status = self::status_von($z);
        /* Eine verworfene Antwort bekommt der Kunde nicht zurückgespiegelt -
           für ihn ist die Freigabe dann wieder offen. */
        $antwort = ($status === 'verworfen') ? null : self::antwort_dekodieren($z['antwort']);
        return array(
            'code' => $code,
            'status' => $status === 'verworfen' ? 'offen' : $status,
            'daten' => $daten,
            'antwort' => $antwort,
            'antwortAm' => $antwort ? self::iso($z['antwort_am']) : '',
            'antwortName' => $antwort ? (string) $z['antwort_name'] : '',
            'antwortAnmerkung' => $antwort ? (string) $z['antwort_anmerkung'] : '',
            'gueltigBis' => self::iso($z['gueltig_bis'])
        );
    }

    public static function antwort_annehmen($code, $antwort, $name, $anmerkung) {
        global $wpdb;
        /* Zwei Zähler je Herkunft: angenommene Übertragungen (ein Kunde
           braucht selten mehr als ein paar) und abgewiesene (die echte
           Seite erzeugt keine - viele davon sind ein Angriff). */
        if (self::drossel_voll('senden', self::DROSSEL_SENDEN)
            || self::drossel_voll('abgewiesen', self::DROSSEL_ABGEWIESEN)) { return self::zu_viele(); }
        $code = self::code_bereinigen($code);
        $z = $code !== '' ? self::zeile($code) : null;
        if (!$z) {
            if (!self::drossel('unbekannt', self::DROSSEL_UNBEKANNT)) { return self::zu_viele(); }
            return new WP_Error('unbekannt', 'Diesen Freigabe-Link gibt es nicht.', array('status' => 404));
        }
        $sperre = self::gesperrt($z);
        if ($sperre) { return $sperre; }

        $name = self::einzeilig(self::text($name, self::NAME_MAX));
        if ($name === '') {
            self::drossel('abgewiesen', self::DROSSEL_ABGEWIESEN);
            return new WP_Error('name_fehlt', 'Bitte tragen Sie Ihren Namen ein.', array('status' => 400));
        }
        $anmerkung = self::text($anmerkung, self::ANMERKUNG_MAX);

        $daten = json_decode($z['daten'], true);
        if (!is_array($daten)) {
            return new WP_Error('unlesbar', 'Die Freigabe ist beschädigt.', array('status' => 500));
        }
        $sauber = self::antwort_pruefen($daten, $antwort);
        if (is_wp_error($sauber)) {
            self::drossel('abgewiesen', self::DROSSEL_ABGEWIESEN);
            return $sauber;
        }
        /* Je Link nur so viele Übertragungen am Tag - unabhängig von der
           Herkunft. Mehr braucht kein Kunde; mehr wäre ein Versuch, die
           Zuständigen mit E-Mails zu überschwemmen. */
        if (!self::drossel_je_code($code)) {
            return new WP_Error('zu_viele', 'Für diesen Link wurden heute schon sehr viele Rückmeldungen übertragen. Bitte morgen erneut versuchen.', array('status' => 429));
        }
        self::drossel('senden', self::DROSSEL_SENDEN);

        $jetzt = Aufmass_Datenbank::jetzt();
        $nr = (int) $z['antwort_nr'] + 1;
        $ok = $wpdb->update(self::tabelle(), array(
            'antwort' => wp_json_encode($sauber['antwort']),
            'antwort_nr' => $nr,
            'antwort_am' => $jetzt,
            'antwort_name' => $name,
            'antwort_anmerkung' => $anmerkung,
            'antwort_anzahl' => $sauber['anzahl'],
            'antwort_listen' => $sauber['listen'],
            'status' => 'beantwortet',
            'geaendert_am' => $jetzt
        ), array('code' => $code));
        if ($ok === false) {
            return new WP_Error('datenbank', 'Die Rückmeldung ließ sich nicht ablegen.', array('status' => 500));
        }
        $gesendet = self::benachrichtigen(self::zeile($code));
        return array('ok' => true, 'antwortNr' => $nr, 'am' => self::iso($jetzt),
                     'anzahl' => $sauber['anzahl'], 'listen' => $sauber['listen'],
                     'benachrichtigt' => $gesendet);
    }

    /**
     * Die Antwort des Kunden gegen die Freigabe prüfen und bereinigen.
     *
     * Angenommen wird nur, was der Kunde ändern durfte. Jede Abweichung
     * davon weist die ganze Antwort ab: Die echte Seite erzeugt so etwas
     * nie, also stammt es von jemandem, der sich an der Seite zu schaffen
     * gemacht hat.
     */
    public static function antwort_pruefen($daten, $antwort) {
        $unlesbar = new WP_Error('unlesbar', 'Die Rückmeldung ist nicht lesbar.', array('status' => 400));
        if (!is_array($antwort)) {
            return new WP_Error('antwort_fehlt', 'Es wurde keine Rückmeldung übergeben.', array('status' => 400));
        }
        $json = wp_json_encode($antwort);
        if ($json === false || strlen($json) > self::ANTWORT_MAX) {
            return new WP_Error('zu_gross', 'Die Rückmeldung ist zu umfangreich.', array('status' => 413));
        }
        if (!isset($antwort['typ']) || $antwort['typ'] !== 'antwort'
            || !isset($antwort['f']) || (int) $antwort['f'] !== self::FORMAT) {
            return $unlesbar;
        }
        if (!isset($antwort['pid']) || !is_scalar($antwort['pid']) || (string) $antwort['pid'] !== (string) $daten['pid']) {
            return new WP_Error('projekt_falsch', 'Die Rückmeldung gehört zu einem anderen Aufmaß.', array('status' => 400));
        }
        $tIds = array();
        foreach ($daten['t'] as $t) { $tIds[] = (string) $t[0]; }
        $sIds = array();
        foreach ($daten['s'] as $s) { $sIds[] = (string) $s[0]; }
        if (self::kennungen($antwort, 'tIds') !== $tIds || self::kennungen($antwort, 'sIds') !== $sIds) {
            return new WP_Error('veraltet', 'Die Rückmeldung passt nicht zu dieser Freigabe.', array('status' => 400));
        }
        $spalten = count($sIds);
        $zellen = count($tIds) * $spalten;
        $matrix = self::entpacken($daten['m']);
        $maske = self::entpacken($daten['e']);

        /* --- Berechtigungen: nur freigegebene Felder, nur echte Abweichungen --- */
        $a = isset($antwort['a']) ? $antwort['a'] : '';
        if (!is_string($a)) { return $unlesbar; }
        $aenderungen = array();
        if ($a !== '') {
            foreach (explode(',', $a) as $eintrag) {
                if ($eintrag === '') { continue; }
                if (!preg_match('/^([0-9a-z]{1,7}):([0-4])$/', $eintrag, $tr)) { return $unlesbar; }
                $index = intval($tr[1], 36);
                if ($index >= $zellen) {
                    return new WP_Error('unlesbar', 'Die Rückmeldung verweist auf Felder, die es nicht gibt.', array('status' => 400));
                }
                if ($maske[$index] !== '1') {
                    return new WP_Error('nicht_freigegeben',
                        'Die Rückmeldung enthält Felder, die nicht zur Bearbeitung freigegeben waren.', array('status' => 400));
                }
                if ($matrix[$index] === $tr[2]) { unset($aenderungen[$index]); continue; }
                $aenderungen[$index] = $tr[2];
            }
        }
        ksort($aenderungen);
        $teile = array();
        foreach ($aenderungen as $i => $w) { $teile[] = base_convert((string) $i, 10, 36) . ':' . $w; }

        /* --- Inhaberlisten: nur für freigegebene Schließungen --- */
        $listen = array();
        if (isset($antwort['p']) && $antwort['p'] !== null) {
            if (!is_array($antwort['p']) || count($antwort['p']) > $spalten) { return $unlesbar; }
            foreach ($antwort['p'] as $schluessel => $liste) {
                if (!preg_match('/^[0-9a-z]{1,6}$/', (string) $schluessel)) { return $unlesbar; }
                $index = intval((string) $schluessel, 36);
                if ($index >= $spalten) { return $unlesbar; }
                if (!isset($daten['s'][$index][4]) || !is_array($daten['s'][$index][4])) {
                    return new WP_Error('nicht_freigegeben',
                        'Die Rückmeldung enthält Inhaberlisten für Schließungen, die nicht freigegeben waren.', array('status' => 400));
                }
                if (!is_array($liste)) { return $unlesbar; }
                $neu = self::personen_bereinigen($liste);
                /* Nur Unbrauchbares ist keine Aussage - eine leere Liste schon ("alle entfernt"). */
                if (count($liste) && !count($neu)) { continue; }
                $alt = self::personen_bereinigen(isset($daten['s'][$index][4]['p']) ? $daten['s'][$index][4]['p'] : array());
                if (wp_json_encode($alt) === wp_json_encode($neu)) { continue; }
                $listen[base_convert((string) $index, 10, 36)] = $neu;
            }
        }

        $sauber = array(
            'f' => self::FORMAT,
            'pid' => (string) $daten['pid'],
            'typ' => 'antwort',
            'anzahl' => count($tIds) . 'x' . $spalten,
            'tIds' => $tIds,
            'sIds' => $sIds,
            'a' => implode(',', $teile),
            'gesendet' => gmdate('Y-m-d\TH:i:s\Z')
        );
        /* Als Objekt, nicht als Liste: Die Schlüssel sind Spaltennummern
           in Basis 36 - "0" und "1" sähen als PHP-Array wie eine Liste aus
           und kämen beim Gerät als Liste statt als Zuordnung an. */
        if (count($listen)) { $sauber['p'] = (object) $listen; }
        return array('antwort' => $sauber, 'anzahl' => count($teile), 'listen' => count($listen));
    }

    /* ---------------------------------------------------------------- */
    /* Für die Zuständigen                                               */
    /* ---------------------------------------------------------------- */

    /** Alle Freigaben eines Aufmaßes, neueste zuerst. */
    public static function liste($projekt_id) {
        global $wpdb;
        $tab = self::tabelle();
        $zeilen = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $tab WHERE projekt_id = %s ORDER BY erstellt_am DESC LIMIT 50", (string) $projekt_id), ARRAY_A);
        $aus = array();
        foreach (($zeilen ?: array()) as $z) { $aus[] = self::beschreiben($z, true); }
        return $aus;
    }

    /**
     * Rückmeldungen, die auf eine Prüfung warten - nur die, die diese
     * Person übernehmen dürfte. Wird bei jedem Abgleich mitgeliefert.
     */
    public static function offene_fuer($benutzer) {
        global $wpdb;
        if (!$benutzer) { return array(); }
        $tab = self::tabelle();
        $pt = Aufmass_Datenbank::tabelle('projekte');
        $zeilen = $wpdb->get_results(
            "SELECT f.*, p.kunde AS p_kunde, p.objekt AS p_objekt
             FROM $tab f JOIN $pt p ON p.id = f.projekt_id
             WHERE f.status = 'beantwortet' AND p.geloescht = 0
             ORDER BY f.antwort_am ASC", ARRAY_A);
        $aus = array();
        foreach (($zeilen ?: array()) as $z) {
            if (!Aufmass_Projekte::darf_pruefen($z['projekt_id'], $benutzer)) { continue; }
            $b = self::beschreiben($z, true);
            $b['kunde'] = (string) $z['p_kunde'];
            $b['objekt'] = (string) $z['p_objekt'];
            $aus[] = $b;
        }
        return $aus;
    }

    /** Die Antwort wurde in das Aufmaß übernommen. */
    public static function uebernommen_markieren($code, $antwort_nr, $benutzer) {
        return self::antwort_erledigen($code, $antwort_nr, $benutzer, 'uebernommen');
    }

    /** Die Antwort wurde geprüft und NICHT übernommen. */
    public static function verwerfen($code, $antwort_nr, $benutzer) {
        return self::antwort_erledigen($code, $antwort_nr, $benutzer, 'verworfen');
    }

    private static function antwort_erledigen($code, $antwort_nr, $benutzer, $neuer_status) {
        global $wpdb;
        $code = self::code_bereinigen($code);
        $z = $code !== '' ? self::zeile($code) : null;
        if (!$z) {
            return new WP_Error('unbekannt', 'Diese Freigabe gibt es hier nicht.', array('status' => 404));
        }
        $darf = Aufmass_Projekte::darf_aendern($z['projekt_id'], $benutzer);
        if (is_wp_error($darf)) { return $darf; }
        /* Nur genau die Antwort, die der Zuständige gesehen hat. Hat der
           Kunde inzwischen erneut übertragen oder ein Kollege war schneller,
           wird nicht blind markiert - das Gerät holt sich den neuen Stand. */
        if ($z['status'] !== 'beantwortet' || (int) $z['antwort_nr'] !== (int) $antwort_nr) {
            return new WP_Error('nicht_mehr_offen',
                'Diese Rückmeldung ist nicht mehr offen - sie wurde inzwischen bearbeitet oder vom Kunden erneut übertragen.',
                array('status' => 409, 'freigabe' => self::beschreiben($z, true)));
        }
        $jetzt = Aufmass_Datenbank::jetzt();
        $wpdb->update(self::tabelle(), array(
            'status' => $neuer_status,
            'uebernommen_nr' => (int) $antwort_nr,
            'uebernommen_am' => $jetzt,
            'uebernommen_von' => $benutzer['id'],
            'geaendert_am' => $jetzt
        ), array('code' => $code));
        return self::beschreiben(self::zeile($code), true);
    }

    /** Der Link gilt ab sofort nicht mehr. Eine wartende Antwort bleibt zur Prüfung erhalten. */
    public static function zurueckziehen($code, $benutzer) {
        global $wpdb;
        $code = self::code_bereinigen($code);
        $z = $code !== '' ? self::zeile($code) : null;
        if (!$z) {
            return new WP_Error('unbekannt', 'Diese Freigabe gibt es hier nicht.', array('status' => 404));
        }
        $darf = Aufmass_Projekte::darf_aendern($z['projekt_id'], $benutzer);
        if (is_wp_error($darf)) { return $darf; }
        $jetzt = Aufmass_Datenbank::jetzt();
        /* Die Plandaten (Türen, Schließungen, Inhaber des Kunden) werden
           sofort entfernt: Der Link ist tot, niemand braucht sie mehr. Eine
           wartende Antwort bleibt - sie ist klein und wird noch geprüft. */
        $neu = array('gueltig_bis' => $jetzt, 'geaendert_am' => $jetzt, 'daten' => '');
        if ($z['status'] !== 'beantwortet') { $neu['status'] = 'zurueckgezogen'; }
        $wpdb->update(self::tabelle(), $neu, array('code' => $code));
        return self::beschreiben(self::zeile($code), true);
    }

    /** Wohin der Kurzlink führt: zur Freigabeseite, mit dem Code im Anker. */
    public static function umleitung_ziel($code) {
        $code = self::code_bereinigen($code);
        if ($code === '') { return ''; }
        $z = self::zeile($code);
        $seite = $z ? (string) $z['seite'] : (string) get_option('aufmass_freigabe_seite', '');
        if ($seite === '') { $seite = home_url('/aufmasstool/freigabe.html'); }
        return $seite . '#' . $code;
    }

    /**
     * Täglich: Erledigtes und Abgelaufenes nach der Aufbewahrungsfrist
     * löschen - und vorher schon die Plandaten jedes toten Links entfernen.
     * Was der Kunde nicht mehr öffnen kann, muss nicht mehr vorgehalten
     * werden; übrig bleibt der Vorgang (wer, wann, welcher Zustand).
     */
    public static function aufraeumen() {
        global $wpdb;
        $tab = self::tabelle();
        $jetzt = gmdate('Y-m-d H:i:s') . '.000000';
        $wpdb->query($wpdb->prepare(
            "UPDATE $tab SET daten = ''
             WHERE daten <> '' AND status <> 'beantwortet'
               AND (status = 'zurueckgezogen' OR (gueltig_bis IS NOT NULL AND gueltig_bis < %s))",
            $jetzt));
        $grenze = gmdate('Y-m-d H:i:s', time() - self::AUFBEWAHRUNG_TAGE * 86400) . '.000000';
        $wpdb->query($wpdb->prepare(
            "DELETE FROM $tab
             WHERE (status IN ('zurueckgezogen','uebernommen','verworfen') AND geaendert_am < %s)
                OR (gueltig_bis IS NOT NULL AND gueltig_bis < %s AND status <> 'beantwortet')",
            $grenze, $grenze));
    }

    /** Alle Freigaben eines Aufmaßes endgültig entfernen (Papierkorb leeren). */
    public static function alle_loeschen($projekt_id) {
        global $wpdb;
        $wpdb->delete(self::tabelle(), array('projekt_id' => (string) $projekt_id));
    }

    /* ---------------------------------------------------------------- */
    /* Benachrichtigung                                                  */
    /* ---------------------------------------------------------------- */

    /** An alle, die diese Antwort übernehmen können. */
    public static function empfaenger($z) {
        global $wpdb;
        $bt = Aufmass_Datenbank::tabelle('benutzer');
        $adressen = array();
        $ersteller = $wpdb->get_row($wpdb->prepare("SELECT email, aktiv FROM $bt WHERE id = %s", $z['erstellt_von']), ARRAY_A);
        if ($ersteller && (int) $ersteller['aktiv'] === 1 && $ersteller['email'] !== '') {
            $adressen[] = $ersteller['email'];
        }
        foreach (Aufmass_Projekte::zustaendige_von($z['projekt_id']) as $x) {
            if (!empty($x['email'])) { $adressen[] = $x['email']; }
        }
        $gesehen = array();
        $aus = array();
        foreach ($adressen as $a) {
            $a = trim((string) $a);
            if ($a === '' || strpos($a, '@') === false) { continue; }
            if (function_exists('is_email') && !is_email($a)) { continue; }
            $k = strtolower($a);
            if (isset($gesehen[$k])) { continue; }
            $gesehen[$k] = true;
            $aus[] = $a;
        }
        return $aus;
    }

    private static function benachrichtigen($z) {
        if (!$z || !self::mail_gewuenscht() || !function_exists('wp_mail')) { return false; }
        global $wpdb;
        $pt = Aufmass_Datenbank::tabelle('projekte');
        $projekt = $wpdb->get_row($wpdb->prepare("SELECT kunde, objekt FROM $pt WHERE id = %s", $z['projekt_id']), ARRAY_A);
        $titel = trim(implode(' – ', array_filter(array(
            $projekt ? (string) $projekt['kunde'] : '', $projekt ? (string) $projekt['objekt'] : ''))));
        $empfaenger = self::empfaenger($z);
        if (!count($empfaenger)) { return false; }

        $werkzeug = preg_replace('#[^/]*$#', '', (string) $z['seite']);
        $anzahl = (int) $z['antwort_anzahl'];
        $listen = (int) $z['antwort_listen'];
        /* Was vom Kunden stammt, wird als solches gekennzeichnet und
           gekürzt: Niemand soll in einer Mail von „uns“ einem Text trauen,
           den ein Fremder geschrieben hat. */
        $name = self::einzeilig(self::text($z['antwort_name'], self::NAME_MAX));
        $anmerkung = trim(self::text($z['antwort_anmerkung'], 500));
        if (strlen((string) $z['antwort_anmerkung']) > strlen($anmerkung)) { $anmerkung .= ' […]'; }
        /* Der Betreff ist eine Kopfzeile: nie mit Zeilenumbrüchen. */
        $betreff = self::einzeilig('Kundenrückmeldung zum Aufmaß' . ($titel !== '' ? ' ' . self::text($titel, 150) : ''));
        $text = "Hallo,\n\n"
            . "über den Freigabe-Link zum Aufmaß " . ($titel !== '' ? $titel : '(ohne Namen)')
            . " wurden Änderungen übertragen.\n\n"
            . "Übertragen:  " . self::datum($z['antwort_am']) . "\n"
            . "Änderungen:  " . $anzahl . ($anzahl === 1 ? ' Berechtigung' : ' Berechtigungen')
            . ', ' . $listen . ($listen === 1 ? ' Inhaberliste' : ' Inhaberlisten') . "\n\n"
            . "Angaben des Kunden (ungeprüft, so wie eingegeben):\n"
            . "  Name:       " . $name . "\n"
            . "  Anmerkung:  " . ($anmerkung !== '' ? str_replace("\n", "\n              ", $anmerkung) : '–') . "\n\n"
            . "Die Rückmeldung liegt jetzt im Aufmaß-Werkzeug bereit. Sie wird erst übernommen, "
            . "wenn eine zuständige Person sie dort geprüft und bestätigt hat:\n"
            . $werkzeug . "\n\n"
            . "Diese Nachricht wurde automatisch vom Aufmaß-Abgleich erzeugt. "
            . "Sie enthält keine Links, die angeklickt werden müssten - das Werkzeug wie gewohnt öffnen.\n";
        try {
            return (bool) wp_mail($empfaenger, $betreff, $text, array('Content-Type: text/plain; charset=UTF-8'));
        } catch (\Throwable $e) {
            return false;
        }
    }

    /* ---------------------------------------------------------------- */
    /* Hilfsmittel                                                       */
    /* ---------------------------------------------------------------- */
    public static function zeile($code) {
        global $wpdb;
        $tab = self::tabelle();
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM $tab WHERE code = %s", $code), ARRAY_A);
    }

    /** Der wirksame Zustand: abgelaufen und zurückgezogen entstehen aus den Spalten. */
    public static function status_von($z) {
        if ($z['status'] === 'zurueckgezogen') { return 'zurueckgezogen'; }
        /* Eine wartende Antwort bleibt zur Prüfung, auch wenn der Link
           inzwischen abgelaufen ist. */
        if ($z['status'] === 'beantwortet') { return 'beantwortet'; }
        if (self::abgelaufen($z)) { return 'abgelaufen'; }
        return $z['status'];
    }

    /* Mit Mikrosekunden verglichen: Ein eben zurückgezogener Link trägt
       als Ablauf die aktuelle Serverzeit - auf ganze Sekunden gerundet
       wäre er dieselbe Sekunde lang noch gültig. */
    private static function abgelaufen($z) {
        if (empty($z['gueltig_bis'])) { return false; }
        return self::zeit($z['gueltig_bis']) <= microtime(true);
    }

    private static function zeit($dbzeit) {
        $t = strtotime(substr((string) $dbzeit, 0, 19) . ' UTC');
        if (!$t) { return 0; }
        $bruch = 0.0;
        if (preg_match('/\.(\d{1,6})/', (string) $dbzeit, $treffer)) { $bruch = (float) ('0.' . $treffer[1]); }
        return $t + $bruch;
    }

    /** Darf der Kunde diesen Link (noch) benutzen? */
    private static function gesperrt($z) {
        $status = self::status_von($z);
        if ($status === 'zurueckgezogen') {
            return new WP_Error('zurueckgezogen', 'Dieser Freigabe-Link wurde zurückgezogen.', array('status' => 410));
        }
        if ($status === 'abgelaufen' || self::abgelaufen($z)) {
            return new WP_Error('abgelaufen', 'Dieser Freigabe-Link ist abgelaufen.', array('status' => 410));
        }
        if (self::projekt_weg($z['projekt_id'])) {
            return new WP_Error('zurueckgezogen', 'Dieser Freigabe-Link ist nicht mehr gültig.', array('status' => 410));
        }
        return null;
    }

    private static function projekt_weg($projekt_id) {
        global $wpdb;
        $pt = Aufmass_Datenbank::tabelle('projekte');
        $g = $wpdb->get_var($wpdb->prepare("SELECT geloescht FROM $pt WHERE id = %s", $projekt_id));
        return $g === null || (int) $g === 1;
    }

    public static function beschreiben($z, $mit_antwort) {
        $namen = self::namen();
        $aus = array(
            'code' => $z['code'],
            'projektId' => $z['projekt_id'],
            'kurzlink' => self::kurzlink($z['code']),
            'link' => $z['seite'] . '#' . $z['code'],
            'status' => self::status_von($z),
            'erstelltAm' => self::iso($z['erstellt_am']),
            'erstelltVon' => isset($namen[$z['erstellt_von']]) ? $namen[$z['erstellt_von']] : '',
            'gueltigBis' => self::iso($z['gueltig_bis']),
            'antwortNr' => (int) $z['antwort_nr'],
            'antwortAm' => self::iso($z['antwort_am']),
            'antwortName' => (string) $z['antwort_name'],
            'antwortAnmerkung' => (string) $z['antwort_anmerkung'],
            'antwortAnzahl' => (int) $z['antwort_anzahl'],
            'antwortListen' => (int) $z['antwort_listen'],
            'uebernommenNr' => (int) $z['uebernommen_nr'],
            'uebernommenAm' => self::iso($z['uebernommen_am']),
            'uebernommenVon' => isset($namen[$z['uebernommen_von']]) ? $namen[$z['uebernommen_von']] : ''
        );
        if ($mit_antwort) { $aus['antwort'] = self::antwort_dekodieren($z['antwort']); }
        return $aus;
    }

    /** Die abgelegte Antwort lesen; 'p' bleibt dabei eine Zuordnung. */
    private static function antwort_dekodieren($json) {
        if (!$json) { return null; }
        $a = json_decode($json, true);
        if (!is_array($a)) { return null; }
        if (isset($a['p']) && is_array($a['p'])) { $a['p'] = (object) $a['p']; }
        return $a;
    }

    private static function kennungen($antwort, $feld) {
        if (!isset($antwort[$feld]) || !is_array($antwort[$feld])) { return null; }
        $aus = array();
        foreach ($antwort[$feld] as $x) {
            if (!is_scalar($x)) { return null; }
            $aus[] = (string) $x;
        }
        return $aus;
    }

    /** Lauflängen auflösen - dasselbe Verfahren wie in freigabe.js. */
    public static function entpacken($text) {
        $text = (string) $text;
        $aus = '';
        $i = 0;
        $n = strlen($text);
        while ($i < $n) {
            $z = $text[$i];
            if ($i + 1 < $n && $text[$i + 1] === '~') {
                $k = ($i + 2 < $n) ? intval($text[$i + 2], 36) : 1;
                if ($k < 1) { $k = 1; }
                $aus .= str_repeat($z, $k);
                $i += 3;
            } else {
                $aus .= $z;
                $i += 1;
            }
            if (strlen($aus) > 4000000) { break; }   /* niemals unbegrenzt wachsen */
        }
        return $aus;
    }

    /** Personen in die knappe Form [Name, Funktion, Anzahl] bringen. */
    public static function personen_bereinigen($liste) {
        $aus = array();
        if (!is_array($liste)) { return $aus; }
        foreach ($liste as $x) {
            if (count($aus) >= self::PERSONEN_MAX) { break; }
            if (!is_array($x)) { continue; }
            if (array_keys($x) === range(0, count($x) - 1)) {
                $name = isset($x[0]) ? $x[0] : '';
                $funktion = isset($x[1]) ? $x[1] : '';
                $anzahl = isset($x[2]) ? $x[2] : 1;
            } else {
                $name = isset($x['name']) ? $x['name'] : '';
                $funktion = isset($x['funktion']) ? $x['funktion'] : '';
                $anzahl = isset($x['anzahlMedien']) ? $x['anzahlMedien'] : 1;
            }
            $name = self::einzeilig(self::text($name, self::NAME_MAX));
            if ($name === '') { continue; }
            $anzahl = is_scalar($anzahl) ? (int) $anzahl : 1;
            if ($anzahl < 1) { $anzahl = 1; }
            if ($anzahl > 99) { $anzahl = 99; }
            $aus[] = array($name, self::einzeilig(self::text($funktion, self::NAME_MAX)), $anzahl);
        }
        return $aus;
    }

    /** Text ohne Steuerzeichen, beschnitten und gestutzt. */
    private static function text($wert, $max) {
        if (!is_scalar($wert)) { return ''; }
        $t = (string) $wert;
        $t = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $t);
        $t = trim((string) $t);
        return function_exists('mb_substr') ? mb_substr($t, 0, $max) : substr($t, 0, $max);
    }

    private static function einzeilig($t) {
        return trim(preg_replace('/\s+/', ' ', (string) $t));
    }

    private static function datum($zeit) {
        if (!$zeit) { return '–'; }
        $t = strtotime(substr($zeit, 0, 19) . ' UTC');
        if (!$t) { return '–'; }
        if (function_exists('wp_date')) { return wp_date('d.m.Y H:i', $t); }
        return gmdate('d.m.Y H:i', $t) . ' UTC';
    }

    private static function namen() {
        global $wpdb;
        static $vorrat = null;
        if ($vorrat !== null) { return $vorrat; }
        $bt = Aufmass_Datenbank::tabelle('benutzer');
        $vorrat = array();
        foreach (($wpdb->get_results("SELECT id, name FROM $bt", ARRAY_A) ?: array()) as $z) {
            $vorrat[$z['id']] = $z['name'];
        }
        return $vorrat;
    }

    private static function iso($zeit) {
        if (!$zeit) { return ''; }
        return str_replace(' ', 'T', substr($zeit, 0, 26)) . 'Z';
    }

    /* Drosselung: siehe drossel.php (Zähler je Herkunft bzw. je Code). */
    public static function herkunft() { return Aufmass_Drossel::herkunft(); }
    private static function drossel($art, $max) { return Aufmass_Drossel::zaehlen($art, $max, self::DROSSEL_FENSTER); }
    private static function drossel_voll($art, $max) { return Aufmass_Drossel::voll($art, $max); }
    private static function drossel_je_code($code) {
        return Aufmass_Drossel::zaehlen_fuer('freigabe:' . $code, self::DROSSEL_JE_CODE, self::DROSSEL_JE_CODE_FENSTER);
    }
    private static function zu_viele() { return Aufmass_Drossel::zu_viele(); }
}
