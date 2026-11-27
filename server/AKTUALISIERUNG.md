# Aufmaß-Werkzeug aktualisieren (laufende Installation)

Diese Anleitung gilt, wenn das Werkzeug **schon läuft**: Plugin
„Aufmaß-Abgleich“ in WordPress, Ordner `aufmasstool` auf dem Webspace,
Geräte angemeldet. Sie bringt beides auf den Stand **1.5.5** – Plugin
und Werkzeug tragen dieselbe Fassungsnummer.

**Was 1.5.5 bringt** (gegenüber 1.5.4) – Zylindernummern wie im
EVVA-Formular

- **Gleichschließende Zylinder tragen dieselbe Zyl.Nr.** Im EVVA-Formular
  bezeichnet die Zyl.Nr. die Schließung: Alle Zylinder mit derselben Nummer
  haben denselben Schlüssel (im Trainingsplan Wohnung 1 und Keller 1 beide
  „1“, Haustür, Müll und Fahrräder alle „Z“). Bisher schrieb das Werkzeug
  für Mitläufer „2.1“, „2.2“ – für den Hersteller eine andere Nummer und
  damit womöglich eine eigene Schließung. Jetzt tragen Haupttür und
  Mitläufer dieselbe Nummer (die Türnummer der Haupttür), im Europlan, im
  Europlan-PDF, im EVVA-Formular, in der Schlüsselnummer der Mieter
  (Schl.Nr. = Zyl.Nr. der Wohnung) und in der Anbindung. Im
  Kreuzschließplan steht neben einer gleichschließenden Tür weiterhin
  „= 2“, und im Europlan erkennt man Mitläufer an der grauen Zeile; die
  Berechtigungen beider Türen bleiben wie bisher automatisch gleich.
- Die Zeichen des Europlans bleiben: X (übergeordneter Schlüssel sperrt),
  I (Einzelschließung, der Eigenschlüssel gehört zur Gruppe), Z
  (Zentralzylinder), M (Mitschließung), O (vorgeplant) – wie in der
  Gültigkeitsliste des EVVA-Formulars und den Schließplan-Beispielen von
  Winkhaus.
- **Kein Fokussprung beim Öffnen eines Dialogs:** Wer direkt nach dem
  Öffnen schon in ein Feld tippt, behält den Fokus dort. Vorher sprang er
  kurz danach ins erste Feld, und die restlichen Zeichen landeten zum
  Beispiel in der Tür-Nr. statt in der Bezeichnung.

**Was 1.5.4 brachte** (gegenüber 1.5.3) – Kopplung Kreuzschließplan ↔
Europlan geprüft und korrigiert

- **Eigene Schlüsselspalten im Europlan zeigen alles, was der Schlüssel
  sperrt.** Steht ein Mitarbeiter als eigene X-Spalte im Europlan (weil
  sein Schlüssel mehr als eine Tür sperrt oder weil seine Tür auch von
  seiner Gruppe gesperrt wird), zeigt die Spalte jetzt auch die
  Zentralzylinder seiner Gruppen, zum Beispiel die Haustür. Vorher stand in
  seiner Spalte nur das eigene Kreuz; nach dem EVVA-Formular wäre ein
  Schlüssel ohne Haustür bestellt worden. Die Schlüsselliste
  (Kreuzschließplan als Excel) war schon richtig; Europlan, Europlan-PDF,
  EVVA-Europlan-Formular und die Anbindung für Claude Code sind jetzt
  gleich.
- **Z oder M im Europlan an einer Tür mit Eigenschlüssel** nimmt dem
  Inhaber nicht mehr die Gruppe. Vorher verließ er die Gruppe und verlor
  damit still die Haustür; jetzt bleibt er Mitglied, bekommt eine eigene
  Spalte mit allem, was die Gruppe sperrt, und eine Meldung sagt es.
- **Das angebotene Zeichen ist das, das danach dasteht:** In einer
  Gruppenspalte wird Z angeboten, wo kein fremder Eigenschlüssel an der
  Tür ist, und M, wo einer ist (oder eine Einzelschließung). Vorher stand
  nach einem gewählten M oft ein Z.
- Die Hinweise unter dem Europlan erklären, warum ein Schlüssel als eigene
  Spalte steht, und dass diese Spalte alles zeigt, was seine Gruppe sperrt.

**Was 1.5.3 brachte** (gegenüber 1.5.2) – Kundenfreigabe und Rückmeldung
von Anfang bis Ende geprüft und geglättet

- **Rückmeldung einlesen - nichts geht verloren, nichts kommt doppelt:**
  Die Rückmeldung des Kunden enthält jetzt nur noch, was er wirklich
  geändert hat. Was Sie im Werkzeug zwischen Linkerzeugung und Übernahme
  an Namen, Gruppen oder Medien geändert haben, bleibt erhalten (vorher
  setzte die Übernahme die ganze Mitarbeiterliste still auf den Stand des
  Links zurück). Dieselbe Rückmeldung zweimal eingelesen - als Datei und
  als Text, auf einem zweiten Gerät oder als Nachbesserung des Kunden über
  den Server - legt keine Mitarbeiter, Gruppen oder Spalten mehr doppelt
  an: Das Aufmaß merkt sich, welche Kundeneinträge wozu geworden sind. Der
  Bericht sagt, wenn eine Rückmeldung schon übernommen war.
- **Vorschau vor dem Übernehmen:** Beim Einlesen eines Rückschlüssels
  zeigt der Dialog wie beim Kurzlink vorab, was sich ändern würde
  (Berechtigungen mit Vorher/Nachher, Mitarbeiter, Gruppen, neue Spalten).
  Nach dem Übernehmen bleibt der Bericht zum Nachlesen offen. Felder, die
  nicht übernommen werden (Tür oder Spalte inzwischen gelöscht, nicht
  freigegeben), stehen mit Tür, Spalte, Wunsch und Grund dabei; gleiche
  Namen („Herr Baumann“ ein zweites Mal) werden als Dublette benannt.
- **Rückschlüssel aus E-Mails:** Umbrochene, zitierte („> …“), in Anführungszeichen
  gesetzte oder als ganzer Mailtext eingefügte Schlüssel werden erkannt;
  auch Leerzeichen und weiche Umbrüche im Link stören nicht mehr.
