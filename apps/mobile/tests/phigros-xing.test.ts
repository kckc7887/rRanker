import { describe, expect, it } from 'vitest';
import {
  calculatePhigrosXingAcc,
  matchesPhigrosXingFilter,
  phigrosChartNoteKey,
  resolvePhigrosXingKind,
} from '@/domain/phigros-xing';

describe('phigros-xing resolve / filter', () => {
  it('resolvePhigrosXingKind 按 Acc 精确匹配 good / miss，FC 不算 miss', () => {
    const n = 1000;
    const goodAcc = calculatePhigrosXingAcc(n, 'good');
    const missAcc = calculatePhigrosXingAcc(n, 'miss');

    expect(resolvePhigrosXingKind(goodAcc, n, false)).toBe('good');
    expect(resolvePhigrosXingKind(goodAcc, n, true)).toBe('good');
    expect(resolvePhigrosXingKind(missAcc, n, false)).toBe('miss');
    expect(resolvePhigrosXingKind(missAcc, n, true)).toBeNull();
    expect(resolvePhigrosXingKind(100, n, false)).toBeNull();
    expect(resolvePhigrosXingKind(goodAcc, undefined, false)).toBeNull();
    expect(resolvePhigrosXingKind(goodAcc, 0, false)).toBeNull();
  });

  it('matchesPhigrosXingFilter：关闭放行；Miss 忽略 FC；无物量不命中', () => {
    const goodAcc = calculatePhigrosXingAcc(500, 'good');
    const missAcc = calculatePhigrosXingAcc(500, 'miss');
    const noteTotalByKey = {
      [phigrosChartNoteKey('a', 2)]: 500,
      [phigrosChartNoteKey('b', 2)]: 500,
      [phigrosChartNoteKey('c', 2)]: 500,
    };

    const good = {
      songId: 'a', levelIndex: 2, achievements: goodAcc, fc: null as string | null,
    };
    const miss = {
      songId: 'b', levelIndex: 2, achievements: missAcc, fc: null as string | null,
    };
    const missFc = {
      songId: 'c', levelIndex: 2, achievements: missAcc, fc: 'ap' as string | null,
    };
    const noNotes = {
      songId: 'missing', levelIndex: 2, achievements: goodAcc, fc: null as string | null,
    };

    expect(matchesPhigrosXingFilter(good, null, noteTotalByKey)).toBe(true);
    expect(matchesPhigrosXingFilter(good, 'good', noteTotalByKey)).toBe(true);
    expect(matchesPhigrosXingFilter(miss, 'good', noteTotalByKey)).toBe(false);
    expect(matchesPhigrosXingFilter(miss, 'miss', noteTotalByKey)).toBe(true);
    expect(matchesPhigrosXingFilter(missFc, 'miss', noteTotalByKey)).toBe(false);
    expect(matchesPhigrosXingFilter(noNotes, 'good', noteTotalByKey)).toBe(false);
  });
});
