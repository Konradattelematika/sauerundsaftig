/**
 * Prüfung eines SiteDoc (docs/CMS-PLAN.md §3, §7) — reines JavaScript ohne Node-Importe, läuft im Server
 * (Speichern, Veröffentlichen) und im Admin-Browser. Die Definitionen werden übergeben:
 *
 *   validateSiteDoc(doc, { sections, collections }, { mode, mediaFiles })
 *     → { errors: [{ path, message }], warnings: [{ path, message }] }
 *
 * mode 'publish' (Standard): alles muss vollständig sein. mode 'draft' (Entwurf speichern): unvollständige
 * Inhalte (leere Pflichtfelder, zu wenige Listeneinträge) sind nur Warnungen — Fehler bleiben Dinge, die den
 * Build brechen oder unsicher wären (unbekannte Typen/Bilder, ungültige Adressen/Links, zu lange Texte …).
 * Deaktivierte Seiten werden immer wie Entwürfe behandelt.
 * mediaFiles (optional, Server): Set der vorhandenen Upload-Dateien ('media/<datei>') — fehlende sind Fehler.
 *
 * `path` ist maschinenlesbar (Punkte, z. B. 'pages.2.sections.0.fields.title'), `message` richtet sich an
 * Laien und nennt die Stelle („Seite „Über uns“ › Abschnitt „Text“ › Überschrift: Pflichtfeld ist leer.“).
 */

export const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const SLUG_SEGMENT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Erste Adress-Segmente, die Systemseiten, Werkzeugen oder Assets gehören */
export const RESERVED_PREFIXES = [
  'b', 'c', 'd', 'dev', 'module', 'checkliste', 'admin', 'api', 'login', 'logout', 'passwort',
  'countdown', 'varianten', '_astro', 'brand', 'media', '404',
];
/** {{platzhalter}}, die rich.mjs bzw. resolveHref kennen */
export const KNOWN_TOKENS = ['phoneDisplay', 'phone', 'email', 'name', 'street', 'zip', 'city', 'breakfastUntil', 'instagram', 'tel', 'route'];
export const COLLECTION_LABELS = { menu: 'Karte', faq: 'FAQ', testimonials: 'Gästestimmen', heuteFrisch: 'Aus der Backstube' };

const ANCHOR_RE = /^[A-Za-z0-9_-]{1,80}$/;
const MEDIA_FILE_RE = {
  builtin: /^photos\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp|avif)$/,
  placeholder: /^placeholders\/[a-z0-9-]+\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp|avif)$/,
  upload: /^media\/[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp|avif)$/,
};
const DEFAULT_MAX = { text: 1000, textarea: 20000, rich: 20000 };
const WEEK = { mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag', fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag' };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STICKY_ICONS = ['menu', 'phone', 'route', 'bag'];
const STRUCTURED = ['localBusiness', 'menu', 'faq'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const len = (s) => [...String(s)].length;
const q = (s) => `„${String(s)}“`;
const short = (s, n = 40) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return len(t) > n ? `${[...t].slice(0, n - 1).join('')}…` : t;
};
const pagePathOf = (slug) => (slug ? `/${slug}` : '/');

/* ------------------------------------------------------------------ Linkziele ----------- */

/**
 * Ein Linkziel prüfen. → {} (in Ordnung) | { error } | { warning }
 * @param {string} href
 * @param {{ pages?: { id: string, title?: string, status?: string }[] }} [doc]
 */
export function checkHref(href, doc) {
  if (typeof href !== 'string') return { error: 'Linkziel muss Text sein.' };
  const h = href;
  if (!h) return {};
  if (len(h) > 2000) return { error: 'Linkziel ist zu lang.' };
  if (h === '{{tel}}' || h === '{{route}}') return {};
  if (h.startsWith('page:')) {
    const m = /^page:([a-z0-9][a-z0-9-]{0,63})(?:#([A-Za-z0-9_-]{1,80}))?$/.exec(h);
    if (!m) return { error: `Seitenverweis ${q(short(h))} ist ungültig.` };
    const page = (Array.isArray(doc?.pages) ? doc.pages : []).find((p) => isObj(p) && p.id === m[1]);
    if (!page) return { warning: `Die verlinkte Seite ${q(m[1])} gibt es nicht — der Link führt ins Leere.` };
    if (page.status !== 'published') return { warning: `Die verlinkte Seite ${q(page.title || page.id)} ist deaktiviert — der Link führt ins Leere.` };
    return {};
  }
  if (h.startsWith('#')) return ANCHOR_RE.test(h.slice(1)) ? {} : { error: 'Sprungmarke ist ungültig (Form: #name).' };
  if (h.startsWith('/')) {
    if (h.startsWith('//') || /[\s\\<>"'`]/.test(h)) return { error: `Pfad ${q(short(h))} ist ungültig.` };
    return {};
  }
  if (/^https?:\/\//i.test(h)) {
    if (/[\s<>"'`\\]/.test(h)) return { error: `Webadresse ${q(short(h))} ist ungültig.` };
    try {
      const u = new URL(h);
      if (!u.hostname.includes('.')) return { error: `Webadresse ${q(short(h))} ist unvollständig.` };
    } catch {
      return { error: `Webadresse ${q(short(h))} ist ungültig.` };
    }
    return {};
  }
  if (/^mailto:/i.test(h)) {
    return /^mailto:[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`?]+(\?[^\s<>"'`]*)?$/i.test(h)
      ? {}
      : { error: 'E-Mail-Link ist ungültig (Form: mailto:name@beispiel.de).' };
  }
  if (/^tel:/i.test(h)) {
    return /^tel:\+?[0-9][0-9 ()/.-]{2,30}$/i.test(h) ? {} : { error: 'Telefon-Link ist ungültig (Form: tel:+49…).' };
  }
  return {
    error: `Linkziel ${q(short(h))} ist nicht erlaubt. Möglich sind eine Seite der Website, /pfad, https://…, mailto:… oder tel:….`,
  };
}

/* ------------------------------------------------------------------ Bild-Verweise ------- */

/**
 * Alle Bild-Verweise im Inhalt (außerhalb der Medienbibliothek): MediaRef-Objekte ({ media }) und
 * motif-Felder (Karte, Aus der Backstube). → [{ id, path }]
 */
export function collectMediaRefs(doc) {
  const out = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, [...path, i]));
      return;
    }
    if (!isObj(node)) return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'media' && typeof v === 'string') out.push({ id: v, path: path.join('.') });
      else if (k === 'motif' && typeof v === 'string' && v) out.push({ id: v, path: [...path, k].join('.') });
      else if (v && typeof v === 'object') walk(v, [...path, k]);
    }
  };
  if (isObj(doc)) {
    for (const [k, v] of Object.entries(doc)) {
      if (k === 'media' || k === 'meta') continue;
      if (v && typeof v === 'object') walk(v, [k]);
    }
  }
  return out;
}

/** Wo wird ein Bild verwendet? → [{ path, label }] (für Löschschutz und Admin) */
export function mediaUsages(doc, mediaId, defs) {
  return collectMediaRefs(doc)
    .filter((r) => r.id === mediaId)
    .map((r) => ({ path: r.path, label: describePath(doc, r.path, defs) }));
}

