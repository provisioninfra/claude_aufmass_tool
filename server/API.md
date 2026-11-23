# Schnittstelle des Aufmaß-Werkzeugs

Das Plugin „Aufmaß-Abgleich“ stellt unter `/wp-json/aufmass/v1/` eine
REST-Schnittstelle bereit. Das Werkzeug im Browser nutzt sie für den Abgleich;
seit Fassung 1.4.0 können auch Programme ohne Browser damit arbeiten, mit
einem **Zugangsschlüssel** statt einer Anmeldung. Für Claude Code liegt ein
fertiger MCP-Server bei (siehe unten), der nichts anderes tut, als diese
Schnittstelle zu benutzen.

## 1. Ausweisen

Zwei Wege führen zur Schnittstelle:

| Weg | Für wen | Wie |
| --- | --- | --- |
| **Browsersitzung** | das Werkzeug | `POST /anmelden` mit Google-ID-Token → Cookie `aufmass_sitzung` (HttpOnly, SameSite=Strict). Schreibende Anfragen tragen zusätzlich das Kopffeld `X-Aufmass-Abgleich: 1`. |
| **Zugangsschlüssel** | Programme, Claude Code | Kopffeld `Authorization: Bearer aufm_…` oder `X-Aufmass-Schluessel: aufm_…`. Kein Cookie, kein Abgleich-Kopffeld. |

Ein Zugangsschlüssel hat die Form `aufm_<16 Hex-Zeichen Kennung>_<48 Zeichen Geheimnis>`.
Er wird im Werkzeug unter **Einstellungen → Zugang für Programme und Claude Code**
erzeugt und dort genau einmal angezeigt. Der Server speichert nur einen SHA-256-Prüfwert.

Jeder Schlüssel gehört einer Person und trägt:

- **Rechte:** `lesen` (alle GET-Anfragen) oder `schreiben` (zusätzlich PUT, DELETE, POST
  auf Aufmaße, Fotos, Zuständige, Freigaben). Was die Person im Werkzeug nicht dürfte,
  darf der Schlüssel auch nicht - etwa ein Aufmaß ändern, für das sie nicht zuständig ist.
- **Gültigkeit:** Vorgabe ein Jahr, höchstens zwei Jahre.
- **Grenze:** höchstens 20 gültige Schlüssel je Person.

Schlüssel verwalten kann nur eine Browsersitzung, nie ein Schlüssel (`403 nur_sitzung`).
Wird ein Zugang gesperrt oder gelöscht, erlöschen alle seine Schlüssel.

Fehlerantworten beim Ausweisen mit Schlüssel:

| HTTP | `code` | Bedeutung |
| --- | --- | --- |
| 401 | `schluessel_ungueltig` | unbekannt oder falsches Geheimnis |
| 401 | `schluessel_widerrufen` | widerrufen |
| 401 | `schluessel_abgelaufen` | Gültigkeit vorbei |
| 401 | `gesperrt` | Zugang der Person gesperrt |
| 403 | `nur_lesen` | Schreibversuch mit Leseschlüssel |
| 403 | `nur_sitzung` | Schlüsselverwaltung mit Schlüssel |
| 429 | `zu_viele` | mehr als 30 falsche Schlüssel aus einer Herkunft in zehn Minuten |

## 2. Endpunkte

Alle Antworten sind JSON. Fehler kommen als `{ "code": "…", "message": "…", "data": { "status": … } }`
(WordPress-Form). `{id}` ist die Aufmaß-Kennung `prj-…`.

### Allgemein

| Methode und Weg | Rechte | Antwort |
| --- | --- | --- |
| `GET /start` | öffentlich | `{ eingerichtet, clientId, domaene, angemeldet, benutzer, marke }` - nur, was die Anmeldeseite braucht |
| `POST /anmelden` | Sitzung | Google-ID-Token im Körper `{ token }` → Cookie |
| `POST /abmelden` | Sitzung | beendet die Sitzung |
| `GET /ich` | lesen | `{ benutzer, marke, zugang, schluessel, version, … }` samt den eingerichteten Anbindungen. `zugang` ist `sitzung` oder `schluessel`; `schluessel` beschreibt den verwendeten Schlüssel (Name, Rechte, Gültigkeit), nie das Geheimnis |
| `GET /benutzer` | lesen | alle aktiven Zugänge `{ benutzer: [ { id, name, email, rolle } ] }` |

