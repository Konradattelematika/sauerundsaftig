# Server — Sauer & Saftig

Node-22-Server ohne npm-Abhängigkeiten im Kern (nur `node:*`; für Medien wird `sharp` per dynamischem
Import aus dem App-`node_modules` geladen). Liefert den aktuellen Build aus, routet nach Host, übernimmt
Login, Go-Live-Schranke, die JSON-API und das CMS. Verträge: `docs/LIVE-PLAN.md` §2, `docs/CMS-PLAN.md` §7.

```
server/index.mjs              Start (liest Env, SIGTERM → sauberer Shutdown inkl. Build-Abbruch)
server/hash-password.mjs      Passwort-Hash für SUS_USERS erzeugen
server/code-version.mjs       Code-Version (Hash der Quellen) → /app/.code-version beim Image-Build
server/lib/config.mjs         Env → Konfiguration
server/lib/host-policy.mjs    Host-Routing als reine Funktionen (§2.2; /admin und /api/cms auf allen Hosts)
server/lib/auth.mjs           scrypt, Session-Cookie (HMAC), next-Prüfung, Rate-Limit
server/lib/static.mjs         Dateien aus dem Build (Traversal-Schutz, ETag, gzip/brotli), StaticSwitch
server/lib/store.mjs          JSON-Persistenz (atomar, serialisiert, events.jsonl, Seed-Merge)
server/lib/api.mjs            /api/… (§2.5)
server/lib/export.mjs         /api/export und /api/export.md
server/lib/cms/index.mjs      CMS verdrahten (Speicher, Benutzer, Medien, Builds, Weiterleitungen, API)
server/lib/cms/store.mjs      Entwurf/veröffentlicht/Versionen, Revisionen & Konflikte, Seed, Migration
server/lib/cms/migrations.mjs Schema-Migrationen (geordnete Schritte, vorher Sicherung)
server/lib/cms/content.mjs    Inhalts-Hash, Weiterleitungen bei Slug-Änderung, Nachspielen von Server-Änderungen
server/lib/cms/users.mjs      Rollen/Rechte, Benutzerverwaltung (users.json)
server/lib/cms/media.mjs      Upload-Prüfung, sharp-Normalisierung, Vorschaubilder, Medien-Sync, Aufräumen
server/lib/cms/builds.mjs     Build-Warteschlange, Zeiger, Umschalten, Aufräumen, Start-Logik
server/lib/cms/astro-builder.mjs  echter Astro-Build als Kindprozess (Env, Timeout, Prozessgruppe)
server/lib/cms/preview.mjs    Vorschau-Cookie und Vorschau-Leiste
server/lib/cms/api.mjs        /api/cms/*
server/seed/checklist.json    Seed der Checkliste (gehört Agent C; fehlt sie → leere Liste)
src/cms/validate.mjs          Prüfung eines SiteDoc (reines JS, auch im Admin-Browser)
src/cms/definitions.mjs       Sektions-/Sammlungs-Definitionen per Dateisystem laden (Server)
```

## Umgebungsvariablen