/* ------------------------------------------------------------------ Pfad → Klartext ----- */

function fieldTrail(fields, value, rest, parts) {
  let defs = fields;
  let cur = value;
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    const def = Array.isArray(defs) ? defs.find((f) => f.key === key) : undefined;
    if (!def) {
      parts.push(String(key));
      return;
    }
    parts.push(def.label || def.key);
    cur = isObj(cur) ? cur[key] : undefined;
    if (def.kind === 'list' && i + 1 < rest.length) {
      const idx = Number(rest[i + 1]);
      const item = Array.isArray(cur) ? cur[idx] : undefined;
      const name = def.itemLabel && isObj(item) && typeof item[def.itemLabel] === 'string' && item[def.itemLabel].trim();
      parts.push(name ? q(short(name)) : `Nr. ${idx + 1}`);
      cur = item;
      defs = def.of;
      i++;
    } else {
      defs = def.of;
    }
  }
}

/**
 * Maschinenpfad → Ort in Worten, z. B. 'pages.0.sections.1.fields.image' → 'Seite „Start“ › Abschnitt „Text“ › Bild'
 * @param {object} doc  @param {string|(string|number)[]} path  @param {{ sections?: object, collections?: object }} [defs]
 */
export function describePath(doc, path, defs = {}) {
  const seg = Array.isArray(path) ? path.map(String) : String(path).split('.');
  const parts = [];
  const [head] = seg;
  if (head === 'pages') {
    const page = doc?.pages?.[Number(seg[1])];
    parts.push(`Seite ${q(page?.title || page?.id || `Nr. ${Number(seg[1]) + 1}`)}`);
    if (seg[2] === 'sections' && seg[3] !== undefined) {
      const s = page?.sections?.[Number(seg[3])];
      const def = defs?.sections?.[s?.type];
      parts.push(`Abschnitt ${q(def?.label || s?.type || `Nr. ${Number(seg[3]) + 1}`)}`);
      if (seg[4] === 'fields' && seg.length > 5) fieldTrail(def?.fields, s?.fields, seg.slice(5), parts);
    } else if (seg[2] === 'seo') {
      parts.push(seg[3] === 'ogImage' ? 'SEO › Vorschaubild' : 'SEO');
    } else if (seg[2]) parts.push(seg[2]);
  } else if (head === 'collections') {
    const name = seg[1];
    parts.push(defs?.collections?.[name]?.label || COLLECTION_LABELS[name] || name);
    const col = doc?.collections?.[name];
    if (name === 'menu' && seg[2] !== undefined) {
      const cat = col?.[Number(seg[2])];
      parts.push(`Kategorie ${q(cat?.title || cat?.slug || Number(seg[2]) + 1)}`);
      if (seg[3] === 'items' && seg[4] !== undefined) parts.push(q(cat?.items?.[Number(seg[4])]?.name || `Nr. ${Number(seg[4]) + 1}`));
    } else if (name === 'heuteFrisch' && seg[2] === 'items' && seg[3] !== undefined) {
      parts.push(q(col?.items?.[Number(seg[3])]?.name || `Nr. ${Number(seg[3]) + 1}`));
    } else if (Array.isArray(col) && seg[2] !== undefined) {
      const item = col[Number(seg[2])];
      parts.push(q(short(item?.question || item?.title || item?.name || item?.author || item?.id || `Nr. ${Number(seg[2]) + 1}`)));
    }
    if (seg.at(-1) === 'motif') parts.push('Bild');
  } else if (head === 'layout') {
    parts.push(seg[1] === 'header' ? 'Kopfbereich' : seg[1] === 'footer' ? 'Fußbereich' : seg[1] === 'stickyBar' ? 'Mobile Leiste' : 'Layout');
    if (seg[2] === 'logo') parts.push('Logo');
  } else if (head === 'settings') {
    parts.push('Einstellungen');
    if (seg[1] === 'seoDefaults') parts.push('Standard-Vorschaubild');
  } else if (head === 'navigation') {
    parts.push('Navigation');
  } else if (head === 'redirects') {
    parts.push('Weiterleitungen');
  } else if (head === 'media') {
    parts.push('Medienbibliothek');
  } else {
    parts.push(seg.join('.'));
  }
  return parts.join(' › ');
}

/* ------------------------------------------------------------------ Prüfkontext --------- */

class Ctx {
  constructor(doc, defs, opts) {
    this.doc = doc;
    this.defs = { sections: defs?.sections ?? {}, collections: defs?.collections ?? {} };
    this.mode = opts.mode === 'draft' ? 'draft' : 'publish';
    this.mediaFiles = opts.mediaFiles instanceof Set ? opts.mediaFiles : null;
    this.errors = [];
    this.warnings = [];
    this.lenient = false;
    this.secondary = false;
    this.reported = new Set();
    this.pages = Array.isArray(doc?.pages) ? doc.pages.filter(isObj) : [];
  }
  #add(list, path, message) {
    if (this.secondary && this.reported.has(path)) return;
    this.reported.add(path);
    list.push({ path, message });
  }
  error(path, message) {
    this.#add(this.errors, path, message);
  }
  warn(path, message) {
    this.#add(this.warnings, path, message);
  }
  /** Unvollständig: beim Veröffentlichen ein Fehler, im Entwurf (und auf deaktivierten Seiten) eine Warnung */
  incomplete(path, message) {
    if (this.mode === 'draft' || this.lenient) this.warn(path, message);
    else this.error(path, message);
  }
  pageById(id) {
    return this.pages.find((p) => p.id === id);
  }
}

function checkTokens(ctx, text, path, where) {
  for (const m of String(text).matchAll(/\{\{(\w+)\}\}/g)) {
    if (!KNOWN_TOKENS.includes(m[1])) ctx.warn(path, `${where}: Platzhalter {{${m[1]}}} ist unbekannt und erscheint so auf der Seite.`);
  }
}

function checkRichLinks(ctx, text, path, where) {
  for (const m of String(text).matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)) {
    const r = checkHref(m[2], ctx.doc);
    if (r.error) ctx.error(path, `${where}: Link ${q(short(m[1], 30))} — ${r.error}`);
    else if (r.warning) ctx.warn(path, `${where}: Link ${q(short(m[1], 30))} — ${r.warning}`);
  }
}

function checkString(ctx, value, path, where, { required = false, max = 1000, kind = 'text' } = {}) {
  if (value === undefined || value === null) {
    if (required) ctx.incomplete(path, `${where}: Pflichtfeld ist leer.`);
    return;
  }
  if (typeof value !== 'string') {
    ctx.error(path, `${where}: muss Text sein.`);
    return;
  }
  if (required && !value.trim()) ctx.incomplete(path, `${where}: Pflichtfeld ist leer.`);
  const n = len(value);
  if (n > max) ctx.error(path, `${where}: Text ist zu lang (${n} von höchstens ${max} Zeichen).`);
  checkTokens(ctx, value, path, where);
  if (kind === 'rich') checkRichLinks(ctx, value, path, where);
}

function checkBool(ctx, value, path, where) {
  if (value !== undefined && value !== null && typeof value !== 'boolean') ctx.error(path, `${where}: muss „ja“ oder „nein“ sein.`);
}

