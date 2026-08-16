import { CHUNITHM_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import type {
  ChunithmBests,
  ChunithmPersonalSnapshot,
  ChunithmPlayer,
  ChunithmScore,
} from '@/domain/chunithm-personal';
import type { Player, ScoreRecord } from '@/domain/models';
import type { CatalogDrivenScoreProvider } from '@/providers/contracts';
import { generatedSource } from '@/providers/generated-source';

type RatedGeneratedScore = {
  score: ChunithmScore;
  versionId: number;
};

export type MaxedChunithmSnapshot = Omit<ChunithmPersonalSnapshot, 'player'> & {
  player: ChunithmPlayer;
};


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

/** 1,010,000 + AJC 时的单谱面理论 OVER POWER。 */
export function maxChunithmChartOverPower(levelValue: number): number {
  return roundToTwo((Math.max(0, levelValue) + 3) * 5);
}

/** 中二难度档 → 统一难度槽位：0-4 按档位序号对齐（ULTIMA 落 remaster 槽），WORLD'S END 落特殊谱面槽。 */
const CHUNITHM_UNIFIED_DIFFICULTIES = [
  'basic', 'advanced', 'expert', 'master', 'remaster', 'utage',
] as const;

/** 统一模型侧：为每个未禁用谱面生成满成绩 ScoreRecord（WORLD'S END 无 Rating 语义，记 0）。 */
export function buildMaxedChunithmRecords(catalog: ChunithmCatalogSnapshot): ScoreRecord[] {
  return catalog.songs.flatMap((song) => {
    if (song.disabled) return [];
    return song.difficulties.map((difficulty): ScoreRecord => ({
      songId: String(song.id),
      type: 'SD',
      levelIndex: difficulty.difficulty,
      level: difficulty.level,
      difficulty: CHUNITHM_UNIFIED_DIFFICULTIES[difficulty.difficulty],
      difficultyConstant: difficulty.levelValue,
      charter: difficulty.noteDesigner,
      versionId: difficulty.versionId,
      title: song.title,
      achievements: 101,
      dxScore: null,
      rating: difficulty.difficulty === 5 ? 0 : maxChunithmChartRating(difficulty.levelValue),
      fc: 'alljusticecritical',
      fs: null,
      rate: 'sssp',
      version: song.versionTitle,
    }));
  });
}

/** 转换层：统一 ScoreRecord → 旧 ChunithmScore 兼容模型（存储/展示边界，字段值与迁移前直构完全一致）。 */
function chunithmScoreFromRecord(record: ScoreRecord): ChunithmScore {
  return {
    id: Number(record.songId),
    song_name: record.title,
    level: record.level,
    level_index: record.levelIndex,
    score: 1_010_000,
    ...(record.levelIndex === 5
      ? {}
      : {
          rating: record.rating,
          over_power: maxChunithmChartOverPower(record.difficultyConstant),
        }),
    clear: 'catastrophy',
    full_combo: 'alljusticecritical',
    full_chain: 'fullchain2',
    rank: 'sssp',
  };
}

export function buildMaxedChunithmScores(
  catalog: ChunithmCatalogSnapshot,
): ChunithmScore[] {
  return buildMaxedChunithmRecords(catalog).map(chunithmScoreFromRecord);
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
  const maxOverPowerBySong = new Map<string, number>();
  for (const score of scores) {
    if (score.over_power === undefined) continue;
    const key = String(score.id);
    maxOverPowerBySong.set(
      key,
      Math.max(maxOverPowerBySong.get(key) ?? 0, score.over_power),
    );
  }
  const overPower = roundToTwo(
    [...maxOverPowerBySong.values()].reduce((sum, value) => sum + value, 0),
  );
  const player: ChunithmPlayer = {
    name: displayName,
    level: 99,
    rating,
    rating_possession: 'rainbow',
    friend_code: CHUNITHM_TEST_ACCOUNT_ID,
    class_emblem: { base: 0, medal: 0 },
    reborn_count: 0,
    over_power: overPower,
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

export class MaxedChunithmTestProvider implements CatalogDrivenScoreProvider<ChunithmCatalogSnapshot> {
  constructor(private readonly displayName = '示例账号') {}

  async getPlayer(): Promise<Player> {
    return {
      id: CHUNITHM_TEST_ACCOUNT_ID,
      displayName: this.displayName,
      rating: 0,
      source: generatedSource(),
    };
  }

  async getRecordsFromCatalog(catalog: ChunithmCatalogSnapshot): Promise<ScoreRecord[]> {
    return buildMaxedChunithmRecords(catalog);
  }
}
