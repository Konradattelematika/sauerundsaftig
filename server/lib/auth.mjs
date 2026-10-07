/**
 * Login & Session (docs/LIVE-PLAN.md §2.3): scrypt-Hashes, HMAC-signierte Session-Cookies,
 * sichere next-Weiterleitung und ein einfaches Rate-Limit.
 */
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

export const SCRYPT_DEFAULTS = { N: 32768, r: 8, p: 1, keyLen: 32, saltLen: 16 };
const MAX_N = 1 << 20;

function scryptMaxmem(N, r, p) {
  return 128 * N * r * p + 2 * 1024 * 1024;
}

/** Passwort → `scrypt$N$r$p$saltB64$hashB64` */
export async function hashPassword(password, opts = {}) {
  const { N, r, p, keyLen, saltLen } = { ...SCRYPT_DEFAULTS, ...opts };
  const salt = randomBytes(saltLen);
  const key = await scrypt(String(password).normalize('NFC'), salt, keyLen, { N, r, p, maxmem: scryptMaxmem(N, r, p) });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

function parseHash(stored) {
  if (typeof stored !== 'string') return null;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map((x) => Number.parseInt(x, 10));
  if (!Number.isInteger(N) || N < 2 || N > MAX_N || (N & (N - 1)) !== 0) return null;
  if (!Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) return null;
  const salt = Buffer.from(parts[4], 'base64');
  const key = Buffer.from(parts[5], 'base64');
  if (salt.length < 8 || key.length < 16 || key.length > 128) return null;
  return { N, r, p, salt, key };
}

/** Prüft ein Passwort gegen einen gespeicherten Hash (timing-safe). Ungültiger Hash → false. */
export async function verifyPassword(password, stored) {
  const h = parseHash(stored);
  if (!h) return false;
  const derived = await scrypt(String(password).normalize('NFC'), h.salt, h.key.length, {
    N: h.N,
    r: h.r,
    p: h.p,
    maxmem: scryptMaxmem(h.N, h.r, h.p),
  });
  return derived.length === h.key.length && timingSafeEqual(derived, h.key);
}

let dummyHashPromise = null;
/** Hash für unbekannte Benutzer — gleicht die Antwortzeit an, damit Benutzernamen nicht erratbar sind. */
export function dummyHash() {
  dummyHashPromise ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHashPromise;
}

/* ---------------------------------------------------------------- Session ---------- */

function hmac(secret, data) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/** Fingerabdruck des Passwort-Hashes: Passwortwechsel macht alte Sessions ungültig. */
export function passwordFingerprint(secret, user) {
  return hmac(secret, `pw:${user.hash}`).slice(0, 16);
}

export function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${hmac(secret, body)}`;
}

/** Token → Payload oder null (Signatur falsch, manipuliert, abgelaufen, kaputt). */
export function verifySession(token, secret, nowMs) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig)) return null;
  const expected = Buffer.from(hmac(secret, body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.u !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp * 1000 <= nowMs) return null;
  return payload;
}

export function createSessionToken(user, config, nowMs) {
  const iat = Math.floor(nowMs / 1000);
  return signSession(
    { u: user.id, iat, exp: iat + config.sessionMaxAgeS, h: passwordFingerprint(config.sessionSecret, user) },
    config.sessionSecret,
  );
}

/** Alle Werte eines Cookies (es kann Host- und Domain-Cookie gleichzeitig geben). */
export function readCookies(header, name) {
  if (typeof header !== 'string' || !header) return [];
  const out = [];
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) out.push(part.slice(eq + 1).trim());
  }
  return out;
}

/** Cookie-Header → angemeldeter Benutzer ({ id, name, role }) oder null. */
export function getSessionUser(cookieHeader, config, nowMs) {
  for (const token of readCookies(cookieHeader, config.cookieName)) {
    const payload = verifySession(token, config.sessionSecret, nowMs);
    if (!payload) continue;
    const user = config.users.find((u) => u.id === payload.u);
    if (!user || payload.h !== passwordFingerprint(config.sessionSecret, user)) continue;
    return { id: user.id, name: user.name, role: user.role };
  }
  return null;
}

/* ---------------------------------------------------------------- Cookies ---------- */

export function isLocalHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

/** Domain-Attribut nur auf Hosts, die auf die Cookie-Domain enden (ein Login für alle Subdomains). */
export function cookieDomainFor(host, config) {
  const d = config.cookieDomain;
  if (!d) return null;
  return host === d || host.endsWith(`.${d}`) ? d : null;
}

function cookieString(name, value, { maxAge, host, domain }) {
  const parts = [`${name}=${value}`, 'Path=/', `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Lax'];
  if (!isLocalHost(host)) parts.push('Secure');
  if (domain) parts.push(`Domain=.${domain}`);
  return parts.join('; ');
}

