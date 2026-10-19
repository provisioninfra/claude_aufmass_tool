# Aufmaß-Werkzeug aktualisieren (laufende Installation)

Diese Anleitung gilt, wenn das Werkzeug **schon läuft**: Plugin
„Aufmaß-Abgleich“ in WordPress, Ordner `aufmasstool` auf dem Webspace,
Geräte angemeldet. Sie bringt beides auf den Stand **1.3.1** – Plugin
und Werkzeug tragen dieselbe Fassungsnummer.

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

**Prüfen:** *Plugins* öffnen – bei „Aufmaß-Abgleich“ muss **1.3.1**
stehen (1.3.0, falls das Plugin beim Schritt auf 1.3.1 bewusst
belassen wurde). Unter *Einstellungen → Aufmaß-Abgleich* muss neben der
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
dem Gerät läuft (jetzt **1.3.1**), und ein Knopf **Auf neue Fassung
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
   Werkzeug-Fassung 1.3.1. Anmelden. Oben rechts steht danach
   **„Abgeglichen“**, und unter *Einstellungen → Über dieses Werkzeug*
   stehen die Fassung des Werkzeugs und die des Server-Plugins (beide
   1.3.1).
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
