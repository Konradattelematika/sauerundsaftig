/** Kleine HTTP-Helfer: Header, JSON-Antworten, Body-Lesen, Herkunftsprüfung. */
import { normalizeHost } from './host-policy.mjs';

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  // Modul-Board bettet /module/vorschau/* per iframe vom selben Host ein → SAMEORIGIN passt.
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
export const NOINDEX = 'noindex, nofollow, noarchive';

export class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

export function applyBaseHeaders(res, { noindex }) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (noindex) res.setHeader('X-Robots-Tag', NOINDEX);
}

export function sendJson(res, status, data, headers = {}) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(res.req?.method === 'HEAD' ? undefined : body);
}

export function sendText(res, status, text, headers = {}) {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(res.req?.method === 'HEAD' ? undefined : body);
}

export function redirect(res, status, location, headers = {}) {
  res.writeHead(status, { Location: location, 'Content-Length': 0, 'Cache-Control': 'no-store', ...headers });
  res.end();
}

/** Request-Body lesen (Limit in Bytes) → Buffer. Zu groß → HttpError 413. */
export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number.parseInt(req.headers['content-length'] ?? '', 10);
    if (Number.isFinite(declared) && declared > limit) {
      req.resume();
      reject(new HttpError(413, 'Anfrage zu groß', { Connection: 'close' }));
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, 'Anfrage zu groß', { Connection: 'close' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', (err) => {
      if (!done) {
        done = true;
        reject(err);
      }
    });
  });
}

export function mediaType(req) {
  return String(req.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

/**
 * CSRF-Schutz: Wenn Origin oder Referer gesetzt sind, muss deren Host zum Request-Host passen.
 * Fehlen beide (curl, Skripte), ist die Anfrage erlaubt — schreibende API-Aufrufe verlangen
 * zusätzlich application/json, was Formulare fremder Seiten nicht senden können.
 */
export function isSameOrigin(req) {
  const host = normalizeHost(req.headers.host);
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin !== '') {
    if (origin === 'null') return false;
    try {
      return normalizeHost(new URL(origin).host) === host;
    } catch {
      return false;
    }
  }
  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer !== '') {
    try {
      return normalizeHost(new URL(referer).host) === host;
    } catch {
      return false;
    }
  }
  return true;
}