export function sessionCookie(token, host, config) {
  return cookieString(config.cookieName, token, {
    maxAge: config.sessionMaxAgeS,
    host,
    domain: cookieDomainFor(host, config),
  });
}

/** Set-Cookie-Werte zum Löschen (Domain- und Host-Cookie). */
export function clearSessionCookies(host, config) {
  const domain = cookieDomainFor(host, config);
  const out = [cookieString(config.cookieName, '', { maxAge: 0, host, domain: null })];
  if (domain) out.push(cookieString(config.cookieName, '', { maxAge: 0, host, domain }));
  return out;
}

/* ---------------------------------------------------------------- next & Login --- */

const NEXT_BASE = 'http://next.invalid';

/** Nur relative Pfade auf demselben Host zulassen (kein Open-Redirect). Sonst '/'. */
export function safeNext(next) {
  if (typeof next !== 'string' || next.length === 0 || next.length > 2048) return '/';
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return '/';
  let u;
  try {
    u = new URL(next, NEXT_BASE);
  } catch {
    return '/';
  }
  if (u.origin !== NEXT_BASE) return '/';
  const out = u.pathname + u.search;
  if (!out.startsWith('/') || out.startsWith('//')) return '/';
  if (u.pathname === '/login' || u.pathname === '/logout') return '/';
  return out;
}

/** Benutzer per id oder Name finden (case-insensitive). */
export function findUser(users, login) {
  if (typeof login !== 'string') return null;
  const needle = login.trim().toLowerCase();
  if (!needle || needle.length > 64) return null;
  return users.find((u) => u.id === needle) ?? users.find((u) => u.name.toLowerCase() === needle) ?? null;
}

/** Anmeldedaten prüfen; unbekannte Benutzer kosten dieselbe Zeit. → Benutzer oder null */
export async function authenticate(users, login, password) {
  const user = findUser(users, login);
  if (typeof password !== 'string' || password.length === 0 || password.length > 1024) {
    await verifyPassword('x', await dummyHash());
    return null;
  }
  if (!user) {
    await verifyPassword(password, await dummyHash());
    return null;
  }
  return (await verifyPassword(password, user.hash)) ? user : null;
}

/* ---------------------------------------------------------------- Rate-Limit ------ */

export class RateLimiter {
  /** @param {{ max: number, windowMs: number }} opts  @param {() => number} nowMs */
  constructor({ max, windowMs }, nowMs = () => Date.now()) {
    this.max = max;
    this.windowMs = windowMs;
    this.nowMs = nowMs;
    this.hits = new Map();
  }

  #recent(key) {
    const cutoff = this.nowMs() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  isBlocked(key) {
    return this.#recent(key).length >= this.max;
  }

  hit(key) {
    const list = this.#recent(key);
    list.push(this.nowMs());
    this.hits.set(key, list);
    if (this.hits.size > 5000) for (const k of [...this.hits.keys()]) this.#recent(k);
    return list.length >= this.max;
  }

  reset(key) {
    this.hits.delete(key);
  }
}

/**
 * Client-IP hinter genau einem vertrauenswürdigen Traefik-Hop: Traefik hängt die Adresse
 * seines direkten Clients rechts an X-Forwarded-For an. Vom Browser vorangestellte Werte
 * stehen links und dürfen den Rate-Limit-Schlüssel nicht bestimmen. Port 3000 darf deshalb
 * nur im internen Proxy-Netz erreichbar sein.
 */
export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  const chain = typeof xff === 'string' ? xff.split(',').map((value) => value.trim()).filter(Boolean) : [];
  return chain.at(-1) || req.socket?.remoteAddress || 'unbekannt';
}

/** Konstantzeit-Vergleich für Bearer-Token. */
export function safeTokenEqual(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
