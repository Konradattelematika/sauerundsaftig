/** Gemeinsame Typen der Bereiche (Hash-Routen #/bereich/…?param=…). */
export interface Route {
  /** z. B. ['seiten', 'besuch', 'einstellungen'] */
  segs: string[];
  query: URLSearchParams;
}

/** Ein Bereich rendert in root und gibt optional eine Aufräumfunktion zurück */
export type View = (root: HTMLElement, route: Route) => void | (() => void);

export function parseHash(hash = location.hash): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  return { segs: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs) };
}

export function go(hash: string): void {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
