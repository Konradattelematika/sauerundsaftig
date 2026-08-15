# PLAN — Sauer & Saftig Website (drei Design-Varianten)

Stand: 15.08.2026 · Orchestrator: Claude (Job 20260815-083115-web)
Freigabe: Konrads Auftrag „jetzt baue mir die sauerundsaftig.jawollja.gmbh" wird als
Freigabe für Plan + Umsetzung in einem Lauf gewertet (unbeaufsichtigter Job).

## 1. Ausgangsanalyse

**Vorhanden:**
- Master-Prompt und Markenanalyse (Uploads) — vollständige Faktenbasis, Personas, IA, drei Varianten-Specs
- **Logo liegt vor:** `SauerundSaftig.svg` — vektorisierte Wortmarke „sauer&saftig / BROT·KUCHEN",
  dunkle Serif-Type auf hellem Grund, 1492×1492. Konsequenz nach §6: Logo ist gesetzt,
  in allen drei Varianten unverändert in Form/Proportion; nur Farb-/Größenvarianten erlaubt.
  Technik: Die Datei ist ein Bildnachzeichner-Trace (~480 KB, tausende Patches) — nicht sauber
  umfärbbar. Lösung: Hochauflösendes Rendering → Alpha-Maske → PNG-Sets in Ton „ink" und „light",
  Original-SVG bleibt als Quelle in `/assets/brand/`. Kein Platzhalter-Logo nötig.
- Server: Node 22, pnpm 11, sharp funktioniert. Kein Docker-Zugriff (Build lokal, Deploy via Coolify).
- DNS `sauerundsaftig.jawollja.gmbh` zeigt bereits auf den Server (Traefik Default-Cert → noch keine App).

**Fehlend / TODO(kunde):** siehe `BRAND-TODO.md` (Öffnungszeiten-Widerspruch, Preise,
Team-Namen, Übernahme-Datum, Fotos, Workshop-Freigabe, gültiger Coolify-API-Token).

## 2. Bildstrategie (keine Fotos vorhanden)

