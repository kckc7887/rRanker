import { describe, expect, it } from 'vitest';
import {
  evaluateDisplayedPushPlan,
  findPushRecommendations,
  formatPushSearchSummary,
  resolvePushExactTarget,
  type PushRecommendationsResult,
} from '@/domain/phigros-push';
import type { PhigrosScoreEntry } from '@/domain/phigros';

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
    difficulty: 0,
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
  it('splits exact gain across songCost songs as perSongShare', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    const result = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      songCost: 4,
    });

    expect(result.songCost).toBe(4);
    expect(result.perSongShare).toBeCloseTo(result.gainNeeded / 4, 3);
    // 用户口径：涨约 0.1、成本 4 首 → 每首约 0.025（精确加值略小于显示加值）
    expect(result.perSongShare).toBeGreaterThan(0.02);
    expect(result.perSongShare).toBeLessThan(0.03);
  });

  it('finds charts that can cover one song share and sorts by ACC diff', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    const result = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      songCost: 1,
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
    expect(evaluateDisplayedPushPlan(gameRecord, difficultyTable, result.plan))
      .toBeGreaterThanOrEqual(result.exactTarget - 1e-9);

    const first = result.plan[0]!;
    expect(first.targetAcc).toBeGreaterThan(first.currentAcc);
    expect(first.rksGain).toBeGreaterThanOrEqual(result.perSongShare - 1e-6);

    for (let i = 1; i < shown.length; i++) {
      const previous = shown[i - 1]!;
      const current = shown[i]!;
      expect(current.accDiff > previous.accDiff
        || (current.accDiff === previous.accDiff && current.difficulty >= previous.difficulty)).toBe(true);
    }

    // 提高第一首到目标 ACC 后总 RKS 应至少达到「当前 + 单首份额」
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
      songCost: 1,
    });
    expect(after.currentRks).toBeGreaterThanOrEqual(result.currentRks + result.perSongShare);
  });

  it('higher songCost lowers per-song ACC requirement', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    const solo = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      songCost: 1,
    });
    const split = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      songCost: 4,
    });

    expect(split.perSongShare).toBeCloseTo(solo.perSongShare / 4, 3);
    expect(split.searchStatus).toBe('verified');
    expect(split.plan.length).toBeGreaterThan(1);
    expect(split.plan.length).toBeLessThanOrEqual(4);
    expect(Math.max(...split.plan.map((item) => item.targetAcc))).toBeLessThan(solo.plan[0]!.targetAcc);
    expect(evaluateDisplayedPushPlan(gameRecord, difficultyTable, split.plan))
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
      songCost: 2,
      includePhi: false,
    });
    expect(split.perSongShare).toBeCloseTo(split.gainNeeded / 2, 3);
    expect(split.searchStatus).toBe('unreachable');
    expect(split.combinationReachesTarget).toBe(false);
    expect(split.plan).toEqual([]);
    expect(split.recommendations).toEqual([]);
    expect(formatPushSearchSummary(split)).toContain('无法用 2 首');
    expect(formatPushSearchSummary(split)).not.toContain('没有 2 首');

    const solo = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      songCost: 1,
      includePhi: false,
    });
    expect(solo.searchStatus).toBe('verified');
    expect(solo.combinationReachesTarget).toBe(true);
    expect(solo.plan.length).toBeGreaterThan(0);
    expect(evaluateDisplayedPushPlan(gameRecord, difficultyTable, solo.plan))
      .toBeGreaterThanOrEqual(solo.exactTarget - 1e-9);
  });

  it('can exclude recommendations that require φ (target Acc 100%)', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    const withPhi = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      songCost: 1,
      includePhi: true,
    });
    const withoutPhi = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      songCost: 1,
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

