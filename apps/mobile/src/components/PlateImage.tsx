import { useState } from 'react';
import { RemoteImage as Image } from '@/components/RemoteImage';
import { StyleSheet, View } from 'react-native';

/** 落雪游戏资源根；姓名框为 /plate/{id}.png（约 720×116）。 */
export const LXNS_PLATE_ROOT = 'https://assets2.lxns.net/maimai/plate';
const PLATE_ASPECT = 720 / 116;

export function PlateImage({
  plateId,
  height = 36,
  borderRadius = 6,
}: {
  plateId: number;
  height?: number;
  borderRadius?: number;
}) {
  const [failed, setFailed] = useState(false);
  const width = Math.round(height * PLATE_ASPECT);
  if (failed) {
    return <View style={[styles.placeholder, { width, height, borderRadius }]} />;
  }
  return (
    <Image
      cachePolicy="disk"
      cacheProfile="thumbnail"
      accessibilityLabel="姓名框预览"
      contentFit="contain"
      onError={() => setFailed(true)}
      source={`${LXNS_PLATE_ROOT}/${plateId}.png`}
      style={{ width, height, borderRadius }}
      transition={120}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: '#E5E7EB' },
});
