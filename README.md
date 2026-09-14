# Aufmaß-Tool für Schließanlagen und Zutrittslösungen

Werkzeug zur Aufnahme von Türaufmaßen beim Kunden vor Ort und zur Erstellung
des Schließplans im Büro. Läuft vollständig im Browser – ohne Server, ohne
Installation und ohne Internetverbindung.

## Was das Werkzeug kann

* **Aufmaß vor Ort** – alle für Schließanlagen relevanten Angaben je Tür,
  inklusive Fotos direkt aus der iPad-Kamera
* **Gliederung** nach Standort → Gebäude → Etage/Bereich; die Reihenfolge
  bestimmt die Gruppierung in allen PDF-Ausgaben
* **Kreuzschließplan** – Zutrittsmatrix Türen × Schließungen, direkt auf dem
  Aufmaß aufbauend
* **PDF-Ausgaben** auf Knopfdruck: Türliste (kompakt und ausführlich),
  Kreuzschließplan, Materialliste, Prüfprotokoll
* **Projektdatei** zum Austausch zwischen iPad und Büro-Rechner

Alle Daten verbleiben auf dem jeweiligen Gerät. Es findet keinerlei
Datenübertragung statt.

## Aufbau der Türangaben

Jede Angabe wird **genau einmal** erfasst. Was sich aus einer anderen Angabe
ergibt, wird nicht erneut gefragt:

### Die Schließanlage gilt für das ganze Projekt

Unter *Stammdaten → Schließanlage* wird einmal festgelegt:

* **Art der Anlage**: Mechanik, Elektronik oder Hybrid
* **das System** je Technologie (bei Hybrid beide)

An der einzelnen Tür wird das System **nicht erneut gewählt**. Nur bei einer
Hybridanlage steht dort noch eine Frage: ob diese Tür mechanisch oder
elektronisch ausgeführt wird. Das zugehörige System ergibt sich daraus
(`Model.tuerSystemId`).

Für den Ausnahmefall gibt es je Tür das Feld *Besonderheit zu dieser Tür* —
etwa für ein Fremdfabrikat im Bestand. Es bleibt leer, solange nichts abweicht.

| Angabe | Wo sie erfasst wird | Was daraus folgt |
|---|---|---|
| Art der Anlage und System | *Stammdaten → Schließanlage* | gilt für alle Türen; die Technologie folgt daraus |
| Ausführung der Tür | nur bei Hybridanlage im Abschnitt *Anlage* | bestimmt, welches der beiden Systeme für diese Tür gilt |
| Zylinder-Bauform | Abschnitt *Bauteile* | Doppelzylinder, Halbzylinder, Knaufzylinder … – ohne Technologie im Namen |
| Zylinder-Ausführung | Abschnitt *Bauteile* | Freidreh, Comfort, Anti-Panik, Wetterschutz, Not- und Gefahrenfunktion – jede einzeln anklickbar |
| Knaufseite (vom mech. festen Knauf) | nur bei Bauform „Knaufzylinder" | beim Doppelknaufzylinder ist sie bereits bestimmt |
| Sicherheitsklasse | nur bei Beschlag-Bauform „Schutzbeschlag" | ES0 bis ES3 |
| Bauliche Anforderungen | Abschnitt *Zutritt und Anforderungen* | Brandschutz, Rauchschutz, Fluchtweg, RC, VdS |

Die Systemkomponenten enthalten nur noch Bauteile, die es sonst nirgends gibt
(Wandleser, Netzwerkknoten, Programmiergeräte). Zylinder, Beschlag und Schloss
werden ausschließlich im Abschnitt *Bauteile* erfasst.

Widersprüche werden **gemeldet statt doppelt abgefragt**: Ist eine Tür als
Flucht- und Rettungsweg gekennzeichnet, das Schloss hat aber keine
Panikfunktion, erscheint ein Hinweis direkt im Formular und im Prüfprotokoll.

Aufmaße aus der früheren Fassung werden beim Öffnen automatisch überführt:
„Elektronikzylinder Freidreh / Komfort" wird zu Bauform „Doppelknaufzylinder"
plus Ausführung „Freidreh". Trug früher jede Tür ihr eigenes System, wird
daraus die Anlage des Projekts erschlossen (das je Technologie häufigste
System); weicht eine einzelne Tür davon ab, bleibt der Hinweis als
*Besonderheit zu dieser Tür* erhalten. Es gehen keine Angaben verloren.

