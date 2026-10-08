/**
 * Zustand des Dashboards: der komplette Entwurf liegt im Browser, jede Änderung wird nach ~1,5 s
 * automatisch gespeichert (PUT /api/cms/draft mit baseRevision). Konflikte (409), Prüffehler (422),
 * Vorschau-/Live-Builds und Rechte laufen hier zusammen. Ereignisse (EventTarget):
 *   'status'  Speicherstatus geändert        'doc'    Entwurf komplett ersetzt (neu rendern)
 *   'issues'  Prüfhinweise neu berechnet     'build'  Build-Status geändert
 *   'live'    Live-Änderung für die Vorschau (detail: LiveMsg)
 *   'conflict' 409 beim Speichern            'change' lokale Änderung
 */
import type { MediaItem, SiteDoc } from '../cms/types';
import { api, ApiError, type Build, type CmsState, type DocMeta, type Me, type OnlineBuild } from './api';
import { validateDoc, normalizeIssues, type Issue } from './validate';
import { clone, debounce } from './util';
import { COLLECTION_DEFS, HEADER_DEFS, normalizeMediaFields, sectionDef } from './defs';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'invalid' | 'conflict';

export interface LiveMsg {
  field: string;
  kind: 'text' | 'rich' | 'media' | 'link';
  value: unknown;
  html?: string;
  src?: string;
  href?: string;
  alt?: string;
  visible?: boolean;
  newTab?: boolean;
}

export interface ChangeInfo {
  /** Änderung, die die Vorschau nicht sofort zeigen kann (Struktur, Auswahl, Liste …) */
  structural?: boolean;
  live?: LiveMsg;
}

const SAVE_DELAY = 1500;
const POLL_MS = 1500;

class Store extends EventTarget {
  doc!: SiteDoc;
  revision = 0;
  draftMeta: DocMeta = {};
  publishedMeta: DocMeta | null = null;
  /** Entwurf weicht vom veröffentlichten Stand ab (laut Server bzw. seit letzter Speicherung) */
  dirty = false;
  live: Build | null = null;
  preview: Build | null = null;
  /** gerade ausgelieferter Live- bzw. Vorschau-Build */
  online: OnlineBuild | null = null;
  previewOnline: OnlineBuild | null = null;
  me!: Me;
  codeVersion = '';
  /** Server meldet „schreibgeschützt“ (Grund) */
  readOnly: string | null = null;

  status: SaveStatus = 'saved';
  statusMessage = '';
  lastSavedAt: string | null = null;
  issues: Issue[] = [];
  private serverIssues: Issue[] = [];

  private changeSeq = 0;
  private savedSeq = 0;
  /** Beim Laden wurden Bildwerte vereinheitlicht — mit dem nächsten Speichern mitschicken */
  private needsNormalizeSave = false;
  private saving: Promise<boolean> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Strukturänderung seit der letzten Vorschau-Anforderung */
  structuralPending = false;
  /** Revision und Zeitpunkt, für die zuletzt ein Vorschau-Build angefordert wurde */
  previewRequestedRev = 0;
  previewRequestedAt = 0;
  /** Wird der laufende Vorschau-Build die Vorschau sichtbar ändern (→ iframe neu laden)? */
  previewReloadWanted = false;
  private polling = false;

  private scheduleSave = debounce(() => void this.save(), SAVE_DELAY);
  private scheduleValidate = debounce(() => void this.validate(), 450);

  can(perm: 'cms.view' | 'cms.edit' | 'cms.publish' | 'media.manage' | 'users.manage'): boolean {
    return Boolean(this.me?.permissions?.includes(perm));
  }

  get canEdit(): boolean {
    return this.can('cms.edit') && !this.readOnly;
  }

  get hasUnsaved(): boolean {
    return this.changeSeq !== this.savedSeq;
  }

  /** Muss vor dem Veröffentlichen noch gespeichert werden? */
  private get saveNeeded(): boolean {
    return this.hasUnsaved || (this.needsNormalizeSave && this.canEdit);
  }

