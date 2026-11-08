import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RemoteImage as Image } from '@rranker/sdk/components/RemoteImage';

type CoverProps = {
  source: string | null;
  gameId: string;
  size?: number;
  borderRadius?: number;
  accessibilityLabel?: string;
  placeholderColor?: string;
};

export function GameSongCover(props: CoverProps) {
  return <SongCoverImage key={`${props.gameId}|${props.source ?? ''}`} {...props} />;
}

function SongCoverImage({ source, gameId, size = 58, borderRadius = 9, accessibilityLabel = '歌曲封面', placeholderColor = '#E5E7EB' }: CoverProps) {
  const [failed, setFailed] = useState(false);
  const dimensions = { width: size, height: size, borderRadius };
  if (!source || failed) return <View style={[styles.placeholder, dimensions, { backgroundColor: placeholderColor }]}>
    <Text style={styles.note}>♪</Text>
  </View>;
  return <Image cacheProfile="thumbnail" gameId={gameId} accessibilityLabel={accessibilityLabel}
    contentFit="cover" onError={() => setFailed(true)} source={source} style={dimensions} transition={120} />;
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  note: { color: '#6B7280', fontSize: 24 },
});
