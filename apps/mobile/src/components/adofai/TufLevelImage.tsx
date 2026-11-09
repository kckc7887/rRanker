import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RemoteImage } from '@/components/RemoteImage';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { findGame } from '@/domain/game-bind-options';
import { tufMediaImageCandidates, type TufLevel } from '@/domain/tuf';
import { useTufVideoDetails } from '@/hooks/use-tuf';
import { useAppTheme } from '@/theme/app-theme';

const ADOFAI_ICON = findGame('adofai')!.icon;

export function TufLevelImage({ level, thumbnail = false }: { level: TufLevel; thumbnail?: boolean }) {
  const active = useCachedTabActive();
  const media = useTufVideoDetails(level.videoLink, !thumbnail || active);
  const mediaImage = media.data?.image;
  const difficultyIcon = level.difficulty?.icon;
  return <LevelImageCandidates key={JSON.stringify([level.id, mediaImage, difficultyIcon])}
    candidates={tufMediaImageCandidates(mediaImage, difficultyIcon)}
    mediaCount={thumbnail ? 0 : tufMediaImageCandidates(mediaImage, undefined).length}
    song={level.song} thumbnail={thumbnail} />;
}

function LevelImageCandidates({ candidates, mediaCount, song, thumbnail }: {
  candidates: string[]; mediaCount: number; song: string; thumbnail: boolean;
}) {
  const theme = useAppTheme();
  const [index, setIndex] = useState(0);
  const candidate = candidates[index];
  const fallback = !thumbnail && index >= mediaCount;
  const label = thumbnail ? '关卡封面' : fallback ? '关卡备用图' : '关卡头图';
  const image = <RemoteImage key={candidate ?? 'local'} accessibilityLabel={`${label} ${song}`}
    cacheProfile={thumbnail ? 'thumbnail' : 'artwork'} gameId="adofai" contentFit={fallback ? 'contain' : 'cover'}
    onError={candidate ? () => setIndex(current => Math.max(current, index + 1)) : undefined}
    source={candidate ?? ADOFAI_ICON} style={thumbnail ? styles.cover : fallback ? styles.fallback : StyleSheet.absoluteFill}
    transition={120} />;
  if (!fallback) return image;
  return <LinearGradient colors={theme.dark ? ['#173346', '#3C416A', '#532A2C'] : ['#DDF6FF', '#E5E7F7', '#FFE2DF']}
    end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill}>
    {image}
  </LinearGradient>;
}

const styles = StyleSheet.create({
  cover: { width: 62, height: 62, borderRadius: 12, backgroundColor: '#DCE5EC' },
  fallback: { position: 'absolute', width: '44%', height: '44%', alignSelf: 'center', top: '28%', opacity: 0.9 },
});
