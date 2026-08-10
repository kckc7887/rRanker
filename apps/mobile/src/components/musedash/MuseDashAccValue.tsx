import { StyleSheet, Text } from 'react-native';
import { museDashAccTone } from '@/domain/muse-dash';
import { museDashToneColor } from '@/domain/musedash-tone-theme';
import { useAppTheme } from '@/theme/app-theme';
import { formatMuseDashAcc } from '@/features/game-content/adapters';

/** 大字 ACC：100 金、95 银、90 红、80 蓝、70 绿、60 灰、更低紫；未游玩显示 —。 */
export function MuseDashAccValue({ acc, style }: { acc: number | undefined; style?: object }) {
  const theme = useAppTheme();
  if (acc === undefined) {
    return <Text accessibilityLabel="未游玩" style={[styles.value, { color: theme.text }]}>—</Text>;
  }
  const color = museDashToneColor(museDashAccTone(acc)) ?? theme.text;
  return <Text accessibilityLabel={formatMuseDashAcc(acc)} style={[styles.value, { color }, style]}>{formatMuseDashAcc(acc)}</Text>;
}

const styles = StyleSheet.create({
  value: { fontSize: 24, lineHeight: 30, fontWeight: '900', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
});
