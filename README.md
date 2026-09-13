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
| `test-pdf.js` | Textmetrik, WinAnsi-Kodierung, Zeilenumbruch, xref-Offsets, Stream-Längen, JPEG-Parser |
| `test-robustheit.js` | leere und fehlerhafte Projekte, Grenzwerte, 300 Türen × 40 Schließungen, verwaiste Matrixeinträge, Importfehler |
| `test-reports.js` | Erzeugung aller PDF-Ausgaben inklusive Randfälle |
| `test-e2e.js` | vollständiger Durchlauf im echten Browser: Projekt anlegen, Struktur, Türen, Matrix, PDF-Download, Neuladen, Import, iPad- und Telefonbreite |
| `test-standalone.js` | Einzeldatei aus `dist/`: startet per `file://`, stellt nachweislich keine einzige Netzanfrage |
| `test-downloads.js` | zweiter Ausgabeweg: Übergabe an eine bereitgestellte Speicherfunktion, Ablehnung durch den Betrachter, Größenfehler |

Die Browser-Tests laufen gegen Chromium über Playwright.

## Hinweis zur fachlichen Verantwortung

Die Plausibilitätsprüfung weist auf fehlende Angaben und auf Widersprüche hin
(etwa Fluchtweg-Kennzeichnung ohne Panikschloss). Sie ersetzt keine fachliche
Prüfung. Zylinderlängen, Beschläge sowie Brandschutz- und
Fluchtweganforderungen sind vor Bestellung gegen die tatsächlichen Türmaße und
die geltenden Vorgaben zu prüfen.