### Aufmaße

| Methode und Weg | Rechte | Antwort |
| --- | --- | --- |
| `GET /projekte` | lesen | `{ marke, projekte: [ { id, kunde, objekt, anlagenNr, version, geaendertAm, geaendertVon, geloescht, zustaendige } ], antworten }` |
| `GET /projekte/{id}` | lesen | `{ id, version, geaendertAm, geaendertVon, geloescht, zustaendige, daten }` - `daten` ist das vollständige Aufmaß ohne Bilddaten |
| `PUT /projekte/{id}` | schreiben, zuständig | Körper `{ daten, basisVersion }`. Stimmt `basisVersion` mit der Version auf dem Server überein, wird gespeichert und die neue Fassung zurückgegeben. Sonst **409 `konflikt`** mit `data.server` = Serverstand zum Zusammenführen. `basisVersion: 0` legt ein neues Aufmaß an |
| `DELETE /projekte/{id}` | schreiben, zuständig | legt das Aufmaß in den Papierkorb (`geloescht`) |
| `PUT /projekte/{id}/zustaendige` | schreiben, zuständig | Körper `{ benutzer: [ids] }` |
| `GET /projekte/{id}/fotos` | lesen | `{ fotos: [...], status }` - welche Fotos des Aufmaßes auf dem Server liegen |
| `GET /fotos/{fotoId}` | lesen | das Bild (JPEG/PNG/WebP) |
| `PUT /fotos/{fotoId}?projekt={id}` | schreiben, zuständig | Körper: das Bild selbst (JPEG, PNG oder WebP, geprüft am Inhalt), `Content-Type: image/jpeg` o. ä. |

**Zusammenführen bei 409:** Programme sollen das Aufmaß lesen, ändern und mit der
gelesenen Version speichern. Kommt 409, führt man Basis (gelesener Stand), eigene
Änderung und Serverstand dreiseitig zusammen und speichert mit der Serverversion erneut.
`aufmass-client.js` tut genau das (`aendern()`), mit derselben Logik wie das Werkzeug
(`zusammenfuehren.js`). Nur dieselbe Angabe mit zwei verschiedenen neuen Werten ist ein
echter Konflikt und bricht ab.

### Zugangsschlüssel (nur Browsersitzung)

| Methode und Weg | Antwort |
| --- | --- |
| `GET /schluessel` | `{ schluessel: [ { id, name, rechte, erstelltAm, gueltigBis, zuletztAm, abgelaufen } ] }` - die eigenen Schlüssel, ohne Geheimnis |
| `POST /schluessel` | Körper `{ name, rechte: "lesen"\|"schreiben", tage }` → `{ schluessel: "aufm_…", eintrag }`. Das Geheimnis kommt nur in dieser Antwort vor |
| `DELETE /schluessel/{kennung}` | widerruft; eigene Schlüssel immer, fremde nur die Verwaltung (`404` unbekannt, `403` fremd) |

Unbekannte Rechte fallen auf `lesen` zurück, zu lange Namen werden gekürzt, zu lange
Gültigkeiten auf zwei Jahre begrenzt.

### Weitere

- `GET /pipedrive/{weg}` - lesender Durchgriff auf Pipedrive (Positivliste), für Angemeldete
- `POST /diktat` - Tür einsprechen (Tonaufnahme → Felder), für Angemeldete
- `GET|POST /freigaben`, `/freigaben/{code}/…` - Kundenfreigabe (siehe EINRICHTUNG.md); die
  Aktionen `uebernommen`, `verwerfen`, `zurueckziehen`, `vorlegen` verlangen Schreibrecht
  und Zuständigkeit

## 3. Beispiele

```
# Wer bin ich, was darf der Schlüssel?
curl -H "Authorization: Bearer aufm_…" https://www.provision-infra.de/wp-json/aufmass/v1/ich

# Alle Aufmaße
curl -H "Authorization: Bearer aufm_…" https://www.provision-infra.de/wp-json/aufmass/v1/projekte

# Ein Aufmaß lesen
curl -H "Authorization: Bearer aufm_…" https://www.provision-infra.de/wp-json/aufmass/v1/projekte/prj-…

# Ändern: daten anpassen und mit der gelesenen Version speichern
curl -X PUT -H "Authorization: Bearer aufm_…" -H "Content-Type: application/json" \
  --data @aufmass.json https://www.provision-infra.de/wp-json/aufmass/v1/projekte/prj-…
# aufmass.json: { "daten": { … }, "basisVersion": 7 }
```

