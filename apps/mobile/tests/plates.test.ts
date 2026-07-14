import {
  calculatePlateProgress,
  groupPlatesForPicker,
  parseVersionPlateName,
  plateRequirementSpec,
  recordMeetsRequirement,
} from '@/domain/plates';
import { fixtureRecords } from '@/fixtures/sanitized';
import type { Plate } from '@/domain/models';

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
    expect(progress.missingSongs).toEqual([{ songId: '2', missingDifficulties: [-1] }]);
    expect(progress.total).toBe(3);
    expect(progress.completed).toBe(2);
  });
  it('lists unmet difficulties per song for multi-diff requirements', () => {
    const progress = calculatePlateProgress({
      id: 3,
      name: '超極',
      requirements: [{ difficulties: [0, 1, 2, 3], fc: 'fc', songs: ['1'] }],
    }, [base]);
    expect(progress.missingSongs).toEqual([{ songId: '1', missingDifficulties: [0, 1, 2] }]);
    expect(progress.byDifficulty[3]).toEqual({ total: 1, completed: 1 });
    expect(progress.byDifficulty[0]).toEqual({ total: 1, completed: 0 });
    expect(progress.total).toBe(4);
    expect(progress.completed).toBe(1);
  });
  it('honors the SD/DX type from LXNS required songs', () => {
    const progress = calculatePlateProgress({ id: 2, name: 'type', requirements: [
      { difficulties: [], rate: 'sss', songs: ['1'], songTypes: { 1: 'SD' } },
    ] }, [base]);
    expect(progress.completed).toBe(base.type === 'SD' ? 1 : 0);
    expect(progress.total).toBe(1);
  });
});

describe('version plate grouping', () => {
  const req = [{ difficulties: [3], fc: 'fc', songs: ['1'] }];
  const plate = (id: number, name: string): Plate => ({ id, name, requirements: req });

  it('parses version prefix and label, putting 覇者 under 舞', () => {
    expect(parseVersionPlateName('真極')).toEqual({ prefix: '真', label: '極' });
    expect(parseVersionPlateName('超舞舞')).toEqual({ prefix: '超', label: '舞舞' });
    expect(parseVersionPlateName('舞舞舞')).toEqual({ prefix: '舞', label: '舞舞' });
    expect(parseVersionPlateName('覇者')).toEqual({ prefix: '舞', label: '覇者' });
  });

  it('groups 真 as three tiers, places 覇者 under 舞, and drops non-version plates', () => {
    const groups = groupPlatesForPicker([
      plate(6101, '真極'),
      plate(6102, '真神'),
      plate(6103, '真舞舞'),
      plate(6104, '超極'),
      plate(6105, '超将'),
      plate(6106, '超神'),
      plate(6107, '超舞舞'),
      plate(6148, '覇者'),
      plate(6149, '舞極'),
      plate(6150, '舞将'),
      plate(6151, '舞神'),
      plate(6152, '舞舞舞'),
      plate(409501, 'ねこCOOL'),
    ]);
    expect(groups.map((item) => item.prefix)).toEqual(['真', '超', '舞']);
    expect(groups[0].entries.map((entry) => entry.label)).toEqual(['極', '神', '舞舞']);
    expect(groups[2].entries.map((entry) => entry.label)).toEqual(['覇者', '極', '将', '神', '舞舞']);
  });

  it('maps tiers to score status badge specs', () => {
    expect(plateRequirementSpec('極')).toEqual({ fc: 'fc', suffix: '评价' });
    expect(plateRequirementSpec('将')).toEqual({ rate: 'sss', suffix: '评级' });
    expect(plateRequirementSpec('神')).toEqual({ fc: 'ap', suffix: '评价' });
    expect(plateRequirementSpec('舞舞')).toEqual({ fs: 'fsd', suffix: '评价' });
    expect(plateRequirementSpec('覇者')).toEqual({ rate: 'a', suffix: '评级' });
  });
});
