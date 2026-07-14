import { emptyGamePayload, maimaiPayloadFromSnapshot } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { fixtureCatalog, fixturePlayer, fixtureRecords, fixtureSource } from '@/fixtures/sanitized';

describe('per-game data model', () => {
  it('keeps maimai DX Rating / Best sections only on the maimai payload', () => {
    const profile = getGameProfile('maimai');
    const payload = maimaiPayloadFromSnapshot({
      player: fixturePlayer,
      records: fixtureRecords,
      source: fixtureSource,
      catalogSource: fixtureSource,
      best50: {
        player: fixturePlayer,
        currentVersion: fixtureCatalog.currentVersion,
        b35: fixtureRecords.slice(0, 2),
        b15: fixtureRecords.slice(2, 3),
        unmatchedRecordCount: 0,
        rating: 12345,
        generatedAt: fixtureSource.updatedAt,
        source: fixtureSource,
      },
    }, profile);
    expect(payload.kind).toBe('maimai');
    if (payload.kind !== 'maimai') return;
    expect(payload.playerScore.label).toBe('DX RATING');
    expect(payload.playerScore.display).toBe('12345');
    expect(payload.bestSections.map((section) => section.id)).toEqual(['b35', 'b15']);
  });

  it('models the test game as an empty payload without maimai scores', () => {
    const profile = getGameProfile('test');
    const payload = emptyGamePayload('test', '测试游戏');
    expect(profile.ratingLabel).toBe('Rating');
    expect(payload.kind).toBe('empty');
    expect(payload).not.toHaveProperty('playerScore');
    expect(payload).not.toHaveProperty('bestSections');
  });
});
