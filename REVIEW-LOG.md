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