- **Kundenseite:** Eingaben überleben jetzt ein Neuladen, einen Verbindungsabbruch
  oder ein versehentlich geschlossenes Fenster (Zwischenstand im Browser,
  wird beim Senden geräumt). „Zurücksetzen“ fragt nach. Gleichschließende
  Türen sind gekennzeichnet und werden gemeinsam gesetzt. Träger eines
  Schlüssels lassen sich nicht entfernen (die Karte sagt warum), gleiche
  Namen werden beim Tippen gemeldet. Die Frist erscheint als Datum (vorher
  „Invalid Date“). Enter im Namensfeld sendet nicht mehr doppelt. Wurde eine
  Rückmeldung im Werkzeug verworfen, erfährt der Kunde das beim nächsten
  Öffnen. Ist der Link beim Senden nicht mehr gültig, lassen sich die
  Eingaben als Datei sichern; die Fehlerseite nennt Firma und Adresse. Die
  Rückmeldung per E-Mail hat immer einen Knopf (mit Schlüssel im Text oder
  mit Hinweis auf die Datei), die Adresse aus dem Firmenkopf steht dabei.
- **Freigabe-Dialog:** Die Frist ist ein Datumsfeld; der Link gilt dann
  mindestens bis eine Woche nach der Frist. Neuer Schalter „Gesperrte (–)
  und befristete (T) Vorgaben nicht freigeben“ (vorgewählt), damit ein Tipp
  des Kunden nicht aus „–“ ein „X“ macht. Ohne Server gibt es eine
  E-Mail-Vorlage, eine Datei, die sich per Doppelklick öffnet
  (Freigabe….html), eine Liste der bisherigen Links mit „Zurückziehen“ und
  einen ehrlichen Hinweis, dass Mailprogramme lange Links zerlegen. Jeder
  Link trägt die Kennung seiner Freigabe: Eine Antwort gilt genau für den
  Link, zu dem sie gehört; zurückgezogene Links werden abgelehnt. Ein
  Rückschlüssel kann keine verbindliche Freigabe mehr vermerken - die
  gilt nur über die gemeinsame Ablage.
- **Lokale Datei:** Läuft das Werkzeug als Datei, führt der lange Link auf
  die unter Einstellungen → Kundenfreigabe hinterlegte Kundenseite im
  Internet statt auf eine Datei, die der Kunde nicht hat.
- **Server:** Kurzlinks funktionieren auch im Browser, in dem das Werkzeug
  mit Service Worker läuft und im Wurzelverzeichnis liegt. Ein zur
  Freigabe vorgelegter Link bekommt wieder die volle Laufzeit. Der Server
  nimmt alle sechs Berechtigungswerte an (auch „vorgeplant“), gibt dem
  Kunden bei gesperrtem Link den Ansprechpartner mit und reicht
  gleichschließende Türen und die Kennung der Freigabe bereinigt durch.
  Arrays an Textstellen führen zur Ablehnung statt zum Abbruch. Die
  Linkliste zeigt Kolleginnen und Kollegen ohne Zuständigkeit nur noch den
  Stand, nicht mehr den Code (mit ihm ließe sich als Kunde senden).
  Freigegebene Links behalten ihren Plan auch nach Ablauf der Laufzeit,
  erloschene Links antworten mit einer Auskunft statt mit einem
  Serverfehler, offene Rückmeldungen werden je Abruf begrenzt, und Leerraum
  wird auf beiden Seiten gleich behandelt.

**Was 1.5.2 brachte** (gegenüber 1.5.1) – Sichtprüfung und Technik der
Darstellung auf Telefon, Tablet und Rechner sowie der gedruckten Ausgaben

- **Bedienung auf dem Telefon:** Der schwebende Knopf (+ Neue Tür,
  + Spalte …) erscheint erst, wenn der gleichnamige Knopf im Kopf aus dem
  Bild gescrollt ist; vorher verdeckte er Zeilen und Löschknöpfe. Die
  Werkzeugleiste des Schließplans ist ein sauberes Raster, Dialoge mit
  zwei Knöpfen haben eine Reihe, kleine Auswahldialoge liegen als Blatt am
  unteren Rand. Tabellen unter dem Plan und „Spalten verwalten“ lassen
  Nebenspalten weg, damit Medien und Pfeile im Bild bleiben. Der Europlan
  zeigt auf dem Telefon Schlüsselspalten statt nur des linken Blocks.
  Bereichs-Überschriften der Matrix bleiben beim seitlichen Scrollen
  lesbar; Schatten zeigen, dass es seitlich weitergeht. Der gewählte
  Reiter steht in der Mitte der Reiterleiste. Angetippte Knöpfe bleiben
  auf Touch-Geräten nicht mehr „beleuchtet“.
- **Tastatur und Hilfstechnik:** Türzeilen, Matrixzellen, Spaltenköpfe,
  Personenzeilen und Gliederungsknoten sind per Tab erreichbar, Enter
  öffnet oder schaltet, Pfeiltasten wandern durch Matrix und Reiter.
  Dialoge tragen Rolle und Titel, sperren den Hintergrund, halten den
  Fokus und geben ihn beim Schließen zurück (vorher konnte Enter auf dem
  Reiter „Projekte“ bei offenem Türformular das Aufmaß schließen und die
  Tür ging verloren). Sichtbare Fokusmarke überall, Beschriftungen für
  mehrteilige Felder, Suchfeld und Speicherstatus, Reiter mit Zähler als
  Text.
- **Druck:** Strg+P druckt immer hell (auch in der dunklen Darstellung),
  die Matrix vollständig statt im Scrollrahmen abgeschnitten, ohne
  Knöpfe, Fußleiste und Werkzeugleisten; das gilt auch für die
  Kundenseite.
- **Kleinigkeiten:** Browserleiste in der Farbe der Darstellung,
  Auswahllisten und Scrollbalken dunkel in der dunklen Darstellung,
  Passwortfeld in der Gestaltung der übrigen Felder (iOS zoomt nicht),
  Schutzzonen für Notch und Querformat, Android-Tastatur verdeckt keine
  Dialogknöpfe mehr, Kontrast in der hellen Darstellung nachgezogen,
  Touch-Ziele mindestens 44 px, Meldungen begrenzt (höchstens drei, kurz;
  Hinweise zum EVVA-Formular in einem Fenster zum Nachlesen), lange
  Wörter brechen um, Gerätespeicher in deutscher Schreibweise.