  private emit(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private setStatus(s: SaveStatus, message = ''): void {
    this.status = s;
    this.statusMessage = message;
    this.emit('status');
  }

  /* ------------------------------------------------------------ Laden ---------------------- */

  async load(): Promise<void> {
    const st = await api.state();
    this.applyState(st);
    this.emit('doc');
    this.emit('build');
    void this.validate();
    this.watchBuilds();
  }

  private applyState(st: CmsState): void {
    this.doc = st.draft ?? ({} as SiteDoc);
    // Bildwerte im alten Format → beim nächsten Speichern (spätestens vor dem Veröffentlichen) korrigiert
    this.needsNormalizeSave = normalizeDoc(this.doc);
    this.draftMeta = st.draftMeta ?? {};
    this.revision = Number(st.draftMeta?.revision ?? st.draft?.meta?.revision ?? 0);
    this.publishedMeta = st.publishedMeta ?? null;
    this.dirty = Boolean(st.dirty);
    this.live = st.live ?? null;
    this.preview = st.preview ?? null;
    this.online = st.online ?? null;
    this.previewOnline = st.previewOnline ?? null;
    this.me = st.me ?? { id: '', name: '', role: '', permissions: [] };
    this.codeVersion = st.codeVersion ?? '';
    this.readOnly = typeof st.readOnly === 'string' && st.readOnly ? st.readOnly : null;
    this.changeSeq = this.savedSeq = 0;
    this.serverIssues = [];
    this.lastSavedAt = st.draftMeta?.updatedAt ?? null;
    this.setStatus('saved');
  }

  /** Entwurf vom Server neu holen (nach Verwerfen, Wiederherstellen, Konflikt) */
  async reload(): Promise<void> {
    this.scheduleSave.cancel();
    const st = await api.state();
    this.applyState(st);
    this.emit('doc');
    this.emit('build');
    void this.validate();
    this.watchBuilds();
  }

  /* ------------------------------------------------------------ Ändern & Speichern ---------- */

  change(info: ChangeInfo = {}): void {
    if (!this.canEdit) return;
    this.changeSeq += 1;
    if (info.structural) this.structuralPending = true;
    if (this.status !== 'conflict') this.setStatus('pending');
    this.emit('change', info);
    if (info.live) this.emit('live', info.live);
    this.scheduleValidate();
    if (this.status !== 'conflict') this.scheduleSave();
  }

  /** Sofort speichern (z. B. vor dem Veröffentlichen). true = alles gespeichert. */
  async flush(): Promise<boolean> {
    this.scheduleSave.cancel();
    if (this.saving) await this.saving;
    if (this.saveNeeded) return this.save();
    return this.status !== 'invalid' && this.status !== 'conflict' && this.status !== 'error';
  }

  async save(): Promise<boolean> {
    if (!this.canEdit) return false;
    if (this.saving) {
      await this.saving;
      if (this.hasUnsaved) this.scheduleSave();
      return !this.hasUnsaved;
    }
    if (!this.saveNeeded) return true;
    if (this.status === 'conflict') return false;
    clearTimeout(this.retryTimer);
    const seq = this.changeSeq;
    this.setStatus('saving');
    const run = (async () => {
      try {
        const res = await api.saveDraft(this.doc, this.revision);
        this.revision = Number(res.revision ?? this.revision + 1);
        this.lastSavedAt = res.updatedAt ?? new Date().toISOString();
        this.savedSeq = seq;
        this.needsNormalizeSave = false;
        this.dirty = true;
        this.serverIssues = [];
        if (this.hasUnsaved) {
          this.setStatus('pending');
          this.scheduleSave();
        } else this.setStatus('saved');
        this.afterSave();
        void this.validate();
        return !this.hasUnsaved;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          this.setStatus('conflict', 'Der Entwurf wurde inzwischen an anderer Stelle geändert.');
          this.emit('conflict');
        } else if (e instanceof ApiError && e.status === 422) {
          this.serverIssues = normalizeIssues(e.body, this.doc, 'server');
          this.setStatus('invalid', e.message && !/HTTP/.test(e.message) ? e.message : 'Nicht gespeichert — bitte die markierten Felder prüfen.');
          void this.validate();
        } else if (e instanceof ApiError && e.status === 401) {
          this.setStatus('error', 'Abgemeldet — bitte neu anmelden.');
        } else if (e instanceof ApiError && e.status === 429) {
          this.setStatus('pending', 'Sehr viele Änderungen in kurzer Zeit — wird gleich gespeichert.');
          this.retryTimer = setTimeout(() => void this.save(), 20_000);
        } else if (e instanceof ApiError && e.status === 503) {
          this.setStatus('error', `${e.message} Neuer Versuch in 30 Sekunden.`);
          this.retryTimer = setTimeout(() => void this.save(), 30_000);
        } else {
          const msg = e instanceof ApiError ? e.message : 'Speichern fehlgeschlagen.';
          this.setStatus('error', `${msg} Neuer Versuch in 10 Sekunden.`);
          this.retryTimer = setTimeout(() => void this.save(), 10_000);
        }
        return false;
      } finally {
        this.saving = null;
      }
    })();
    this.saving = run;
    return run;
  }

