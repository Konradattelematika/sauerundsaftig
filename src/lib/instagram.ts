/**
 * Instagram-Datenschicht für die Feed-Sektion.
 *
 * Aktueller Stand: KEINE Live-Anbindung. Es gibt keinen API-Zugang/Token vom Kunden;
 * Scraping ist bewusst ausgeschlossen. Die Sektion rendert deshalb einen lokalen
 * Fallback: 5 echte Posts (Bilder + wörtliche Captions + Permalinks aus dem Brand-Import
 * vom 16.08.2026, src/data/instagram-posts.json) plus lokale Café-Fotos als Füller, die
 * auf das Profil verlinken.
 *
 * Live-Daten später anschließen (TODO(kunde)):
 *   1. Instagram-Konto als Business/Creator-Konto führen, App im Meta-Developer-Portal
 *      anlegen („Instagram API mit Instagram-Login"), langlebigen Access-Token erzeugen.
 *   2. Token beim Build als Umgebungsvariable INSTAGRAM_ACCESS_TOKEN setzen (Coolify →
 *      Build-Env; NIE ins Repo). Zusätzlich in astro.config.mjs unter image.remotePatterns
 *      die Instagram-CDN-Hosts (**.cdninstagram.com) freigeben, damit <Picture> die
 *      Remote-Bilder optimieren darf.
 *   3. fetchLivePosts() unten nutzt dann den offiziellen Graph-Endpunkt
 *      https://graph.instagram.com/me/media (Felder: id, caption, media_type, media_url,
 *      thumbnail_url, permalink, timestamp). Schlägt der Abruf fehl → lokaler Fallback,
 *      der Build bricht nie deswegen ab. Da die Site statisch ist, aktualisiert sich der
 *      Feed mit jedem Deploy (z. B. täglicher Rebuild per Coolify-Webhook/Cron).
 *   Hinweis: Dieser Live-Pfad ist ohne Token ungetestet — vor Aktivierung einmal lokal
 *   mit gesetztem Token bauen und die Sektion prüfen.
 */
import type { ImageMetadata } from 'astro';
import data from '../data/instagram-posts.json';
import { getAlt, getImage as getMotif } from './images';

export interface InstagramPost {
  id: string;
  permalink: string;
  /** ISO-Datum (YYYY-MM-DD); bei lokalen Füllern undefined */
  date?: string;
  caption?: string;
  /** Lokales Asset (ImageMetadata) oder Remote-URL (Live-Modus) */
  image: ImageMetadata | string;
  alt: string;
  isVideo?: boolean;
  source: 'instagram' | 'local';
}

export const INSTAGRAM_PROFILE = data.profile;
export const INSTAGRAM_IS_LIVE = Boolean(import.meta.env.INSTAGRAM_ACCESS_TOKEN);

const localImages = import.meta.glob<{ default: ImageMetadata }>('../assets/instagram/*.jpg', {
  eager: true,
});

function localPosts(): InstagramPost[] {
  return data.posts.flatMap((p) => {
    const img = localImages[`../assets/instagram/${p.image}.jpg`];
    if (!img) return [];
    return [
      {
        id: p.id,
        permalink: p.permalink,
        date: p.date,
        caption: p.caption,
        image: img.default,
        alt: p.alt,
        isVideo: p.isVideo,
        source: 'instagram' as const,
      },
    ];
  });
}

function fillerPosts(): InstagramPost[] {
  return data.localFillers.map((motif) => ({
    id: `local-${motif}`,
    permalink: data.profile.url,
    image: getMotif('a', motif),
    alt: getAlt(motif),
    source: 'local' as const,
  }));
}

interface GraphMedia {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

async function fetchLivePosts(limit: number): Promise<InstagramPost[]> {
  const token = import.meta.env.INSTAGRAM_ACCESS_TOKEN as string | undefined;
  if (!token) return [];
  const url = new URL('https://graph.instagram.com/me/media');
  url.searchParams.set('fields', 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Instagram API ${res.status}`);
  const json = (await res.json()) as { data?: GraphMedia[] };
  return (json.data ?? []).map((m) => ({
    id: m.id,
    permalink: m.permalink,
    date: m.timestamp.slice(0, 10),
    caption: m.caption?.replace(/#\S+/g, '').trim() || undefined,
    image: m.media_type === 'VIDEO' ? (m.thumbnail_url ?? m.media_url) : m.media_url,
    alt: m.caption ? m.caption.split('\n')[0].slice(0, 120) : 'Instagram-Beitrag von Sauer & Saftig',
    isVideo: m.media_type === 'VIDEO',
    source: 'instagram' as const,
  }));
}

/**
 * Posts für die Feed-Sektion: Live-Daten, wenn ein Token gesetzt ist und der Abruf
 * klappt — sonst lokaler Fallback. Echte Posts stehen immer vor lokalen Füllern.
 */
export async function getInstagramPosts(limit = 10): Promise<InstagramPost[]> {
  if (INSTAGRAM_IS_LIVE) {
    try {
      const live = await fetchLivePosts(limit);
      if (live.length > 0) return live.slice(0, limit);
    } catch (err) {
      console.warn('[instagram] Live-Abruf fehlgeschlagen, lokaler Fallback:', (err as Error).message);
    }
  }
  const posts = [...localPosts(), ...fillerPosts()];
  // Echte Posts und Füller mischen, damit Größen/Motive abwechseln, echte bleiben vorne gewichtet
  const real = posts.filter((p) => p.source === 'instagram');
  const fill = posts.filter((p) => p.source === 'local');
  const mixed: InstagramPost[] = [];
  while (real.length || fill.length) {
    if (real.length) mixed.push(real.shift()!);
    if (fill.length) mixed.push(fill.shift()!);
  }
  return mixed.slice(0, limit);
}
