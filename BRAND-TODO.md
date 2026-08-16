# BRAND-TODO — offene Punkte für den Kunden

Priorisiert. Punkte mit ⛔ blockieren den Launch, ◻︎ sind vor Launch zu klären, ○ später.

1. ✅ **Öffnungszeiten bestätigt** (Konrad, 16.08.2026): Do–Mo 8–16 Uhr, Di+Mi geschlossen.
   Reservierungen/Anfragen ausschließlich telefonisch unter 038296 769924.
   Pflegeort: `src/data/site.json` → `openingHours` (Stand entspricht bereits dem hinterlegten
   Google-Stand, `todoKunde`-Hinweis entfernt).
2. ⛔ **Preise.** Alle Preise auf Karte, Workshops, Gutscheinen und Vorbestellung sind
   **Platzhalter** (`"placeholder": true` in den Content-Dateien, Hinweis im UI).
   Echte Karte mit Preisen liefern → Werte eintragen, Flag entfernen. (Konrad ist dran, 16.08.2026.)
3. ✅ **Coolify-Deploy** erledigt — Site läuft live unter sauerundsaftig.jawollja.gmbh.
4. ◻︎ **Team & Übernahme-Story.** Namen der Betreiber:innen, Zeitpunkt/Anlass der Übernahme,
   1–2 O-Töne. `/ueber-uns` erzählt die Story bewusst ohne Namen („Wir") — mit Namen wird
   sie doppelt so stark. `TODO(kunde)`-Marker im Code.
5. ◻︎ **Fotoshooting** nach `IMAGE-BRIEF.md` (alle Bilder sind aktuell markierte Platzhalter).
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
