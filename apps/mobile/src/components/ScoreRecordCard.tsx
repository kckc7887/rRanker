import { memo } from 'react';
import type { ChartType, Difficulty, ScoreRecord } from '@/domain/models';
import { ChartTypeBadge, DifficultyBadge } from './ScoreVisuals';
import { SimaiScoreCard } from '@/components/game-content/SimaiScoreCard';
import { presentMaimaiScore } from '@/features/game-content/adapters';
import { maimaiJacketUrl } from '@/domain/maimai-assets';

export type ScoreRecordCardData = {
  songId: string;
  title: string;
  type: ChartType;
  difficulty: Difficulty;
  difficultyConstant: number;
  levelIndex: number;
  achievements?: number;
  dxScore?: number | null;
  rating?: number;
  fc?: string | null;
  fs?: string | null;
  rate?: string | null;
};

export const ScoreRecordCard = memo(function ScoreRecordCard({
  record,
  rank,
  interactive = true,
  artworkCachePolicy,
}: {
  record: ScoreRecord | ScoreRecordCardData;
  rank?: number;
  interactive?: boolean;
  artworkCachePolicy?: 'none';
}) {
  const presentation = presentMaimaiScore(record, rank);
  return <SimaiScoreCard
    artwork={{ source: maimaiJacketUrl(record.songId), ...(artworkCachePolicy ? { cachePolicy: artworkCachePolicy } : {}) }}
    presentation={presentation}
    interactive={interactive}
    achievements={record.achievements}
    sideMetric={record.type === 'UTAGE' ? undefined : { label: 'Rating', value: record.rating, emptyText: '—' }}
    supplementalMetric={record.type === 'UTAGE' ? <>DX分数 {record.dxScore ?? '—'}</> : undefined}
    difficultyBadge={<DifficultyBadge difficulty={record.difficulty} constant={record.difficultyConstant} compact />}
    chartTypeBadge={record.type === 'UTAGE' ? null : <ChartTypeBadge type={record.type} />}
    rate={record.rate} fc={record.fc} fs={record.fs}
    badgesTestID={`score-card-badges-${record.songId}`}
  />;
});