- **Keine Stockfotos, keine „echt wirkenden" KI-Bilder** (Verbot §13).
- Stattdessen: **generierte, bewusst abstrakte Platzhalter** — ruhige tonale Farbverläufe mit
  feinem Korn in den Palettenfarben der jeweiligen Variante, korrektes Seitenverhältnis
  (16:9 Hero, 4:5 Editorial, 1:1 Produkt, 3:2 quer), jeweils mit dezentem Mono-Label
  („Foto folgt · Krume-Makro"). Sie sind klar als Platzhalter erkennbar, tragen aber die
  Präsentation, weil sie im Farbklima der Variante liegen.
- Erzeugung per Build-Script `scripts/generate-placeholders.mjs` (sharp), Ablage
  `src/assets/placeholders/{a,b,c}/…`. Einbindung über Astro `<Image>` wie echte Fotos —
  beim Shooting werden nur Dateien getauscht.
- Shotlist für das spätere Shooting: `IMAGE-BRIEF.md`.

## 3. Repo-Architektur

Ein Repo, eine Astro-5-App, drei Varianten-Layer unter einer Domain:

```
/                     Variantenwähler (Präsentationsseite, Beamer/iPad-tauglich)
/a/…  /b/…  /c/…      identische IA (§8 Master-Prompt) je Variante
```

```
src/
  content/                 # gemeinsame Inhalte — einmal gepflegt, dreimal gerendert
    settings/site.json     # Adresse, Telefon, Öffnungszeiten (+Ausnahmen), Social, Rating
    menu/*.json            # Karten-Sektionen mit Positionen (Preise: placeholder-Flag)
    heute-frisch/*.json    # Tagesboard
    workshops/*.md         # Kurse mit Terminen, Restplätzen (Mock)
    journal/*.md           # 6 Startartikel
    faq/*.md
    testimonials/*.json    # 2 echte Google-Zitate
  lib/                     # opening-hours.ts (getestet), format.ts, schema-org.ts,
                           # menu.ts, variants.ts (Metadaten der 3 Varianten)
  components/shared/       # logiktragende Islands, variantenneutral gestylt via Tokens:
                           # OpeningStatus, ClickToLoadMap, PreorderFlow, VoucherConfig,
                           # NewsletterForm, CountUp, Logo
  styles/                  # base.css, tokens-a.css, tokens-b.css, tokens-c.css (Tailwind v4 @theme)
  variants/
    a-krume/               # Layout.astro + Darstellungs-Komponenten Variante A
    b-salzhaff/
    c-backstube/
  pages/
    index.astro            # Variantenwähler
    a/… b/… c/…            # je ~19 Routen (siehe §8 Master-Prompt), 404 je Variante
scripts/                   # generate-brand.mjs, generate-placeholders.mjs
public/brand/              # Logo-PNG-Sets, Favicons, site.webmanifest
```

Abweichung von der Vorlage (`src/variants/` mit eigenen Sub-Routen): keine — Struktur wie
empfohlen. Seiten sind pro Variante eigene Dateien (volle gestalterische Freiheit, keine
„drei Farbnuancen"-Falle); die Daten-/Logikschicht ist strikt geteilt.

## 4. Design-Token-System (Tailwind v4)

- `base.css`: `@import "tailwindcss";` + globale Defaults (Fokus-Stile, reduced-motion-Kill-Switch,
  Safe-Area-Utilities, fluid-type-Utilities via `clamp()`).
- Je Variante eine Token-Datei mit `@theme`-Block: Farben (`--color-bg`, `--color-ink`,
  `--color-primary`, `--color-accent`, …), Fonts (`--font-display`, `--font-body`, `--font-mono`),
  Motion (`--ease-brand`, `--dur-1..3`), Radius/Spacing-Charakter.
- Das Varianten-Layout lädt base + seine Token-Datei + seine Fonts. Gemeinsame Islands stylen
  sich ausschließlich über die semantischen Token-Namen → ein Island, drei Erscheinungen.
- Kontrast-Dokumentation aller Paarungen in `TOKENS.md`.

**Fonts (self-hosted):**
- A „Krume": Fraunces Variable (fontsource) · General Sans Variable (Fontshare, lokal) · Space Mono
- B „Salzhaff": Instrument Serif · Inter Tight Variable · JetBrains Mono Variable (alle fontsource)
- C „Backstube": Bricolage Grotesque Variable (fontsource) · Satoshi Variable (Fontshare, lokal) · Space Mono
Fontshare-Dateien liegen bereits lokal vor (Download erfolgt, Lizenz: Fontshare frei für kommerzielle Nutzung).

## 5. Komponenten-Inventar

**Geteilt (Logik, einmal):** Öffnungslogik + OpeningStatus-Island (aria-live, Europe/Berlin,
Ausnahmen) · Vorbestell-Flow (4 Schritte, Mock, in-memory) · Gutschein-Konfigurator ·
Workshop-Buchungs-UI (Mock) · Klick-to-Load-Karte (OSM-Static-Vorschau als CSS, iframe erst
nach Klick) · Newsletter-Form · CountUp · Logo (`variant`/`tone`) · Schema.org-Builder ·
Sticky-Mobile-Bar (Logik) · Skip-Link/A11y-Bausteine.

**Je Variante (Darstellung):** Header/Nav, Hero, Heute-frisch-Board, Menükarten-Darstellung,
Signature-Seite Schnecke, 18-h-Zeitleiste, Workshop-Karten, Social Proof, Besuch-Modul,
Footer, 404, Sektions-Motion (A „Teig", B „Wasser", C „Ofen" — Details §7 Master-Prompt).

## 6. Schrittfolge (angepasst an unbeaufsichtigten Lauf)

| # | Schritt | Wer | Aufwand |
|---|---|---|---|
| 0 | Phase-1-Dokumente (dieses Dokument, IMAGE-BRIEF, BRAND-TODO) | Orchestrator | klein |
| 1 | Fundament: Astro 5 + TW4 + TS strict, Content-Schema + Inhalte, Öffnungslogik + Vitest, Brand-Assets/Favicons, SEO-Layer, Dockerfile | Orchestrator | mittel |
| 2 | Tokens, Fonts, Logo-Komponente, Layout-Shells, geteilte Islands | Orchestrator | mittel |
| 3 | Varianten A, B, C vollständig — **parallel, je ein executor** (disjunkte Verzeichnisse) | 3× executor | groß |
| 4 | Review-Gates A/B/C: Build, Screenshots 390/1440, Abgleich §7–10, Korrekturschleifen | Orchestrator (+executor für Fixes) | mittel |
| 5 | Variantenwähler `/` | Orchestrator | klein |
| 6 | Härtung: A11y/Kontrast-Check, Lighthouse, README/HANDOVER/REVIEW-LOG, Docker-Build | Orchestrator | mittel |
| 7 | Deploy-Vorbereitung Coolify (API-Token aktuell ungültig → needs_input) | Orchestrator | klein |

Abweichung vom Master-Prompt: Schritte 3A/3B/3C laufen parallel statt seriell (Wall-Clock eines
unbeaufsichtigten Jobs); Review-Gates bleiben einzeln und werden vom Orchestrator geprüft.

## 7. Risiken & offene Entscheidungen

- **Coolify-Token ungültig** → Site wird lokal fertig gebaut + committed; Deploy braucht Konrad
  (Token erneuern oder App anlegen). needs_input wird gesetzt.
- **Preise/Öffnungszeiten unbestätigt** → placeholder-Flag + dezenter Hinweis auf Karten-Seiten,
  Öffnungszeiten nach Google-Stand mit TODO(kunde).
- **Lighthouse ≥95 mobil**: mit Astro statisch realistisch; Messung headless via ~/chrome-libs-Workaround.
  Falls Lighthouse-CLI im Job nicht sauber läuft, wird ersatzweise Bundle-/Gewichts-Audit dokumentiert.
- **Astro-Major**: aktuell ist Astro 7 — Auftrag verlangt Astro 5; gepinnt auf 5.18.x (LTS-nah,
  von mir sicher beherrscht). Upgrade-Pfad in HANDOVER notiert.
- **EN-Version, Sanity, Shopify**: explizit spätere Phasen, hier nur vorbereitet (Datenschicht,
  hreflang-Vorbereitung, Mock-Checkouts).