  /** Bei einem Konflikt: eigene Fassung auf den neuesten Stand setzen und trotzdem speichern */
  async overwriteAfterConflict(): Promise<boolean> {
    const st = await api.state();
    // Bilder und Weiterleitungen, die inzwischen auf dem Server dazukamen, nicht verlieren
    for (const m of st.draft?.media ?? []) if (!this.doc.media.some((x) => x.id === m.id)) this.doc.media.push(m);
    const own = this.doc.redirects ?? [];
    this.doc.redirects = [...(st.draft?.redirects ?? []), ...own.filter((r) => !(st.draft?.redirects ?? []).some((x) => x.from === r.from))];
    this.revision = Number(st.draftMeta?.revision ?? this.revision);
    this.setStatus('pending');
    this.changeSeq += 1;
    return this.save();
  }

  /* ------------------------------------------------------------ Prüfen --------------------- */

  async validate(): Promise<void> {
    if (!this.doc) return;
    const own = await validateDoc(this.doc);
    const covered = new Set(this.serverIssues.map((i) => i.path));
    this.issues = [...this.serverIssues, ...own.filter((i) => !covered.has(i.path))];
    this.emit('issues');
  }

  issuesAt(path: string, prefix = false): Issue[] {
    return this.issues.filter((i) => i.path === path || (prefix && i.path.startsWith(`${path}.`)));
  }

  get errorCount(): number {
    return this.issues.filter((i) => i.level === 'error').length;
  }

  /* ------------------------------------------------------------ Builds --------------------- */

  /** Hält Build-Status aktuell, solange ein Build wartet oder läuft */
  watchBuilds(): void {
    if (this.polling) return;
    const busy = (b: Build | null) => b && (b.state === 'queued' || b.state === 'running');
    if (!busy(this.live) && !busy(this.preview)) return;
    this.polling = true;
    const tick = async () => {
      try {
        const r = await api.build();
        const prevPreview = this.preview;
        const prevLive = this.live;
        this.live = r.live ?? this.live;
        this.preview = r.preview ?? null;
        if (r.online !== undefined) this.online = r.online;
        if (r.previewOnline !== undefined) this.previewOnline = r.previewOnline;
        this.emit('build', { prevPreview, prevLive });
      } catch {
        /* nächster Versuch */
      }
      if (busy(this.live) || busy(this.preview)) setTimeout(tick, POLL_MS);
      else this.polling = false;
    };
    setTimeout(tick, POLL_MS);
  }

  private afterSave(): void {
    this.emit('saved');
  }

  /** Vorschau-Build des gespeicherten Entwurfs anstoßen (falls nicht schon aktuell/unterwegs) */
  async requestPreview(force = false): Promise<Build | null> {
    if (!this.can('cms.view')) return null;
    const ok = await this.flush();
    if (!ok && this.hasUnsaved) return null;
    const busy = this.preview && (this.preview.state === 'queued' || this.preview.state === 'running');
    if (!force && this.preview && this.preview.revision >= this.revision && (busy || this.preview.state === 'ok')) {
      this.previewReloadWanted ||= this.structuralPending;
      this.structuralPending = false;
      return this.preview;
    }
    try {
      const r = await api.preview();
      this.preview = r.build ?? this.preview;
      this.previewRequestedRev = this.revision;
      this.previewRequestedAt = Date.now();
      this.previewReloadWanted = this.previewReloadWanted || this.structuralPending;
      this.structuralPending = false;
      this.emit('build');
      this.watchBuilds();
      return this.preview;
    } catch (e) {
      this.emit('build-error', e instanceof ApiError ? e.message : 'Vorschau konnte nicht gestartet werden.');
      return null;
    }
  }

  /** Zeigt die Vorschau den gespeicherten Entwurf? */
  get previewCurrent(): boolean {
    if (this.hasUnsaved) return false;
    if (this.previewOnline) return this.previewOnline.revision >= this.revision;
    return Boolean(this.preview && this.preview.state === 'ok' && this.preview.revision >= this.revision);
  }

