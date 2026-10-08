/**
 * Formular-Engine: baut Eingabefelder aus Felddefinitionen (FieldDef) und schreibt Änderungen direkt
 * in das übergebene Objekt des Entwurfs. Jede Änderung meldet sich bei store.change() (Auto-Speichern)
 * und — im Seiteneditor — als Live-Nachricht an die Vorschau (sus-cms:set).
 *
 * Feldarten: text, textarea, rich, media, link, href, list, select, boolean, number, page, collection.
 * Fehleranzeige: jedes Feld hat einen Platz [data-err-path], den refreshErrors() aus den Prüfhinweisen füllt.
 */
import type { LinkValue, MediaRef } from '../cms/types';
import { mediaUrl } from './api';
import { COLLECTION_DEFS, VARIANT_LABELS, emptyItem, type AdminFieldDef } from './defs';
import { h, domId, icon, type Child } from './dom';
import { targetPicker } from './linkfield';
import { mediaById, mediaVersion, pickMedia, thumb } from './mediafield';
import { fillTokens, renderRich, resolveHref } from './rich';
import { store, type ChangeInfo, type LiveMsg } from './state';
import { btn, confirmDialog, iconBtn, openDialog } from './ui';
import { clone, formatNumber, isPlainObject, labelOf, moveItem, parseNumber, slugify, truncate, uniqueId, type PathSeg } from './util';

export interface FieldCtx {
  /** absoluter Pfad des Objekts, in dem die Felder liegen */
  path: PathSeg[];
  /** Seiteneditor: Sektion + Pfadpräfix innerhalb der Sektionsfelder (für die Live-Vorschau) */
  live?: { section: string; prefix: string };
  readOnly?: boolean;
  /** zusätzlich zu store.change() (z. B. Beschriftungen neu berechnen) */
  onChange?: (info: ChangeInfo) => void;
}

type Obj = Record<string, unknown>;

const errPath = (ctx: FieldCtx, key: string | number) => [...ctx.path, key].join('.');

function notify(ctx: FieldCtx, info: ChangeInfo): void {
  store.change(info);
  ctx.onChange?.(info);
}

function liveField(ctx: FieldCtx, key: string): string | null {
  return ctx.live ? `${ctx.live.section}:${ctx.live.prefix}${key}` : null;
}

function setVal(obj: Obj, key: string, v: unknown): void {
  if (v === undefined) delete obj[key];
  else obj[key] = v;
}

/* ------------------------------------------------------------------ Gerüst ---------------------- */

function wrapper(def: AdminFieldDef, ctx: FieldCtx, control: Child, opts: { labelFor?: string; prefixErrors?: boolean; asFieldset?: boolean; counter?: HTMLElement | null } = {}): HTMLElement {
  const helpId = def.help ? domId('help') : undefined;
  const ep = errPath(ctx, def.key);
  const label = opts.asFieldset
    ? h('legend', { class: 'ad-label' }, def.label, def.required ? h('span', { class: 'ad-req', title: 'Pflichtfeld' }, ' *') : null)
    : h('label', { class: 'ad-label', for: opts.labelFor }, def.label, def.required ? h('span', { class: 'ad-req', title: 'Pflichtfeld' }, ' *') : null);
  const el = h(
    opts.asFieldset ? 'fieldset' : 'div',
    {
      class: `ad-field ad-field--${def.kind}${def.width ? ` ad-field--${def.width}` : ''}`,
      dataset: { fieldPath: ctx.live ? `${ctx.live.prefix}${def.key}` : '', fieldKey: def.key },
    },
    h('div', { class: 'ad-field__top' }, label, opts.counter ?? null),
    def.help ? h('p', { id: helpId, class: 'ad-help' }, def.help) : null,
    control,
    h('div', { class: 'ad-errors', dataset: { errPath: ep, errPrefix: opts.prefixErrors ? '1' : '' }, 'aria-live': 'polite' }),
  ) as HTMLElement;
  if (helpId) {
    const ctl = el.querySelector('input,textarea,select');
    ctl?.setAttribute('aria-describedby', helpId);
  }
  return el;
}

function counterFor(def: AdminFieldDef, get: () => string): { el: HTMLElement | null; update: () => void } {
  if (!def.maxLength) return { el: null, update: () => {} };
  const el = h('span', { class: 'ad-counter', 'aria-hidden': 'true' });
  const update = () => {
    const n = get().length;
    el.textContent = `${n} / ${def.maxLength}`;
    el.classList.toggle('is-warn', n > (def.maxLength as number) * 0.9 && n <= (def.maxLength as number));
    el.classList.toggle('is-over', n > (def.maxLength as number));
  };
  update();
  return { el, update };
}

