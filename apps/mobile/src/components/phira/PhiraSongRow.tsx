import { memo, useState } from 'react';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { GameSongRow } from '@/components/game-content/GameSongRow';
import { PhigrosDifficultyBadge } from '@/components/phigros/PhigrosDifficultyBadge';
import { PHIGROS_SONG_ROW_STYLES as styles } from '@/components/phigros/PhigrosSongRow';
import type { PhiraChart } from '@/domain/phira';
import { presentPhiraSong } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export const PhiraSongRow = memo(function PhiraSongRow({ chart }: { chart: PhiraChart }) {
  const theme = useAppTheme(); const [failed, setFailed] = useState(false);
  return <GameSongRow presentation={presentPhiraSong(chart)} rowStyle={styles.row} openStyle={styles.openSong}
    mainStyle={styles.meta} titleStyle={styles.title} subtitleStyle={styles.composer}
    cover={<View style={styles.coverWrap}>{failed || !chart.illustration
      ? <View style={[styles.placeholder, { backgroundColor: theme.input }]}><Text style={styles.placeholderNote}>♪</Text></View>
      : <Image accessibilityLabel="曲绘" cachePolicy="disk" contentFit="cover" onError={() => setFailed(true)} source={chart.illustration} style={styles.cover} transition={120} />}</View>}
    badges={<View style={styles.badges}><PhigrosDifficultyBadge levelIndex={4} constant={chart.difficulty} labelOverride={chart.level} /></View>} />;
});
