import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Instagram-Live-Feed', () => {
  it('liest den Access-Token aus der Build-Umgebung und übergibt ihn an den Graph-Endpunkt', async () => {
    const envToken = 'instagram-env-token-for-test';
    vi.stubEnv('INSTAGRAM_ACCESS_TOKEN', envToken);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'post-1',
              caption: 'Frisch aus der Backstube #sauerteig',
              media_type: 'IMAGE',
              media_url: 'https://cdn.example.test/post-1.jpg',
              permalink: 'https://www.instagram.com/p/post-1/',
              timestamp: '2026-09-19T08:30:00+0000',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const { getInstagramPosts, INSTAGRAM_IS_LIVE } = await import('../src/lib/instagram');
    const posts = await getInstagramPosts(1);

    expect(INSTAGRAM_IS_LIVE).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.origin + requestUrl.pathname).toBe('https://graph.instagram.com/me/media');
    expect(requestUrl.searchParams.get('access_token')).toBe(envToken);
    expect(requestUrl.searchParams.get('limit')).toBe('1');
    expect(posts).toMatchObject([
      {
        id: 'post-1',
        caption: 'Frisch aus der Backstube',
        image: 'https://cdn.example.test/post-1.jpg',
        source: 'instagram',
      },
    ]);
  });
});
