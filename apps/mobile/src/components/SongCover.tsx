import { useState } from 'react';
import { RemoteImage as Image } from '@/components/RemoteImage';
import { StyleSheet, Text, View } from 'react-native';
import { maimaiJacketUrl } from '@/domain/maimai-assets';

export function SongCover({ songId, size = 58, borderRadius = 9 }: { songId: string; size?: number; borderRadius?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <View style={[styles.placeholder, { width: size, height: size, borderRadius }]}><Text style={styles.note}>♪</Text></View>;
  return (
    <Image
      cachePolicy="disk"
      cacheProfile="thumbnail"
      gameId="maimai"
      accessibilityLabel="歌曲封面"
      contentFit="cover"
      onError={() => setFailed(true)}
      source={maimaiJacketUrl(songId)}
      style={{ width: size, height: size, borderRadius }}
      transition={120}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { borderRadius: 9, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  note: { color: '#6B7280', fontSize: 24 },
});
