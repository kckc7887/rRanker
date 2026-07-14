import { useState } from 'react';
import { Image } from 'expo-image';
import type { ImageSourcePropType } from 'react-native';
import { StyleSheet, View } from 'react-native';

export function VersionLogo({
  source,
  accessibilityLabel,
  height = 40,
}: {
  source?: ImageSourcePropType;
  accessibilityLabel: string;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  const width = Math.round(height * 2.2);
  if (!source || failed) {
    return <View style={[styles.placeholder, { height, width }]} />;
  }
  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      contentFit="contain"
      onError={() => setFailed(true)}
      source={source}
      style={{ height, width }}
      transition={120}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: '#E5E7EB', borderRadius: 6 },
});
