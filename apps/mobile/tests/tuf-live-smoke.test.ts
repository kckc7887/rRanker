import { describe, expect, it } from 'vitest';
import { TUF_PAGE_SIZE } from '@/domain/tuf';
import { TufProvider } from '@/providers/tuf-provider';

const live = process.env.TUF_LIVE_SMOKE === '1' ? describe : describe.skip;

live('TUF public API live schema smoke', () => {
  it('validates search, profile, passes, paged levels, detail and difficulties without fixed score values', async () => {
    const provider = new TufProvider();
    const players = await provider.searchPlayers('Jipper', 1, 0);
    expect(players.results.length).toBeGreaterThan(0);
    const playerId = players.results[0].id;
    const profile = await provider.getPlayerProfile(playerId);
    expect(profile.id).toBe(playerId);
    const passes = await provider.getPasses(playerId, {
      offset: 0, limit: 1, sortBy: 'impact', order: 'DESC', bestPerLevel: true,
    });
    expect(passes.limit).toBe(1);
    const levels = await provider.searchLevels({ offset: 0, limit: 1 });
    expect(levels.results.length).toBeGreaterThan(0);
    const detail = await provider.getLevel(levels.results[0].id);
    expect(detail.level.id).toBe(levels.results[0].id);
    const difficulties = await provider.getDifficulties();
    const difficultyHash = await provider.getDifficultyHash();
    expect(difficulties.length).toBeGreaterThan(0);
    expect(difficultyHash.hash.length).toBeGreaterThan(0);
    expect(TUF_PAGE_SIZE).toBe(30);
  }, 30_000);
});