## Projekt öffnen und schließen

Die Anwendung startet auf der Projektübersicht, **ohne** ein Projekt zu öffnen.
Gearbeitet wird erst nach einem Klick auf *Öffnen*. Der Wechsel zurück zur
Übersicht sichert das Projekt und schließt es wieder. So wird nie
versehentlich im falschen Aufmaß gearbeitet.

## Arbeitsschritte zurücknehmen

Innerhalb eines Projekts steht in der Kopfzeile ein **Zurück-Knopf**, der den
jeweils letzten Arbeitsschritt zurücknimmt – beliebig oft, bis zu
`Verlauf.MAX_SCHRITTE` Schritten. Der Knopf nennt, was zurückgenommen wird,
und zeigt, wie viele Schritte noch möglich sind. Am Rechner wirkt zusätzlich
Strg bzw. Cmd + Z.

Erfasst werden alle Arbeitsschritte: Türen anlegen, ändern, duplizieren und
löschen, Struktur bearbeiten, Schließungen und Berechtigungen, der Blanko-Plan
sowie Eingaben in den Formularen. Laufende Texteingaben werden zu einem
Schritt zusammengefasst, damit nicht jeder Tastendruck einen eigenen erzeugt.

Fotos würden einen solchen Verlauf sprengen. Sie werden deshalb ausgelagert
und je Bild nur einmal gehalten (`src/js/verlauf.js`): 20 Schritte mit einem
200-KB-Foto belegen rund 227 KB statt 4 MB. Beim Schließen des Projekts wird
der Verlauf verworfen.

## Pipedrive-Anbindung

Unter *Einstellungen → Pipedrive* wird ein Zugriffsschlüssel (API-Token)
hinterlegt und die Pipeline gewählt, aus der Aufmaße entstehen sollen.
Danach erscheint in der Projektübersicht *Aus Pipedrive*: Das Werkzeug listet
die offenen Deals, und ein Tippen legt daraus ein Aufmaß an. Übernommen
werden Firmenname und Adresse der Organisation sowie Name, Telefon und E-Mail
des Ansprechpartners; Deal und Organisation bleiben im Projekt verknüpft
(`projekt.pipedrive`), samt Link zurück zum Deal.

**Das Werkzeug liest ausschließlich.** Es stellt nur GET-Abfragen und
verändert in Pipedrive nichts.

### Wann ein Aufmaß entsteht

Angeboten wird ein Deal genau dann, wenn alle vier Bedingungen zutreffen
(`Pipedrive.istZuUebernehmen`):

1. Er steht in der festgelegten **Pipeline** (z. B. Neukunden Funnel),
2. in der festgelegten **Phase** (z. B. Workshop / Aufmaß v.O.),
3. sein Status ist **offen** (weder gewonnen noch verloren),
4. und es liegt **noch kein Aufmaß** zu diesem Deal vor.

Ob der Deal dort neu angelegt oder hineingeschoben wurde, spielt keine
Rolle – maßgeblich ist, wo er jetzt steht. Damit ist derselbe Fall abgedeckt,
den eine spätere Automatik über einen Webhook behandeln würde: Die Regel ist
eine Funktion ohne Seiteneffekte und lässt sich unverändert weiterverwenden.

Deals, zu denen bereits ein Aufmaß besteht, erscheinen nicht in der Liste,
sondern aufklappbar darunter – von dort lässt sich das vorhandene Aufmaß
öffnen oder bewusst ein weiteres anlegen.

### Wenn kein Deal angeboten wird

Für diesen Fall gibt es einen Prüfbericht: *Einstellungen → Pipedrive →
Deals prüfen*, und derselbe Bericht auch im Dialog *Aus Pipedrive*, sobald
dort nichts zur Übernahme steht. Er liest die offenen Deals **ohne**
Pipeline- und Phasenfilter und zeigt zu jedem, in welcher Pipeline und Phase
er tatsächlich steht und woran die Regel scheitert. Damit wird die häufigste
Ursache sofort sichtbar: Der Deal steht in einer anderen Phase als
eingestellt, oder die gespeicherte Phase gehört gar nicht mehr zur
gespeicherten Pipeline. Der Bericht lässt sich als Text kopieren und
weitergeben; er enthält den Zugriffsschlüssel nicht.

