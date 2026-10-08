/** Pfade im SiteDoc → menschenlesbare Fundstelle + Hash-Route (für Prüfhinweise und Änderungslisten). */
import type { SiteDoc } from '../cms/types';
import { COLLECTION_DEFS, COLLECTION_ROUTES, FOOTER_DEFS, HEADER_DEFS, NAV_DEFS, SETTINGS_GROUPS, STICKY_DEF, sectionDef, type AdminFieldDef } from './defs';
import { isPlainObject, labelOf, parsePath, type PathSeg } from './util';

const PAGE_KEYS: Record<string, string> = {
  title: 'Seitentitel',
  slug: 'Adresse (URL)',
  breadcrumb: 'Brotkrumen',
  status: 'Status',
  seo: 'SEO',
};
const SEO_KEYS: Record<string, string> = {
  title: 'Titel für Suchmaschinen',
  description: 'Beschreibung für Suchmaschinen',
  ogTitle: 'Titel beim Teilen',
  ogDescription: 'Beschreibung beim Teilen',
  ogImage: 'Vorschaubild beim Teilen',
  canonical: 'Kanonische Adresse',
  noindex: 'Indexierung',
};

/** Feldbeschriftungen entlang eines Pfads in Felddefinitionen */
function fieldLabels(defs: AdminFieldDef[] | undefined, rest: PathSeg[], value: unknown): string[] {
  const out: string[] = [];
  let curDefs = defs;
  let cur: unknown = value;
  for (let i = 0; i < rest.length; i++) {
    const seg = rest[i];
    if (typeof seg === 'number') {
      const item = Array.isArray(cur) ? cur[seg] : undefined;
      cur = item;
      continue;
    }
    const def = curDefs?.find((d) => d.key === seg);
    if (!def) {
      if (seg !== 'href' && seg !== 'label' && seg !== 'media' && seg !== 'alt') out.push(String(seg));
      break;
    }
    const next = isPlainObject(cur) ? cur[seg] : undefined;
    let label = def.label;
    if (def.kind === 'list' && typeof rest[i + 1] === 'number') {
      const idx = rest[i + 1] as number;
      const item = Array.isArray(next) ? next[idx] : undefined;
      const lbl = def.itemLabel && isPlainObject(item) ? labelOf(item[def.itemLabel]) : '';
      const name = lbl ? `„${lbl}“` : `Nr. ${idx + 1}`;
      label = `${def.label} ${name}`;
    }
    out.push(label);
    curDefs = def.of;
    cur = next;
  }
  return out;
}

export interface Where {
  label: string;
  route: string;
}

export function describePath(doc: SiteDoc, path: string | PathSeg[]): Where {
  const p = parsePath(path);
  const [a, b, c, d] = p;
  if (a === 'pages' && typeof b === 'number') {
    const page = doc.pages[b];
    if (!page) return { label: 'Seiten', route: '#/seiten' };
    const base = `Seite „${page.title}“`;
    if (c === 'sections' && typeof d === 'number') {
      const s = page.sections[d];
      const def = s ? sectionDef(s.type) : undefined;
      const rest = p.slice(5);
      const labels = s ? fieldLabels(def?.fields, rest, s.fields) : [];
      const fieldPath = rest.join('.');
      return {
        label: [base, `Sektion „${def?.label ?? s?.type ?? d}“`, ...labels].join(' › '),
        route: `#/seiten/${page.id}?sektion=${encodeURIComponent(s?.id ?? '')}${fieldPath ? `&feld=${encodeURIComponent(fieldPath)}` : ''}`,
      };
    }
    if (c === 'seo') return { label: `${base} › ${SEO_KEYS[String(d)] ?? 'SEO'}`, route: `#/seiten/${page.id}/einstellungen` };
    return { label: `${base} › ${PAGE_KEYS[String(c)] ?? String(c ?? '')}`.replace(/ › $/, ''), route: `#/seiten/${page.id}/einstellungen` };
  }
  if (a === 'navigation') {
    const n = NAV_DEFS.find((x) => x.key === b);
    const labels = n ? fieldLabels([n.def], p.slice(1), doc.navigation) : b === 'cta' ? ['Button im Kopf'] : [];
    return { label: ['Navigation', ...labels].join(' › '), route: '#/navigation' };
  }
  if (a === 'layout') {
    const defs = b === 'header' ? HEADER_DEFS : b === 'footer' ? FOOTER_DEFS : b === 'stickyBar' ? [STICKY_DEF] : [];
    const area = b === 'header' ? 'Header' : b === 'footer' ? 'Footer' : 'Handy-Leiste';
    const obj = isPlainObject(doc.layout) ? (doc.layout as unknown as Record<string, unknown>)[String(b)] : undefined;
    return { label: [area, ...fieldLabels(defs, p.slice(2), obj)].join(' › '), route: '#/layout' };
  }
  if (a === 'settings') {
    if (b === 'seoDefaults') return { label: 'SEO › Standard-Vorschaubild', route: '#/seo' };
    if (b === 'openingHours') return { label: `Einstellungen › Öffnungszeiten${c === 'exceptions' ? ' › Ausnahmen' : ''}`, route: '#/einstellungen?bereich=zeiten' };
    for (const g of SETTINGS_GROUPS) {
      const rest = p.slice(1 + g.path.length);
      if (g.path.every((x, i) => p[1 + i] === x) && g.fields.some((f) => f.key === rest[0]))
        return { label: `Einstellungen › ${g.title} › ${g.fields.find((f) => f.key === rest[0])?.label}`, route: '#/einstellungen' };
    }
    return { label: 'Einstellungen', route: '#/einstellungen' };
  }
  if (a === 'collections' && typeof b === 'string') {
    const def = COLLECTION_DEFS[b];
    const route = COLLECTION_ROUTES[b] ?? '#/';
    if (!def) return { label: b, route };
    const val = doc.collections?.[b];
    if (def.shape === 'list') {
      const listDef: AdminFieldDef = { key: '_', label: def.label, kind: 'list', itemLabel: def.itemLabel, of: def.fields };
      return { label: fieldLabels([listDef], ['_', ...p.slice(2)], { _: val }).join(' › '), route };
    }
    return { label: [def.label, ...fieldLabels(def.fields, p.slice(2), val)].join(' › '), route };
  }
  if (a === 'media') {
    const m = typeof b === 'number' ? doc.media[b] : undefined;
    return { label: `Medien › ${m?.alt || m?.id || ''}`, route: '#/medien' };
  }
  return { label: p.join(' › ') || 'Allgemein', route: '#/' };
}
