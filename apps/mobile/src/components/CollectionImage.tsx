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
  return <CollectionArtwork source={`${ASSET_ROOT}/${kind}/${collectionId}.png`} label={`${kind} 预览`}
    height={size} aspect={kind === 'plate' ? 720 / 116 : 1} borderRadius={borderRadius} />;
}

type CollectionArtworkProps = {
  source: string; label: string; height: number; aspect: number; borderRadius: number;
};

export function CollectionArtwork(props: CollectionArtworkProps) {
  return <Artwork key={props.source} {...props} />;
}

function Artwork({ source, label, height, aspect, borderRadius }: CollectionArtworkProps) {
  const [failed, setFailed] = useState(false);
  const style = { width: Math.round(height * aspect), height, borderRadius };
  return failed
    ? <View style={[style, styles.placeholder]} />
    : <Image cacheProfile="native" accessibilityLabel={label} contentFit="contain" onError={() => setFailed(true)}
        source={source} style={style} transition={120} />;
}

const styles = StyleSheet.create({ placeholder: { backgroundColor: '#E5E7EB' } });
