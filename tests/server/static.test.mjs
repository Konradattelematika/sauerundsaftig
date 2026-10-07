import { describe, expect, it } from 'vitest';
import { berlinTime, buildMarkdown } from '../../server/lib/export.mjs';
import { StaticFiles, etagMatches, mimeFor, pickEncoding } from '../../server/lib/static.mjs';
import { SITE, silentLog } from './helpers.mjs';

describe('pickEncoding', () => {
  it.each([
    ['gzip, deflate, br', 'br'],
    ['gzip', 'gzip'],
    ['br;q=0, gzip;q=0.5', 'gzip'],
    ['identity', null],
    ['*', 'br'],
    ['*;q=0', null],
    ['', null],
    [undefined, null],
  ])('%s → %s', (h, expected) => expect(pickEncoding(h)).toBe(expected));
});

describe('etagMatches', () => {
  it('Listen, schwache ETags, *', () => {
    expect(etagMatches('"a", "b"', '"b"')).toBe(true);
    expect(etagMatches('W/"b"', '"b"')).toBe(true);
    expect(etagMatches('*', '"x"')).toBe(true);
    expect(etagMatches('"a"', '"b"')).toBe(false);
    expect(etagMatches(undefined, '"b"')).toBe(false);
  });
});

describe('MIME', () => {
  it('kennt alle geforderten Typen', () => {
    const exts = ['html', 'css', 'js', 'mjs', 'json', 'xml', 'txt', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'ico', 'woff', 'woff2', 'webmanifest'];
    for (const e of exts) expect(mimeFor(`/x.${e}`), e).not.toBe('application/octet-stream');
    expect(mimeFor('/x.unbekannt')).toBe('application/octet-stream');
  });
});

describe('StaticFiles.safeJoin / find', () => {
  it('bleibt in dist, keine Dotfiles', async () => {
    const s = await new StaticFiles(SITE, { log: silentLog }).init();
    expect(s.safeJoin('/../outside.txt')).toBeNull();
    expect(s.safeJoin('/karte/../../outside.txt')).toBeNull();
    expect(await s.find(['/../outside.txt'])).toBeNull();
    expect(s.safeJoin('/.env')).toBeNull();
    expect(s.safeJoin('/_astro/.hidden')).toBeNull();
    expect(await s.find(['/karte', '/karte/index.html'])).toMatchObject({ rel: '/karte/index.html' });
    expect(await s.find(['/gibtsnicht'])).toBeNull();
  });
  it('fehlendes dist → alles 404 statt Absturz', async () => {
    const s = await new StaticFiles('/nonexistent/sus-dist', { log: silentLog }).init();
    expect(await s.find(['/index.html'])).toBeNull();
  });
});

describe('Export-Markdown', () => {
  it('berlinTime: Sommer- und Winterzeit', () => {
    expect(berlinTime('2026-10-08T10:00:00Z')).toBe('08.10.2026, 12:00');
    expect(berlinTime('2026-12-01T10:00:00Z')).toBe('01.12.2026, 11:00');
  });
  it('leerer Zustand', () => {
    const md = buildMarkdown(
      { checklist: { items: [], comments: [] }, module: { votes: [], choices: [] } },
      { now: new Date('2026-10-08T10:00:00Z'), goLiveAt: new Date('2026-10-10T14:00:00Z'), live: false },
    );
    expect(md).toContain('Go-Live: 10.10.2026, 16:00');
    expect(md).toContain('_Kein offenes Feedback._');
    expect(md).toContain('_Noch keine Bewertungen oder Entscheidungen._');
  });
});
