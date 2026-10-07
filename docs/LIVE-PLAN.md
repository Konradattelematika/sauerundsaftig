# LIVE-PLAN — sauerundsaftig.de, Checkliste, Module

Stand: 07.10.2026 · Orchestrator-Job 20261007-082052-web · Zeitzone für alles Sichtbare: Europe/Berlin

Die Website ist ein Überraschungs-Geburtstagsgeschenk für Josie (Inhaberin). Bis zur Übergabe
bleibt alles hinter Login + noindex. Nichts darf Josie vorher erreichen (keine Mails, keine
öffentlichen Links).

## 1. Ziel

| Host | Inhalt | Zugang |
|---|---|---|
| `sauerundsaftig.de` | **nur Variante A „Krume"**, im Wurzelpfad (`/karte`, `/besuch`, …) | bis Go-Live nur mit Login; ab **10.10.2026 16:00 Europe/Berlin** (= `2026-10-10T14:00:00Z`) automatisch öffentlich + indexierbar |
| `www.sauerundsaftig.de` | 301 → `https://sauerundsaftig.de` (DNS zeigt noch auf All-Inkl → Checklisten-Punkt) | — |
| `checkliste.sauerundsaftig.de` | To-do-Liste vor/nach Go-Live für Team (Konrad, Lukas, Nicole) und Josie, mit Feedback je Punkt | immer Login |
| `module.sauerundsaftig.de` | Entscheidungs-Board: je Grundlage/Komponente/Block die Live-Version + 3 Alternativen, bewerten/kommentieren/entscheiden | immer Login |
| `sauerundsaftig.jawollja.gmbh` | interne Vorschau: alles (A im Wurzelpfad, B/C/D, `/varianten`, `/module`, `/checkliste`) | immer Login, noindex |

## 2. Architektur

Ein Repo, ein Astro-Static-Build (`dist/`), **ein Node-22-Server ohne Abhängigkeiten**
(`server/`), der `dist/` ausliefert, nach Host routet, Login/Go-Live-Schranke und die JSON-API
übernimmt. Ein Docker-Image, eine Coolify-App mit allen Domains, Persistenz unter `/data`
(Coolify Persistent Storage).

### 2.1 dist-Layout (Vertrag zwischen Build und Server)

```
dist/index.html, dist/karte/…, dist/besuch/…   Variante A im Wurzelpfad (früher /a/…)
dist/404.html                                    404 von Variante A
dist/login/index.html                            Login-Seite (A-Design, Astro-Seite src/pages/login.astro)
dist/varianten/index.html                        alter Variantenwähler (nur Vorschau-Host)
dist/b/… dist/c/… dist/d/… dist/dev/…            alte Varianten (nur Vorschau-Host)
dist/checkliste/index.html                       Checklisten-App (Client-JS gegen /api/checklist)
dist/module/index.html, dist/module/<item>/…     Modul-Board
dist/module/vorschau/<item>/<option>/index.html  Einzelvorschau einer Option (für iframes/Vollbild)
dist/_astro/…, dist/brand/…, dist/favicon.ico, dist/site.webmanifest   gemeinsame Assets
```

`trailingSlash: 'never'`, Seiten sind `…/index.html`. Alle internen Links der Tools beginnen mit
ihrem Präfix (`/module/…`, `/checkliste`), API-Aufrufe mit `/api/…`.

### 2.2 Host-Routing (Server)

- **Live-Host** `sauerundsaftig.de`:
  - Pfad `X` → `dist/X` (bzw. `dist/X/index.html`), sonst `dist/404.html` mit Status 404.
  - Gesperrt (→ 404): `/b`, `/c`, `/d`, `/dev`, `/varianten`, `/module`, `/checkliste`, `/api/*` außer `/api/golive`.
  - `/a` und `/a/*` → 301 auf den Pfad ohne `/a` (alte Vorschau-Links).
  - **Vor Go-Live:** alles außer `/login`, `/logout`, `/healthz`, `/api/golive`, `/robots.txt` und Asset-Pfaden
    (`/_astro/`, `/brand/`, `/favicon.ico`, `/site.webmanifest`) verlangt eine Session → sonst 302 auf
    `/login?next=<pfad>`. Header `X-Robots-Tag: noindex, nofollow, noarchive`; `robots.txt` = `Disallow: /`.
  - **Ab Go-Live:** keine Session nötig, kein X-Robots-Tag, `robots.txt` = `Allow: /` +
    `Sitemap: https://sauerundsaftig.de/sitemap-index.xml`.
- **Tool-Hosts** (`checkliste.…` → Präfix `checkliste`, `module.…` → Präfix `module`): immer Session.
  `/` → `dist/<präfix>/index.html`; Pfade, die mit `/<präfix>` beginnen → `dist/X`; sonst zuerst
  `dist/<präfix>/X`, dann `dist/X`. noindex, `robots.txt` = Disallow.