| Variable | Default | Bedeutung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port |
| `HOST` | `0.0.0.0` | Listen-Adresse |
| `SUS_USERS` | — | JSON-Array `[{"id":"konrad","name":"Konrad","role":"team","hash":"scrypt$…"}]`, Rollen `admin` \| `redaktion` (Altrollen `team` \| `inhaberin` = `admin`). Leer/kaputt → niemand kann sich anmelden (Warnung im Log). Weitere Benutzer lassen sich im Dashboard anlegen (`/data/users.json`) |
| `SUS_USERS_B64` | — | Dasselbe JSON als kanonisches Base64url; hat Vorrang vor `SUS_USERS` und umgeht `$`-Interpolation durch Deployment-Plattformen |
| `SUS_SESSION_SECRET` | zufällig | HMAC-Schlüssel für Cookies (≥ 32 Zeichen). Fehlt er, gelten Sessions nur bis zum Neustart |
| `SUS_EXPORT_TOKEN` | — | Bearer-Token für `/api/export(.md)` ohne Login (≥ 24 Zeichen) |
| `SUS_GO_LIVE_AT` | `2026-10-10T16:00:00+02:00` | Ab dann ist der Live-Host öffentlich. Ungültig → bleibt privat |
| `SUS_FORCE_PRIVATE` | `0` | `1` hält den Live-Host auch nach Go-Live hinter Login |
| `SUS_LIVE_HOSTS` | `sauerundsaftig.de` | Kommaliste |
| `SUS_WWW_HOSTS` | `www.sauerundsaftig.de` | 301 → `https://<erster Live-Host>` |
| `SUS_TOOL_HOSTS` | `checkliste.sauerundsaftig.de=checkliste,module.sauerundsaftig.de=module` | Host=Präfix |
| `SUS_COOKIE_DOMAIN` | leer | Optionales Domain-Cookie. Standardmäßig bleibt die Sitzung aus Sicherheitsgründen hostgebunden; damit ist je Subdomain eine Anmeldung nötig |
| `SUS_DIST_DIR` | `dist` (relativ zum Repo; Container `/app/dist`) | Build aus dem Image (Seed). Gilt als aktueller Build, bis das CMS selbst gebaut hat |
| `SUS_DATA_DIR` | `/data` | `checklist.json`, `module.json`, `events.jsonl`, CMS (s. u.) |
| `SUS_SEED_FILE` | `server/seed/checklist.json` | Seed der Checkliste |
| `SUS_QUIET` | `0` | `1` schaltet das Access-Log ab |
| `SUS_APP_DIR` | Repo-Wurzel (Container `/app`) | App-Verzeichnis für Builds zur Laufzeit (Quellen, `node_modules`, Seed) |
| `SUS_CODE_VERSION` | Inhalt von `<App>/.code-version`, sonst `dev` | Code-Stand; weicht er vom aktuellen Build ab, wird beim Start neu gebaut |
| `SUS_BUILD_TIMEOUT_MIN` | `10` | Abbruch eines Builds nach so vielen Minuten (alte Version bleibt online) |
| `SUS_BUILD_ON_START` | `1` | `0` unterdrückt den automatischen Neubau beim Start (Notfall/Debugging) |
| `SUS_CMS_SEED_DIR` | `<App>/src/cms/seed` | Anderer Seed (Grundbestand) für den Erststart |

Alle anderen Hosts (z. B. `sauerundsaftig.jawollja.gmbh`, `localhost`) sind Vorschau-Hosts: alles mit Login.

## Benutzer anlegen

```sh
node server/hash-password.mjs 'langes-passwort'          # oder: printf '%s' '…' | node server/hash-password.mjs
# → scrypt$32768$8$1$<salt>$<hash>  in SUS_USERS als "hash" eintragen
```

Passwort ändern — zwei Wege:

- **Selbst:** angemeldet `/passwort` aufrufen (auf jedem Host; Links in Checkliste und Modul-Board).
  Der neue Hash landet in `/data/passwords.json` und gilt, solange der Hash in `SUS_USERS` unverändert ist.
- **Admin-Reset** (Passwort vergessen): neuen Hash in `SUS_USERS` eintragen und neu deployen — ein geänderter
  Env-Hash hat Vorrang vor dem selbst gesetzten Passwort.

In beiden Fällen werden alte Sessions dieses Benutzers ungültig.

Im Dashboard (Benutzer, nur `admin`) lassen sich zusätzlich Benutzer anlegen, umbenennen, in der Rolle ändern,
löschen und Passwörter zurücksetzen (Details unter „CMS · Rollen & Benutzer“).

## CMS (Dashboard unter `/admin`)

Vertrag: `docs/CMS-PLAN.md` §7. Die Website bleibt statisch: Inhalte liegen als ein JSON-Dokument (SiteDoc) in
`/data/cms`; beim **Veröffentlichen** baut der Server die Site mit genau diesem Stand neu (Astro-Build als
Kindprozess) und schaltet atomar um. Schlägt ein Build fehl, bleibt die alte Version online.

### Ablage unter `/data`

