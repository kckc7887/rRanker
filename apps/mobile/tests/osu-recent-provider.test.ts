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

describe('OsuScoreProvider recent scores', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => [] });
  });

  it('固定请求官方 recent 100 条通过成绩，不串用 best', async () => {
    const provider = new OsuScoreProvider(session);
    await provider.getRecentScores(2, 'osu-standard');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const url = String(mocks.fetch.mock.calls[0]?.[0]);
    expect(url).toContain('/users/2/scores/recent?');
    expect(url).toContain('mode=osu');
    expect(url).toContain('limit=100');
    expect(url).toContain('offset=0');
    expect(url).toContain('include_fails=0');
    expect(url).not.toContain('/scores/best');
  });
});