Die Eingrenzung auf Pipeline und Phase wird zusätzlich im Werkzeug selbst
nachgeprüft. Sollte die Schnittstelle einen Filter einmal nicht beachten,
werden trotzdem nur passende Deals angeboten — und der Prüfbericht weist
auf die Abweichung hin.

### Zum Zugriffsschlüssel

Ein Pipedrive-API-Token gilt mit allen Rechten des Benutzerkontos und lässt
sich dort **nicht** auf reines Lesen beschränken. Er verbleibt ausschließlich
im Speicher des jeweiligen Geräts. `tests/test-pipedrive.js` weist nach, dass
er weder in ein Projekt, noch in eine Exportdatei, noch in einen Freigabe-Link
gelangt und nur im Kopf der Abfrage übergeben wird — nie in der Adresse, wo er
in Protokollen stehen bliebe. Geht ein Gerät verloren, ist der Token in
Pipedrive zurückzuziehen.

### Grenze: keine Automatik ohne Dienst

Ein Aufmaß entsteht, wenn Sie einen Deal auswählen — **nicht von selbst**,
sobald in Pipedrive ein Deal angelegt oder in die Phase geschoben wird. Der
Weg ist: *Projekte → Aus Pipedrive → Deal antippen*. Dafür müsste ein Webhook-Empfänger
dauerhaft laufen; eine Browser-Anwendung existiert nur, solange sie geöffnet
ist. Die Übernahme ist deshalb als reine Abbildung ohne Seiteneffekte gebaut
(`Pipedrive.aufProjektAbbilden`): Ein späterer Dienst kann dieselbe Funktion
mit denselben Daten verwenden, ohne dass etwas neu geschrieben werden muss.

Ob Pipedrive Abfragen unmittelbar aus dem Browser zulässt, hängt an dessen
CORS-Freigabe. Lehnt es ab, meldet das Werkzeug das verständlich; die übrigen
Funktionen bleiben davon unberührt. In diesem Fall wäre ein kleiner
Zwischendienst nötig.

## Matrix vom Kunden ausfüllen lassen

Unter *Schließplan → Kundenfreigabe* entsteht ein Link, den der Kunde im
Browser öffnet. Er sieht die vollständige Matrix, kann aber nur die Felder
anklicken, die zuvor freigegeben wurden – alle übrigen sind schraffiert und
gesperrt. Freigeben lässt sich spaltenweise je Schließung, wahlweise
beschränkt auf noch leere Felder. Hinweis und Rückmeldefrist werden mitgegeben.

Seine Rückmeldung kommt als Datei oder als Textschlüssel zurück und wird
unter *Schließplan → Rückmeldung* eingelesen. Übernommen werden ausschließlich
Felder, die tatsächlich freigegeben waren; eine veränderte Rückmeldung kann
keine gesperrten Berechtigungen setzen. Die Übernahme lässt sich über den
Zurück-Knopf rückgängig machen.

**Es gibt dafür keinen Server.** Die Plandaten stehen im Anker (`#`) der
Adresse – dieser Teil einer Adresse wird von Browsern niemals an einen Server
gesendet. Die Aufmaßdaten verlassen damit weder Ihr Gerät noch das des Kunden.
Zwei Dinge folgen daraus:

* Der Link ist lang (bei rund 150 Feldern etwa 3.500 Zeichen, bei 3.400
  Feldern etwa 17.000). Die Anwendung warnt, wenn er sehr lang wird; er lässt
  sich dann auch als Datei versenden.
* Der Rückweg ist nicht automatisch: Der Kunde sendet Datei oder Schlüssel
  zurück. Die Rückmeldung enthält nur die Abweichungen und bleibt kurz.
* Die Anwendung muss dafür über eine Web-Adresse laufen (siehe iPad-Abschnitt);
  aus einer lokal geöffneten Datei heraus weist der Dialog darauf hin.

## Bedienung auf der Baustelle

Das Werkzeug ist auf die Bedienung mit einer Hand bzw. einem Finger ausgelegt.
`tests/test-bedienung.js` misst das nach und lässt keine Abweichung durch:

* jedes Bedienelement ist mindestens 44 px hoch
* Eingabefelder haben mindestens 16 px Schrift – darunter zoomt iOS beim
  Antippen in das Feld hinein
* die häufigste Aktion je Ansicht liegt als schwebender Knopf im unteren
  Fünftel (Daumenzone)