function checkHrefValue(ctx, href, path, where, required) {
  if (isBlank(href)) {
    if (href !== undefined && href !== null && typeof href !== 'string') ctx.error(path, `${where}: Linkziel muss Text sein.`);
    else if (required) ctx.incomplete(path, `${where}: Linkziel fehlt.`);
    return;
  }
  const r = checkHref(href, ctx.doc);
  if (r.error) ctx.error(path, `${where}: ${r.error}`);
  else if (r.warning) ctx.warn(path, `${where}: ${r.warning}`);
}

function checkMediaRef(ctx, value, path, where, required) {
  if (value === undefined || value === null) {
    if (required) ctx.incomplete(path, `${where}: Bild fehlt.`);
    return;
  }
  if (!isObj(value) || typeof value.media !== 'string' || !value.media) {
    ctx.error(path, `${where}: Bildangabe ist ungültig.`);
    return;
  }
  if (value.alt !== undefined && value.alt !== null) checkString(ctx, value.alt, `${path}.alt`, `${where} › Alternativtext`, { max: 300 });
  // Existenz prüft checkMediaExistence() für das ganze Dokument
}

function checkLink(ctx, value, path, where, { required = false, variants, maxLength = 120 } = {}) {
  if (value === undefined || value === null) {
    if (required) ctx.incomplete(path, `${where}: Link fehlt.`);
    return;
  }
  if (!isObj(value)) {
    ctx.error(path, `${where}: Link ist ungültig.`);
    return;
  }
  const active = value.visible !== false;
  const hasLabel = typeof value.label === 'string' && value.label.trim() !== '';
  checkString(ctx, value.label, `${path}.label`, `${where} › Beschriftung`, { required: required && active, max: maxLength });
  checkHrefValue(ctx, value.href, `${path}.href`, `${where} › Ziel`, active && (required || hasLabel));
  checkBool(ctx, value.visible, `${path}.visible`, `${where} › sichtbar`);
  checkBool(ctx, value.newTab, `${path}.newTab`, `${where} › neuer Tab`);
  if (value.variant !== undefined && value.variant !== null && value.variant !== '') {
    if (Array.isArray(variants) && variants.length && !variants.includes(value.variant)) {
      ctx.error(`${path}.variant`, `${where}: Button-Stil ${q(value.variant)} ist hier nicht möglich.`);
    }
  }
}

/* ------------------------------------------------------------------ Felder (Definitionen) */

function itemName(item, labelKey, i) {
  const name = labelKey && isObj(item) && typeof item[labelKey] === 'string' && item[labelKey].trim();
  return name ? q(short(name)) : `Nr. ${i + 1}`;
}

function checkFields(ctx, fieldDefs, obj, path, where) {
  if (!Array.isArray(fieldDefs)) return;
  if (!isObj(obj)) {
    ctx.error(path, `${where}: Inhalt fehlt oder ist ungültig.`);
    return;
  }
  for (const def of fieldDefs) {
    if (!def || typeof def.key !== 'string') continue;
    checkField(ctx, def, obj[def.key], `${path}.${def.key}`, `${where} › ${def.label || def.key}`);
  }
}

function checkField(ctx, def, value, path, where) {
  switch (def.kind) {
    case 'text':
    case 'textarea':
    case 'rich':
      checkString(ctx, value, path, where, { required: def.required, max: def.maxLength ?? DEFAULT_MAX[def.kind], kind: def.kind });
      return;
    case 'media':
      checkMediaRef(ctx, value, path, where, def.required);
      return;
    case 'link':
      checkLink(ctx, value, path, where, { required: def.required, variants: def.variants, maxLength: def.maxLength ?? 120 });
      return;
    case 'href':
      checkHrefValue(ctx, value, path, where, def.required);
      return;
    case 'list': {
      const list = value === undefined || value === null ? [] : value;
      if (!Array.isArray(list)) {
        ctx.error(path, `${where}: muss eine Liste sein.`);
        return;
      }
      if (typeof def.max === 'number' && list.length > def.max) {
        ctx.error(path, `${where}: höchstens ${def.max} ${def.max === 1 ? 'Eintrag' : 'Einträge'} möglich (aktuell ${list.length}).`);
      }
      const min = typeof def.min === 'number' ? def.min : def.required ? 1 : 0;
      if (list.length < min) ctx.incomplete(path, `${where}: mindestens ${min} ${min === 1 ? 'Eintrag' : 'Einträge'} nötig (aktuell ${list.length}).`);
      list.forEach((item, i) => {
        if (Array.isArray(def.of)) checkFields(ctx, def.of, item, `${path}.${i}`, `${where} › ${itemName(item, def.itemLabel, i)}`);
      });
      return;
    }
    case 'select':
    case 'collection': {
      if (isBlank(value)) {
        if (def.required) ctx.incomplete(path, `${where}: Bitte eine Auswahl treffen.`);
        return;
      }
      const allowed = (def.options ?? []).map((o) => o.value);
      if (allowed.length && !allowed.includes(value)) ctx.error(path, `${where}: Auswahl ${q(value)} ist nicht möglich.`);
      else if (def.kind === 'collection' && !allowed.length && !Object.hasOwn(ctx.doc.collections ?? {}, value)) {
        ctx.error(path, `${where}: Sammlung ${q(value)} gibt es nicht.`);
      }
      return;
    }
    case 'boolean':
      checkBool(ctx, value, path, where);
      return;
    case 'number':
      if (value === undefined || value === null || value === '') {
        if (def.required) ctx.incomplete(path, `${where}: Pflichtfeld ist leer.`);
        return;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) ctx.error(path, `${where}: muss eine Zahl sein.`);
      return;
    case 'page': {
      if (isBlank(value)) {
        if (def.required) ctx.incomplete(path, `${where}: Bitte eine Seite wählen.`);
        return;
      }
      const page = typeof value === 'string' ? ctx.pageById(value) : undefined;
      if (!page) ctx.error(path, `${where}: Seite ${q(value)} gibt es nicht.`);
      else if (page.status !== 'published') ctx.warn(path, `${where}: Seite ${q(page.title || page.id)} ist deaktiviert.`);
      return;
    }
    default:
      return; // unbekannter Feldtyp: nicht prüfen (neue Typen brauchen eine Erweiterung hier)
  }
}

/* ------------------------------------------------------------------ Seiten -------------- */

