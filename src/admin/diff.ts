/** Änderungsübersicht Entwurf ↔ veröffentlichter Stand (für die Rückfrage vor dem Veröffentlichen). */
import type { PageDoc, SiteDoc } from '../cms/types';
import { COLLECTION_DEFS, NAV_DEFS, SETTINGS_GROUPS, sectionDef } from './defs';
import { deepEqual, isPlainObject, truncate } from './util';

export interface ChangeGroup {
  area: string;
  route: string;
  items: string[];
}

const secName = (s: { type: string; fields?: Record<string, unknown> }) => {
  const def = sectionDef(s.type);
  const title = isPlainObject(s.fields) && typeof s.fields.title === 'string' && s.fields.title ? ` „${truncate(s.fields.title, 40)}"` : '';
  return `${def?.label ?? s.type}${title}`;
};

function pageChanges(a: PageDoc, b: PageDoc): string[] {
  const out: string[] = [];
  if (a.title !== b.title) out.push(`Titel: „${a.title}" → „${b.title}"`);
  if (a.slug !== b.slug) out.push(`Adresse: /${a.slug} → /${b.slug} (Weiterleitung wird angelegt)`);
  if (a.status !== b.status) out.push(b.status === 'published' ? 'wird aktiviert' : 'wird deaktiviert (offline)');
  if (!deepEqual(a.seo, b.seo)) out.push('SEO-Angaben geändert');
  if (a.breadcrumb !== b.breadcrumb || a.showBreadcrumbs !== b.showBreadcrumbs) out.push('Brotkrumen geändert');
  const aIds = a.sections.map((s) => s.id);
  const bIds = b.sections.map((s) => s.id);
  for (const s of b.sections) if (!aIds.includes(s.id)) out.push(`Sektion hinzugefügt: ${secName(s)}`);
  for (const s of a.sections) if (!bIds.includes(s.id)) out.push(`Sektion entfernt: ${secName(s)}`);
  const common = bIds.filter((id) => aIds.includes(id));
  const aOrder = aIds.filter((id) => common.includes(id));
  if (!deepEqual(aOrder, common)) out.push('Reihenfolge der Sektionen geändert');
  for (const s of b.sections) {
    const old = a.sections.find((x) => x.id === s.id);
    if (!old) continue;
    if (old.visible !== s.visible) out.push(`${secName(s)} ${s.visible ? 'eingeblendet' : 'ausgeblendet'}`);
    if (!deepEqual(old.fields, s.fields)) {
      const def = sectionDef(s.type);
      const keys = Object.keys({ ...old.fields, ...s.fields }).filter((k) => !deepEqual(old.fields[k], s.fields[k]));
      const labels = keys.map((k) => def?.fields.find((f) => f.key === k)?.label ?? k);
      out.push(`${secName(s)}: ${labels.slice(0, 4).join(', ')}${labels.length > 4 ? ` und ${labels.length - 4} weitere` : ''} geändert`);
    }
  }
  return out;
}

function listDiff<T>(a: T[], b: T[], key: (x: T) => string, name: (x: T) => string): string[] {
  const out: string[] = [];
  const ak = new Map(a.map((x) => [key(x), x]));
  const bk = new Map(b.map((x) => [key(x), x]));
  for (const [k, x] of bk) if (!ak.has(k)) out.push(`neu: ${name(x)}`);
  for (const [k, x] of ak) if (!bk.has(k)) out.push(`entfernt: ${name(x)}`);
  for (const [k, x] of bk) {
    const old = ak.get(k);
    if (old && !deepEqual(old, x)) out.push(`geändert: ${name(x)}`);
  }
  const order = (arr: T[]) => arr.map(key).filter((k) => ak.has(k) && bk.has(k));
  if (!out.length && !deepEqual(order(a), order(b))) out.push('Reihenfolge geändert');
  else if (out.length && !deepEqual(order(a), order(b))) out.push('Reihenfolge geändert');
  return out;
}