* die Aktionen im Formular stehen unten und bleiben beim Blättern sichtbar
* auf dem Telefon wandert die Navigation an den unteren Rand
* Matrixzellen sind 48 × 48 px groß

Das unter *Einstellungen* hinterlegte Logo erscheint auch in der Kopfzeile der
Anwendung, zusammen mit dem Firmennamen.

## Schließplan als Blanko-Plan

Unter *Schließplan → Blanko-Plan erzeugen* entsteht aus der Gliederung ein
vollständiger Plan als Arbeitsgrundlage: ein Generalhauptschlüssel, je Gebäude
ein Hauptschlüssel, je Bereich ein Gruppenschlüssel und auf Wunsch je Tür eine
Einzelschließung – die Berechtigungen werden gleich mitgesetzt. Vorab wird
angezeigt, wie viele Schließungen entstehen.

## Materialliste als Bestellgrundlage

Die Materialliste führt je Position Art, Bezeichnung, Maß, Ausführung, Menge
und die zugehörigen Türen. Gleiche Bauteile werden zusammengefasst, bei
unterschiedlichem Maß oder unterschiedlicher Ausführung aber getrennt gehalten
– die Zeile ohne Zusatz wird dann ausdrücklich als *Standardausführung*
benannt, damit zwei ähnliche Zeilen nicht wie eine Doppelung wirken.

`tests/test-exportlisten.js` prüft mit 19 Nachweisen, dass keine Position
doppelt erscheint, kein Bauteil über zwei Wege in die Liste gelangt und die
Mengen mit dem Aufmaß übereinstimmen. Artikelnummern und Preise sind bewusst
nicht enthalten.

## Unterstützte Systeme

**Elektronik:** EVVA AirKey · EVVA Xesar · SimonsVoss MobileKey ·
SimonsVoss System 3060 · SimonsVoss System AX · Keyota · Nuki

**Mechanik (EVVA):** 4KS · 3KS plus · MCS · ICS · EPS · Dual · A5 · FPS ·
AirKey kombiniert

Fehlende Varianten lassen sich unter *Einstellungen → Eigene Katalogeinträge*
ergänzen; die Komponentenlisten der Systeme sind bewusst als Arbeitsgrundlage
angelegt und im Quelltext (`src/js/catalog.js`) an den eigenen Lieferumfang
anpassbar.

## Nutzung

### Die Einzeldatei — der einfachste Weg

`dist/aufmass-tool.html` enthält das gesamte Programm. Sie lässt sich auf
jedem Weg öffnen und braucht keine Einrichtung:

* per Doppelklick vom Rechner
* aus einem Ordner heraus auf jedem Gerät
* auf eine Website gelegt und über deren Adresse aufgerufen
* per `<iframe>` in eine bestehende Seite eingebettet

In allen vier Fällen geprüft (`tests/test-ueberall.js`): keine Netzanfrage,
Daten bleiben nach dem Neuladen erhalten, PDF-Erzeugung funktioniert.

### Auf dem iPad (vor Ort)

Zwei Wege, beide voll offline-fähig:

1. **Als App vom Server:** Seite in Safari öffnen → Teilen-Symbol →
   *Zum Home-Bildschirm*. Die Anwendung startet danach wie eine App und
   funktioniert ohne Netz (Service Worker legt sie im Gerät ab).
2. **Als Einzeldatei:** `dist/aufmass-tool.html` in *Dateien* ablegen und von
   dort öffnen. Diese Datei enthält das gesamte Programm und braucht nichts
   weiter.

### Am Rechner (Büro)

`src/index.html` im Browser öffnen, oder `dist/aufmass-tool.html` per
Doppelklick. Für die gehostete Fassung:

```
npm start        # lokaler Webserver auf http://localhost:8080
```

### Dateiausgabe

Die Anwendung erkennt selbst, wie sie ausgeliefert wird, und wählt den
passenden Weg für PDF- und Projektdateien:

* lokal geöffnet oder von einem Webserver → üblicher Browser-Download
* in einer eingebetteten Umgebung, die eigene Downloads unterbindet →
  die dort bereitgestellte Speicherfunktion (der Betrachter bestätigt
  Dateiname und Größe)

### Datenaustausch iPad ↔ Büro

*Export → Projekt exportieren* erzeugt eine `.json`-Datei. Diese per AirDrop,
Mail oder Cloud auf das andere Gerät bringen und dort über
*Projekte → Projekt importieren* einlesen. Ohne Fotos wird die Datei
deutlich kleiner.

