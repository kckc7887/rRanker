import { describe, expect, it } from 'vitest';
import { PhiraChartSchema, formatPhiraAccuracy } from '@/domain/phira';
import { TufLevelSchema } from '@/domain/tuf';
import { buildMaxedPhiraBest, maxedPhiraPlayerSnapshot } from '@/providers/maxed-phira-test-provider';
import { buildMaxedTufPass, maxedTufPlayerSnapshot } from '@/providers/maxed-tuf-test-provider';

describe('Phira 与 ADOFAI 满成绩示例', () => {
  it('固定账号总览，并从实际谱面生成 Phira 满分、满连与准确率', () => {
    const player = maxedPhiraPlayerSnapshot('测试玩家');
    expect(player.player).toMatchObject({ name: '测试玩家', rks: 19 });
    expect(player.stats).toEqual({ numRecords: 114514, avgAccuracy: 1 });
    expect(formatPhiraAccuracy(player.stats.avgAccuracy)).toBe('100.00%');
    const chart = PhiraChartSchema.parse({ id: 44992, name: '谱面', difficulty: 19.1, level: 'AT', uploader: 1 });
    const best = buildMaxedPhiraBest(chart, { click: 40, hold: 20, flick: 20, drag: 20 });
    expect(best.chart).toBe(chart);
    expect(best).toMatchObject({ poolRks: 19.1, record: { chart: 44992, score: 1_000_000, accuracy: 1, fullCombo: true, perfect: 100, good: 0, bad: 0, miss: 0 } });
  });

  it('固定 TUF 排名与总分，单谱使用真实基准满分，缺失时保留空成绩', () => {
    const player = maxedTufPlayerSnapshot('测试玩家');
    expect(player.data).toMatchObject({ name: '测试玩家', rankedScore: 114514, globalRank: 1 });
    const level = TufLevelSchema.parse({ id: 11372, song: '关卡', baseScore: 32000, tilecount: 421 });
    expect(buildMaxedTufPass(level)).toMatchObject({ levelId: 11372, level, scoreV2: 32000, speed: 1, accuracy: 100, judgements: { perfect: 421 } });
    expect(buildMaxedTufPass({ ...level, baseScore: null })).toBeNull();
  });
});
