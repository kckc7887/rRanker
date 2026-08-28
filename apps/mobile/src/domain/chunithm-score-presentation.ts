import type {
  ChunithmCatalogSnapshot,
  ChunithmLevelIndex,
  ChunithmSong,
} from './chunithm';
import type { ChunithmScore } from './chunithm-personal';
import { chunithmJacketUrl } from './chunithm-assets';

export type ChunithmRank =
  | 'SSS+' | 'SSS' | 'SS+' | 'SS' | 'S+' | 'S'
  | 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'C' | 'D';

export type ChunithmAchievementTone = 'rainbow' | 'platinum' | 'gold' | 'neutral';

export type ChunithmAchievementBadgeData = {
  id: 'full-combo' | 'full-chain' | 'clear';
  label: string;
  tone: ChunithmAchievementTone;
};

export type ChunithmScoreCardData = {
  key: string;
  songId: string;
  title: string;
  artist?: string;
  noteDesigner?: string;
  levelIndex: ChunithmLevelIndex;
  level?: string;
  difficultyConstant?: number;
  versionId?: number;
  versionTitle?: string;
  worldsEndLabel?: string;
  jacketUrl?: string;
  score: number;
  rating?: number;
  rank: ChunithmRank;
  fullCombo?: ChunithmScore['full_combo'];
  fullChain?: ChunithmScore['full_chain'];
  clear: ChunithmScore['clear'];
};

export function chunithmRankFromScore(score: number): ChunithmRank {
  if (score >= 1_009_000) return 'SSS+';
  if (score >= 1_007_500) return 'SSS';
  if (score >= 1_005_000) return 'SS+';
  if (score >= 1_000_000) return 'SS';
  if (score >= 990_000) return 'S+';
  if (score >= 975_000) return 'S';
  if (score >= 950_000) return 'AAA';
  if (score >= 925_000) return 'AA';
  if (score >= 900_000) return 'A';
  if (score >= 800_000) return 'BBB';
  if (score >= 700_000) return 'BB';
  if (score >= 600_000) return 'B';
  if (score >= 500_000) return 'C';
  return 'D';
}

export function formatChunithmScore(score: number): string {
  return Math.max(0, Math.trunc(score)).toLocaleString('en-US');
}

export function formatChunithmRating(rating: number | undefined): string {
  return rating === undefined || !Number.isFinite(rating) ? '—' : rating.toFixed(2);
}

export function chunithmRankUsesGradient(rank: ChunithmRank): boolean {
  return rank === 'S'
    || rank === 'S+'
    || rank === 'SS'
    || rank === 'SS+'
    || rank === 'SSS'
    || rank === 'SSS+';
}

export function compareChunithmScores(
  left: Pick<ChunithmScore, 'rating' | 'score'>,
  right: Pick<ChunithmScore, 'rating' | 'score'>,
): number {
  const leftRating = left.rating ?? Number.NEGATIVE_INFINITY;
  const rightRating = right.rating ?? Number.NEGATIVE_INFINITY;
  return rightRating - leftRating || right.score - left.score;
}

export function averageChunithmRating(scores: readonly ChunithmScore[]): string {
  const ratings = scores
    .map((score) => score.rating)
    .filter((rating): rating is number => rating !== undefined && Number.isFinite(rating));
  if (!ratings.length) return '—';
  return (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2);
}

function scoreKey(score: ChunithmScore): string {
  return `${score.id}-${score.level_index}`;
}

function findSong(
  songsById: ReadonlyMap<string, ChunithmSong>,
  score: ChunithmScore,
): ChunithmSong | undefined {
  return songsById.get(String(score.id));
}

export function formatChunithmWorldsEndLabel({
  kanji,
  star,
  scoreLevel,
}: {
  kanji?: string;
  star?: number;
  scoreLevel?: string;
}): string {
  const normalizedKanji = kanji?.trim();
  if (normalizedKanji && star !== undefined) return `${normalizedKanji}☆${star}`;
  if (normalizedKanji) return normalizedKanji;
  return scoreLevel?.trim() || '—';
}

export function buildChunithmScoreCards(
  scores: readonly ChunithmScore[],
  catalog: ChunithmCatalogSnapshot | undefined,
): ChunithmScoreCardData[] {
  const songsById = new Map(
    (catalog?.songs ?? []).map((song) => [String(song.id), song] as const),
  );
  return scores.flatMap((score) => {
    if (score.level_index < 0 || score.level_index > 5) return [];
    const song = findSong(songsById, score);
    const difficulty = song?.difficulties.find(
      (candidate) => candidate.difficulty === score.level_index,
    );
    const worldsEnd = score.level_index === 5;
    return [{
      key: scoreKey(score),
      songId: String(score.id),
      title: song?.title ?? score.song_name ?? String(score.id),
      artist: song?.artist,
      noteDesigner: difficulty?.noteDesigner,
      levelIndex: score.level_index as ChunithmLevelIndex,
      level: score.level ?? difficulty?.level,
      difficultyConstant: worldsEnd ? undefined : difficulty?.levelValue,
      versionId: difficulty?.versionId,
      versionTitle: difficulty?.versionTitle,
      worldsEndLabel: worldsEnd
        ? formatChunithmWorldsEndLabel({
          kanji: difficulty?.kanji,
          star: difficulty?.star,
          scoreLevel: score.level,
        })
        : undefined,
      jacketUrl: song ? chunithmJacketUrl(song) : undefined,
      score: score.score,
      rating: score.rating,
      rank: chunithmRankFromScore(score.score),
      fullCombo: score.full_combo,
      fullChain: score.full_chain,
      clear: score.clear,
    }];
  });
}

export function chunithmAchievementBadges(
  score: Pick<ChunithmScoreCardData, 'fullCombo' | 'fullChain' | 'clear'>,
): ChunithmAchievementBadgeData[] {
  const badges: ChunithmAchievementBadgeData[] = [];
  if (score.fullCombo === 'alljusticecritical') {
    badges.push({ id: 'full-combo', label: 'AJC', tone: 'rainbow' });
  } else if (score.fullCombo === 'alljustice') {
    badges.push({ id: 'full-combo', label: 'AJ', tone: 'platinum' });
  } else if (score.fullCombo === 'fullcombo') {
    badges.push({ id: 'full-combo', label: 'FC', tone: 'gold' });
  }

  if (score.fullChain === 'fullchain') {
    badges.push({ id: 'full-chain', label: 'FULL CHAIN', tone: 'platinum' });
  } else if (score.fullChain === 'fullchain2') {
    badges.push({ id: 'full-chain', label: 'FULL CHAIN', tone: 'gold' });
  }

  const clearBadge: Record<ChunithmScoreCardData['clear'], Omit<ChunithmAchievementBadgeData, 'id'>> = {
    clear: { label: 'CLEAR', tone: 'gold' },
    hard: { label: 'HARD', tone: 'gold' },
    brave: { label: 'BRAVE', tone: 'gold' },
    absolute: { label: 'ABSOLUTE', tone: 'platinum' },
    catastrophy: { label: 'CATASTROPHY', tone: 'rainbow' },
    failed: { label: 'FAILED', tone: 'neutral' },
  };
  badges.push({ id: 'clear', ...clearBadge[score.clear] });
  return badges;
}