- **PDF-Ausgaben:** Lange Bemerkungen, Nacharbeiten, Projektbemerkungen
  und Hinweise fließen über Seitengrenzen statt über die Fußzeile zu
  laufen. Keine verwaisten Bereichs-, Tabellen- und Summenzeilen am
  Seitenende, Unterschriften nie allein. Kopfzeilen, Bereichszeilen und
  Fußzeile laufen nicht mehr über den Rand. Datenblatt, Kopfblock und
  Materialliste kürzen Werte nicht mehr nach zwei oder drei Zeilen,
  Türnummern brechen an Bindestrichen um, der Datenblatt-Titel ist
  zweizeilig, der Freigabekasten wächst mit. Fotos: bis zu beliebig
  viele je Tür in Reihen, nicht lesbare Bilder werden benannt, kleine
  Bilder nicht aufgeblasen, CMYK-Fotos farbrichtig. Schriften mindestens
  7 pt (Stückzahlen 6,5 pt). Europlan-Schlüsselnummern stehen senkrecht
  und bleiben lesbar. Sonderzeichen (≥ ≤ ≠ ≈ ∞ Ω) werden umgesetzt,
  Zeichenbreiten für ß ø ½ Æ korrigiert, Auslassungen als „…“ an
  Wortgrenzen. PDF-Metadaten (Titel, Betreff) in korrekter Kodierung,
  dazu Fassung und Erstellungsdatum. Maße mit Dezimalkomma, Anzahl immer
  als ganze Zahl ab 1.
- **EVVA-Excel:** Funktion und Schlüsselnummer stehen senkrecht (wie in
  der Vorlage), Mengen schrumpfen in die Zelle, Besteller und Besitzer
  bekommen Zeilenhöhe nach Inhalt, Druck im Querformat auf Seitenbreite
  mit Wiederholungszeilen und -spalten und Druckbereich, Gültigkeitsregeln
  für Sperrkombination und Schlüsselnummer, Warnungen bei gekürzter
  Schlüsselnummer und fehlender Zylindernummer (kein „?“ mehr).

**Was 1.5.1 brachte** (gegenüber 1.5.0) – Fehlerbereinigung nach einem
vollständigen technischen Prüfdurchlauf, ohne neue Bedienung

- **Abgleich zwischen Geräten:** Wird ein Aufmaß auf einem Gerät
  gelöscht, während es auf einem anderen geöffnet ist, schließt es sich
  dort mit Hinweis, statt beim nächsten Speichern als neues Aufmaß
  wieder aufzutauchen. Fotos bleiben beim Übernehmen eines Serverstands
  erhalten. Zwei Geräte mit demselben offenen Aufmaß schieben sich den
  Stand nicht mehr endlos hin und her. Nach einem Fehler beim Abholen
  bleibt kein Eintrag mehr aus; bei Rückfragen „gelöscht gegen
  geändert“ gilt die getroffene Entscheidung wirklich.
- **Speichern:** Schlägt das Ablegen auf dem Gerät fehl (Speicher voll,
  gesperrt), bleibt das Aufmaß offen und meldet es, statt still zu
  schließen oder neu zu laden. Kopieren, Löschen, Importieren und die
  Einstellungen melden Fehlschläge.
- **Kundenseite:** Der Wert „vorgeplant“ (O) wird angezeigt und erklärt;
  ein Antippen läuft X, Z, leer und zurück zu O. Gleichschließende Türen
  bleiben beim Übernehmen einer Kundenantwort gleich.
- **Server-Plugin:** Was der Kunde geantwortet hat (Namen, Anmerkung,
  Plan), sehen nur noch Zuständige und Verwaltung; andere sehen den
  Stand der Freigabe. Legen zwei Geräte gleichzeitig dasselbe Aufmaß an,
  bekommt das zweite einen Konflikt statt eines stillen Verlusts.
- **Sicherheit:** Der Gerätespeicher der Anwendung nimmt keine HTML-
  Seite (Wartung, Sperre) mehr als Skript an; Projektdaten aus Import
  oder Abgleich werden strenger geprüft (Feldtypen, Kennungen, Werte,
  Pipedrive-Verweise); Zugangsschlüssel-Namen werden geprüft. Die
  Programmanbindung (MCP) legt Türen vollständig oder gar nicht an und
  lehnt mehrdeutige Spaltenkürzel ab.

**Was 1.5.0 brachte** (gegenüber 1.4.0) – Europlan und EVVA-Bestellformular

- **Zweite Ansicht unter Schließplan:** Ein Umschalter wechselt zwischen
  *Kreuzschließplan* und *Europlan*, der Schreibweise der Hersteller.
  Zeilen sind die Zylinder mit Zyl.Nr., Stk., ESL (Stückzahl der
  Eigenschlüssel) und Type (Produktcode), Spalten die übergeordneten
  Schlüssel (X) und die Gruppen der Eigenschlüssel (I = gehört zur Gruppe,
  Z = Zentralzylinder, M = Mitschließung, O = vorgeplant). Beide Ansichten
  zeigen denselben Plan: Was in der einen gesetzt wird, steht sofort in
  der anderen. Die gewählte Ansicht bleibt je Gerät gemerkt.
- **Bearbeiten im Europlan:** Zellen antippen (X/O in Schlüsselspalten,
  I/Z/M/O in Gruppenspalten), ein I an einer Tür ohne Inhaber legt den
  Inhaber mit Stückzahl an, ESL und Stk. antippen, Type überschreiben,
  neue Türen und Spalten direkt aus dem Plan.
- **Gleichschließung:** Die Zyl.Nr. ist die Türnummer. Türen mit gleicher
  Schließung hängen an ihrer Haupttür (Zyl.Nr. antippen) und bekommen .1,
  .2 …; ihre Berechtigungen hält das Werkzeug in beiden Ansichten
  automatisch gleich.
- **EVVA-Bestellformular als Excel:** Unter *Export* und im Schließplan
  gibt es den Plan als .xlsx genau im Layout des EVVA-Formulars, wahlweise
  als Europlan oder als Kreuzschließplan (jeder Schlüssel eine Spalte).
  Ohne Fremdbibliothek, auch ohne Netz. Dazu der **Europlan als PDF**.
- **Neuer Wert „vorgeplant“ (O):** Eine Berechtigung lässt sich als
  Reserve vormerken; sie zählt nirgends als Sperrberechtigung. Die
  Kundenseite zeigt den Wert, vergeben kann der Kunde ihn nicht.
- **Stammdaten:** neues Feld *Oberfläche der Zylinder* (NI, MS …) für den
  Formularkopf.
- Wer schon 1.4.0 einsetzt: Plugin ersetzen (die Kundenfreigabe kennt den
  Wert „vorgeplant“) und Ordner `aufmasstool` tauschen (Schritt 3), Cache
  leeren. Claude Code: Paket neu laden, es bringt `schliessplan_lesen`
  mit Europlan-Darstellung.

