<?php
/**
 * datenbank.php — Tabellen der gemeinsamen Ablage.
 *
 * Zum Abgleich braucht jedes Gerät die Frage beantwortet: "Was hat sich
 * geändert, seit ich das letzte Mal da war?" Dafür trägt jede Zeile eine
 * Änderungszeit mit Mikrosekunden, gestellt von der *Serveruhr*. Die Geräte
 * geben diese Marke unverändert zurück, deshalb spielt es keine Rolle, ob
 * die Uhr eines iPads falsch geht. Beim Abholen zieht der Server eine
 * kleine Sicherheitsspanne ab: Lieber eine Zeile doppelt ausliefern (das
 * Gerät erkennt an der Version, dass sie bekannt ist) als eine verpassen.
 */

if (!defined('ABSPATH')) { exit; }

class Aufmass_Datenbank {

    /** Sicherheitsspanne beim Abholen, in Sekunden. */
    const SPANNE = 2;

    public static function tabelle($name) {
        global $wpdb;
        return $wpdb->prefix . 'aufmass_' . $name;
    }

    public static function tabellen_anlegen() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $sortierung = $wpdb->get_charset_collate();

        $benutzer = self::tabelle('benutzer');
        $projekte = self::tabelle('projekte');
        $zustaendig = self::tabelle('zustaendig');
        $fotos = self::tabelle('fotos');
        $sitzungen = self::tabelle('sitzungen');
        $freigaben = self::tabelle('freigaben');

        /* Wer sich anmelden darf. Die Kennung ist Googles unveränderliche
           Benutzerkennung (sub), nicht die Adresse: Eine Adresse kann
           umbenannt werden, die Kennung bleibt. */
        dbDelta("CREATE TABLE $benutzer (
  id varchar(64) NOT NULL,
  email varchar(190) NOT NULL DEFAULT '',
  name varchar(190) NOT NULL DEFAULT '',
  bild varchar(500) NOT NULL DEFAULT '',
  rolle varchar(20) NOT NULL DEFAULT 'mitarbeit',
  aktiv tinyint(1) NOT NULL DEFAULT 1,
  erste_anmeldung datetime(6) DEFAULT NULL,
  letzte_anmeldung datetime(6) DEFAULT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY email (email)
) $sortierung;");

        /* Ein Aufmaß. Die Fotos stecken NICHT in 'daten' - sie liegen als
           eigene Dateien, sonst würde jede Speicherung mehrere Megabyte
           durch PHP schieben. */
        dbDelta("CREATE TABLE $projekte (
  id varchar(64) NOT NULL,
  kunde varchar(255) NOT NULL DEFAULT '',
  objekt varchar(255) NOT NULL DEFAULT '',
  anlagen_nr varchar(100) NOT NULL DEFAULT '',
  daten longtext NOT NULL,
  version bigint(20) unsigned NOT NULL DEFAULT 1,
  angelegt_am datetime(6) DEFAULT NULL,
  angelegt_von varchar(64) NOT NULL DEFAULT '',
  geaendert_am datetime(6) DEFAULT NULL,
  geaendert_von varchar(64) NOT NULL DEFAULT '',
  geloescht tinyint(1) NOT NULL DEFAULT 0,
  geloescht_am datetime(6) DEFAULT NULL,
  PRIMARY KEY  (id),
  KEY geaendert_am (geaendert_am),
  KEY geloescht (geloescht)
) $sortierung;");

        /* Wer darf ein Aufmaß ändern. Lesen darf jeder Angemeldete. */
        dbDelta("CREATE TABLE $zustaendig (
  projekt_id varchar(64) NOT NULL,
  benutzer_id varchar(64) NOT NULL,
  seit datetime(6) DEFAULT NULL,
  PRIMARY KEY  (projekt_id,benutzer_id),
  KEY benutzer_id (benutzer_id)
) $sortierung;");

        dbDelta("CREATE TABLE $fotos (
  id varchar(64) NOT NULL,
  projekt_id varchar(64) NOT NULL,
  tuer_id varchar(64) NOT NULL DEFAULT '',
  datei varchar(255) NOT NULL DEFAULT '',
  mime varchar(60) NOT NULL DEFAULT 'image/jpeg',
  groesse int(10) unsigned NOT NULL DEFAULT 0,
  erstellt_am datetime(6) DEFAULT NULL,
  hochgeladen_von varchar(64) NOT NULL DEFAULT '',
  PRIMARY KEY  (id),
  KEY projekt_id (projekt_id)
) $sortierung;");

        /* Sitzungen stehen in der Datenbank statt in einem selbsttragenden
           Cookie: Nur so lässt sich ein Gerät nachträglich abmelden - etwa
           wenn jemand das Unternehmen verlässt oder ein iPad abhanden kommt. */
        dbDelta("CREATE TABLE $sitzungen (
  id varchar(64) NOT NULL,
  pruefwert varchar(128) NOT NULL DEFAULT '',
  benutzer_id varchar(64) NOT NULL,
  geraet varchar(255) NOT NULL DEFAULT '',
  erstellt_am datetime(6) DEFAULT NULL,
  gesehen_am datetime(6) DEFAULT NULL,
  gueltig_bis datetime(6) DEFAULT NULL,
  PRIMARY KEY  (id),
  KEY benutzer_id (benutzer_id),
  KEY gueltig_bis (gueltig_bis)
) $sortierung;");

