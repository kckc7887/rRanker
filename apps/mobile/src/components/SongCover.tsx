import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

export const LXNS_ASSET_ROOT = 'https://assets2.lxns.net/maimai/jacket';

export function SongCover({ songId, size = 58 }: { songId: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <View style={[styles.placeholder, { width: size, height: size }]}><Text style={styles.note}>♪</Text></View>;
  return (
    <Image
      accessibilityLabel="歌曲封面"
      cachePolicy="disk"
      contentFit="cover"
      onError={() => setFailed(true)}
      source={`${LXNS_ASSET_ROOT}/${songId}.png`}
      style={{ width: size, height: size, borderRadius: 9 }}
      transition={120}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { borderRadius: 9, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  note: { color: '#6B7280', fontSize: 24 },
});
