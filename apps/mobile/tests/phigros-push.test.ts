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

describe('findPushRecommendations', () => {
  it('finds a chart whose higher ACC alone reaches the exact target', () => {
    // 构造足够多的中高 RKS 谱面，使总 RKS 落在可推区间
    const gameRecord: Record<string, (PhigrosScoreEntry | null)[]> = {};
    const difficultyTable: Record<string, number[]> = {};

    for (let i = 0; i < 30; i++) {
      const id = `song.${i}`;
      const diff = 15 - i * 0.05;
      difficultyTable[id] = [0, 0, diff, 0];
      // 前几首较高 acc，最后一首明显偏低，作为推分候选
      const acc = i === 29 ? 92 : 99.5;
      const score = Math.floor(acc * 10000);
      gameRecord[id] = [null, null, entry(id, 2, diff, score, acc), null];
    }

    const result = findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      topN: 10,
    });

    expect(result.currentRks).toBeGreaterThan(0);
    expect(result.exactTarget).toBe(
      resolvePushExactTarget(result.currentRks, 0.01).exactTarget,
    );
    expect(result.recommendations.length).toBeGreaterThan(0);

    const first = result.recommendations[0]!;
    expect(first.targetAcc).toBeGreaterThan(first.currentAcc);
    expect(first.accDiff).toBeGreaterThanOrEqual(0);

    // 应按 ACC 差值升序
    for (let i = 1; i < result.recommendations.length; i++) {
      expect(result.recommendations[i]!.accDiff)
        .toBeGreaterThanOrEqual(result.recommendations[i - 1]!.accDiff);
    }

    // 提高第一首到目标 ACC 后总 RKS 应达到 exactTarget
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
      topN: 1,
    });
    expect(after.currentRks).toBeGreaterThanOrEqual(result.exactTarget);
  });

  it('respects topN limit', () => {
    const gameRecord: Record<string, (PhigrosScoreEntry | null)[]> = {};
    const difficultyTable: Record<string, number[]> = {};
    for (let i = 0; i < 30; i++) {
      const id = `cap.${i}`;
      difficultyTable[id] = [0, 0, 14, 0];
      gameRecord[id] = [null, null, entry(id, 2, 14, 980000, 98), null];
    }
    const result = findPushRecommendations(gameRecord, difficultyTable, {
      delta: 0.01,
      topN: 3,
    });
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
  });
});
