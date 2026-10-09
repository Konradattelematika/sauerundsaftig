# CMS-PLAN — Admin-Dashboard für sauerundsaftig.de

Stand: 08.10.2026 · Branch `cms` · Orchestrator-Job 20261007-082052-web · Zeitzone für alles Sichtbare: Europe/Berlin

## 1. Analyse (Ist-Zustand)

| Thema | Befund |
|---|---|
| Framework | Astro 5 (statischer Build, `trailingSlash: never`), Tailwind v4, TypeScript; Inseln in Vanilla-TS (kein UI-Framework) |
| Seiten | Live-Site = Variante A „Krume" im Wurzelpfad: 17 Seitendateien in `src/pages/*.astro`, `karte/**`, `sauerteig/**`; dazu Systemseiten (login, passwort, countdown, 404, varianten) und interne Tools (`/checkliste`, `/module`) sowie Altvarianten `/b /c /d` |
| Komponenten | `src/variants/a-krume/**` (Header, Footer, Figure, SectionIntro, VisitModule, HeuteFrischBoard, SchneckenTeaser, SocialProof, InstagramFeed, MenuItemsList, Timeline …), `src/components/shared/**` (OpeningStatus, StickyBar, PreorderFlow, VoucherConfigurator, NewsletterForm, ClickToLoadMap, SeoHead) |
| Inhalte | ca. 350 fest verdrahtete Textstellen in Seiten/Komponenten; Stammdaten in `src/data/site.json` (66 Importe); Sammlungen als Astro Content Collections (`menu`, `faq`, `testimonials`, `heute-frisch`; `journal`/`workshops` nur noch Altvarianten); Navigation in `src/lib/variants.ts`; Rechtstexte in `src/lib/legal.ts`; Bild-Alt-Texte in `src/lib/images.ts` |
| Bilder | `astro:assets` (Picture, 5 Breiten, webp/avif) über Motiv-Keys (`lib/images.ts`): 18 echte Fotos, 17 Platzhalter |
| Backend | eigener Node-22-Server ohne Abhängigkeiten (`server/`): Host-Routing, Go-Live-Schranke, Login (scrypt, HMAC-Session), Rollen `team`/`inhaberin`, JSON-API für Checkliste/Modul-Board |
| Datenbank | keine — Persistenz als JSON-Dateien unter `/data` (atomar, serialisiert, Audit-Log), Coolify-Volume |
| Admin | keiner für Inhalte; nur Checkliste/Modul-Board und `/passwort` |
| Deploy | Dockerfile (Build-Stage pnpm build → Runtime node:22-alpine), Coolify, Push + API-Trigger |

## 2. Architekturentscheidung

**Die Website bleibt statisch.** Inhalte liegen als ein JSON-Dokument (`SiteDoc`, `src/cms/types.ts`) im vorhandenen
`/data`-Speicher. Beim **Veröffentlichen** baut der vorhandene Node-Server die Site im Container mit genau diesem
Inhaltsstand neu (Astro-Build in ein neues Verzeichnis) und schaltet atomar um. Entwürfe werden genauso in ein
Vorschau-Verzeichnis gebaut und nur angemeldeten Redakteur:innen gezeigt.

Warum: Dieselben Astro-Komponenten rendern wie bisher → Design garantiert gleich (per Pixelvergleich geprüft), keine
Laufzeitkosten für Besucher, kein SSR-Umbau, keine neue Datenbank. Erweiterung statt Neubau.

Auswirkungen (bewusst in Kauf genommen):
- Das Runtime-Image enthält künftig Quellcode + `node_modules` (Build-Werkzeug), ca. +400 MB.
- Veröffentlichen dauert je nach Bild-Cache 10–60 s (Fortschritt im Dashboard); schlägt ein Build fehl, bleibt die alte Version online.
- Kurzzeitig erhöhter RAM/CPU-Bedarf beim Build (begrenzt: ein Build gleichzeitig, `VIPS_CONCURRENCY=1`, Heap-Limit).
- Neuer Code (Deploy) baut beim Start einmal mit dem veröffentlichten Inhalt nach; bis dahin läuft der vorige Build weiter.

Nicht im CMS (bewusst, dokumentiert): Login-/Passwort-Systemseiten, Countdown-Bühne (läuft nur bis 19.10.), interne Tools
(Checkliste, Modul-Board), Altvarianten B/C/D, Validierungs-Mikrotexte in den Formular-Inseln.

## 3. Datenmodell

