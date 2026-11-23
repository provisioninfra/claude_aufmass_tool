# Aufmaß-Anbindung: Claude Code und eigene Programme

Dieses Paket verbindet Programme mit der gemeinsamen Ablage des Aufmaß-Werkzeugs,
ohne dass sich jemand im Browser anmelden muss. Es besteht aus drei Teilen:

| Datei | Zweck |
| --- | --- |
| `aufmass-mcp.js` | MCP-Server für Claude Code (Aufmaße lesen, anlegen, ändern, Berichte erzeugen) |
| `aufmass-cli.js` | Kommandozeile für den schnellen Blick und für Skripte |
| `aufmass-client.js` | Bibliothek für eigene Node.js-Programme (lesen, ändern, zusammenführen) |

Voraussetzung ist Node.js 18 oder neuer. Abhängigkeiten gibt es keine; die Bausteine
des Werkzeugs liegen in `lib/` bei.

## 1. Zugangsschlüssel erzeugen

Im Aufmaß-Werkzeug anmelden, dann **Einstellungen → Zugang für Programme und Claude Code →
Neuen Schlüssel erzeugen**. Der Schlüssel (`aufm_…`) wird genau einmal angezeigt. Er gehört
der Person, die ihn erzeugt hat: Alles, was ein Programm damit tut, geschieht in ihrem Namen
und unterliegt ihren Zuständigkeiten. Rechte (nur lesen oder lesen und schreiben) und
Ablaufdatum werden beim Erzeugen festgelegt; widerrufen lässt sich der Schlüssel jederzeit
an derselben Stelle.

Den Schlüssel wie ein Passwort behandeln: nicht in Chats, Tickets oder Quelltext ablegen.

## 2. Claude Code anbinden

Das Paket entpacken, zum Beispiel nach `~/aufmass-anbindung`, und einmal im Terminal:

```
claude mcp add aufmass \
  --env AUFMASS_URL=https://www.provision-infra.de \
  --env AUFMASS_SCHLUESSEL=aufm_… \
  -- node ~/aufmass-anbindung/aufmass-mcp.js
```

`AUFMASS_URL` ist die Adresse der WordPress-Website (ohne `/aufmasstool`). Der Pfad am
Ende zeigt auf die entpackte Datei. Unter Windows etwa
`node %USERPROFILE%\aufmass-anbindung\aufmass-mcp.js`.

Danach kennt Claude Code das Werkzeug `aufmass` mit diesen Fähigkeiten:

| Werkzeug | Was es tut |
| --- | --- |
| `zugang_pruefen` | Wer bin ich, was darf der Schlüssel, welche Fassung läuft |
| `projekte_auflisten` | Alle Aufmaße der Ablage |
| `projekt_lesen` | Ein Aufmaß als Übersicht oder vollständig als JSON |
| `projekt_anlegen` | Neues Aufmaß mit Stammdaten |
| `stammdaten_aendern` | Kunde, Objekt, Anlagen-Nr., Adresse, System … |
| `gliederung_lesen` / `gliederung_anlegen` | Standorte, Gebäude, Bereiche |
| `tueren_auflisten` / `tuer_lesen` | Türen suchen und lesen |
| `tuer_anlegen` / `tuer_aendern` / `tuer_loeschen` | Türen pflegen, mit Prüfung der Felder und Auswahlwerte |
| `schliessplan_lesen` | Kreuzschließplan als Tabelle |
| `spalte_anlegen` | Gruppe, Mitarbeiter oder Schließung im Plan |
| `berechtigung_setzen` | Kreuz setzen: ja, zeit, temp, sperr, nein |
| `bericht_erzeugen` | PDF: Türliste, Schließplan, Materialliste, Prüfprotokoll |
| `katalog_lesen` | Alle Felder mit Bedeutung und Auswahlwerten |

Beispiele für Fragen an Claude Code: „Welche Aufmaße gibt es?“, „Zeig mir die offenen
Pflichtangaben im Aufmaß Ibsen“, „Lege im Erdgeschoss eine Tür Haupteingang mit
Doppelzylinder 35/35 an“, „Erzeuge die Türliste als PDF in den Ordner Berichte“.

Jede Änderung liest das Aufmaß, ändert es und speichert es mit der gelesenen Version.
Speichert zwischendurch jemand anderes, wird dreiseitig zusammengeführt wie im Werkzeug.
Nur wenn dieselbe Angabe zweimal verschieden geändert wurde, bricht der Vorgang mit
einer Meldung ab.

## 3. Kommandozeile

```
export AUFMASS_URL=https://www.provision-infra.de
export AUFMASS_SCHLUESSEL=aufm_…
node aufmass-cli.js ich
node aufmass-cli.js projekte
node aufmass-cli.js projekt <projektId>
node aufmass-cli.js tueren <projektId> [Suchtext]
node aufmass-cli.js tuer <projektId> <Nummer oder tuerId>
node aufmass-cli.js schliessplan <projektId>
node aufmass-cli.js bericht <projektId> tuerliste ./Berichte
node aufmass-cli.js werkzeug tuer_anlegen '{"projektId":"…","felder":{"bezeichnung":"Lager"}}'
```

Statt der Umgebungsvariablen gehen auch `--url=…` und `--schluessel=…`.

## 4. Eigene Programme

```js
const { verbinden } = require('./aufmass-client.js');
const a = verbinden({ url: 'https://www.provision-infra.de', schluessel: 'aufm_…' });
const liste = await a.projekte();
const voll = await a.projekt(liste[0].id);           // { id, version, daten, … }
await a.aendern(voll.id, (p) => { p.bemerkung = 'Geprüft'; });   // liest, ändert, speichert, führt zusammen
```

Ohne Node.js spricht man die Schnittstelle direkt an. Der Schlüssel geht als
`Authorization: Bearer aufm_…` oder im Kopffeld `X-Aufmass-Schluessel` mit:

```
curl -H "Authorization: Bearer aufm_…" https://www.provision-infra.de/wp-json/aufmass/v1/projekte
```

Die vollständige Beschreibung der Schnittstelle steht in `API.md` des Quelltexts
(`server/API.md`).

## Umgebungsvariablen

| Variable | Bedeutung |
| --- | --- |
| `AUFMASS_URL` | Adresse der WordPress-Website |
| `AUFMASS_SCHLUESSEL` | Zugangsschlüssel `aufm_…` |
| `AUFMASS_AUSGABE` | Ordner für PDF-Berichte (Vorgabe: Arbeitsordner) |
| `AUFMASS_FIRMA`, `AUFMASS_FIRMA_ZUSATZ` | Firmenkopf für Berichte |

## Sicherheit

- Der Server speichert nur einen Prüfwert des Schlüssels, nie den Schlüssel selbst.
- Ein Schlüssel kann nur lesen oder lesen und schreiben; Schlüssel verwalten kann nur eine Browsersitzung.
- Nach 30 falschen Schlüsseln aus einer Herkunft sperrt der Server zehn Minuten.
- Widerrufen wirkt sofort. Verlässt eine Person das Unternehmen, erlöschen ihre Schlüssel mit dem Zugang.

Das Paket gehört zur Fassung des Werkzeugs, aus der es heruntergeladen wurde. Nach einer
Aktualisierung des Werkzeugs unter Einstellungen das aktuelle Paket neu laden.
