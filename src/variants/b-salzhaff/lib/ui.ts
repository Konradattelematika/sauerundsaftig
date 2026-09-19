/**
 * Zentrale Klassen-Strings für Variante B „Salzhaff" — ein Button-/Link-Set,
 * statt dieselben Tailwind-Strings auf jeder Seite zu duplizieren.
 * Radius 0 (rounded-card), ruhige 250–350ms-Übergänge mit var(--ease-brand).
 */

/** Primärer CTA: gefüllt, Sanddorn-Akzent (Route, Vorbestellen, …). */
export const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center rounded-card bg-accent px-6 py-3 font-mono text-[15px] text-white transition-colors duration-[var(--dur-fast)] ease-[var(--ease-brand)] hover:bg-accent-ink';

/** Sekundär-Button: dunkel gefüllt, für Formulare/Abschluss-Aktionen (kein Sanddorn). */
export const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center rounded-card bg-ink px-6 py-3 font-mono text-[15px] text-bg transition-colors duration-[var(--dur-fast)] ease-[var(--ease-brand)] hover:bg-primary-deep';

/** Textlink mit wandernder Pfeilspitze (group-hover verschiebt den Pfeil 4px). */
export const linkArrow =
  'group inline-flex min-h-[44px] w-fit items-center gap-2 font-mono text-[15px] text-ink';
export const linkArrowIcon =
  'transition-transform duration-[var(--dur-fast)] ease-[var(--ease-brand)] group-hover:translate-x-1';

/** Zurück-Link ("← Alle Workshops") — ruhiger, gedämpfter Ton. */
export const linkBack =
  'inline-flex min-h-[44px] items-center gap-2 font-mono text-[15px] text-ink-soft transition-colors duration-[var(--dur-fast)] ease-[var(--ease-brand)] hover:text-ink';

/** Inline-Textlink in Fließtext: dauerhaft unterstrichen (WCAG 1.4.1), Übergang jetzt sanft statt hart. */
export const linkUnderline =
  'text-ink underline decoration-ink/30 underline-offset-4 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-brand)] hover:decoration-ink';

/** Sanfte Bildskalierung für verlinkte Bild-Wrapper (overflow-hidden vorausgesetzt). */
export const imgHoverScale =
  'transition-transform duration-[var(--dur-slow)] ease-[var(--ease-brand)] group-hover:scale-[1.02]';

/** Riesige Telefonnummer (Besuch/Kontakt/Jobs) — gleiche Größe, gleicher Hover-Ton. */
export const phoneLinkLg =
  'block min-h-[44px] w-fit font-mono text-[clamp(2rem,7vw,3.5rem)] tabular text-ink transition-colors duration-[var(--dur-fast)] ease-[var(--ease-brand)] hover:text-primary';
