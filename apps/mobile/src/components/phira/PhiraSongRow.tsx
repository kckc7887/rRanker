import { memo } from 'react';
import { View } from 'react-native';
import { GameSongRow, WRAPPED_COVER_ROW_STYLES as styles } from '@/components/game-content/GameSongRow';
import { PhigrosDifficultyBadge } from '@/components/phigros/PhigrosDifficultyBadge';
import type { PhiraChart } from '@/domain/phira';
import { presentPhiraSong } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export const PhiraSongRow = memo(function PhiraSongRow({ chart }: { chart: PhiraChart }) {
  const theme = useAppTheme();
  return <GameSongRow presentation={presentPhiraSong(chart)} rowStyle={styles.row} openStyle={styles.openSong}
    mainStyle={styles.meta} titleStyle={styles.title} subtitleStyle={styles.composer} cover={null}
    coverImage={{ source: chart.illustration ?? null, accessibilityLabel: '曲绘', imageStyle: styles.cover,
      wrapStyle: styles.coverWrap, placeholderStyle: [styles.placeholder, { backgroundColor: theme.input }],
      noteStyle: styles.placeholderNote }}
    badges={<View style={styles.badges}><PhigrosDifficultyBadge levelIndex={4} constant={chart.difficulty} labelOverride={chart.level} /></View>} />;
});
