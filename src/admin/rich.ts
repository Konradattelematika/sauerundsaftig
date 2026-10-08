/**
 * Rich-Text und Linkziele im Admin: dieselben Module wie Build und Server (src/cms/rich.mjs,
 * src/cms/links.mjs — beide ohne Node-Importe), damit Live-Vorschau und fertige Seite gleich rendern.
 */
export { escapeHtml, fillTokens, plainText, renderRich } from '../cms/rich.mjs';
export { isExternalHref, pagePath, resolveHref } from '../cms/links.mjs';

/** Alle Links [Text](ziel) in einem rich-Text (für „Buttons & Links“ und Verweis-Suche) */
export function richLinks(text: unknown): { label: string; target: string }[] {
  const out: { label: string; target: string }[] = [];
  for (const m of String(text ?? '').matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)) out.push({ label: m[1], target: m[2] });
  return out;
}