```
cms/draft.json            Entwurf (meta.revision zählt jede Änderung)
cms/published.json        veröffentlichter Stand
cms/versions/             <zeit>-r<rev>.json je Veröffentlichung + index.json (höchstens 100)
cms/backups/              Originale vor Migrationen, kaputte Dateien (*-kaputt-*)
builds/<id>/              Live-Build: content.json + dist/ (aktueller + ein vorheriger bleiben)
builds/current.json       Zeiger auf den Live-Build { id, revision, codeVersion, builtAt }
builds/preview/<id>/      Vorschau-Build des Entwurfs (+ preview/current.json)
builds/state.json         letzter Auftrag je Art (Status im Dashboard)
builds/logs/<id>.log      Build-Protokolle (die letzten 20)
media/                    hochgeladene Bilder (normalisiert) + .thumbs/ (Vorschaubilder)
astro-cache/              Astro-Bild-Cache über Deploys hinweg (beim ersten Start aus dem Image vorgewärmt)
users.json                im Dashboard angelegte Benutzer (scrypt-Hashes)
passwords.json            selbst gesetzte Passwörter der Env-Benutzer (/passwort, Reset im Dashboard)
events.jsonl              Audit-Log (Speichern, Veröffentlichen, Builds, Medien, Benutzer, Migrationen)
```

Erststart (kein `published.json`): Grundbestand aus `src/cms/seed` wird Entwurf und veröffentlichter Stand
(Revision 1); das `dist/` aus dem Image gilt als aktueller Build. Solange niemand veröffentlicht und niemand
den Entwurf geändert hat, übernimmt jeder Deploy einen geänderten Seed automatisch. Danach kommen Änderungen
am Grundbestand nur noch über Migrationen (`server/lib/cms/migrations.mjs`) in bestehende Daten.

### Abläufe

- **Speichern** (`PUT /api/cms/draft {doc, baseRevision}`): prüft mit `src/cms/validate.mjs` im Entwurfsmodus
  (leere Pflichtfelder = Warnung; Fehler = 422 mit `errors[{path,message}]`). Veraltete Basis → 409.
  Serverseitige Einzeländerungen seit der Basis (Bild hochgeladen/ersetzt/gelöscht, automatische
  Weiterleitungen) werden auf das gespeicherte Dokument nachgespielt — Upload und Speichern kollidieren nicht.
- **Vorschau** (`POST /api/cms/preview`): baut den Entwurf mit `SUS_CMS_EDIT=1` (Editor-Marker) nach
  `builds/preview`. `/admin/vorschau?an=1&next=/pfad` setzt das Cookie `sus_preview`; mit Session liefert der
  Server dann HTML/Assets aus dem Vorschau-Build (Fallback: Live) mit Vorschau-Leiste (nicht bei `?__cms=editor`).
  `?aus=1` beendet die Vorschau.
- **Veröffentlichen** (`POST /api/cms/publish {revision}`): prüfen (streng) → bei geänderten Adressen
  Weiterleitungen ergänzen (301, alt → neu, Ketten verkürzt) → `published.json` + Version → Live-Build → umschalten.
  Unveränderter Inhalt → keine neue Version, nur Neubau (z. B. nach einem fehlgeschlagenen Build).
- **Verwerfen** (`POST /api/cms/draft/discard`) und **Wiederherstellen** (`POST /api/cms/versions/:id/restore`)
  ersetzen den Entwurf; veröffentlicht wird erst mit „Veröffentlichen“.
- **Weiterleitungen** (`redirects[]` des aktuellen Live-Builds) greifen nur, wenn unter dem Pfad keine Datei
  existiert; die Query wird mitgenommen.
- **Medien**: `POST /api/cms/media[?replace=<id>]` (Rohdaten, `Content-Type: image/*`, `X-Filename`, `X-Alt`
  URL-kodiert) — nur JPEG/PNG/WebP/AVIF (Magic Bytes), max. 15 MB, mit sharp gedreht, Metadaten entfernt,
  max. 3000 px (AVIF → WebP). Ersetzen eines Grundbestand-Fotos setzt `replacedBy`. Löschen nur, wenn
  unbenutzt (sonst 409 mit `usages`), Grundbestand nur ersetzbar. Dateien ohne Verweis aus Entwurf und
  veröffentlichtem Stand werden nach ≥ 10 min aufgeräumt. Vor jedem Build: `/data/media` → `src/assets/media`.

