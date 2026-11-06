import type { ReactNode } from 'react';
import { AchievementValue, ScoreStatusBadges } from '@/components/ScoreVisuals';
import type { ScoreCardPresentation } from '@/features/game-content/presentation';
import { useAppTheme } from '@/theme/app-theme';
import { GameScoreCard, ScoreCardMetric, ScoreCardBadges, type ScoreCardArtwork } from './GameScoreCard';
import { StyleSheet } from 'react-native';

export function SimaiScoreCard({ presentation, artwork, achievements, sideMetric, difficultyBadge, chartTypeBadge,
  rate, fc, fs, badgesTestID, interactive = true,
}: {
  presentation: ScoreCardPresentation;
  artwork: ScoreCardArtwork;
  achievements?: number;
  sideMetric?: { label: string; value?: number; emptyText: string };
  difficultyBadge: ReactNode;
  chartTypeBadge?: ReactNode;
  rate?: string | null;
  fc?: string | null;
  fs?: string | null;
  badgesTestID?: string;
  interactive?: boolean;
}) {
  const theme = useAppTheme();
  return <GameScoreCard artwork={artwork} presentation={presentation} pressable={interactive}
    side={sideMetric ? <ScoreCardMetric label={sideMetric.label} value={sideMetric.value ?? sideMetric.emptyText}
      style={styles.ratingBlock} valueColor={sideMetric.value === undefined ? theme.textMuted : theme.accent} /> : null}>
    <AchievementValue value={achievements} compact />
    <ScoreCardBadges testID={badgesTestID} style={styles.tags}>
      {difficultyBadge}
      {chartTypeBadge}
      <ScoreStatusBadges rate={rate} achievements={achievements} fc={fc} fs={fs} nearMissFirst />
    </ScoreCardBadges>
  </GameScoreCard>;
}

const styles = StyleSheet.create({
  ratingBlock: { minWidth: 52 }, tags: { minHeight: 25, gap: 6, marginTop: 4 },
});
