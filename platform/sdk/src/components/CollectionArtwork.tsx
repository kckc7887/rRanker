import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { RemoteImage as Image } from './RemoteImage';

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