## 4. Claude Code anbinden

Das Paket `aufmass-anbindung.zip` (im Werkzeug unter Einstellungen zum Herunterladen,
im Quelltext unter `tools/mcp/`, gebaut nach `dist/aufmass-anbindung/`) enthält:

- `aufmass-mcp.js` - MCP-Server über stdio (JSON-RPC 2.0, Zeile für Zeile), ohne Abhängigkeiten
- `aufmass-cli.js` - Kommandozeile
- `aufmass-client.js` - Bibliothek für Node.js
- `lib/` - Katalog, Modell, Zusammenführen, PDF-Writer und Berichte des Werkzeugs

Einrichten mit einem Befehl:

```
claude mcp add aufmass \
  --env AUFMASS_URL=https://www.provision-infra.de \
  --env AUFMASS_SCHLUESSEL=aufm_… \
  -- node ~/aufmass-anbindung/aufmass-mcp.js
```

Der Server meldet 17 Werkzeuge: `zugang_pruefen`, `projekte_auflisten`, `projekt_lesen`,
`projekt_anlegen`, `stammdaten_aendern`, `gliederung_lesen`, `gliederung_anlegen`,
`tueren_auflisten`, `tuer_lesen`, `tuer_anlegen`, `tuer_aendern`, `tuer_loeschen`,
`schliessplan_lesen`, `spalte_anlegen`, `berechtigung_setzen`, `bericht_erzeugen`,
`katalog_lesen`. Türfelder werden gegen das Modell geprüft (unbekannte Felder und
Status werden abgewiesen, Werte außerhalb der Auswahllisten mit Hinweis übernommen),
Türen lassen sich über Nummer oder Kennung, Bereiche über Name oder Kennung, Spalten
über Kürzel oder Kennung ansprechen. `bericht_erzeugen` schreibt die PDF in den
Arbeitsordner oder nach `AUFMASS_AUSGABE`.

Protokoll: `initialize` (Protokollfassungen 2024-11-05, 2025-03-26, 2025-06-18),
`notifications/initialized`, `ping`, `tools/list`, `tools/call`; `resources/list` und
`prompts/list` antworten leer. Fehler eines Werkzeugs kommen als Textinhalt mit
`isError: true`, nie als Absturz. Meldungen des Servers gehen nur nach stderr.

## 5. Sicherheit

- Der Schlüssel wird mit `random_bytes` erzeugt (64 Bit Kennung, 288 Bit Geheimnis) und als
  SHA-256-Prüfwert gespeichert; die Prüfung vergleicht zeitkonstant (`hash_equals`).
- Falsche Schlüssel zählen je Herkunftsadresse; nach 30 in zehn Minuten antwortet der
  Server mit 429, auch für richtige Schlüssel dieser Herkunft.
- Ein Schlüssel kann weder Schlüssel erzeugen noch widerrufen noch die Zugangsliste des
  Plugins ändern. Die Verwaltung sieht in WordPress je Zugang die Anzahl der Schlüssel
  und kann alle Schlüssel einer Person widerrufen.
- Für Schlüssel entfällt das Kopffeld `X-Aufmass-Abgleich` (es schützt Browsersitzungen vor
  fremden Seiten; ein Schlüssel liegt in keinem Browser). Die optimistische Sperre
  (`basisVersion`) und die Zuständigkeiten gelten für Schlüssel genauso.
- `zuletztAm` wird höchstens stündlich fortgeschrieben; die Liste zeigt es, damit
  vergessene Schlüssel auffallen. Ein täglicher Lauf entfernt widerrufene Schlüssel
  und abgelaufene nach 30 Tagen aus der Tabelle.
- Tests: `tests/test-api.js` (Schlüssel, Rechte, Bibliothek, MCP-Server, Kommandozeile,
  Drossel gegen den echten PHP-Code) und `server/tests/test-schluessel.php`.
