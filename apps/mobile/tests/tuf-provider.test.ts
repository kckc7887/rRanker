import { describe, expect, it, vi } from 'vitest';
import playerProfile from './fixtures/tuf/player-profile.sanitized.json';
import passPage from './fixtures/tuf/pass-page.sanitized.json';
import levelPage from './fixtures/tuf/level-page.sanitized.json';
import {
  selectBestTufLevelPass,
  resolveTufAvatarUrl,
  TufPlayerSchema,
  tufDifficultyVisual,
  tufMediaImageCandidates,
  tufTagIconUrl,
  type TufLevelPass,
} from '@/domain/tuf';
import { ProviderError } from '@/providers/errors';
import { TufProvider } from '@/providers/tuf-provider';

function response(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

describe('TufProvider', () => {
  it('resolves root pfp first, then nested user.avatarUrl and legacy avatar fields', () => {
    expect(resolveTufAvatarUrl({ pfp: ' https://example.test/pfp.png ', user: { avatarUrl: 'https://example.test/user.png' } }))
      .toBe('https://example.test/pfp.png');
    expect(TufPlayerSchema.parse({ id: 1, name: '嵌套头像', user: { avatarUrl: 'https://example.test/user.png' } }).avatarUrl)
      .toBe('https://example.test/user.png');
    expect(resolveTufAvatarUrl({ avatarUrl: 'https://example.test/legacy.png' })).toBe('https://example.test/legacy.png');
    expect(resolveTufAvatarUrl({})).toBeNull();
  });
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

  it('reads level passes from the exact public endpoint without requiring an embedded level', async () => {
    const levelPass = {
      id: 700, levelId: 4426, playerId: 486, scoreV2: 15000, accuracy: 99.5, speed: 1,
      impact: 12.5, judgements: { perfect: 600 },
    };
    const fetcher = vi.fn().mockResolvedValue(response([levelPass]));
    const result = await new TufProvider(fetcher as typeof fetch, 'https://tuf.test').getLevelPasses(4426);
    expect(result).toEqual([expect.objectContaining(levelPass)]);
    expect(result[0]).not.toHaveProperty('level');
    expect(fetcher.mock.calls[0][0]).toBe('https://tuf.test/v2/database/passes/level/4426');
  });

  it('accepts an empty level pass list and rejects malformed or failed responses', async () => {
    const empty = vi.fn().mockResolvedValue(response([]));
    await expect(new TufProvider(empty as typeof fetch).getLevelPasses(4426)).resolves.toEqual([]);
    const malformed = vi.fn().mockResolvedValue(response([{ id: 1, levelId: 4426 }]));
    await expect(new TufProvider(malformed as typeof fetch).getLevelPasses(4426))
      .rejects.toMatchObject({ code: 'upstream_schema' });
    const failed = vi.fn().mockResolvedValue(response({}, 503));
    await expect(new TufProvider(failed as typeof fetch).getLevelPasses(4426))
      .rejects.toMatchObject({ code: 'network' });
    expect(failed).toHaveBeenCalledTimes(2);
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

describe('TUF level presentation helpers', () => {
  const levelPass = (overrides: Partial<TufLevelPass>): TufLevelPass => ({
    id: 1, levelId: 4426, playerId: 25, scoreV2: 100, accuracy: 99, speed: 1,
    impact: null, ...overrides,
  });

  it('selects the active player best pass with deterministic score, XACC, Impact and id ties', () => {
    const passes = [
      levelPass({ id: 1, playerId: 99, scoreV2: 999 }),
      levelPass({ id: 2, scoreV2: 101, accuracy: 98, impact: 30 }),
      levelPass({ id: 3, scoreV2: 101, accuracy: 99, impact: 20 }),
      levelPass({ id: 4, scoreV2: 101, accuracy: 99, impact: 21 }),
      levelPass({ id: 5, scoreV2: 101, accuracy: 99, impact: 21 }),
    ];
    expect(selectBestTufLevelPass(passes, 25)?.id).toBe(5);
    expect(selectBestTufLevelPass(passes, null)).toBeUndefined();
  });

  it.each([
    ['P1', '#0099ff', 'P'], ['P20', '#44ff15', 'P'],
    ['G1', '#F2A700', 'G'], ['G20', '#D20097', 'G'],
    ['U1', '#7B4FB2', 'U'], ['U20', '#000000', 'U'],
  ] as const)('keeps the real TUF spectrum color for %s', (name, color, band) => {
    expect(tufDifficultyVisual({ name, type: 'PGU', color })).toMatchObject({
      band,
      background: color.toUpperCase(),
    });
  });

  it('chooses readable text, uses band fallback colors and keeps special difficulties neutral', () => {
    expect(tufDifficultyVisual({ name: 'P20', type: 'PGU', color: '#44ff15' })?.text).toBe('#172033');
    expect(tufDifficultyVisual({ name: 'U20', type: 'PGU', color: '#000000' })?.text).toBe('#FFFFFF');
    expect(tufDifficultyVisual({ name: 'G12', type: 'PGU', color: 'bad' })?.background).toBe('#F2A700');
    expect(tufDifficultyVisual({ name: 'Legacy 12', type: 'LEGACY', color: '#FF0000' })).toBeNull();
  });

  it('recognizes every current P1-P20, G1-G20 and U1-U20 difficulty label', () => {
    const labels = (['P', 'G', 'U'] as const).flatMap((band) => (
      Array.from({ length: 20 }, (_, index) => `${band}${index + 1}`)
    ));
    expect(labels).toHaveLength(60);
    expect(labels.every((name) => tufDifficultyVisual({ name, type: 'PGU', color: null }) !== null)).toBe(true);
  });

  it('pins verified TUFHelper Raw icons and returns text-only fallback for unknown tags', () => {
    expect(tufTagIconUrl('Full VFX')).toBe(
      'https://raw.githubusercontent.com/coyami-ke/TUFHelper/7a5b84eeea6fc0ce86d25da07d19595481a31d7e/Assets/TUFHelper/Assets/Sprites/TagIcons/Icon_VFX_FullVFX.png',
    );
    expect(tufTagIconUrl('Camera')).toContain('/Icon_VFX_Cam.png');
    expect(tufTagIconUrl('未映射标签')).toBeNull();
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
