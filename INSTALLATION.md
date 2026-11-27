# Installation des Aufmaß-Werkzeugs (Fassung 1.5.3)

Diese Anleitung führt von den vier ausgelieferten Dateien zu einer
laufenden Installation. Die ausführlichen Hintergründe stehen in
`server/EINRICHTUNG.md` (Ersteinrichtung), `server/AKTUALISIERUNG.md`
(spätere Fassungen) und `server/API.md` (Schnittstelle).

## Was ausgeliefert wird

| Datei | Wofür |
|---|---|
| `aufmass-tool.html` | Einzeldatei. Läuft ohne Server und ohne Anmeldung auf einem Gerät. |
| `aufmasstool.zip` | Ordner `aufmasstool` für den eigenen Webserver (gemeinsame Fassung mit Anmeldung, Abgleich, Kundenfreigabe per Kurzlink). |
| `aufmass-abgleich-plugin.zip` | WordPress-Plugin „Aufmaß-Abgleich“. Server-Seite der gemeinsamen Fassung. |
| `aufmass-anbindung.zip` | Anbindung für Claude Code, Kommandozeile und eigene Programme (optional). |

Zwei Wege stehen zur Wahl. **Weg A** ist in fünf Minuten erledigt und
genügt für eine Person auf einem Gerät. **Weg B** bringt alle Aufmaße auf
alle Geräte, die Kundenfreigabe per Kurzlink und die Anbindung; er dauert
etwa 45 Minuten und braucht eine WordPress-Website mit HTTPS sowie
Google Workspace. Beide Wege lassen sich kombinieren: Die Einzeldatei
bleibt für den Notfall ohne Netz brauchbar.

---

## Weg A: Einzeldatei

1. `aufmass-tool.html` in einen festen Ordner legen, zum Beispiel
   `Dokumente/Aufmass`. Die Datei nicht aus dem Download-Ordner heraus
   benutzen: Der Browser bindet die gespeicherten Aufmaße an den Ort der
   Datei.
2. Die Datei per Doppelklick im Browser öffnen (Chrome, Edge, Firefox oder
   Safari in aktueller Fassung) und ein Lesezeichen setzen.
3. Unter *Einstellungen* den Firmenkopf eintragen (Firma, Zusatz, Telefon,
   E-Mail, Logo). Diese Angaben erscheinen in allen PDF-Ausgaben, und die
   E-Mail-Adresse steht dem Kunden bei der Rückmeldung zur Verfügung.
4. Alle Daten liegen im Browserspeicher dieses Geräts. Für Sicherung und
   Austausch dient die Projektdatei (*Export → Projektdatei → Projekt
   exportieren*, dort auch *Alle Projekte sichern*); auf einem anderen
   Gerät wird sie über *Projekte → Projekt importieren* eingelesen.

**Kundenfreigabe in der Einzeldatei.** Ohne Server entsteht ein langer
Link mit den Plandaten im Anker, die Rückmeldung kommt als Rückschlüssel
(Datei oder Text) zurück und wird unter *Schließplan → Rückmeldung*
eingelesen. Damit der Link beim Kunden auf eine Seite im Internet führt,
unter *Einstellungen → Kundenfreigabe* die Adresse der Kundenseite
eintragen, zum Beispiel `https://www.provision-infra.de/aufmasstool/freigabe.html`
(sie entsteht mit Weg B). Fehlt die Adresse, bietet der Dialog eine Datei
zum Doppelklick an, die der Kunde als Anhang bekommt.

---

## Weg B: Gemeinsame Fassung mit Server

Voraussetzungen: eine WordPress-Website mit HTTPS (zum Beispiel bei
Raidboxes), Verwaltungsrechte in WordPress und in der Google Workspace,
ein SFTP-Programm (FileZilla oder Cyberduck). Im Beispiel heißt die
Website `www.provision-infra.de`; die eigene Adresse entsprechend
einsetzen. **Reihenfolge einhalten:** Google, Plugin, Einstellungen,
Ordner, Prüfung.

### B1. Google-Anmeldung einrichten

1. `console.cloud.google.com` mit dem Geschäftskonto öffnen und ein neues
   Projekt anlegen, zum Beispiel `Aufmass-Werkzeug`.
2. *APIs & Dienste → OAuth-Zustimmungsbildschirm*: Nutzertyp **Intern**,
   App-Name `Aufmaß-Werkzeug`, Support-E-Mail eintragen, autorisierte
   Domain `provision-infra.de`, speichern.
