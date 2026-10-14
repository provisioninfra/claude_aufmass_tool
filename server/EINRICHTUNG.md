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
> ist die Anmeldung gesperrt – niemand kommt hinein, bis die Domäne
> eingetragen ist. Der Server prüft bei jeder Anmeldung, dass das Konto zu
> dieser Organisation gehört (Organisationsangabe im Ausweis von Google)
> – und zusätzlich, dass die Adresse auf `@provision-infra.de` endet.

---

## Schritt 4 — Das Werkzeug ablegen

Das Werkzeug besteht aus 26 normalen Dateien. Sie werden **nicht in
WordPress installiert**, sondern *neben* WordPress auf denselben Webspace
gelegt. Der Webserver liefert einen echten Ordner direkt aus und reicht
nur Anfragen an WordPress weiter, zu denen es keine Datei gibt – deshalb
braucht es weder eine WordPress-Seite noch eine Anpassung am Theme.

### Das Wurzelverzeichnis finden

Gemeint ist der Ordner, in dem WordPress selbst liegt. Er ist daran zu
erkennen, dass diese drei Einträge nebeneinander stehen:

```
wp-admin/        (Ordner)
wp-content/      (Ordner)
wp-config.php    (Datei)
```

Bei Raidboxes heißt er je nach Box `public_html`, `web`, `www` oder
`wordpress` – der Name ist egal, **maßgeblich ist die `wp-config.php`
darin**. Nach dem SFTP-Login landet man meist eine Ebene darüber.

