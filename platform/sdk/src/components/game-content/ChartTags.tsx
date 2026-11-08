import type { ReactNode } from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { DetailPressable } from '@rranker/sdk/components/game-content/DetailPressable';

export function ChartTags<T>({ tags, renderTag, onShowAll, testID, style, moreStyle, moreColor }: {
  tags: readonly T[]; renderTag: (tag: T) => ReactNode; onShowAll: () => void;
  testID: string; style?: StyleProp<ViewStyle>; moreStyle?: StyleProp<ViewStyle>; moreColor?: string;
}) {
  const theme = useAppTheme();
  if (!tags.length) return null;
  const visible = tags.slice(0, 4);
  const remaining = tags.length - visible.length;
  return <View testID={testID} style={[{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, style]}>
    {visible.map(renderTag)}
    {remaining > 0 && <DetailPressable accessibilityRole="button" hitSlop={8}
      accessibilityLabel={`查看全部${tags.length}个谱面标签，另有${remaining}个`}
      testID={`${testID}-more`} onPress={onShowAll}
      style={({ pressed }) => [{ alignItems: 'center', justifyContent: 'center', borderWidth: 1,
        borderRadius: 999, borderColor: theme.border, backgroundColor: theme.surfaceMuted, paddingHorizontal: 10 },
        moreStyle, pressed && { opacity: 0.65 }]}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: moreColor ?? theme.textSecondary }}>+{remaining}</Text>
    </DetailPressable>}
  </View>;
}