- **Vorschau-Host(s)** (`sauerundsaftig.jawollja.gmbh`, `localhost`, unbekannte Hosts): immer Session,
  `dist/X`, noindex, `/a/*` → 301 wie oben.
- Überall: `/healthz` (ohne Auth, `ok`), `/login` (GET = Seite, POST = Anmeldung), `/logout` (POST/GET).

### 2.3 Login

- Benutzer aus Env `SUS_USERS` (JSON-Array `[{ "id":"konrad", "name":"Konrad", "role":"team", "hash":"scrypt$…" }]`),
  Rollen `team` | `inhaberin`. Hash-Werkzeug: `node server/hash-password.mjs <passwort>`.
- Session-Cookie `sus_session`: HMAC-SHA256-signiert (`SUS_SESSION_SECRET`), HttpOnly, Secure (außer localhost),
  SameSite=Lax, 30 Tage und hostgebunden. Dadurch ist je Subdomain eine Anmeldung nötig; insbesondere wird die
  Sitzung nicht an den bis zur DNS-Umstellung fremd gehosteten `www`-Host gesendet.
- Login-Formular: Felder `user` (Benutzername, case-insensitive) + `password` + hidden `next`.
  Fehler → 303 auf `/login?fehler=1&next=…`. Einfaches Rate-Limit pro IP.

### 2.4 Go-Live

- Env `SUS_GO_LIVE_AT` (Default `2026-10-10T16:00:00+02:00`), `SUS_FORCE_PRIVATE=1` hält die Schranke auch danach zu.
- `GET /api/golive` (auf allen Hosts, ohne Auth) → `{ "goLiveAt": "<ISO>", "live": bool, "now": "<ISO>" }`.
- `src/data/site.json` → `goLiveAt` ist derselbe Zeitpunkt für den Countdown im Build (Fallback, wenn die API fehlt).

### 2.5 API (JSON, alle Schreibaufrufe mit Session; Host egal außer Live-Host)

```
GET  /api/me                                  → { user: { id, name, role } } | 401
GET  /api/checklist                           → { items: Item[], comments: Comment[] }
POST /api/checklist/items                     { title, description?, phase, owner, priority?, category? } → Item
PATCH /api/checklist/items/:id                { status?, title?, description?, phase?, owner?, priority?, category?, assignee? } → Item
POST /api/checklist/items/:id/comments        { text, kind? } → Comment
PATCH /api/checklist/comments/:id             { resolved: bool } → Comment
GET  /api/module/state                        → { votes: Vote[], choices: Choice[] }
PUT  /api/module/votes                        { itemId, optionId, rating, comment } → Vote   (Upsert je user+item+option)
PUT  /api/module/choices                      { itemId, optionId | null } → Choice | { removed: true }
GET  /api/export                              → JSON aller Daten (Session ODER Header `Authorization: Bearer $SUS_EXPORT_TOKEN`)
GET  /api/export.md                           → dasselbe als Markdown (offenes Feedback zuerst)
```

Typen:

```ts
Item    = { id, title, description, phase: 'vor'|'nach', owner: 'team'|'josie'|'beide', assignee?: string,
            status: 'offen'|'in_arbeit'|'erledigt'|'verworfen', priority: 'blocker'|'wichtig'|'normal',
            category: string, link?: string, createdAt, updatedAt, updatedBy }        // updatedBy = user-id | 'seed'
Comment = { id, itemId, userId, userName, role, text, kind: 'feedback'|'frage'|'antwort', resolved: bool, createdAt }
Vote    = { itemId, optionId, userId, userName, rating: 'nein'|'gut'|'super'|null, comment: string, updatedAt }
Choice  = { itemId, optionId, userId, userName, updatedAt }
```

IDs: `itemId`/`optionId` des Modul-Boards `^[a-z0-9-]{1,64}$`. Zeitstempel ISO-UTC, Anzeige im Client in Europe/Berlin.

### 2.6 Persistenz

`SUS_DATA_DIR` (Default `/data`): `checklist.json`, `module.json`, `events.jsonl` (Audit: jede Änderung mit
user + Zeit). Atomar schreiben (tmp + rename), Schreibzugriffe serialisieren.
Seed: `server/seed/checklist.json` (`{ items: [...] }` mit festen `id`s). Beim Start werden fehlende Seed-Items
ergänzt; vorhandene Items nur aktualisiert, solange `updatedBy === 'seed'` (also nie von Menschen angefasst).

## 3. Modul-Board — Katalog-Konvention

Jedes Element liegt in `src/module/items/<id>/`:

