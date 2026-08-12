import { describe, expect, it, vi } from 'vitest';
import playerProfile from './fixtures/tuf/player-profile.sanitized.json';
import passPage from './fixtures/tuf/pass-page.sanitized.json';
import levelPage from './fixtures/tuf/level-page.sanitized.json';
import { tufMediaImageCandidates } from '@/domain/tuf';
import { ProviderError } from '@/providers/errors';
import { TufProvider } from '@/providers/tuf-provider';

function response(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

describe('TufProvider', () => {
  it('parses sanitized player, pass and paged level snapshots without credentials', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(playerProfile))
      .mockResolvedValueOnce(response(passPage))
      .mockResolvedValueOnce(response(levelPage));
    const provider = new TufProvider(fetcher as typeof fetch, 'https://tuf.test');
    await expect(provider.getPlayerProfile(25)).resolves.toMatchObject({ id: 25, rankedScore: 1824.52 });
    await expect(provider.getPasses(25, { offset: 0, limit: 30, sortBy: 'impact', order: 'DESC', bestPerLevel: true }))
      .resolves.toMatchObject({ total: 1, passes: [{ id: 9001, accuracy: 100 }] });
    await expect(provider.searchLevels({ offset: 0, limit: 30 })).resolves.toMatchObject({ hasMore: false });
    for (const call of fetcher.mock.calls) expect(call[1]?.headers).toEqual({ Accept: 'application/json', 'Cache-Control': 'no-store' });
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/authorization|token|cookie/i);
  });

  it('preserves sorting and pagination query semantics', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...passPage, total: 31, offset: 30 }));
    await new TufProvider(fetcher as typeof fetch, 'https://tuf.test').getPasses(25, {
      offset: 30, limit: 30, sortBy: 'xacc', order: 'ASC', bestPerLevel: false, query: '  technical  ',
    });
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      offset: '30', limit: '30', sortBy: 'xacc', order: 'ASC', bestPerLevel: 'false', query: 'technical',
    });
  });

  it('preserves level sorting and difficulty filter semantics', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(levelPage));
    await new TufProvider(fetcher as typeof fetch, 'https://tuf.test').searchLevels({
      query: '  stamina  ', offset: 30, limit: 30, sort: 'DIFF', order: 'ASC',
      pguRange: 'G1,G20', specialDifficulties: ['Unranked', 'Marathon'],
    });
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      offset: '30', limit: '30', query: 'stamina', sort: 'DIFF_ASC',
      pguRange: 'G1,G20', specialDifficulties: 'Unranked,Marathon',
    });
  });

  it.each([401, 403])('reports public API policy changes for HTTP %s without retry', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(response({}, status));
    await expect(new TufProvider(fetcher as typeof fetch).getPlayer(25)).rejects.toMatchObject({ code: 'permission', retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('honors a zero Retry-After and retries 429 once', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({}, 429, { 'Retry-After': '0' })).mockResolvedValueOnce(response(playerProfile));
    await expect(new TufProvider(fetcher as typeof fetch).getPlayer(25)).resolves.toMatchObject({ id: 25 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retries a transient server error once and rejects malformed responses', async () => {
    const server = vi.fn().mockResolvedValue(response({}, 503));
    await expect(new TufProvider(server as typeof fetch).getPlayer(25)).rejects.toMatchObject({ code: 'network' });
    expect(server).toHaveBeenCalledTimes(2);
    const malformed = vi.fn().mockResolvedValue(response({ id: 'bad' }));
    await expect(new TufProvider(malformed as typeof fetch).getPlayer(25)).rejects.toBeInstanceOf(ProviderError);
  });

  it.each([
    ['YouTube', 'https://www.youtube.com/watch?v=PUvyMb-qPVs', 'https://i.ytimg.com/vi/PUvyMb-qPVs/maxresdefault.jpg'],
    ['哔哩哔哩', 'https://www.bilibili.com/video/BV1xx411c7mD', 'https://api.tuforums.com/v2/media/image-proxy?url=http%3A%2F%2Fi1.hdslb.com%2Fcover.jpg'],
  ])('reads %s video details through the TUF endpoint and URL-encodes the link', async (_, videoLink, image) => {
    const details = {
      title: '#4426', channelName: 'Kaleido', timestamp: '2024-01-02T00:00:00.000Z',
      image, embed: 'https://player.example/embed', downloadLink: null,
    };
    const fetcher = vi.fn().mockResolvedValue(response(details));
    const result = await new TufProvider(fetcher as typeof fetch, 'https://tuf.test').getVideoDetails(videoLink);
    expect(result.image).toBe(image);
    expect(fetcher.mock.calls[0][0]).toBe(`https://tuf.test/v2/media/video-details/${encodeURIComponent(videoLink)}`);
  });

  it('accepts an empty media image without turning the level into an error', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      title: '无封面', channelName: '作者', timestamp: null, image: '', embed: null, downloadLink: null,
    }));
    await expect(new TufProvider(fetcher as typeof fetch).getVideoDetails('https://video.example/watch'))
      .resolves.toMatchObject({ image: '' });
  });

  it('rejects an invalid or non-HTTPS video link before requesting TUF', () => {
    const fetcher = vi.fn();
    const provider = new TufProvider(fetcher as typeof fetch);
    expect(() => provider.getVideoDetails('not-a-url')).toThrow('TUF 视频链接无效');
    expect(() => provider.getVideoDetails('http://video.example/watch')).toThrow('TUF 视频链接无效');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the existing TUF retry and failure policy for video details', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({}, 503));
    await expect(new TufProvider(fetcher as typeof fetch).getVideoDetails('https://video.example/watch'))
      .rejects.toMatchObject({ code: 'network', retryable: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('TUF media image candidates', () => {
  const icon = 'https://api.tuforums.com/icons/G12.png';

  it('tries a TUF proxy before the original YouTube image and difficulty icon', () => {
    const image = 'https://i.ytimg.com/vi/PUvyMb-qPVs/maxresdefault.jpg';
    expect(tufMediaImageCandidates(image, icon)).toEqual([
      `https://api.tuforums.com/v2/media/image-proxy?url=${encodeURIComponent(image)}`,
      image,
      icon,
    ]);
  });

  it('does not wrap a Bilibili image already returned through the TUF proxy', () => {
    const proxied = 'https://api.tuforums.com/v2/media/image-proxy?url=http%3A%2F%2Fi1.hdslb.com%2Fcover.jpg';
    expect(tufMediaImageCandidates(proxied, icon)).toEqual([proxied, icon]);
  });

  it('falls back to the difficulty icon and rejects unsafe image candidates', () => {
    expect(tufMediaImageCandidates('', icon)).toEqual([icon]);
    expect(tufMediaImageCandidates('http://unsafe.example/cover.jpg', 'not-a-url')).toEqual([]);
  });
});
