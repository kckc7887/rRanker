import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AnimatedMetricValue } from '@/components/game-content/AnimatedMetricValue';
import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';
import { GameScoreCard, ScoreCardBadges, ScoreCardMetric } from '@/components/game-content/GameScoreCard';
import { GameSongRow, SongRowBadges } from '@/components/game-content/GameSongRow';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import { METRIC_GRADIENT_THEMES } from '@/domain/metric-gradient-theme';
import { EXAMPLE_DIFFICULTY_COLORS, type ExampleRecord, type ExampleSong } from '@/domain/example';
import { presentExampleRecord, presentExampleSong } from '@/features/game-content/adapters/example';
import { useAppTheme } from '@/theme/app-theme';

export function ExampleDifficultyBadge() {
  return <GameDifficultyBadge text="Insane 27.5" theme={{ background: '#00E5A0', border: '#008CFF', text: '#FFFFFF' }}
    special={{ gradient: EXAMPLE_DIFFICULTY_COLORS }} style={styles.difficulty} />;
}

export function ExampleScoreValue({ text, large = false }: { text: string; large?: boolean }) {
  const theme = useAppTheme();
  return <AnimatedMetricValue text={text} textColor={theme.text} fontSize={large ? 34 : 24} lineHeight={large ? 40 : 32}
    gradient={{ ...METRIC_GRADIENT_THEMES.rainbow, testID: 'example-score' }} />;
}

export const ExampleScoreCard = memo(function ExampleScoreCard({ record, rank, onPress }: { record: ExampleRecord; rank?: number; onPress?: () => void }) {
  const theme = useAppTheme(); const presentation = presentExampleRecord(record, rank);
  const rating = presentation.secondaryMetrics[0];
  return <GameScoreCard presentation={presentation} artwork={{ source: record.song.coverUrl }} testID={`example-record-${record.song.id}`} onPress={onPress}
    side={<ScoreCardMetric numericLabel label={rating.label} value={rating.text} valueColor={theme.text} />}>
    <Text style={[styles.caption, { color: theme.textMuted }]}>{presentation.primaryMetric.label}</Text>
    <ExampleScoreValue text={presentation.primaryMetric.text} />
    <ScoreCardBadges><ExampleDifficultyBadge /><LayeredGradientBadge label="EX" tone="rainbow" style={styles.grade} textStyle={styles.gradeText} /></ScoreCardBadges>
    <Text style={[styles.caption, { color: theme.textMuted }]}>ID{record.song.id}</Text>
  </GameScoreCard>;
});

export function ExampleSongRow({ song, favorite, pending, onFavoriteChange }: {
  song: ExampleSong; favorite: boolean; pending: boolean; onFavoriteChange: (favorite: boolean) => void;
}) {
  const theme = useAppTheme();
  return <GameSongRow presentation={presentExampleSong(song)} coverSource={song.coverUrl}
    coverLabel={song.title} placeholderColor={theme.input} favorite={favorite} favoritePending={pending}
    onFavoriteChange={(_, value) => onFavoriteChange(value)}
    badges={<SongRowBadges><ExampleDifficultyBadge /></SongRowBadges>} />;
}

const styles = StyleSheet.create({
  difficulty: { borderWidth: 0 },
  caption: { fontSize: 11, fontWeight: '600' },
  grade: { height: 24, minWidth: 32 }, gradeText: { fontSize: 9, fontWeight: '900', paddingHorizontal: 6 },
});
