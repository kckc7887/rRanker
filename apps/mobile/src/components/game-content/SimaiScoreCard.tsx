import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { AchievementValue, ScoreStatusBadges } from '@/components/ScoreVisuals';
import type { ScoreCardPresentation } from '@/features/game-content/presentation';
import { useAppTheme } from '@/theme/app-theme';
import { GameScoreCard, type ScoreCardArtwork } from './GameScoreCard';
import { simaiScoreCardStyles as styles } from './SimaiScoreCardStyles';

/** 舞萌成绩卡的共同结构。适配层只提供指标、徽章和真实成就。 */
export function SimaiScoreCard({ presentation, artwork, achievements, sideMetric, difficultyBadge, chartTypeBadge,
  supplementalMetric, rate, fc, fs, badgesTestID, interactive = true,
}: {
  presentation: ScoreCardPresentation;
  artwork: ScoreCardArtwork;
  achievements?: number;
  sideMetric?: { label: string; value?: number; emptyText: string };
  difficultyBadge: ReactNode;
  chartTypeBadge?: ReactNode;
  supplementalMetric?: ReactNode;
  rate?: string | null;
  fc?: string | null;
  fs?: string | null;
  badgesTestID?: string;
  interactive?: boolean;
}) {
  const theme = useAppTheme();
  return <GameScoreCard artwork={artwork} presentation={presentation} pressable={interactive}
    cardStyle={styles.card} mainStyle={styles.main} titleStyle={styles.title}
    side={sideMetric ? <View style={styles.ratingBlock}>
      <Text style={[styles.ratingLabel, { color: theme.textMuted }]}>{sideMetric.label}</Text>
      <Text style={[styles.rating, { color: sideMetric.value === undefined ? theme.textMuted : theme.accent }]}>
        {sideMetric.value === undefined ? sideMetric.emptyText : sideMetric.value}
      </Text>
    </View> : null}>
    <AchievementValue value={achievements} compact />
    {supplementalMetric === undefined ? null : <Text style={[styles.dxScore, { color: theme.textSecondary }]}>{supplementalMetric}</Text>}
    <View testID={badgesTestID} style={styles.tags}>
      {difficultyBadge}
      {chartTypeBadge}
      <ScoreStatusBadges rate={rate} achievements={achievements} fc={fc} fs={fs} nearMissFirst />
    </View>
  </GameScoreCard>;
}