function checkSeo(ctx, page, path, where) {
  const seo = page.seo;
  if (!isObj(seo)) {
    ctx.error(`${path}.seo`, `${where}: SEO-Angaben fehlen.`);
    return;
  }
  const sw = `${where} › SEO`;
  const needed = page.status === 'published' && !page.system;
  checkString(ctx, seo.title, `${path}.seo.title`, `${sw} › Seitentitel`, { required: needed, max: 200 });
  if (typeof seo.title === 'string' && len(seo.title) > 70) ctx.warn(`${path}.seo.title`, `${sw} › Seitentitel: länger als 70 Zeichen — Suchmaschinen kürzen ihn.`);
  checkString(ctx, seo.description, `${path}.seo.description`, `${sw} › Beschreibung`, { required: needed, max: 500 });
  if (typeof seo.description === 'string' && len(seo.description) > 170) {
    ctx.warn(`${path}.seo.description`, `${sw} › Beschreibung: länger als 170 Zeichen — Suchmaschinen kürzen sie.`);
  }
  checkString(ctx, seo.ogTitle, `${path}.seo.ogTitle`, `${sw} › Titel beim Teilen`, { max: 200 });
  checkString(ctx, seo.ogDescription, `${path}.seo.ogDescription`, `${sw} › Beschreibung beim Teilen`, { max: 500 });
  checkMediaRef(ctx, seo.ogImage, `${path}.seo.ogImage`, `${sw} › Vorschaubild`, false);
  if (!isBlank(seo.canonical)) {
    if (typeof seo.canonical !== 'string' || !/^https:\/\/[^\s/]+\.[^\s]+$/.test(seo.canonical)) {
      ctx.error(`${path}.seo.canonical`, `${sw} › Kanonische Adresse: muss eine vollständige https://-Adresse sein.`);
    }
  }
  checkBool(ctx, seo.noindex, `${path}.seo.noindex`, `${sw} › nicht in Suchmaschinen`);
}

function checkSlug(ctx, page, path, where, slugs) {
  const s = page.slug;
  if (typeof s !== 'string') {
    ctx.error(`${path}.slug`, `${where}: Adresse fehlt.`);
    return;
  }
  let body = s;
  if (page.template === 'menu-category') {
    if (!s.endsWith('/*') || s === '/*') {
      ctx.error(`${path}.slug`, `${where}: Die Adresse einer Vorlagenseite muss auf „/*“ enden (z. B. „karte/*“).`);
      return;
    }
    body = s.slice(0, -2);
  }
  if (body !== '') {
    const segs = body.split('/');
    if (segs.some((x) => !SLUG_SEGMENT_RE.test(x))) {
      ctx.error(
        `${path}.slug`,
        `${where}: Adresse ${q(pagePathOf(s))} ist ungültig — erlaubt sind Kleinbuchstaben a–z, Ziffern und Bindestriche (Umlaute umschreiben: ü → ue), Unterseiten mit „/“.`,
      );
      return;
    }
    if (len(s) > 120) {
      ctx.error(`${path}.slug`, `${where}: Adresse ist zu lang (höchstens 120 Zeichen).`);
      return;
    }
    if (!page.system && RESERVED_PREFIXES.includes(segs[0])) {
      ctx.error(`${path}.slug`, `${where}: Die Adresse ${q(`/${segs[0]}`)} ist für das System reserviert — bitte eine andere wählen.`);
      return;
    }
  }
  const other = slugs.get(s);
  if (other) ctx.error(`${path}.slug`, `${where}: Adresse ${q(pagePathOf(s))} wird schon von Seite ${q(other.title || other.id)} verwendet.`);
  else slugs.set(s, page);
}

function checkSections(ctx, page, path, where) {
  if (!Array.isArray(page.sections)) {
    ctx.error(`${path}.sections`, `${where}: Abschnittsliste fehlt.`);
    return;
  }
  const ids = new Set();
  page.sections.forEach((s, j) => {
    const sp = `${path}.sections.${j}`;
    if (!isObj(s)) {
      ctx.error(sp, `${where}: Abschnitt Nr. ${j + 1} ist ungültig.`);
      return;
    }
    const def = typeof s.type === 'string' && Object.hasOwn(ctx.defs.sections, s.type) ? ctx.defs.sections[s.type] : undefined;
    const sw = `${where} › Abschnitt ${q(def?.label || s.type || `Nr. ${j + 1}`)}`;
    if (typeof s.id !== 'string' || !ID_RE.test(s.id)) ctx.error(`${sp}.id`, `${sw}: interne Kennung ${q(s.id)} ist ungültig.`);
    else if (ids.has(s.id)) ctx.error(`${sp}.id`, `${sw}: interne Kennung ${q(s.id)} kommt auf dieser Seite doppelt vor.`);
    else ids.add(s.id);
    if (!def) {
      ctx.error(`${sp}.type`, `${sw}: Abschnittstyp ${q(s.type)} gibt es nicht.`);
      return;
    }
    const allowed = def.allowedOn === '*' || (Array.isArray(def.allowedOn) && def.allowedOn.includes(page.id));
    if (!allowed) ctx.error(`${sp}.type`, `${sw}: Dieser Abschnitt ist auf dieser Seite nicht möglich.`);
    checkBool(ctx, s.visible, `${sp}.visible`, `${sw} › sichtbar`);
    checkFields(ctx, def.fields, s.fields, `${sp}.fields`, sw);
  });
}

function checkPages(ctx) {
  const { doc } = ctx;
  if (!Array.isArray(doc.pages)) {
    ctx.error('pages', 'Die Seitenliste fehlt.');
    return;
  }
  const ids = new Set();
  const slugs = new Map();
  doc.pages.forEach((p, i) => {
    const path = `pages.${i}`;
    if (!isObj(p)) {
      ctx.error(path, `Seite Nr. ${i + 1} ist ungültig.`);
      return;
    }
    const where = `Seite ${q(p.title || p.id || `Nr. ${i + 1}`)}`;
    ctx.lenient = p.status !== 'published';
    if (typeof p.id !== 'string' || !ID_RE.test(p.id)) ctx.error(`${path}.id`, `${where}: interne Kennung ${q(p.id)} ist ungültig (nur a–z, 0–9 und -).`);
    else if (ids.has(p.id)) ctx.error(`${path}.id`, `${where}: interne Kennung ${q(p.id)} ist doppelt vergeben.`);
    else ids.add(p.id);
    checkString(ctx, p.title, `${path}.title`, `${where} › Name`, { required: true, max: 120 });
    if (p.status !== 'published' && p.status !== 'disabled') ctx.error(`${path}.status`, `${where}: Status muss „aktiv“ oder „deaktiviert“ sein.`);
    if (p.kind !== 'builtin' && p.kind !== 'custom') ctx.error(`${path}.kind`, `${where}: Seitenart ist ungültig.`);
    if (p.template !== undefined && p.template !== 'menu-category') ctx.error(`${path}.template`, `${where}: Vorlage ${q(p.template)} gibt es nicht.`);
    checkBool(ctx, p.system, `${path}.system`, `${where} › Systemseite`);
    checkBool(ctx, p.showBreadcrumbs, `${path}.showBreadcrumbs`, `${where} › Brotkrumen`);
    checkString(ctx, p.breadcrumb, `${path}.breadcrumb`, `${where} › Brotkrumen-Text`, { max: 80 });
    if (p.structuredData !== undefined && (!Array.isArray(p.structuredData) || p.structuredData.some((x) => !STRUCTURED.includes(x)))) {
      ctx.error(`${path}.structuredData`, `${where}: Strukturierte Daten sind ungültig.`);
    }
    checkSlug(ctx, p, path, where, slugs);
    checkSeo(ctx, p, path, where);
    checkSections(ctx, p, path, where);
  });
  ctx.lenient = false;

  // Vorlagen-Unterseiten (karte/<kategorie>) dürfen nicht von eigenen Seiten belegt werden (außer Grundbestand)
  const menu = Array.isArray(doc.collections?.menu) ? doc.collections.menu.filter(isObj) : [];
  doc.pages.forEach((t) => {
    if (!isObj(t) || t.template !== 'menu-category' || typeof t.slug !== 'string' || !t.slug.endsWith('/*')) return;
    const parent = t.slug.slice(0, -2);
    for (const c of menu) {
      const sub = `${parent}/${c.slug}`;
      const other = slugs.get(sub);
      if (other && other.kind !== 'builtin') {
        const idx = doc.pages.indexOf(other);
        ctx.error(`pages.${idx}.slug`, `Seite ${q(other.title || other.id)}: Die Adresse ${q(`/${sub}`)} gehört schon zur Kartenkategorie ${q(c.title || c.slug)}.`);
      }
    }
  });
}

