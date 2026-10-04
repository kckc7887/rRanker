import { describe, expect, it } from 'vitest';
import {
  PHIGROS_PUSH_LIMITS,
  PhigrosPushInputError,
  findPushRecommendations,
  formatPushSearchSummary,
  parsePhigrosPushChartCost,
  parsePhigrosPushDelta,
  resolvePhigrosPushRequest,
  resolvePushExactTarget,
  type PushRecommendationsResult,
} from '@/domain/phigros-push';
import { computeB30, type PhigrosScoreEntry } from '@/domain/phigros';

describe('resolvePushExactTarget', () => {
  it('maps 16.1691 + 0.01 to exact 16.1750 and display 16.18', () => {
    const result = resolvePushExactTarget(16.1691, 0.01);
    expect(result.displayRks).toBe(16.17);
    expect(result.exactTarget).toBeCloseTo(16.175, 6);
    expect(result.displayTarget).toBeCloseTo(16.18, 6);
  });

  it('supports larger delta like 0.1', () => {
    const result = resolvePushExactTarget(16.1691, 0.1);
    expect(result.displayRks).toBe(16.17);
    expect(result.exactTarget).toBeCloseTo(16.265, 6);
    expect(result.displayTarget).toBeCloseTo(16.27, 6);
  });
});

function pushInputErrorCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof PhigrosPushInputError ? error.code : `未预期错误：${String(error)}`;
  }
  return '未抛出错误';
}

describe('push request parameters', () => {
  it('rejects overflow after delta quantization and invalid search budgets', () => {
    expect(parsePhigrosPushDelta(Number.MAX_VALUE)).toBeNull();
    for (const searchPoolLimit of [NaN, Infinity, -1, 0, 1.5, Number.MAX_VALUE]) {
      expect(pushInputErrorCode(() => resolvePhigrosPushRequest({ delta: 0.01, chartCost: 1, searchPoolLimit })))
        .toBe('search_pool_out_of_range');
    }
    expect(resolvePhigrosPushRequest({ delta: 0.01, chartCost: 1, searchPoolLimit: 1 }).searchPoolLimit).toBe(1);
  });
  it('accepts the legal boundaries and normalizes delta to two decimals', () => {
    expect(parsePhigrosPushDelta(PHIGROS_PUSH_LIMITS.minDelta)).toBe(0.01);
    expect(parsePhigrosPushDelta(0.1)).toBe(0.1);
    expect(parsePhigrosPushDelta(0.015)).toBe(0.02);
    expect(parsePhigrosPushChartCost(PHIGROS_PUSH_LIMITS.minChartCost)).toBe(1);
    expect(parsePhigrosPushChartCost(PHIGROS_PUSH_LIMITS.maxChartCost)).toBe(30);
    expect(parsePhigrosPushChartCost(7)).toBe(7);
  });

  it('rejects non-finite, out-of-range and fractional inputs', () => {
    for (const delta of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -1,
      PHIGROS_PUSH_LIMITS.minDelta - 0.001,
    ]) {
      expect(parsePhigrosPushDelta(delta)).toBeNull();
    }
    for (const chartCost of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -1,
      PHIGROS_PUSH_LIMITS.maxChartCost + 1,
      1.5,
    ]) {
      expect(parsePhigrosPushChartCost(chartCost)).toBeNull();
    }
  });

  it('resolves one normalized request or refuses it with a stable code', () => {
    expect(resolvePhigrosPushRequest({ delta: 0.015, chartCost: 30, includePhi: false })).toEqual({
      delta: 0.02,
      chartCost: 30,
      includePhi: false,
      searchPoolLimit: undefined,
      signal: undefined,
    });
    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(pushInputErrorCode(() => resolvePhigrosPushRequest({ delta, chartCost: 1 })))
        .toBe('delta_out_of_range');
    }
    for (const chartCost of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 31, 1.5]) {
      expect(pushInputErrorCode(() => resolvePhigrosPushRequest({ delta: 0.01, chartCost })))
        .toBe('chart_cost_out_of_range');
    }
  });

  it('refuses illegal requests instead of encoding them as a search conclusion', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      await expect(findPushRecommendations(gameRecord, difficultyTable, { delta, chartCost: 1 }))
        .rejects.toMatchObject({ code: 'delta_out_of_range' });
    }
    for (const chartCost of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 31, 1.5]) {
      await expect(findPushRecommendations(gameRecord, difficultyTable, { delta: 0.01, chartCost }))
        .rejects.toMatchObject({ code: 'chart_cost_out_of_range' });
    }
  });

  it('keeps the legal boundaries searchable with the normalized delta', async () => {
    const { gameRecord, difficultyTable } = inCharts([{ id: 'song.new', difficulty: 15, rawAcc: 0 }]);
    const single = await findPushRecommendations(gameRecord, difficultyTable, { delta: 0.01, chartCost: 1 });
    expect(single.chartCost).toBe(1);
    expect(single.searchStatus).toBe('verified');
    expectVerifiedPlan(gameRecord, difficultyTable, single);

    const maximum = await findPushRecommendations(gameRecord, difficultyTable, { delta: 0.01, chartCost: 30 });
    expect(maximum.chartCost).toBe(30);
    expect(maximum.perChartShare).toBeCloseTo(maximum.gainNeeded / 30, 3);

    const rounded = await findPushRecommendations(gameRecord, difficultyTable, { delta: 0.014, chartCost: 1 });
    expect(rounded.exactTarget)
      .toBe(resolvePushExactTarget(rounded.currentRks, 0.01).exactTarget);
  });
});

