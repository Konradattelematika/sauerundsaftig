/**
 * Browser-Spiegel von src/cms/rich.mjs + resolveHref/isExternalHref/pagePath aus src/cms/store.mjs.
 *
 * Warum ein Spiegel: rich.mjs importiert store.mjs, und das lädt node:fs/node:path (Seed-Lader) — im
 * Browser-Bundle des Dashboards nicht lauffähig. Sobald Linkauflösung und Renderer in einem
 * browserfähigen Modul liegen (Bitte an den Orchestrator), kann diese Datei durch Re-Exporte ersetzt
 * werden. Gleichlauf sichert src/admin/rich.test.ts (vergleicht beide Implementierungen).
 */
import type { PageDoc, SiteDoc } from '../cms/types';

type DocLike = Pick<SiteDoc, 'settings' | 'pages'> | null | undefined;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const SAFE_URL = /^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i;

export function pagePath(page: Pick<PageDoc, 'slug'>): string {
  return page.slug ? `/${page.slug}` : '/';
}

export function resolveHref(href: unknown, doc: DocLike): string {
  if (typeof href !== 'string' || !href) return '#';
  if (!doc) return href;
  if (href === '{{tel}}') return `tel:${String(doc.settings.phone ?? '').replace(/[^\d+]/g, '')}`;
  if (href === '{{route}}') {
    const a = doc.settings.address;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${a.street}, ${a.zip} ${a.city}`)}`;
  }
  if (href.startsWith('page:')) {
    const [id, anchor] = href.slice(5).split('#');
    const page = doc.pages.find((p) => p.id === id);
    if (!page) return '#';
    return pagePath(page) + (anchor ? `#${anchor}` : '');
  }
  return href;
}

export function isExternalHref(href: unknown): boolean {
  return /^https?:\/\//i.test(String(href || '')) || href === '{{route}}';
}

export function fillTokens(text: unknown, settings: SiteDoc['settings'] | undefined): string {
  const map: Record<string, unknown> = {
    phoneDisplay: settings?.phoneDisplay,
    phone: settings?.phone,
    email: settings?.email,
    name: settings?.name,
    street: settings?.address?.street,
    zip: settings?.address?.zip,
    city: settings?.address?.city,
    breakfastUntil: settings?.breakfastUntil,
    instagram: settings?.instagram,
  };
  return String(text ?? '').replace(/\{\{(\w+)\}\}/g, (m, k: string) =>
    k === 'tel' || k === 'route' ? m : ((map[k] as string | undefined) ?? m),
  );
}

export interface RichOpts {
  blocks?: boolean;
  linkClass?: string;
  pClass?: string;
}

/** Sicheres HTML aus dem kleinen CMS-Markup (identisch zu src/cms/rich.mjs → renderRich) */
export function renderRich(text: unknown, doc: DocLike, opts: RichOpts = {}): string {
  const { blocks = false, linkClass = '', pClass = '' } = opts;
  const source = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!source) return '';

  const inline = (raw: string): string => {
    const links: { label: string; target: string }[] = [];
    let s = raw.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, label: string, target: string) => {
      links.push({ label, target });
      return `\u0000${links.length - 1}\u0000`;
    });
    s = escapeHtml(fillTokens(s, doc?.settings));
    const fmt = (x: string) =>
      x.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    s = fmt(s).replace(/\n/g, '<br>');
    return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => {
      const { label, target } = links[Number(i)];
      const labelHtml = fmt(escapeHtml(fillTokens(label, doc?.settings)));
      const href = doc ? resolveHref(target, doc) : target;
      if (!SAFE_URL.test(href)) return labelHtml;
      const ext = isExternalHref(target) || /^https?:\/\//i.test(href);
      const cls = linkClass ? ` class="${escapeHtml(linkClass)}"` : '';
      const tgt = ext ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${escapeHtml(href)}"${cls}${tgt}>${labelHtml}</a>`;
    });
  };

  if (!blocks) return inline(source);
  const pc = pClass ? ` class="${escapeHtml(pClass)}"` : '';
  return source
    .split(/\n{2,}/)
    .map((para) => `<p${pc}>${inline(para.trim())}</p>`)
    .join('');
}

export function plainText(text: unknown, doc: DocLike): string {
  return fillTokens(String(text ?? ''), doc?.settings)
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1$2')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

/** Alle Links [Text](ziel) in einem rich-Text (für „Buttons & Links“ und Verweis-Suche) */
export function richLinks(text: unknown): { label: string; target: string }[] {
  const out: { label: string; target: string }[] = [];
  String(text ?? '').replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, label: string, target: string) => {
    out.push({ label, target });
    return '';
  });
  return out;
}
