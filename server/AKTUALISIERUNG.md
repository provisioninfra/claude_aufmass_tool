# Aufmaß-Werkzeug aktualisieren (laufende Installation)

Diese Anleitung gilt, wenn das Werkzeug **schon läuft**: Plugin
„Aufmaß-Abgleich“ 1.0 in WordPress, Ordner `aufmasstool` auf dem Webspace,
Geräte angemeldet. Sie bringt beides auf den neuen Stand (Plugin 1.1.2,
Werkzeug 1.1.2 mit Kurzlink-Freigabe, Sicherheitsrichtlinie,
Aktualisierungshinweis und den Korrekturen aus dem Prüfdurchgang vom
Oktober 2026 - unter anderem lässt sich der Pipedrive-Schlüssel jetzt
auch beim ersten Versuch hinterlegen).

**Zeitbedarf:** etwa 15 Minuten. **Ausfall:** keiner, die Aufmaße bleiben
unberührt, niemand muss sich neu anmelden.

**Reihenfolge einhalten:** zuerst das Plugin, dann der Ordner. Das neue
Werkzeug fragt den Server nach Wegen, die das alte Plugin noch nicht
kennt; umgekehrt kommt das alte Werkzeug mit dem neuen Plugin zurecht.

---

## Vorab: zwei Dinge sichern

1. Den **alten Ordner `aufmasstool`** auf dem Webspace nicht löschen,
   sondern umbenennen (siehe Schritt 2). Dann lässt sich jederzeit
   zurückgehen.
2. Das **alte Plugin-ZIP** aufheben, falls vorhanden. Wer es nicht mehr
   hat, braucht es nur für einen Rückweg, der praktisch nie nötig ist.

Ein Datenbank-Backup legt Raidboxes ohnehin täglich an. Das neue Plugin
ändert an den vorhandenen Tabellen nichts; es legt nur eine neue Tabelle
hinzu (`wp_aufmass_freigaben`).

---

## Schritt 1 — Plugin ersetzen (WordPress)

1. Im WordPress-Verwaltungsbereich: **Plugins → Installieren → Plugin
   hochladen**.
2. `aufmass-abgleich-plugin.zip` auswählen, **Jetzt installieren**.
3. WordPress erkennt, dass das Plugin schon vorhanden ist, und zeigt
   beide Fassungen nebeneinander. Auf **„Aktuelle durch hochgeladene
   ersetzen“** klicken.
4. Das Plugin bleibt dabei aktiv. Beim ersten Aufruf danach legt es die
   neue Tabelle selbst an und übernimmt die Umschreibregel für den
   Kurzlink.

**Prüfen:** *Einstellungen → Aufmaß-Abgleich* öffnen. Dort muss jetzt
ein Abschnitt **„Kundenfreigabe“** stehen (Gültigkeit der Links,
Benachrichtigung). Fehlt er, läuft noch die alte Fassung.

> **Nicht** das Plugin „Löschen“ und neu installieren: Löschen räumt die
> Einstellungen weg (Google-Client-ID, Domäne), die müssten danach neu
> eingetragen werden. Die Aufmaße selbst blieben zwar erhalten, aber der
> Umweg ist unnötig. Bietet WordPress den Knopf „ersetzen“ nicht an
> (nur bei sehr alten WordPress-Fassungen), stattdessen per SFTP den
> Inhalt von `wp-content/plugins/aufmass-sync/` mit dem Inhalt des
> ZIP-Ordners `aufmass-sync` überschreiben.

---

## Schritt 2 — Ordner `aufmasstool` austauschen (Webspace)

Der neue Ordner enthält dieselben Dateien wie der alte (gleiche Namen,
neuer Inhalt). Zwei Wege:

**Weg A, mit Rückweg (empfohlen):**

1. `aufmasstool.zip` auf dem Rechner entpacken → Ordner `aufmasstool`.
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
eine Mischung aus alt und neu lädt nicht.

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
dem Gerät läuft, und ein Knopf **Auf neue Fassung prüfen** stößt die
Prüfung sofort an. Ein Gerät, das gerade ohne Netz ist, arbeitet mit der
alten Fassung weiter, bis es wieder online war – auch das ist in Ordnung,
die Aufmaße gleichen sich wie gewohnt ab.

> **Geräte, die noch auf der Fassung 1.1.0 oder älter hängen**, kennen
> den Hinweis noch nicht. Dort: Werkzeug ganz schließen und zweimal mit
> Netz öffnen. Der erste Start holt die neue Fassung, der zweite zeigt
> sie. Am Rechner genügt Strg+F5 (Mac: Cmd+Shift+R).

---

## Schritt 4 — Einstellungen einmal ansehen

