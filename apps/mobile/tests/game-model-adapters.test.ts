import { buildGameDataDocument } from '@/domain/game-model-adapters';
import { validateGameModelContract } from '@/domain/game-model';
import { getGameManifest } from '@/domain/game-manifests';
import type { GameDataBundle } from '@/domain/game-data';
import type { CatalogSnapshot } from '@/domain/models';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import { getGameProfile } from '@/domain/game-profile';
import { calculatePhigrosXingAcc } from '@/domain/phigros-xing';

const source = {
  kind: 'fixture' as const,
  label: '测试来源',
  updatedAt: '2026-07-29T00:00:00.000Z',
  isStale: false,
};

function maimaiCatalog(): CatalogSnapshot {
  return {
    currentVersion: { id: 1, title: '当前' },
    versions: [{ id: 1, title: '当前' }],
    chartVersionIndex: {},
    source,
    songs: [{
      id: '1',
      title: 'Buddy Song',
      artist: 'Artist',
      version: '当前',
      charts: [{
        songId: '1',
        type: 'DX',
        levelIndex: 3,
        level: '14+',
        difficulty: 'master',
        difficultyConstant: 14.6,
        notes: {
          left: { tap: 1, hold: 2, slide: 3, touch: 4, break: 5, total: 15 },
          right: { tap: 6, hold: 7, slide: 8, touch: 9, break: 10, total: 40 },
        },
      }, {
        songId: '1',
        type: 'SD',
        levelIndex: 3,
        level: '14',
        difficulty: 'master',
        difficultyConstant: 14.0,
      }, {
        songId: '1',
        type: 'UTAGE',
        levelIndex: 0,
        level: '14',
        difficulty: 'master',
        difficultyConstant: 0,
        utage: { kanji: '宴', description: '双人特殊谱面', isBuddy: false },
      }],
    }],
  };
}