**Was 1.4.0 bringt** (gegenüber 1.3.2) – Schnittstelle für Programme und
Claude Code

- **Zugangsschlüssel:** Unter *Einstellungen → Zugang für Programme und
  Claude Code* erzeugt jede angemeldete Person Schlüssel (`aufm_…`), mit
  denen Programme ohne Browser-Anmeldung mit der gemeinsamen Ablage
  arbeiten. Ein Schlüssel darf nur lesen oder lesen und schreiben, hat ein
  Ablaufdatum (Vorgabe ein Jahr, höchstens zwei) und lässt sich jederzeit
  widerrufen. Er gilt im Namen der Person: Zuständigkeiten bleiben
  maßgeblich. Der Server speichert nur einen Prüfwert, nie den Schlüssel.
- **Anbindung für Claude Code:** Das Paket `aufmass-anbindung.zip` (im
  Werkzeug an derselben Stelle zum Herunterladen) enthält einen MCP-Server.
  Nach einem Befehl im Terminal (`claude mcp add …`, der fertige Befehl
  steht beim Erzeugen des Schlüssels) kann Claude Code Aufmaße lesen,
  anlegen und ändern, Türen und Gliederung pflegen, Kreuze im Schließplan
  setzen und PDF-Berichte erzeugen – mit denselben Prüfungen und derselben
  Zusammenführung wie das Werkzeug. Dazu eine Kommandozeile und eine
  Bibliothek für eigene Skripte; Beschreibung in `server/API.md`.
- **Verwaltung:** Die Zugangsliste des Plugins zeigt je Person die Zahl
  ihrer Schlüssel und kann alle Schlüssel einer Person widerrufen. Nach 30
  falschen Schlüsseln aus einer Herkunft sperrt der Server zehn Minuten.
- **Behoben – Kreuze konnten nach dem Abgleich verloren gehen:** Ein
  Aufmaß ohne Kreuze kam vom Server mit einer leeren Liste statt einem
  leeren Schließplan zurück (eine Eigenheit von PHP). Trug man danach
  Kreuze ein, zeigte das Gerät sie, beim nächsten Abgleich fehlten sie auf
  dem Server und auf anderen Geräten. Jetzt wahren Server und Werkzeug die
  Form; schon eingetragene Kreuze werden beim Öffnen gerettet.
- **Behoben:** Wurde ein Aufmaß geschlossen, während eine PDF gerade
  erzeugt wurde, blieb ein Fehler statt einer Meldung.
- Wer schon 1.3.2 einsetzt: Plugin ersetzen (Schritt 2, es legt die
  Tabelle für die Schlüssel an) und Ordner `aufmasstool` tauschen
  (Schritt 3), Cache leeren. Schlüssel brauchen nichts weiter.

**Was 1.3.2 bringt** (gegenüber 1.3.1) – Ergebnis einer Sicherheits- und
Grafikdurchsicht

- **Gleichzeitiges Speichern:** Speicherten zwei Geräte im selben
  Augenblick mit derselben Basis, überschrieb der Zweite den Ersten still.
  Jetzt prüft der Server Version und Schreiben in einem Schritt; der
  Zweite bekommt den Konflikt samt Serverstand und führt zusammen wie
  gewohnt.
- **Schutzkopfzeilen für den Werkzeug-Ordner:** Im Ordner `aufmasstool`
  liegt jetzt eine `.htaccess` (Apache): keine Einbettung in fremde
  Seiten, keine Typ-Rätselei des Browsers, keine Verweisadresse nach
  außen, Kamera und Mikrofon nur für die eigene Seite, Seiten und Skripte
  nie lange im Browser-Cache. Alle Anweisungen sind in IfModule-Blöcke
  gefasst; fehlt ein Modul, passiert nichts. Antwortet der Ordner nach dem
  Einspielen mit „500“, erlaubt der Hoster keine Kopfzeilen per
  `.htaccess` – dann die Datei löschen, alles Übrige läuft ohne sie.
- **Fremde Daten im Werkzeug:** Fotos aus einer Import-Datei oder vom
  Abgleich zählen nur als Bild, wenn es JPEG, PNG oder WebP ist; eine
  Gliederung mit Kreisen oder verwaisten Einträgen wird beim Öffnen
  entwirrt (statt den Baum zum Stillstand zu bringen); der Baum zeichnet
  höchstens zwölf Ebenen; Import-Dateien über 64 MB werden abgewiesen,
  bevor sie gelesen werden. Namen bleiben überall Text, nie HTML – das
  wurde in Werkzeug, Kundenseite, PDF und E-Mail erneut geprüft.
- **Kleinigkeiten:** Fotos mit Zusatz im Inhaltstyp („; charset=…“) werden
  angenommen; Name und Adresse eines Zugangs werden beim Anmelden auf die
  Spaltenlänge gekürzt; Meldungen stehen oben, solange ein Dialog offen
  ist, statt auf dessen Knöpfen.
- Wer schon 1.3.1 einsetzt: Plugin ersetzen (Schritt 2, die Versionsprüfung
  beim Speichern steckt dort) und Ordner `aufmasstool` tauschen
  (Schritt 3), Cache leeren.

**Was 1.3.1 bringt** (gegenüber 1.3.0)

- **Korrektur im Abgleich:** Kam eine Änderung vom anderen Gerät an –
  etwa die im Büro angelegte Gliederung aus Standort, Gebäude und
  Bereichen –, während auf diesem Gerät gerade eine Tür getippt wurde,
  landete sie nur in der Datenbank des Geräts, nicht im geöffneten
  Aufmaß. Das nächste Speichern schrieb dann den Stand ohne diese
  Änderung zum Server, und das andere Gerät verlor sie beim nächsten
  Abgleich: Die Türen blieben, die Gebäudestruktur war weg. Jetzt kommt
  eine fremde Änderung sofort im geöffneten Aufmaß an, auch mitten in
  einer Eingabe; an den Türen und ihren Angaben ändert sich nichts.
  Das Plugin ändert sich nur in der Fassungsnummer: Wer schon 1.3.0
  einsetzt, tauscht nur den Ordner `aufmasstool` (Schritt 3) und leert
  den Cache; das Plugin kann bleiben.
