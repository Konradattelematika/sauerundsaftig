/** Modul-Board (module.sauerundsaftig.de) — Katalog-Typen. Konvention: docs/LIVE-PLAN.md §3. */

export type ModuleGroup = 'grundlagen' | 'komponenten' | 'bloecke';
export type OptionId = 'live' | 'alt-1' | 'alt-2' | 'alt-3';

export const OPTION_IDS: readonly OptionId[] = ['live', 'alt-1', 'alt-2', 'alt-3'];

export const GROUP_LABELS: Record<ModuleGroup, string> = {
  grundlagen: 'Grundlagen',
  komponenten: 'Komponenten',
  bloecke: 'Blöcke & Module',
};

export interface ModuleOption {
  id: OptionId;
  /** Kurzer, sprechender Name, z. B. „Ostsee-Morgen" */
  title: string;
  /** 1–2 Sätze: Wofür steht die Option, was ändert sich gegenüber Live? */
  summary: string;
}

export interface ModuleItem {
  /** kebab-case, identisch mit dem Ordnernamen unter src/module/items/ */
  id: string;
  group: ModuleGroup;
  /** Sortierung innerhalb der Gruppe */
  order: number;
  title: string;
  /** Frage an Josie, z. B. „Welche Farbwelt passt zu deinem Café?" */
  question: string;
  /** token = globale Gestaltungsgröße (alt.css + Musterseite), block = eigene Komponente je Option */
  kind: 'token' | 'block';
  /** Wo das Element auf der Live-Seite vorkommt (Pfade ohne Host, z. B. "/besuch") */
  usedOn?: { label: string; path: string }[];
  /** Genau vier Optionen in der Reihenfolge live, alt-1, alt-2, alt-3 */
  options: [ModuleOption, ModuleOption, ModuleOption, ModuleOption];
}