export function diffDocs(pub: SiteDoc, draft: SiteDoc): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const push = (area: string, route: string, items: string[]) => items.length && groups.push({ area, route, items });

  // Seiten
  const pages: string[] = [];
  for (const p of draft.pages) {
    const old = pub.pages.find((x) => x.id === p.id);
    if (!old) pages.push(`Neue Seite „${p.title}" (/${p.slug})`);
    else {
      const ch = pageChanges(old, p);
      if (ch.length) push(`Seite „${p.title}"`, `#/seiten/${p.id}`, ch);
    }
  }
  for (const p of pub.pages) if (!draft.pages.some((x) => x.id === p.id)) pages.push(`Seite gelöscht: „${p.title}" (/${p.slug})`);
  if (!deepEqual(pub.pages.map((p) => p.id).filter((id) => draft.pages.some((x) => x.id === id)), draft.pages.map((p) => p.id).filter((id) => pub.pages.some((x) => x.id === id))))
    pages.push('Reihenfolge der Seiten geändert');
  if (pages.length) groups.unshift({ area: 'Seiten', route: '#/seiten', items: pages });

  // Navigation
  const nav: string[] = [];
  for (const n of NAV_DEFS) {
    const a = (pub.navigation?.[n.key] ?? []) as { id: string; label: string }[];
    const b = (draft.navigation?.[n.key] ?? []) as { id: string; label: string }[];
    const d = listDiff(a, b, (x) => x.id, (x) => `„${x.label}"`);
    if (d.length) nav.push(`${n.def.label}: ${d.join(', ')}`);
  }
  if (!deepEqual(pub.navigation?.cta, draft.navigation?.cta)) nav.push('Button im Kopf geändert');
  push('Navigation', '#/navigation', nav);

  // Header & Footer
  const lay: string[] = [];
  if (!deepEqual(pub.layout?.header, draft.layout?.header)) lay.push('Header geändert');
  if (!deepEqual(pub.layout?.footer, draft.layout?.footer)) lay.push('Footer geändert');
  if (!deepEqual(pub.layout?.stickyBar, draft.layout?.stickyBar)) lay.push('Handy-Leiste geändert');
  push('Header & Footer', '#/layout', lay);

  // Einstellungen
  const set: string[] = [];
  for (const g of SETTINGS_GROUPS) {
    const get = (d: SiteDoc) => g.path.reduce<unknown>((o, k) => (isPlainObject(o) ? o[k] : undefined), d.settings);
    const a = get(pub);
    const b = get(draft);
    const changed = g.fields.filter((f) => !deepEqual(isPlainObject(a) ? a[f.key] : undefined, isPlainObject(b) ? b[f.key] : undefined));
    if (changed.length) set.push(`${g.title}: ${changed.map((f) => f.label).join(', ')}`);
  }
  if (!deepEqual(pub.settings?.openingHours?.week, draft.settings?.openingHours?.week)) set.push('Öffnungszeiten geändert');
  if (!deepEqual(pub.settings?.openingHours?.exceptions, draft.settings?.openingHours?.exceptions)) set.push('Ausnahmen (Feiertage, Urlaub) geändert');
  if (!deepEqual(pub.settings?.seoDefaults, draft.settings?.seoDefaults)) set.push('Standard-Vorschaubild geändert');
  push('Einstellungen', '#/einstellungen', set);

  // Sammlungen
  const menuA = pub.collections?.menu ?? [];
  const menuB = draft.collections?.menu ?? [];
  const menu: string[] = listDiff(menuA, menuB, (c) => c.slug, (c) => `Kategorie „${c.title}"`);
  push('Karte', '#/karte', menu);
  push('FAQ', '#/faq', listDiff(pub.collections?.faq ?? [], draft.collections?.faq ?? [], (f) => f.id, (f) => `„${truncate(f.question, 50)}"`));
  push('Gästestimmen', '#/stimmen', listDiff(pub.collections?.testimonials ?? [], draft.collections?.testimonials ?? [], (t) => t.id, (t) => `„${truncate(t.author, 40)}"`));
  if (!deepEqual(pub.collections?.heuteFrisch, draft.collections?.heuteFrisch)) push(COLLECTION_DEFS.heuteFrisch?.label ?? 'Heute frisch', '#/backstube', ['Tafel „Heute frisch" geändert']);

  // Medien
  const media = listDiff(pub.media ?? [], draft.media ?? [], (m) => m.id, (m) => `„${truncate(m.alt || m.id, 50)}"`);
  push('Medien', '#/medien', media);

  return groups;
}