`src/cms/types.ts` ist verbindlich. Kurz: `SiteDoc = { schemaVersion, settings, navigation, layout, pages[], collections, media[], redirects[] }`.
- `settings` ersetzt `src/data/site.json` — gleiche Feldnamen. Ein Vite-Plugin (astro.config.mjs) liefert bei jedem
  Import von `data/site.json` die CMS-Einstellungen aus → alle 66 Importstellen bleiben unverändert.
- `pages[]`: `PageDoc` mit `id`, `slug`, `status`, `kind` (builtin/custom), SEO, `sections[]` (`{id,type,visible,fields}`).
- `collections`: `menu` (Kategorien + Einträge), `faq`, `testimonials`, `heuteFrisch`.
- `media[]`: Bibliothek (builtin = Fotos im Repo, placeholder, upload); `replacedBy` ersetzt ein Foto überall.
- Linkziele als `Href`: `page:<id>[#anker]` (folgt Slug-Änderungen), `/pfad`, `https://…`, `mailto:`, `tel:`, `{{tel}}`, `{{route}}`.
- Texte: reiner Text (escaped). `rich`-Felder: kleines sicheres Markup (`src/cms/rich.mjs`), Platzhalter `{{phoneDisplay}}` usw.

Seed (= heutige Inhalte, im Repo): `src/cms/seed/{settings,navigation,layout,media,redirects}.json`,
`seed/collections/*.json`, `seed/pages/<id>.json` (eine PageDoc je Datei, Feld `order` für die Reihenfolge).
Lader: `src/cms/store.mjs` (`SUS_CMS_FILE` oder Seed). Erstbefüllung: `scripts/cms-seed-init.mjs`.

Migrationen: `schemaVersion` + `server/lib/cms/migrations.mjs` (geordnete Funktionen; vor jeder Migration Backup).

## 4. Sektionen (Vertrag für alle Seiten)

Ordner `src/cms/sections/<typ>/` mit
- `definition.mjs` — `export default { type, label, description, allowedOn, fields, defaults }` (reines JS: Server,
  Admin und Build nutzen dieselbe Definition). Feldtypen s. `FieldKind`.
- `Section.astro` — Props `{ section, page, context }`. Markup **1:1** aus der bisherigen Seite übernommen, nur
  Literale durch Feldwerte ersetzt. Wurzelelement bekommt `{...editSection(section)}`, jedes editierbare Element
  `{...editAttrs(section, 'feld' | 'liste.2.feld', kind)}` (nur im Editor-Build vorhanden → Live-Markup identisch).
- Hilfen aus `src/cms/index.ts`: `rich()`, `plain()`, `tokens()`, `href()`, `linkAttrs()`, `shown()`, `media()`,
  `pageHref()`, `cms()`. Bilder weiter über `Figure motif={field.media}` (Medien-ID = Motiv-Key) und `alt`.
- Wiederholbare Inhalte = `list`-Felder (hinzufügen/löschen/sortieren im Admin).
- Generische Typen (`allowedOn: '*'`, für neue Seiten): text, bild-text, hero, karten, faq, cta, stimmen, besuch,
  heute-frisch, schnecken, instagram, newsletter, zitat … — nur aus vorhandenen A-Bausteinen, kein neues Design.
  Seitenspezifische Typen (`allowedOn: ['besuch']`) nur, wo das Markup einzigartig ist.
- **Design-Regel:** `node scripts/visual-regression.mjs compare /tmp/sus-vr-baseline <neu>` muss für jede umgebaute Seite
  „Identisch" melden (Pixel in 390/768/1440 px **und** sichtbarer Text, Meta, JSON-LD, Links, Alt-Texte).

## 5. Seiten

Alle Live-Seiten laufen über `src/pages/[...slug].astro` (Brotkrumen über `showBreadcrumbs`/`breadcrumb`,
strukturierte Daten über `structuredData`, SEO aus `page.seo`). Die alte Seitendatei wird nach dem Umbau gelöscht.

