import { memo } from 'react';
import type { ChartType, Difficulty, ScoreRecord, UtageChartMetadata } from '@/domain/models';
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
  level?: string;
  utage?: UtageChartMetadata;
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
}: {
  record: ScoreRecord | ScoreRecordCardData;
  rank?: number;
  interactive?: boolean;
}) {
  const presentation = presentMaimaiScore(record, rank);
  const isUtage = record.type === 'UTAGE';
  return <SimaiScoreCard
    artwork={{ source: maimaiJacketUrl(record.songId) }}
    presentation={presentation}
    interactive={interactive}
    achievements={record.achievements}
    sideMetric={isUtage ? undefined : { label: 'Rating', value: record.rating, emptyText: '-' }}
    difficultyBadge={<DifficultyBadge difficulty={record.difficulty} constant={record.difficultyConstant} compact
      specialLabel={isUtage ? `${record.utage?.kanji?.trim() || 'U·TA·GE'} ${record.level ?? ''}`.trim() : undefined} />}
    chartTypeBadge={isUtage ? null : <ChartTypeBadge type={record.type} />}
    rate={record.rate} fc={record.fc} fs={record.fs}
    badgesTestID={`score-card-badges-${record.songId}`}
  />;
});
