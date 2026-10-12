import type { TufLevel, TufPass, TufPlayerSnapshot } from '@/domain/tuf';
import { generatedSource } from '@/providers/generated-source';

export function buildMaxedTufPass(level: TufLevel): TufPass | null {
  if (level.baseScore == null) return null;
  const notes = level.tilecount ?? level.autoTileCount;
  return {
    id: level.id,
    levelId: level.id,
    level,
    scoreV2: level.baseScore,
    accuracy: 100,
    speed: 1,
    judgements: notes == null ? null : {
      earlyDouble: 0,
      earlySingle: 0,
      ePerfect: 0,
      perfect: notes,
      lPerfect: 0,
      lateSingle: 0,
      lateDouble: 0,
    },
  };
}

export function maxedTufPlayerSnapshot(displayName = '示例账号'): TufPlayerSnapshot {
  return {
    data: {
      id: 0,
      name: displayName,
      avatarUrl: null,
      rankedScore: 114514,
      generalScore: 0,
      ppScore: 0,
      averageXacc: 100,
      globalRank: 1,
      totalPasses: 0,
      universalPassCount: 0,
      worldFirstCount: 0,
      topScores: [],
    },
    source: generatedSource(),
  };
}
