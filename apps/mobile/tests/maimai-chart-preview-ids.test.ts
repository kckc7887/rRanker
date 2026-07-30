import { describe, expect, it } from 'vitest';
import {
  maimaiChartPreviewBuddyEngineDifficulty,
  maimaiChartPreviewChartId,
  maimaiChartPreviewEngineDifficulty,
  maimaiChartPreviewMusicId,
  maimaiChartPreviewMusicUrl,
  maimaiChartPreviewSimaiUrl,
} from '@/domain/maimai-chart-preview';

describe('maimai chart preview ids', () => {
  it('maps SD / DX / UTAGE chart ids like diving-fish / lxns', () => {
    expect(maimaiChartPreviewChartId('834', 'SD')).toBe(834);
    expect(maimaiChartPreviewChartId('834', 'DX')).toBe(10834);
    expect(maimaiChartPreviewChartId('100834', 'UTAGE')).toBe(100834);
  });

  it('maps music id with chartId % 10000', () => {
    expect(maimaiChartPreviewMusicId(834)).toBe(834);
    expect(maimaiChartPreviewMusicId(10834)).toBe(834);
    expect(maimaiChartPreviewMusicId(100834)).toBe(834);
  });

  it('maps levelIndex to engine difficulty (+2)', () => {
    expect(maimaiChartPreviewEngineDifficulty(0)).toBe(2);
    expect(maimaiChartPreviewEngineDifficulty(3)).toBe(5);
    expect(maimaiChartPreviewEngineDifficulty(4)).toBe(6);
  });

  it('maps buddy sides to engine difficulty 2/3', () => {
    expect(maimaiChartPreviewBuddyEngineDifficulty(0)).toBe(2);
    expect(maimaiChartPreviewBuddyEngineDifficulty(1)).toBe(3);
  });

  it('builds asset urls', () => {
    expect(maimaiChartPreviewSimaiUrl(10834)).toBe('https://assets2.lxns.net/maimai/chart/10834.txt');
    expect(maimaiChartPreviewMusicUrl(10834)).toBe('https://assets2.lxns.net/maimai/music/834.mp3');
  });
});
