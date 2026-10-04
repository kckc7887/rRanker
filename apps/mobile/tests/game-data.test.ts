import {
  emptyGamePayload,
  maimaiPayloadFromSnapshot,
} from '@/domain/game-data';
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

  it('models the Chunithm temporary account without maimai score fields', () => {
    const profile = getGameProfile('chunithm');
    const payload = emptyGamePayload('chunithm', '临时账号');
    expect(profile.capabilities).toMatchObject({ hasTools: true });
    expect(payload).toMatchObject({
      kind: 'empty',
      gameId: 'chunithm',
      displayName: '临时账号',
    });
    expect(payload).not.toHaveProperty('records');
  });

});
