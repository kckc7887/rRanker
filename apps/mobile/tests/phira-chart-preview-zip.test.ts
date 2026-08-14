import { describe, expect, it } from 'vitest';
import {
  classifyPhiraChartFormat,
  PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE,
  resolvePhiraChartZipMediaPlan,
} from '@/domain/phira-chart-preview';

const files = (names: string[]) => names.map((name) => ({ name, dir: false }));

describe('phira chart preview zip media plan', () => {
  it('按 info.yml 的 chart/music/illustration 键定位条目', () => {
    const plan = resolvePhiraChartZipMediaPlan(
      files(['info.yml', 'chart.json', 'song.mp3', 'bg.png', 'sub/extra.txt']),
      'chart: chart.json\nmusic: song.mp3\nillustration: bg.png\nformat: pgr',
    );
    expect(plan).toEqual({ chartEntryName: 'chart.json', musicEntryName: 'song.mp3', illustrationEntryName: 'bg.png' });
  });

  it('缺少 info.yml 时按扩展名推断谱面与音乐', () => {
    const plan = resolvePhiraChartZipMediaPlan(files(['chart.json', 'song.ogg']), null);
    expect(plan).toEqual({ chartEntryName: 'chart.json', musicEntryName: 'song.ogg', illustrationEntryName: null });
  });

  it('info.yml 键指向不存在的条目时回退扩展名推断', () => {
    const plan = resolvePhiraChartZipMediaPlan(
      files(['res/chart.json', 'res/song.mp3']),
      'chart: chart.json\nmusic: song.mp3',
    );
    expect(plan).toEqual({ chartEntryName: 'res/chart.json', musicEntryName: 'res/song.mp3', illustrationEntryName: null });
  });

  it('无谱面或无音乐时返回空并交由调用方报错', () => {
    expect(resolvePhiraChartZipMediaPlan(files(['song.mp3']), null).chartEntryName).toBeNull();
    expect(resolvePhiraChartZipMediaPlan(files(['chart.json']), null).musicEntryName).toBeNull();
  });
});

describe('phira chart format classification', () => {
  it('PGR JSON 判定为 pgr，RPE JSON 按 META 键判定', () => {
    expect(classifyPhiraChartFormat('chart.json', null, '{"formatVersion":3,"judgeLineList":[]}')).toBe('pgr');
    expect(classifyPhiraChartFormat('chart.json', null, '{"META":{},"judgeLineList":[]}')).toBe('rpe');
    expect(classifyPhiraChartFormat('chart.json', 'rpe', '{}')).toBe('rpe');
  });

  it('PEC 文本与 PBC 二进制按扩展名或 format 键判定', () => {
    expect(classifyPhiraChartFormat('chart.pec', null, 'n1 0 0 0 1 0')).toBe('pec');
    expect(classifyPhiraChartFormat('chart.json', 'pec', 'cp 0\nn1 0 0 0 1 0')).toBe('pec');
    expect(classifyPhiraChartFormat('chart.pbc', null, '')).toBe('pbc');
    expect(classifyPhiraChartFormat('chart.json', 'pbc', '')).toBe('pbc');
  });

  it('非 PGR 谱面使用统一不支持文案', () => {
    expect(PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE).toContain('仅支持 PGR');
  });
});