/** Adressen, die der Build tatsächlich erzeugt (aktive Seiten inkl. Vorlagen-Unterseiten) */
export function activePaths(doc) {
  const out = new Set();
  const pages = Array.isArray(doc?.pages) ? doc.pages.filter(isObj) : [];
  const menu = Array.isArray(doc?.collections?.menu) ? doc.collections.menu.filter(isObj) : [];
  for (const p of pages) {
    if (p.status !== 'published' || typeof p.slug !== 'string') continue;
    if (p.template === 'menu-category') {
      const parent = p.slug.replace(/\/\*$/, '');
      for (const c of menu) out.add(`/${parent}/${c.slug}`);
    } else out.add(pagePathOf(p.slug));
  }
  return out;
}

/* ------------------------------------------------------------------ Navigation & Layout - */

function checkNavItem(ctx, item, path, listLabel, ids, allowChildren) {
  if (!isObj(item)) {
    ctx.error(path, `${listLabel}: Eintrag ist ungültig.`);
    return;
  }
  const where = `${listLabel} › ${q(item.label || item.id || '?')}`;
  if (typeof item.id !== 'string' || !ID_RE.test(item.id)) ctx.error(`${path}.id`, `${where}: interne Kennung ${q(item.id)} ist ungültig.`);
  else if (ids.has(item.id)) ctx.error(`${path}.id`, `${where}: interne Kennung ${q(item.id)} ist doppelt vergeben.`);
  else ids.add(item.id);
  const active = item.visible !== false;
  checkString(ctx, item.label, `${path}.label`, `${where} › Beschriftung`, { required: active, max: 80 });
  checkHrefValue(ctx, item.href, `${path}.href`, `${where} › Ziel`, active && !(Array.isArray(item.children) && item.children.length));
  checkBool(ctx, item.visible, `${path}.visible`, `${where} › sichtbar`);
  checkBool(ctx, item.newTab, `${path}.newTab`, `${where} › neuer Tab`);
  if (item.children !== undefined && item.children !== null) {
    if (!allowChildren) ctx.error(`${path}.children`, `${where}: Unterpunkte sind hier nicht möglich.`);
    else if (!Array.isArray(item.children)) ctx.error(`${path}.children`, `${where}: Unterpunkte sind ungültig.`);
    else item.children.forEach((c, j) => checkNavItem(ctx, c, `${path}.children.${j}`, where, ids, false));
  }
}

function checkNavigation(ctx) {
  const nav = ctx.doc.navigation;
  if (!isObj(nav)) {
    ctx.error('navigation', 'Die Navigation fehlt.');
    return;
  }
  const lists = { main: 'Hauptnavigation', footer: 'Footer-Links', legal: 'Rechtliche Links', social: 'Social Media' };
  for (const [key, label] of Object.entries(lists)) {
    const list = nav[key];
    if (!Array.isArray(list)) {
      ctx.error(`navigation.${key}`, `${label}: Liste fehlt.`);
      continue;
    }
    const ids = new Set();
    list.forEach((item, i) => checkNavItem(ctx, item, `navigation.${key}.${i}`, label, ids, key === 'main'));
  }
  checkLink(ctx, nav.cta, 'navigation.cta', 'Navigation › Button im Kopfbereich', { maxLength: 40 });
}

function checkLayout(ctx) {
  const l = ctx.doc.layout;
  if (!isObj(l)) {
    ctx.error('layout', 'Die Einstellungen für Kopf- und Fußbereich fehlen.');
    return;
  }
  if (!isObj(l.header)) ctx.error('layout.header', 'Kopfbereich: Einstellungen fehlen.');
  else {
    checkMediaRef(ctx, l.header.logo, 'layout.header.logo', 'Kopfbereich › Logo', false);
    checkBool(ctx, l.header.showOpeningStatus, 'layout.header.showOpeningStatus', 'Kopfbereich › Öffnungsstatus');
  }
  if (!isObj(l.footer)) ctx.error('layout.footer', 'Fußbereich: Einstellungen fehlen.');
  else {
    const f = l.footer;
    checkString(ctx, f.claim, 'layout.footer.claim', 'Fußbereich › Claim', { max: 200 });
    checkString(ctx, f.text, 'layout.footer.text', 'Fußbereich › Text', { max: 2000, kind: 'rich' });
    checkString(ctx, f.navHeading, 'layout.footer.navHeading', 'Fußbereich › Überschrift Links', { max: 60 });
    checkString(ctx, f.hoursHeading, 'layout.footer.hoursHeading', 'Fußbereich › Überschrift Öffnungszeiten', { max: 60 });
    checkString(ctx, f.copyright, 'layout.footer.copyright', 'Fußbereich › Copyright', { max: 200 });
  }
  const sb = l.stickyBar;
  if (sb !== undefined) {
    if (!isObj(sb) || !Array.isArray(sb.items)) ctx.error('layout.stickyBar', 'Mobile Leiste: Einstellungen sind ungültig.');
    else {
      if (sb.items.length > 5) ctx.error('layout.stickyBar.items', `Mobile Leiste: höchstens 5 Einträge möglich (aktuell ${sb.items.length}).`);
      const ids = new Set();
      sb.items.forEach((it, i) => {
        const path = `layout.stickyBar.items.${i}`;
        const where = `Mobile Leiste › ${q(it?.label || it?.id || `Nr. ${i + 1}`)}`;
        if (!isObj(it)) {
          ctx.error(path, `${where}: Eintrag ist ungültig.`);
          return;
        }
        if (typeof it.id !== 'string' || !ID_RE.test(it.id)) ctx.error(`${path}.id`, `${where}: interne Kennung ${q(it.id)} ist ungültig.`);
        else if (ids.has(it.id)) ctx.error(`${path}.id`, `${where}: interne Kennung ${q(it.id)} ist doppelt vergeben.`);
        else ids.add(it.id);
        if (!STICKY_ICONS.includes(it.icon)) ctx.error(`${path}.icon`, `${where}: Symbol ${q(it.icon)} gibt es nicht.`);
        checkLink(ctx, it, path, where, { required: true, maxLength: 30 });
      });
    }
  }
}

/* ------------------------------------------------------------------ Einstellungen ------- */

