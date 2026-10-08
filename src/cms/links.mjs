/**
 * Link-Auflösung des CMS — OHNE Node-Importe, damit Build, Server UND Admin-Browser denselben Code nutzen.
 * Linkziele (`Href`): `page:<seitenId>[#anker]`, `/pfad`, `https://…`, `mailto:…`, `tel:…`,
 * sowie `{{tel}}` (Telefon aus den Einstellungen) und `{{route}}` (Routenplaner).
 */

/** Pfad einer Seite: '' → '/', 'karte' → '/karte' */
export function pagePath(page) {
  return page.slug ? `/${page.slug}` : '/';
}

/**
 * Linkziel → URL. Unbekannte page:-Ziele ergeben '#' (der Validator meldet sie vorher).
 * @param {string} href
 * @param {import('./types').SiteDoc} doc
 */
export function resolveHref(href, doc) {
  if (typeof href !== 'string' || !href) return '#';
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

/** Ist ein Linkziel extern (neuer Tab sinnvoll, rel=noopener)? */
export function isExternalHref(href) {
  return /^https?:\/\//i.test(href || '') || href === '{{route}}';
}