Weitere Endpunkte: `GET /api/cms/state` (inkl. `issues` = strenge Prüfung des Entwurfs, `online` = gerade
ausgelieferter Build), `GET /api/cms/build`, `GET /api/cms/versions`, `GET /api/cms/media/:id/file?w=320`
(WebP-Vorschau, Cache in `media/.thumbs`), `POST /api/cms/validate {doc, mode}`. Schreibende Aufrufe:
gleiche Herkunft, `application/json` (Upload: `image/*`), Rate-Limit wie `/api`. `/api/cms/*` und `/admin`
sind auf allen Hosts erreichbar, immer nur mit Login.

### Rollen & Benutzer

| Rolle | Rechte |
|---|---|
| `admin` (auch Altrollen `team`, `inhaberin`) | `cms.view`, `cms.edit`, `cms.publish`, `media.manage`, `users.manage` |
| `redaktion` | alles außer `users.manage` |

- Benutzer aus `SUS_USERS` sind Bootstrap-Zugänge: im Dashboard sichtbar, Passwort dort zurücksetzbar
  (→ `passwords.json`), Name/Rolle/Löschen nur über die Env.
- Dashboard-Benutzer (`users.json`): Benutzername `a–z 0–9 _ -`, Passwort ≥ 10 Zeichen, scrypt.
  Rollenwechsel wirkt sofort, Passwortwechsel/Löschen beendet bestehende Sitzungen.
- Es bleibt immer mindestens ein Admin; niemand kann sich selbst löschen.

### Builds

Ein Worker, Warteschlange (Live vor Vorschau, wartende Aufträge je Art zusammengefasst). Ablauf: Medien-Sync →
`content.json` → `node node_modules/astro/astro.js build` im App-Verzeichnis mit `SUS_CMS_FILE`, `SUS_OUT_DIR`,
`SUS_ASTRO_CACHE_DIR=/data/astro-cache`, `VIPS_CONCURRENCY=1`, `UV_THREADPOOL_SIZE=2`,
`NODE_OPTIONS=--max-old-space-size=1536` (Vorschau zusätzlich `SUS_CMS_EDIT=1`) — ohne Server-Secrets in der
Umgebung, eigene Prozessgruppe, Abbruch nach `SUS_BUILD_TIMEOUT_MIN`. Erfolg → Zeiger umsetzen, neue
Static-Instanz (Kompressions-Cache leer), Weiterleitungen neu laden, alte Builds bis auf einen löschen.

Start-Logik: weichen Code-Version (`.code-version` aus dem Image) oder veröffentlichte Revision vom aktuellen
Build ab, baut der Server im Hintergrund neu; bis dahin liefert er den vorigen Build aus. Gemessen (Smoke-Test,
warmer Bild-Cache, 201 Seiten): Live-Build ≈ 9 s, Vorschau ≈ 7 s, Astro-Prozess ≈ 600 MB RSS.

Zur Laufzeit schreibt der Build außerhalb von `/data` nur nach `/app/src/assets/media` (Medien-Sync) und
`/app/node_modules/.vite` (Vite) — beides gehört im Image dem Benutzer `node`.

### Wiederherstellung

- **Inhalt zurückholen:** Dashboard „Versionen“ bzw. `POST /api/cms/versions/<id>/restore`, dann veröffentlichen.
- **Live-Build zurückschalten** (z. B. fehlerhafter Code-Stand): in `/data/builds/current.json` die `id` des
  vorherigen Build-Ordners eintragen und neu starten, mit `SUS_BUILD_ON_START=0`, solange der Fehler besteht.
  `current.json` löschen → das `dist/` aus dem Image gilt wieder (Neubau beim Start, falls Inhalt abweicht).
- **Kaputte Dateien:** `draft.json` unlesbar → wird gesichert (`cms/backups/draft-kaputt-*`) und aus dem
  veröffentlichten Stand neu angelegt; `published.json` unlesbar → neueste Version gilt.
- **Rollback auf älteren Code nach einer Migration:** Server meldet „schreibgeschützt“ (Inhalt hat neuere
  Formatversion) und liefert weiter aus. Entweder wieder neueren Code deployen oder die Sicherung aus
  `cms/backups/*-v<alt>.json` als `draft.json`/`published.json` zurückkopieren.
- **Build hängt/scheitert:** Status und Protokoll-Ende im Dashboard, volles Protokoll in `builds/logs/<id>.log`.
- **Komplett neu aus dem Seed** (verwirft alle Inhalte!): Container stoppen, `/data/cms` und `/data/builds`
  wegsichern, starten.