3. *APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen →
   OAuth-Client-ID*: Anwendungstyp **Webanwendung**, Name
   `Aufmaß-Werkzeug`. Unter *Autorisierte JavaScript-Quellen* beide
   Schreibweisen eintragen:
   ```
   https://www.provision-infra.de
   https://provision-infra.de
   ```
   *Autorisierte Weiterleitungs-URIs* leer lassen. Erstellen.
4. Die angezeigte **Client-ID** kopieren (Form
   `123456789-abcdefg.apps.googleusercontent.com`). Das Client-Geheimnis
   wird nicht gebraucht und darf nirgends eingetragen werden.

### B2. Plugin installieren

1. In WordPress *Plugins → Installieren → Plugin hochladen*.
2. `aufmass-abgleich-plugin.zip` auswählen, **Jetzt installieren**, dann
   **Aktivieren**. Beim Aktivieren legt das Plugin seine Tabellen an und
   übernimmt die Umschreibregel für Kurzlinks.
3. Prüfen: Unter *Plugins* steht bei „Aufmaß-Abgleich“ die Fassung 1.5.3.

### B3. Einstellungen in WordPress

*Einstellungen → Aufmaß-Abgleich*:

| Feld | Eintrag |
|---|---|
| Google-Client-ID | die Zeichenkette aus B1 |
| Organisationsdomäne | `provision-infra.de` |
| Neue Zugänge | Haken setzen, wenn neue Konten der Organisation erst von der Verwaltung freigegeben werden sollen |
| Herkunft der Aufrufe | Haken „hinter einem Proxy oder CDN“ nur setzen, wenn die Seite von jedem Gerät und Netz dieselbe Adresse zeigt |
| Kundenfreigabe | Gültigkeit der Links in Tagen (Vorgabe 30, 0 = unbegrenzt) und ob die Benachrichtigung per E-Mail verschickt wird |
| Pipedrive (optional) | API-Token aus Pipedrive, dann braucht kein Gerät den Schlüssel |
| Tür einsprechen (optional) | OpenAI-Schlüssel, danach „Verbindung prüfen“ |

Speichern. **Ohne Organisationsdomäne ist die Anmeldung gesperrt**, nicht
offen. Die Zeile „Herkunft der Aufrufe“ zeigt die Adresse, die der Server
für den aktuellen Aufruf sieht; einmal vom Telefon über Mobilfunk
aufrufen und vergleichen.

*Einstellungen → Permalinks*: Die Struktur darf nicht auf „Einfach“
stehen, sonst lautet der Kurzlink `/?aufmass_f=…` statt `/f/…` (beides
funktioniert, das eine ist nur länger). Einmal auf **Änderungen
speichern** klicken, auch ohne Änderung.

### B4. Werkzeug-Ordner hochladen

1. `aufmasstool.zip` **auf dem eigenen Rechner** entpacken. Heraus kommt
   ein Ordner `aufmasstool` mit `index.html`, `freigabe.html`, `sw.js`,
   den Symbolen, `css/`, `js/`, einer `.htaccess` und `LIESMICH.txt`.
2. Per SFTP in das **Wurzelverzeichnis** der Website gehen. Es ist der
   Ordner, in dem `wp-admin/`, `wp-content/` und `wp-config.php`
   nebeneinander liegen (bei Raidboxes je nach Box `public_html`, `web`
   oder `www`).
3. Den **ganzen Ordner** `aufmasstool` hinüberziehen, nicht nur seinen
   Inhalt. Warten, bis die Warteschlange leer ist. Danach sieht es so aus:
   ```
   <wurzelverzeichnis>/
   ├── wp-admin/
   ├── wp-content/
   ├── wp-config.php
   └── aufmasstool/
       ├── .htaccess
       ├── index.html
       ├── freigabe.html
       ├── sw.js
       ├── manifest.webmanifest
       ├── icon.svg, icon-180.png, icon-192.png, icon-512.png
       ├── css/app.css
       └── js/…
   ```

Die `.htaccess` ist eine Punktdatei; manche SFTP-Programme blenden sie
aus. Fehlt sie, läuft das Werkzeug trotzdem, nur ohne die zusätzlichen
Schutzkopfzeilen. Antwortet der Ordner nach dem Hochladen mit „500
Internal Server Error“, erlaubt der Hoster keine Kopfzeilen per
`.htaccess`: Dann die Datei löschen. Typische Fehler: Der Ordner heißt
`aufmasstool (1)` oder `Aufmasstool` (Groß- und Kleinschreibung zählt),
nur der Inhalt liegt lose neben `wp-config.php`, oder der Ordner liegt in
`wp-content/`.

