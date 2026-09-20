# BRAND-TODO — offene Punkte für den Kunden

Priorisiert. Punkte mit ⛔ blockieren den Launch, ◻︎ sind vor Launch zu klären, ○ später.

## Vorschau-Schutz (aktiv seit 17.08.2026)

- Die gesamte Site liegt hinter **Basic Auth** (Benutzer `sauer`, Passwort separat mitgeteilt)
  und ist per `robots.txt: Disallow /` + `X-Robots-Tag: noindex` für Suchmaschinen gesperrt.
- **Vor dem Launch entfernen:** in `deploy/nginx.conf` die beiden `auth_basic`-Zeilen und den
  `X-Robots-Tag`-Header löschen, `public/robots.txt` wieder auf `Allow` + Sitemap stellen,
  Passwort ändern oder `deploy/htpasswd` löschen. Danach Deploy anstoßen.

## Neu seit 19.09.2026 — Variante A (Warm Krume), Details in docs/MATERIAL-THEKE.md

- ✅ **Beide nachgelieferten Bilder eingebunden (19.09.2026):** Josies Porträt mit Urkunde liegt als
  fokussierter 4:5-Ausschnitt unter `src/assets/photos/josie-portrait.jpg`; die echte Thekenoberfläche
  ersetzt unter `src/assets/textures/terrazzo.jpg` den prozeduralen Platzhalter.
- ◻︎ **Über-mich-Texte** (/a/ueber-mich): Herkunft/Weg zum Backen, Übernahme (seit wann, warum), Team,
  jeweils möglichst in Josies eigenen Worten. Die noch offene Platzhalterbox ist im Layout sichtbar markiert;
  die Auszeichnung ist durch das Foto als Leserumfrage der Ostsee-Zeitung belegt.
- ○ **Instagram-Live-Feed — erst NACH der Übergabe** (Konrad, 20.09.2026): Die Website ist ein
  Geburtstagsgeschenk für Josie und ihren Laden, sie weiß noch nichts davon. Der Access-Token setzt ihr
  Instagram-Konto voraus und kommt deshalb erst nach dem Schenken. Bis dahin ist der lokale Fallback
  (5 importierte Posts + Café-Fotos, verlinkt aufs Profil) der Zielzustand — auch für die Übergabe.
  Danach: Business/Creator-Konto + Token → Build-Env `INSTAGRAM_ACCESS_TOKEN` (Coolify), Rebuild.
  Aus demselben Grund können die offenen Über-mich-Texte (Punkt oben) erst nach der Übergabe von Josie kommen.

## Instagram-Befunde (Import 16.08.2026, Details in brand/sources.md)

- ⛔ **„Kleine Brotpause diesen Sommer"** — der neueste Post (Shortcode DZws5d3MDjT) kündigt eine
  sommerliche Brotpause an, zusammen mit „Zuwachs in der Sauer&Saftig-Familie". Unsere Seiten
  /karte/brot und /vorbestellen bieten Brot an — **vor Launch klären**, ob/wann Brot wieder
  verfügbar ist und ob ein Hinweisbanner nötig ist.
- Profil aktuell: **1.141 Follower, 59 Beiträge** (Recherche-Stand im Auftrag war 743/38 — Account wächst).
- Belegt durch Posts: Torten auf Kundenauftrag (DVN4rovjLik), Erdbeer-Mascarpone-Vintagetorte
  (DVTVQDlDKsn), Käsekuchen-Auswahl in der Theke (DViajs2jKPF), Matcha-Spezial „Erdbeerwolkenschaum"
  (DVLQSKejP4W, saisonal). Drei Echtfotos sind bereits als Motive eingebunden
  (src/assets/photos/: brot-laib, obsttorte, kaesekuchen).
- Instagram-Bio (inkl. der dort genannten Öffnungszeiten) ist ohne Login **nicht abrufbar** —
  Bio-Angaben konnten weder bestätigt noch widerlegt werden.

1. ✅ **Öffnungszeiten bestätigt** (Konrad, 16.08.2026): Do–Mo 8–16 Uhr, Di+Mi geschlossen.
   Reservierungen/Anfragen ausschließlich telefonisch unter 038296 769924.
   Pflegeort: `src/data/site.json` → `openingHours` (Stand entspricht bereits dem hinterlegten
   Google-Stand, `todoKunde`-Hinweis entfernt).
2. ◻︎ **Preise — teilweise echt (16.08.2026):** Frühstück (komplette Karte aus geliefertem PDF)
   und Brote (Tafel-Foto: Dinkelvollkorn mit Saaten 6,50 · Bauernbrot 7 · Roggenvollkorn 7) sind
   übernommen, `priceIsPlaceholder: false`. Noch Platzhalter (°): Kuchen/Torten stückweise,
   Schnecken, Getränke (Tafel nur teilweise lesbar — zweite Größen fehlen), Workshops, Gastgeber.
3. ✅ **Coolify-Deploy** erledigt — Site läuft live unter sauerundsaftig.jawollja.gmbh.
4. ◻︎ **Team & Übernahme-Story.** Namen der Betreiber:innen, Zeitpunkt/Anlass der Übernahme,
   1–2 O-Töne. `/ueber-uns` erzählt die Story bewusst ohne Namen („Wir") — mit Namen wird
   sie doppelt so stark. `TODO(kunde)`-Marker im Code.
5. ◻︎ **Restliche Fotomotive** nach `IMAGE-BRIEF.md`; zahlreiche Café-/Produktbilder sowie Josies Porträt
   sind bereits echt, noch unbelegte Motiv-Keys fallen weiterhin klar erkennbar auf Platzhalter zurück.
6. ◻︎ **Workshops freigeben:** Formate, echte Termine, echte Preise, max. Teilnehmerzahl.
   Aktuelle Kurse/Termine sind als Entwurf gekennzeichnet.
7. ◻︎ **Öffnungszeiten-Ausnahmen** (Feiertage, Betriebsferien) melden → `exceptions` in site.json.
8. ◻︎ **Zahlungsmittel bestätigen** (Karte/Apple Pay?) — aktuell `TODO(kunde)` auf /besuch.
9. ○ **Domain sauerundsaftig.de** sichern + auf die Live-Site zeigen lassen
   (jawollja.gmbh-Subdomain ist Staging/Präsentation).
10. ○ **Newsletter-Anbindung** (Brevo/Resend) — Formular ist UI-fertig, sendet noch nicht.
11. ○ **Plausible aktivieren** — Snippet vorbereitet, standardmäßig aus
    (`PUBLIC_PLAUSIBLE=1` beim Build setzen).
12. ○ **Individuelle Marken-Icons** (8 Slots definiert, aktuell Lucide-Basis).

**Logo:** liegt vor (Wortmarke „sauer&saftig / BROT·KUCHEN") und ist in allen Varianten
unverändert eingesetzt. Empfehlung an Kunden: Original-Vektordaten (AI/EPS der Type, nicht
der Trace) beim Gestalter anfordern — verbessert Schärfe in sehr großen Darstellungen.
