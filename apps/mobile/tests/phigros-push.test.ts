import { describe, expect, it } from 'vitest';
import {
  findPushRecommendations,
  resolvePushExactTarget,
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
  it('splits exact gain across songCost songs as perSongShare', () => {
    const { gameRecord, difficultyTable } = buildPool();
    const result = findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      songCost: 4,
    });

    expect(result.songCost).toBe(4);
    expect(result.perSongShare).toBeCloseTo(result.gainNeeded / 4, 3);
    // 用户口径：涨约 0.1、成本 4 首 → 每首约 0.025（精确加值略小于显示加值）
    expect(result.perSongShare).toBeGreaterThan(0.02);
    expect(result.perSongShare).toBeLessThan(0.03);
  });

  it('finds charts that can cover one song share and sorts by ACC diff', () => {
    const { gameRecord, difficultyTable } = buildPool();
    const result = findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      songCost: 1,
    });

    expect(result.currentRks).toBeGreaterThan(0);
    expect(result.exactTarget).toBe(
      resolvePushExactTarget(result.currentRks, 0.01).exactTarget,
    );
    expect(result.recommendations.length).toBeGreaterThan(0);

    const first = result.recommendations[0]!;
    expect(first.targetAcc).toBeGreaterThan(first.currentAcc);
    expect(first.rksGain).toBeGreaterThanOrEqual(result.perSongShare - 1e-6);

    for (let i = 1; i < result.recommendations.length; i++) {
      expect(result.recommendations[i]!.accDiff)
        .toBeGreaterThanOrEqual(result.recommendations[i - 1]!.accDiff);
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

    const after = findPushRecommendations(pushed, difficultyTable, {
      delta: 0.01,
      songCost: 1,
    });
    expect(after.currentRks).toBeGreaterThanOrEqual(result.currentRks + result.perSongShare);
  });

  it('higher songCost lowers per-song ACC requirement', () => {
    const { gameRecord, difficultyTable } = buildPool();
    const solo = findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      songCost: 1,
    });
    const split = findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      songCost: 4,
    });

    expect(split.perSongShare).toBeCloseTo(solo.perSongShare / 4, 3);

    // 取两边都有、且未顶满 100% 的同一谱面比较
    const comparable = solo.recommendations.find((s) => {
      const other = split.recommendations.find(
        (r) => r.songId === s.songId && r.level === s.level,
      );
      return other != null && s.targetAcc < 100 && other.targetAcc < 100;
    });
    expect(comparable).toBeDefined();
    const splitSame = split.recommendations.find(
      (r) => r.songId === comparable!.songId && r.level === comparable!.level,
    )!;
    expect(splitSame.targetAcc).toBeLessThan(comparable!.targetAcc);
  });

  it('can exclude recommendations that require φ (target Acc 100%)', () => {
    const { gameRecord, difficultyTable } = buildPool();
    const withPhi = findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      songCost: 1,
      includePhi: true,
    });
    const withoutPhi = findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.1,
      songCost: 1,
      includePhi: false,
    });

    expect(withPhi.includePhi).toBe(true);
    expect(withoutPhi.includePhi).toBe(false);
    expect(withoutPhi.recommendations.every((r) => r.targetAcc < 100)).toBe(true);
    expect(withoutPhi.recommendations.length).toBeLessThanOrEqual(withPhi.recommendations.length);

    const phiOnlyCount = withPhi.recommendations.filter((r) => r.targetAcc >= 100).length;
    if (phiOnlyCount > 0) {
      expect(withoutPhi.recommendations.length).toBe(withPhi.recommendations.length - phiOnlyCount);
    }
  });
});
