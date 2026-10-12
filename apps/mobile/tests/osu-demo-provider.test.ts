import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OSU_RULESET_BY_GAME_ID,
  type OsuBeatmapsetLookupRaw,
} from '@/domain/osu';
import type { OsuGameId } from '@/domain/game-mode-family';
import {
  buildMaxedOsuBeatmapsetScores,
  buildMaxedOsuBestScores,
  maxedOsuPlayerSnapshot,
} from '@/providers/maxed-osu-test-provider';
import { OsuPublicCatalogProvider } from '@/providers/osu-public-catalog-provider';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('expo/fetch', () => ({ fetch: mocks.fetch }));

function rawSong(id: number, status = 'ranked'): OsuBeatmapsetLookupRaw {
  return {
    id, title: `Song ${id}`, artist: 'Artist', creator: 'Mapper', covers: {}, status,
    beatmaps: Object.entries(OSU_RULESET_BY_GAME_ID).flatMap(([, mode], index) => [
      { id: id * 100 + index * 10, beatmapset_id: id, difficulty_rating: 3, version: 'Low', mode, status, max_combo: 50 },
      { id: id * 100 + index * 10 + 1, beatmapset_id: id, difficulty_rating: 8, version: 'High', mode, status, max_combo: 100 },
      { id: id * 100 + index * 10 + 2, beatmapset_id: id, difficulty_rating: 8, version: 'Tie', mode, status, max_combo: null },
    ]),
  };
}

describe('osu! 示例曲库与成绩', () => {
  beforeEach(() => mocks.fetch.mockReset());

  it.each(Object.keys(OSU_RULESET_BY_GAME_ID) as OsuGameId[])('只选 %s 当前模式最高星，同星保留返回顺序', async (gameId) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify([
      rawSong(1), rawSong(2, 'approved'), rawSong(3, 'loved'),
    ])));
    const page = await new OsuPublicCatalogProvider().searchBeatmapsets({ gameId, page: 0, rankedOnly: true });
    const scores = buildMaxedOsuBestScores(page.songs);
    expect(scores.map((score) => score.beatmapset.id)).toEqual([1, 2]);
    expect(scores.map((score) => score.beatmap.version)).toEqual(['High', 'High']);
    expect(scores[0]).toMatchObject({ score: 1_000_000, accuracy: 1, rank: 'X', maxCombo: 100,
      pp: null, statistics: null, achievedAt: null, mods: [] });
    const request = new URL(String(mocks.fetch.mock.calls[0][0]));
    expect(request.searchParams.get('status')).toBe('1,2');
    expect(request.searchParams.get('mode')).toBe(String(['osu', 'taiko', 'fruits', 'mania'].indexOf(OSU_RULESET_BY_GAME_ID[gameId])));
    expect(new Headers(mocks.fetch.mock.calls[0][1].headers).has('authorization')).toBe(false);
    expect(maxedOsuPlayerSnapshot().data.player.pp).toBe(40_000);
  });

  it('按原始分页数量继续，保留各页歌曲顺序并生成一致的详情成绩', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 30 }, (_, index) => rawSong(index + 1)))))
      .mockResolvedValueOnce(new Response(JSON.stringify([rawSong(31)])))
      .mockResolvedValueOnce(new Response(JSON.stringify(rawSong(31))));
    const provider = new OsuPublicCatalogProvider();
    const first = await provider.searchBeatmapsets({ gameId: 'osu-standard', page: 0, rankedOnly: true });
    expect(first.nextPage).toBe(1);
    const second = await provider.searchBeatmapsets({ gameId: 'osu-standard', page: first.nextPage!, rankedOnly: true });
    expect(second.nextPage).toBeUndefined();
    expect(new URL(String(mocks.fetch.mock.calls[1][0])).searchParams.get('offset')).toBe('30');
    const detail = await provider.getBeatmapset(31, 'osu-standard');
    const listScore = buildMaxedOsuBestScores(second.songs)[0];
    const detailScores = buildMaxedOsuBeatmapsetScores(detail);
    expect(detailScores).toHaveLength(3);
    expect(detailScores.find((score) => score.beatmap.id === listScore.beatmap.id)).toEqual(listScore);
    expect(detailScores.find((score) => score.beatmap.version === 'Tie')?.maxCombo).toBeNull();
    expect(detailScores.every((score) => score.score === 1_000_000 && score.accuracy === 1 && score.mods.length === 0)).toBe(true);
  });

  it('取消在途查询后拒绝迟到结果', async () => {
    let finish!: (response: Response) => void;
    mocks.fetch.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    const controller = new AbortController();
    const pending = new OsuPublicCatalogProvider().searchBeatmapsets({ gameId: 'osu-standard', page: 0 }, controller.signal);
    controller.abort(new Error('cancelled'));
    finish(new Response(JSON.stringify([rawSong(1)])));
    await expect(pending).rejects.toThrow('cancelled');
  });
});
