import { StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';
import { SIMAI_CATALOG_LIST_STYLES, SIMAI_RECORDS_LIST_STYLES } from './SimaiListStyles';

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  resultCount: { fontSize: 11 },
});

type GameSearchHeaderProps = {
  layout?: 'records' | 'catalog';
  resultCountText?: string;
  accessibilityLabel?: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  loaded?: number;
  total?: number;
  wrapStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  resultCountStyle?: StyleProp<TextStyle>;
};

export function GameSearchHeader({
  layout,
  resultCountText,
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
  if (layout) {
    const listStyles = layout === 'catalog' ? SIMAI_CATALOG_LIST_STYLES : SIMAI_RECORDS_LIST_STYLES;
    return <View style={[listStyles.searchArea, { backgroundColor: theme.surface }]}>
      <TextInput accessibilityLabel={accessibilityLabel ?? placeholder} autoCapitalize="none" autoCorrect={false}
        placeholder={placeholder} placeholderTextColor={theme.textMuted} value={value} onChangeText={onChangeText}
        style={[listStyles.searchBox, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
      {resultCountText === undefined ? null : <Text style={SIMAI_CATALOG_LIST_STYLES.resultCount}>{resultCountText}</Text>}
    </View>;
  }
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
