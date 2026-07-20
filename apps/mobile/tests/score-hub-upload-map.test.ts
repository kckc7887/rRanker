import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot } from '@/domain/models';
import {
  buildMusicTitleMap,
  convertHubScoresToDivingFishRecords,
  convertHubScoresToLocalRecords,
  convertHubScoresToLxnsRecords,
  mapHubFsToCanonical,
  mapHubTypeToDivingFish,
  parseHubAchievement,
} from '@/services/score-hub-sync-map';
import { resolveUploadTargets } from '@/services/upload-maimai-from-friend-code';
import {
  createLocalMaimaiAccount,
  createMaxedMaimaiTestAccount,
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
  });

  it('normalizes FDX aliases and SYNC used by score-hub', () => {
    expect(mapHubFsToCanonical('fdx')).toBe('fsd');
    expect(mapHubFsToCanonical('FDXP')).toBe('fsdp');
    expect(mapHubFsToCanonical('SYNC')).toBe('sync');
    expect(mapHubFsToCanonical('')).toBeNull();
    expect(mapHubFsToCanonical('unknown')).toBeNull();
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
        {
          musicId: '11696',
          chartIndex: 10,
          type: 'utage',
          score: '100%',
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
    expect(result.skippedUnsupportedChart).toBe(1);
  });

  it('maps confirmed SD/DX scores to local records and LXNS upload DTOs', () => {
    const catalog: CatalogSnapshot = {
      currentVersion: { id: 2, title: 'current' },
      versions: [{ id: 2, title: 'current' }],
      songs: [
        {
          id: '1696', title: 'Test Song', version: 'current', charts: [
            {
              songId: '1696', type: 'SD', levelIndex: 3, level: '13+', difficulty: 'master',
              difficultyConstant: 13.8,
            },
            {
              songId: '1696', type: 'DX', levelIndex: 4, level: '14', difficulty: 'remaster',
              difficultyConstant: 14.2,
            },
          ],
        },
        { id: '100123', title: '宴会场', version: 'current', charts: [] },
      ],
      chartVersionIndex: {
        '1696:SD:3': 2,
        '1696:DX:4': 2,
      },
      source: { kind: 'lxns', label: 'test', updatedAt: new Date().toISOString(), isStale: false },
    };
    const hubScores = [
      {
        musicId: '11696', chartIndex: 4, type: 'dx', dxScore: '2000',
        score: '100.5%', fc: 'app', fs: 'fdxp',
      },
      {
        musicId: '1696', chartIndex: 3, type: 'standard', dxScore: 1800,
        score: '99.5%', fc: 'fc', fs: 'fdx',
      },
      {
        musicId: '100123', chartIndex: 10, type: 'utage', dxScore: 3000,
        score: '101%', fc: null, fs: null,
      },
      { musicId: '99999', chartIndex: 3, type: 'dx', score: '100%' },
    ];

    const local = convertHubScoresToLocalRecords(hubScores, catalog);
    expect(local.records).toHaveLength(2);
    expect(local.records[0]).toMatchObject({
      songId: '1696', type: 'DX', levelIndex: 4, achievements: 100.5,
      dxScore: 2000, fc: 'app', fs: 'fsdp', rate: 'sssp',
    });
    expect(local.records[1]).toMatchObject({ type: 'SD', fs: 'fsd', rate: 'ssp' });
    expect(local.skippedUnsupportedChart).toBe(1);
    expect(local.skippedNoSong).toBe(1);

    const lxns = convertHubScoresToLxnsRecords(hubScores, catalog);
    expect(lxns.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 1696, type: 'dx', level_index: 4, achievements: 100.5,
        dx_score: 2000, fc: 'app', fs: 'fsdp',
      }),
      expect.objectContaining({ id: 1696, type: 'standard', level_index: 3, fs: 'fsd' }),
      expect.objectContaining({ id: 100123, type: 'utage', level_index: 0 }),
    ]));
    expect(lxns.skippedNoSong).toBe(1);
  });
});

describe('resolveUploadTargets', () => {
  it('allows local, import-token diving-fish and OAuth LXNS targets', () => {
    const accounts = [
      createLocalMaimaiAccount('本地', 0),
      createLocalMaimaiAccount('本地二号', 0, 'maimai:local:second'),
      createMaxedMaimaiTestAccount(),
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
      'maimai:lxns:落雪号': {
        mode: 'lxns-oauth',
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 60_000,
        persistable: true,
      },
    });
    expect(withTokens.find((t) => t.account.id === id1)?.writable).toBe(true);
    expect(withTokens.find((t) => t.account.id === id2)?.writable).toBe(true);
    expect(withTokens.find((t) => t.account.providerId === 'lxns')?.writable).toBe(true);
    expect(withTokens.filter((t) => t.account.providerId === 'local')).toHaveLength(2);
    expect(withTokens.filter((t) => t.account.providerId === 'local').every((t) => t.writable)).toBe(true);
    expect(withTokens.find((t) => t.account.providerId === 'maimai-test')?.writable).toBe(false);
  });
});