        /* Eine Kundenfreigabe: Der Plan liegt hier, der Kunde bekommt nur
           den kurzen Code. Seine Antwort landet in derselben Zeile und
           wartet dort, bis ein Zuständiger sie geprüft und übernommen
           hat. Die Antwort selbst ist klein - nur die Abweichungen.
           Seit Fassung 1.2: die Rechte des Kunden (rechte), die Vorlage
           zur verbindlichen Freigabe (vorgelegt_am) und die Freigabe
           selbst (freigabe_*). */
        dbDelta("CREATE TABLE $freigaben (
  code varchar(16) NOT NULL,
  projekt_id varchar(64) NOT NULL,
  seite varchar(500) NOT NULL DEFAULT '',
  daten longtext NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'offen',
  erstellt_am datetime(6) DEFAULT NULL,
  erstellt_von varchar(64) NOT NULL DEFAULT '',
  gueltig_bis datetime(6) DEFAULT NULL,
  antwort longtext,
  antwort_nr int(10) unsigned NOT NULL DEFAULT 0,
  antwort_am datetime(6) DEFAULT NULL,
  antwort_name varchar(190) NOT NULL DEFAULT '',
  antwort_anmerkung text,
  antwort_anzahl int(10) unsigned NOT NULL DEFAULT 0,
  antwort_listen int(10) unsigned NOT NULL DEFAULT 0,
  uebernommen_nr int(10) unsigned NOT NULL DEFAULT 0,
  uebernommen_am datetime(6) DEFAULT NULL,
  uebernommen_von varchar(64) NOT NULL DEFAULT '',
  rechte varchar(20) NOT NULL DEFAULT '',
  vorgelegt_am datetime(6) DEFAULT NULL,
  freigabe_am datetime(6) DEFAULT NULL,
  freigabe_name varchar(190) NOT NULL DEFAULT '',
  freigabe_funktion varchar(190) NOT NULL DEFAULT '',
  freigabe_art varchar(20) NOT NULL DEFAULT '',
  geaendert_am datetime(6) DEFAULT NULL,
  PRIMARY KEY  (code),
  KEY projekt_id (projekt_id),
  KEY status (status),
  KEY geaendert_am (geaendert_am)
) $sortierung;");
    }

    /**
     * Sekunden und Mikrosekunden aus EINER Uhrabfrage.
     *
     * Zwei getrennte Abfragen (gmdate() für die Sekunden, microtime() für
     * den Bruchteil) liefen an der Sekundengrenze auseinander: Die Sekunde
     * stammte noch von "19", der Bruchteil schon von "20" - der Wert lag
     * dann um fast eine Sekunde zurück, und ein Abgleich konnte eine Zeile
     * verpassen. Der Prüflauf hat es über 1,8 Millionen Aufrufe gezeigt.
     * Der Bruchteil wird abgeschnitten, nicht gerundet: Runden könnte auf
     * 1.000000 überlaufen, ohne dass die Sekunde mitzählt.
     */
    private static function uhr() {
        $t = microtime(true);
        $sekunden = (int) floor($t);
        $mikro = (int) (($t - $sekunden) * 1000000);
        if ($mikro > 999999) { $mikro = 999999; }
        if ($mikro < 0) { $mikro = 0; }
        return array($sekunden, sprintf('%06d', $mikro));
    }

    /** Serverzeit mit Mikrosekunden, als Zeichenkette für die Datenbank. */
    public static function jetzt() {
        $u = self::uhr();
        return gmdate('Y-m-d H:i:s', $u[0]) . '.' . $u[1];
    }

    /** Dieselbe Zeit als Marke für die Geräte (ISO, UTC). */
    public static function marke() {
        $u = self::uhr();
        return gmdate('Y-m-d\TH:i:s', $u[0]) . '.' . $u[1] . 'Z';
    }

    /**
     * Eine Marke vom Gerät in eine Datenbankzeit umrechnen, abzüglich der
     * Sicherheitsspanne.
     *
     * strtotime() allein genügt hier nicht: Es wirft die Mikrosekunden weg,
     * wodurch die Spanne unscharf zwischen zwei und drei Sekunden läge.
     * Darum werden die Nachkommastellen eigens herausgelesen.
     */
    public static function marke_zu_zeit($marke) {
        $marke = (string) $marke;
        $bruch = 0.0;
        if (preg_match('/\.(\d{1,6})/', $marke, $treffer)) {
            $bruch = (float) ('0.' . $treffer[1]);
        }
        $zeit = strtotime($marke);
        if (!$zeit) { return '1970-01-01 00:00:00.000000'; }
        $genau = $zeit + $bruch - self::SPANNE;
        if ($genau < 0) { return '1970-01-01 00:00:00.000000'; }
        $sekunden = (int) floor($genau);
        return gmdate('Y-m-d H:i:s', $sekunden)
            . '.' . str_pad((string) (int) round(($genau - $sekunden) * 1000000), 6, '0', STR_PAD_LEFT);
    }
}
