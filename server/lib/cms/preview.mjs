/**
 * Vorschau-Modus (docs/CMS-PLAN.md §7.3): Cookie `sus_preview` (gesetzt über /admin/vorschau?an=1),
 * mit gültiger Session (cms.view) liefert der Server HTML/Assets aus dem Vorschau-Build und blendet
 * oben eine schmale Leiste ein (nicht bei ?__cms=editor, dort steuert das Dashboard).
 */
import { isLocalHost, readCookies } from '../auth.mjs';

export const PREVIEW_COOKIE = 'sus_preview';
const PREVIEW_MAX_AGE_S = 12 * 60 * 60;

export function previewCookie(host, on) {
  const parts = [`${PREVIEW_COOKIE}=${on ? '1' : ''}`, 'Path=/', `Max-Age=${on ? PREVIEW_MAX_AGE_S : 0}`, 'HttpOnly', 'SameSite=Lax'];
  if (!isLocalHost(host)) parts.push('Secure');
  return parts.join('; ');
}

export function previewRequested(cookieHeader) {
  return readCookies(cookieHeader, PREVIEW_COOKIE).includes('1');
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const berlin = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
export function formatBerlin(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${berlin.format(d).replace(',', '')} Uhr`;
}

/**
 * @param {{ path: string, search?: string, previewBuild: { revision: number, builtAt: string }|null, draftRevision: number, building: boolean }} info
 */
export function bannerHtml({ path, search = '', previewBuild, draftRevision, building }) {
  let state;
  if (!previewBuild) state = 'Noch keine Vorschau gebaut — zu sehen ist die veröffentlichte Version.';
  else if (previewBuild.revision !== draftRevision) {
    state = `Stand ${esc(formatBerlin(previewBuild.builtAt))} — der Entwurf ist neuer${building ? ', Vorschau wird gerade gebaut …' : '.'}`;
  } else state = `Entwurf, Stand ${esc(formatBerlin(previewBuild.builtAt))} — nicht öffentlich.`;
  const params = new URLSearchParams(search);
  params.delete('__cms');
  const qs = params.toString();
  const off = `/admin/vorschau?aus=1&next=${encodeURIComponent(path + (qs ? `?${qs}` : ''))}`;
  const link = 'color:inherit;text-decoration:underline;text-underline-offset:2px';
  return (
    `<div id="sus-preview-bar" role="status" style="position:relative;z-index:2147483647;display:flex;flex-wrap:wrap;gap:.2rem .9rem;` +
    `align-items:center;justify-content:center;padding:.4rem .75rem;background:#2b2118;color:#fff8ee;` +
    `font:500 13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center">` +
    `<strong style="font-weight:700;letter-spacing:.02em">Vorschau</strong><span>${state}</span>` +
    `<a href="/admin" style="${link}">Zum Dashboard</a>` +
    `<a href="${esc(off)}" style="${link}">Vorschau beenden</a></div>`
  );
}

/** Leiste direkt nach <body …> einsetzen (ohne <body> → an den Anfang) */
export function injectBanner(html, banner) {
  const m = /<body\b[^>]*>/i.exec(html);
  if (!m) return banner + html;
  const at = m.index + m[0].length;
  return html.slice(0, at) + banner + html.slice(at);
}
