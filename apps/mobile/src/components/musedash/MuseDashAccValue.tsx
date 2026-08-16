import { StyleSheet, Text, type TextStyle } from 'react-native';
import { FlowingGradientValue } from '@/components/game-content/FlowingGradientValue';
import { MUSE_DASH_ACC_GRADIENTS, museDashAccGradientKind } from '@/domain/musedash-acc-theme';
import { formatMuseDashAcc } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

/** 大字 ACC：100 金渐变、95 银渐变、90 红渐变，90 以下白色；未游玩显示 —。 */
export function MuseDashAccValue({ acc, style }: { acc: number | undefined; style?: object }) {
  const theme = useAppTheme();
  if (acc === undefined) {
    return <Text accessibilityLabel="未游玩" style={[styles.value, { color: theme.text }]}>—</Text>;
  }
  const text = formatMuseDashAcc(acc);
  const kind = museDashAccGradientKind(acc);
  if (kind === null) {
    return <Text accessibilityLabel={text} style={[styles.value, { color: '#FFFFFF' }, style]}>{text}</Text>;
  }
  const lineHeight = (style as TextStyle | undefined)?.lineHeight ?? styles.value.lineHeight;
  return (
    <FlowingGradientValue
      accessibilityLabel={text}
      maskElement={<Text style={[styles.value, styles.maskText, style]}>{text}</Text>}
      maskStyle={[styles.mask, { height: lineHeight }]}
      staticColors={MUSE_DASH_ACC_GRADIENTS[kind]}
      staticStyle={StyleSheet.absoluteFill}
      testID={`musedash-acc-gradient-${kind}`}
    />
  );
}

const styles = StyleSheet.create({
  value: { fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  mask: { alignSelf: 'stretch' },
  maskText: { color: '#000000' },
});
