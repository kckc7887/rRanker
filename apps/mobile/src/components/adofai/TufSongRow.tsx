import { memo, useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { TufDifficultyBadge } from './TufDifficultyBadge';
import { GameSongRow } from '@/components/game-content/GameSongRow';
import { tufMediaImageCandidates, type TufLevel } from '@/domain/tuf';
import { findGame } from '@/domain/game-bind-options';
import { presentTufLevel } from '@/features/game-content/adapters';
import { useTufVideoDetails } from '@/hooks/use-tuf';

const ADOFAI_ICON = findGame('adofai')!.icon;

export const TufSongRow = memo(function TufSongRow({ level }: { level: TufLevel }) {
  const presentation = presentTufLevel(level);
  const badge = presentation.chartBadges[0];
  const media = useTufVideoDetails(level.videoLink);
  const candidates = useMemo(
    () => tufMediaImageCandidates(media.data?.image, level.difficulty?.icon),
    [media.data?.image, level.difficulty?.icon],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  useEffect(() => setCandidateIndex(0), [candidates]);
  const candidate = candidates[candidateIndex];

  return <GameSongRow presentation={presentation} wholeRowPressable rowStyle={styles.row}
    mainStyle={styles.main} titleStyle={styles.title} subtitleStyle={styles.subtitle} pressedStyle={styles.pressed}
    cover={<Image accessibilityLabel={`关卡封面 ${level.song}`} cachePolicy="disk" contentFit="cover"
      onError={candidate ? () => setCandidateIndex((index) => index + 1) : undefined}
      source={candidate ?? ADOFAI_ICON} style={styles.cover} transition={120} />}
    badges={badge ? <TufDifficultyBadge difficulty={badge} source={level.difficulty} /> : null} />;
});

const styles = StyleSheet.create({
  row: { borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  main: { flex: 1, gap: 4 },
  title: { flexShrink: 1, fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 11 },
  pressed: { opacity: 0.72 },
  cover: { width: 62, height: 62, borderRadius: 12, backgroundColor: '#DCE5EC' },
});