- **Gliederung nach einer Zusammenführung sichtbar:** Die Zusammenführung
  des Abgleichs schreibt leere Angaben als leeren Text statt null. Der
  Strukturbaum fand danach seine Standorte nicht mehr und zeigte „Noch
  keine Gliederung angelegt“, obwohl alles da war (der Zähler am Reiter
  „Struktur“ stimmte weiter; nach Schließen und Öffnen des Aufmaßes war
  der Baum wieder da). Der Baum findet seine Wurzeln jetzt in beiden
  Schreibweisen.
- **Verlorene Gliederung zurückholen:** Verweisen Türen auf Bereiche, die
  es nicht mehr gibt, meldet die Strukturansicht das und bietet „Bereiche
  wiederherstellen“ an. Über *Projekt importieren* lässt sich bei gleicher
  Kennung „Nur Gliederung übernehmen“ – aus einem Export oder aus den
  Projektdaten einer Datenbanksicherung. Türen bleiben in beiden Fällen
  unverändert (README, Abschnitt „Gliederung wiederherstellen“).

**Was 1.3.0 bringt** (gegenüber 1.1)

- **Tür einsprechen:** im Türformular der Knopf „Einsprechen“. Alle
  Angaben zur Tür werden in einem Stück gesprochen, der Server lässt sie
  bei OpenAI erkennen und den Feldern zuordnen, das Werkzeug zeigt je Feld
  einen Vorschlag; übernommen wird nur, was bestätigt ist. Mit dem Befehl
  **„neue Tür“** in der Aufnahme werden mehrere Türen am Stück erfasst:
  jede wird dann ohne Rückfrage eingetragen, die erste in die geöffnete
  Tür, jede weitere als neue Tür im selben Bereich, und „Weiter
  einsprechen“ macht mit der nächsten weiter. Braucht einen
  OpenAI-Schlüssel in WordPress (Schritt 4) – ohne ihn bleibt der Knopf
  weg, sonst ändert sich nichts.
- **Mitarbeiter und Gruppen** als eigene Listen unter dem Schließplan.
  Beide werden nacheinander angelegt („Anlegen“ oder „Anlegen & neuer
  Mitarbeiter“ bzw. „Anlegen & neue Gruppe“), zugeordnet wird danach in
  der Gruppe oder beim angelegten Mitarbeiter.
  Eine Spalte im Plan ist eine Gruppe (alle Mitglieder berechtigt), ein
  einzelner Mitarbeiter oder eine Schließung mit Rang; Medien werden je
  Mitarbeiter geführt (mehrere Arten gleichzeitig). Bestehende Aufmaße
  werden beim Öffnen von selbst überführt.
- **Spalten verschieben** durch zwei Sekunden langes Drücken auf den
  Spaltenkopf und Ziehen – samt aller Kreuze darunter.
- **Blanko-Plan** legt nur noch den Generalhauptschlüssel und auf Wunsch
  je Gruppe und je Mitarbeiter eine Spalte an; alles Weitere benennt man
  selbst.
- **Kundenfreigabe:** je Link wird festgelegt, was der Kunde darf
  (Mitarbeiter pflegen, Gruppen anlegen, neue Spalten aufnehmen). Der
  Kunde sendet eine Rückmeldung oder gibt den Plan **verbindlich frei**;
  ein fertiger Plan lässt sich ihm auch nachträglich zur Freigabe
  vorlegen. Nach der Freigabe ist der Link für ihn gesperrt, das Werkzeug
  bleibt änderbar und zeigt den Vermerk (auch im PDF).
- **Türformular:** der Abschnitt „Zutritt und Anforderungen“ entfällt.
  Zylinder-Ausführungen: BSZ (beidseitig schließbar), beidseitig
  elektronisch, Monitoring, VdS, SKG mit Stufe. Beschlag-Optionen: BSZ,
  VdS, SKG mit Stufe.
- **PDFs:** Legende mit Gruppen und Mitgliedern, Materialliste mit Medien
  je Mitarbeiter und Summen je Medienart, Freigabe-Vermerk im Plan.
- **Anmeldung gehärtet:** ohne eingetragene Organisationsdomäne ist die
  Anmeldung gesperrt; der Google-Ausweis gilt genau einmal und höchstens
  zehn Minuten; neue Konten der Organisation können auf Wunsch erst nach
  Freigabe durch die Verwaltung zugelassen werden; die Drosseln zählen
  auch hinter einem Proxy des Hosters je Besucher.

**Zeitbedarf:** etwa 15 Minuten. **Ausfall:** keiner, die Aufmaße bleiben
unberührt, niemand muss sich neu anmelden.

**Reihenfolge einhalten:** zuerst das Plugin, dann der Ordner. Das neue
Werkzeug fragt den Server nach Wegen, die das alte Plugin noch nicht
kennt (Vorlegen, Freigeben); umgekehrt kommt das alte Werkzeug mit dem
neuen Plugin zurecht – bis auf Freigabe-Links, siehe unten.

---

## Vorab: zwei Dinge sichern

1. Den **alten Ordner `aufmasstool`** auf dem Webspace nicht löschen,
   sondern umbenennen (siehe Schritt 2). Dann lässt sich jederzeit
   zurückgehen.
2. Das **alte Plugin-ZIP** aufheben, falls vorhanden. Wer es nicht mehr
   hat, braucht es nur für einen Rückweg, der praktisch nie nötig ist.

Ein Datenbank-Backup legt Raidboxes ohnehin täglich an. Das neue Plugin
ändert an den vorhandenen Tabellen nichts Zerstörendes; es **ergänzt die
Tabelle `wp_aufmass_freigaben` um einige Spalten** (Rechte des Kunden,
Vorlage, Freigabe) – das erledigt WordPress beim ersten Aufruf von selbst
(`dbDelta`). Bestehende Zeilen bleiben.

---

## Schritt 1 — Plugin ersetzen (WordPress)

1. Im WordPress-Verwaltungsbereich: **Plugins → Installieren → Plugin
   hochladen**.
2. `aufmass-abgleich-plugin.zip` auswählen, **Jetzt installieren**.
3. WordPress erkennt, dass das Plugin schon vorhanden ist, und zeigt
   beide Fassungen nebeneinander. Auf **„Aktuelle durch hochgeladene
   ersetzen“** klicken.
4. Das Plugin bleibt dabei aktiv. Beim ersten Aufruf danach ergänzt es die
   Tabelle und übernimmt die Umschreibregel für den Kurzlink.

**Prüfen:** *Plugins* öffnen – bei „Aufmaß-Abgleich“ muss **1.5.5**
stehen. In der Zugangsliste gibt es jetzt die Spalte **„Schlüssel“**. Unter *Einstellungen → Aufmaß-Abgleich* muss neben der
Organisationsdomäne die neuen Zeilen **„Neue Zugänge“** und **„Herkunft
der Aufrufe“** erscheinen, weiter unten der Abschnitt **„Tür einsprechen
(OpenAI)“**. Fehlen sie, läuft noch die alte Fassung.