Per SSH geht es im Wurzelverzeichnis in einer Zeile:

```
unzip aufmasstool.zip
```

### B5. Prüfen

Drei Adressen im Browser, in dieser Reihenfolge:

1. `https://www.provision-infra.de/aufmasstool/js/abgleich.js` zeigt
   JavaScript-Quelltext. Erscheint eine WordPress-Fehlerseite, liegt der
   Ordner am falschen Ort oder heißt anders.
2. `https://www.provision-infra.de/wp-json/aufmass/v1/start` zeigt eine
   kurze Antwort mit `"eingerichtet":true`. Bei `false` fehlt die
   Client-ID (B3), bei einer Fehlerseite ist das Plugin nicht aktiv (B2).
3. `https://www.provision-infra.de/aufmasstool/` zeigt die Anmeldeseite
   mit dem Google-Knopf; ganz unten steht die Fassung 1.5.3.

Danach bei Raidboxes einmal **Cache leeren**. Der Bereich `/wp-json/`
darf nie zwischengespeichert werden. Sperrt ein Sicherheits-Plugin
(Wordfence, Solid Security, „Disable REST API“) die Schnittstelle für
nicht angemeldete Besucher, dort eine Ausnahme für `aufmass/v1`
eintragen: Die Anmeldung läuft über Google, und der Kunde öffnet seine
Freigabe ohne WordPress-Konto.

**Immer dieselbe Adresse verwenden.** `www.provision-infra.de` und
`provision-infra.de` sind für den Browser zwei getrennte Herkünfte mit
getrennter Anmeldung und getrenntem Offline-Speicher. Eine Schreibweise
festlegen (die, auf die die Website ohnehin umleitet) und allen genau
diese Adresse geben.

### B6. Erste Anmeldung und Geräte

1. Die **erste Person, die sich anmeldet, erhält die Verwaltung.** Das
   sollte jemand sein, der Zugänge freigeben und sperren darf.
2. Danach meldet sich das Team an. Unter *Einstellungen →
   Aufmaß-Abgleich* stehen alle Zugänge; Sperren meldet sofort alle Geräte
   der Person ab.
3. Jedes Gerät das Werkzeug einmal **mit Netz** öffnen. Dabei legt es
   alle Dateien für den Offline-Betrieb ab; ab dann startet es auch ohne
   Empfang. Am iPad in Safari *Teilen → Zum Home-Bildschirm*, dann läuft
   es wie eine App.
4. Unter *Einstellungen* den Firmenkopf eintragen. Unter *Einstellungen →
   Über dieses Werkzeug* stehen die Fassung des Werkzeugs und die des
   Plugins (beide 1.5.3).

### B7. Kundenfreigabe durchprobieren

1. Ein Aufmaß öffnen, *Schließplan → Kundenfreigabe*, zwei Spalten
   freigeben, eine Frist setzen, **Freigabe-Link erzeugen**. Es entsteht
   ein Kurzlink der Form `https://www.provision-infra.de/f/k7m2p9x4qa`.
2. Den Link auf dem Telefon öffnen (kein Konto nötig), ein paar Felder
   antippen, Namen eintragen, **Rückmeldung senden**.
3. Im Werkzeug erscheint oben „1 Rückmeldung“. **Prüfen und übernehmen**
   zeigt den Bericht; erst **Übernehmen** ändert das Aufmaß.
4. Die Benachrichtigung per E-Mail muss beim Ersteller des Links
   ankommen. Kommt keine, zuerst den Spam-Ordner prüfen; bleibt der
   Versand des Servers unzuverlässig, hilft ein SMTP-Plugin (zum Beispiel
   „WP Mail SMTP“) mit dem Postfach der Firma. Die Rückmeldung liegt
   unabhängig davon im Werkzeug.

---

## Anbindung für Claude Code und Programme (optional)

Voraussetzung ist Node.js 18 oder neuer auf dem Rechner, der die Anbindung
nutzt.

1. Im Werkzeug anmelden, *Einstellungen → Zugang für Programme und Claude
   Code → Neuen Schlüssel erzeugen*. Namen vergeben, *nur lesen* oder
   *lesen und schreiben* wählen, Gültigkeit festlegen. Der Schlüssel
   (`aufm_…`) wird genau einmal angezeigt und ist wie ein Passwort zu
   behandeln.
