import { describe, expect, it } from 'vitest';
import {
  RateLimiter,
  authenticate,
  clientIp,
  clearSessionCookies,
  cookieDomainFor,
  createSessionToken,
  getSessionUser,
  hashPassword,
  safeNext,
  safeTokenEqual,
  sessionCookie,
  signSession,
  verifyPassword,
  verifySession,
} from '../../server/lib/auth.mjs';
import { loadConfig, parseUsers, usersConfigValue } from '../../server/lib/config.mjs';

const SECRET = 'geheimnis-'.padEnd(40, 'z');

describe('scrypt', () => {
  it('Hash-Format scrypt$N$r$p$salt$hash und Verify', async () => {
    const h = await hashPassword('Brot&Butter 123', { N: 1024 });
    expect(h).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword('Brot&Butter 123', h)).toBe(true);
    expect(await verifyPassword('Brot&Butter 124', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
  });
  it('Default-Parameter (N=32768) funktionieren', async () => {
    const h = await hashPassword('standard');
    expect(h.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(await verifyPassword('standard', h)).toBe(true);
  });
  it('kaputte oder fremde Hashes → false statt Fehler', async () => {
    for (const bad of ['', 'bcrypt$x', 'scrypt$3$8$1$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNoaGFzaA==', 'scrypt$1024$8$1$$', null, 'scrypt$9999999$8$1$a$b']) {
      expect(await verifyPassword('x', bad)).toBe(false);
    }
  });
});

describe('Session-Token', () => {
  const now = Date.parse('2026-10-08T10:00:00Z');
  it('sign/verify', () => {
    const t = signSession({ u: 'konrad', exp: now / 1000 + 60 }, SECRET);
    expect(verifySession(t, SECRET, now)).toMatchObject({ u: 'konrad' });
  });
  it('manipuliert → null', () => {
    const t = signSession({ u: 'konrad', exp: now / 1000 + 60 }, SECRET);
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'josie', exp: now / 1000 + 60 })).toString('base64url');
    expect(verifySession(`${forged}.${sig}`, SECRET, now)).toBeNull();
    expect(verifySession(`${body}.${sig.slice(0, -2)}AA`, SECRET, now)).toBeNull();
    expect(verifySession(t, 'anderes-secret'.padEnd(40, 'y'), now)).toBeNull();
    expect(verifySession(`${body}`, SECRET, now)).toBeNull();
    expect(verifySession('a.b.c', SECRET, now)).toBeNull();
  });
  it('abgelaufen → null', () => {
    const t = signSession({ u: 'konrad', exp: now / 1000 - 1 }, SECRET);
    expect(verifySession(t, SECRET, now)).toBeNull();
  });
  it('getSessionUser: Benutzer muss existieren, Passwortwechsel beendet Sessions', async () => {
    const users = [{ id: 'konrad', name: 'Konrad', role: 'team', hash: await hashPassword('a', { N: 1024 }) }];
    const config = { ...loadConfig({ SUS_SESSION_SECRET: SECRET, SUS_USERS: JSON.stringify(users) }) };
    const token = createSessionToken(config.users[0], config, now);
    expect(getSessionUser(`foo=1; sus_session=${token}`, config, now)).toEqual({ id: 'konrad', name: 'Konrad', role: 'team' });
    expect(getSessionUser(`sus_session=${token}`, config, now + 31 * 864e5)).toBeNull();
    const changed = { ...config, users: [{ ...config.users[0], hash: await hashPassword('b', { N: 1024 }) }] };
    expect(getSessionUser(`sus_session=${token}`, changed, now)).toBeNull();
    expect(getSessionUser(`sus_session=${token}`, { ...config, users: [] }, now)).toBeNull();
    // Mehrere Cookies gleichen Namens: das gültige zählt
    expect(getSessionUser(`sus_session=kaputt; sus_session=${token}`, config, now)?.id).toBe('konrad');
  });
});

describe('Cookies', () => {
  const config = loadConfig({ SUS_SESSION_SECRET: SECRET });
  it('standardmäßig hostgebunden und Secure außer localhost', () => {
    expect(config.cookieDomain).toBeNull();
    expect(cookieDomainFor('checkliste.sauerundsaftig.de', config)).toBeNull();
    const live = sessionCookie('T', 'module.sauerundsaftig.de', config);
    expect(live).toBe('sus_session=T; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure');
    expect(sessionCookie('T', 'localhost', config)).not.toContain('Secure');
    expect(sessionCookie('T', '127.0.0.1', config)).not.toContain('Secure');
  });
  it('optionale Domain nur auf *.sauerundsaftig.de', () => {
    const domainConfig = loadConfig({ SUS_SESSION_SECRET: SECRET, SUS_COOKIE_DOMAIN: 'sauerundsaftig.de' });
    expect(cookieDomainFor('checkliste.sauerundsaftig.de', domainConfig)).toBe('sauerundsaftig.de');
    expect(cookieDomainFor('sauerundsaftig.de', domainConfig)).toBe('sauerundsaftig.de');
    expect(cookieDomainFor('evilsauerundsaftig.de', domainConfig)).toBeNull();
    expect(cookieDomainFor('sauerundsaftig.jawollja.gmbh', domainConfig)).toBeNull();
    const live = sessionCookie('T', 'module.sauerundsaftig.de', domainConfig);
    expect(live).toBe('sus_session=T; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure; Domain=.sauerundsaftig.de');
  });
  it('Logout löscht beim Standard nur das Host-Cookie', () => {
    const c = clearSessionCookies('checkliste.sauerundsaftig.de', config);
    expect(c).toHaveLength(1);
    expect(c[0]).toContain('Max-Age=0');
  });
  it('Logout löscht bei konfigurierter Domain Host- und Domain-Cookie', () => {
    const domainConfig = loadConfig({ SUS_SESSION_SECRET: SECRET, SUS_COOKIE_DOMAIN: 'sauerundsaftig.de' });
    const c = clearSessionCookies('checkliste.sauerundsaftig.de', domainConfig);
    expect(c).toHaveLength(2);
    expect(c.every((x) => x.includes('Max-Age=0'))).toBe(true);
    expect(c[1]).toContain('Domain=.sauerundsaftig.de');
  });
});

