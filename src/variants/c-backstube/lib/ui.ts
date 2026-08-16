/**
 * Wiederverwendete Klassen-Strings für Variante C „Backstube".
 * Print-Schatten-Buttons sind DAS Button-Stilmittel dieser Variante (VARIANT-BRIEF §Bewegung).
 */

const base =
  'inline-flex min-h-[44px] items-center justify-center gap-2 border-2 border-ink px-6 py-3 font-mono text-[15px] uppercase tracking-wide transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-brand)] shadow-[4px_4px_0_var(--color-ink)] active:translate-y-[2px] active:shadow-none';

/** Auf hellem Grund (bg/bg-alt/paper): Ink-Fläche, heller Text. */
export const btnPrimary = `${base} bg-ink text-paper`;
/** Auf hellem Grund: Outline, ink-Text. */
export const btnSecondary = `${base} bg-paper text-ink`;
/** Auf dunklem Vollton (primary/secondary): Papier-Fläche, dunkler Text, Schatten in Papierfarbe. */
export const btnOnDark = `${base.replace('shadow-[4px_4px_0_var(--color-ink)]', 'shadow-[4px_4px_0_var(--color-paper)]')} bg-paper text-ink border-paper`;

/** Gestempelte Badges: Veggie/Vegan/Verknappung. Mindestens 15px (VARIANT-BRIEF §6). */
export const stamp =
  'inline-flex items-center gap-1 border-2 border-current px-2.5 py-1 font-mono text-[15px] uppercase tracking-wide';

export const navLink =
  'font-mono text-[15px] uppercase tracking-wide text-ink transition-colors duration-[var(--dur-fast)] ease-[var(--ease-brand)] hover:text-accent-ink aria-[current=page]:text-accent-ink aria-[current=page]:underline underline-offset-4';

export const label = 'font-mono text-[15px] uppercase tracking-[0.15em] text-ink-soft';
export const labelOnDark = 'font-mono text-[15px] uppercase tracking-[0.15em] text-paper/80';