## Lokal starten

```sh
pnpm build
SUS_USERS='[{"id":"konrad","name":"Konrad","role":"team","hash":"scrypt$…"}]' \
  SUS_DATA_DIR=/tmp/sus-data PORT=4412 node server/index.mjs
```

Hosts simulieren per Host-Header (Cookies sind auf echten Hosts `Secure` → bei curl über http
den Cookie-Wert direkt mitgeben):

```sh
curl -i -H 'Host: sauerundsaftig.de' http://127.0.0.1:4412/karte            # 302 /login?next=… (vor Go-Live)
curl -i -H 'Host: sauerundsaftig.de' -d 'user=konrad&password=…' http://127.0.0.1:4412/login
curl -i -H 'Host: checkliste.sauerundsaftig.de' -H 'Cookie: sus_session=…' http://127.0.0.1:4412/api/checklist
curl -H 'Host: sauerundsaftig.de' http://127.0.0.1:4412/api/golive
curl -H 'Authorization: Bearer $SUS_EXPORT_TOKEN' -H 'Host: checkliste.sauerundsaftig.de' http://127.0.0.1:4412/api/export.md
```

Im Browser funktioniert `http://localhost:4412` direkt (Vorschau-Host, Cookie ohne `Secure`).

CMS lokal (Builds laufen im Repo-Verzeichnis; auf dem Server RAM-schonend nur serialisiert):

```sh
curl -s -c /tmp/jar -d 'user=konrad&password=…' http://127.0.0.1:4412/login
curl -s -b /tmp/jar http://127.0.0.1:4412/api/cms/state > /tmp/state.json           # Entwurf + Status
curl -s -b /tmp/jar -X PUT -H 'Content-Type: application/json' \
  --data-binary @/tmp/put.json http://127.0.0.1:4412/api/cms/draft                  # {"doc":…,"baseRevision":n}
curl -s -b /tmp/jar -X POST -H 'Content-Type: application/json' -d '{"revision":n}' http://127.0.0.1:4412/api/cms/publish
curl -s -b /tmp/jar http://127.0.0.1:4412/api/cms/build                             # bis live.state = ok
```

Tests: `pnpm test` (alle), `pnpm test:server` (nur Server, Fixtures unter `tests/server/fixtures`),
`pnpm test:cms` (CMS mit Fake-Builder; echte Testbilder per sharp).

## Deploy (Coolify)

- Buildpack **Dockerfile**, Port **3000**, Healthcheck `/healthz` ist im Image.
- **Persistent Storage** auf `/data` anlegen — sonst gehen Checkliste, Bewertungen und alle CMS-Inhalte bei
  jedem Deploy verloren. Der Entrypoint macht `/data` für den Benutzer `node` beschreibbar und startet den
  Server ohne Root.
- Das Image enthält Quellen + `node_modules` (Builds zur Laufzeit, ca. +400 MB) und `/app/.code-version`.
  Nach einem Deploy mit neuem Code baut der Server einmal im Hintergrund neu (≈ 10–60 s); bis dahin bleibt
  der vorige Build online.
- Domains der App: `sauerundsaftig.de`, `www.sauerundsaftig.de`, `checkliste.sauerundsaftig.de`,
  `module.sauerundsaftig.de`, `sauerundsaftig.jawollja.gmbh` (alle auf dieselbe App).
- Env setzen: `SUS_USERS_B64`, `SUS_SESSION_SECRET`, `SUS_EXPORT_TOKEN` (Rest = Defaults). Erzeugen: `printf '%s' "$SUS_USERS" | base64 -w0 | tr '+/' '-_' | tr -d '='`.
- Traefik hängt die direkte Client-Adresse rechts an `X-Forwarded-For`; der Server nimmt den letzten Wert fürs Login-Rate-Limit. Port 3000 bleibt ausschließlich im internen Proxy-Netz und erhält kein öffentliches Port-Mapping.
  `X-Forwarded-Host` wird bewusst ignoriert — nur der `Host`-Header zählt.
- Go-Live passiert automatisch zur Uhrzeit in `SUS_GO_LIVE_AT` (kein Deploy nötig). Notbremse: `SUS_FORCE_PRIVATE=1`.