function entry(
  songId: string,
  level: 0 | 1 | 2 | 3,
  difficulty: number,
  score: number,
  rawAcc: number,
): PhigrosScoreEntry {
  return {
    songId,
    level,
    difficulty,
    score,
    rawAcc,
    acc: Math.round(rawAcc * 100) / 100,
    fc: false,
    rks: 0,
  };
}

function buildPool(lowAccIndex = 29) {
  const gameRecord: Record<string, (PhigrosScoreEntry | null)[]> = {};
  const difficultyTable: Record<string, number[]> = {};

  for (let i = 0; i < 30; i++) {
    const id = `song.${i}`;
    const diff = 15 - i * 0.05;
    difficultyTable[id] = [0, 0, diff, 0];
    const acc = i === lowAccIndex ? 92 : 99.5;
    const score = Math.floor(acc * 10000);
    gameRecord[id] = [null, null, entry(id, 2, diff, score, acc), null];
  }

  return { gameRecord, difficultyTable };
}

describe('findPushRecommendations', () => {
  it('splits exact gain across chartCost charts as perChartShare', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    const result = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      chartCost: 4,
    });

    expect(result.chartCost).toBe(4);
    expect(result.perChartShare).toBeCloseTo(result.gainNeeded / 4, 3);
    expect(result.perChartShare).toBeGreaterThan(0.02);
    expect(result.perChartShare).toBeLessThan(0.03);
  });

  it('finds charts that can cover one song share and sorts by ACC diff', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    const result = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      chartCost: 1,
    });

    expect(result.currentRks).toBeGreaterThan(0);
    expect(result.exactTarget).toBe(
      resolvePushExactTarget(result.currentRks, 0.01).exactTarget,
    );
    const shown = [...result.plan, ...result.alternatives];
    expect(shown.length).toBeGreaterThan(0);
    expect(result.plan).toEqual([shown[0]]);
    expect(result.recommendations).toEqual(result.plan);
    expect(result.searchStatus).toBe('verified');
    expect(resultingRks(gameRecord, difficultyTable, result.plan))
      .toBeGreaterThanOrEqual(result.exactTarget - 1e-9);

    const first = result.plan[0]!;
    expect(first.targetAcc).toBeGreaterThan(first.currentAcc);
    expect(first.rksGain).toBeGreaterThanOrEqual(result.perChartShare - 1e-6);

    for (let i = 1; i < shown.length; i++) {
      const previous = shown[i - 1]!;
      const current = shown[i]!;
      expect(current.accDiff > previous.accDiff
        || (current.accDiff === previous.accDiff && current.difficulty >= previous.difficulty)).toBe(true);
    }

    const pushSong = first.songId;
    const pushed = { ...gameRecord };
    const levels = [...(pushed[pushSong] ?? [null, null, null, null])];
    const existing = levels[first.level];
    levels[first.level] = {
      ...(existing ?? entry(pushSong, first.level, first.difficulty, 0, 0)),
      rawAcc: first.targetAcc,
      acc: first.targetAcc,
      score: Math.min(1_000_000, Math.floor(first.targetAcc * 10000)),
    };
    pushed[pushSong] = levels;

    const after = await findPushRecommendations(pushed, difficultyTable, {
      delta: 0.01,
      chartCost: 1,
    });
    expect(after.currentRks).toBeGreaterThanOrEqual(result.currentRks + result.perChartShare);
  });

  it('higher chartCost lowers the per-chart ACC requirement', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    const solo = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      chartCost: 1,
    });
    const split = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      chartCost: 4,
    });

    expect(split.perChartShare).toBeCloseTo(solo.perChartShare / 4, 3);
    expect(split.searchStatus).toBe('verified');
    expect(split.plan.length).toBeGreaterThan(1);
    expect(split.plan.length).toBeLessThanOrEqual(4);
    expect(Math.max(...split.plan.map((item) => item.targetAcc))).toBeLessThan(solo.plan[0]!.targetAcc);
    expect(resultingRks(gameRecord, difficultyTable, split.plan))
      .toBeGreaterThanOrEqual(split.exactTarget - 1e-9);
  });

  it('hides per-song targets when two charts compete for one Best27 slot', async () => {
    const gameRecord: Record<string, (PhigrosScoreEntry | null)[]> = {};
    const difficultyTable: Record<string, number[]> = {};
    for (let i = 0; i < 26; i += 1) {
      const id = `kept.${i}`;
      difficultyTable[id] = [0, 0, 16, 0];
      gameRecord[id] = [null, null, entry(id, 2, 16, 1_000_000, 100), null];
    }
    difficultyTable.weak = [0, 0, 10, 0];
    gameRecord.weak = [null, null, entry('weak', 2, 10, 1_000_000, 100), null];
    for (const id of ['rival.a', 'rival.b']) {
      difficultyTable[id] = [0, 0, 15, 0];
      gameRecord[id] = [null, null, entry(id, 2, 15, 800_000, 80), null];
    }

    const split = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.2,
      chartCost: 2,
      includePhi: false,
    });
    expect(split.perChartShare).toBeCloseTo(split.gainNeeded / 2, 3);
    expect(split.searchStatus).toBe('unreachable');
    expect(split.combinationReachesTarget).toBe(false);
    expect(split.plan).toEqual([]);
    expect(split.recommendations).toEqual([]);
    expect(formatPushSearchSummary(split)).toContain('无法用 2 张谱面');
    expect(formatPushSearchSummary(split)).not.toContain('没有 2 张谱面');

    const solo = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      chartCost: 1,
      includePhi: false,
    });
    expect(solo.searchStatus).toBe('verified');
    expect(solo.combinationReachesTarget).toBe(true);
    expect(solo.plan.length).toBeGreaterThan(0);
    expect(resultingRks(gameRecord, difficultyTable, solo.plan))
      .toBeGreaterThanOrEqual(solo.exactTarget - 1e-9);
  });

  it('can exclude recommendations that require φ (target Acc 100%)', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    const withPhi = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      chartCost: 1,
      includePhi: true,
    });
    const withoutPhi = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      chartCost: 1,
      includePhi: false,
    });

    const withAll = [...withPhi.plan, ...withPhi.alternatives];
    const withoutAll = [...withoutPhi.plan, ...withoutPhi.alternatives];
    expect(withPhi.includePhi).toBe(true);
    expect(withoutPhi.includePhi).toBe(false);
    expect(withoutAll.every((item) => item.targetAcc < 100)).toBe(true);
    expect(withoutAll.length).toBeLessThanOrEqual(withAll.length);

    const phiOnlyCount = withAll.filter((item) => item.targetAcc >= 100).length;
    if (phiOnlyCount > 0) {
      expect(withoutAll.length).toBe(withAll.length - phiOnlyCount);
    }
  });
});

