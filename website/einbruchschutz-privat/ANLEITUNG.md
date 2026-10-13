# Unterseite „Einbruchschutz für Haus und Wohnung"

Unterseite für provision-infra.de zum Thema Einbruchschutz für Privatkunden
in Häusern und Wohnungen. Erscheinungsbild wie die Website: dunkler
Navy-Grund, Karten mit 16 px Rundung, goldene Pillen für die Hauptaktion,
kräftige Überschriften mit enger Laufweite.

## Die Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Vollständige Vorschau mit eigenem Kopf- und Fußbereich. Im Browser öffnen und ansehen. |
| `wordpress-inhalt.html` | Nur der Seiteninhalt samt Stil. Wird in WordPress eingefügt; Kopf, Fuß, Menü und Schrift kommen vom Theme der Website und passen damit exakt. |

`wordpress-inhalt.html` wird aus `index.html` erzeugt
(`node tools/website-wordpress.js`). Änderungen am Text immer in
`index.html` machen und danach neu erzeugen, damit beide Fassungen gleich
bleiben.

## In WordPress einfügen (Raidboxes)

1. WordPress-Backend öffnen: **Seiten → Erstellen**.
2. Titel: **Einbruchschutz für Haus und Wohnung**.
   Permalink auf `/einbruchschutz-privat/` setzen (oder nach Wunsch; dann
   die Links in dieser Anleitung entsprechend anpassen).
3. Im Block-Editor einen Block **„Individuelles HTML"** einfügen und den
   gesamten Inhalt von `wordpress-inhalt.html` hineinkopieren.
   Alternativ: oben rechts **⋮ → Code-Editor** öffnen und alles einfügen.
   Mit **Elementor**: Widget **„HTML"** auf die Seite ziehen und dort einfügen.
4. In den Seiteneinstellungen rechts:
   - **Template**: „Volle Breite" oder „Ohne Seitenleiste", falls das Theme
     eines anbietet. Die Seite bringt ihre eigene Breite mit.
   - **Seitentitel ausblenden**, falls das Theme die Option hat. Die Seite
     hat ihre eigene H1-Überschrift.
5. **Vorschau** ansehen. Kopfbereich, Fußbereich und Schrift stammen jetzt
   vom Theme, der Inhalt trägt die Website-Farben.
6. **Veröffentlichen** und die Seite ins Menü aufnehmen, zum Beispiel unter
   „Leistungen".

## Vor dem Veröffentlichen prüfen

Diese Angaben konnte ich nicht gegen die Website prüfen, weil die Umgebung
den Zugriff auf provision-infra.de nicht zulässt. Bitte kurz durchsehen:

**Links** (im Text mehrfach verwendet):

- `/kontakt/` für „Beratung anfragen" und „Beratungstermin anfragen"
- `/impressum/`, `/datenschutz/`, `/leistungen/` nur im Kopf und Fuß der
  Vorschau; in WordPress übernimmt das Theme diese Links.
- `info@provision-infra.de` als Kontaktadresse im Abschluss der Seite.

**Leistungsumfang** (Karten entfernen, was nicht angeboten wird):

- Alarmanlagen (DIN EN 50131)
- Video und Türkommunikation
- Außenlicht und Anwesenheitssimulation
- „Montage durch unsere Techniker" im Abschnitt Ablauf

**Zahlen und Aussagen:**

- „Fast jeder zweite Versuch scheitert": entspricht der Polizeilichen
  Kriminalstatistik der letzten Jahre (Versuchsanteil um 45 Prozent),
  deshalb bewusst ohne genaue Zahl formuliert.
- Steuer: 20 Prozent der Arbeitskosten, höchstens 1.200 Euro im Jahr
  (Handwerkerleistungen nach § 35a EStG). Stand bei Veröffentlichung prüfen.
- Zuschüsse: bewusst ohne Nennung eines Programms, weil sich Bedingungen
  und Verfügbarkeit ändern.
- Normen: DIN EN 1627 (RC 2), DIN 18257 (ES 1 bis ES 3), DIN 18104-1/-2,
  DIN 18252, DIN EN 356, DIN EN 50131.

## Woher das Erscheinungsbild stammt

Die Farbwerte sind aus Bildschirmaufnahmen der Website gemessen und liegen
im Aufmaß-Tool unter `src/css/app.css`:

| Rolle | Wert |
|---|---|
| Gold (Hauptaktion) | `#fcc91d` |
| Seitengrund | `#02092b` |
| Karte | `#0a1637` |
| Karte, zweite Ebene | `#131f40` |
| Navigationsleiste | `#252c44` |

Die Schrift der Website ist eine geometrische Grotesk; ihr Name ist im Repo
nicht festgehalten. In WordPress erbt die Seite die Schrift des Themes und
ist damit identisch. Für die Vorschau `index.html` steht die Variable
`--schrift` im Kopf der Datei: dort den Schriftnamen der Website eintragen.

## Direkt gegen die Website abgleichen

Sobald die Cloud-Umgebung die Domain erreichen darf, lässt sich die Seite
gegen die Live-Site prüfen und der Kopf- und Fußbereich der Vorschau exakt
nachbauen. Dazu in den Umgebungseinstellungen unter **Network access** die
Domain `provision-infra.de` (und `www.provision-infra.de`) zu den erlaubten
Domains hinzufügen. Zugangsdaten zu WordPress oder Raidboxes sind dafür
nicht nötig und sollten nicht im Chat geteilt werden.