| id | slug | Quelle bisher | Paket |
|---|---|---|---|
| start | '' | index.astro | P1 |
| nicht-gefunden | 404 (`system: true`, Route bleibt src/pages/404.astro) | 404.astro | P1 |
| karte | karte | karte/index.astro | P2 |
| karte-kategorie | karte/* (`template: 'menu-category'`) | karte/[slug].astro | P2 |
| karte-schnecken | karte/schnecken | karte/schnecken.astro | P2 |
| sauerteig | sauerteig | sauerteig/index.astro | P2 |
| besuch | besuch | besuch.astro | P2 |
| faq | faq | faq.astro | P2 |
| vorbestellen | vorbestellen | vorbestellen.astro | P2 |
| shop | shop | shop.astro | P2 |
| ueber-uns | ueber-uns | ueber-uns.astro | P3 |
| ueber-mich | ueber-mich | ueber-mich.astro | P3 |
| gastgeber | gastgeber | gastgeber.astro | P3 |
| kontakt | kontakt | kontakt.astro | P3 |
| jobs | jobs | jobs.astro | P3 |
| impressum | impressum (noindex) | impressum.astro + lib/legal.ts | P3 |
| datenschutz | datenschutz (noindex) | datenschutz.astro + lib/legal.ts | P3 |

Header, Footer, StickyBar, Navigation und `layout.json` → P1 (Header bekommt Dropdown-Unterstützung für `children`,
ohne Kinder unverändertes Markup). Neue Seiten (kind custom) bestehen nur aus `allowedOn: '*'`-Typen.

## 6. Medien

Upload (Server): nur JPEG/PNG/WebP/AVIF (Magic Bytes), max. 15 MB, mit sharp normalisiert (EXIF-Drehung, Metadaten
entfernt, max. 3000 px), gespeichert unter `/data/media/<id>.<ext>`, Eintrag `{kind:'upload', file:'media/<datei>'}`.
Vor jedem Build kopiert der Server `/data/media/*` nach `src/assets/media/` (gitignored); `lib/images.ts` löst
Uploads und `replacedBy` darüber auf. Responsive Darstellung bleibt `astro:assets` (Picture, gleiche Breiten).

## 7. Server (Paket S)

### 7.1 Speicher (`/data`)
`cms/draft.json`, `cms/published.json` (je SiteDoc + `meta.revision`), `cms/versions/<zeit>-r<rev>.json` (+ Index,
max. 100), `builds/<id>/{content.json,dist/}`, `builds/current.json` (Zeiger: id, dir, revision, codeVersion),
`builds/preview/`, `media/`, `astro-cache/`, `users.json` (im Dashboard angelegte/geänderte Benutzer), vorhandene
`passwords.json`. Erststart: kein published → Seed als draft+published (Revision 1), Image-dist gilt als aktueller Build.

### 7.2 Rollen & Rechte (serverseitig geprüft)
Rollen `admin` (alles) und `redaktion` (alles außer Benutzerverwaltung); Altrollen `team`/`inhaberin` = `admin`.
Rechte: `cms.view`, `cms.edit`, `cms.publish`, `media.manage`, `users.manage`. Keine Passwörter im Code; neue Benutzer
mit scrypt-Hash in `users.json`.

### 7.3 API (`/api/cms/*`, JSON, Session nötig; schreibend: same-origin + `application/json`, außer Medien-Upload)
```
GET    /api/cms/state                      → { draft, draftMeta, publishedMeta, dirty, live: Build, preview: Build|null, me:{id,name,role,permissions}, codeVersion }
PUT    /api/cms/draft {doc, baseRevision}  → { revision, updatedAt } | 409 Konflikt | 422 { errors:[{path,message}] }
POST   /api/cms/draft/discard              → Entwurf = veröffentlichter Stand
POST   /api/cms/preview                    → 202 { build }  (Vorschau-Build des Entwurfs)
POST   /api/cms/publish {revision}         → 202 { build }  (prüfen → Version sichern → veröffentlichen → Live-Build → umschalten)
GET    /api/cms/build                      → { live: Build, preview: Build|null }
GET    /api/cms/versions                   → [{ id, revision, publishedAt, publishedBy }]
POST   /api/cms/versions/:id/restore       → { revision }  (Version → Entwurf)
GET    /api/cms/media/:id/file?w=320       → Bild (Vorschau im Admin, auch builtin/placeholder)
POST   /api/cms/media[?replace=<id>]       → Rohdaten-Body (Content-Type image/*), Header X-Filename, X-Alt (URL-kodiert) → MediaItem (im Entwurf)
DELETE /api/cms/media/:id                  → 409 { usages } wenn verwendet
GET/POST /api/cms/users · PATCH/DELETE /api/cms/users/:id   (users.manage)
Build = { id, kind:'live'|'preview', state:'queued'|'running'|'ok'|'failed', revision, startedAt, finishedAt, error?, logTail? }
```
Vorschau-Modus: `GET /admin/vorschau?an=1&next=/pfad` / `?aus=1` setzt/löscht Cookie `sus_preview`; mit gültiger
Session (`cms.view`) liefert der Server dann HTML/Assets aus `builds/preview/dist` (Fallback aktueller Build) und blendet
eine schmale Vorschau-Leiste ein (nicht bei `?__cms=editor`). `/admin` → `dist/admin/index.html` (Session + `cms.view`).
Weiterleitungen: `redirects[]` des aktuellen Builds (301), automatisch angelegt, wenn sich beim Veröffentlichen ein Slug ändert.
`/api/cms/*` und `/admin` sind auf allen Hosts erreichbar (immer mit Login).

### 7.4 Build-Pipeline
Ein Worker, Warteschlange (Live vor Vorschau, Vorschau-Aufträge zusammengefasst). Ablauf: Medien-Sync →
`content.json` schreiben → `node node_modules/astro/astro.js build` im App-Verzeichnis mit `SUS_CMS_FILE`,
`SUS_OUT_DIR`, `SUS_ASTRO_CACHE_DIR=/data/astro-cache`, (Vorschau: `SUS_CMS_EDIT=1`), `VIPS_CONCURRENCY=1`,
`NODE_OPTIONS=--max-old-space-size=1536`, Timeout 10 min → Erfolg: Zeiger umsetzen, Static-Cache neu, alte Builds bis
auf einen löschen. `codeVersion` (Hash der Quellen, beim Image-Build erzeugt) entscheidet, ob nach einem Deploy neu gebaut wird.

## 8. Admin-Dashboard (Paket A)

`/admin` — eine Astro-Seite + Client-App in Vanilla-TS (`src/admin/**`), Design im Krume-Look (Tokens aus `a.css`),
mobil benutzbar. Bereiche: Übersicht · Seiten · Seiteneditor · Medien · Navigation · Header & Footer · Buttons & Links ·
SEO · Einstellungen · Sammlungen (Karte, FAQ, Gästestimmen, Aus der Backstube) · Benutzer · Versionen.
Kopfleiste: Speicherstatus, „Vorschau", „Veröffentlichen" (mit Bestätigung + Build-Fortschritt), „Entwurf verwerfen".
Formulare entstehen aus den Felddefinitionen (Sektionen + `src/cms/collections/*.mjs`), Validierung über `src/cms/validate.mjs`.

Seiteneditor: Sektionsliste (sichtbar/aus, sortieren, hinzufügen aus erlaubten Typen, duplizieren, löschen) · Live-Vorschau
im iframe (Vorschau-Build, Breiten Handy/Tablet/Desktop) · Formular der gewählten Sektion. Brücke (`src/admin/bridge.ts`,
nur Editor-Build) per `postMessage`:
```
iframe → Admin  { type:'sus-cms:ready' } · { type:'sus-cms:select', field:'<sektionId>:<pfad>', section:'<sektionId>' }
Admin → iframe  { type:'sus-cms:set', field, kind:'text'|'rich'|'media'|'link', value, html?, src?, href? } · { type:'sus-cms:focus', section }
```
Text-/Bild-/Link-Änderungen erscheinen sofort im iframe; Struktur-Änderungen lösen nach dem Speichern einen Vorschau-Build aus.

## 9. Prüfungen
1. `scripts/visual-regression.mjs`: alle Live-Seiten identisch zur Referenz (vor dem Umbau aufgenommen: `/tmp/sus-vr-baseline`).
2. `pnpm typecheck`, `pnpm test`, `pnpm test:routes`, `pnpm build` grün.
3. Server-Tests: Rechte, API, Konflikte, Validierung, Medien-Upload, Build-Pipeline (mit Fake-Builder), Neustart-Persistenz, Vorschau-Modus.
4. E2E (Playwright): Login → Überschrift ändern → Entwurf → Vorschau zeigt Änderung, Live nicht → Veröffentlichen → Live zeigt sie;
   Bild ersetzen, FAQ hinzufügen, Button-Ziel ändern, neue Seite, Navigation/Footer, SEO, Neustart.

## 10. Arbeitspakete

| Paket | Inhalt | Besitzt |
|---|---|---|
| P1 | start, nicht-gefunden; Header, Footer, StickyBar, Navigation, layout.json; Sektionstypen der Startseite (generisch nutzbar) | `src/cms/sections/<seine Typen>/`, `src/cms/seed/pages/{start,nicht-gefunden}.json`, `seed/layout.json`, `seed/navigation.json`, `src/pages/index.astro`, `src/pages/404.astro`, `src/variants/a-krume/components/{Header,Footer,HeuteFrischBoard,SchneckenTeaser,SocialProof,InstagramFeed,VisitModule}.astro`, `src/components/shared/{StickyBar,NewsletterForm}.astro` |
| P2 | karte*, sauerteig, besuch, faq, vorbestellen, shop | seine Seiten/Sektionen/Seeds, `MenuItemsList`, `Timeline`, `PreorderFlow`, `VoucherConfigurator`, `ClickToLoadMap` |
| P3 | ueber-uns, ueber-mich, gastgeber, kontakt, jobs, impressum, datenschutz; generische Typen bild-text, karten, cta, zitat, hero | seine Seiten/Sektionen/Seeds, `ContactFormMock`, `lib/legal.ts` |
| S | Server: Speicher, Migrationen, API, Rechte, Benutzer, Medien, Build-Pipeline, Vorschau-Modus, Weiterleitungen, Dockerfile, Tests; `src/cms/validate.mjs`, `src/cms/definitions.mjs` | `server/**`, `tests/server/**`, `Dockerfile`, `deploy/**`, `src/cms/validate.mjs`, `src/cms/definitions.mjs` |
| A | Admin-Dashboard + Editor-Brücke + Sammlungs-Definitionen | `src/pages/admin/**`, `src/admin/**`, `src/cms/collections/**` |

Kern (`src/cms/{types.ts,store.mjs,rich.mjs,index.ts,SectionList.astro,sections/registry.ts}`, `src/pages/[...slug].astro`,
`lib/images.ts`, Layout/SeoHead/SectionIntro) gehört dem Orchestrator — Änderungswünsche als „Bitte an Orchestrator".

## 11. Go-Live-Sicherheit
Die Website geht am 19.10.2026 16:00 automatisch öffentlich (verschoben vom 10.10., damit Josie nach der Übergabe Feedback geben kann). Das CMS wird auf Branch `cms`
entwickelt und erst nach vollständiger Prüfung und Freigabe durch Konrad auf Produktion gebracht.

## 12. Umsetzungsstand (08.10.2026, Branch `cms`)

- **Seiten:** alle 17 Live-Seiten laufen über `src/pages/[...slug].astro` (Seeds in `src/cms/seed/pages/`); in
  `src/pages/` bleiben nur Systemseiten (404 liest Seite `nicht-gefunden`, login, passwort, countdown, varianten).
- **Sektionstypen:** 48 (`src/cms/sections/`). Generisch (`allowedOn: '*'`, für neue Seiten): text, cover, bild-text,
  karten, cta, zitat, rechtstext, seiten-intro, zeitstrahl, faq-liste, karte-sektionen, heute-frisch, schnecken,
  vorstellung, instagram, besuch, stimmen, newsletter. Seitenspezifisch: besuch-* (4), karte-*, sauerteig-*, shop-*,
  vorbestellen-formular, ueber-uns-*, ueber-mich-*, gastgeber-*, kontakt-haupt, jobs-aufruf, nicht-gefunden.
  Abweichung vom Plan: P1 nannte die Startseiten-Bühne `cover` (Name `hero` blieb frei, wird nicht benötigt);
  die Besuch-Seite nutzt vier eigene Typen statt eines „voll"-Modus von `besuch`.
- **Server:** `server/lib/cms/**` (Speicher, Migrationen, Versionen, Rechte, Benutzer, Medien, Build-Pipeline,
  Vorschau, Weiterleitungen), zusätzlich `POST /api/cms/validate`; `GET /api/cms/state` liefert `issues`, `online`,
  `previewOnline`. Validator/Definitions-Lader: `src/cms/validate.mjs`, `src/cms/definitions.mjs`. Link-Helfer ohne
  Node-Importe: `src/cms/links.mjs` (rich.mjs ist browsertauglich). `PageDoc.menuScope` (Menu-JSON-LD je Kategorie),
  SEO-Platzhalter `{kategorie}` / `{kategorie-intro}` auf Vorlagen-Seiten.
- **Geprüft:** Pixel-/Textregression aller 20 Live-Seiten in 390/768/1440 px identisch zur Referenz vor dem Umbau;
  `pnpm typecheck` 0 Fehler; 252 Tests grün (davon 85 CMS-Servertests); `pnpm test:routes` 138 Routen; Seed besteht den
  Validator (0 Fehler); Smoke-Test mit echtem Astro-Build: Veröffentlichen → Live-Build 9,3 s (warmer Bild-Cache),
  Vorschau-Build 7,2 s, Text/Seite/ersetztes Bild live, 0 Editor-Marker im Live-HTML.
- **Betrieb:** Dockerfile-Runtime enthält App + node_modules (Builds zur Laufzeit), `.code-version` aus
  `server/code-version.mjs`; Schreibpfade `src/assets/media`, `.astro`, `node_modules/.vite`; Caches unter
  `/data/astro-cache` (Astro + Vite). Docker-Build ist auf dem VPS nicht möglich → erst Staging in Coolify.