function checkHours(ctx, hours, path, where) {
  if (!Array.isArray(hours)) {
    ctx.error(path, `${where}: Zeiten sind ungültig.`);
    return;
  }
  hours.forEach((pair, i) => {
    if (!Array.isArray(pair) || pair.length !== 2 || !TIME_RE.test(pair[0]) || !TIME_RE.test(pair[1])) {
      ctx.error(`${path}.${i}`, `${where}: Zeitraum Nr. ${i + 1} ist ungültig (Form: 08:00 bis 17:00).`);
    } else if (pair[0] >= pair[1]) {
      ctx.error(`${path}.${i}`, `${where}: Zeitraum ${pair[0]}–${pair[1]} endet vor dem Beginn.`);
    }
  });
}

function checkSettings(ctx) {
  const s = ctx.doc.settings;
  if (!isObj(s)) {
    ctx.error('settings', 'Die Einstellungen fehlen.');
    return;
  }
  const W = 'Einstellungen';
  checkString(ctx, s.name, 'settings.name', `${W} › Name`, { required: true, max: 80 });
  checkString(ctx, s.shortName, 'settings.shortName', `${W} › Kurzname`, { max: 40 });
  checkString(ctx, s.claim, 'settings.claim', `${W} › Claim`, { max: 200 });
  checkString(ctx, s.subline, 'settings.subline', `${W} › Unterzeile`, { max: 300 });
  checkString(ctx, s.phone, 'settings.phone', `${W} › Telefon`, { required: true, max: 40 });
  if (typeof s.phone === 'string' && s.phone.trim() && !/^\+?[0-9][0-9 ()/.-]{2,30}$/.test(s.phone.trim())) {
    ctx.error('settings.phone', `${W} › Telefon: nur Ziffern, Leerzeichen und + erlaubt.`);
  }
  checkString(ctx, s.phoneDisplay, 'settings.phoneDisplay', `${W} › Telefon (Anzeige)`, { required: true, max: 40 });
  checkString(ctx, s.email, 'settings.email', `${W} › E-Mail`, { max: 120 });
  if (typeof s.email === 'string' && s.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim())) {
    ctx.error('settings.email', `${W} › E-Mail: Adresse ist ungültig.`);
  }
  if (s.instagram !== undefined && s.instagram !== '' && (typeof s.instagram !== 'string' || !/^[A-Za-z0-9._]{1,30}$/.test(s.instagram))) {
    ctx.error('settings.instagram', `${W} › Instagram: nur den Benutzernamen ohne @ angeben (z. B. sauerundsaftig).`);
  }
  if (typeof s.siteUrl !== 'string' || !/^https:\/\/[^\s/]+\.[^\s/]+$/.test(s.siteUrl)) {
    ctx.error('settings.siteUrl', `${W} › Website-Adresse: muss eine https://-Adresse ohne Pfad sein.`);
  }
  if (!isObj(s.address)) ctx.error('settings.address', `${W} › Adresse fehlt.`);
  else {
    checkString(ctx, s.address.street, 'settings.address.street', `${W} › Straße`, { required: true, max: 120 });
    checkString(ctx, s.address.zip, 'settings.address.zip', `${W} › PLZ`, { required: true, max: 10 });
    checkString(ctx, s.address.city, 'settings.address.city', `${W} › Ort`, { required: true, max: 80 });
  }
  if (s.geo !== undefined && (!isObj(s.geo) || !Number.isFinite(s.geo.lat) || !Number.isFinite(s.geo.lng) || Math.abs(s.geo.lat) > 90 || Math.abs(s.geo.lng) > 180)) {
    ctx.error('settings.geo', `${W} › Koordinaten sind ungültig.`);
  }
  if (s.breakfastUntil !== undefined && s.breakfastUntil !== '' && !TIME_RE.test(s.breakfastUntil)) {
    ctx.error('settings.breakfastUntil', `${W} › Frühstück bis: Uhrzeit im Format 12:00.`);
  }
  if (s.goLiveAt !== undefined && (typeof s.goLiveAt !== 'string' || Number.isNaN(new Date(s.goLiveAt).getTime()))) {
    ctx.error('settings.goLiveAt', `${W} › Eröffnung: Datum ist ungültig.`);
  }
  if (s.rating !== undefined) {
    const r = s.rating;
    if (!isObj(r) || typeof r.value !== 'number' || r.value < 0 || r.value > 5 || !Number.isInteger(r.count) || r.count < 0) {
      ctx.error('settings.rating', `${W} › Bewertung: Wert (0–5) und Anzahl müssen Zahlen sein.`);
    }
  }
  checkBool(ctx, s.accessible, 'settings.accessible', `${W} › barrierefrei`);
  const oh = s.openingHours;
  if (!isObj(oh) || !isObj(oh.week)) ctx.error('settings.openingHours', `${W} › Öffnungszeiten fehlen.`);
  else {
    for (const [k, label] of Object.entries(WEEK)) {
      checkHours(ctx, oh.week[k] ?? [], `settings.openingHours.week.${k}`, `${W} › Öffnungszeiten › ${label}`);
    }
    if (oh.exceptions !== undefined) {
      if (!Array.isArray(oh.exceptions)) ctx.error('settings.openingHours.exceptions', `${W} › Sonderöffnungszeiten sind ungültig.`);
      else {
        oh.exceptions.forEach((ex, i) => {
          const p = `settings.openingHours.exceptions.${i}`;
          const where = `${W} › Sonderöffnungszeiten › ${isObj(ex) && ex.date ? ex.date : `Nr. ${i + 1}`}`;
          if (!isObj(ex)) return ctx.error(p, `${where}: Eintrag ist ungültig.`);
          if (typeof ex.date !== 'string' || !DATE_RE.test(ex.date) || Number.isNaN(new Date(`${ex.date}T00:00:00Z`).getTime())) {
            ctx.error(`${p}.date`, `${where}: Datum im Format JJJJ-MM-TT angeben.`);
          }
          checkHours(ctx, ex.hours ?? [], `${p}.hours`, where);
          checkString(ctx, ex.label, `${p}.label`, `${where} › Hinweis`, { max: 120 });
        });
      }
    }
  }
  if (s.seoDefaults !== undefined) {
    if (!isObj(s.seoDefaults)) ctx.error('settings.seoDefaults', `${W} › SEO-Standards sind ungültig.`);
    else {
      checkMediaRef(ctx, s.seoDefaults.ogImage, 'settings.seoDefaults.ogImage', `${W} › Standard-Vorschaubild`, false);
      if (s.seoDefaults.themeColor !== undefined && !/^#[0-9a-fA-F]{3,8}$/.test(String(s.seoDefaults.themeColor))) {
        ctx.error('settings.seoDefaults.themeColor', `${W} › Designfarbe: Farbwert wie #f4efe6 angeben.`);
      }
    }
  }
}

/* ------------------------------------------------------------------ Sammlungen ---------- */

function checkUniqueIds(ctx, list, path, where) {
  const ids = new Set();
  list.forEach((it, i) => {
    if (!isObj(it)) return;
    if (typeof it.id !== 'string' || !ID_RE.test(it.id)) ctx.error(`${path}.${i}.id`, `${where} Nr. ${i + 1}: interne Kennung ${q(it.id)} ist ungültig.`);
    else if (ids.has(it.id)) ctx.error(`${path}.${i}.id`, `${where} Nr. ${i + 1}: interne Kennung ${q(it.id)} ist doppelt vergeben.`);
    else ids.add(it.id);
  });
}