> **Nicht** das Plugin „Löschen“ und neu installieren: Löschen räumt die
> Einstellungen weg (Google-Client-ID, Domäne), die müssten danach neu
> eingetragen werden. Die Aufmaße selbst blieben zwar erhalten, aber der
> Umweg ist unnötig. Bietet WordPress den Knopf „ersetzen“ nicht an
> (nur bei sehr alten WordPress-Fassungen), stattdessen per SFTP den
> Inhalt von `wp-content/plugins/aufmass-sync/` mit dem Inhalt des
> ZIP-Ordners `aufmass-sync` überschreiben.

---

## Schritt 2 — Ordner `aufmasstool` austauschen (Webspace)

Der neue Ordner enthält dieselben Dateien wie der alte plus **zwei neue
Dateien**: `js/views-personen.js` (Mitarbeiter und Gruppen) und
`js/diktat.js` (Tür einsprechen). Deshalb immer
den ganzen Ordner tauschen, nie einzelne Dateien. Zwei Wege:

**Weg A, mit Rückweg (empfohlen):**

1. `aufmasstool.zip` auf dem Rechner entpacken → Ordner `aufmasstool`
   (27 Dateien plus `LIESMICH.txt`).
2. Per SFTP (FileZilla, Cyberduck) in das Wurzelverzeichnis der Website
   gehen – dort, wo `wp-admin/`, `wp-content/` und der bisherige Ordner
   `aufmasstool` liegen.
3. Den neuen Ordner als **`aufmasstool-neu`** hochladen.
4. Den bisherigen Ordner in **`aufmasstool-alt`** umbenennen.
5. `aufmasstool-neu` in **`aufmasstool`** umbenennen.

Zwischen Schritt 4 und 5 liegen ein paar Sekunden ohne Werkzeug – das
ist der einzige Moment, in dem jemand eine Fehlerseite sehen könnte.

**Weg B, direkt überschreiben:** den Inhalt des neuen Ordners über den
alten kopieren und beim Nachfragen „alle ersetzen“ wählen. Geht ohne
Umbenennen, aber ohne Rückweg.

**Wichtig:** immer **alle** Dateien ersetzen, nie nur einzelne. Die
Seite, der Service Worker (`sw.js`) und die Skripte gehören zusammen –
eine Mischung aus alt und neu lädt nicht. Fehlt `js/views-personen.js`,
bleibt der Schließplan leer; fehlt `js/diktat.js`, scheitert die
Vorbereitung für den Offline-Betrieb.

Per SSH geht es auch in einer Zeile im Wurzelverzeichnis:

```
unzip -o aufmasstool.zip && rm aufmasstool.zip
```

---

## Schritt 3 — Zwischenspeicher leeren

Raidboxes hält Seiten im Zwischenspeicher. Nach dem Hochladen im
Raidboxes-Dashboard der Box **„Cache leeren“** anklicken. Sonst bekommen
die Geräte unter Umständen noch die alte `index.html`.

Auf den Geräten selbst ist nichts zu tun. Beim nächsten Start mit Netz
holt das Werkzeug die neue Fassung direkt vom Server – am Browser-Cache
vorbei – und meldet sich dann:

- Auf der Projektübersicht startet es von selbst neu.
- Ist gerade ein Aufmaß geöffnet, erscheint oben ein gelber Hinweis
  „Eine neue Fassung des Werkzeugs ist geladen“ mit dem Knopf **Jetzt neu
  starten**. Der speichert und schließt zuerst; es geht nichts verloren.

Unter *Einstellungen → Über dieses Werkzeug* steht, welche Fassung auf
dem Gerät läuft (jetzt **1.5.5**), und ein Knopf **Auf neue Fassung
prüfen** stößt die Prüfung sofort an. Ein Gerät, das gerade ohne Netz
ist, arbeitet mit der alten Fassung weiter, bis es wieder online war –
auch das ist in Ordnung, die Aufmaße gleichen sich wie gewohnt ab.

> **Geräte, die noch auf der Fassung 1.1.0 oder älter hängen**, kennen
> den Hinweis noch nicht. Dort: Werkzeug ganz schließen und zweimal mit
> Netz öffnen. Der erste Start holt die neue Fassung, der zweite zeigt
> sie. Am Rechner genügt Strg+F5 (Mac: Cmd+Shift+R).

---

## Schritt 4 — Einstellungen einmal ansehen

**WordPress → Einstellungen → Aufmaß-Abgleich**

- *Organisationsdomäne:* muss eingetragen sein (`provision-infra.de`).
  **Neu: Ohne Domäne ist die Anmeldung gesperrt** – bisher war sie dann
  offen für jedes Google-Konto. Steht dort etwas, ändert sich nichts.
- *Neue Zugänge:* der Haken **„Neue Konten der Organisation erst nach
  Freigabe durch die Verwaltung zulassen“** ist aus (bisheriges
  Verhalten: jedes Konto der Organisation ist sofort dabei). Wer möchte,
  dass neue Kolleginnen und Kollegen erst freigeschaltet werden, setzt
  den Haken; der Zugang wird dann angelegt, bleibt aber gesperrt, bis er
  unter „Zugänge“ freigegeben wird. Die Betroffenen sehen beim Anmelden
  einen klaren Hinweis.
- *Herkunft der Aufrufe:* neue Zeile mit der Adresse, von der dieser
  Aufruf für den Server kommt. Fehlversuche bei der Anmeldung und Aufrufe
  der Kundenseite werden je Besucheradresse gedrosselt; sähe der Server
  statt der Besucher nur den Proxy des Hosters, teilten sich alle einen
  Zähler. **Probe:** die Einstellungsseite einmal vom Telefon über
  Mobilfunk öffnen. Steht dort eine andere Adresse als am Bürorechner,
  ist alles richtig, und der Haken **„hinter einem Proxy oder CDN“**
  bleibt aus. Steht von überall dieselbe Adresse, den Haken setzen.
  Kommt der Aufruf aus einem internen Netz des Hosters, liest das Plugin
  das Kopffeld des Proxys ohnehin von selbst.
- *Kundenfreigabe:* Gültigkeit der Links (Vorgabe 30 Tage, 0 =
  unbegrenzt) und Benachrichtigung – unverändert. Die E-Mail heißt bei
  einer verbindlichen Freigabe jetzt „Verbindliche Freigabe des
  Schließplans …“.