- `meta.ts` — `export default { … } satisfies ModuleItem` (Typ in `src/module/types.ts`).
- `kind: 'block'` → `Live.astro`, `Alt1.astro`, `Alt2.astro`, `Alt3.astro`. `Live.astro` rendert die echte
  Komponente/Sektion von Variante A (Import aus `src/variants/a-krume/…`), die Alternativen sind eigene,
  vollwertige Umsetzungen mit echten Inhalten (`src/data/site.json`, Content-Collections, echte Fotos über
  `src/lib/images.ts`/`Figure`). Keine Lorem-Ipsum-Texte.
- `kind: 'token'` → `alt.css` mit Regeln **nur** unter `html[data-alt-<id>="alt-1|alt-2|alt-3"] { … }`
  (überschreibt die Tailwind-Tokens `--color-*`, `--font-*`, `--radius-*` bzw. Terrazzo-Klassen). Vorschau
  = `src/module/Musterseite.astro` (echte A-Bausteine als Mini-Startseite) mit gesetztem Attribut.
- Vorschau-Route `src/pages/module/vorschau/[item]/[option].astro` (Skelett vorhanden) rendert beides in
  `src/module/PreviewShell.astro` (A-Styles, Terrazzo-URL, alle `alt.css`).
- Katalog-Lader: `src/module/catalog.ts` (`import.meta.glob`), also **keine zentrale Liste, die mehrere
  Agenten anfassen**.

Katalog (16 Elemente, je Live + 3 Alternativen):

| Gruppe | id | Titel | kind |
|---|---|---|---|
| grundlagen | `farben` | Farbwelt | token |
| grundlagen | `schriften` | Schriften | token |
| grundlagen | `formen` | Formen & Ecken | token |
| grundlagen | `muster` | Muster & Material (Terrazzo) | token |
| komponenten | `buttons` | Buttons & Links | block |
| komponenten | `oeffnungsstatus` | Öffnungsstatus | block |
| komponenten | `karten-eintrag` | Eintrag auf der Speisekarte | block |
| komponenten | `header` | Kopfzeile & Navigation | block |
| komponenten | `footer` | Fußzeile | block |
| bloecke | `hero` | Startseiten-Bühne | block |
| bloecke | `heute-frisch` | Heute-frisch-Tafel | block |
| bloecke | `schnecken` | Schnecken-Bühne (Signature) | block |
| bloecke | `besuch` | Besuch & Öffnungszeiten | block |
| bloecke | `stimmen` | Gästestimmen | block |
| bloecke | `instagram` | Instagram-Feed | block |
| bloecke | `zeitstrahl` | 18-Stunden-Zeitstrahl | block |

Board-Bedienung (für Josie, mobil zuerst): je Option ansehen (Vorschau + Vollbild), bewerten
**Nein (abwählen) · Gut · Super gut**, kommentieren, und je Element **eine** Option aktiv als Entscheidung
markieren. Die Stimmen der anderen sind sichtbar (Name + Bewertung).

## 4. Arbeitsteilung (Worktrees, je eigener Branch)

| Agent | Modell | Besitzt (nur diese Dateien anlegen/ändern) |
|---|---|---|
| R — Umbau & Feedback | Opus | `src/pages/**` außer `login.astro`/`checkliste/**`/`module/**`, `src/variants/a-krume/**`, `src/components/shared/**`, `src/content/**`, `src/data/site.json`, `src/lib/**`, `astro.config.mjs`, `scripts/test-routes.mjs` |
| S — Server & Deploy | Opus | `server/**` (außer `server/seed/`), `src/pages/login.astro`, `Dockerfile`, `docker-compose.yml`, `deploy/**`, `public/robots.txt`, `tests/server/**`, `package.json` (nur `scripts`) |
| C — Checkliste | Opus | `src/pages/checkliste/**`, `src/checkliste/**`, `server/seed/checklist.json` |
| M1 — Board + Grundlagen | Fable | `src/module/*` (Rahmen), `src/pages/module/**`, `src/module/items/{farben,schriften,formen,muster}/**`; darf Font-Pakete ergänzen (`package.json`/`pnpm-lock.yaml`) |
| M2 — Komponenten | Fable | `src/module/items/{buttons,oeffnungsstatus,karten-eintrag,header,footer}/**` |
| M3 — Blöcke | Opus | `src/module/items/{hero,heute-frisch,schnecken,besuch,stimmen,instagram,zeitstrahl}/**` |

Gemeinsam: deutsche UI-Texte (Du-Ansprache wie auf der Site), Design von Variante A, keine neuen
Runtime-Abhängigkeiten im Server, `pnpm build` muss grün sein, keine Pushes/Deploys durch Agenten.
