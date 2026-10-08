/**
 * Editor-Brücke — läuft in jeder Seite des Vorschau-/Editor-Builds (eingebunden über
 * src/cms/EditBridge.astro), aktiv aber nur im iframe des Seiteneditors (`?__cms=editor`).
 *
 * Protokoll (docs/CMS-PLAN.md §8), nur same-origin:
 *   → Admin  { type:'sus-cms:ready' }
 *            { type:'sus-cms:select', field:'<sektionId>:<pfad>', section:'<sektionId>' }
 *   ← Admin  { type:'sus-cms:set', field, kind:'text'|'rich'|'media'|'link', value, html?, src?, href?, alt?, visible? }
 *            { type:'sus-cms:focus', section, scroll? }
 *
 * Markierungen im Markup: [data-cms-section] auf dem Sektions-Wurzelelement, [data-cms-field] +
 * [data-cms-kind] auf jedem editierbaren Element (src/cms/index.ts → editSection/editAttrs).
 * Sicherheit: `html` stammt ausschließlich aus dem sicheren rich-Renderer des Dashboards; Nachrichten
 * anderer Herkunft werden ignoriert.
 */

type Kind = 'text' | 'rich' | 'media' | 'link';

interface SetMsg {
  type: 'sus-cms:set';
  field: string;
  kind: Kind;
  value?: unknown;
  html?: string;
  src?: string;
  href?: string;
  alt?: string;
  visible?: boolean;
  newTab?: boolean;
}

const STYLE = `
[data-cms-section]{cursor:pointer;transition:outline-color .15s}
[data-cms-section].sus-cms-hover{outline:2px dashed rgba(62,92,99,.55);outline-offset:-2px}
[data-cms-section].sus-cms-selected{outline:3px solid #3e5c63;outline-offset:-3px}
[data-cms-field].sus-cms-hover{outline:2px solid #e07a1f;outline-offset:3px;border-radius:2px}
[data-cms-field]:empty::before{content:'(leer)';opacity:.45;font-style:italic}
.sus-cms-flash{animation:sus-cms-flash 1.4s ease-out}
@keyframes sus-cms-flash{0%{box-shadow:0 0 0 6px rgba(224,122,31,.55)}100%{box-shadow:0 0 0 6px rgba(224,122,31,0)}}
.sus-cms-label{position:fixed;z-index:2147483647;pointer-events:none;font:12px/1.2 ui-monospace,monospace;background:#241b14;color:#f7f2e8;padding:3px 6px;border-radius:3px;white-space:nowrap;transform:translateY(-100%)}
`;

function isEditorFrame(): boolean {
  try {
    return window.parent !== window && new URLSearchParams(location.search).has('__cms');
  } catch {
    return false;
  }
}

function cssEscape(s: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
}

/** Ersten sichtbaren Textknoten ersetzen (Icons/Pfeile in Buttons bleiben erhalten) */
function setLabel(el: Element, text: string): void {
  if (!el.children.length) {
    el.textContent = text;
    return;
  }
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const node = walker.nextNode();
  if (node) {
    const v = node.nodeValue ?? '';
    const lead = v.match(/^\s*/)?.[0] ?? '';
    const trail = v.match(/\s*$/)?.[0] ?? '';
    node.nodeValue = `${lead}${text}${trail}`;
  } else el.insertBefore(document.createTextNode(text), el.firstChild);
}

/**
 * rich-HTML an das Zielelement anpassen: Hat das Element Absätze (<p>), bleiben sie (Klassen des
 * bisherigen ersten <p> werden übernommen); sonst werden die Absätze zu Zeilenumbrüchen. Link-Klassen
 * des bisherigen Inhalts gehen auf neue Links über.
 */
function applyRich(el: Element, html: string): void {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const oldP = el.querySelector(':scope > p');
  const oldA = el.querySelector('a[class]');
  const frag = tpl.content;
  if (oldA) frag.querySelectorAll('a:not([class])').forEach((a) => a.setAttribute('class', oldA.getAttribute('class') ?? ''));
  if (oldP) {
    const cls = oldP.getAttribute('class');
    if (cls) frag.querySelectorAll(':scope > p:not([class])').forEach((p) => p.setAttribute('class', cls));
    el.replaceChildren(frag);
    return;
  }
  const ps = [...frag.querySelectorAll(':scope > p')];
  if (!ps.length) {
    el.replaceChildren(frag);
    return;
  }
  const out = document.createDocumentFragment();
  ps.forEach((p, i) => {
    if (i) out.append(document.createElement('br'), document.createElement('br'));
    out.append(...p.childNodes);
  });
  el.replaceChildren(out);
}

function applyMedia(el: Element, src: string, alt?: string): void {
  const imgs = el instanceof HTMLImageElement ? [el] : [...el.querySelectorAll('img')];
  const sources = el.tagName === 'PICTURE' ? [...el.querySelectorAll('source')] : [...el.querySelectorAll('picture source')];
  sources.forEach((s) => {
    s.setAttribute('srcset', src);
    s.removeAttribute('type');
    s.removeAttribute('sizes');
  });
  imgs.forEach((img) => {
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.setAttribute('src', src);
    img.loading = 'eager';
    if (alt !== undefined) img.setAttribute('alt', alt);
    img.style.opacity = '';
  });
}