  /** Veröffentlichen: speichern → POST publish → Fortschritt über 'build' */
  async publish(): Promise<Build> {
    const ok = await this.flush();
    if (!ok) throw new ApiError(0, this.statusMessage || 'Der Entwurf konnte nicht gespeichert werden.');
    let r: Awaited<ReturnType<typeof api.publish>>;
    try {
      r = await api.publish(this.revision);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        this.serverIssues = normalizeIssues(e.body, this.doc, 'server');
        void this.validate();
      }
      throw e;
    }
    this.live = r.build;
    this.emit('build');
    this.watchBuilds();
    if (r.redirects?.length) {
      // Der Server hat Weiterleitungen in den Entwurf geschrieben (Adressänderungen) — lokal übernehmen,
      // damit das nächste Speichern sie nicht entfernt. Die Basis-Revision bleibt: der Server spielt nach.
      try {
        const st = await api.state();
        this.doc.redirects = st.draft?.redirects ?? this.doc.redirects;
      } catch {
        /* nächstes Speichern spielt sie serverseitig nach */
      }
    }
    return r.build;
  }

  async discard(): Promise<void> {
    this.scheduleSave.cancel();
    await api.discard();
    await this.reload();
  }

  /**
   * Nach Medien-Upload/-Ersetzen/-Löschen: Der Server hat den Entwurf selbst geändert und spielt diese
   * Änderung beim nächsten Speichern auf unseren Stand nach — die Basis-Revision bleibt deshalb gleich.
   * Lokal wird nur das Ergebnis übernommen (neues/geändertes Bild bzw. Löschung).
   */
  mediaChanged(removedId?: string): void {
    if (removedId) this.doc.media = this.doc.media.filter((m) => m.id !== removedId);
    this.dirty = true;
    this.emit('media');
    this.emit('status');
    void this.validate();
  }

  addMediaLocal(item: MediaItem): void {
    const i = this.doc.media.findIndex((m) => m.id === item.id);
    if (i < 0) this.doc.media.push(item);
    else this.doc.media[i] = item;
  }

  snapshot(): SiteDoc {
    return clone(this.doc);
  }
}

/** Fehlende Teilbereiche ergänzen, damit Formulare nie auf undefined stoßen */
/**
 * Fehlende Teilbereiche ergänzen (Formulare stoßen nie auf undefined) und Bildwerte vereinheitlichen.
 * @returns true, wenn Inhalte geändert wurden, die gespeichert werden sollten (Bildwerte)
 */
export function normalizeDoc(doc: SiteDoc): boolean {
  const d = doc;
  d.pages ??= [];
  d.media ??= [];
  d.redirects ??= [];
  d.collections ??= { menu: [], faq: [], testimonials: [], heuteFrisch: { date: '', items: [] } };
  d.collections.menu ??= [];
  d.collections.faq ??= [];
  d.collections.testimonials ??= [];
  d.collections.heuteFrisch ??= { date: '', items: [] };
  d.navigation ??= { main: [], cta: { label: '', href: '' }, footer: [], legal: [], social: [] };
  for (const k of ['main', 'footer', 'legal', 'social'] as const) d.navigation[k] ??= [];
  d.navigation.cta ??= { label: '', href: '' };
  d.layout ??= {
    header: { logo: null, showOpeningStatus: true },
    footer: { claim: '', text: '', navHeading: 'Mehr', hoursHeading: 'Öffnungszeiten', copyright: '' },
    stickyBar: { items: [] },
  };
  d.layout.header ??= { logo: null, showOpeningStatus: true };
  d.layout.footer ??= { claim: '', text: '', navHeading: '', hoursHeading: '', copyright: '' };
  d.layout.stickyBar ??= { items: [] };
  d.layout.stickyBar.items ??= [];
  d.settings ??= {} as SiteDoc['settings'];
  d.settings.seoDefaults ??= { ogImage: null, themeColor: '#F7F2E8' };
  d.settings.openingHours ??= { week: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }, exceptions: [] };
  d.settings.openingHours.exceptions ??= [];
  let changed = false;
  const mediaRef = (holder: Record<string, unknown> | null | undefined, key: string) =>
    (changed = normalizeMediaFields([{ key, label: key, kind: 'media' }], holder) || changed);
  for (const p of d.pages) {
    p.sections ??= [];
    p.seo ??= { title: '', description: '' };
    mediaRef(p.seo as unknown as Record<string, unknown>, 'ogImage');
    for (const s of p.sections) {
      const def = sectionDef(s.type);
      if (def && s.fields && typeof s.fields === 'object') changed = normalizeMediaFields(def.fields, s.fields as Record<string, unknown>) || changed;
    }
  }
  changed = normalizeMediaFields(HEADER_DEFS, d.layout.header as unknown as Record<string, unknown>) || changed;
  mediaRef(d.settings.seoDefaults as unknown as Record<string, unknown>, 'ogImage');
  for (const [name, def] of Object.entries(COLLECTION_DEFS)) {
    const value = d.collections[name];
    if (def.shape === 'list' && Array.isArray(value)) for (const item of value) changed = normalizeMediaFields(def.fields, item as Record<string, unknown>) || changed;
    else if (def.shape === 'object' && value && typeof value === 'object') changed = normalizeMediaFields(def.fields, value as Record<string, unknown>) || changed;
  }
  return changed;
}

export const store = new Store();
