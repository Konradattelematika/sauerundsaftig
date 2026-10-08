/**
 * Kleines, sicheres Text-Markup für CMS-Felder vom Typ `rich` (Build, Admin-Vorschau, Server-Validierung).
 * Ohne Node-Importe — läuft auch im Admin-Browser.
 * Erlaubt — und sonst nichts (alles andere wird escaped, kein HTML möglich):
 *   Leerzeile        → neuer Absatz (nur renderRich(..., { blocks: true }))
 *   Zeilenumbruch    → <br>
 *   **fett**         → <strong>
 *   *kursiv*         → <em>
 *   [Text](ziel)     → <a>; ziel = page:<id>[#anker], /pfad, #anker, https://…, mailto:…, tel:…, {{tel}}, {{route}}
 *   {{platzhalter}}  → Wert aus den Einstellungen: phoneDisplay, phone, email, name, street, zip, city,
 *                      breakfastUntil, instagram
 */
import { resolveHref, isExternalHref } from './links.mjs';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const SAFE_URL = /^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i;

/** {{platzhalter}} → Einstellungswert (unbekannte bleiben stehen, damit der Validator sie findet) */
export function fillTokens(text, settings) {
  const map = {
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
  return String(text ?? '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k === 'tel' || k === 'route' ? m : map[k] ?? m));
}

/**
 * @param {string} text  Rohtext aus dem CMS
 * @param {import('./types').SiteDoc} doc
 * @param {{ blocks?: boolean, linkClass?: string, pClass?: string }} [opts]
 * @returns {string} sicheres HTML
 */
export function renderRich(text, doc, opts = {}) {
  const { blocks = false, linkClass = '', pClass = '' } = opts;
  const source = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!source) return '';

  const inline = (raw) => {
    // Links zuerst herauslösen (Platzhalter verhindern, dass ** in URLs greift)
    const links = [];
    let s = raw.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, target) => {
      links.push({ label, target });
      return `\u0000${links.length - 1}\u0000`;
    });
    s = escapeHtml(fillTokens(s, doc?.settings));
    const fmt = (x) =>
      x
        .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    s = fmt(s).replace(/\n/g, '<br>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => {
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

/** Klartext ohne Markup (für Meta-Beschreibungen, JSON-LD, Alt-Texte) */
export function plainText(text, doc) {
  return fillTokens(String(text ?? ''), doc?.settings)
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1$2')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}
