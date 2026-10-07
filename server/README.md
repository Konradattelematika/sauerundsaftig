# Server — Sauer & Saftig

Node-22-Server ohne npm-Abhängigkeiten (nur `node:*`). Liefert `dist/` aus, routet nach Host,
übernimmt Login, Go-Live-Schranke und die JSON-API. Vertrag: `docs/LIVE-PLAN.md` §2.

```
server/index.mjs            Start (liest Env, SIGTERM → sauberer Shutdown)
server/hash-password.mjs    Passwort-Hash für SUS_USERS erzeugen
server/lib/config.mjs       Env → Konfiguration
server/lib/host-policy.mjs  Host-Routing als reine Funktionen (§2.2)
server/lib/auth.mjs         scrypt, Session-Cookie (HMAC), next-Prüfung, Rate-Limit
server/lib/static.mjs       Dateien aus dist/ (Traversal-Schutz, ETag, gzip/brotli)
server/lib/store.mjs        JSON-Persistenz (atomar, serialisiert, events.jsonl, Seed-Merge)
server/lib/api.mjs          /api/… (§2.5)
server/lib/export.mjs       /api/export und /api/export.md
server/seed/checklist.json  Seed der Checkliste (gehört Agent C; fehlt sie → leere Liste)
```

## Umgebungsvariablen

| Variable | Default | Bedeutung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port |
| `HOST` | `0.0.0.0` | Listen-Adresse |
| `SUS_USERS` | — | JSON-Array `[{"id":"konrad","name":"Konrad","role":"team","hash":"scrypt$…"}]`, Rollen `team` \| `inhaberin`. Leer/kaputt → niemand kann sich anmelden (Warnung im Log) |
| `SUS_SESSION_SECRET` | zufällig | HMAC-Schlüssel für Cookies (≥ 32 Zeichen). Fehlt er, gelten Sessions nur bis zum Neustart |
| `SUS_EXPORT_TOKEN` | — | Bearer-Token für `/api/export(.md)` ohne Login (≥ 24 Zeichen) |
| `SUS_GO_LIVE_AT` | `2026-10-10T16:00:00+02:00` | Ab dann ist der Live-Host öffentlich. Ungültig → bleibt privat |
| `SUS_FORCE_PRIVATE` | `0` | `1` hält den Live-Host auch nach Go-Live hinter Login |
| `SUS_LIVE_HOSTS` | `sauerundsaftig.de` | Kommaliste |
| `SUS_WWW_HOSTS` | `www.sauerundsaftig.de` | 301 → `https://<erster Live-Host>` |
| `SUS_TOOL_HOSTS` | `checkliste.sauerundsaftig.de=checkliste,module.sauerundsaftig.de=module` | Host=Präfix |
| `SUS_COOKIE_DOMAIN` | `sauerundsaftig.de` | Cookie-Domain für Hosts, die darauf enden (ein Login für alle Subdomains); leer = nie |
| `SUS_DIST_DIR` | `dist` (relativ zum Repo; Container `/app/dist`) | Build-Ausgabe |
| `SUS_DATA_DIR` | `/data` | `checklist.json`, `module.json`, `events.jsonl` |
| `SUS_SEED_FILE` | `server/seed/checklist.json` | Seed der Checkliste |
| `SUS_QUIET` | `0` | `1` schaltet das Access-Log ab |

Alle anderen Hosts (z. B. `sauerundsaftig.jawollja.gmbh`, `localhost`) sind Vorschau-Hosts: alles mit Login.

## Benutzer anlegen

```sh
node server/hash-password.mjs 'langes-passwort'          # oder: printf '%s' '…' | node server/hash-password.mjs
# → scrypt$32768$8$1$<salt>$<hash>  in SUS_USERS als "hash" eintragen
```

Passwort ändern = neuen Hash eintragen → alte Sessions dieses Benutzers werden ungültig.

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

Tests: `pnpm test` (alle) bzw. `pnpm test:server` (nur Server, Fixtures unter `tests/server/fixtures`).

## Deploy (Coolify)

- Buildpack **Dockerfile**, Port **3000**, Healthcheck `/healthz` ist im Image.
- **Persistent Storage** auf `/data` anlegen — sonst gehen Checkliste und Bewertungen bei jedem Deploy verloren.
  Der Entrypoint macht `/data` für den Benutzer `node` beschreibbar und startet den Server ohne Root.
- Domains der App: `sauerundsaftig.de`, `www.sauerundsaftig.de`, `checkliste.sauerundsaftig.de`,
  `module.sauerundsaftig.de`, `sauerundsaftig.jawollja.gmbh` (alle auf dieselbe App).
- Env setzen: `SUS_USERS`, `SUS_SESSION_SECRET`, `SUS_EXPORT_TOKEN` (Rest = Defaults).
- Traefik setzt `X-Forwarded-For`; der Server nimmt daraus die erste Adresse fürs Login-Rate-Limit.
  `X-Forwarded-Host` wird bewusst ignoriert — nur der `Host`-Header zählt.
- Go-Live passiert automatisch zur Uhrzeit in `SUS_GO_LIVE_AT` (kein Deploy nötig). Notbremse: `SUS_FORCE_PRIVATE=1`.