function applyLink(el: Element, msg: SetMsg): void {
  const a = el instanceof HTMLAnchorElement ? el : el.querySelector('a') ?? el;
  if (typeof msg.href === 'string' && a instanceof HTMLAnchorElement) {
    a.setAttribute('href', msg.href);
    if (msg.newTab || /^https?:\/\//i.test(msg.href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    } else if (msg.newTab === false) {
      a.removeAttribute('target');
      a.removeAttribute('rel');
    }
  }
  if (typeof msg.value === 'string') setLabel(a, msg.value);
  if (msg.visible !== undefined) (el as HTMLElement).style.display = msg.visible ? '' : 'none';
}

export function initBridge(): void {
  if (!isEditorFrame()) return;
  if ((window as unknown as { __susCmsBridge?: boolean }).__susCmsBridge) return;
  (window as unknown as { __susCmsBridge?: boolean }).__susCmsBridge = true;

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  document.documentElement.classList.add('sus-cms-editor');

  const tag = document.createElement('div');
  tag.className = 'sus-cms-label';
  tag.hidden = true;
  document.body.appendChild(tag);

  const send = (msg: Record<string, unknown>) => window.parent.postMessage(msg, location.origin);
  let hoverSection: Element | null = null;
  let hoverField: Element | null = null;

  const clearHover = () => {
    hoverSection?.classList.remove('sus-cms-hover');
    hoverField?.classList.remove('sus-cms-hover');
    hoverSection = hoverField = null;
    tag.hidden = true;
  };

  document.addEventListener(
    'mouseover',
    (e) => {
      const t = e.target as Element | null;
      const field = t?.closest?.('[data-cms-field]') ?? null;
      const section = t?.closest?.('[data-cms-section]') ?? null;
      if (field === hoverField && section === hoverSection) return;
      clearHover();
      hoverSection = section;
      hoverField = field;
      section?.classList.add('sus-cms-hover');
      field?.classList.add('sus-cms-hover');
      const target = field ?? section;
      if (target) {
        const r = target.getBoundingClientRect();
        tag.textContent = field ? 'Klicken zum Bearbeiten' : 'Sektion wählen';
        tag.style.left = `${Math.max(4, r.left)}px`;
        tag.style.top = `${Math.max(22, r.top - 4)}px`;
        tag.hidden = false;
      }
    },
    { passive: true },
  );
  document.addEventListener('mouseleave', clearHover);
  window.addEventListener('scroll', () => (tag.hidden = true), { passive: true });

  // Klicks wählen aus, statt zu navigieren (Capture: vor Links, Formularen und dem Astro-Router)
  window.addEventListener(
    'click',
    (e) => {
      const t = e.target as Element | null;
      if (!t?.closest) return;
      const field = t.closest('[data-cms-field]');
      const section = t.closest('[data-cms-section]');
      const interactive = t.closest('a, button, summary, label, input, select, textarea, [role="button"]');
      if (section || interactive) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (section) {
        const sid = section.getAttribute('data-cms-section') ?? '';
        const fid = field && section.contains(field) ? field.getAttribute('data-cms-field') : null;
        send({ type: 'sus-cms:select', section: sid, field: fid ?? `${sid}:` });
        markSelected(sid);
      }
    },
    true,
  );
  window.addEventListener('submit', (e) => e.preventDefault(), true);

  const markSelected = (sid: string) => {
    document.querySelectorAll('.sus-cms-selected').forEach((x) => x.classList.remove('sus-cms-selected'));
    document.querySelectorAll(`[data-cms-section="${cssEscape(sid)}"]`).forEach((x) => x.classList.add('sus-cms-selected'));
  };

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    const msg = e.data as { type?: string } & Partial<SetMsg> & { section?: string; scroll?: boolean };
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'sus-cms:set' && typeof msg.field === 'string') {
      const els = document.querySelectorAll(`[data-cms-field="${cssEscape(msg.field)}"]`);
      els.forEach((el) => {
        const kind = (msg.kind ?? el.getAttribute('data-cms-kind') ?? 'text') as Kind;
        if (kind === 'text') {
          if (el.getAttribute('data-cms-kind') === 'link') setLabel(el, String(msg.value ?? ''));
          else el.textContent = String(msg.value ?? '');
        } else if (kind === 'rich') {
          if (typeof msg.html === 'string') applyRich(el, msg.html);
          else el.textContent = String(msg.value ?? '');
        } else if (kind === 'media') {
          if (typeof msg.src === 'string') applyMedia(el, msg.src, msg.alt);
        } else if (kind === 'link') {
          applyLink(el, msg as SetMsg);
        }
      });
    } else if (msg.type === 'sus-cms:focus' && typeof msg.section === 'string') {
      markSelected(msg.section);
      const el = document.querySelector(`[data-cms-section="${cssEscape(msg.section)}"]`);
      if (el && msg.scroll !== false) {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        el.classList.remove('sus-cms-flash');
        void (el as HTMLElement).offsetWidth;
        el.classList.add('sus-cms-flash');
      }
    }
  });

  // Bilder mit Reveal-Animation sofort zeigen (sonst bleiben sie beim Springen evtl. unsichtbar)
  document.querySelectorAll('[data-reveal]').forEach((x) => x.classList.add('is-visible'));
  send({ type: 'sus-cms:ready' });
}
