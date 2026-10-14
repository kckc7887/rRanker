import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RemoteImage as Image } from '@/components/RemoteImage';

export function GameSongCover({ source, gameId, size = 58, borderRadius = 9 }: {
  source: string | null;
  gameId: string;
  size?: number;
  borderRadius?: number;
}) {
  const imageKey = source ? `${gameId}|${source}` : null;
  const currentImage = useRef(imageKey);
  currentImage.current = imageKey;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  if (!source || failedImage === imageKey) return <View style={[styles.placeholder, { width: size, height: size, borderRadius }]}><Text style={styles.note}>♪</Text></View>;
  return <Image cacheProfile="thumbnail" gameId={gameId} accessibilityLabel="歌曲封面"
    contentFit="cover" onError={() => { if (currentImage.current === imageKey) setFailedImage(imageKey); }} source={source}
    style={{ width: size, height: size, borderRadius }} transition={120} />;
}

const styles = StyleSheet.create({
  placeholder: { borderRadius: 9, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  note: { color: '#6B7280', fontSize: 24 },
});
