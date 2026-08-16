# Instagram-Brand-Importer

Kostenloser, wiederverwendbarer Importer für öffentliche Instagram-Profile.
Lädt Profildaten, Post-Bilder und Captions herunter und legt sie strukturiert
unter `brand/` ab. Kein Login, keine bezahlten APIs/Proxies/SaaS.

## Nutzung

```bash
# Standard: Ausgabe nach brand/ im Repo-Root
node tools/brand-import/import.mjs https://www.instagram.com/USERNAME/

# entspricht:
pnpm brand:import -- https://www.instagram.com/USERNAME/

# eigenes Ausgabeverzeichnis
node tools/brand-import/import.mjs USERNAME --out brand-anderer-kunde/

# lokaler Test ohne Netzwerkzugriff auf Instagram (nur Parsing testen,
# Bild-Downloads laufen trotzdem echt, da die Bild-URLs auf ein CDN zeigen)
node tools/brand-import/import.mjs --html-fixture tests/fixtures/profil-embed.html --username USERNAME
```

Playwright-Rendering (Fallback-Stufe) läuft mit `chrome-headless-shell` aus
`~/.cache/ms-playwright/`. Der Importer setzt `LD_LIBRARY_PATH` /
`FONTCONFIG_PATH` selbst (siehe `ensureChromeEnv()`), ein vorheriges
`source scripts/env.sh` ist daher nicht zwingend nötig, schadet aber nicht.

## Was wird importiert

- `brand/data/profile.json` — Username, Anzeigename, Follower-/Post-Zahl,
  Profilbild-Pfad. **Kein Bio-Text** (siehe Grenzen unten).
- `brand/data/posts.json` — je Post: Shortcode, Datum, Caption, Hashtags,
  Mentions, lokaler Bildpfad, Quelle, Engagement-Zahlen (Likes/Kommentare/
  Video-Views, falls verfügbar).
- `brand/data/brand.json` — NUR wörtlich aus Captions belegte Signale
  (häufige Hashtags/Begriffe, Caption-Zitate mit Quell-Shortcode). Keine
  Interpretation, keine erfundenen Aussagen.
- `brand/assets/{profile,products,bread,food,bakery,team,misc}/` — Bilder,
  grob nach Caption-Keywords kategorisiert (konservativ; Unklares landet in
  `misc/`).
- `brand/source/instagram/raw/` — Rohdaten (HTML/JSON der Abrufe, Original-
  Bilder content-hash-benannt). Wird von `assets/` nur kopiert, nie verändert.
- `brand/analysis/content-inventory.md` — Bestandsaufnahme: Bilder je
  Kategorie, Hero-Kandidaten, offene Punkte für menschliche Sichtung.
- `brand/sources.md` — Abrufprotokoll: was funktionierte, was blockiert war,
  Abrufdatum, verwendete Werkzeuge/Lizenzen.

## Fallback-Kette (pro Datenpunkt, siehe Kommentare in `import.mjs`)

1. **Profil-HTML mit Browser-UA** (`og:title`/`og:description`/`og:image`).
   Wird versucht, schlägt bei Instagram (Stand 08/2026) für ausgeloggte/
   automatisierte Anfragen zuverlässig fehl — dokumentiert in `sources.md`.
2. **Embed-Endpoints** — der zuverlässige Weg:
   - `https://www.instagram.com/USERNAME/embed/` liefert eingebettet ein
     `contextJSON` mit Profildaten + den letzten ~6 Posts (Shortcode, Caption,
     Bild, Zeitstempel, Engagement). Keine Pagination ohne Login möglich.
   - `https://www.instagram.com/p/SHORTCODE/embed/captioned/` liefert je Post
     zusätzlich die beste verfügbare Bildauflösung und ggf.
     `accessibility_caption`.
   - Abruf-Reihenfolge je URL: erst einfacher `fetch()` (günstig), bei
     Fehlschlag (Instagram liefert nicht-deterministisch mal eine generische
     JS-Shell ohne Daten) automatisch Playwright-Rendering als Fallback (in
     Tests durchgehend zuverlässig).
3. **gallery-dl / instaloader**: auf diesem Server nicht verfügbar (kein
   pip/venv erlaubt) — wird nicht versucht.
4. **yt-dlp**: nicht eingebunden. Die Embed-Antwort für Video-Posts enthält
   bereits eine direkte `video_url` — Video-Download selbst ist aber nicht
   Teil dieses Imports (Ziel: Bilder/Captions/Profildaten).

Jeder Schritt ist einzeln `try`/`catch`-abgesichert. Ein fehlgeschlagener
Einzelpost (Bild-Download schlägt fehl, Detail-Embed nicht erreichbar, ...)
bricht den Gesamtimport nicht ab — siehe `sources.md` → „Fehlgeschlagene
Einzelposts" bzw. `content-inventory.md` → „Fehlgeschlagene Posts".

## Grenzen (kostenlos + ohne Login + ohne aggressive Umgehung)

- **Kein Bio-Text.** Weder die volle Profilseite noch die Embed-Widgets geben
  ihn ohne Login preis (Stand 08/2026).
- **Nur die letzten ~6 Posts.** Das Profil-Embed-Widget ist auf eine kleine
  feste Anzahl begrenzt, keine Pagination ohne Login.
- **Bildauflösung** entspricht der besten im Embed-Kontext verfügbaren
  Variante — üblicherweise kleiner als bei eingeloggtem Zugriff (oft max.
  640 px Breite, vereinzelt mehr, je nach Original-Asset).
- **Kategorisierung ist heuristisch** (Caption-Keywords), keine Bildinhalts-
  erkennung. Alles Unklare landet konservativ in `misc/` zur menschlichen
  Nachsichtung.

## Dedupe

Bilder werden per SHA-256-Hash des Dateiinhalts unter
`brand/source/instagram/raw/images/<hash>.<ext>` abgelegt. Wird derselbe Inhalt
erneut heruntergeladen (z. B. bei wiederholten Importläufen oder wenn
dasselbe Bild mehrfach referenziert wird), wird die vorhandene Datei
wiederverwendet statt doppelt gespeichert.

## Rechtliches

Nur öffentlich zugängliche Inhalte, kein Login, keine Umgehung von
Schutzmechanismen. Die importierten Bilder/Captions bleiben Eigentum des
jeweiligen Account-Betreibers — Nutzung nur für interne Marken-Recherche
desselben Betreibers, keine Weiterveröffentlichung an Dritte ohne erneute
Freigabe. Siehe `brand/sources.md` für den vollständigen rechtlichen Hinweis
je Importlauf.
