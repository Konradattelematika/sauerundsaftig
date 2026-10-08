/**
 * Sektions-Registry: jeder Ordner src/cms/sections/<typ>/ enthält
 *   definition.mjs  — export default SectionDefinition (Felder, Startwerte; auch vom Server/Admin genutzt)
 *   Section.astro   — Darstellung; Props: { section, page, context? }
 * Keine zentrale Liste: neue Typen brauchen nur ihren Ordner (docs/CMS-PLAN.md §4).
 */
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import type { SectionDefinition } from '../types';

const defs = import.meta.glob<{ default: SectionDefinition }>('./*/definition.mjs', { eager: true });
const comps = import.meta.glob<{ default: AstroComponentFactory }>('./*/Section.astro', { eager: true });

const typeOf = (p: string) => p.split('/')[1];

export const SECTION_DEFINITIONS: Record<string, SectionDefinition> = Object.fromEntries(
  Object.entries(defs).map(([p, m]) => [typeOf(p), m.default]),
);

export function sectionComponent(type: string): AstroComponentFactory {
  const c = comps[`./${type}/Section.astro`];
  if (!c) throw new Error(`CMS: Sektionstyp "${type}" hat keine Section.astro`);
  return c.default;
}
