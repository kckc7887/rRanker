import { describe, expect, it, vi } from 'vitest';
import albums from './fixtures/musedash/albums.sanitized.json';
import ce from './fixtures/musedash/ce.sanitized.json';
import diffdiff from './fixtures/musedash/diffdiff.sanitized.json';
import player from './fixtures/musedash/player.sanitized.json';
import search from './fixtures/musedash/search.sanitized.json';
import { ProviderError } from '@/providers/errors';
import { MuseDashProvider } from '@/providers/muse-dash-provider';

function response(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

describe('MuseDashProvider', () => {
  it('parses sanitized albums, player, ce, diffdiff and search snapshots without credentials', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(albums))
      .mockResolvedValueOnce(response(player))
      .mockResolvedValueOnce(response(ce))
      .mockResolvedValueOnce(response(diffdiff))
      .mockResolvedValueOnce(response(search));
    const provider = new MuseDashProvider(fetcher as typeof fetch, 'https://musedash.test');
    await expect(provider.getAlbums()).resolves.toMatchObject({ ALBUM1: { tag: 'Default' } });
    const parsedPlayer = await provider.getPlayer('6ea4f986ffd211e8aa980242ac110011');
    expect(parsedPlayer).toMatchObject({ rl: 3.4518686005869577, user: { nickname: 'SiMOOOOOON' } });
    expect(parsedPlayer.plays[0]).toMatchObject({ uid: '1-1', difficulty: 2 });
    const parsedCe = await provider.getCe();
    expect(parsedCe.c.ChineseS[0]).toBe('凛·贝斯手');
    await expect(provider.getDiffdiff()).resolves.toHaveLength(3);
    await expect(provider.searchPlayers('simooo')).resolves.toEqual([['SiMOOOOOON', '6ea4f986ffd211e8aa980242ac110011']]);
    for (const call of fetcher.mock.calls) expect(call[1]?.headers).toEqual({ Accept: 'application/json', 'Cache-Control': 'no-store' });
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/authorization|token|cookie/i);
  });

  it('preserves search and player id query semantics', async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) =>
      response(url.includes('/player/') ? player : search));
    await new MuseDashProvider(fetcher as typeof fetch, 'https://musedash.test')
      .searchPlayers('  simooo  ');
    expect(fetcher.mock.calls[0][0]).toBe('https://musedash.test/search/simooo');
    await new MuseDashProvider(fetcher as typeof fetch, 'https://musedash.test')
      .getPlayer('6ea4f986-ffd2-11e8-aa98-0242ac110011');
    expect(fetcher.mock.calls[1][0])
      .toBe('https://musedash.test/player/6ea4f986-ffd2-11e8-aa98-0242ac110011');
  });

  it.each([401, 403])('reports public API policy changes for HTTP %s without retry', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(response({}, status));
    await expect(new MuseDashProvider(fetcher as typeof fetch).getPlayer('x')).rejects
      .toMatchObject({ code: 'permission', retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('honors a zero Retry-After and retries 429 once', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({}, 429, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(response(player));
    await expect(new MuseDashProvider(fetcher as typeof fetch).getPlayer('x')).resolves
      .toMatchObject({ rl: 3.4518686005869577 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retries a transient server error once and rejects malformed responses', async () => {
    const server = vi.fn().mockResolvedValue(response({}, 503));
    await expect(new MuseDashProvider(server as typeof fetch).getPlayer('x')).rejects
      .toMatchObject({ code: 'network' });
    expect(server).toHaveBeenCalledTimes(2);
    const malformed = vi.fn().mockResolvedValue(response({ user: { user_id: 1 } }));
    await expect(new MuseDashProvider(malformed as typeof fetch).getPlayer('x')).rejects
      .toBeInstanceOf(ProviderError);
  });
});
