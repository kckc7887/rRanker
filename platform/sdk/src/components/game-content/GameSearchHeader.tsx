import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';

type GameSearchHeaderProps = {
  resultCountText?: string;
  accessibilityLabel?: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  loaded?: number;
  total?: number;
};

export function GameSearchHeader({
  resultCountText,
  accessibilityLabel,
  placeholder,
  value,
  onChangeText,
  loaded,
  total,
}: GameSearchHeaderProps) {
  const theme = useAppTheme();
  const count = resultCountText ?? (loaded == null ? undefined : `已加载 ${loaded}${total == null ? '' : ` / ${total}`} 条`);
  return <View style={[styles.wrap, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
    <TextInput accessibilityLabel={accessibilityLabel ?? placeholder} placeholder={placeholder} placeholderTextColor={theme.textMuted}
      autoCapitalize="none" autoCorrect={false}
      value={value} onChangeText={onChangeText}
      style={[styles.input, { backgroundColor: theme.input, color: theme.text, borderColor: theme.border }]} />
    {count === undefined ? null : <Text style={[styles.resultCount, { color: theme.textMuted }]}>{count}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 0, fontSize: 14 },
  resultCount: { fontSize: 11 },
});
