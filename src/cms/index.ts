/**
 * CMS-Zugriff für Astro-Seiten und -Komponenten (nur zur Build-Zeit). Vertrag: docs/CMS-PLAN.md.
 *
 *   import { cms, page, href, rich, media, editAttrs } from '../cms';
 *
 * Alle Funktionen lesen denselben SiteDoc (src/cms/store.mjs → SUS_CMS_FILE oder Seed).
 */
import type { LinkValue, MediaRef, NavItem, PageDoc, Section, SiteDoc } from './types';
import { loadSiteDoc, isEditBuild, pagePath, resolveHref, isExternalHref } from './store.mjs';
import { renderRich, plainText, fillTokens } from './rich.mjs';

export type { SiteDoc, PageDoc, Section, LinkValue, MediaRef, NavItem };

/** Der komplette Inhaltsstand dieses Builds */
export function cms(): SiteDoc {
  return loadSiteDoc() as SiteDoc;
}

export const editBuild: boolean = isEditBuild();

/** Seite per ID (wirft, wenn es sie nicht gibt — Tippfehler sollen den Build anhalten) */
export function page(id: string): PageDoc {
  const p = cms().pages.find((x) => x.id === id);
  if (!p) throw new Error(`CMS: Seite "${id}" fehlt im Inhaltsstand`);
  return p;
}

/** Alle aktiven Seiten (für Routing/Sitemap) */
export function activePages(): PageDoc[] {
  return cms().pages.filter((p) => p.status === 'published');
}

export function pageUrl(p: PageDoc): string {
  return pagePath(p);
}

/** Pfad einer Seite per ID, z. B. pageHref('besuch') → '/besuch' (folgt Slug-Änderungen) */
export function pageHref(id: string, anchor?: string): string {
  return pagePath(page(id)) + (anchor ? `#${anchor}` : '');
}

/** Linkziel (page:…, {{tel}}, {{route}}, URL) → href */
export function href(target: string | undefined): string {
  return resolveHref(target ?? '', cms());
}

export function isExternal(target: string | undefined): boolean {
  return isExternalHref(target ?? '');
}

/** Attribute für <a>: href + bei extern/newTab target/rel */
export function linkAttrs(link: Pick<LinkValue, 'href' | 'newTab'>): Record<string, string> {
  const attrs: Record<string, string> = { href: href(link.href) };
  if (link.newTab || isExternal(link.href)) {
    attrs.target = '_blank';
    attrs.rel = 'noopener';
  }
  return attrs;
}

/** Ist ein Link sichtbar (visible !== false und mit Text)? */
export function shown(link: LinkValue | NavItem | undefined | null): boolean {
  return Boolean(link && link.visible !== false && link.label);
}

/** Sicheres HTML aus einem rich-Feld (s. rich.mjs). blocks: Absätze als <p> */
export function rich(text: string | undefined, opts: { blocks?: boolean; linkClass?: string; pClass?: string } = {}): string {
  return renderRich(text ?? '', cms(), opts);
}

/** Klartext aus einem rich-Feld (Meta, JSON-LD) */
export function plain(text: string | undefined): string {
  return plainText(text ?? '', cms());
}

/** {{platzhalter}} in reinem Text ersetzen (für text/textarea-Felder, die Einstellungswerte nennen) */
export function tokens(text: string | undefined): string {
  return fillTokens(text ?? '', cms().settings);
}

/** Medien-Eintrag + wirksamer Alt-Text für eine MediaRef bzw. eine Medien-ID */
export function media(ref: MediaRef | string | null | undefined): { id: string; alt: string } | null {
  if (!ref) return null;
  const id = typeof ref === 'string' ? ref : ref.media;
  const item = cms().media.find((m) => m.id === id);
  if (!item) throw new Error(`CMS: Medium "${id}" fehlt in der Medienbibliothek`);
  const override = typeof ref === 'string' ? '' : (ref.alt ?? '').trim();
  return { id, alt: override || item.alt };
}

/**
 * Editor-Marker (nur im Vorschau-/Editor-Build, sonst {} → Markup bleibt identisch).
 * Auf das Wurzelelement einer Sektion: editSection(section). Auf ein Feld-Element:
 * editAttrs(section, 'title') bzw. für Listeneinträge editAttrs(section, 'items.2.name').
 * kind steuert die Live-Vorschau im Editor (text = textContent, rich = innerHTML, media = Bild, link = href+Text).
 */
export function editSection(section: Pick<Section, 'id' | 'type'>): Record<string, string> {
  return editBuild ? { 'data-cms-section': section.id, 'data-cms-type': section.type } : {};
}

export function editAttrs(
  section: Pick<Section, 'id'> | string,
  path: string,
  kind: 'text' | 'rich' | 'media' | 'link' = 'text',
): Record<string, string> {
  if (!editBuild) return {};
  const sid = typeof section === 'string' ? section : section.id;
  return { 'data-cms-field': `${sid}:${path}`, 'data-cms-kind': kind };
}

/** Sichtbare Sektionen einer Seite (Reihenfolge = Inhaltsstand) */
export function visibleSections(p: PageDoc): Section[] {
  return p.sections.filter((s) => s.visible !== false);
}

/** Erste sichtbare Sektion eines Typs (für Seiten mit fester Struktur) */
export function sectionOf<F = Record<string, unknown>>(p: PageDoc, type: string): Section<F> | undefined {
  return p.sections.find((s) => s.type === type && s.visible !== false) as Section<F> | undefined;
}
