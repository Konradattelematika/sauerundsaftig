# BRAND-TODO — offene Punkte für den Kunden

Priorisiert. Punkte mit ⛔ blockieren den Launch, ◻︎ sind vor Launch zu klären, ○ später.

1. ⛔ **Öffnungszeiten bestätigen.** Google (Mo 8–16, Di+Mi zu, Do–So 8–16) widerspricht
   Instagram-Bio (Mo–Di 8–17, Mi zu, Do–So 8–17). Website nutzt bis zur Klärung den
   Google-Stand. Pflegeort: `src/content/settings/site.json` → `openingHours`.
2. ⛔ **Preise.** Alle Preise auf Karte, Workshops, Gutscheinen und Vorbestellung sind
   **Platzhalter** (`"placeholder": true` in den Content-Dateien, Hinweis im UI).
   Echte Karte mit Preisen liefern → Werte eintragen, Flag entfernen.
3. ⛔ **Coolify-Deploy.** Der API-Token in `~/.config/deck_sync.env` ist ungültig
   (401 Unauthenticated). Für den Live-Gang: Token erneuern oder App manuell anlegen
   (Anleitung in `README.md`/`HANDOVER.md`). DNS zeigt bereits auf den Server.
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
