/**
 * UI-Klassen Variante A „Krume" — ein Satz Buttons/Links, statt überall Duplikate.
 * Motion: nur Farbe/Transform, 300 ms, ease „Teig". Touch-Targets ≥44 px (min-h-11).
 */
const btnBase =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-card px-6 py-3 font-mono text-sm ' +
  'transition-[background-color,color,border-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-brand)] ' +
  'active:translate-y-px';

/** Dunkler Standard-Button (Anrufen, Vorbestellen im Header) */
export const btnPrimary = `${btnBase} bg-ink text-bg hover:bg-primary-deep`;
/** Sanddorn-CTA — max. 2× pro Seite */
export const btnAccent = `${btnBase} bg-accent text-white hover:bg-accent-ink`;
/** Konturbutton */
export const btnSecondary = `${btnBase} border-2 border-ink text-ink hover:bg-ink hover:text-bg`;
/** Dezenter Konturbutton (Anker-Chips o. Ä.) */
export const btnGhost = `${btnBase} border-2 border-ink/20 text-ink hover:border-ink`;

/** Textlink mit animierter Unterstreichung (Klasse link-ul in a.css) */
export const linkUl = 'link-ul inline-flex min-h-11 items-center gap-2 font-mono text-sm text-ink';
/** Textlink mit Pfeil, der beim Hover 3 px nach rechts wandert */
export const linkArrow = `${linkUl} group/link`;
export const arrowIcon = 'arrow-icon inline-block size-4 shrink-0';

export const eyebrow = 'font-mono text-xs uppercase tracking-[0.25em] text-ink-soft';
export const container = 'mx-auto max-w-[1440px] px-4 md:px-8';
