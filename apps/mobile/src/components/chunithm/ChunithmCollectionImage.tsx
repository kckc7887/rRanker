import { useState } from 'react';
import { RemoteImage as Image } from '@/components/RemoteImage';
import { StyleSheet, View } from 'react-native';

export const CHUNITHM_ASSET_ROOT = 'https://assets2.lxns.net/chunithm';

/** LXNS 前端名牌比例为 576/228。 */
const PLATE_ASPECT = 576 / 228;
/** LXNS 前端称号比例为 608/74。 */
const TROPHY_IMAGE_ASPECT = 608 / 74;

export function ChunithmCollectionImage({
  kind,
  collectionId,
  height = 40,
  borderRadius = 8,
}: {
  kind: 'character' | 'plate' | 'icon' | 'trophy-image';
  collectionId: number;
  height?: number;
  borderRadius?: number;
}) {
  const [failed, setFailed] = useState(false);
  const aspect = kind === 'plate'
    ? PLATE_ASPECT
    : kind === 'trophy-image'
      ? TROPHY_IMAGE_ASPECT
      : 1;
  const width = Math.round(height * aspect);
  if (failed) {
    return <View style={[styles.placeholder, { width, height, borderRadius }]} />;
  }
  return (
    <Image
      cacheProfile="native"
      accessibilityLabel={`${kind === 'trophy-image' ? '称号' : kind} 预览`}
      contentFit="contain"
      onError={() => setFailed(true)}
      source={`${CHUNITHM_ASSET_ROOT}/${kind === 'trophy-image' ? 'trophy' : kind}/${collectionId}.png`}
      style={{ width, height, borderRadius }}
      transition={120}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: '#E5E7EB' },
});