**WordPress → Einstellungen → Aufmaß-Abgleich → Kundenfreigabe**

- *Gültigkeit der Links:* 30 Tage ist voreingestellt. 0 = unbegrenzt.
- *Benachrichtigung:* eingeschaltet. Jede Übertragung eines Kunden geht
  per E-Mail an den Ersteller des Links und alle Zuständigen des
  Aufmaßes. Die Mail kommt von der WordPress-Mailfunktion
  (`wordpress@provision-infra.de`, sofern kein Mail-Plugin etwas anderes
  vorgibt).
- *So sieht ein Link aus:* zeigt die Form des Kurzlinks.

**WordPress → Einstellungen → Permalinks**

Dort darf nicht „Einfach“ stehen – sonst lautet der Kurzlink
`/?aufmass_f=…` statt `/f/…` (beides funktioniert, das eine ist nur
länger). Einmal auf **„Änderungen speichern“** klicken, auch ohne etwas
zu ändern: Das übernimmt die Umschreibregel des Plugins auf jeden Fall.

---

## Schritt 5 — Durchprobieren (fünf Minuten)

1. `https://www.provision-infra.de/aufmasstool/` öffnen. Die Anmeldeseite
   mit dem Google-Knopf muss erscheinen; ganz unten steht die
   Werkzeug-Fassung. Anmelden. Oben rechts steht danach **„Abgeglichen“**,
   und unter *Einstellungen → Über dieses Werkzeug* stehen die Fassung des
   Werkzeugs und die des Server-Plugins.
2. Ein Aufmaß öffnen → **Schließplan → Kundenfreigabe**. Eine Schließung
   antippen, **Freigabe-Link erzeugen**. Es erscheint ein kurzer Link
   `https://www.provision-infra.de/f/…` und darunter die Liste
   „Bisherige Freigabe-Links“.
3. Den Link in ein **privates Browserfenster** kopieren (dort ist niemand
   angemeldet – so sieht es der Kunde). Die Matrix muss laden. Ein
   freigegebenes Feld antippen, unten **Übertragen**, Namen eintragen,
   **Jetzt übertragen**. „Vielen Dank“ erscheint.
4. Zurück im Werkzeug: spätestens nach 15 Sekunden zeigt die Kopfzeile
   **„1 Rückmeldung“** und der Schließplan einen Hinweis. **Prüfen und
   übernehmen** → der Bericht nennt das Feld → **Verwerfen** (es war ja
   nur ein Versuch).
5. Im Postfach muss die Benachrichtigung liegen (ggf. Spam-Ordner).
6. Im Dialog *Kundenfreigabe* den Probelink **zurückziehen**.

Läuft alles bis hierher, ist die Aktualisierung fertig.

---

## Was mit Bestehendem passiert

- **Aufmaße, Fotos, Zuständigkeiten, Anmeldungen:** unverändert, nichts
  muss neu gemacht werden.
- **Alte, lange Freigabe-Links**, die Kunden schon bekommen haben, gehen
  weiter: Die Freigabeseite versteht beide Formen. Ihre Rückmeldung kommt
  wie bisher als Rückschlüssel zurück und wird unter *Schließplan →
  Rückmeldung* eingelesen.
- **Pipedrive:** unverändert. Liegt der Schlüssel in WordPress, bleibt
  er dort. Liegt er noch auf einzelnen Geräten und zeigt die Adresse
  nicht auf `*.pipedrive.com`, dann den Schlüssel in WordPress eintragen
  – die Seite lässt vom Gerät aus nur noch Verbindungen zu Pipedrive
  selbst zu (Sicherheitsrichtlinie).
- **Türen:** Stromversorgung und Vernetzung werden nicht mehr als
  fehlend gezählt. Türen, die nur deshalb „unvollständig“ waren, gelten
  jetzt als vollständig.

---

## Wenn etwas nicht geht

**Nach dem Austausch bleibt die Seite bei „Anwendung wird geladen …“**
Alte und neue Dateien sind gemischt, oder der Zwischenspeicher liefert
noch alte Dateien. Alle Dateien erneut hochladen, Cache leeren, Seite mit
Strg+F5 (Mac: Cmd+Shift+R) neu laden.

**Der Google-Knopf erscheint nicht**
Browser-Konsole öffnen (F12 → Console). Steht dort eine Meldung mit
„Content Security Policy“ und „accounts.google.com“, bitte den Wortlaut
weitergeben. Übergangsweise lässt sich in `aufmasstool/index.html` die
Zeile mit `Content-Security-Policy` entfernen – das Werkzeug läuft dann
ohne diese zusätzliche Schutzschicht, bis die Richtlinie angepasst ist.

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

Die neue Tabelle bleibt dabei stehen und stört die alte Fassung nicht.
