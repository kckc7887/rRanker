import { AppSheet } from '@/components/AppSheet';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

type BestImagePickerChoice = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: string;
  disabled?: boolean;
  actionLabel?: string;
};

export function BestImageResourcePicker<TItem>({
  visible, label, items, getKey, getName, getMeta, renderPreview, isSelected, onSelect,
  onClose, currentChoice, quickChoices, aboveList, searchText, searchLabel, searchPlaceholder,
  title, countUnit = '项', itemLabel, isLoading = false, isError = false, onRetry,
}: {
  visible: boolean;
  label: string;
  items: readonly TItem[];
  getKey: (item: TItem) => string;
  getName: (item: TItem) => string;
  getMeta: (item: TItem) => string;
  renderPreview: (item: TItem) => ReactNode;
  isSelected: (item: TItem) => boolean;
  onSelect: (item: TItem) => void;
  onClose: () => void;
  currentChoice?: BestImagePickerChoice;
  quickChoices?: readonly BestImagePickerChoice[];
  aboveList?: ReactNode;
  searchText?: (item: TItem) => string;
  searchLabel?: string;
  searchPlaceholder?: string;
  title?: string;
  countUnit?: string;
  itemLabel?: (item: TItem) => string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const theme = useAppTheme();
  const [query, setQuery] = useState('');
  useEffect(() => { if (visible) setQuery(''); }, [label, visible]);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? items.filter(item => (searchText?.(item) ?? `${getName(item)} ${getKey(item)}`).toLocaleLowerCase().includes(normalized)) : items;
  }, [getKey, getName, items, query, searchText]);

  return <AppSheet visible={visible} onRequestClose={onClose} title={title ?? `选择${label}`}
    subtitle={isLoading ? '正在读取素材…' : `${filteredItems.length} ${countUnit}`}
    rightAction={{ label: '完成', accessibilityLabel: '关闭素材选择', onPress: onClose }}>
    <TextInput accessibilityLabel={searchLabel ?? `搜索${label}`} autoCorrect={false} clearButtonMode="while-editing"
      onChangeText={setQuery} placeholder={searchPlaceholder ?? `搜索${label}名称或 ID`} value={query}
      placeholderTextColor={theme.textMuted}
      style={[resourceStyles.search, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
    {aboveList}
    <FlatList data={filteredItems} keyExtractor={getKey} contentContainerStyle={resourceStyles.listContent}
      initialNumToRender={16} keyboardShouldPersistTaps="handled" maxToRenderPerBatch={16} windowSize={7}
      ListHeaderComponent={<View style={resourceStyles.quickChoices}>
        {currentChoice ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={currentChoice.actionLabel ?? currentChoice.label}
          accessibilityState={{ selected: currentChoice.selected }}
          onPress={currentChoice.onPress}
          style={({ pressed }) => [resourceStyles.item, { backgroundColor: theme.surface }, resourceStyles.currentItem, pressed && resourceStyles.pressed]}
        >
          <View style={[resourceStyles.currentBadge, { backgroundColor: theme.accentSoft }]}><Text style={[resourceStyles.currentBadgeText, { color: theme.accent }]}>当前</Text></View>
          <View style={resourceStyles.itemCopy}><Text style={[resourceStyles.itemName, { color: theme.text }]}>{currentChoice.label}</Text></View>
          {currentChoice.selected ? <Text style={[resourceStyles.check, { color: theme.accent }]}>✓</Text> : null}
        </Pressable> : null}
        {quickChoices?.length ? <View style={resourceStyles.quickChoiceRow}>{quickChoices.map(choice => <Pressable
          key={choice.label}
          accessibilityRole="button"
          accessibilityLabel={choice.actionLabel ?? choice.label}
          accessibilityState={{ selected: choice.selected }}
          disabled={choice.disabled}
          onPress={choice.onPress}
          style={({ pressed }) => [resourceStyles.quickChoice, { backgroundColor: theme.surface }, choice.selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }, pressed && resourceStyles.pressed]}
        >
          {choice.icon ? <Text style={[resourceStyles.quickChoiceIcon, { color: theme.textMuted }]}>{choice.icon}</Text> : null}
          <Text style={[resourceStyles.quickChoiceText, { color: theme.text }]}>{choice.label}</Text>
          {choice.selected ? <Text style={[resourceStyles.check, { color: theme.accent }]}>✓</Text> : null}
        </Pressable>)}</View> : null}
        {isLoading && !items.length ? <View style={resourceStyles.status}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.textMuted }}>正在读取完整列表</Text></View> : null}
        {isError ? <View style={resourceStyles.status}><Text style={{ color: theme.textMuted }}>素材列表加载失败</Text>{onRetry ? <Pressable onPress={onRetry}><Text style={{ color: theme.accent }}>重试</Text></Pressable> : null}</View> : null}
      </View>}
      ListEmptyComponent={!isLoading && !isError ? <Text style={[resourceStyles.empty, { color: theme.textMuted }]}>没有符合条件的{label}</Text> : null}
      renderItem={({ item }) => {
        const selected = isSelected(item);
        return <Pressable
          accessibilityRole="button"
          accessibilityLabel={itemLabel?.(item) ?? `${getName(item)}，${getMeta(item)}`}
          accessibilityState={{ selected }}
          onPress={() => onSelect(item)}
          style={({ pressed }) => [resourceStyles.item, { backgroundColor: theme.surface }, selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }, pressed && resourceStyles.pressed]}
        >
          <View style={resourceStyles.imagePreview}>{renderPreview(item)}</View>
          <View style={resourceStyles.itemCopy}><Text numberOfLines={2} style={[resourceStyles.itemName, { color: theme.text }]}>{getName(item)}</Text><Text numberOfLines={1} style={[resourceStyles.itemMeta, { color: theme.textMuted }]}>{getMeta(item)}</Text></View>
          {selected ? <Text style={[resourceStyles.check, { color: theme.accent }]}>✓</Text> : null}
        </Pressable>;
      }}
    />
  </AppSheet>;
}

const resourceStyles = StyleSheet.create({
  search: { marginHorizontal: 16, marginBottom: 10, minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  quickChoices: { gap: 8, marginBottom: 4 },
  quickChoiceRow: { flexDirection: 'row', gap: 8 },
  quickChoice: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  quickChoiceIcon: { fontSize: 18, fontWeight: '800' },
  quickChoiceText: { fontSize: 14, fontWeight: '800' },
  item: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  currentItem: { marginBottom: 4 },
  pressed: { opacity: 0.72 },
  imagePreview: { width: 128, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: '700' },
  itemMeta: { fontSize: 11, marginTop: 3 },
  check: { fontSize: 18, fontWeight: '900' },
  currentBadge: { width: 48, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  currentBadgeText: { fontSize: 11, fontWeight: '800' },
  empty: { paddingVertical: 40, fontSize: 14, textAlign: 'center' },
  status: { paddingVertical: 20, alignItems: 'center', gap: 12 },
});
