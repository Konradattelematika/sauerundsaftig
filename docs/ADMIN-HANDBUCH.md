# Admin-Handbuch — sauerundsaftig.de selbst pflegen

Stand: 09.10.2026. Das Dashboard liegt unter **https://sauerundsaftig.de/admin** (auch über die Subdomains
erreichbar). Anmeldung mit dem bekannten Benutzernamen und Passwort; das Passwort lässt sich unter
`/passwort` ändern. Ohne Anmeldung ist das Dashboard nicht erreichbar, und Besucherinnen und Besucher der
Website können nichts verändern.

## So funktioniert's in einem Satz

Du änderst etwas → es wird automatisch als **Entwurf** gespeichert → du siehst es in der **Vorschau** →
mit **Veröffentlichen** geht es auf die echte Website. Bis dahin sieht niemand draußen etwas davon.

## Die Bereiche (linke Spalte)

| Bereich | Was du dort machst |
|---|---|
| **Übersicht** | Stand auf einen Blick: ungespeicherte/unveröffentlichte Änderungen, letzte Veröffentlichung, offene Prüfhinweise, Schnellzugriffe. |
| **Seiten** | Alle Seiten der Website: öffnen, neue Seite anlegen, Seite ausblenden (deaktivieren) oder wieder einschalten, selbst angelegte Seiten löschen oder duplizieren. Je Seite: Titel, Adresse (URL), Brotkrumen, Suchmaschinen-Angaben (SEO). |
| **Seiteneditor** | Öffnet sich aus „Seiten": links die Abschnitte der Seite, in der Mitte die Vorschau, rechts das Formular des gewählten Abschnitts (siehe unten). |
| **Medien** | Bildbibliothek: hochladen (Ziehen & Ablegen oder Datei wählen), Alt-Text bearbeiten, ein vorhandenes Bild überall auf einmal **ersetzen**, nicht mehr benötigte Uploads löschen, „Wo verwendet?" ansehen. |
| **Navigation** | Hauptmenü (mit Untermenüs), der Knopf rechts im Kopf („Vorbestellen"), Fußzeilen-Menü, rechtliche Links, Social-Media-Links — Reihenfolge per Pfeilen oder Ziehen. |
| **Header & Footer** | Logo, Öffnungsstatus im Kopf, Texte der Fußzeile (Claim, Beschreibung, Überschriften, Copyright), die mobile Leiste unten. |
| **Buttons & Links** | Alle Buttons und Links der ganzen Website in einer Liste — mit Warnung, wenn ein Ziel nicht (mehr) existiert. |
| **SEO** | Tabelle aller Seiten mit Titel und Beschreibung (Längen-Ampel), Standard-Vorschaubild für Social Media. |
| **Einstellungen** | Name, Claim, Adresse, Telefon, E-Mail, Instagram, **Öffnungszeiten** (je Wochentag, mit Ausnahmen wie Feiertagen), Frühstück-bis, Zahlung, Barrierefreiheit, Hunde, Live-Domain. Diese Werte erscheinen überall, wo sie gebraucht werden (Öffnungsstatus, Fußzeile, Besuch-Seite, Suchmaschinen-Daten). |
| **Karte** | Die Speisekarte: Kategorien und Einträge mit Beschreibung, Preis, Hinweisen (Veggie, Signature, Allergene, Saison) und Bild; sortieren, hinzufügen, löschen. Der °-Hinweis „Beispielpreis" verschwindet, sobald der Haken „Platzhalterpreis" weg ist. |
| **FAQ** | Fragen und Antworten (Fließtext mit Fett/Kursiv/Links), sichtbar/unsichtbar, Reihenfolge. |
| **Gästestimmen** | Zitate mit Name/Monat. Einträge mit dem Haken „Platzhalter" erscheinen nicht auf der Website. |
| **Aus der Backstube** | Die Tafel auf der Startseite: Datum und die Positionen mit Bild und Hinweis. |
| **Benutzer** | Zugänge anlegen (Rolle *Admin* oder *Redaktion*), Passwort setzen, Zugang entfernen. Zugänge aus der Server-Konfiguration können nur ein neues Passwort bekommen. |
| **Versionen** | Jede Veröffentlichung wird gesichert. „Als Entwurf wiederherstellen" holt einen alten Stand in den Entwurf — veröffentlicht wird er erst, wenn du es ausdrücklich tust. |

Rollen: **Admin** darf alles, **Redaktion** alles außer Benutzerverwaltung.

## Der Seiteneditor

1. **Abschnitt wählen:** in der Liste links oder einfach in der Vorschau anklicken — das passende Formular öffnet sich.
2. **Text ändern:** im Formular tippen. Überschriften, Absätze, Buttons, Bildunterschriften … ändern sich in der
   Vorschau sofort. Fließtext-Felder kennen **fett**, *kursiv* und Links (Knöpfe über dem Feld). Eine Leerzeile
   ergibt einen neuen Absatz.
3. **Bild tauschen:** auf das Bildfeld → aus der Bibliothek wählen oder hochladen; optional ein eigener
   Alt-Text für genau diese Stelle.
4. **Link/Button ändern:** Beschriftung, Ziel (eine Seite der Website, eine externe Adresse, Telefon, E-Mail oder
   die Route zum Café), „in neuem Tab öffnen", „sichtbar" und — wo die Stelle das kann — die Darstellung
   (z. B. dunkel/orange/Kontur).
5. **Wiederholbare Inhalte** (Listen wie Buttons, Karten, Schritte, Angebote): hinzufügen, löschen, per Pfeilen
   oder Ziehen sortieren, einklappen.
6. **Abschnitte ein-/ausblenden** (Auge), sortieren, duplizieren, löschen oder **neu hinzufügen** — nur aus den
   vorgesehenen Bausteinen der Website (z. B. Text, Bild & Text, Karten, Handlungsaufforderung, Zitat, Besuch,
   Gästestimmen, Newsletter, Zeitstrahl …). So bleibt das Design immer stimmig.
7. **Vorschau-Breite:** Handy / Tablet / Desktop. Nach Struktur-Änderungen (Abschnitt hinzugefügt, sortiert,
   ausgeblendet) baut die Vorschau kurz neu (einige Sekunden) und lädt dann nach.

## Speichern, Vorschau, Veröffentlichen, Verwerfen

- **Speichern** passiert automatisch (ca. 1,5 s nach der letzten Eingabe); der Status steht oben.
  Arbeiten zwei Personen gleichzeitig, meldet das Dashboard den Konflikt und fragt, welche Fassung gilt.
- **Vorschau ansehen** öffnet die Website mit dem Entwurf in einem neuen Tab (nur für Angemeldete, mit Leiste
  oben). Die echte Website bleibt unverändert.
- **Veröffentlichen** zeigt erst eine Übersicht der Änderungen und baut dann die Website neu (meist 10–60 s,
  Fortschritt im Dashboard). Scheitert der Bau, bleibt die bisherige Website online.
- **Entwurf verwerfen** setzt den Entwurf auf den veröffentlichten Stand zurück.
- Prüfhinweise: Pflichtfelder, zu lange Texte, tote Linkziele usw. werden am Feld gezeigt; mit Fehlern lässt sich
  nicht veröffentlichen, ein unfertiger Entwurf darf aber gespeichert werden.

## Seiten und Adressen

- Neue Seite: Titel eingeben → die Adresse wird vorgeschlagen (nur Kleinbuchstaben, Ziffern, Bindestriche; doppelte
  oder reservierte Adressen werden abgelehnt). Dann Abschnitte hinzufügen.
- Adresse einer bestehenden Seite ändern: Die alte Adresse leitet nach dem Veröffentlichen automatisch dauerhaft
  (301) auf die neue um — Links von außen bleiben gültig.
- Seite deaktivieren: verschwindet aus Website, Menüs und Sitemap; Links darauf werden in „Buttons & Links"
  gewarnt. Seiten des Grundbestands lassen sich nicht löschen, nur deaktivieren.

## Suchmaschinen (SEO) je Seite

Titel, Beschreibung, Adresse, Open-Graph-Titel/-Beschreibung/-Bild, Canonical-Adresse, „nicht indexieren".
Impressum und Datenschutz sind standardmäßig auf „nicht indexieren".

## Was bewusst nicht im Dashboard liegt

Login- und Passwortseiten, die Countdown-Bühne bis zum 10.10.2026, die internen Werkzeuge (Checkliste,
Modul-Board), die alten Design-Varianten B–D und die Fehler-/Hinweistexte innerhalb der Formulare
(Vorbestellung, Gutschein). Diese ändern sich im Code.

## Technik in Kürze (für Konrad)

Inhalte liegen als JSON unter `/data/cms` (Entwurf, veröffentlichter Stand, Versionen), Bilder unter `/data/media`.
Beim Veröffentlichen baut der Server die statische Website neu (`docs/CMS-PLAN.md` §7) und schaltet atomar um;
Caches werden dabei frisch gesetzt. Nach einem Code-Deploy baut der Server beim Start einmal mit dem veröffentlichten
Inhalt nach. Betrieb, Env-Variablen und Wiederherstellung: `server/README.md`.
