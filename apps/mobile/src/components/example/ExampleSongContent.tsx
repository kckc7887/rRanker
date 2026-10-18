import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnimatedMetricValue } from '@/components/game-content/AnimatedMetricValue';
import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';
import { GameScoreCard, COMPACT_METRIC_CARD_STYLES as cardStyles } from '@/components/game-content/GameScoreCard';
import { GameSongRow, WRAPPED_COVER_ROW_STYLES as rowStyles } from '@/components/game-content/GameSongRow';
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
  return <GameScoreCard presentation={presentation} cardStyle={cardStyles.card} mainStyle={cardStyles.main}
    titleStyle={cardStyles.title} artwork={{ source: record.song.coverUrl }} testID={`example-record-${record.song.id}`} onPress={onPress}
    side={<View style={cardStyles.stats}><Text style={[cardStyles.acc, { color: theme.textMuted }]}>{rating.label}</Text>
      <Text style={[cardStyles.rks, { color: theme.text }]}>{rating.text}</Text></View>}>
    <Text style={[styles.caption, { color: theme.textMuted }]}>{presentation.primaryMetric.label}</Text>
    <ExampleScoreValue text={presentation.primaryMetric.text} />
    <View style={styles.badges}><ExampleDifficultyBadge /><LayeredGradientBadge label="EX" tone="rainbow" style={styles.grade} textStyle={styles.gradeText} /></View>
    <Text style={[styles.caption, { color: theme.textMuted }]}>ID{record.song.id}</Text>
  </GameScoreCard>;
});

export function ExampleSongRow({ song, favorite, pending, onFavoriteChange }: {
  song: ExampleSong; favorite: boolean; pending: boolean; onFavoriteChange: (favorite: boolean) => void;
}) {
  const theme = useAppTheme();
  return <GameSongRow presentation={presentExampleSong(song)} cover={null} rowStyle={rowStyles.row} openStyle={rowStyles.openSong}
    mainStyle={rowStyles.meta} titleStyle={rowStyles.title} subtitleStyle={rowStyles.composer}
    coverImage={{ source: song.coverUrl, accessibilityLabel: song.title, imageStyle: rowStyles.cover, wrapStyle: rowStyles.coverWrap,
      placeholderStyle: [rowStyles.placeholder, { backgroundColor: theme.input }], noteStyle: rowStyles.placeholderNote }}
    badges={<View style={rowStyles.badges}><ExampleDifficultyBadge /></View>}
    accessory={<Pressable disabled={pending} onPress={() => onFavoriteChange(!favorite)} style={styles.favorite}>
      <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={theme.accent} size={24} />
    </Pressable>} />;
}

const styles = StyleSheet.create({
  difficulty: { borderWidth: 0 },
  caption: { fontSize: 11, fontWeight: '600' },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  favorite: { paddingHorizontal: 4, paddingVertical: 8 },
  grade: { height: 24, minWidth: 32 }, gradeText: { fontSize: 9, fontWeight: '900', paddingHorizontal: 6 },
});