- *Tür einsprechen (OpenAI):* neuer Abschnitt. Ohne Eintrag bleibt das
  Einsprechen ausgeblendet. Wer es nutzen will: bei OpenAI unter
  platform.openai.com ein Konto für die Schnittstelle mit kleinem
  Guthaben anlegen, unter *API keys* einen Schlüssel erzeugen, hier
  eintragen, speichern und **„Verbindung prüfen“** anklicken (kostenlos,
  holt nur die Modellliste). Das ChatGPT-Abo deckt die Schnittstelle
  nicht ab. Die Felder für Adresse und Modelle bleiben leer; Einzelheiten
  in `EINRICHTUNG.md`, Schritt 8.

**WordPress → Einstellungen → Permalinks**

Dort darf nicht „Einfach“ stehen – sonst lautet der Kurzlink
`/?aufmass_f=…` statt `/f/…` (beides funktioniert, das eine ist nur
länger). Einmal auf **„Änderungen speichern“** klicken, auch ohne etwas
zu ändern: Das übernimmt die Umschreibregel des Plugins auf jeden Fall.

---

## Schritt 5 — Durchprobieren (zehn Minuten)

1. `https://www.provision-infra.de/aufmasstool/` öffnen. Die Anmeldeseite
   mit dem Google-Knopf muss erscheinen; ganz unten steht die
   Werkzeug-Fassung 1.5.5. Anmelden. Oben rechts steht danach
   **„Abgeglichen“**, und unter *Einstellungen → Über dieses Werkzeug*
   stehen die Fassung des Werkzeugs und die des Server-Plugins (beide
   1.5.5). Unter *Schließplan* steht oben rechts der Umschalter
   **Kreuzschließplan | Europlan**. Darüber steht die neue Karte **„Zugang für Programme und
   Claude Code“**; ein Probeschlüssel lässt sich dort erzeugen und gleich
   wieder widerrufen.
2. Ein bestehendes Aufmaß öffnen → **Schließplan**. Unter der Matrix
   stehen jetzt **Mitarbeiter und Gruppen**: Die früheren Personen je
   Schließung sind zur Mitarbeiterliste geworden, benannte Gruppen zu
   Gruppen mit Mitgliedern. Die Spaltenköpfe zeigen die Medienzahl und
   die Art (Gruppe / Mitarb.). Einen Spaltenkopf **zwei Sekunden halten**
   und nach rechts ziehen – die Spalte wandert samt Kreuzen.
3. **Kundenfreigabe** öffnen. Eine Spalte antippen, unter „Was darf der
   Kunde außerdem?“ die Haken ansehen, **Freigabe-Link erzeugen**. Es
   erscheint ein kurzer Link `https://www.provision-infra.de/f/…`,
   darunter die Liste „Bisherige Freigabe-Links“ mit den Rechten.
4. Den Link in ein **privates Browserfenster** kopieren (dort ist niemand
   angemeldet – so sieht es der Kunde). Die Matrix muss laden, darunter
   die Listen. Ein freigegebenes Feld antippen, unten **Rückmeldung
   senden**, Namen eintragen, **Jetzt senden**. „Vielen Dank“ erscheint.
5. Zurück im Werkzeug: spätestens nach 15 Sekunden zeigt die Kopfzeile
   **„1 Rückmeldung“** und der Schließplan einen Hinweis. **Prüfen und
   übernehmen** → der Bericht nennt das Feld → **Verwerfen** (es war ja
   nur ein Versuch).
6. Im Dialog *Kundenfreigabe* den Knopf **„Plan zur verbindlichen
   Freigabe vorlegen“** drücken, den entstehenden Link wieder im privaten
   Fenster öffnen: Der Plan ist nur zur Ansicht, unten steht **„Plan
   verbindlich freigeben“**. Name und Funktion eintragen, Haken setzen,
   freigeben. Im Werkzeug erscheint „Verbindliche Freigabe des Kunden
   liegt vor“ → **Prüfen und übernehmen** → **Übernehmen**. Der Schließplan
   zeigt jetzt den grünen Freigabe-Vermerk; das private Fenster meldet
   nach dem Neuladen, dass der Plan freigegeben und gesperrt ist.
7. Im Postfach müssen zwei Benachrichtigungen liegen (ggf. Spam-Ordner):
   „Kundenrückmeldung …“ und „Verbindliche Freigabe des Schließplans …“.
8. Beide Probelinks im Dialog *Kundenfreigabe* **zurückziehen** und das
   Probe-Aufmaß, falls eigens angelegt, löschen – oder den Freigabe-
   Vermerk im Aufmaß einfach stehen lassen, wenn es ein Testaufmaß war.
9. Ist der OpenAI-Schlüssel eingetragen: eine Tür öffnen, auf
   **Einsprechen** tippen, das Mikrofon erlauben, einen Satz sprechen
   („Büro Empfang, Halbzylinder 35 10, DIN links“), Aufnahme beenden.
   Nach einigen Sekunden erscheint der Vorschlag mit dem verstandenen
   Text und den Feldern; **Übernehmen** schreibt sie in die Tür. Die Tür
   danach nicht speichern, wenn es nur eine Probe war. Für die Serie
   einmal „Büro Empfang, Halbzylinder 35 10. Neue Tür. Lager, DIN rechts“
   sprechen: Beide Türen entstehen im Bereich der geöffneten Tür; die
   Probetüren danach löschen.

Läuft alles bis hierher, ist die Aktualisierung fertig.

---

## Was mit Bestehendem passiert

- **Aufmaße, Fotos, Zuständigkeiten, Anmeldungen:** unverändert, nichts
  muss neu gemacht werden. Niemand wird abgemeldet.
- **Schließpläne aus 1.1:** werden beim ersten Öffnen überführt.
  Personen je Schließung → Mitarbeiterliste; Gruppen mit Mitgliedern →
  Gruppen; eine Schließung mit Einzelpersonen behält sie als Träger;
  von Hand gezählte Medien bleiben an der Spalte, die Art des Mediums
  wandert zu den Mitgliedern. Die Überführung ist auf allen Geräten
  gleich, daher entstehen beim Abgleich keine Konflikte. Es gehen keine
  Angaben verloren; bitte die Mitarbeiterliste einmal durchsehen – wer
  früher in zwei Schließungen namentlich stand, ist jetzt eine Person.
