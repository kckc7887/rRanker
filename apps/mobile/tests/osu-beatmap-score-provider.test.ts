import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OsuScoreProvider } from '@/providers/osu-score-provider';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('expo/fetch', () => ({ fetch: mocks.fetch }));

const session = {
  mode: 'osu-oauth',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 3_600_000,
  persistable: true,
} as const;

describe('OsuScoreProvider 单谱玩家成绩', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('按谱面查询玩家成绩并将未游玩的 404 归一化为空', async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        position: 1,
        score: { id: 9, accuracy: 0.98, total_score: 123, rank: 'S' },
      }),
    });
    const provider = new OsuScoreProvider(session);
    expect((await provider.getUserBeatmapScore(2, 22423, 'osu-standard'))?.id).toBe(9);
    expect(String(mocks.fetch.mock.calls[0]?.[0]))
      .toContain('/beatmaps/22423/scores/users/2?mode=osu');

    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(provider.getUserBeatmapScore(2, 22424, 'osu-standard')).resolves.toBeNull();
  });
});
