import { CHUNITHM_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import type {
  ChunithmBests,
  ChunithmPersonalSnapshot,
  ChunithmPlayer,
  ChunithmScore,
} from '@/domain/chunithm-personal';
import type { DataSource } from '@/domain/models';

type RatedGeneratedScore = {
  score: ChunithmScore;
  versionId: number;
};

export type MaxedChunithmSnapshot = Omit<ChunithmPersonalSnapshot, 'player'> & {
  player: ChunithmPlayer;
};

function generatedSource(): DataSource {
  return {
    kind: 'generated',
    label: '示例查分器（全曲全谱面满成绩）',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function truncateToTwo(value: number): number {
  return Math.floor((value + Number.EPSILON) * 100) / 100;
}

function compareGeneratedScores(left: ChunithmScore, right: ChunithmScore): number {
  return (right.rating ?? Number.NEGATIVE_INFINITY)
    - (left.rating ?? Number.NEGATIVE_INFINITY)
    || right.score - left.score
    || String(left.id).localeCompare(String(right.id), 'en')
    || left.level_index - right.level_index;
}

function scoreKey(score: ChunithmScore): string {
  return `${score.id}-${score.level_index}`;
}

export function maxChunithmChartRating(levelValue: number): number {
  return roundToTwo(Math.max(0, levelValue) + 2.15);
}

export function buildMaxedChunithmScores(
  catalog: ChunithmCatalogSnapshot,
): ChunithmScore[] {
  return catalog.songs.flatMap((song) => {
    if (song.disabled) return [];
    return song.difficulties.map((difficulty): ChunithmScore => ({
      id: song.id,
      song_name: song.title,
      level: difficulty.level,
      level_index: difficulty.difficulty,
      score: 1_010_000,
      ...(difficulty.difficulty === 5
        ? {}
        : { rating: maxChunithmChartRating(difficulty.levelValue) }),
      clear: 'catastrophy',
      full_combo: 'alljusticecritical',
      full_chain: 'fullchain2',
      rank: 'sssp',
    }));
  });
}

export function buildMaxedChunithmBests(
  catalog: ChunithmCatalogSnapshot,
  scores: readonly ChunithmScore[],
): ChunithmBests {
  const scoreByKey = new Map(scores.map((score) => [scoreKey(score), score] as const));
  const rated = catalog.songs.flatMap((song): RatedGeneratedScore[] => (
    song.disabled
      ? []
      : song.difficulties.flatMap((difficulty): RatedGeneratedScore[] => {
          if (difficulty.difficulty === 5) return [];
          const score = scoreByKey.get(`${song.id}-${difficulty.difficulty}`);
          return score ? [{ score, versionId: difficulty.versionId }] : [];
        })
  ));

  const current = rated
    .filter((entry) => entry.versionId === catalog.currentVersion.id)
    .sort((left, right) => compareGeneratedScores(left.score, right.score));
  const newBests = current.slice(0, 20).map((entry) => entry.score);
  const used = new Set(newBests.map(scoreKey));
  const remaining = rated
    .filter((entry) => !used.has(scoreKey(entry.score)))
    .sort((left, right) => compareGeneratedScores(left.score, right.score));
  const bests = remaining.slice(0, 30).map((entry) => entry.score);
  const bestKeys = new Set(bests.map(scoreKey));
  const selections = remaining
    .filter((entry) => !bestKeys.has(scoreKey(entry.score)))
    .slice(0, 10)
    .map((entry) => entry.score);

  return { bests, selections, new_bests: newBests };
}

export function buildMaxedChunithmSnapshot(
  catalog: ChunithmCatalogSnapshot,
  displayName = '示例账号',
): MaxedChunithmSnapshot {
  const scores = buildMaxedChunithmScores(catalog);
  const bests = buildMaxedChunithmBests(catalog, scores);
  const ratingTotal = [...bests.bests, ...bests.new_bests]
    .reduce((sum, score) => sum + (score.rating ?? 0), 0);
  const rating = truncateToTwo(ratingTotal / 50);
  const player: ChunithmPlayer = {
    name: displayName,
    level: 99,
    rating,
    rating_possession: 'rainbow',
    friend_code: CHUNITHM_TEST_ACCOUNT_ID,
    class_emblem: { base: 0, medal: 0 },
    reborn_count: 0,
    over_power: 0,
    over_power_progress: 100,
    currency: 0,
    total_currency: 0,
    total_play_count: scores.length,
    trophy: null,
    character: null,
    name_plate: null,
    map_icon: null,
  };

  return {
    player,
    scores,
    bests,
    source: generatedSource(),
  };
}