## Aufbau

```
src/
  index.html              Einstiegsseite
  css/app.css             Gestaltung (Touch-tauglich, heller und dunkler Modus)
  js/catalog.js           Fachlicher Stammdaten-Katalog (Systeme, Zylinder, …)
  js/model.js             Datenmodell, Migration, Plausibilitätsprüfung
  js/pdf.js               Eigener PDF-Writer (ohne Fremdbibliothek)
  js/reports.js           Die vier PDF-Ausgaben
  js/store.js             Speicherung (IndexedDB), Export/Import, Fotos
  js/verlauf.js           Rücknahme von Arbeitsschritten
  js/freigabe.js          Kundenfreigabe der Matrix (Kodierung)
  js/pipedrive.js         Pipedrive-Anbindung (ausschließlich lesend)
  freigabe.html           Seite, die der Kunde über den Link öffnet
  js/app.js               Grundgerüst der Oberfläche, Autospeicherung
  js/views-*.js           Die einzelnen Ansichten
  js/main.js              Navigation und Start
  sw.js                   Offline-Bereitstellung
tools/build.js            Erzeugt die eigenständige Einzeldatei
tools/build-artifact.js   Erzeugt die Fassung für die gehostete Veröffentlichung
tests/                    Testreihen (siehe unten)
dist/aufmass-tool.html    Eigenständige Fassung (aus `npm run build`)
```

### Warum ein eigener PDF-Writer?

Das Aufmaß entsteht im Keller, in der Tiefgarage, im Rohbau – also genau dort,
wo keine Verbindung besteht. Eine über ein CDN nachgeladene PDF-Bibliothek
wäre in dem Moment nicht verfügbar, in dem sie gebraucht wird. `src/js/pdf.js`
erzeugt PDF 1.4 vollständig lokal: Helvetica in WinAnsi-Kodierung (deutsche
Umlaute korrekt), Tabellen mit Seitenumbruch, gedrehte Spaltenköpfe und
JPEG-Einbettung für die Türfotos.

## Tests

```
npm test              # alle Testreihen
npm run test:pdf      # nur PDF-Writer
npm run test:e2e      # nur Browser-Durchlauf
```

Die Testreihen prüfen:

| Reihe | Umfang |
|---|---|
| `test-entdoppelung.js` | kein Begriff steht in zwei Auswahllisten, keine Technologie in der Bauform, Überführung älterer Aufmaße |
| `test-pdf.js` | Textmetrik, WinAnsi-Kodierung, Zeilenumbruch, xref-Offsets, Stream-Längen, JPEG-Parser |
| `test-robustheit.js` | leere und fehlerhafte Projekte, Grenzwerte, 300 Türen × 40 Schließungen, verwaiste Matrixeinträge, Importfehler |
| `test-reports.js` | Erzeugung aller PDF-Ausgaben inklusive Randfälle |
| `test-e2e.js` | vollständiger Durchlauf im echten Browser: Projekt anlegen, Struktur, Türen, Matrix, PDF-Download, Neuladen, Import, iPad- und Telefonbreite |
| `test-standalone.js` | Einzeldatei aus `dist/`: startet per `file://`, stellt nachweislich keine einzige Netzanfrage |
| `test-ueberall.js` | Einzeldatei per Doppelklick, von einer Website und als Einbettung — je mit Datenerhalt nach dem Neuladen |
| `test-offline-pwa.js` | Laden über http, Netz trennen, Neustart ohne Verbindung, Erfassen und PDF-Erzeugung im Offline-Zustand |
| `test-downloads.js` | zweiter Ausgabeweg: Übergabe an eine bereitgestellte Speicherfunktion, Ablehnung durch den Betrachter, Größenfehler |

Die Browser-Tests laufen gegen Chromium über Playwright.

## Hinweis zur fachlichen Verantwortung

Die Plausibilitätsprüfung weist auf fehlende Angaben und auf Widersprüche hin
(etwa Fluchtweg-Kennzeichnung ohne Panikschloss). Sie ersetzt keine fachliche
Prüfung. Zylinderlängen, Beschläge sowie Brandschutz- und
Fluchtweganforderungen sind vor Bestellung gegen die tatsächlichen Türmaße und
die geltenden Vorgaben zu prüfen.
