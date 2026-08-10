import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import { formatMuseDashAcc } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

type AccGradientKind = 'gold' | 'silver' | 'red';

/** 90 及以上 ACC 大字金属渐变：金/银/红（与徽章同质感的渐变文字，白色卡片上清晰可读）。 */
const ACC_GRADIENTS: Record<AccGradientKind, readonly [string, string, ...string[]]> = {
  gold: ['#A16207', '#F5C518', '#A16207'],
  silver: ['#64748B', '#C0C0C0', '#64748B'],
  red: ['#991B1B', '#EF4444', '#991B1B'],
};

/** 大字 ACC：100 金渐变、95 银渐变、90 红渐变，90 以下白色；未游玩显示 —。 */
export function MuseDashAccValue({ acc, style }: { acc: number | undefined; style?: object }) {
  const theme = useAppTheme();
  if (acc === undefined) {
    return <Text accessibilityLabel="未游玩" style={[styles.value, { color: theme.text }]}>—</Text>;
  }
  const text = formatMuseDashAcc(acc);
  const kind: AccGradientKind | null = acc >= 100 ? 'gold' : acc >= 95 ? 'silver' : acc >= 90 ? 'red' : null;
  if (kind === null) {
    return <Text accessibilityLabel={text} style={[styles.value, { color: '#FFFFFF' }, style]}>{text}</Text>;
  }
  const lineHeight = (style as TextStyle | undefined)?.lineHeight ?? styles.value.lineHeight;
  return (
    <MaskedView
      accessibilityLabel={text}
      style={[styles.mask, { height: lineHeight }]}
      testID={`musedash-acc-gradient-${kind}`}
      maskElement={<Text style={[styles.value, styles.maskText, style]}>{text}</Text>}
    >
      <LinearGradient colors={ACC_GRADIENTS[kind]} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }}
        style={StyleSheet.absoluteFill} />
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  value: { fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  mask: { alignSelf: 'stretch' },
  maskText: { color: '#000000' },
});
