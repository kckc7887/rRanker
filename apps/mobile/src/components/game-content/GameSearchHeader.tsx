import { StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

// 差异页面通过 wrapStyle 和 inputStyle 覆盖布局。
const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  resultCount: { fontSize: 11 },
});

type GameSearchHeaderProps = {
  // 缺省时使用 placeholder 作为无障碍标签。
  accessibilityLabel?: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  // 不传则不渲染「已加载」计数行（Phira 形态）
  loaded?: number;
  // 传入时计数行渲染为「已加载 loaded / total 条」（TUF 形态）
  total?: number;
  wrapStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  resultCountStyle?: StyleProp<TextStyle>;
};

export function GameSearchHeader({
  accessibilityLabel,
  placeholder,
  value,
  onChangeText,
  loaded,
  total,
  wrapStyle,
  inputStyle,
  resultCountStyle,
}: GameSearchHeaderProps) {
  const theme = useAppTheme();
  return <View style={[wrapStyle ?? styles.wrap, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
    <TextInput accessibilityLabel={accessibilityLabel ?? placeholder} placeholder={placeholder} placeholderTextColor={theme.textMuted}
      value={value} onChangeText={onChangeText}
      style={[inputStyle ?? styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]} />
    {loaded == null ? null : (
      <Text style={[resultCountStyle ?? styles.resultCount, { color: theme.textMuted }]}>
        已加载 {loaded}{total == null ? '' : ` / ${total}`} 条
      </Text>
    )}
  </View>;
}
