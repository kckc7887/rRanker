import { chartVersionKey, enrichRecordsWithCatalog, normalizeSongId } from '@/domain/catalog';
import type { CatalogSnapshot, ScoreRecord } from '@/domain/models';

describe('catalog identity mapping', () => {
  it('normalizes DivingFish DX ids to the shared LXNS song id', () => {
    expect(normalizeSongId(11806)).toBe('1806');
    expect(chartVersionKey(11806, 'DX', 3)).toBe('1806:DX:3');
  });

  it('keeps utage ids above 100000 intact', () => {
    expect(normalizeSongId(111388)).toBe('111388');
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