describe('game model adapters', () => {
  it('maps maimai multi-type charts and BUDDY as one difficulty with two note tables', () => {
    const record = {
      songId: '1', title: 'Buddy Song', type: 'DX' as const, levelIndex: 3, level: '14+',
      difficulty: 'master' as const, difficultyConstant: 14.6, achievements: 100.5,
      dxScore: 1000, rating: 300, fc: 'ap', fs: null, rate: 'sssp', version: '当前',
    };
    const bundle = {
      gameId: 'maimai',
      providerId: 'maimai-test',
      profile: getGameProfile('maimai'),
      payload: {
        kind: 'maimai',
        player: { id: '1', displayName: '玩家', rating: 1, source },
        records: [record],
        bestSections: [{ id: 'b35', title: 'B35', records: [record] }],
        playerScore: { label: 'DX RATING', value: 1, display: '00001' },
        currentVersionTitle: '当前',
        unmatchedRecordCount: 0,
        source,
        catalogSource: source,
        snapshot: {},
      },
    } as unknown as GameDataBundle;
    const document = buildGameDataDocument({ bundle, maimaiCatalog: maimaiCatalog() });
    expect(() => validateGameModelContract(getGameManifest('maimai'), document)).not.toThrow();
    const chart = document.songs[0]!.chartGroups[0]!.charts[0]!;
    expect(chart.id).toBe('maimai:1:DX:3');
    const notes = chart.attributes.find((group) => group.groupId === 'notes');
    expect(notes?.items[0]?.value).toMatchObject({
      kind: 'tag-group',
      value: {
        groupId: 'buddy-notes',
        items: [{ itemId: 'left' }, { itemId: 'right' }],
      },
    });
    expect(document.songs[0]!.chartGroups).toHaveLength(3);
    const utage = document.songs[0]!.chartGroups
      .find((group) => group.type?.itemId === 'utage')
      ?.charts[0];
    expect(utage?.difficulty).toMatchObject({
      itemId: 'utage',
      value: { kind: 'string', value: '宴 14' },
    });
    expect(utage?.attributes).toContainEqual({
      groupId: 'special',
      items: [{ itemId: 'value', value: { kind: 'string', value: '双人特殊谱面' } }],
    });
  });

  it('maps Phigros score and difficulty tags', () => {
    const record = {
      songId: 'song.a', title: 'song.a', type: 'SD' as const, levelIndex: 2, level: 'IN',
      difficulty: 'expert' as const, difficultyConstant: 15.2,
      achievements: calculatePhigrosXingAcc(500, 'good'),
      dxScore: 999000, rating: 15.0, fc: null, fs: null, rate: 'v', version: 'current',
    };
    const bundle = {
      gameId: 'phigros',
      providerId: 'phi-taptap',
      profile: getGameProfile('phigros'),
      payload: {
        kind: 'phigros',
        player: { id: '1', displayName: 'Phi', rating: 15, source },
        records: [record],
        bestSections: [{ id: 'b27', title: 'Best27', records: [record] }],
        playerScore: { label: 'RKS', value: 15, display: '15.0000' },
        challengeModeRank: 301,
        source,
        saveUpdatedAt: source.updatedAt,
        catalogSource: source,
        dataAmount: '0KiB',
        progress: { cleared: [0, 0, 0, 0], fullCombo: [0, 0, 0, 0], phi: [0, 0, 0, 0] },
      },
    } as unknown as GameDataBundle;
    const catalog: CatalogSnapshot = {
      currentVersion: { id: 0, title: '3.0.0' },
      versions: [{ id: 0, title: '3.0.0' }],
      chartVersionIndex: {},
      source,
      songs: [{
        id: 'song.a', title: 'Alpha', artist: 'Composer', version: '3.0.0',
        charts: [{
          songId: 'song.a', type: 'SD', levelIndex: 2, level: 'IN',
          difficulty: 'expert', difficultyConstant: 15.2,
          notes: { tap: 125, hold: 125, drag: 125, flick: 125, total: 500 },
        }],
      }],
    };
    const document = buildGameDataDocument({ bundle, phigrosCatalog: catalog });
    expect(() => validateGameModelContract(getGameManifest('phigros'), document)).not.toThrow();
    expect(document.records[0]).toMatchObject({
      title: 'Alpha',
      chartId: 'phigros:song.a:default:2',
      trailingMetric: { groupId: 'rks' },
      filterValues: { xing: 'good' },
    });
    expect(document.records[0]!.tagRows.flat()).toContainEqual({
      groupId: 'xing',
      itemId: 'value',
      value: { kind: 'string', value: 'XING-GOOD' },
    });
  });

  it("maps Chunithm WORLD'S END without inventing a numeric constant", () => {
    const catalog: ChunithmCatalogSnapshot = {
      currentVersion: { id: 1, title: 'LUMINOUS' },
      versions: [{ id: 1, title: 'LUMINOUS' }],
      genres: [],
      source,
      songs: [{
        id: 1,
        title: 'WE Song',
        artist: 'Artist',
        genre: 'VARIETY',
        bpm: 180,
        versionId: 1,
        versionTitle: 'LUMINOUS',
        locked: false,
        disabled: false,
        difficulties: [{
          difficulty: 5,
          level: '狂',
          levelValue: 0,
          versionId: 1,
          versionTitle: 'LUMINOUS',
          kanji: '狂',
          star: 3,
        }],
      }],
    };
    const bundle = {
      gameId: 'chunithm',
      providerId: 'chunithm-test',
      profile: getGameProfile('chunithm'),
      payload: {
        kind: 'chunithm',
        player: { name: 'Chu', rating: 15 },
        scores: [],
        bestSections: [],
        playerScore: { label: 'RATING', value: 15, display: '15.00' },
        source,
        hasSyncedData: true,
      },
    } as unknown as GameDataBundle;
    const document = buildGameDataDocument({ bundle, chunithmCatalog: catalog });
    expect(() => validateGameModelContract(getGameManifest('chunithm'), document)).not.toThrow();
    expect(document.songs[0]!.chartGroups[0]!.charts[0]!.difficulty).toMatchObject({
      itemId: 'worlds-end',
      value: { kind: 'string', value: '狂☆3' },
    });
    expect(document.songs[0]!.chartGroups[0]!.charts[0]!.difficulty.auxiliaryValue).toBeUndefined();
  });
});