function inCharts(rows: readonly { id: string; difficulty: number; rawAcc: number }[]) {
  const gameRecord: Record<string, (PhigrosScoreEntry | null)[]> = {};
  const difficultyTable: Record<string, number[]> = {};
  for (const row of rows) {
    difficultyTable[row.id] = [0, 0, row.difficulty, 0];
    const score = row.rawAcc <= 0 ? 0 : Math.round(row.rawAcc * 10000);
    gameRecord[row.id] = row.rawAcc <= 0
      ? [null, null, null, null]
      : [null, null, entry(row.id, 2, row.difficulty, score, row.rawAcc), null];
  }
  return { gameRecord, difficultyTable };
}

function resultingRks(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: Record<string, number[]>,
  plan: PushRecommendationsResult['plan'],
): number {
  const updated = structuredClone(gameRecord);
  for (const target of plan) {
    const levels = updated[target.songId] ?? [null, null, null, null];
    levels[target.level] = entry(target.songId, target.level, target.difficulty,
      Math.round(target.targetAcc * 10000), target.targetAcc);
    updated[target.songId] = levels;
  }
  return computeB30(updated, difficultyTable).rks;
}

function expectVerifiedPlan(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: Record<string, number[]>,
  result: PushRecommendationsResult,
) {
  expect(result.searchStatus).toBe('verified');
  expect(result.combinationReachesTarget).toBe(true);
  expect(resultingRks(gameRecord, difficultyTable, result.plan))
    .toBeGreaterThanOrEqual(result.exactTarget - 1e-9);
}