function autosize(ta: HTMLTextAreaElement): void {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight + 2, 560)}px`;
  };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
}

/* ------------------------------------------------------------------ Einzelfelder ---------------- */

function textField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  const id = domId();
  const multi = def.kind === 'textarea';
  const value = typeof obj[def.key] === 'string' ? (obj[def.key] as string) : obj[def.key] == null ? '' : String(obj[def.key]);
  const input = multi
    ? h('textarea', { id, class: 'ad-input ad-textarea', rows: '3', placeholder: def.placeholder })
    : h('input', { id, class: 'ad-input', type: def.input ?? 'text', placeholder: def.placeholder, autocomplete: 'off', spellcheck: def.input ? 'false' : 'true' });
  input.value = value;
  if (def.readOnly) input.readOnly = true;
  const counter = counterFor(def, () => input.value);
  input.addEventListener('input', () => {
    setVal(obj, def.key, input.value);
    counter.update();
    const field = liveField(ctx, def.key);
    notify(ctx, {
      structural: !field,
      live: field ? { field, kind: 'text', value: fillTokens(input.value, store.doc.settings) } : undefined,
    });
  });
  if (multi) autosize(input as HTMLTextAreaElement);
  return wrapper(def, ctx, input, { labelFor: id, counter: counter.el });
}

const RICH_HELP: [string, string][] = [
  ['Leerzeile', 'neuer Absatz'],
  ['Zeilenumbruch', 'neue Zeile im selben Absatz'],
  ['**Wort**', 'fett'],
  ['*Wort*', 'kursiv'],
  ['[Linktext](page:besuch)', 'Link auf eine Seite (oder https://…, mailto:…)'],
  ['{{phoneDisplay}}', 'Telefonnummer aus den Einstellungen (auch {{breakfastUntil}}, {{street}} …)'],
];

function richField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  const id = domId();
  const ta = h('textarea', { id, class: 'ad-input ad-textarea ad-textarea--rich', rows: '5', placeholder: def.placeholder });
  ta.value = typeof obj[def.key] === 'string' ? (obj[def.key] as string) : '';
  const counter = counterFor(def, () => ta.value);
  const previewBox = h('div', { class: 'ad-richpreview', hidden: true, 'aria-live': 'polite' });
  const renderPreview = () => {
    // Ergebnis des sicheren Renderers (escaped, nur p/br/strong/em/a) — einzige innerHTML-Stelle für Inhalte
    previewBox.innerHTML = renderRich(ta.value, store.doc, { blocks: true }) || '<p class="ad-help">(leer)</p>';
  };
  const commit = () => {
    setVal(obj, def.key, ta.value);
    counter.update();
    if (!previewBox.hidden) renderPreview();
    const field = liveField(ctx, def.key);
    notify(ctx, {
      structural: !field,
      live: field ? { field, kind: 'rich', value: ta.value, html: renderRich(ta.value, store.doc, { blocks: true }) } : undefined,
    });
  };
  ta.addEventListener('input', commit);
  autosize(ta);

  const wrap = (before: string, after: string, placeholder: string) => {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || placeholder;
    ta.setRangeText(`${before}${sel}${after}`, s, e, 'end');
    ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    ta.focus();
    commit();
  };
  const help = h(
    'div',
    { class: 'ad-richhelp', hidden: true },
    h('p', null, 'So formatierst du Text:'),
    h('dl', null, ...RICH_HELP.map(([code, text]) => [h('dt', null, h('code', null, code)), h('dd', null, text)])),
  );
  const toolbar = h(
    'div',
    { class: 'ad-richbar', role: 'toolbar', 'aria-label': `Formatierung für ${def.label}`, 'aria-controls': id },
    iconBtn('bold', 'Fett (markierten Text)', () => wrap('**', '**', 'fetter Text')),
    iconBtn('italic', 'Kursiv (markierten Text)', () => wrap('*', '*', 'kursiver Text')),
    iconBtn('link', 'Link einfügen', async () => {
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      const r = await linkDialog(ta.value.slice(s, e));
      if (!r) return;
      ta.setRangeText(`[${r.label}](${r.href})`, s, e, 'end');
      ta.focus();
      commit();
    }),
    h('span', { class: 'ad-richbar__sep', 'aria-hidden': 'true' }),
    btn('Vorschau', {
      kind: 'quiet',
      small: true,
      icon: 'eye',
      attrs: { 'aria-pressed': 'false' },
      onClick: (ev) => {
        previewBox.hidden = !previewBox.hidden;
        (ev.currentTarget as HTMLElement).setAttribute('aria-pressed', String(!previewBox.hidden));
        if (!previewBox.hidden) renderPreview();
      },
    }),
    btn('Hilfe', {
      kind: 'quiet',
      small: true,
      icon: 'help',
      attrs: { 'aria-expanded': 'false' },
      onClick: (ev) => {
        help.hidden = !help.hidden;
        (ev.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!help.hidden));
      },
    }),
  );
  return wrapper(def, ctx, h('div', { class: 'ad-rich' }, toolbar, help, ta, previewBox), { labelFor: id, counter: counter.el });
}

/** kleiner Dialog: Linktext + Ziel → [Text](Ziel) */
async function linkDialog(selected: string): Promise<{ label: string; href: string } | null> {
  const d = openDialog({ title: 'Link einfügen', size: 'md' });
  let href = '';
  const labelId = domId();
  const label = h('input', { id: labelId, class: 'ad-input', type: 'text', value: selected, autocomplete: 'off' });
  const err = h('p', { class: 'ad-errors', 'aria-live': 'polite' });
  d.body.append(
    h('div', { class: 'ad-field' }, h('label', { class: 'ad-label', for: labelId }, 'Linktext'), label),
    h('div', { class: 'ad-field' }, h('p', { class: 'ad-label' }, 'Ziel'), targetPicker('', (v) => (href = v))),
    err,
  );
  d.footer.append(
    btn('Abbrechen', { kind: 'quiet', onClick: () => d.close(null) }),
    btn('Einfügen', {
      kind: 'primary',
      onClick: () => {
        if (!label.value.trim() || !href) {
          err.textContent = 'Bitte Linktext und Ziel angeben.';
          return;
        }
        d.close({ label: label.value.trim().replace(/[[\]]/g, ''), href });
      },
    }),
  );
  label.focus();
  return (await d.closed) as { label: string; href: string } | null;
}

function numberField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  const id = domId();
  const input = h('input', { id, class: 'ad-input ad-input--num', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: formatNumber(obj[def.key]) });
  const local = h('p', { class: 'ad-errors', 'aria-live': 'polite' });
  const range = def.min !== undefined || def.max !== undefined ? `${def.min !== undefined ? `ab ${formatNumber(def.min)}` : ''}${def.min !== undefined && def.max !== undefined ? ' ' : ''}${def.max !== undefined ? `bis ${formatNumber(def.max)}` : ''}` : '';
  if (range) input.setAttribute('placeholder', range);
  input.addEventListener('input', () => {
    const n = parseNumber(input.value);
    if (Number.isNaN(n)) {
      local.textContent = 'Bitte eine Zahl eingeben (z. B. 4,80).';
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    local.textContent = '';
    input.removeAttribute('aria-invalid');
    setVal(obj, def.key, n);
    notify(ctx, { structural: true });
  });
  input.addEventListener('blur', () => {
    const n = parseNumber(input.value);
    if (n !== undefined && !Number.isNaN(n)) input.value = formatNumber(n);
  });
  return wrapper(def, ctx, h('div', null, input, local), { labelFor: id });
}

function booleanField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  const id = domId();
  const cur = obj[def.key];
  const checked = def.key === 'visible' ? cur !== false : Boolean(cur);
  const input = h('input', { id, type: 'checkbox', class: 'ad-switch__input', checked, role: 'switch' });
  input.addEventListener('change', () => {
    setVal(obj, def.key, input.checked);
    notify(ctx, { structural: true });
  });
  const helpId = def.help ? domId('help') : undefined;
  if (helpId) input.setAttribute('aria-describedby', helpId);
  return h(
    'div',
    { class: 'ad-field ad-field--boolean', dataset: { fieldPath: ctx.live ? `${ctx.live.prefix}${def.key}` : '', fieldKey: def.key } },
    h('label', { class: 'ad-switch', for: id }, input, h('span', { class: 'ad-switch__track', 'aria-hidden': 'true' }), h('span', { class: 'ad-switch__label' }, def.label)),
    def.help ? h('p', { id: helpId, class: 'ad-help ad-help--indent' }, def.help) : null,
    h('div', { class: 'ad-errors', dataset: { errPath: errPath(ctx, def.key), errPrefix: '' } }),
  );
}

function selectField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx, options: { value: string; label: string }[], allowEmpty = !def.required): HTMLElement {
  const id = domId();
  const cur = obj[def.key] == null ? '' : String(obj[def.key]);
  const sel = h(
    'select',
    { id, class: 'ad-input' },
    allowEmpty && !options.some((o) => o.value === '') ? h('option', { value: '' }, def.placeholder ?? '– keine Auswahl –') : null,
    ...options.map((o) => h('option', { value: o.value, selected: o.value === cur }, o.label)),
  );
  if (cur && !options.some((o) => o.value === cur)) sel.append(h('option', { value: cur, selected: true }, `${cur} (aktueller Wert)`));
  sel.addEventListener('change', () => {
    setVal(obj, def.key, sel.value === '' ? undefined : sel.value);
    notify(ctx, { structural: true });
  });
  return wrapper(def, ctx, sel, { labelFor: id });
}

function pageField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  const opts = store.doc.pages.filter((p) => !p.system).map((p) => ({ value: p.id, label: `${p.title} (/${p.slug})` }));
  return selectField(def, obj, ctx, opts);
}

function collectionField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  const opts = def.options?.length ? def.options : Object.values(COLLECTION_DEFS).map((c) => ({ value: c.name, label: c.label }));
  return selectField(def, obj, ctx, opts);
}

function hrefField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  const picker = targetPicker(typeof obj[def.key] === 'string' ? (obj[def.key] as string) : '', (href) => {
    setVal(obj, def.key, href);
    const field = liveField(ctx, def.key);
    notify(ctx, { live: field ? { field, kind: 'link', value: undefined, href: resolveHref(href, store.doc) } : undefined });
  }, { label: def.label, required: def.required });
  return wrapper(def, ctx, picker, { asFieldset: true, prefixErrors: true });
}

function linkField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  if (!isPlainObject(obj[def.key])) obj[def.key] = { label: '', href: '' };
  const link = obj[def.key] as unknown as LinkValue;
  const labelId = domId();
  const field = liveField(ctx, def.key);
  const send = (structural = false) => {
    notify(ctx, {
      structural,
      live:
        field && !structural
          ? { field, kind: 'link', value: fillTokens(link.label ?? '', store.doc.settings), href: resolveHref(link.href, store.doc), visible: link.visible !== false && Boolean(link.label), newTab: Boolean(link.newTab) }
          : undefined,
    });
  };
  const label = h('input', { id: labelId, class: 'ad-input', type: 'text', value: link.label ?? '', autocomplete: 'off' });
  const counter = counterFor({ ...def, maxLength: def.maxLength ?? 60 }, () => label.value);
  label.addEventListener('input', () => {
    link.label = label.value;
    counter.update();
    send();
  });
  const newTabId = domId();
  const newTab = h('input', { id: newTabId, type: 'checkbox', checked: Boolean(link.newTab) });
  newTab.addEventListener('change', () => {
    if (newTab.checked) link.newTab = true;
    else delete link.newTab;
    send(true);
  });
  const visId = domId();
  const vis = h('input', { id: visId, type: 'checkbox', checked: link.visible !== false });
  vis.addEventListener('change', () => {
    if (vis.checked) delete link.visible;
    else link.visible = false;
    send();
  });
  let variant: HTMLElement | null = null;
  if (def.variants?.length) {
    const vid = domId();
    const sel = h(
      'select',
      { id: vid, class: 'ad-input' },
      h('option', { value: '', selected: !link.variant }, 'Standard (wie vorgesehen)'),
      ...def.variants.map((v) => h('option', { value: v, selected: link.variant === v }, VARIANT_LABELS[v] ?? v)),
    );
    if (link.variant && !def.variants.includes(link.variant)) sel.append(h('option', { value: link.variant, selected: true }, VARIANT_LABELS[link.variant] ?? link.variant));
    sel.addEventListener('change', () => {
      if (sel.value) link.variant = sel.value as LinkValue['variant'];
      else delete link.variant;
      send(true);
    });
    variant = h('div', { class: 'ad-sub' }, h('label', { class: 'ad-sublabel', for: vid }, 'Aussehen'), sel);
  }
  const control = h(
    'div',
    { class: 'ad-linkbox' },
    h('div', { class: 'ad-sub' }, h('div', { class: 'ad-field__top' }, h('label', { class: 'ad-sublabel', for: labelId }, 'Text'), counter.el), label),
    h('div', { class: 'ad-sub' }, h('span', { class: 'ad-sublabel' }, 'Ziel'), targetPicker(link.href ?? '', (href) => {
      link.href = href;
      send();
    }, { label: `${def.label} – Ziel`, required: Boolean(link.label) })),
    h(
      'div',
      { class: 'ad-checks' },
      h('label', { class: 'ad-check', for: visId }, vis, ' Sichtbar'),
      h('label', { class: 'ad-check', for: newTabId }, newTab, ' In neuem Tab öffnen'),
    ),
    variant,
  );
  return wrapper(def, ctx, control, { asFieldset: true, prefixErrors: true });
}

function mediaField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  const idOnly = def.idOnly || typeof obj[def.key] === 'string';
  const box = h('div', { class: 'ad-mediafield' });
  const currentId = (): string | null => {
    const v = obj[def.key];
    if (typeof v === 'string') return v || null;
    if (isPlainObject(v) && typeof v.media === 'string') return v.media || null;
    return null;
  };
  const sendLive = () => {
    const field = liveField(ctx, def.key);
    const id = currentId();
    if (!field) return notify(ctx, { structural: true });
    if (!id) return notify(ctx, { structural: true });
    const m = mediaById(id);
    const ref = obj[def.key];
    const alt = (isPlainObject(ref) && typeof ref.alt === 'string' && ref.alt.trim()) || m?.alt || '';
    notify(ctx, { live: { field, kind: 'media', value: id, src: mediaUrl(id, 1600, mediaVersion(m)), alt } });
  };
  const render = () => {
    const id = currentId();
    const m = mediaById(id);
    const ref = obj[def.key] as MediaRef | undefined;
    box.replaceChildren();
    const choose = btn(id ? 'Anderes Bild wählen' : 'Bild wählen', {
      kind: 'secondary',
      small: true,
      icon: 'image',
      onClick: async () => {
        const picked = await pickMedia(id);
        if (!picked) return;
        if (idOnly) obj[def.key] = picked;
        else obj[def.key] = { ...(isPlainObject(obj[def.key]) ? (obj[def.key] as Obj) : {}), media: picked };
        render();
        sendLive();
      },
    });
    const remove =
      id && !def.required
        ? btn('Entfernen', {
            kind: 'quiet',
            small: true,
            icon: 'close',
            onClick: () => {
              if (idOnly) delete obj[def.key];
              else obj[def.key] = null;
              render();
              notify(ctx, { structural: true });
            },
          })
        : null;
    box.append(
      h(
        'div',
        { class: 'ad-mediafield__row' },
        id ? h('div', { class: 'ad-mediafield__thumb' }, thumb(id, 320, '')) : h('div', { class: 'ad-mediafield__thumb is-empty' }, icon('image')),
        h(
          'div',
          { class: 'ad-mediafield__info' },
          id ? h('p', { class: 'ad-mediafield__name' }, m ? truncate(m.alt || id, 90) : `„${id}“ fehlt in der Bibliothek`) : h('p', { class: 'ad-help' }, 'Kein Bild gewählt.'),
          m?.kind === 'placeholder' && !m.replacedBy ? h('span', { class: 'ad-badge ad-badge--warn' }, 'Platzhalter') : null,
          h('div', { class: 'ad-mediafield__actions' }, choose, remove),
        ),
      ),
    );
    if (id && !idOnly) {
      const altId = domId();
      const alt = h('input', {
        id: altId,
        class: 'ad-input',
        type: 'text',
        value: ref?.alt ?? '',
        placeholder: m?.alt ? `leer = „${truncate(m.alt, 70)}“` : 'Bildbeschreibung',
        autocomplete: 'off',
      });
      alt.addEventListener('input', () => {
        const cur = obj[def.key] as Obj;
        if (alt.value.trim()) cur.alt = alt.value;
        else delete cur.alt;
        sendLive();
      });
      box.append(
        h(
          'div',
          { class: 'ad-sub' },
          h('label', { class: 'ad-sublabel', for: altId }, 'Bildbeschreibung (Alt-Text) nur für diese Stelle'),
          alt,
          h('p', { class: 'ad-help' }, 'Für blinde Menschen und Suchmaschinen. Leer lassen = Beschreibung aus der Medienbibliothek.'),
        ),
      );
    }
  };
  render();
  return wrapper(def, ctx, box, { asFieldset: true, prefixErrors: true });
}

/* ------------------------------------------------------------------ Listen ---------------------- */

/** Liste von Texten: mit options als Mehrfachauswahl, sonst als Chips */
function stringListField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  if (!Array.isArray(obj[def.key])) obj[def.key] = [];
  const arr = obj[def.key] as string[];
  if (def.options?.length) {
    const box = h(
      'div',
      { class: 'ad-checkgrid' },
      ...def.options.map((o) => {
        const id = domId();
        const cb = h('input', { id, type: 'checkbox', checked: arr.includes(o.value) });
        cb.addEventListener('change', () => {
          const order = def.options!.map((x) => x.value);
          const set = new Set(arr);
          if (cb.checked) set.add(o.value);
          else set.delete(o.value);
          const next = [...set].sort((a, b) => order.indexOf(a) - order.indexOf(b));
          arr.splice(0, arr.length, ...next);
          notify(ctx, { structural: true });
        });
        return h('label', { class: 'ad-check', for: id }, cb, ` ${o.label}`);
      }),
    );
    for (const v of arr) if (!def.options.some((o) => o.value === v)) box.append(h('span', { class: 'ad-badge' }, v));
    return wrapper(def, ctx, box, { asFieldset: true });
  }
  const chips = h('div', { class: 'ad-chips' });
  const id = domId();
  const input = h('input', { id, class: 'ad-input', type: 'text', placeholder: 'Neuer Eintrag + Enter', autocomplete: 'off' });
  const render = () =>
    chips.replaceChildren(
      ...arr.map((v, i) =>
        h('span', { class: 'ad-chip' }, v, iconBtn('close', `„${v}“ entfernen`, () => {
          arr.splice(i, 1);
          render();
          notify(ctx, { structural: true });
        })),
      ),
    );
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = input.value.trim();
    if (v && !arr.includes(v)) {
      arr.push(v);
      render();
      notify(ctx, { structural: true });
    }
    input.value = '';
  });
  render();
  return wrapper(def, ctx, h('div', null, chips, input), { labelFor: id });
}

function itemTitle(def: AdminFieldDef, item: unknown, i: number): string {
  if (isPlainObject(item) && def.itemLabel) {
    const v = labelOf(item[def.itemLabel]);
    if (v) return truncate(fillTokens(v, store.doc.settings), 70);
  }
  return `Eintrag ${i + 1}`;
}

export function openItem(item: Element): void {
  const body = item.querySelector<HTMLElement>(':scope > .ad-item__body');
  const toggle = item.querySelector<HTMLElement>(':scope > .ad-item__head .ad-item__toggle');
  if (body) body.hidden = false;
  toggle?.setAttribute('aria-expanded', 'true');
  item.classList.add('is-open');
}

const openState = new WeakMap<object, Set<unknown>>();
/** In dieser Sitzung neu angelegte Einträge: ihre ID folgt der Beschriftung (z. B. „gibt-es-parkplaetze“) */
const autoIds = new WeakSet<object>();
const ID_BASES: Record<string, string> = {
  main: 'menuepunkt',
  children: 'unterpunkt',
  footer: 'link',
  legal: 'link',
  social: 'profil',
  faq: 'frage',
  testimonials: 'stimme',
};

function listField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  if (!def.of) return stringListField(def, obj, ctx);
  if (!Array.isArray(obj[def.key])) obj[def.key] = [];
  const arr = obj[def.key] as Obj[];
  // offene Einträge über Neuaufbau hinweg merken (pro Array, per Objektreferenz)
  if (!openState.has(arr)) openState.set(arr, new Set(arr.length <= 2 ? arr : []));
  const open = openState.get(arr)!;
  const items = h('div', { class: 'ad-list__items' });
  const sr = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const addBtn = btn(def.addLabel ?? 'Eintrag hinzufügen', { kind: 'ghost', small: true, icon: 'plus', attrs: { 'aria-label': `${def.label}: ${def.addLabel ?? 'Eintrag hinzufügen'}` } });
  const countEl = h('span', { class: 'ad-counter' });
  const needsIds = () => def.itemIds || arr.some((x) => isPlainObject(x) && typeof x.id === 'string');
  const listPath = [...ctx.path, def.key];
  let dragFrom = -1;

  const changed = (msg?: string) => {
    render();
    notify(ctx, { structural: true });
    if (msg) sr.textContent = msg;
  };

  const render = () => {
    countEl.textContent = def.max ? `${arr.length} / ${def.max}` : String(arr.length);
    addBtn.disabled = def.max !== undefined && arr.length >= def.max;
    items.replaceChildren(
      ...arr.map((item, i) => {
        const titleEl = h('span', { class: 'ad-item__title' }, itemTitle(def, item, i));
        const isOpen = open.has(item);
        const bodyId = domId('item');
        const toggle = h(
          'button',
          { type: 'button', class: 'ad-item__toggle', 'aria-expanded': String(isOpen), 'aria-controls': bodyId },
          icon('chevronRight', 'ad-icon ad-item__chev'),
          titleEl,
        );
        const isHidden = isPlainObject(item) && item.visible === false;
        const body = h('div', { class: 'ad-item__body', id: bodyId, hidden: !isOpen });
        const itemCtx: FieldCtx = {
          ...ctx,
          path: [...listPath, i],
          live: ctx.live ? { section: ctx.live.section, prefix: `${ctx.live.prefix}${def.key}.${i}.` } : undefined,
          onChange: (info) => {
            relabel();
            if (autoIds.has(item) && def.itemLabel) {
              const lbl = labelOf(item[def.itemLabel]);
              const others = arr.filter((x) => x !== item).map((x) => String(x.id ?? ''));
              if (lbl) item.id = uniqueId(slugify(lbl, 40) || ID_BASES[def.key] || 'eintrag', others);
            }
            ctx.onChange?.(info);
          },
        };
        if (isOpen) body.append(renderFields(def.of as AdminFieldDef[], item, itemCtx));
        toggle.addEventListener('click', () => {
          const nowOpen = body.hidden;
          if (nowOpen && !body.childElementCount) body.append(renderFields(def.of as AdminFieldDef[], item, itemCtx));
          body.hidden = !nowOpen;
          toggle.setAttribute('aria-expanded', String(nowOpen));
          el.classList.toggle('is-open', nowOpen);
          if (nowOpen) open.add(item);
          else open.delete(item);
        });
        const grip = h('span', { class: 'ad-item__grip', title: 'Ziehen zum Sortieren', 'aria-hidden': 'true' }, icon('grip'));
        const canDel = def.min === undefined || arr.length > def.min;
        const el = h(
          'div',
          {
            class: `ad-item${isOpen ? ' is-open' : ''}${isHidden ? ' is-hidden' : ''}`,
            dataset: { index: String(i), fieldPath: ctx.live ? `${ctx.live.prefix}${def.key}.${i}` : '' },
          },
          h(
            'div',
            { class: 'ad-item__head' },
            grip,
            toggle,
            isHidden ? h('span', { class: 'ad-badge' }, 'ausgeblendet') : null,
            h('span', { class: 'ad-item__err', dataset: { errCount: [...listPath, i].join('.') } }),
            h(
              'div',
              { class: 'ad-item__tools' },
              iconBtn('up', `„${itemTitle(def, item, i)}“ nach oben`, () => {
                moveItem(arr, i, i - 1);
                changed(`Nach oben verschoben, jetzt Position ${i}.`);
                focusTool(i - 1, 0);
              }, { disabled: i === 0 }),
              iconBtn('down', `„${itemTitle(def, item, i)}“ nach unten`, () => {
                moveItem(arr, i, i + 1);
                changed(`Nach unten verschoben, jetzt Position ${i + 2}.`);
                focusTool(i + 1, 1);
              }, { disabled: i === arr.length - 1 }),
              iconBtn('copy', `„${itemTitle(def, item, i)}“ duplizieren`, () => {
                const copy = clone(item);
                if (needsIds() && isPlainObject(copy)) copy.id = uniqueId(String(copy.id || ID_BASES[def.key] || 'eintrag'), arr.map((x) => String(x.id ?? '')));
                arr.splice(i + 1, 0, copy);
                open.add(copy);
                changed('Eintrag dupliziert.');
              }, { disabled: def.max !== undefined && arr.length >= def.max }),
              iconBtn('trash', `„${itemTitle(def, item, i)}“ löschen`, async () => {
                const ok = await confirmDialog({
                  title: 'Eintrag löschen?',
                  message: `„${itemTitle(def, item, i)}“ wird aus „${def.label}“ entfernt. Bis zum Veröffentlichen kannst du das mit „Entwurf verwerfen“ rückgängig machen.`,
                  confirm: 'Löschen',
                  danger: true,
                });
                if (!ok) return;
                arr.splice(i, 1);
                changed('Eintrag gelöscht.');
                addBtn.focus();
              }, { danger: true, disabled: !canDel }),
            ),
          ),
          body,
        );
        /** Beschriftung + Werkzeug-Labels nachziehen, wenn sich der benennende Text ändert */
        function relabel(): void {
          const t = itemTitle(def, item, i);
          titleEl.textContent = t;
          const verbs = ['nach oben', 'nach unten', 'duplizieren', 'löschen'];
          el.querySelectorAll(':scope > .ad-item__head > .ad-item__tools > button').forEach((b, k) => {
            b.setAttribute('aria-label', `„${t}“ ${verbs[k]}`);
            b.setAttribute('title', `„${t}“ ${verbs[k]}`);
          });
        }
        // Drag & Drop nur über den Griff (Texteingaben bleiben markierbar)
        grip.addEventListener('mousedown', () => el.setAttribute('draggable', 'true'));
        grip.addEventListener('touchstart', () => el.setAttribute('draggable', 'true'), { passive: true });
        el.addEventListener('dragstart', (e) => {
          if (el.getAttribute('draggable') !== 'true') return e.preventDefault();
          e.stopPropagation();
          dragFrom = i;
          el.classList.add('is-dragging');
          e.dataTransfer?.setData('text/plain', String(i));
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });
        el.addEventListener('dragend', () => {
          el.removeAttribute('draggable');
          el.classList.remove('is-dragging');
          items.querySelectorAll('.is-drop-before,.is-drop-after').forEach((x) => x.classList.remove('is-drop-before', 'is-drop-after'));
        });
        el.addEventListener('dragover', (e) => {
          if (dragFrom < 0) return;
          e.preventDefault();
          e.stopPropagation();
          const r = el.getBoundingClientRect();
          const after = e.clientY > r.top + r.height / 2;
          el.classList.toggle('is-drop-after', after);
          el.classList.toggle('is-drop-before', !after);
        });
        el.addEventListener('dragleave', () => el.classList.remove('is-drop-before', 'is-drop-after'));
        el.addEventListener('drop', (e) => {
          if (dragFrom < 0) return;
          e.preventDefault();
          e.stopPropagation();
          const r = el.getBoundingClientRect();
          const after = e.clientY > r.top + r.height / 2;
          let to = after ? i + 1 : i;
          if (dragFrom < to) to -= 1;
          const from = dragFrom;
          dragFrom = -1;
          if (from !== to) {
            moveItem(arr, from, to);
            changed(`Eintrag auf Position ${to + 1} verschoben.`);
          } else render();
        });
        return el;
      }),
    );
    if (!arr.length) items.append(h('p', { class: 'ad-help ad-list__empty' }, 'Noch keine Einträge.'));
  };

  const focusTool = (index: number, tool: number) => {
    const el = items.querySelector(`:scope > .ad-item[data-index="${index}"] .ad-item__tools`);
    const b = el?.querySelectorAll('button')[tool] as HTMLButtonElement | undefined;
    (b && !b.disabled ? b : (el?.querySelector('button:not([disabled])') as HTMLButtonElement | null))?.focus();
  };

  addBtn.addEventListener('click', () => {
    const item = emptyItem(def.of);
    if (needsIds()) {
      item.id = uniqueId(ID_BASES[def.key] ?? 'eintrag', arr.map((x) => String(x.id ?? '')));
      autoIds.add(item);
    }
    arr.push(item);
    open.add(item);
    changed('Eintrag hinzugefügt.');
    const last = items.querySelector<HTMLElement>(':scope > .ad-item:last-of-type');
    last?.querySelector<HTMLElement>('input,textarea,select')?.focus();
  });

  render();
  const helpId = def.help ? domId('help') : undefined;
  return h(
    'fieldset',
    { class: 'ad-field ad-field--list ad-list', dataset: { fieldPath: ctx.live ? `${ctx.live.prefix}${def.key}` : '', fieldKey: def.key }, 'aria-describedby': helpId },
    h('legend', { class: 'ad-label' }, def.label, ' ', countEl),
    def.help ? h('p', { id: helpId, class: 'ad-help' }, def.help) : null,
    h('div', { class: 'ad-errors', dataset: { errPath: listPath.join('.'), errPrefix: '' } }),
    items,
    h('div', { class: 'ad-list__foot' }, addBtn),
    sr,
  );
}

/* ------------------------------------------------------------------ öffentlich ------------------- */

export function renderField(def: AdminFieldDef, obj: Obj, ctx: FieldCtx): HTMLElement {
  switch (def.kind) {
    case 'text':
    case 'textarea':
      return textField(def, obj, ctx);
    case 'rich':
      return richField(def, obj, ctx);
    case 'number':
      return numberField(def, obj, ctx);
    case 'boolean':
      return booleanField(def, obj, ctx);
    case 'select':
      return selectField(def, obj, ctx, def.options ?? [], !def.required);
    case 'page':
      return pageField(def, obj, ctx);
    case 'collection':
      return collectionField(def, obj, ctx);
    case 'href':
      return hrefField(def, obj, ctx);
    case 'link':
      return linkField(def, obj, ctx);
    case 'media':
      return mediaField(def, obj, ctx);
    case 'list':
      return listField(def, obj, ctx);
    default:
      return h('p', { class: 'ad-help' }, `Feldart „${String((def as AdminFieldDef).kind)}“ wird noch nicht unterstützt.`);
  }
}

export function renderFields(defs: AdminFieldDef[], obj: Obj, ctx: FieldCtx): HTMLElement {
  const box = h('div', { class: 'ad-fields' }, ...defs.map((d) => renderField(d, obj, ctx)));
  queueMicrotask(() => refreshErrors(box));
  return box;
}

/** Fehlerplätze im Container aus den aktuellen Prüfhinweisen füllen */
export function refreshErrors(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-err-path]').forEach((slot) => {
    const issues = store.issuesAt(slot.dataset.errPath ?? '', slot.dataset.errPrefix === '1');
    slot.replaceChildren(
      ...issues.map((i) => h('p', { class: `ad-err ad-err--${i.level}` }, icon(i.level === 'error' ? 'alert' : 'help'), i.message)),
    );
    const field = slot.closest('.ad-field');
    const ctl = field?.querySelector(':scope > input, :scope > textarea, :scope > select, :scope > .ad-rich > textarea');
    if (ctl) {
      if (issues.some((i) => i.level === 'error')) ctl.setAttribute('aria-invalid', 'true');
      else ctl.removeAttribute('aria-invalid');
    }
    field?.classList.toggle('has-error', issues.some((i) => i.level === 'error'));
  });
  root.querySelectorAll<HTMLElement>('[data-err-count]').forEach((slot) => {
    const n = store.issuesAt(slot.dataset.errCount ?? '', true).filter((i) => i.level === 'error').length;
    slot.replaceChildren(n ? h('span', { class: 'ad-badge ad-badge--error', title: `${n} Fehler in diesem Eintrag` }, icon('alert'), String(n)) : '');
  });
}

/** Feld im Formular finden, aufklappen, hinscrollen, fokussieren (z. B. nach Klick in der Vorschau) */
export function focusFieldPath(root: HTMLElement, fieldPath: string): boolean {
  let p = fieldPath;
  let target: HTMLElement | null = null;
  while (p) {
    target = root.querySelector<HTMLElement>(`[data-field-path="${CSS.escape(p)}"]`);
    if (target) break;
    // Liste noch zugeklappt? Eintrag öffnen und erneut suchen
    const parts = p.split('.');
    let opened = false;
    for (let k = parts.length - 1; k > 0; k--) {
      const item = root.querySelector<HTMLElement>(`.ad-item[data-field-path="${CSS.escape(parts.slice(0, k).join('.'))}"]`);
      if (item && !item.classList.contains('is-open')) {
        item.querySelector<HTMLButtonElement>(':scope > .ad-item__head .ad-item__toggle')?.click();
        opened = true;
        break;
      }
    }
    if (opened) continue;
    p = p.includes('.') ? p.slice(0, p.lastIndexOf('.')) : '';
  }
  if (!target) return false;
  let anc: HTMLElement | null = target;
  while ((anc = anc.parentElement?.closest('.ad-item') ?? null)) if (!anc.classList.contains('is-open')) openItem(anc);
  if (target.classList.contains('ad-item') && !target.classList.contains('is-open')) target.querySelector<HTMLButtonElement>(':scope > .ad-item__head .ad-item__toggle')?.click();
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.remove('ad-flash');
  void target.offsetWidth;
  target.classList.add('ad-flash');
  const ctl = target.querySelector<HTMLElement>('input:not([type=checkbox]),textarea,select') ?? target.querySelector<HTMLElement>('input,button');
  ctl?.focus({ preventScroll: true });
  return true;
}

export type { LiveMsg };
