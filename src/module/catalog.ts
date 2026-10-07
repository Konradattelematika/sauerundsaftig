/**
 * Katalog-Lader für das Modul-Board: sammelt alle src/module/items/<id>/meta.ts per Glob ein —
 * keine zentrale Liste, neue Elemente brauchen nur ihren Ordner.
 */
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { GROUP_LABELS, type ModuleGroup, type ModuleItem, type OptionId } from './types';

const metas = import.meta.glob<{ default: ModuleItem }>('./items/*/meta.ts', { eager: true });
const components = import.meta.glob<{ default: AstroComponentFactory }>('./items/*/*.astro', { eager: true });

const GROUP_ORDER: ModuleGroup[] = ['grundlagen', 'komponenten', 'bloecke'];

export const ITEMS: ModuleItem[] = Object.values(metas)
  .map((m) => m.default)
  .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.order - b.order);

export function getItem(id: string): ModuleItem | undefined {
  return ITEMS.find((i) => i.id === id);
}

export function itemsByGroup(): { group: ModuleGroup; label: string; items: ModuleItem[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    items: ITEMS.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);
}

const FILE_BY_OPTION: Record<OptionId, string> = { live: 'Live', 'alt-1': 'Alt1', 'alt-2': 'Alt2', 'alt-3': 'Alt3' };

/** Astro-Komponente einer Block-Option (kind: 'block'), sonst undefined */
export function getOptionComponent(itemId: string, optionId: OptionId): AstroComponentFactory | undefined {
  return components[`./items/${itemId}/${FILE_BY_OPTION[optionId]}.astro`]?.default;
}

/** URL der Einzelvorschau (für iframes und „Vollbild") */
export function previewHref(itemId: string, optionId: OptionId): string {
  return `/module/vorschau/${itemId}/${optionId}`;
}