- **Türen:** Zutrittsseite und bauliche Anforderungen (Brandschutz,
  Fluchtweg, RC, VdS-Anforderung) werden nicht mehr erfasst und beim
  Öffnen entfernt; Türen, die nur deshalb „unvollständig“ waren, gelten
  jetzt als vollständig. „Not- und Gefahrenfunktion“ heißt jetzt „BSZ
  (beidseitig schließbar)“.
- **Freigabe-Links aus 1.1 (kurz und lang):** Sie wurden mit dem alten
  Datenmodell erzeugt. Die Kundenseite meldet bei ihnen „aus einer
  anderen Fassung“, und eine Rückmeldung dazu lässt sich nicht mehr
  übernehmen. Für laufende Abstimmungen deshalb **neue Links erzeugen**
  und dem Kunden senden. Rückmeldungen, die vor der Aktualisierung
  bereits übertragen und noch nicht geprüft waren, bitte vor Schritt 1
  prüfen – danach sind sie nicht mehr lesbar.
- **Anmeldung:** nichts zu tun, solange die Organisationsdomäne
  eingetragen ist. Wer die Freigabe neuer Zugänge einschaltet, muss
  künftig neue Kolleginnen und Kollegen unter „Zugänge“ freigeben.
- **Tür einsprechen:** nichts zu tun. Ohne OpenAI-Schlüssel gibt es den
  Knopf nicht; alles Übrige verhält sich wie bisher.
- **Pipedrive:** unverändert.

---

## Wenn etwas nicht geht

**Nach dem Austausch bleibt die Seite bei „Anwendung wird geladen …“
oder der Schließplan ist leer**
Alte und neue Dateien sind gemischt (meist fehlt `js/views-personen.js`),
oder der Zwischenspeicher liefert noch alte Dateien. Alle Dateien erneut
hochladen, Cache leeren, Seite mit Strg+F5 (Mac: Cmd+Shift+R) neu laden.

**„Der Abgleich ist noch nicht eingerichtet: Es fehlt die
Organisationsdomäne“**
Unter *Einstellungen → Aufmaß-Abgleich* die Domäne eintragen und
speichern. Bis dahin kann sich niemand anmelden – das ist beabsichtigt.

**„Dieser Ausweis wurde bereits verwendet“ oder „Der Ausweis ist zu alt“**
Einfach erneut auf den Google-Knopf tippen; es entsteht ein frischer
Ausweis. Die Meldung erscheint nur, wenn derselbe Ausweis ein zweites Mal
vorgezeigt wird oder zwischen Google und dem Werkzeug mehr als zehn
Minuten vergangen sind (etwa nach einem Wechsel in eine andere App).
Zeigt ein Gerät sie dauerhaft, geht seine Uhr falsch.

**„Ihr Zugang wurde angelegt und muss von der Verwaltung erst freigegeben
werden“**
Die Freigabe neuer Zugänge ist eingeschaltet. Eine Person mit Verwaltung
gibt den Zugang unter *Einstellungen → Aufmaß-Abgleich → Zugänge* frei.

**Der Knopf „Einsprechen“ fehlt im Türformular**
Entweder ist kein OpenAI-Schlüssel in WordPress eingetragen (Schritt 4),
das Gerät ist nicht angemeldet oder ohne Netz, oder der Browser kann
nicht aufnehmen. Unter *Einstellungen → Tür einsprechen* im Werkzeug
steht, woran es liegt.

**„Das Mikrofon ist für diese Seite nicht freigegeben“**
Im Browser den Zugriff erlauben: am iPad unter *Einstellungen → Safari →
Mikrofon* beziehungsweise über das „aA“-Menü in der Adresszeile; am
Rechner über das Schlosssymbol in der Adresszeile.

**„OpenAI nimmt den hinterlegten Schlüssel nicht an“**
Der Schlüssel ist falsch, widerrufen oder gehört zu einem anderen
Projekt. In WordPress neu eintragen und „Verbindung prüfen“.

**„OpenAI nimmt gerade keine Anfragen an“**
Das Guthaben bei OpenAI ist aufgebraucht oder das Kontingent erreicht.
Unter platform.openai.com → Billing nachsehen.

**Der Google-Knopf erscheint nicht**
Browser-Konsole öffnen (F12 → Console). Steht dort eine Meldung mit
„Content Security Policy“ und „accounts.google.com“, bitte den Wortlaut
weitergeben.

**Der Kunde sieht „Der Link stammt aus einer anderen Fassung“**
Das ist ein Link aus 1.1. Einen neuen Link erzeugen (siehe „Was mit
Bestehendem passiert“).

**„Zu diesem Link wartet noch eine Rückmeldung“ beim Vorlegen**
Erst die wartende Rückmeldung prüfen (übernehmen oder verwerfen), dann
vorlegen – sonst ginge sie stillschweigend unter.

**Der Kurzlink zeigt die 404-Seite von WordPress**
*Einstellungen → Permalinks → Änderungen speichern* (Schritt 4).

**Keine E-Mail**
Spam-Ordner prüfen. Kommt dauerhaft nichts an, ein SMTP-Plugin
(z. B. „WP Mail SMTP“) mit dem Firmenpostfach einrichten. Die Rückmeldung
selbst liegt unabhängig davon im Werkzeug.

**Die Kopfzeile sagt „Offline“, obwohl die Website läuft**
Entweder wird `/wp-json/` zwischengespeichert (Cache leeren, Ausnahme
einrichten) oder ein Sicherheits-Plugin sperrt die WordPress-
Schnittstelle für Besucher. Dann im Sicherheits-Plugin eine Ausnahme für
`aufmass/v1` eintragen.

**Ein Gerät zeigt weiter die alte Fassung**
Es war noch nicht mit Netz online. Einmal mit Verbindung starten, bei
Bedarf schließen und erneut öffnen.

---

## Rückweg

1. Auf dem Webspace `aufmasstool` in `aufmasstool-neu` und
   `aufmasstool-alt` zurück in `aufmasstool` umbenennen.
2. In WordPress das alte Plugin-ZIP hochladen und „Aktuelle durch
   hochgeladene ersetzen“ wählen.
3. Cache leeren.

Die ergänzten Tabellenspalten bleiben dabei stehen und stören die alte
Fassung nicht. Aufmaße, die mit 1.3.x geöffnet und gespeichert wurden,
tragen bereits das neue Datenmodell; die alte Fassung zeigt bei ihnen
Spalten ohne Personen – deshalb den Rückweg nur unmittelbar nach der
Aktualisierung gehen, bevor damit gearbeitet wurde.
