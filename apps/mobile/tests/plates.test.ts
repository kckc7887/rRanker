import { calculatePlateProgress, recordMeetsRequirement } from '@/domain/plates';
import { fixtureRecords } from '@/fixtures/sanitized';

describe('plate progress', () => {
  const base = { ...fixtureRecords[0], songId: '1', levelIndex: 3, rate: 'sssp', fc: 'app', fs: 'fsdp' };
  it('orders rate, FC and FS and treats empty difficulties as any', () => {
    expect(recordMeetsRequirement(base, { difficulties: [], rate: 'sss', fc: 'ap', fs: 'fsd', songs: ['1'] })).toBe(true);
    expect(recordMeetsRequirement({ ...base, rate: 'ss' }, { difficulties: [], rate: 'sss', songs: ['1'] })).toBe(false);
  });
  it('requires every requirement for a song', () => {
    const progress = calculatePlateProgress({ id: 1, name: 'test', requirements: [
      { difficulties: [], rate: 'sss', songs: ['1', '2'] },
      { difficulties: [3], fc: 'ap', songs: ['1'] },
    ] }, [base]);
    expect(progress.completedSongIds).toEqual(['1']);
    expect(progress.missingSongIds).toEqual(['2']);
  });
  it('honors the SD/DX type from LXNS required songs', () => {
    const progress = calculatePlateProgress({ id: 2, name: 'type', requirements: [
      { difficulties: [], rate: 'sss', songs: ['1'], songTypes: { 1: 'SD' } },
    ] }, [base]);
    expect(progress.completed).toBe(base.type === 'SD' ? 1 : 0);
  });
});
