import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot } from '@/domain/models';
import {
  buildMusicTitleMap,
  convertHubScoresToDivingFishRecords,
  mapHubTypeToDivingFish,
  parseHubAchievement,
} from '@/services/score-hub-sync-map';
import { resolveUploadTargets } from '@/services/upload-maimai-from-friend-code';
import {
  createLocalMaimaiAccount,
  createMaimaiBoundAccount,
} from '@/domain/bound-account';

describe('score-hub-sync-map', () => {
  it('parses percent achievement strings', () => {
    expect(parseHubAchievement('100.2618%')).toBeCloseTo(100.2618);
    expect(parseHubAchievement(99.5)).toBe(99.5);
    expect(parseHubAchievement('')).toBeNull();
    expect(parseHubAchievement(null)).toBeNull();
  });

  it('maps hub types to diving-fish SD/DX', () => {
    expect(mapHubTypeToDivingFish('standard')).toBe('SD');
    expect(mapHubTypeToDivingFish('dx')).toBe('DX');
    expect(mapHubTypeToDivingFish('utage')).toBe('DX');
  });

  it('converts hub scores and skips missing titles', () => {
    const catalog: CatalogSnapshot = {
      currentVersion: { id: 1, title: 'test' },
      versions: [{ id: 1, title: 'test' }],
      songs: [{
        id: '1696',
        title: 'Test Song',
        artist: 'A',
        version: 'test',
        charts: [],
      }],
      chartVersionIndex: {},
      source: { kind: 'lxns', label: 'test', updatedAt: new Date().toISOString(), isStale: false },
    };
    const titleMap = buildMusicTitleMap(catalog);
    const result = convertHubScoresToDivingFishRecords(
      [
        {
          musicId: '11696',
          chartIndex: 3,
          type: 'dx',
          dxScore: '1658',
          score: '100.2618%',
          fc: 'fc',
          fs: null,
        },
        {
          musicId: '99999',
          chartIndex: 3,
          type: 'dx',
          score: '100%',
        },
        {
          musicId: '11696',
          chartIndex: 4,
          type: 'dx',
          score: 'bad',
        },
      ],
      titleMap,
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      title: 'Test Song',
      type: 'DX',
      level_index: 3,
      achievements: 100.2618,
      dxScore: 1658,
      fc: 'fc',
    });
    expect(result.skippedNoTitle).toBe(1);
    expect(result.skippedBadScore).toBe(1);
  });
});

describe('resolveUploadTargets', () => {
  it('only allows diving-fish import-token sessions per account', () => {
    const accounts = [
      createLocalMaimaiAccount('本地', 0),
      createMaimaiBoundAccount({
        providerId: 'diving-fish',
        displayName: '尘言',
        rating: 15000,
        playerId: 'p1',
      }),
      createMaimaiBoundAccount({
        providerId: 'diving-fish',
        displayName: '另一号',
        rating: 14000,
        playerId: 'p2',
      }),
      createMaimaiBoundAccount({
        providerId: 'lxns',
        displayName: '落雪号',
        rating: 14000,
      }),
    ];
    const id1 = 'maimai:diving-fish:p1';
    const id2 = 'maimai:diving-fish:p2';
    const jwtOnly = resolveUploadTargets(accounts, {
      [id1]: { mode: 'jwt', value: 't', persistable: true },
    });
    expect(jwtOnly.find((t) => t.account.id === id1)?.writable).toBe(false);

    const withTokens = resolveUploadTargets(accounts, {
      [id1]: { mode: 'import-token', value: 'import-a', persistable: true },
      [id2]: { mode: 'import-token', value: 'import-b', persistable: true },
    });
    expect(withTokens.find((t) => t.account.id === id1)?.writable).toBe(true);
    expect(withTokens.find((t) => t.account.id === id2)?.writable).toBe(true);
    expect(withTokens.find((t) => t.account.providerId === 'lxns')?.writable).toBe(false);
    expect(withTokens.find((t) => t.account.id.includes('local'))?.writable).toBe(false);
  });
});
