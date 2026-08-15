# VARIANT-BRIEF — Bauauftrag je Design-Variante

Gilt für die Executor der Varianten A („Krume"), B („Salzhaff"), C („Backstube").
Der jeweilige Auftrags-Prompt nennt deine Variante, deine Gestaltungs-Spezifika und deine Verzeichnisse.
ALLES hier ist verbindlich. Bei Konflikt gilt: dieser Brief > eigener Geschmack.

## 0. Projektkontext in 5 Sätzen

„Sauer & Saftig" ist ein Café mit eigener Backstube in Ostseebad Rerik (Dünenstraße 1), das fast
alles mit eigenem Sauerteig backt — auch den Käsekuchen. Die Website entsteht in drei gestalterisch
eigenständigen Varianten unter /a, /b, /c (gleiche Inhalte, gleiche IA, andere Gestaltung), der Kunde
wählt eine. Zielgruppen: Urlaubsfamilien, Best-Ager-Paare (62+, große Schrift!), Sauerteig-Nerds
(Instagram), Einheimische, B2B-Gastgeber. Hauptkonversion: Route/Anruf; dann Workshop, Gutschein,
Vorbestellung, Newsletter. Claim: „Sauer macht saftig."

## 1. Was bereits existiert (NICHT neu bauen, NICHT ändern)

- `src/data/site.json` — alle Betriebsfakten (Adresse, Telefon, Öffnungszeiten, Rating, TGTG).
- `src/lib/opening-hours.ts` (`getOpeningStatus`, `weekOverview`, `formatShortTime`),
  `src/lib/format.ts` (`formatPrice`, `formatMenuPrice`, `formatDate`, `formatDateShort`, `telHref`, `routeHref`),
  `src/lib/schema-org.ts` (`localBusiness`, `menuSchema`, `workshopEvent`, `faqPage`, `article`, `breadcrumbs`),
  `src/lib/variants.ts` (`VARIANTS`, `NAV_MAIN`, `NAV_CTA`, `NAV_FOOTER`, `NAV_LEGAL`, `MENU_SECTIONS`),
  `src/lib/images.ts` (`getImage(variant, motif)`, `getAlt(motif)`, `WIDTHS`, `SIZES_*`).
- Geteilte Komponenten unter `src/components/shared/`:
  - `SeoHead.astro` — Props `{title, description, jsonLd?, ogImage?, noindex?}` (in <head> einsetzen)
  - `Logo.astro` — Props `{variant?: 'mark'|'wordmark'|'lockup', tone?: 'light'|'dark'|'brand', width?, class?, loading?}`
  - `OpeningStatus.astro` — Props `{size?: 'sm'|'lg', class?}` — Live-Status, aria-live, minutengenau
  - `StickyBar.astro` — Props `{base}` — mobile Bottom-Bar (Karte/Anrufen/Route/Vorbestellen). Auf JEDER Seite einbinden; `<body class="has-sticky-bar">` setzen
  - `ClickToLoadMap.astro` — Karte als Klick-to-Load
  - `Motion.astro` — aktiviert `[data-reveal]`-Animationen + `[data-countup]`-Zahlen; einmal pro Layout vor </body>
  - `PreorderFlow.astro` `{base}` · `VoucherConfigurator.astro` `{base}` · `WorkshopBooking.astro`
    `{title, price, isDraft, duration, capacity, dates}` · `NewsletterForm.astro` `{base}` (Mock-UIs, fertig)
- Content Collections (`astro:content`, via `getCollection('menu'|'heuteFrisch'|'workshops'|'journal'|'faq'|'testimonials')`):
  Schemas in `src/content.config.ts` — LIES sie. Menü-Sektionen in Reihenfolge `MENU_SECTIONS`.
- Design-Tokens: `src/styles/{a|b|c}.css` (deine Variante importiert GENAU EINE davon in ihrem Layout).
  Utilities: bg-bg, bg-bg-alt, bg-paper, bg-primary, bg-primary-deep, bg-secondary, bg-secondary-soft,
  bg-accent, bg-ink, text-ink, text-ink-soft, text-bg, text-paper, text-accent-ink, text-open, text-closed,
  border-ink (mit /10 /20), font-display, font-body, font-mono, rounded-card.
  Motion-CSS-Variablen: var(--ease-brand), var(--dur-fast|base|slow).
  WICHTIG (Tailwind v4): `rounded-card`, NICHT `rounded-[--radius-card]`. Arbitrary-Var-Werte als `duration-[var(--dur-fast)]`.
- Bilder: `getImage(variant, motif)` liefert ImageMetadata für Astro `<Image>`/`<Picture>`
  (astro:assets). Motiv-Keys: hero-krume, schnecke-pistazie, schnecke-pistazie-hoch, schnecke-lotus,
  schnecke-haselnuss, schnecke-blech, schnecke-querschnitt, kaesekuchen, obsttorte, fruehstueck, suppe,
  kaffee, brot-laib, brot-anschnitt, gaerkorb, anstellgut, haende-teig, ofen, team-1, team-2, gastraum,
  terrasse, fassade, kueste, tgtg. Alt-Text IMMER via `getAlt(motif)` oder eigener beschreibender Text.
  Bildeinbindung: `<Picture formats={['avif','webp']} widths={WIDTHS} sizes={...} />`; Hero eager +
  `fetchpriority="high"`, alles andere lazy. JEDES Bild mit width/height (CLS!).

## 2. Deine Verzeichnisse (NUR diese anfassen)

- `src/variants/<dein-layer>/` — Layout.astro + alle Darstellungs-Komponenten deiner Variante
- `src/pages/<x>/` — deine Routen (x = a|b|c)
- Gemeinsame Dateien (lib, shared, content, styles anderer Varianten, PLAN.md …) sind TABU.
  Wenn dich etwas blockiert: im Abschlussbericht melden, nicht selbst patchen.

## 3. Routen (alle bauen; Pfade relativ zu /<x>)

```
/                Startseite
/karte           Übersicht mit Ankernavigation zu allen 5 Sektionen
/karte/fruehstueck  /karte/kuchen  /karte/brot  /karte/kaffee   (Sektionsseiten)
/karte/schnecken SIGNATURE-SEITE — höchster Gestaltungsanspruch der ganzen Variante
/sauerteig       Handwerksseite mit 18-Stunden-Zeitleiste (scrollgesteuert via data-reveal)
/ueber-uns       Menschen, Übernahme, Rerik (Story unten §5)
/workshops       Kursübersicht (Karten mit Restplatz-Badges)
/workshops/[slug] Einzelkurs mit WorkshopBooking-Island (getStaticPaths über Collection)
/vorbestellen    PreorderFlow-Island + Erklärtext (Bestellschluss 18 Uhr Vortag, Torten 5 Tage)
/shop            Gutscheine (VoucherConfigurator-Island), Ausblick Anstellgut-Glas/Merch („bald")
/gastgeber       B2B-Landingpage (Angebot §5)
/journal         Blogübersicht (Kategoriefilter optional statisch: 3 Kategorien)
/journal/[slug]  Artikel (render(entry) aus Collection; Scroll-Fortschrittsbalken nur hier, 2px)
/besuch          Öffnungszeiten GROSS (weekOverview, min. 20px), Telefon 20px+, ClickToLoadMap,
                 Anreise/Parken/Barrierefreiheit (unbestätigtes als „ruf kurz an" formulieren)
/faq             FAQ aus Collection, <details>-Accordion (nativ, kein JS nötig), FAQPage-JSON-LD
/kontakt         Adresse, Telefon (tel:), Instagram, Formular-Mock (Name/E-Mail/Nachricht, Demo-Hinweis)
/jobs            Kurzseite: „Wir suchen Verstärkung fürs Saisonteam" + TODO(kunde)-neutraler Text
                 (KEINE erfundenen Stellen — allgemeine Initiativbewerbung + Telefon)
/impressum       Gerüst mit TODO(kunde)-Platzhaltern (Betreiber, USt-ID) — noindex
/datenschutz     Basistext statisch (keine Cookies, kein Tracking; OSM-Klick-to-Load erwähnen;
                 Platzhalter Verantwortlicher) — noindex
/404             404-Seite MIT Variantencharakter („Diese Seite ist wie ein Sauerteig ohne
                 Fütterung — nicht mehr da." o. Ä. im Ton deiner Variante) + Link zur Karte
```

## 4. Pflicht-Bausteine (je Variante eigenständig gestaltet)

1. **Header** mit Logo (Logo.astro), NAV_MAIN, NAV_CTA-Button, OpeningStatus (sm) — mobil als
   Overlay/Drawer (CSS-first, <details> oder checkbox-Pattern ok, ARIA sauber), Touch-Targets ≥44px
2. **Hero Startseite** — eigenständiges Konzept deiner Variante (nicht dasselbe Layout wie die anderen):
   H1 „Sauerteig, den man schmeckt. Und Kuchen, der ihn kann." ODER „Fast alles bei uns beginnt mit
   Sauerteig. Auch der Käsekuchen." (frei wählbar je Variante), Subline aus site.json, OpeningStatus (lg),
   CTAs „Karte ansehen" + „Route" (routeHref)
3. **„Heute frisch"-Board** aus heuteFrisch-Collection (Datum anzeigen; soldOut durchgestrichen/Badge)
4. **Signature-Block Schnecke** auf Start (3 Sorten, Link auf /karte/schnecken)
5. **Menükarte** — Preise via formatMenuPrice (Platzhalter-°), Legende „° Beispielpreise — die echte
   Karte kommt mit dem Küchen-Update", Veggie/Vegan-Kennzeichen (Text-Badge, nicht nur Farbe!),
   Allergene dezent, seasonal-Hinweise
6. **Signature-Seite /karte/schnecken**: die drei Sorten groß, Prozess (Sauerteig statt Hefe → 18 h),
   „ofenfrisch am Vormittag" (keine erfundene Uhrzeit als Fakt), Social-Teilbarkeit (schlicht: gute
   OG-Daten via SeoHead), Querschnitt-Motiv, CTA Vorbestellen
