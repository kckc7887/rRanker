import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RemoteImage as Image } from '@/components/RemoteImage';

/** 舞萌歌曲封面的共同外观、失败占位和可见图片缓存入口。 */
export function GameSongCover({ source, gameId, size = 58, borderRadius = 9 }: {
  source: string | null;
  gameId: string;
  size?: number;
  borderRadius?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || !source) return <View style={[styles.placeholder, { width: size, height: size, borderRadius }]}><Text style={styles.note}>♪</Text></View>;
  return <Image cachePolicy="disk" cacheProfile="thumbnail" gameId={gameId} accessibilityLabel="歌曲封面"
    contentFit="cover" onError={() => setFailed(true)} source={source}
    style={{ width: size, height: size, borderRadius }} transition={120} />;
}

const styles = StyleSheet.create({
  placeholder: { borderRadius: 9, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  note: { color: '#6B7280', fontSize: 24 },
});