describe('clientIp hinter Traefik', () => {
  it('nimmt den rechten, von Traefik angehängten Wert statt eines eingeschleusten linken Werts', () => {
    const req = { headers: { 'x-forwarded-for': '198.51.100.10, 203.0.113.7' }, socket: { remoteAddress: '172.18.0.2' } };
    expect(clientIp(req)).toBe('203.0.113.7');
  });
  it('fällt ohne X-Forwarded-For auf die Socket-Adresse zurück', () => {
    expect(clientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })).toBe('127.0.0.1');
  });
});

describe('safeNext (Open-Redirect)', () => {
  it.each([
    ['/karte', '/karte'],
    ['/karte?x=1', '/karte?x=1'],
    ['/module/farben#alt', '/module/farben'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com/x', '/'],
    ['javascript:alert(1)', '/'],
    ['evil.com', '/'],
    ['/%2F%2Fevil.com', '/%2F%2Fevil.com'],
    ['/\t/evil.com', '/'],
    ['/login?next=/x', '/'],
    ['/logout', '/'],
    ['', '/'],
    [null, '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe('authenticate', () => {
  it('Benutzername case-insensitive (id oder Name), falsches Passwort → null', async () => {
    const users = parseUsers(
      JSON.stringify([{ id: 'Josie', name: 'Josie S.', role: 'inhaberin', hash: await hashPassword('pw-josie', { N: 1024 }) }]),
    );
    expect(users[0].id).toBe('josie');
    expect((await authenticate(users, 'JOSIE', 'pw-josie'))?.id).toBe('josie');
    expect((await authenticate(users, ' josie s. ', 'pw-josie'))?.id).toBe('josie');
    expect(await authenticate(users, 'josie', 'falsch')).toBeNull();
    expect(await authenticate(users, 'niemand', 'pw-josie')).toBeNull();
    expect(await authenticate(users, undefined, undefined)).toBeNull();
  });
});

describe('parseUsers', () => {
  it('verwirft ungültige Einträge mit Warnung', () => {
    const w = [];
    const users = parseUsers(
      JSON.stringify([
        { id: 'ok', name: 'Ok', role: 'team', hash: 'scrypt$1024$8$1$a$b' },
        { id: 'ok', name: 'Doppelt', hash: 'scrypt$1$1$1$a$b' },
        { id: 'kein hash' },
        { id: 'rolle', role: 'chef', hash: 'scrypt$1$1$1$a$b' },
      ]),
      w,
    );
    expect(users.map((u) => u.id)).toEqual(['ok', 'rolle']);
    expect(users[1].role).toBe('team');
    expect(w.length).toBe(3);
    expect(parseUsers('{kaputt', [])).toEqual([]);
  });
  it('fehlendes SUS_SESSION_SECRET → zufällig + Warnung', () => {
    const c = loadConfig({});
    expect(c.sessionSecret.length).toBeGreaterThan(30);
    expect(c.sessionSecretEphemeral).toBe(true);
    expect(c.warnings.join(' ')).toMatch(/SUS_SESSION_SECRET/);
  });
  it('SUS_USERS_B64 dekodiert kanonisches Base64url und hat Vorrang', () => {
    const raw = JSON.stringify([{ id: 'b64', name: 'Base 64', role: 'team', hash: 'scrypt$1024$8$1$a$b' }]);
    const encoded = Buffer.from(raw).toString('base64url');
    expect(usersConfigValue({ SUS_USERS_B64: encoded, SUS_USERS: '{kaputt' }, [])).toBe(raw);
    const config = loadConfig({ SUS_USERS_B64: encoded, SUS_USERS: '{kaputt', SUS_SESSION_SECRET: SECRET });
    expect(config.users).toHaveLength(1);
    expect(config.users[0]).toMatchObject({ id: 'b64', name: 'Base 64' });
  });
  it('ungültiges SUS_USERS_B64 schlägt geschlossen fehl', () => {
    const warnings = [];
    expect(usersConfigValue({ SUS_USERS_B64: '***', SUS_USERS: '[]' }, warnings)).toBeUndefined();
    expect(warnings.join(' ')).toMatch(/SUS_USERS_B64/);
    expect(loadConfig({ SUS_USERS_B64: '***', SUS_SESSION_SECRET: SECRET }).users).toEqual([]);
  });
});

describe('RateLimiter', () => {
  it('sperrt nach max Treffern im Fenster und gibt danach frei', () => {
    let t = 0;
    const rl = new RateLimiter({ max: 3, windowMs: 1000 }, () => t);
    expect(rl.hit('ip')).toBe(false);
    expect(rl.hit('ip')).toBe(false);
    expect(rl.isBlocked('ip')).toBe(false);
    expect(rl.hit('ip')).toBe(true);
    expect(rl.isBlocked('ip')).toBe(true);
    expect(rl.isBlocked('andere')).toBe(false);
    t = 1001;
    expect(rl.isBlocked('ip')).toBe(false);
  });
});

describe('safeTokenEqual', () => {
  it('vergleicht korrekt', () => {
    expect(safeTokenEqual('abc', 'abc')).toBe(true);
    expect(safeTokenEqual('abc', 'abd')).toBe(false);
    expect(safeTokenEqual('abc', '')).toBe(false);
    expect(safeTokenEqual(undefined, 'abc')).toBe(false);
  });
});