describe('push recommendations', () => {

  it('finds a joint plan when no single chart can cover the average share', async () => {
    const { gameRecord, difficultyTable } = inCharts([
      { id: 'song.hi', difficulty: 16, rawAcc: 99.5 },
      { id: 'song.lo.a', difficulty: 4, rawAcc: 99.5 },
      { id: 'song.lo.b', difficulty: 4, rawAcc: 99.5 },
    ]);
    const result = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.02,
      chartCost: 3,
      includePhi: false,
    });
    expectVerifiedPlan(gameRecord, difficultyTable, result);
    expect(result.exactTarget).toBeCloseTo(0.795, 6);
  });

  it('reports not_found instead of impossibility when the candidate pool is too small', async () => {
    const { gameRecord, difficultyTable } = inCharts([
      { id: 'song.hi', difficulty: 16, rawAcc: 99.5 },
      { id: 'song.lo.a', difficulty: 4, rawAcc: 99.5 },
      { id: 'song.lo.b', difficulty: 4, rawAcc: 99.5 },
    ]);
    const result = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.02,
      chartCost: 3,
      includePhi: false,
      searchPoolLimit: 1,
    });
    expect(result.searchStatus).toBe('not_found');
    expect(result.combinationReachesTarget).toBe(false);
    expect(result.plan).toEqual([]);
    expect(formatPushSearchSummary(result)).toContain('在当前搜索范围内没有找到方案');
    expect(formatPushSearchSummary(result)).not.toContain('没有 3 张谱面');
    expect(formatPushSearchSummary(result)).not.toContain('无解');
  });

  it('can recommend an unplayed chart', async () => {
    const { gameRecord, difficultyTable } = inCharts([
      { id: 'song.new', difficulty: 15, rawAcc: 0 },
    ]);
    const result = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      chartCost: 1,
      includePhi: false,
    });
    expectVerifiedPlan(gameRecord, difficultyTable, result);
    expect(result.plan[0]).toMatchObject({ songId: 'song.new', currentAcc: 0 });
  });

  it('sorts equal Acc gaps by difficulty', async () => {
    const { gameRecord, difficultyTable } = inCharts([
      { id: 'song.low', difficulty: 10, rawAcc: 90 },
      { id: 'song.high', difficulty: 12, rawAcc: 90 },
    ]);
    const result = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      chartCost: 1,
    });
    expectVerifiedPlan(gameRecord, difficultyTable, result);
    const shown = [...result.plan, ...result.alternatives];
    for (let i = 1; i < shown.length; i += 1) {
      const previous = shown[i - 1]!;
      const current = shown[i]!;
      if (previous.accDiff === current.accDiff) expect(current.difficulty).toBeGreaterThanOrEqual(previous.difficulty);
    }
  });
});

describe('findPushRecommendations cancellation', () => {
  it('throws the abort reason without searching when already cancelled', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    const controller = new AbortController();
    controller.abort(new Error('user left'));
    await expect(findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      chartCost: 2,
      signal: controller.signal,
    })).rejects.toThrow('user left');
  });

  it('cancels while the search yields to the event loop', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    const controller = new AbortController();
    let clock = 1_000_000;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 30));
    const timer = setTimeout(() => controller.abort(new Error('stop-search')), 0);
    try {
      await expect(findPushRecommendations(gameRecord, difficultyTable, {
        delta: 0.1, chartCost: 2, signal: controller.signal,
      })).rejects.toThrow('stop-search');
    } finally {
      clearTimeout(timer);
      now.mockRestore();
    }
  });

  it('yields to the event loop between search slices', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    let clock = 1_000_000;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 30));
    let ticks = 0;
    const ticker = setInterval(() => { ticks += 1; }, 0);
    try {
      await findPushRecommendations(gameRecord, difficultyTable, { delta: 0.1, chartCost: 2 });
    } finally {
      clearInterval(ticker);
      now.mockRestore();
    }
    expect(ticks).toBeGreaterThan(0);
  });
});
