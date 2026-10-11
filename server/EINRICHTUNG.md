# Aufmaß-Werkzeug online stellen

Diese Anleitung richtet das Werkzeug so ein, dass **alle Aufmaße auf allen
Geräten verfügbar sind** und Änderungen sich von selbst abgleichen.
Erreichbar wird es unter `https://www.provision-infra.de/aufmasstool/`.

Zum Anmelden ist ein **Google-Konto der eigenen Organisation** nötig.

Zeitbedarf: etwa 30 Minuten. Vorkenntnisse: FTP-Programm bedienen.

> **Wichtig vorweg:** Ich brauche zu keinem Zeitpunkt eure Zugangsdaten.
> Weder das Raidboxes-Passwort noch ein Google-Geheimnis. Alles, was
> einzutragen ist, tragt ihr selbst ein. Die Google-Client-ID ist
> öffentlich – sie steht ohnehin im Browser jedes Nutzers.

---

## Schritt 1 — Google-Anmeldung einrichten

Dafür werden Rechte als **Administrator der Google Workspace** gebraucht.

1. [console.cloud.google.com](https://console.cloud.google.com) öffnen und
   mit dem Geschäftskonto anmelden.
2. Oben links ein **neues Projekt** anlegen, z. B. `Aufmass-Werkzeug`.
3. Links **APIs & Dienste → OAuth-Zustimmungsbildschirm**:
   - Nutzertyp: **Intern** wählen.
     *Intern bedeutet: nur Konten der eigenen Organisation. Genau das ist
     gewollt – damit kommt kein fremdes Google-Konto auch nur bis zur
     Anmeldemaske.*
   - App-Name: `Aufmaß-Werkzeug`, Support-E-Mail: eure Adresse.
   - Autorisierte Domain: `provision-infra.de`
   - Speichern.
4. Links **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen →
   OAuth-Client-ID**:
   - Anwendungstyp: **Webanwendung**
   - Name: `Aufmaß-Werkzeug`
   - **Autorisierte JavaScript-Quellen** (beide Zeilen eintragen):
     ```
     https://www.provision-infra.de
     https://provision-infra.de
     ```
   - **Autorisierte Weiterleitungs-URIs:** leer lassen.
     *Dieses Verfahren braucht keine – deshalb auch kein Client-Geheimnis.*
   - Erstellen.
5. Es erscheint eine **Client-ID** in der Form
   `123456789-abcdefg.apps.googleusercontent.com`.
   **Diese Zeichenkette kopieren** – sie wird in Schritt 3 gebraucht.
   Das ebenfalls angezeigte *Client-Geheimnis* wird **nicht** benötigt;
   es darf nirgends eingetragen werden.

---

## Schritt 2 — Plugin installieren

**Der einfache Weg (kein FTP nötig):**

1. In WordPress: **Plugins → Installieren → Plugin hochladen**
2. Die Datei **`dist/aufmass-abgleich-plugin.zip`** auswählen
3. **Jetzt installieren**, danach **Aktivieren**

Beim Aktivieren legt das Plugin seine Tabellen selbst an.

<details>
<summary>Alternativ über SFTP</summary>

1. Im Raidboxes-Dashboard die Box öffnen → **SFTP**. Dort stehen Server,
   Benutzername und Passwort.
2. Mit einem FTP-Programm (z. B. [FileZilla](https://filezilla-project.org/),
   kostenlos) verbinden.
3. Den Ordner **`aufmass-sync`** aus `server/` vollständig in
   `wp-content/plugins/` hochladen. Danach muss es so aussehen:
   ```
   wp-content/plugins/aufmass-sync/aufmass-sync.php
   wp-content/plugins/aufmass-sync/uninstall.php
   wp-content/plugins/aufmass-sync/inc/…
   ```
4. In WordPress unter **Plugins** das Plugin **„Aufmaß-Abgleich"**
   aktivieren.

</details>

---

## Schritt 3 — Client-ID und Domäne eintragen

In WordPress: **Einstellungen → Aufmaß-Abgleich**

| Feld | Eintrag |
|---|---|
| Google-Client-ID | die Zeichenkette aus Schritt 1.5 |
| Organisationsdomäne | `provision-infra.de` |

Speichern.

> **Die Domäne ist die eigentliche Zugangssperre.** Bleibt das Feld leer,
> darf sich *jedes beliebige* Google-Konto anmelden. Der Server prüft bei
> jeder Anmeldung, dass das Konto zu dieser Organisation gehört – und
> zusätzlich, dass die Adresse auf `@provision-infra.de` endet.

---

## Schritt 4 — Das Werkzeug ablegen

1. Den Ordner **`dist/aufmasstool`** vollständig per SFTP in das
   **Wurzelverzeichnis** der Website legen (dorthin, wo auch
   `wp-content`, `wp-admin` und `wp-config.php` liegen).
2. Der Ordner muss danach `aufmasstool` heißen:
   ```
   /aufmasstool/index.html
   /aufmasstool/js/…
   /aufmasstool/css/app.css
   ```
3. Aufrufen: **https://www.provision-infra.de/aufmasstool/**

WordPress leitet Anfragen nur dann um, wenn die Datei nicht existiert –
ein echter Ordner wird direkt ausgeliefert. Es ist also keine Anpassung
an WordPress nötig.

---

## Schritt 5 — Erste Anmeldung

Die **erste Person, die sich anmeldet, bekommt automatisch die
Verwaltung.** Sie sollte also jemand sein, der die Zugänge freigeben
darf. Danach meldet sich der Rest des Teams an.

Unter **Einstellungen → Aufmaß-Abgleich** stehen dann alle Zugänge und
lassen sich einzeln sperren. **Sperren meldet sofort alle Geräte dieser
Person ab** – wichtig, wenn jemand ausscheidet oder ein iPad abhanden
kommt.

---

## Schritt 6 — Pipedrive (optional)

Bisher musste der Pipedrive-Zugriffsschlüssel auf **jedem** Gerät einzeln
eingetragen werden – und lag dort mit allen Rechten des Pipedrive-Kontos.
Jetzt genügt es, ihn **einmal** in WordPress zu hinterlegen:

1. In Pipedrive: **Einstellungen → Persönliche Einstellungen → API** –
   den Token kopieren.
2. In WordPress: **Einstellungen → Aufmaß-Abgleich → Pipedrive** – den
   Token eintragen, speichern.

Danach kann jedes angemeldete Gerät Aufmaße aus Deals anlegen, ohne dass
der Schlüssel das Gerät je erreicht. Der Server hängt ihn an die Abfragen
an; das Werkzeug sieht nur Pipedrives Antworten.

> **Wie der Schlüssel abgelegt ist:** verschlüsselt, und der Schlüssel
> dafür steckt in der `wp-config.php` – nicht in der Datenbank. Ein
> Datenbank-Backup allein verrät ihn also nicht.
> **Folge:** Werden die Salts in der `wp-config.php` jemals erneuert, ist
> der Token nicht mehr lesbar. Die Einstellungsseite sagt das dann klar,
> und er wird einfach neu eingetragen.

Geräte, auf denen noch ein Schlüssel liegt, bekommen in den Einstellungen
einen Hinweis und einen Knopf, ihn zu entfernen. Der Server hat Vorrang.

Die Einzeldatei (ohne Server) arbeitet weiter wie bisher mit dem Schlüssel
auf dem Gerät.

---

## Was danach gilt

**Alle sehen alles, ändern darf nur, wer zuständig ist.**
Die Zuständigkeit steht in den Stammdaten jedes Aufmaßes. Wer ein Aufmaß
anlegt, ist automatisch zuständig und kann weitere Personen eintragen.

**Ohne Netz geht es weiter.** Im Keller, in der Tiefgarage, im Neubau:
Das Werkzeug arbeitet unverändert auf dem Gerät. Sobald wieder Empfang
da ist, wird von selbst nachgeholt. Die Kopfzeile zeigt den Stand.

**Bei gleichzeitiger Arbeit wird zusammengeführt.** Zwei Leute an
verschiedenen Türen desselben Objekts stören sich nicht – das läuft
ohne Rückfrage zusammen. Nur wenn beide *dieselbe Angabe derselben Tür*
unterschiedlich eintragen, fragt das Werkzeug nach und zeigt beide
Fassungen nebeneinander.

**Fotos** werden einzeln übertragen und liegen geschützt unter
`wp-content/uploads/aufmass-fotos/`.

---

## Datenschutz

Ein Schließplan nennt Personen und ihre Zutrittsrechte. Das sind
personenbezogene Daten und zugleich sicherheitsrelevante Angaben über
fremde Gebäude.

- Die Daten liegen auf **eurem** Raidboxes-Server in Deutschland. Es
  kommt kein weiterer Anbieter hinzu, der Auftragsverarbeitungsvertrag
  mit Raidboxes deckt das mit ab.
- An Google geht **nichts** außer der Anmeldung selbst. Google erfährt,
  dass sich jemand angemeldet hat – nicht, woran gearbeitet wird.
- Die Fotos liegen außerhalb des öffentlich erreichbaren Bereichs und
  tragen zusätzlich einen nicht erratbaren Dateinamen.
- Ausscheidende Mitarbeiter: Zugang sperren (Schritt 5). Die Aufmaße
  bleiben, die Geräte sind sofort abgemeldet.

---

## Wenn etwas nicht geht

**„Der Abgleich ist auf dem Server noch nicht eingerichtet"**
Die Client-ID fehlt → Schritt 3.

**„Dieses Konto gehört nicht zu provision-infra.de"**
Es wurde ein privates Google-Konto verwendet. Mit dem Geschäftskonto
anmelden. Tritt es beim Geschäftskonto auf, ist in Schritt 1.3 nicht
„Intern" gewählt worden.

**Die Anmeldemaske erscheint gar nicht**
Die Adresse in Schritt 1.4 („Autorisierte JavaScript-Quellen") muss
*genau* mit der Adresse im Browser übereinstimmen – `www.` eingeschlossen.
Beide Schreibweisen eintragen.

**Die Kopfzeile sagt dauerhaft „Offline"**
Das Plugin ist nicht aktiv oder die Adresse stimmt nicht. Zum Prüfen im
Browser aufrufen:
`https://www.provision-infra.de/wp-json/aufmass/v1/start`
Dort muss eine kurze Antwort mit `eingerichtet: true` erscheinen.

**Es wird nichts abgeglichen, obwohl angemeldet**
Fast immer ein Zwischenspeicher. Unter Raidboxes den Seiten-Cache leeren.
Der Bereich `/wp-json/` darf nicht zwischengespeichert werden.

**„Der hinterlegte Schlüssel ist nicht mehr lesbar"** (Pipedrive)
Die Salts in der `wp-config.php` wurden geändert. Token in WordPress neu
eintragen – mehr ist nicht nötig.

---

## Für Techniker

- Schnittstelle: `/wp-json/aufmass/v1/` – Anmeldung über Google-ID-Token,
  danach eigene Sitzung in einem HttpOnly-Cookie (SameSite=Strict).
  Jede schreibende Anfrage verlangt zusätzlich das Kopffeld
  `X-Aufmass-Abgleich`.
- Der ID-Token wird serverseitig gegen Googles Schlüssel geprüft
  (RS256 über JWKS, dazu `iss`, `aud`, `exp`, `email_verified` und `hd`).
  „alg: none" und ein Verfahrenswechsel auf HMAC werden abgewiesen.
- Gleichzeitiges Speichern über Versionsnummern; bei Abweichung antwortet
  der Server mit `409` und legt seine Fassung bei. Das Gerät führt dann
  über einen Drei-Wege-Vergleich zusammen.
- Tabellen: `wp_aufmass_benutzer`, `_projekte`, `_zustaendig`, `_fotos`,
  `_sitzungen`.
- Pipedrive: `GET /wp-json/aufmass/v1/pipedrive/<weg>` für Angemeldete.
  Nur lesend, nur die sieben Wege, die das Werkzeug braucht (Positivliste
  in `inc/pipedrive.php`); Parameter werden auf Form geprüft, `limit`
  auf 500 gedeckelt. Der Token geht im Kopffeld mit, nie in der Adresse,
  und wird aus Pipedrives Antworten getilgt, falls er darin vorkommt.
  Ablage: XSalsa20-Poly1305 (sodium) bzw. AES-256-GCM, Schlüssel aus
  `AUTH_KEY`/`SECURE_AUTH_KEY` + Installationsgeheimnis.
- Prüfläufe: `npm test` (umfasst Server und Abgleich, PHP vorausgesetzt).
