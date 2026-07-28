import {
  aliasesForCatalogSong,
  chartVersionKey,
  enrichRecordsWithCatalog,
  isUtageSongId,
  normalizeSongId,
  originalSongIdForUtage,
  stripUtageTitlePrefix,
} from '@/domain/catalog';
import type { CatalogSnapshot, ScoreRecord } from '@/domain/models';
import { maimaiJacketUrl } from '@/domain/maimai-assets';

describe('catalog identity mapping', () => {
  it('normalizes DivingFish DX ids to the shared LXNS song id', () => {
    expect(normalizeSongId(11806)).toBe('1806');
    expect(chartVersionKey(11806, 'DX', 3)).toBe('1806:DX:3');
  });

  it('keeps utage ids above 100000 intact', () => {
    expect(normalizeSongId(111388)).toBe('111388');
    expect(isUtageSongId(111388)).toBe(true);
    expect(isUtageSongId(11806)).toBe(false);
    expect(originalSongIdForUtage(100123)).toBe('123');
    expect(originalSongIdForUtage(110123)).toBe('10123');
    expect(originalSongIdForUtage(11806)).toBeUndefined();
    expect(maimaiJacketUrl('100123')).toBe('https://assets2.lxns.net/maimai/jacket/123.png');
    expect(maimaiJacketUrl('110123')).toBe('https://assets2.lxns.net/maimai/jacket/10123.png');
  });

  it('uses the original song title and aliases for U·TA·GE presentation', () => {
    const aliases = new Map([
      ['123', ['原曲别名']],
      ['100123', ['特殊谱面别名']],
    ]);
    expect(stripUtageTitlePrefix('[協] 原曲标题')).toBe('原曲标题');
    expect(stripUtageTitlePrefix('【光】原曲标题')).toBe('原曲标题');
    expect(aliasesForCatalogSong('100123', aliases)).toEqual(['原曲别名']);
    expect(aliasesForCatalogSong('123', aliases)).toEqual(['原曲别名']);
    expect(aliasesForCatalogSong('110123', aliases)).toEqual(['原曲别名']);
  });

  it('copies chart note totals into enriched score records for theoretical DXScore', () => {
    const source = { kind: 'lxns' as const, label: '测试曲库', updatedAt: '2026-07-16T00:00:00.000Z', isStale: false };
    const record: ScoreRecord = {
      songId: '11447', title: '测试曲', type: 'DX', levelIndex: 3, level: '13+', difficulty: 'master',
      difficultyConstant: 0, achievements: 100, dxScore: 1836, rating: 298,
      fc: null, fs: null, rate: 'sss', version: 'unknown',
    };
    const catalog: CatalogSnapshot = {
      currentVersion: { id: 1, title: '当前版本' },
      versions: [{ id: 1, title: '当前版本' }],
      songs: [{
        id: '11447', title: '测试曲', version: '当前版本', charts: [{
          songId: '11447', type: 'DX', levelIndex: 3, level: '13+', difficulty: 'master',
          difficultyConstant: 13.8, versionId: 1,
          notes: { tap: 300, hold: 80, slide: 200, touch: 20, break: 90, total: 690 },
        }],
      }],
      chartVersionIndex: { '1447:DX:3': 1 },
      source,
    };
    const [enriched] = enrichRecordsWithCatalog([record], catalog);
    expect(enriched?.difficultyConstant).toBe(13.8);
    expect(enriched?.notes?.total).toBe(690);
  });
});
