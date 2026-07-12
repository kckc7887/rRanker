import { chartVersionKey, normalizeSongId } from '@/domain/catalog';

describe('catalog identity mapping', () => {
  it('normalizes DivingFish DX ids to the shared LXNS song id', () => {
    expect(normalizeSongId(11806)).toBe('1806');
    expect(chartVersionKey(11806, 'DX', 3)).toBe('1806:DX:3');
  });

  it('keeps utage ids above 100000 intact', () => {
    expect(normalizeSongId(111388)).toBe('111388');
  });
});
