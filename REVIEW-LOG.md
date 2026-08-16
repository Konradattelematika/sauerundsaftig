# REVIEW-LOG — Sauer & Saftig Website

Orchestrator-Prüfprotokoll. Ein Eintrag je Schritt: Datum, Prüfung, Abweichungen, Korrekturen, Status.

## Schritt 0 — Phase-1-Dokumente (15.08.2026)
- PLAN.md, IMAGE-BRIEF.md, BRAND-TODO.md erstellt. Status: DONE.

## Schritt 1 — Fundament (15.08.2026)
- Astro 5.18 + Tailwind v4 + TS strict; pnpm 11 (verifyDepsBeforeRun=false wegen pnpm-11-Deps-Check).
- Öffnungslogik: 16 Vitest-Tests grün (7 Wochentage, Ränder, Feiertag, Winterzeit).
- Brand-Pipeline: Logo-Trace → Alphamaske → PNG-Sets ink/light + Wortmarken-Crop + Favicons.
  Sichtprüfung: Kasten-Artefakt behoben (linear 1.3/−30), Crop bei 74 % sauber ohne Subline.
- Platzhalter-Pipeline: 25 Motive × 3 Varianten, Farbklima je Variante, Label + Strichrahmen.
- Gefundene und behobene Fehler: sharp-Pipeline-Reihenfolge (resize vor composite), fehlende
  Fontsource-Imports (Fonts fehlten im Bundle), ungültige Tailwind-v4-Syntax rounded-[--radius-card]
  → rounded-card, @theme → @theme static (Token-Erhalt für Runtime-JS), astro check-Crash durch
  TypeScript 7 → Pin auf 5.9.
- TOKENS.md: alle Kontrast-Paarungen ≥ Soll (B: Sekundärfläche Dünengras trägt ink, nicht paper).
- Status: DONE (Build + Check grün, Screenshot-Sichtprüfung Fundament-Testseite ok).

## Schritt 2 — Islands & Content (15.08.2026)
- Delegiert an 2 parallele Executor (Islands: PreorderFlow/Voucher/WorkshopBooking/Newsletter;
  Content: Karte/Workshops/Journal/FAQ/Testimonials).
- Content-Review (Orchestrator): 28 Dateien vollständig, Zod-Validierung grün, Stichproben
  (schnecken.json, achtzehn-stunden.md, zahlungsmittel.md) gegen Fakten-/Tonalitätsregeln geprüft —
  keine Floskeln (grep-Check), TODO(kunde)-Punkte korrekt vorsichtig formuliert, Zeitleiste konsistent.
  Executor meldete 4 selbst korrigierte Superlativ-Verstöße nach GPT-Review. Status Content: DONE.
- Islands-Review (Orchestrator): 4 Komponenten + /dev/islands; Screenshot 390 px geprüft (Stepper,
  °-Preislegende, Badges ≤3/ausgebucht, Gutschein-Vorschau mit Wortmarke, Consent + Honeypot). Kein
  localStorage, keine Hexfarben (grep). Executor fixte selbst: Astro-Compiler-Falle mit `<=` im
  Template, Date-Konsistenz-Bug in der Abholtagslogik (GPT-Review). Status: DONE.

## 16.08.2026 — Zweiter Lauf (Job 20260815-083115-web, Fortsetzung)
- 500er-Ursache identifiziert und behoben: nginx-try_files fiel auf nicht existierende
  Varianten-404-Dateien zurück → error_page-Konstruktion + 404-Seiten in allen Varianten.
- Varianten A (14 neue Routen), B (6) und C (13) durch Executor komplettiert; Orchestrator-Gate:
  Screenshots 1440px aller Startseiten, Stichproben, astro check 0 Fehler.
- Route-Smoke-Test scripts/test-routes.mjs (npm run test:routes): 136 Routen, 0 kaputte Links,
  nginx-Semantik nachgebildet, 404-Datei-Check je Variante.
- NEU Variante D „Fermentation" (Digital Immersive): Nachtbackstube-Tokens, Clash Display,
  Intro-Loader (Mehl/Wasser/Zeit/Wärme), Fermentationsblasen, Krume-Blob-Masken,
  scrollgetriebener Teigprozess (statischer Fallback bei reduced-motion), View Transitions,
  Marquee, alle 30 Routen. Budget-Check Startseite: 840 KB gesamt, 15,5 KB JS.
- Instagram-Brand-Importer (tools/brand-import, kostenlos, ohne Login, Embed-Widgets+Playwright):
  6 echte Post-Bilder + Captions + Profildaten importiert; 3 Echtfotos als Motive eingebunden
  (brot-laib, obsttorte, kaesekuchen) mit echten Alt-Texten. Befund „Sommer-Brotpause" als
  Launch-Blocker in BRAND-TODO dokumentiert.
- Tests: vitest 16/16, astro check 0 Fehler, Variantenwähler um D erweitert.

## 16.08.2026 — Dritter Lauf: echte Fotos + echte Preise
- 14 Kundenfotos gesichtet, 14 Motive belegt (inkl. neues Hero-Motiv: Schneckenblech,
  Brotregal mit Preistafel, Gastraum, Frühstücksplatte, 4 Auftragstorten, Lotus-Schnecken).
- Frühstückskarte komplett aus geliefertem PDF übernommen (10 Positionen + Extras,
  priceIsPlaceholder=false). Brotpreise von der Tafel (6,50/7/7). Getränke-Lineup von der
  Tafel übernommen, Preise dort nur teilweise lesbar → bleiben als ° markiert.
- PreorderFlow auf echte Brotsorten umgestellt; C-Gastgeber-Referenz auf umbenanntes
  Brot gefixt (Build-Fehler gefunden durch test:routes).
- Variantenwähler: „drei" → „vier Richtungen", ehrlicher Foto-/Preis-Hinweis.
- Higgsfield: kein MCP in dieser Umgebung verbunden (Bezahldienst) — dynamische
  Inszenierung stattdessen nativ (Ken-Burns auf Krume-Masken in D, bestehende
  Reveals/Parallax-Motion), dokumentiert für Konrad.
- QA: build ok, test:routes 136/136 OK, vitest 16/16, astro check 0 Fehler. Push 51ea151.
