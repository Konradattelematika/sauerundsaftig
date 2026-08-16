# Quellen & Abrufprotokoll — Instagram-Brand-Import

- Abrufdatum: 2026-08-16T09:38:07.624Z (Zeitzone: UTC im Zeitstempel; Server-Zeitzone Europe/Berlin)
- Quelle: https://www.instagram.com/sauerundsaftig/
- Werkzeug: tools/brand-import/import.mjs (dieses Repo, MIT-artig / eigener Code)
- Verwendete Bibliotheken: node:fetch (eingebaut), playwright-core (installiert, MIT-Lizenz), node:crypto (eingebaut)
- Chromium-Binary: chrome-headless-shell (lokal unter ~/.cache/ms-playwright, keine Systeminstallation)

## Was funktionierte

- **Profil-Embed-Widget** (`https://www.instagram.com/sauerundsaftig/embed/`) lieferte Profildaten (Follower-/Post-Anzahl, Profilbild, Anzeigename) sowie die letzten 6 Post(s) (Shortcode, Caption, Bild, Zeitstempel, Engagement-Zahlen). Methode: playwright.
- **Post-Embed-Detailseiten** (`/p/<shortcode>/embed/captioned/`) lieferten je Post zusätzlich die beste verfügbare Bildauflösung, `accessibility_caption` (falls vorhanden) und Engagement-Zahlen.

## Was NICHT funktionierte / blockiert war

- **Bio-Text.** Weder die vollständige Profilseite (`https://www.instagram.com/USERNAME/`) noch die Embed-Widgets liefern öffentlich/ohne Login den Bio-Text. Die vollständige Profilseite gibt für automatisierte/ausgeloggte Anfragen entweder eine generische React-Shell ohne SSR-Daten zurück (per fetch()) oder — bei Playwright-Rendering — die Fehlerseite „Page ist nicht verfügbar" (client-seitiger Datenabruf der App scheitert ohne Session). Damit konnte die im Auftrag genannte Bio „Auf der Reise zum Sauerteig Café / Mo-Di 8-17Uhr / Mi geschlossen / Do-So 8-17Uhr" **weder bestätigt noch widerlegt** werden — sie taucht in keiner der abgerufenen Quellen wörtlich auf. NICHT in Website-Daten übernommen (ohnehin nicht verlangt).
- **Vollständige Post-Historie.** Das Profil-Embed-Widget liefert ohne Login nur eine kleine feste Anzahl der letzten Posts (hier: 6 von insgesamt 59 laut Instagram-Zähler) — keine Pagination/Cursor verfügbar. Ältere Posts sind über die getesteten kostenlosen, öffentlichen Wege nicht erreichbar.
- **gallery-dl / instaloader.** Laut Server-Vorgabe kein pip/venv erlaubt — nicht versucht, obwohl `python3 -m pip` auf diesem System technisch vorhanden ist (pip 26.2.1, Python 3.14). Diese Werkzeuge sind daher grundsätzlich außerhalb dieses Servers, aber NICHT auf diesem eingesetzt.
- **`api/v1/users/web_profile_info` (interner Instagram-JSON-Endpoint).** Kurz stichprobenartig getestet, antwortete mit HTTP 429 (Rate-Limit). Nicht Teil der dokumentierten Fallback-Kette des Auftrags und „inoffiziell" — daher NICHT in den Importer übernommen, um keine Grauzone bei „keine aggressive Umgehung von Schutzmechanismen" zu riskieren.
- **fetch() auf /embed/ ist nicht-deterministisch.** In wiederholten Tests lieferte derselbe einfache fetch()-Request auf dieselbe Embed-URL abwechselnd echte Daten oder eine generische Shell ohne Daten (vermutlich serverseitiges Rate-Limiting/Bot-Heuristik, nicht reproduzierbar erzwingbar). Deshalb hat der Importer einen Playwright-Rendering-Fallback (in unseren Tests durchgehend zuverlässig).

## Beobachtete Werte vs. Auftrags-Erwartung

- Follower: **1141** beobachtet (Auftrag nannte als Recherchestand 743 — Account ist seither gewachsen, oder Angabe war bereits veraltet zum Zeitpunkt des Auftrags).
- Beiträge: **59** laut Instagram-Zähler (Auftrag nannte 38).

## Vollständiges Abrufprotokoll

- Import gestartet: 2026-08-16T09:38:07.624Z
- Ziel-Profil: https://www.instagram.com/sauerundsaftig/
- Profil-HTML (https://www.instagram.com/sauerundsaftig/): keine og:-Meta-Tags in der Server-Antwort gefunden (Instagram liefert für ausgeloggte/automatisierte Anfragen inzwischen eine generische React-Shell ohne SSR-og-Tags — Stand 16.08.2026).
- Profil-Embed: fetch() lieferte keine contextJSON-Daten (generische Shell) — Playwright-Fallback.
- Profil-Embed: contextJSON per Playwright-Rendering erhalten.
- Profilbild heruntergeladen (2586 Bytes).
- Profil-Embed-Widget lieferte 6 Post(s) (Instagram begrenzt dieses Widget ohne Login auf die letzten Posts — keine Pagination verfügbar).
- Post DZws5d3MDjT: fetch() lieferte keine contextJSON-Daten (generische Shell) — Playwright-Fallback.
- Post DZws5d3MDjT: contextJSON per Playwright-Rendering erhalten.
- Post DZws5d3MDjT: Bild heruntergeladen (942056 Bytes) → assets/bread/DZws5d3MDjT.jpg.
- Post DZev-CbMF3J: fetch() lieferte keine contextJSON-Daten (generische Shell) — Playwright-Fallback.
- Post DZev-CbMF3J: contextJSON per Playwright-Rendering erhalten.
- Post DZev-CbMF3J: Bild heruntergeladen (41317 Bytes) → assets/misc/DZev-CbMF3J.jpg.
- Post DViajs2jKPF: fetch() lieferte keine contextJSON-Daten (generische Shell) — Playwright-Fallback.
- Post DViajs2jKPF: contextJSON per Playwright-Rendering erhalten.
- Post DViajs2jKPF: Bild heruntergeladen (54369 Bytes) → assets/misc/DViajs2jKPF.jpg.
- Post DVTVQDlDKsn: fetch() lieferte keine contextJSON-Daten (generische Shell) — Playwright-Fallback.
- Post DVTVQDlDKsn: contextJSON per Playwright-Rendering erhalten.
- Post DVTVQDlDKsn: Bild heruntergeladen (33612 Bytes) → assets/bakery/DVTVQDlDKsn.jpg.
- Post DVN4rovjLik: fetch() lieferte keine contextJSON-Daten (generische Shell) — Playwright-Fallback.
- Post DVN4rovjLik: contextJSON per Playwright-Rendering erhalten.
- Post DVN4rovjLik: Bild heruntergeladen (46228 Bytes) → assets/bakery/DVN4rovjLik.jpg.
- Post DVLQSKejP4W: fetch() lieferte keine contextJSON-Daten (generische Shell) — Playwright-Fallback.
- Post DVLQSKejP4W: contextJSON per Playwright-Rendering erhalten.
- Post DVLQSKejP4W: Bild heruntergeladen (26167 Bytes) → assets/misc/DVLQSKejP4W.jpg.

## Rechtlicher Hinweis

Alle Inhalte sind öffentlich einsehbare Inhalte des Instagram-Profils selbst (Café-eigener Account) — Bilder/Captions bleiben Eigentum des Account-Betreibers und wurden ausschließlich für die interne Marken-Recherche desselben Betreibers importiert, nicht zur Weiterveröffentlichung an Dritte ohne erneute Freigabe.
