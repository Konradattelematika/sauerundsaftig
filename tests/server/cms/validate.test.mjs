/**
 * src/cms/validate.mjs (reines JS) und src/cms/definitions.mjs: Seed fehlerfrei, typische Fehler mit
 * Pfad und verständlicher Meldung, Entwurf/Veröffentlichen-Modus, Links, Medien, Navigation, Weiterleitungen.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadDefinitions } from '../../../src/cms/definitions.mjs';
import { assembleSeed } from '../../../src/cms/store.mjs';
import { activePaths, checkHref, describePath, mediaUsages, validateSiteDoc } from '../../../src/cms/validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

let defs;
let seed;
beforeAll(async () => {
  defs = await loadDefinitions();
  // zusätzliche Testtypen: seitenspezifisch und mit Liste/Link/Bild/Auswahl
  defs = {
    ...defs,
    sections: {
      ...defs.sections,
      'nur-besuch': { type: 'nur-besuch', label: 'Nur Besuch', allowedOn: ['besuch'], fields: [], defaults: () => ({}) },
      karten: {
        type: 'karten',
        label: 'Karten',
        allowedOn: '*',
        fields: [
          { key: 'image', label: 'Bild', kind: 'media', required: true },
          { key: 'button', label: 'Button', kind: 'link', variants: ['primary', 'ghost'] },
          { key: 'ziel', label: 'Seite', kind: 'page' },
          { key: 'stil', label: 'Stil', kind: 'select', options: [{ value: 'a', label: 'A' }] },
          { key: 'anzahl', label: 'Anzahl', kind: 'number' },
          {
            key: 'items',
            label: 'Karten',
            kind: 'list',
            min: 1,
            max: 2,
            itemLabel: 'title',
            of: [{ key: 'title', label: 'Titel', kind: 'text', required: true, maxLength: 10 }],
          },
        ],
        defaults: () => ({}),
      },
    },
  };
  seed = assembleSeed();
});

const clone = () => structuredClone(seed);
const page = (id, slug, extra = {}) => ({
  id,
  slug,
  title: id,
  status: 'published',
  kind: 'custom',
  seo: { title: `${id} – Titel`, description: 'Beschreibung' },
  sections: [],
  ...extra,
});
const karten = (fields = {}) => ({
  id: 'k',
  type: 'karten',
  visible: true,
  fields: { image: { media: 'brot-laib' }, items: [{ title: 'Eins' }], ...fields },
});
const run = (doc, opts) => validateSiteDoc(doc, defs, opts);
const paths = (list) => list.map((e) => e.path);

describe('Grundlagen', () => {
  it('der Seed (= bisherige Inhalte) ist fehlerfrei', () => {
    const r = run(clone());
    expect(r.errors).toEqual([]);
    // Navigation zeigt auf Seiten, die die Seiten-Pakete noch anlegen → nur Warnungen
    expect(r.warnings.every((w) => /gibt es nicht|Alternativtext/.test(w.message))).toBe(true);
  });

  it('validate.mjs ist browsertauglich (keine node:-Importe)', async () => {
    const src = await readFile(path.join(ROOT, 'src/cms/validate.mjs'), 'utf8');
    expect(src).not.toMatch(/from\s+['"]node:/);
    expect(src).not.toMatch(/\bawait\s+import\s*\(/);
    expect(src).not.toMatch(/\brequire\s*\(/);
  });

  it('kein Dokument / kaputte Struktur', () => {
    expect(run(null).errors[0].message).toMatch(/leer/);
    const r = run({ schemaVersion: 0, settings: null, navigation: 1, layout: [], pages: {}, collections: null, media: 'x' });
    expect(paths(r.errors)).toEqual(expect.arrayContaining(['schemaVersion', 'settings', 'navigation', 'layout', 'pages', 'collections', 'media']));
  });
});

describe('Seiten & Adressen', () => {
  it('Format, reservierte Präfixe, Doppelte, IDs', () => {
    const doc = clone();
    doc.pages = [
      page('a', 'über-uns'),
      page('b', 'admin/x'),
      page('c', 'neu'),
      page('d', 'neu'),
      page('Falsch', 'ok'),
      page('f', 'brand/logo'),
      page('g', '404', { system: true, kind: 'builtin' }),
      page('h', 'Gross'),
    ];
    const r = run(doc);
    const msg = (p) => r.errors.filter((e) => e.path === p).map((e) => e.message).join(' | ');
    expect(msg('pages.0.slug')).toMatch(/Umlaute umschreiben/);
    expect(msg('pages.1.slug')).toMatch(/„\/admin“ ist für das System reserviert/);
    expect(msg('pages.3.slug')).toMatch(/schon von Seite „c“/);
    expect(msg('pages.4.id')).toMatch(/interne Kennung/);
    expect(msg('pages.5.slug')).toMatch(/reserviert/);
    expect(msg('pages.6.slug')).toBe(''); // Systemseite 404 darf
    expect(msg('pages.7.slug')).toMatch(/Kleinbuchstaben/);
  });

  it('Vorlagenseiten: /* nötig, Kollision eigener Seiten mit Kategorie-Unterseiten', () => {
    const doc = clone();
    doc.pages = [
      page('karte-kategorie', 'karte/*', { template: 'menu-category', kind: 'builtin' }),
      page('karte-schnecken', 'karte/schnecken', { kind: 'builtin' }),
      page('eigen', 'karte/kuchen'),
      page('t2', 'speisekarte', { template: 'menu-category' }),
    ];
    const r = run(doc);
    expect(r.errors.find((e) => e.path === 'pages.2.slug').message).toMatch(/gehört schon zur Kartenkategorie „Kuchen“/);
    expect(r.errors.find((e) => e.path === 'pages.3.slug').message).toMatch(/muss auf „\/\*“ enden/);
    expect(paths(r.errors)).not.toContain('pages.1.slug'); // Grundbestand darf eine Kategorie übernehmen
    expect(activePaths(doc).has('/karte/kuchen')).toBe(true);
  });

  it('Abschnitte: unbekannter Typ, nicht erlaubt auf der Seite, doppelte IDs', () => {
    const doc = clone();
    doc.pages = [
      page('start', '', {
        sections: [
          { id: 'a', type: 'gibtsnicht', visible: true, fields: {} },
          { id: 'b', type: 'nur-besuch', visible: true, fields: {} },
          { id: 'b', type: 'text', visible: 'ja', fields: { title: 'x' } },
        ],
      }),
      page('besuch', 'besuch', { sections: [{ id: 'x', type: 'nur-besuch', visible: true, fields: {} }] }),
    ];
    const r = run(doc);
    expect(r.errors.find((e) => e.path === 'pages.0.sections.0.type').message).toMatch(/Abschnittstyp „gibtsnicht“ gibt es nicht/);
    expect(r.errors.find((e) => e.path === 'pages.0.sections.1.type').message).toMatch(/auf dieser Seite nicht möglich/);
    expect(paths(r.errors)).toEqual(expect.arrayContaining(['pages.0.sections.2.id', 'pages.0.sections.2.visible']));
    expect(paths(r.errors).some((p) => p.startsWith('pages.1.'))).toBe(false);
  });

  it('Pflichtfelder: beim Veröffentlichen Fehler, im Entwurf und auf deaktivierten Seiten Warnung', () => {
    const doc = clone();
    doc.pages = [
      page('neu', 'neu', { sections: [{ id: 't', type: 'text', visible: true, fields: { title: '  ' } }] }),
      page('aus', 'aus', { status: 'disabled', seo: { title: '', description: '' }, sections: [{ id: 't', type: 'text', visible: true, fields: { title: '' } }] }),
    ];
    const pub = run(doc);
    const err = pub.errors.find((e) => e.path === 'pages.0.sections.0.fields.title');
    expect(err.message).toBe('Seite „neu“ › Abschnitt „Text“ › Überschrift: Pflichtfeld ist leer.');
    expect(paths(pub.errors).some((p) => p.startsWith('pages.1.'))).toBe(false);
    expect(paths(pub.warnings)).toContain('pages.1.sections.0.fields.title');
    const draft = run(doc, { mode: 'draft' });
    expect(draft.errors).toEqual([]);
    expect(paths(draft.warnings)).toContain('pages.0.sections.0.fields.title');
  });

  it('Feldtypen: maxLength, Listen min/max, Auswahl, Zahl, Link-Variante, Seite, Bild', () => {
    const doc = clone();
    doc.pages = [
      page('a', 'a', {
        sections: [
          karten({
            items: [{ title: 'viel zu langer Titel' }, { title: 'b' }, { title: 'c' }],
            stil: 'z',
            anzahl: '3',
            button: { label: 'Los', href: '/x', variant: 'accent' },
            ziel: 'gibtsnicht',
            image: { media: 'gibtsnicht' },
          }),
        ],
      }),
      page('b', 'b', { sections: [karten({ items: [], image: null })] }),
    ];
    const r = run(doc);
    const m = (p) => r.errors.find((e) => e.path === p)?.message;
    expect(m('pages.0.sections.0.fields.items')).toMatch(/höchstens 2 Einträge möglich \(aktuell 3\)/);
    expect(m('pages.0.sections.0.fields.items.0.title')).toBe('Seite „a“ › Abschnitt „Karten“ › Karten › „viel zu langer Titel“ › Titel: Text ist zu lang (20 von höchstens 10 Zeichen).');
    expect(m('pages.0.sections.0.fields.stil')).toMatch(/Auswahl „z“ ist nicht möglich/);
    expect(m('pages.0.sections.0.fields.anzahl')).toMatch(/Zahl/);
    expect(m('pages.0.sections.0.fields.button.variant')).toMatch(/Button-Stil/);
    expect(m('pages.0.sections.0.fields.ziel')).toMatch(/Seite „gibtsnicht“ gibt es nicht/);
    expect(m('pages.0.sections.0.fields.image')).toBe('Seite „a“ › Abschnitt „Karten“ › Bild: Bild „gibtsnicht“ gibt es nicht in der Medienbibliothek.');
    expect(m('pages.1.sections.0.fields.items')).toMatch(/mindestens 1 Eintrag nötig/);
    expect(m('pages.1.sections.0.fields.image')).toMatch(/Bild fehlt/);
  });
});

describe('Links', () => {
  it('checkHref: erlaubte Schemata, page:-Ziele, Platzhalter', () => {
    const doc = { pages: [{ id: 'faq', title: 'FAQ', status: 'published' }, { id: 'alt', title: 'Alt', status: 'disabled' }] };
    for (const ok of ['page:faq', 'page:faq#oeffnung', '/karte', '#top', 'https://www.instagram.com/x/', 'mailto:hallo@sauerundsaftig.de', 'tel:+49 38296 123', '{{tel}}', '{{route}}', '']) {
      expect(checkHref(ok, doc), ok).toEqual({});
    }
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'http://x', 'ftp://x.de', 'mailto:kein', 'tel:abc', 'page:Faq', 'faq', '/a b']) {
      expect(checkHref(bad, doc).error, bad).toBeTruthy();
    }
    expect(checkHref('page:gibtsnicht', doc).warning).toMatch(/gibt es nicht/);
    expect(checkHref('page:alt', doc).warning).toMatch(/„Alt“ ist deaktiviert/);
  });

  it('Rich-Text-Links und unbekannte Platzhalter', () => {
    const doc = clone();
    doc.pages = [
      page('a', 'a', {
        sections: [{ id: 't', type: 'text', visible: true, fields: { title: 'x', body: 'Siehe [hier](javascript:alert(1)) und [FAQ](page:faq) — {{oeffnungszeiten}}' } }],
      }),
    ];
    const r = run(doc);
    expect(r.errors.find((e) => e.path === 'pages.0.sections.0.fields.body').message).toMatch(/Link „hier“ — Linkziel „javascript:alert\(1“ ist nicht erlaubt/);
    const warn = r.warnings.filter((w) => w.path === 'pages.0.sections.0.fields.body').map((w) => w.message).join(' ');
    expect(warn).toMatch(/Link „FAQ“ — Die verlinkte Seite „faq“ gibt es nicht/);
    expect(warn).toMatch(/Platzhalter \{\{oeffnungszeiten\}\} ist unbekannt/);
  });

  it('Navigation: Unterpunkte nur in der Hauptnavigation, IDs eindeutig, Ziel nötig', () => {
    const doc = clone();
    doc.navigation.main[0].children = [{ id: 'kinder', label: 'Unterpunkt', href: '/x', children: [{ id: 'enkel', label: 'x', href: '/y' }] }];
    doc.navigation.footer[0].children = [];
    doc.navigation.footer[1].id = doc.navigation.footer[0].id;
    doc.navigation.legal[0].href = '';
    doc.navigation.social[0].href = 'javascript:x';
    const r = run(doc);
    expect(paths(r.errors)).toEqual(
      expect.arrayContaining([
        'navigation.main.0.children.0.children',
        'navigation.footer.0.children',
        'navigation.footer.1.id',
        'navigation.legal.0.href',
        'navigation.social.0.href',
      ]),
    );
    expect(paths(r.errors)).not.toContain('navigation.main.0.children');
  });
});

describe('Medien', () => {
  it('Bibliothek: IDs, Art/Datei, Ersatz, fehlende Upload-Dateien, Alt-Text-Warnung', () => {
    const doc = clone();
    doc.media.push(
      { id: 'up', kind: 'upload', file: 'media/up.jpg', alt: '' },
      { id: 'up', kind: 'upload', file: 'media/zwei.jpg', alt: 'x' },
      { id: 'boese', kind: 'upload', file: 'media/../../etc/passwd', alt: 'x' },
      { id: 'ersatz', kind: 'builtin', file: 'photos/x.jpg', alt: 'x', replacedBy: 'media/fehlt.jpg' },
    );
    const n = seed.media.length;
    const r = run(doc, { mediaFiles: new Set(['media/up.jpg', 'media/zwei.jpg']) });
    expect(r.errors.find((e) => e.path === `media.${n + 1}.id`).message).toMatch(/doppelt/);
    expect(r.errors.find((e) => e.path === `media.${n + 2}.file`).message).toMatch(/Dateiangabe ist ungültig/);
    expect(r.errors.find((e) => e.path === `media.${n + 3}.file`).message).toMatch(/Bilddatei fehlt/);
    expect(r.warnings.find((w) => w.path === `media.${n}.alt`).message).toMatch(/Alternativtext fehlt/);
  });

  it('Verweise überall (Karte, Logo, SEO) müssen existieren; mediaUsages benennt die Stellen', () => {
    const doc = clone();
    doc.layout.header.logo = { media: 'logo-neu' };
    doc.collections.menu[0].items[0].motif = 'logo-neu';
    doc.pages = [page('a', 'a', { seo: { title: 't', description: 'd', ogImage: { media: 'logo-neu' } } })];
    const r = run(doc);
    expect(r.errors.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        'Kopfbereich › Logo: Bild „logo-neu“ gibt es nicht in der Medienbibliothek.',
        expect.stringMatching(/^Karte › Kategorie „Frühstück“ › „.+“ › Bild: Bild „logo-neu“ gibt es nicht/),
        'Seite „a“ › SEO › Vorschaubild: Bild „logo-neu“ gibt es nicht in der Medienbibliothek.',
      ]),
    );
    doc.media.push({ id: 'logo-neu', kind: 'upload', file: 'media/logo-neu.png', alt: 'Logo' });
    expect(run(doc).errors).toEqual([]);
    expect(mediaUsages(doc, 'logo-neu', defs).map((u) => u.path)).toEqual(['layout.header.logo', 'pages.0.seo.ogImage', 'collections.menu.0.items.0.motif']);
    expect(describePath(doc, 'pages.0.seo.ogImage', defs)).toBe('Seite „a“ › SEO › Vorschaubild');
  });
});

describe('Einstellungen, Sammlungen, Weiterleitungen', () => {
  it('Einstellungen: Öffnungszeiten, Telefon, E-Mail, Website-Adresse', () => {
    const doc = clone();
    doc.settings.openingHours.week.mon = [['18:00', '08:00']];
    doc.settings.openingHours.week.tue = [['8 Uhr', '17:00']];
    doc.settings.openingHours.exceptions = [{ date: '24.12.2026', hours: [], label: 'Heiligabend' }];
    doc.settings.phone = 'ruf an';
    doc.settings.email = 'kaputt';
    doc.settings.siteUrl = 'http://sauerundsaftig.de/';
    const r = run(doc);
    expect(r.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        'settings.openingHours.week.mon.0',
        'settings.openingHours.week.tue.0',
        'settings.openingHours.exceptions.0.date',
        'settings.phone',
        'settings.email',
        'settings.siteUrl',
      ]),
    );
    expect(r.errors.find((e) => e.path === 'settings.openingHours.week.mon.0').message).toMatch(/Montag: Zeitraum 18:00–08:00 endet vor dem Beginn/);
  });

  it('Sammlungen: Pflichtfelder, doppelte Kategorie-Adressen und IDs, Preis als Zahl', () => {
    const doc = clone();
    doc.collections.menu[1].slug = doc.collections.menu[0].slug;
    doc.collections.menu[0].items[0].price = '4,50';
    doc.collections.faq[1].id = doc.collections.faq[0].id;
    doc.collections.faq[0].question = '';
    doc.collections.testimonials.push({ id: 'neu', quote: '', author: 'Gast', isPlaceholder: false });
    const r = run(doc);
    expect(paths(r.errors)).toEqual(
      expect.arrayContaining(['collections.menu.1.slug', 'collections.menu.0.items.0.price', 'collections.faq.1.id', 'collections.faq.0.question', `collections.testimonials.${doc.collections.testimonials.length - 1}.quote`]),
    );
    expect(run(doc, { mode: 'draft' }).errors.map((e) => e.path)).not.toContain('collections.faq.0.question');
  });

  it('Sammlungs-Definitionen (src/cms/collections) werden zusätzlich angewandt', () => {
    const doc = clone();
    doc.collections.faq[0].question = 'x'.repeat(50);
    const withDef = { ...defs, collections: { faq: { name: 'faq', label: 'FAQ', fields: [{ key: 'question', label: 'Frage', kind: 'text', maxLength: 20 }] } } };
    const r = validateSiteDoc(doc, withDef);
    expect(r.errors.find((e) => e.path === 'collections.faq.0.question').message).toMatch(/FAQ › „x+…“ › Frage: Text ist zu lang \(50 von höchstens 20/);
  });

  it('Weiterleitungen: Format, reservierte Pfade, Doppelte, Schleifen, aktive Seiten', () => {
    const doc = clone();
    doc.pages = [page('neu', 'neu')];
    doc.redirects = [
      { from: '/alt-a', to: '/alt-b', status: 301 },
      { from: '/alt-b', to: '/alt-c?x=1', status: 301 },
      { from: '/alt-c', to: '/alt-a', status: 301 },
      { from: '/admin', to: '/x', status: 301 },
      { from: 'ohne-slash', to: '/x', status: 301 },
      { from: '/alt-a', to: '/x', status: 301 },
      { from: '/neu', to: '/x', status: 301 },
      { from: '/alt-d', to: 'javascript:x', status: 301 },
      { from: '/e', to: '/x', status: 307 },
      { from: '/f', to: 'https://www.sauerundsaftig.de/karte', status: 302 },
    ];
    const r = run(doc);
    expect(r.errors.find((e) => e.path === 'redirects.0').message).toBe('Weiterleitungen bilden eine Schleife: /alt-a → /alt-b → /alt-c → /alt-a.');
    expect(paths(r.errors)).toEqual(expect.arrayContaining(['redirects.3.from', 'redirects.4.from', 'redirects.5.from', 'redirects.7.to', 'redirects.8.status']));
    expect(r.warnings.find((w) => w.path === 'redirects.6.from').message).toMatch(/aktive Seite/);
    expect(paths(r.errors).some((p) => p.startsWith('redirects.9'))).toBe(false);
  });
});

describe('loadDefinitions', () => {
  it('lädt Sektionen (Ordnername = Typ) und Sammlungen aus einem Verzeichnis', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sus-defs-'));
    try {
      await mkdir(path.join(dir, 'sections', 'hero'), { recursive: true });
      await mkdir(path.join(dir, 'sections', 'ohne'), { recursive: true });
      await mkdir(path.join(dir, 'collections'), { recursive: true });
      await writeFile(path.join(dir, 'sections', 'hero', 'definition.mjs'), "export default { type: 'hero', label: 'Hero', allowedOn: '*', fields: [], defaults: () => ({}) };");
      await writeFile(path.join(dir, 'collections', 'faq.mjs'), "export default { name: 'faq', label: 'FAQ', fields: [{ key: 'question', label: 'Frage', kind: 'text' }] };");
      const d = await loadDefinitions({ root: dir, reload: true, log: { warn() {} } });
      expect(Object.keys(d.sections)).toEqual(['hero']);
      expect(d.collections.faq.label).toBe('FAQ');
      const real = await loadDefinitions({ reload: true });
      expect(real.sections.text.label).toBe('Text');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
