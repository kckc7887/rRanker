import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import type { AssetRef } from '@/domain/game-model';
import { SongCover } from '@/components/SongCover';

const CHUNITHM_JACKET_ROOT = 'https://assets2.lxns.net/chunithm/jacket';

function assetUri(asset: AssetRef): string | null {
  if (asset.kind === 'remote') return asset.uri;
  if (asset.kind === 'resolver' && asset.resolverId === 'chunithm-jacket') {
    return `${CHUNITHM_JACKET_ROOT}/${encodeURIComponent(asset.key)}.png`;
  }
  return null;
}

export function GameAssetImage({
  asset,
  size = 58,
  borderRadius = 9,
  accessibilityLabel = '歌曲封面',
}: {
  asset?: AssetRef;
  size?: number;
  borderRadius?: number;
  accessibilityLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (asset?.kind === 'resolver' && asset.resolverId === 'maimai-jacket') {
    return <SongCover songId={asset.key} size={size} borderRadius={borderRadius} />;
  }
  const uri = asset ? assetUri(asset) : null;
  if (!uri || failed) {
    return (
      <View style={[styles.placeholder, { width: size, height: size, borderRadius }]}>
        <Text style={styles.note}>♪</Text>
      </View>
    );
  }
  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      cachePolicy="disk"
      contentFit="cover"
      onError={() => setFailed(true)}
      source={uri}
      style={{ width: size, height: size, borderRadius }}
      transition={120}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { color: '#6B7280', fontSize: 24 },
});