2. `aufmass-anbindung.zip` entpacken, zum Beispiel nach
   `~/aufmass-anbindung`. Das Paket liegt auch im Werkzeug-Ordner
   (`aufmasstool/aufmass-anbindung.zip`) und ist über die
   Einstellungsseite herunterladbar.
3. Im Terminal einmal ausführen (Adresse der Website ohne `/aufmasstool`):
   ```
   claude mcp add aufmass \
     --env AUFMASS_URL=https://www.provision-infra.de \
     --env AUFMASS_SCHLUESSEL=aufm_… \
     -- node ~/aufmass-anbindung/aufmass-mcp.js
   ```
   Unter Windows lautet der letzte Teil
   `node %USERPROFILE%\aufmass-anbindung\aufmass-mcp.js`.
4. Prüfen: In Claude Code fragen „Welche Aufmaße gibt es?“. Für die
   Kommandozeile `node aufmass-cli.js ich` mit denselben Umgebungsvariablen.

Einzelheiten zu Werkzeugen, Kommandozeile und Bibliothek stehen in der
`README.md` des Pakets und in `server/API.md`.

---

## Spätere Fassungen

Plugin und Werkzeug tragen immer dieselbe Fassungsnummer und werden
zusammen aktualisiert, zuerst das Plugin, dann der Ordner:

1. *Plugins → Installieren → Plugin hochladen*, das neue ZIP wählen, bei
   der Rückfrage **Aktuelle durch hochgeladene ersetzen**. Das Plugin
   nicht löschen und neu installieren, das würde die Einstellungen
   entfernen.
2. Den Ordner `aufmasstool` vollständig austauschen: neuen Ordner als
   `aufmasstool-neu` hochladen, alten in `aufmasstool-alt` umbenennen,
   neuen in `aufmasstool` umbenennen. Nie nur einzelne Dateien ersetzen.
3. Cache leeren. Die Geräte holen die neue Fassung beim nächsten Start
   mit Netz von selbst und zeigen bei geöffnetem Aufmaß „Jetzt neu
   starten“.

Die Einzelheiten je Fassung stehen in `server/AKTUALISIERUNG.md`.

---

## Wenn etwas nicht geht

| Erscheinung | Ursache und Abhilfe |
|---|---|
| Kopfzeile sagt dauerhaft „Offline“ | Plugin nicht aktiv oder falsche Adresse. `…/wp-json/aufmass/v1/start` muss `eingerichtet: true` zeigen. Sicherheits-Plugins: Ausnahme für `aufmass/v1`. |
| Der Google-Knopf erscheint nicht | Die Adresse im Browser steht nicht unter *Autorisierte JavaScript-Quellen* (B1), `www.` eingeschlossen. Beide Schreibweisen eintragen. |
| „Dieses Konto gehört nicht zu …“ | Privates Google-Konto verwendet, oder in B1 nicht „Intern“ gewählt. |
| „Der Abgleich ist auf dem Server noch nicht eingerichtet“ | Client-ID fehlt (B3). |
| Seite bleibt bei „Anwendung wird geladen …“ | Alt und neu gemischt. Den ganzen Ordner `aufmasstool` ersetzen, Cache leeren, Seite mit Strg+F5 (Mac: Cmd+Shift+R) laden. |
| Ordner antwortet mit 500 | Der Hoster erlaubt keine Kopfzeilen per `.htaccess`: die Datei im Ordner löschen. |
| Kurzlink `/f/…` zeigt die 404-Seite | *Einstellungen → Permalinks* einmal speichern; Struktur darf nicht „Einfach“ sein. |
| Es wird nichts abgeglichen, obwohl angemeldet | Zwischenspeicher. Bei Raidboxes den Seiten-Cache leeren; `/wp-json/` darf nicht gecacht werden. |
| Keine E-Mail | Spam-Ordner, dann SMTP-Plugin. Die Rückmeldung liegt in jedem Fall im Werkzeug. |
| „Der hinterlegte Schlüssel ist nicht mehr lesbar“ | Die Salts in `wp-config.php` wurden erneuert. Pipedrive- bzw. OpenAI-Schlüssel neu eintragen. |
| Der Kunde sieht „Dieser Freigabe-Link ist nicht mehr gültig“ | Link abgelaufen, zurückgezogen oder Aufmaß gelöscht. Im Werkzeug einen neuen Link erzeugen. |
