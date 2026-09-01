import { useState } from 'react';
import { RemoteImage as Image } from '@/components/RemoteImage';
import { StyleSheet, View } from 'react-native';

/**
 * 落雪中二收藏品资源根；角色 /character/{id}.png、名牌版 /plate/{id}.png、
 * 地图头像 /icon/{id}.png、图片称号 /trophy/{id}.png。
 */
export const CHUNITHM_ASSET_ROOT = 'https://assets2.lxns.net/chunithm';

/** 中二名牌版比例（lxns 前端 ratio 576/228）。 */
const PLATE_ASPECT = 576 / 228;
/** 中二图片称号比例（lxns 前端 ratio 608/74）。 */
const TROPHY_IMAGE_ASPECT = 608 / 74;

export function ChunithmCollectionImage({
  kind,
  collectionId,
  height = 40,
  borderRadius = 8,
}: {
  /** 图片类收藏品；图片称号（color=image）也走此处。 */
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
      cachePolicy="disk"
      cacheProfile="thumbnail"
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