7. **18-Stunden-Zeitleiste** auf /sauerteig: 6–8 Etappen (14:00 Ansetzen → 8:00 Theke; Uhrzeiten/
   Temperaturen aus dem Journal-Artikel achtzehn-stunden übernehmen), scrollgesteuert erscheinend
   (data-reveal, gestaffelte --reveal-delay), Zahlen mit data-countup
8. **Workshop-Karten** (Übersicht): Titel, nächster Termin, Dauer, Preis (° bei isDraft), Restplatz-
   Badge (≤3 Akzent „Nur noch X Plätze", 0 „Ausgebucht"), Details-Link
9. **Social Proof**: „4,6 ★ · 152 Google-Bewertungen" (site.json) + die 2 Testimonial-Platzhalter
   AUSGEGRAUT/klar als Platzhalter markiert (isPlaceholder!) — KEINE erfundenen Zitate anzeigen
10. **Besuch-Modul** (auf / kompakt + /besuch voll): weekOverview-Tabelle, Ruhetags-Hinweis
    („Dienstag + Mittwoch backen wir nicht — plan deinen Besuch drumherum"), Telefon riesig, TGTG-Hinweis
11. **Newsletter-Block** (NewsletterForm) auf Start + Journal
12. **Footer**: NAV_FOOTER, NAV_LEGAL, Öffnungszeiten kompakt, Instagram, TGTG-Zeile, Claim
13. **404** s. o.
14. Breadcrumbs-JSON-LD auf Unterseiten (breadcrumbs()), localBusiness auf Start + /besuch,
    menuSchema auf /karte, workshopEvent je Kurs-Seite, faqPage auf /faq, article im Journal
15. View Transitions: `import { ClientRouter } from 'astro:transitions'` im Layout-<head>
    (`<ClientRouter />`) für sanfte Seitenwechsel

## 5. Copy-Leitplanken (Tonalität)

Du-Ansprache, kurze Sätze, sinnliche Verben (reifen, ruhen, aufreißen, karamellisieren), Zahlen statt
Adjektive. VERBOTEN: „Genussmomente", „Wohlfühlatmosphäre", „mit Liebe gemacht/gebacken",
„regional & saisonal" als Floskel, Küsten-Kitsch, „gesund" (Health-Claims — „bekömmlich" ist ok).
KEINE erfundenen Fakten: keine Namen, Gründungsjahre, Zertifikate, Uhrzeiten als Fakt, Preise ohne °.
Übernahme-Story für /ueber-uns (sinngemäß, in deiner Varianten-Stimme):
„Wir haben ein Café übernommen, das viele geliebt haben. Manches haben wir verändert, manches
braucht Zeit. Auf Instagram nennen wir es: die Reise zum Sauerteig-Café. [Team-Vorstellung folgt —
TODO(kunde): Namen und Gesichter.]" — Team-Fotos: team-1/team-2-Motive mit klarem Platzhalter-Charakter.
Gastgeber-Seite: Angebot Willkommensbrot-Paket, Frühstückskorb zur Anreise, Gutscheine als
Gastgeschenk, kostenloser Kartenständer mit QR-Code, Rechnung möglich; Preise „auf Anfrage"
(KEINE erfundene Preisliste), Anfrage-Formular-Mock, Absatz „Warum das deine Bewertungen verbessert".

## 6. Qualität (nicht verhandelbar — Prüfliste vor Abgabe)

- Mobile-first; Breakpoints 360/390/430/768/1024/1280/1440/1920 ohne horizontales Scrollen
- Fließtext ≥17px mobil (Basis ist schon 17px — nichts kleiner als text-[15px], und das nur für
  Mono-Labels), Öffnungszeiten/Telefon ≥20px, Touch-Targets ≥44×44
- Textspalten max. 68ch (.prose-measure), fluide Headline-Größen via clamp() (text-[clamp(...)])
- Semantik: EIN h1 pro Seite, lückenlose Heading-Hierarchie, <main id="main">, Skip-Link
  (`<a class="skip-link" href="#main">Zum Inhalt springen</a>` direkt nach <body>), <nav>-Landmarks
- Alle Interaktion tastaturfähig; kein outline:none; aria-current="page" in der Nav
- Animation NUR über das data-reveal/-Motion-System + kleine CSS-Transitions mit var(--dur-*)/var(--ease-brand);
  prefers-reduced-motion ist global gelöst — KEINE eigenen JS-Animationsbibliotheken importieren
- Bilder: astro:assets Picture (avif/webp), width/height gesetzt, Hero eager+fetchpriority, Rest lazy
- Keine externen Requests (Fonts/Skripte/CDN). Keine Inline-Styles mit Hexfarben — Tokens!
- Startseiten-Gewicht < 900 KB, initiales JS < 60 KB (Astro-Islands sind sparsam — nichts Schweres dazu)

## 7. Abnahme

1. `pnpm build` UND `npx astro check` fehlerfrei (im Repo-Root; „empty collection"-Warnungen anderer
   Collections sind ok, deine Routen müssen alle in dist/<x>/ auftauchen).
2. Selbst-Review gegen §6-Prüfliste; danach GPT-Zweitmeinung wie in deiner Agent-Definition üblich.
3. KEINE git-Commits (macht der Orchestrator).
4. Abschlussbericht: gebaute Routen, bewusste Gestaltungsentscheidungen (3 Sätze), offene Punkte.