Zugangsdaten: Raidboxes-Dashboard → Box → **SFTP**. FTP-Programm:
[FileZilla](https://filezilla-project.org/) (kostenlos) oder Cyberduck.
Protokoll SFTP, Port 22.

### Hochladen

**Weg 1 – Ordner per SFTP** (ohne SSH, für jeden machbar):

1. `dist/aufmasstool.zip` **auf dem eigenen Rechner** entpacken – heraus
   kommt ein Ordner `aufmasstool`. (Ein FTP-Programm kann auf dem Server
   nichts entpacken, deshalb vorher.)
2. Im FTP-Programm rechts ins Wurzelverzeichnis gehen.
3. Den **ganzen Ordner `aufmasstool`** hinüberziehen – den Ordner, nicht
   nur seinen Inhalt. Die Unterordner `js/` und `css/` kommen so mit.
4. Warten, bis die Warteschlange leer ist: 27 Dateien (26 plus
   `LIESMICH.txt`, die darf mit).

**Weg 2 – ZIP per SSH** (wer SSH ohnehin nutzt):

```
scp dist/aufmasstool.zip <benutzer>@<server>:~/
ssh <benutzer>@<server>
cd <wurzelverzeichnis>        # dort, wo wp-config.php liegt
unzip ~/aufmasstool.zip       # legt den Ordner aufmasstool an
```

### So muss es danach aussehen

```
<wurzelverzeichnis>/
├── wp-admin/
├── wp-content/
├── wp-config.php
└── aufmasstool/                      ← neu
    ├── index.html
    ├── freigabe.html
    ├── sw.js
    ├── manifest.webmanifest
    ├── icon.svg, icon-180.png, icon-192.png, icon-512.png
    ├── css/app.css
    └── js/…                          (17 Dateien)
```

Typische Fehler: Der Ordner heißt anders (`aufmasstool (1)`,
`Aufmasstool` – Groß-/Kleinschreibung zählt); nur der Inhalt wurde
hochgeladen und liegt lose neben `wp-config.php`; der Ordner liegt in
`wp-content/` statt im Wurzelverzeichnis. Dateirechte müssen nicht
angefasst werden.

### Prüfen

Drei Adressen im Browser, in dieser Reihenfolge:

1. `https://www.provision-infra.de/aufmasstool/js/abgleich.js`
   → JavaScript-Quelltext. Erscheint eine WordPress-Fehlerseite, liegt
   der Ordner am falschen Ort oder heißt anders.
2. `https://www.provision-infra.de/wp-json/aufmass/v1/start`
   → kurze Antwort mit `"eingerichtet":true`. Bei `false` fehlt die
   Client-ID (Schritt 3); bei einer Fehlerseite ist das Plugin nicht
   aktiv (Schritt 2).
3. `https://www.provision-infra.de/aufmasstool/`
   → die Anmeldeseite mit dem Google-Knopf.

### Zwei Dinge, die man leicht übersieht

**Immer dieselbe Adresse benutzen.** `www.provision-infra.de` und
`provision-infra.de` sind für den Browser zwei verschiedene Herkünfte –
mit getrennter Anmeldung und getrenntem Offline-Speicher. Eine festlegen
(die, auf die die Website ohnehin umleitet) und allen genau diese geben.

**Der erste Aufruf braucht Netz.** Dabei legt das Gerät alle Dateien für
den Offline-Betrieb ab; ab dann startet das Werkzeug auch ohne Empfang.

---

## Schritt 5 — Erste Anmeldung

Die **erste Person, die sich anmeldet, bekommt automatisch die
Verwaltung.** Sie sollte also jemand sein, der die Zugänge freigeben
darf. Danach meldet sich der Rest des Teams an.

Unter **Einstellungen → Aufmaß-Abgleich** stehen dann alle Zugänge und
lassen sich einzeln sperren. **Sperren meldet sofort alle Geräte dieser
Person ab** – wichtig, wenn jemand ausscheidet oder ein iPad abhanden
kommt.

**Wer sich anmelden darf – und wie das geprüft wird**

* Ausschließlich Google-Workspace-Konten der eingetragenen
  **Organisationsdomäne**. Der Server prüft beides: die
  Organisationsangabe (`hd`) im Ausweis von Google *und* die Adresse.
  Private Google-Konten (gmail.com) tragen keine Organisation und fallen
  heraus. **Ohne eingetragene Domäne ist die Anmeldung gesperrt** – nicht
  etwa offen.
* Das Kennwort bleibt bei Google; der Server sieht es nie. Google
  bestätigt die Anmeldung mit einem unterschriebenen Ausweis, den der
  Server gegen Googles aktuelle Schlüssel prüft (nur RS256; „alg: none“
  und andere Verfahren werden abgewiesen). Der Ausweis muss für genau
  diese Client-ID ausgestellt sein, darf höchstens zehn Minuten alt sein
  und gilt **genau einmal** – ein mitgelesener Ausweis eröffnet keine
  zweite Sitzung.
* Danach weist sich das Gerät über ein eigenes Sitzungscookie aus
  (HttpOnly, Secure, SameSite=Strict, 30 Tage); jede schreibende Anfrage
  braucht zusätzlich das eigene Kopffeld des Werkzeugs. Fehlversuche
  werden je Herkunft gedrosselt.
* Mit dem Haken **„Neue Konten der Organisation erst nach Freigabe durch
  die Verwaltung zulassen“** wird ein neues Konto zwar angelegt, bleibt
  aber gesperrt, bis es unter „Zugänge“ freigegeben wird. Ohne Haken ist
  jedes Konto der Organisation sofort dabei. Die erste Anmeldung erhält
  in jedem Fall die Verwaltung.
* Die Zeile **„Herkunft der Aufrufe“** zeigt, von welcher Adresse der
  Aufruf für den Server kommt. Die Drosseln zählen je Besucheradresse;
  sieht PHP nur eine interne Adresse des Hosters, liest das Plugin die
  Besucheradresse von selbst aus dem Kopffeld des Proxys. Steht der
  Proxy auf einer öffentlichen Adresse (CDN) – erkennbar daran, dass von
  jedem Gerät und Netz aus dieselbe Adresse angezeigt wird –, den Haken
  **„hinter einem Proxy oder CDN“** setzen. Bei direkter Verbindung
  bleibt der Haken aus: Ein Kopffeld, das ein Besucher selbst mitschickt,
  zählt dann nicht.

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

## Schritt 7 — Kundenfreigabe per Kurzlink

Der Kunde bekommt einen **kurzen Link**, zum Beispiel
`https://www.provision-infra.de/f/k7m2p9x4qa`. Er öffnet ihn im Browser,
trägt in den freigegebenen Feldern ein, wer welche Tür öffnen darf, pflegt
- soweit der Link es erlaubt - seine Mitarbeiter und Gruppen oder nimmt
neue Spalten auf, gibt seinen Namen an und klickt auf **Rückmeldung
senden** oder auf **Rückmeldung senden und Plan freigeben**. Mehr muss er
nicht tun - kein Konto, keine Datei, kein Zurückschicken.

Was der Kunde darf, legt die Person fest, die den Link erzeugt: welche
Spalten er bearbeiten darf, ob er Mitarbeiter pflegen, Gruppen anlegen
und neue Spalten aufnehmen darf. Die **verbindliche Freigabe** schließt
die Abstimmung ab: Danach ist der Link für den Kunden gesperrt, das
Werkzeug bleibt änderbar und zeigt den Vermerk. Ein fertiger Plan lässt
sich dem Kunden auch nachträglich zur Freigabe vorlegen (*Kundenfreigabe
→ Plan zur verbindlichen Freigabe vorlegen*); er sieht dann den aktuellen
Stand ohne Bearbeitung und klickt nur auf „Plan verbindlich freigeben“.

**Was dann passiert**

1. Der Server legt die Rückmeldung ab und schickt eine **E-Mail** an die
   Person, die den Link erzeugt hat, und an alle, die für das Aufmaß
   zuständig sind.
2. Im Werkzeug erscheint auf jedem zuständigen Gerät mit Internet oben in
   der Kopfzeile **„1 Rückmeldung"** und im Schließplan ein Hinweis.
3. **Prüfen und übernehmen** zeigt einen Bericht: welche Tür, welche
   Spalte, bisher → neu, dazu neue oder geänderte Mitarbeiter und
   Gruppen, neue Spalten, eine verbindliche Freigabe und die Anmerkung
   des Kunden. **Erst „Übernehmen" ändert das Aufmaß.** „Verwerfen" legt
   die Rückmeldung ab, ohne etwas zu ändern - eine verworfene Freigabe
   gilt nicht. Ohne Freigabe kann der Kunde jederzeit erneut übertragen;
   nach einer übernommenen Freigabe ist der Link für ihn gesperrt.

Der Link wird im Werkzeug unter *Schließplan → Kundenfreigabe* erzeugt.
Dort stehen auch alle bisherigen Links des Aufmaßes mit ihrem Zustand
(offen, wartet auf Prüfung, übernommen, zur Freigabe vorgelegt,
freigegeben, verworfen, abgelaufen), den eingeräumten Rechten, einem Knopf
**Zur Freigabe vorlegen** und einem Knopf **Zurückziehen**, der einen Link
sofort unbrauchbar macht.

**Einstellungen in WordPress** (*Einstellungen → Aufmaß-Abgleich →
Kundenfreigabe*): Gültigkeit der Links in Tagen (Vorgabe 30, 0 =
unbegrenzt) und ob die E-Mail verschickt wird.

**Voraussetzung für die kurze Form `/f/…`:** Die Permalinks dürfen nicht
auf „Einfach" stehen (*Einstellungen → Permalinks*). Steht dort „Einfach",
lautet der Link `https://www.provision-infra.de/?aufmass_f=k7m2p9x4qa` -
länger, aber ebenfalls gültig. Das Plugin übernimmt seine Umschreibregel
beim Aktivieren und bei jeder neuen Fassung von selbst.

> **Warum das sicher ist:** Der Code hat zehn Zeichen aus 31 (rund 50 Bit)
> und stammt aus dem Zufallsgenerator des Systems. Wer Codes rät, wird je
> Herkunftsadresse gedrosselt. Jeder Link läuft ab und lässt sich
> zurückziehen. Der Server prüft jede Antwort gegen die Freigabe: Nur
> Felder, die freigegeben waren, und nur Listen, für die der Link das
> Recht einräumt, werden angenommen - alles andere, auch eine erfundene
> Kennung, weist die ganze Antwort ab. Und ins Aufmaß kommt nichts ohne
> die Bestätigung einer zuständigen Person. Erledigte Freigaben werden
> nach 180 Tagen gelöscht.

Die Einzeldatei (ohne Server) erzeugt weiterhin den langen Link mit den
Daten im Anker; die Rückmeldung kommt dort wie bisher als Rückschlüssel.

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

**Kundenrückmeldungen warten auf eine Prüfung.** Sie erscheinen auf allen
zuständigen Geräten; wer zuerst übernimmt oder verwirft, erledigt sie für
alle. Niemand sonst kann sie übernehmen - auch nicht aus Versehen.

---

## Datenschutz

Ein Schließplan nennt Personen und ihre Zutrittsrechte. Das sind
personenbezogene Daten und zugleich sicherheitsrelevante Angaben über
fremde Gebäude. Deshalb gilt im Werkzeug: so wenig wie möglich ablegen,
nichts länger als nötig behalten, nichts an Dritte geben.

### Wo die Daten liegen

- Alles liegt auf **eurem** Raidboxes-Server in Deutschland. Es kommt kein
  weiterer Anbieter hinzu; der Auftragsverarbeitungsvertrag mit Raidboxes
  deckt das mit ab.
- An Google geht **nichts** außer der Anmeldung selbst. Google erfährt,
  dass sich jemand angemeldet hat – nicht, woran gearbeitet wird. Das
  Profilbild aus dem Google-Konto wird nicht gespeichert.
- Die Fotos liegen außerhalb des öffentlich erreichbaren Bereichs und
  tragen zusätzlich einen nicht erratbaren Dateinamen.
- Auf jedem angemeldeten Gerät liegt eine Offline-Kopie der Aufmaße im
  Browserspeicher. Deshalb: Gerätesperre mit Code, und bevor ein Gerät
  weitergegeben wird, im Werkzeug abmelden und die Website-Daten des
  Browsers löschen. Das Sperren eines Zugangs in WordPress beendet den
  Abgleich sofort, leert aber nicht den Speicher des Geräts.

### Was das Plugin speichert – und wie lange

| Daten | Inhalt | Bleibt |
|---|---|---|
| Zugänge | Google-Kennung, Name, E-Mail-Adresse, erste und letzte Anmeldung | bis der Zugang in WordPress gelöscht wird |
| Sitzungen | je Gerät eine Kennung; das Geheimnis nur als Prüfwert | 30 Tage, dann von selbst weg; Sperren beendet sie sofort |
| Aufmaße, Fotos, Zuständigkeiten | was im Werkzeug angelegt wird | bis zum Löschen im Werkzeug, danach 90 Tage im Papierkorb, dann endgültig |
| Kundenfreigaben | die Plandaten des Links (Türen, Spalten, Mitarbeiter und Gruppen des Kunden, Rechte) | bis der Link abläuft oder zurückgezogen wird – dann sofort entfernt |
| Rückmeldungen | Name und Anmerkung des Kunden, seine Eintragungen; bei einer Freigabe Name, Funktion und Zeitpunkt | bis eine zuständige Person sie übernommen oder verworfen hat, danach noch 180 Tage |
| Anmeldung | ein Abdruck jedes verwendeten Google-Ausweises (gegen Wiederverwendung) | bis der Ausweis bei Google abgelaufen wäre, höchstens rund eine Stunde |
| Drosselung | ein Zähler je Herkunft (gekürzter, gehashter Adressbereich – keine IP-Adresse) | 10 Minuten |

Die Fristen räumt ein täglicher WordPress-Zeitplan ab; er läuft, sobald
die Website besucht wird. Die Gültigkeit der Links lässt sich unter
*Einstellungen → Aufmaß-Abgleich* ändern; dieselbe Seite zeigt die
Aufbewahrung noch einmal an.

### E-Mails

Die Benachrichtigung über eine Rückmeldung geht an den Ersteller des
Links und alle Zuständigen des Aufmaßes. Sie nennt Kunde und Objekt, die
Zahl der Änderungen sowie den vom Kunden eingegebenen Namen und seine
Anmerkung – keine Berechtigungen und keine Inhaber. Wer das nicht
möchte, schaltet den Versand in den Einstellungen ab; die Rückmeldung
liegt in jedem Fall im Werkzeug.

### Was der Kunde sieht

Über seinen Link sieht der Kunde nur sein eigenes Aufmaß: die Türen,
alle Spalten des Plans, seine Mitarbeiter und Gruppen (es sind seine
eigenen Leute) und die Rechte, die der Link ihm einräumt. Er sieht keine
Zugänge, keine Namen eurer Mitarbeiter und keine anderen Aufmaße. Der Kurzlink taucht in den Zugriffsprotokollen des Hosters auf,
die Raidboxes nach eigener Regel aufbewahrt; wer das vermeiden will,
zieht den Link nach der Rückmeldung zurück – dann ist er wertlos.

### Ausscheidende Mitarbeiter

Unter *Einstellungen → Aufmaß-Abgleich → Zugänge* den Zugang **sperren**:
Alle Geräte dieser Person sind sofort abgemeldet, die Aufmaße bleiben.
Anschließend **löschen**: Name, Adresse, Sitzungen und Zuständigkeiten
dieser Person werden entfernt; die Aufmaße bleiben erhalten, „geändert
von“ zeigt dann ins Leere.

### Auskunft und Löschung

Fragt eine Person nach ihren Daten, stehen sie an drei Stellen: in der
Tabelle `wp_aufmass_benutzer` (Mitarbeiter), in `wp_aufmass_freigaben`
(Name und Anmerkung des Kunden in den Spalten `antwort_name` und
`antwort_anmerkung`) und in den Aufmaßen selbst (Inhaber der
Schließungen). Inhaber lassen sich im Werkzeug ändern oder entfernen, der
Abgleich trägt es auf den Server. Eine Rückmeldung verschwindet nach der
Frist oben von selbst; wer sie früher loswerden will, löscht die Zeile in
`wp_aufmass_freigaben`.

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

**Der Kurzlink `/f/…` zeigt die 404-Seite von WordPress**
Die Umschreibregel ist noch nicht übernommen. *Einstellungen →
Permalinks* öffnen und einmal auf „Änderungen speichern" klicken – das
genügt. Steht dort „Einfach", eine andere Struktur wählen.

**Der Kunde sieht „Dieser Freigabe-Link ist nicht mehr gültig"**
Der Link ist abgelaufen, wurde zurückgezogen oder das Aufmaß gelöscht.
Im Werkzeug einen neuen Link erzeugen.

**Keine E-Mail angekommen**
Erst den Spam-Ordner prüfen. WordPress verschickt über die Mailfunktion
des Servers; bleibt das unzuverlässig, hilft ein SMTP-Plugin (z. B.
„WP Mail SMTP") mit dem Postfach der Firma. Die Rückmeldung selbst ist
davon unabhängig – sie liegt in jedem Fall im Werkzeug.

**„Dieses Aufmaß liegt noch nicht auf dem Server"** beim Erzeugen des Links
Der Abgleich hat das Aufmaß noch nicht gesendet. Ein paar Sekunden warten
und erneut versuchen; die Kopfzeile zeigt, wann alles abgeglichen ist.

**Alles bleibt „Offline“, obwohl die Website läuft – und ein Sicherheits-Plugin ist aktiv**
Manche Sicherheits-Plugins (Wordfence, Solid Security, „Disable REST API“)
sperren die WordPress-Schnittstelle für nicht angemeldete Besucher. Das
Werkzeug braucht den Bereich `/wp-json/aufmass/v1/` **ohne** WordPress-
Anmeldung: Die Anmeldung läuft dort über Google, und der Kunde öffnet
seine Freigabe ohne jedes Konto. In dem Plugin eine Ausnahme für
`aufmass/v1` eintragen.

**Die Pipedrive-Anbindung vom Gerät aus meldet „keine Verbindung“, obwohl der Schlüssel stimmt**
Die Seite erlaubt Verbindungen nur zu `*.pipedrive.com` (siehe
„Sicherheit“ unten). Eine Pipedrive-Adresse außerhalb dieser Domäne
lässt sich nicht vom Gerät aus abfragen – dann den Schlüssel in WordPress
hinterlegen (Schritt 6), der Server übernimmt die Abfrage.

---

## Sicherheit – was gegen Angriffe von außen vorgesehen ist

- **Ohne Anmeldung erreichbar sind nur drei Dinge:** die Startauskunft
  (ob die Anmeldung eingerichtet ist), die Google-Anmeldung selbst und die
  Kundenfreigabe über ihren Code. Alles andere verlangt die Sitzung, und
  jede ändernde Anfrage zusätzlich ein eigenes Kopffeld, das fremde
  Seiten nicht setzen können. JSONP ist für die Schnittstelle abgeschaltet.
- **Sitzungen** liegen in der Datenbank (nur als Prüfwert), das Cookie ist
  HttpOnly, SameSite=Strict und nur für HTTPS bestimmt – auch hinter dem
  vorgeschalteten Proxy des Hosters. Sperren einer Person meldet alle ihre
  Geräte sofort ab.
- **Der Google-Ausweis** wird serverseitig gegen Googles Schlüssel geprüft
  (Unterschrift nur RS256, Aussteller, Client-ID samt `azp`, Ablauf,
  Ausstellungszeit – höchstens zehn Minuten alt –, bestätigte Adresse,
  Organisationsdomäne im `hd` *und* in der Adresse). Jeder Ausweis gilt
  genau einmal; ein zweites Vorzeigen wird abgewiesen. Ohne eingetragene
  Domäne ist die Anmeldung gesperrt. Fehlgeschlagene Anmeldungen werden
  je Herkunft gedrosselt (30 in zehn Minuten), Googles Schlüssel werden
  höchstens einmal je Minute neu geholt, damit niemand den Server mit
  erfundenen Ausweisen beschäftigt. Die Herkunft ist die Besucheradresse –
  hinter einem Proxy des Hosters die weitergereichte, nie ein Kopffeld,
  das ein Besucher bei direkter Verbindung selbst mitschickt.
- **Kundenfreigabe:** Code mit rund 50 Bit Zufall; je Herkunft werden
  unbekannte Codes (30), Aufrufe (120) und Übertragungen (12) in zehn
  Minuten gedrosselt, je Link höchstens 40 Übertragungen am Tag;
  IPv6-Adressen zählen als /64-Netz. Jede Antwort wird gegen die Freigabe
  geprüft und bereinigt abgelegt; nichts gelangt ohne Bestätigung einer
  zuständigen Person ins Aufmaß. Links laufen ab und lassen sich
  zurückziehen; die Plandaten eines toten Links werden sofort entfernt,
  der Rest nach 180 Tagen. Der Kurzlink leitet nur auf die eigene Website
  weiter.
- **E-Mails** sind reiner Text; was der Kunde eingegeben hat, ist darin
  als ungeprüft gekennzeichnet und gekürzt. Der Betreff kann keine
  Kopfzeilen einschleusen.
- **Die Seiten selbst** tragen eine Content-Security-Policy: Skripte nur
  aus dem eigenen Ordner (eingebettete über Prüfwert) und für die
  Anmeldung von Google, Verbindungen nur zur eigenen Website, zu Google
  und zu `*.pipedrive.com`, keine Einbettung fremder Inhalte. Wer eine der
  Seiten von Hand ändert, zieht die Prüfwerte mit `node tools/csp.js
  --schreiben` nach (`npm run build` tut das von selbst).
- **Fotos** liegen außerhalb des Webroots erratbarer Namen (Zufallsteil im
  Dateinamen, `.htaccess`, leere `index.html`) und werden nur an
  Angemeldete ausgeliefert, mit Prüfung der Bildart am Inhalt.
- **Pipedrive-Schlüssel** verschlüsselt mit einem Schlüssel aus der
  `wp-config.php`; die Weiterleitung kennt nur lesende Wege.

Was das Plugin nicht leisten kann: Kopfzeilen des Webservers (HSTS,
`X-Frame-Options`) setzt der Hoster. Bei Raidboxes ist HTTPS erzwungen;
HSTS lässt sich dort im Dashboard einschalten.

## Bei jeder neuen Fassung

Schritt für Schritt steht das in `server/AKTUALISIERUNG.md` (Plugin
ersetzen, Ordner tauschen, Cache leeren, durchprobieren, Rückweg).
Kurz: Den Ordner `aufmasstool` ersetzen und das Plugin-ZIP erneut
hochladen („Aktuelle durch hochgeladene ersetzen“). Die Geräte holen die
neue Fassung beim nächsten Start mit Netz von selbst und zeigen bei
geöffnetem Aufmaß den Hinweis „Jetzt neu starten“. Welche Fassung ein
Gerät gerade hat, steht unter *Einstellungen → Über dieses Werkzeug*. Das Werkzeug legt sich für den Offline-Betrieb im Gerät ab;
jede neue Fassung trägt deshalb eine neue Kennung (`CACHE` in `sw.js`),
damit alle Geräte beim nächsten Start den neuen Stand holen. Wer selbst
baut: `npm run build` erzeugt alle Fassungen auf einmal.

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
  `_sitzungen`, `_freigaben`.
- Kundenfreigabe: `POST /freigaben` (Zuständige) legt die Freigabe ab;
  `GET /freigaben/<code>` und `POST /freigaben/<code>/antwort` sind
  öffentlich – der Code ist der Ausweis (31^10 Möglichkeiten, Drosselung
  je Herkunftsadresse: 30 unbekannte Codes bzw. 12 Übertragungen in zehn
  Minuten). Die Antwort wird serverseitig gegen Maske und Freigabe geprüft
  und bereinigt abgelegt. `uebernommen`, `verwerfen`, `zurueckziehen`
  verlangen die Anmeldung und das Änderungsrecht am Aufmaß; wartende
  Antworten kommen mit `GET /projekte` als `antworten` mit. Der Kurzlink
  `/f/<code>` ist eine WordPress-Umschreibregel auf `?aufmass_f=<code>`
  mit Weiterleitung (nur auf die eigene Website) zur Freigabeseite.
- Pipedrive: `GET /wp-json/aufmass/v1/pipedrive/<weg>` für Angemeldete.
  Nur lesend, nur die sieben Wege, die das Werkzeug braucht (Positivliste
  in `inc/pipedrive.php`); Parameter werden auf Form geprüft, `limit`
  auf 500 gedeckelt. Der Token geht im Kopffeld mit, nie in der Adresse,
  und wird aus Pipedrives Antworten getilgt, falls er darin vorkommt.
  Ablage: XSalsa20-Poly1305 (sodium) bzw. AES-256-GCM, Schlüssel aus
  `AUTH_KEY`/`SECURE_AUTH_KEY` + Installationsgeheimnis.
- Prüfläufe: `npm test` (umfasst Server und Abgleich, PHP vorausgesetzt).
