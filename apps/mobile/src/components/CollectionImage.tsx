import { useState } from 'react';
import { RemoteImage as Image } from '@/components/RemoteImage';
import { StyleSheet, View } from 'react-native';
import type { CollectionKind } from '@/domain/models';

const ASSET_ROOT = 'https://assets2.lxns.net/maimai';

/** 称号没有 CDN 图片。 */
export function CollectionImage({
  kind,
  collectionId,
  size = 40,
  borderRadius = 8,
}: {
  kind: Exclude<CollectionKind, 'trophy'>;
  collectionId: number;
  size?: number;
  borderRadius?: number;
}) {
  const [failed, setFailed] = useState(false);
  const aspect = kind === 'plate' ? 720 / 116 : 1;
  const width = kind === 'plate' ? Math.round(size * aspect) : size;
  const height = size;
  if (failed) {
    return <View style={[styles.placeholder, { width, height, borderRadius }]} />;
  }
  return (
    <Image
      cacheProfile="native"
      accessibilityLabel={`${kind} 预览`}
      contentFit="contain"
      onError={() => setFailed(true)}
      source={`${ASSET_ROOT}/${kind}/${collectionId}.png`}
      style={{ width, height, borderRadius }}
      transition={120}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: '#E5E7EB' },
});