function checkCollections(ctx) {
  const c = ctx.doc.collections;
  if (!isObj(c)) {
    ctx.error('collections', 'Die Sammlungen fehlen.');
    return;
  }
  // Karte
  if (!Array.isArray(c.menu)) ctx.error('collections.menu', 'Karte: fehlt.');
  else {
    const slugs = new Set();
    c.menu.forEach((cat, i) => {
      const p = `collections.menu.${i}`;
      if (!isObj(cat)) return ctx.error(p, `Karte: Kategorie Nr. ${i + 1} ist ungültig.`);
      const where = `Karte › Kategorie ${q(cat.title || cat.slug || i + 1)}`;
      checkString(ctx, cat.title, `${p}.title`, `${where} › Titel`, { required: true, max: 80 });
      if (typeof cat.slug !== 'string' || !SLUG_SEGMENT_RE.test(cat.slug)) ctx.error(`${p}.slug`, `${where}: Adresse ${q(cat.slug)} ist ungültig (a–z, 0–9, -).`);
      else if (slugs.has(cat.slug)) ctx.error(`${p}.slug`, `${where}: Adresse ${q(cat.slug)} ist doppelt vergeben.`);
      else slugs.add(cat.slug);
      checkString(ctx, cat.intro, `${p}.intro`, `${where} › Einleitung`, { max: 1000 });
      checkString(ctx, cat.note, `${p}.note`, `${where} › Hinweis`, { max: 2000 });
      if (!Array.isArray(cat.items)) return ctx.error(`${p}.items`, `${where}: Einträge fehlen.`);
      cat.items.forEach((it, j) => {
        const ip = `${p}.items.${j}`;
        const iw = `${where} › ${q(it?.name || `Nr. ${j + 1}`)}`;
        if (!isObj(it)) return ctx.error(ip, `${iw}: Eintrag ist ungültig.`);
        checkString(ctx, it.name, `${ip}.name`, `${iw} › Name`, { required: true, max: 120 });
        checkString(ctx, it.description, `${ip}.description`, `${iw} › Beschreibung`, { max: 1000 });
        if (it.price !== undefined && it.price !== null && (typeof it.price !== 'number' || !Number.isFinite(it.price) || it.price < 0)) {
          ctx.error(`${ip}.price`, `${iw} › Preis: muss eine Zahl sein (z. B. 4.5).`);
        }
        checkString(ctx, it.priceSuffix, `${ip}.priceSuffix`, `${iw} › Preiszusatz`, { max: 40 });
        for (const k of ['tags', 'allergens']) {
          if (it[k] !== undefined && (!Array.isArray(it[k]) || it[k].some((x) => typeof x !== 'string'))) ctx.error(`${ip}.${k}`, `${iw}: ${k} ist ungültig.`);
        }
        // seasonal: Hinweistext („nach Jahreszeit“) oder ja/nein
        if (typeof it.seasonal === 'string') checkString(ctx, it.seasonal, `${ip}.seasonal`, `${iw} › Saison-Hinweis`, { max: 60 });
        else checkBool(ctx, it.seasonal, `${ip}.seasonal`, `${iw} › saisonal`);
      });
    });
  }
  // FAQ
  if (!Array.isArray(c.faq)) ctx.error('collections.faq', 'FAQ: fehlt.');
  else {
    checkUniqueIds(ctx, c.faq, 'collections.faq', 'FAQ › Frage');
    c.faq.forEach((f, i) => {
      const p = `collections.faq.${i}`;
      if (!isObj(f)) return ctx.error(p, `FAQ: Frage Nr. ${i + 1} ist ungültig.`);
      const where = `FAQ › ${q(short(f.question || `Nr. ${i + 1}`))}`;
      checkString(ctx, f.question, `${p}.question`, `${where} › Frage`, { required: true, max: 300 });
      checkString(ctx, f.answer, `${p}.answer`, `${where} › Antwort`, { required: true, max: 5000, kind: 'rich' });
      checkBool(ctx, f.visible, `${p}.visible`, `${where} › sichtbar`);
    });
  }
  // Gästestimmen
  if (!Array.isArray(c.testimonials)) ctx.error('collections.testimonials', 'Gästestimmen: fehlen.');
  else {
    checkUniqueIds(ctx, c.testimonials, 'collections.testimonials', 'Gästestimmen › Stimme');
    c.testimonials.forEach((t, i) => {
      const p = `collections.testimonials.${i}`;
      if (!isObj(t)) return ctx.error(p, `Gästestimmen: Eintrag Nr. ${i + 1} ist ungültig.`);
      const where = `Gästestimmen › ${q(t.author || `Nr. ${i + 1}`)}`;
      checkString(ctx, t.quote, `${p}.quote`, `${where} › Zitat`, { required: true, max: 1000 });
      checkString(ctx, t.author, `${p}.author`, `${where} › Name`, { max: 120 });
      checkBool(ctx, t.isPlaceholder, `${p}.isPlaceholder`, `${where} › Platzhalter`);
    });
  }
  // Aus der Backstube
  const hf = c.heuteFrisch;
  if (!isObj(hf)) ctx.error('collections.heuteFrisch', 'Aus der Backstube: fehlt.');
  else {
    if (hf.date !== undefined && hf.date !== '' && (typeof hf.date !== 'string' || !DATE_RE.test(hf.date))) {
      ctx.error('collections.heuteFrisch.date', 'Aus der Backstube › Datum: im Format JJJJ-MM-TT angeben.');
    }
    if (!Array.isArray(hf.items)) ctx.error('collections.heuteFrisch.items', 'Aus der Backstube: Einträge fehlen.');
    else {
      hf.items.forEach((it, i) => {
        const p = `collections.heuteFrisch.items.${i}`;
        if (!isObj(it)) return ctx.error(p, `Aus der Backstube: Eintrag Nr. ${i + 1} ist ungültig.`);
        const where = `Aus der Backstube › ${q(it.name || `Nr. ${i + 1}`)}`;
        checkString(ctx, it.name, `${p}.name`, `${where} › Name`, { required: true, max: 120 });
        checkString(ctx, it.note, `${p}.note`, `${where} › Notiz`, { max: 300 });
      });
    }
  }
  // Zusätzlich: Felddefinitionen aus src/cms/collections (Array → je Eintrag, Objekt → das Objekt)
  ctx.secondary = true;
  for (const [name, def] of Object.entries(ctx.defs.collections)) {
    const value = c[name];
    if (value === undefined || !Array.isArray(def?.fields)) continue;
    const where = def.label || COLLECTION_LABELS[name] || name;
    const labelKey = def.itemLabel ?? ['name', 'title', 'question', 'author'].find((k) => def.fields.some((f) => f.key === k));
    if (Array.isArray(value)) value.forEach((item, i) => checkFields(ctx, def.fields, item, `collections.${name}.${i}`, `${where} › ${itemName(item, labelKey, i)}`));
    else if (isObj(value)) checkFields(ctx, def.fields, value, `collections.${name}`, where);
  }
  ctx.secondary = false;
}

/* ------------------------------------------------------------------ Medien -------------- */