function expectVerifiedPlan(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: Record<string, number[]>,
  result: PushRecommendationsResult,
) {
  expect(result.searchStatus).toBe('verified');
  expect(result.combinationReachesTarget).toBe(true);
  expect(result.recommendations).toEqual(result.plan);
  expect(result.plan.length).toBeGreaterThan(0);
  expect(result.plan.length).toBeLessThanOrEqual(result.songCost);
  const planKeys = new Set(result.plan.map((item) => `${item.songId}_${item.level}`));
  expect(result.alternatives.every((item) => !planKeys.has(`${item.songId}_${item.level}`))).toBe(true);
  expect(evaluateDisplayedPushPlan(gameRecord, difficultyTable, result.plan))
    .toBeGreaterThanOrEqual(result.exactTarget - 1e-9);
  const hardest = [...result.plan].sort((a, b) => b.accDiff - a.accDiff || b.difficulty - a.difficulty)[0];
  for (const alternative of result.alternatives) {
    const swapped = result.plan.map((item) => (
      item.songId === hardest?.songId && item.level === hardest.level ? alternative : item
    ));
    expect(evaluateDisplayedPushPlan(gameRecord, difficultyTable, swapped))
      .toBeGreaterThanOrEqual(result.exactTarget - 1e-9);
  }
  const mixed = [...result.plan, ...result.alternatives]
    .sort((a, b) => a.accDiff - b.accDiff || a.difficulty - b.difficulty)
    .slice(0, result.songCost);
  const mixedRks = evaluateDisplayedPushPlan(gameRecord, difficultyTable, mixed);
  if (mixedRks + 1e-9 < result.exactTarget) {
    expect(result.plan.map((item) => `${item.songId}:${item.targetAcc}`))
      .not.toEqual(mixed.map((item) => `${item.songId}:${item.targetAcc}`));
  }
}

describe('push plan invariants', () => {
  it('does not treat a sorted mix of the verified pair and substitutes as the plan', async () => {
    const { gameRecord, difficultyTable } = inCharts([
      { id: 'song.0', difficulty: 11.9, rawAcc: 96.28 },
      { id: 'song.1', difficulty: 15.1, rawAcc: 94.15 },
      { id: 'song.2', difficulty: 13.8, rawAcc: 95.63 },
      { id: 'song.3', difficulty: 16.6, rawAcc: 81.82 },
      { id: 'song.4', difficulty: 8.7, rawAcc: 87.95 },
      { id: 'song.5', difficulty: 8.9, rawAcc: 81.38 },
      { id: 'song.6', difficulty: 16.4, rawAcc: 81.95 },
      { id: 'song.7', difficulty: 12.7, rawAcc: 85.51 },
    ]);
    const result = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      songCost: 2,
      includePhi: false,
    });
    expectVerifiedPlan(gameRecord, difficultyTable, result);
  });

  it('finds a joint plan when no single chart can cover the average share', async () => {
    const { gameRecord, difficultyTable } = inCharts([
      { id: 'song.hi', difficulty: 16, rawAcc: 99.5 },
      { id: 'song.lo.a', difficulty: 4, rawAcc: 99.5 },
      { id: 'song.lo.b', difficulty: 4, rawAcc: 99.5 },
    ]);
    const result = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.02,
      songCost: 3,
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
      songCost: 3,
      includePhi: false,
      searchPoolLimit: 1,
    });
    expect(result.searchStatus).toBe('not_found');
    expect(result.combinationReachesTarget).toBe(false);
    expect(result.plan).toEqual([]);
    expect(formatPushSearchSummary(result)).toContain('在当前搜索范围内没有找到方案');
    expect(formatPushSearchSummary(result)).not.toContain('没有 3 首');
    expect(formatPushSearchSummary(result)).not.toContain('无解');
  });

  it('can recommend an unplayed chart', async () => {
    const { gameRecord, difficultyTable } = inCharts([
      { id: 'song.new', difficulty: 15, rawAcc: 0 },
    ]);
    const result = await findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      songCost: 1,
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
      songCost: 1,
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
      songCost: 2,
      signal: controller.signal,
    })).rejects.toThrow('user left');
  });

  it('aborts mid-search instead of returning a partial plan', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    let reads = 0;
    const flipping = {
      get aborted() { reads += 1; return reads > 4; },
      reason: new Error('stop-search'),
    };
    await expect(findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      songCost: 2,
      signal: flipping as AbortSignal,
    })).rejects.toThrow('stop-search');
    expect(reads).toBeGreaterThan(4);
  });

  it('yields to the event loop between search slices', async () => {
    const { gameRecord, difficultyTable } = buildPool();
    let clock = 1_000_000;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 30));
    let ticks = 0;
    const ticker = setInterval(() => { ticks += 1; }, 0);
    try {
      await findPushRecommendations(gameRecord, difficultyTable, { delta: 0.1, songCost: 2 });
    } finally {
      clearInterval(ticker);
      now.mockRestore();
    }
    expect(ticks).toBeGreaterThan(0);
  });
});
