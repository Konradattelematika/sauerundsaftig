# Material „Theke" · Instagram-Feed · Über-mich — Bauanleitung (Variante A „Krume")

Stand 19.09.2026. Drei Bausteine, die in diesem Lauf dazugekommen sind, ihre echten Assets
und die noch offenen redaktionellen Inhalte.

## 1. Terrazzo-System (Material „Theke")

- **Asset:** `src/assets/textures/terrazzo.jpg` — echtes Foto der Café-Theke, als ruhiger
  quadratischer Ausschnitt mit 1600 px Kantenlänge optimiert. `TERRAZZO_IS_PLACEHOLDER` in
  `src/lib/textures.ts` steht deshalb auf `false`.
- **Fallback:** `scripts/generate-terrazzo.mjs` kann weiterhin einen prozeduralen Notfall-Platzhalter
  erzeugen, überschreibt das echte Asset aber nur mit dem ausdrücklichen Schalter `--force`.
- **Technik:** `Layout.astro` (A) setzt die optimierte WebP-URL als `--tz-url` auf `<html>`;
  alle Klassen in `src/styles/a-terrazzo.css` greifen darauf zu:
  - `tz-band` (+ `--tall`, `--fade`): schmales Band zwischen Sektionen, Footer-Übergang, Drawer
  - `tz-mat` / `tz-offset` / `tz-offset--left`: Passepartout um Bilder (Figure-Prop `mat`)
  - `tz-tag`: Eyebrow-Plakette · `tz-rule`: kurze Regel unter Eyebrows · `tz-blob`: organische Fläche
  - `tz-text`: Textur in einem großen Display-Wort („Josie.", „Theke")
  - `tz-frame`: Hover-Rahmen (Instagram-Kacheln) · `tz-surface`: freie Fläche
- **Regel:** pro Viewport höchstens ein großes und wenige kleine Terrazzo-Elemente.

## 2. Instagram-Feed (`InstagramFeed.astro`)

- **Heute:** kein API-Zugang, kein Scraping. Lokaler Fallback aus `src/data/instagram-posts.json`
  (5 echte Posts des Brand-Imports vom 16.08.2026: Bild in `src/assets/instagram/<id>.jpg`,
  wörtliche Caption ohne Hashtags, Datum, Permalink) plus Café-Fotos als Füller, die aufs Profil verlinken.
  Bewusst weggelassen: der persönliche Post zur Brotpause/Mutterschutz (DZws5d3MDjT).
- **Live-Anbindung:** komplett in `src/lib/instagram.ts` dokumentiert (Instagram-API mit
  Instagram-Login, Token als Build-Env `INSTAGRAM_ACCESS_TOKEN`, `image.remotePatterns` für die
  Instagram-CDN, Fallback bei Fehlern, Rebuild pro Deploy). Ohne Token bleibt der Live-Pfad inaktiv.
- **Interaktion:** horizontaler Scroller mit Scroll-Snap, Maus-Drag (Klick nach Drag unterdrückt),
  Touch nativ, Pfeil-Buttons, Fortschrittslinie, Cursor-Label auf Desktop, Caption/Datum als
  Hover-Overlay (Touch: statisch unter der Kachel). `prefers-reduced-motion`: keine Skalierung,
  kein Cursor-Label, kein sanftes Scrollen.

## 3. Über-mich (`/a/ueber-mich`)

- **Porträt:** Motiv-Key `josie-portrait`. Das echte Foto liegt als fokussierter 4:5-Ausschnitt
  (2609×3262 px) unter `src/assets/photos/josie-portrait.jpg`; Gesicht, Gebäck und Urkunde bleiben
  in allen geprüften Responsive-Crops sichtbar. Alt-Text und Asset-Erkennung laufen über
  `src/lib/images.ts` (`PHOTO_ALT`, `hasPhoto()`).
- **Hero-Layout:** ab 768 px stehen Typografie und Porträt editorial nebeneinander, mobil folgen
  Headline, Lead und Bild untereinander. Das Gesicht wird nicht von Typografie überlagert.
- **Offene Inhalte (sichtbar als Platzhalter markiert, TODO(kunde)):** Herkunft/Weg zum Backen,
  seit wann und warum Übernahme, Team. Die Urkunde „Bester Bäcker 2025 – Landkreis Rostock" ist
  durch das Foto als Leserumfrage der Ostsee-Zeitung belegt. Keine erfundenen Fakten — nur Aussagen,
  die die Website an anderer Stelle bereits trifft (Sauerteig, 18 Stunden, Ruhetage Di/Mi,
  Too Good To Go, Torten auf Bestellung).
- **Verlinkung:** Footer A („Über mich"), mobiles Menü A, Startseiten-Teaser, /a/ueber-uns.
  Die geteilte `NAV_FOOTER` wurde bewusst nicht erweitert (B/C/D haben die Seite nicht).