function checkMedia(ctx) {
  const media = ctx.doc.media;
  if (!Array.isArray(media)) {
    ctx.error('media', 'Die Medienbibliothek fehlt.');
    return new Set();
  }
  const ids = new Set();
  media.forEach((m, i) => {
    const p = `media.${i}`;
    if (!isObj(m)) return ctx.error(p, `Medienbibliothek: Eintrag Nr. ${i + 1} ist ungültig.`);
    const where = `Medienbibliothek › ${q(m.id || `Nr. ${i + 1}`)}`;
    if (typeof m.id !== 'string' || !ID_RE.test(m.id)) ctx.error(`${p}.id`, `${where}: interne Kennung ist ungültig.`);
    else if (ids.has(m.id)) ctx.error(`${p}.id`, `${where}: interne Kennung ist doppelt vergeben.`);
    else ids.add(m.id);
    if (!Object.hasOwn(MEDIA_FILE_RE, m.kind)) ctx.error(`${p}.kind`, `${where}: Art ${q(m.kind)} ist ungültig.`);
    else if (typeof m.file !== 'string' || !MEDIA_FILE_RE[m.kind].test(m.file)) ctx.error(`${p}.file`, `${where}: Dateiangabe ist ungültig.`);
    if (m.replacedBy !== undefined && m.replacedBy !== null && (typeof m.replacedBy !== 'string' || !MEDIA_FILE_RE.upload.test(m.replacedBy))) {
      ctx.error(`${p}.replacedBy`, `${where}: Ersatzbild-Angabe ist ungültig.`);
    }
    checkString(ctx, m.alt, `${p}.alt`, `${where} › Alternativtext`, { max: 300 });
    if (isBlank(m.alt)) ctx.warn(`${p}.alt`, `${where}: Alternativtext fehlt (wichtig für Barrierefreiheit und Suchmaschinen).`);
    for (const k of ['width', 'height']) {
      if (m[k] !== undefined && (!Number.isInteger(m[k]) || m[k] <= 0)) ctx.error(`${p}.${k}`, `${where}: ${k} ist ungültig.`);
    }
    if (ctx.mediaFiles) {
      for (const f of [m.kind === 'upload' ? m.file : null, m.replacedBy]) {
        if (typeof f === 'string' && f.startsWith('media/') && !ctx.mediaFiles.has(f)) {
          ctx.error(`${p}.file`, `${where}: Die Bilddatei fehlt auf dem Server — bitte das Bild neu hochladen.`);
        }
      }
    }
  });
  return ids;
}

function checkMediaExistence(ctx, ids) {
  for (const ref of collectMediaRefs(ctx.doc)) {
    if (ids.has(ref.id)) continue;
    ctx.error(ref.path, `${describePath(ctx.doc, ref.path, ctx.defs)}: Bild ${q(ref.id)} gibt es nicht in der Medienbibliothek.`);
  }
}

/* ------------------------------------------------------------------ Weiterleitungen ----- */

const REDIRECT_FROM_RE = /^\/[^\s?#\\<>"'`]*$/;

function checkRedirects(ctx) {
  const list = ctx.doc.redirects;
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    ctx.error('redirects', 'Weiterleitungen sind ungültig.');
    return;
  }
  const active = activePaths(ctx.doc);
  const map = new Map();
  list.forEach((r, i) => {
    const p = `redirects.${i}`;
    if (!isObj(r)) return ctx.error(p, `Weiterleitung Nr. ${i + 1} ist ungültig.`);
    const where = `Weiterleitung ${q(r.from || `Nr. ${i + 1}`)}`;
    const from = r.from;
    if (typeof from !== 'string' || !REDIRECT_FROM_RE.test(from) || from.startsWith('//') || from === '/' || from.endsWith('/') || len(from) > 300) {
      return ctx.error(`${p}.from`, `${where}: Die alte Adresse muss mit / beginnen (ohne ? und #, nicht die Startseite).`);
    }
    const first = from.split('/')[1];
    if (RESERVED_PREFIXES.includes(first)) return ctx.error(`${p}.from`, `${where}: ${q(`/${first}`)} ist für das System reserviert.`);
    if (map.has(from)) return ctx.error(`${p}.from`, `${where}: Für diese Adresse gibt es schon eine Weiterleitung.`);
    const to = r.to;
    const toOk =
      typeof to === 'string' &&
      len(to) <= 2000 &&
      ((to.startsWith('/') && !to.startsWith('//') && !/[\s\\<>"'`]/.test(to)) || (/^https:\/\//i.test(to) && !checkHref(to).error));
    if (!toOk) return ctx.error(`${p}.to`, `${where}: Das Ziel muss mit / beginnen oder eine https://-Adresse sein.`);
    if (to === from) return ctx.error(`${p}.to`, `${where}: Ziel und alte Adresse sind gleich.`);
    if (r.status !== 301 && r.status !== 302) ctx.error(`${p}.status`, `${where}: Art muss 301 (dauerhaft) oder 302 (vorübergehend) sein.`);
    if (active.has(from)) {
      ctx.warn(`${p}.from`, `${where}: Unter dieser Adresse gibt es eine aktive Seite — die Weiterleitung wird ignoriert.`);
      return;
    }
    map.set(from, { to: to.split(/[?#]/)[0], index: i });
  });
  // Schleifen (nur interne Ziele; ignorierte Weiterleitungen zählen nicht)
  const reported = new Set();
  for (const start of map.keys()) {
    const seen = [start];
    let cur = map.get(start).to;
    while (map.has(cur)) {
      if (seen.includes(cur)) {
        const cycle = seen.slice(seen.indexOf(cur));
        const key = [...cycle].sort().join('|');
        if (!reported.has(key)) {
          reported.add(key);
          ctx.error(`redirects.${map.get(cycle[0]).index}`, `Weiterleitungen bilden eine Schleife: ${[...cycle, cur].join(' → ')}.`);
        }
        break;
      }
      seen.push(cur);
      if (seen.length > 50) break;
      cur = map.get(cur).to;
    }
  }
}

/* ------------------------------------------------------------------ Einstieg ------------ */

/**
 * @param {import('./types').SiteDoc} doc
 * @param {{ sections?: Record<string, import('./types').SectionDefinition>, collections?: Record<string, import('./types').CollectionDefinition> }} defs
 * @param {{ mode?: 'draft'|'publish', mediaFiles?: Set<string> }} [opts]
 * @returns {{ errors: { path: string, message: string }[], warnings: { path: string, message: string }[] }}
 */
export function validateSiteDoc(doc, defs, opts = {}) {
  if (!isObj(doc)) return { errors: [{ path: '', message: 'Der Inhalt ist leer oder kein gültiges Dokument.' }], warnings: [] };
  const ctx = new Ctx(doc, defs, opts);
  if (!Number.isInteger(doc.schemaVersion) || doc.schemaVersion < 1) ctx.error('schemaVersion', 'Die Formatversion (schemaVersion) fehlt oder ist ungültig.');
  checkSettings(ctx);
  checkNavigation(ctx);
  checkLayout(ctx);
  checkPages(ctx);
  checkCollections(ctx);
  const ids = checkMedia(ctx);
  checkMediaExistence(ctx, ids);
  checkRedirects(ctx);
  return { errors: ctx.errors, warnings: ctx.warnings };
}
