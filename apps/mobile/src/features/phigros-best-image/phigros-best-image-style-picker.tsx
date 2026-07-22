import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  type ImageSourcePropType,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/app-theme';
import type { PhigrosImageStyleChoice } from './phigros-best-image-preferences';

export type PhigrosBestImagePickerKind = 'avatar' | 'background';
export type PhigrosBestImagePickerItem = {
  key: string;
  label: string;
  meta: string;
  source: ImageSourcePropType;
};

const LABELS: Record<PhigrosBestImagePickerKind, string> = {
  avatar: '头像',
  background: '背景',
};

export function PhigrosBestImageStylePicker({
  visible,
  kind,
  items,
  selection,
  onClose,
  onSelect,
}: {
  visible: boolean;
  kind: PhigrosBestImagePickerKind | null;
  items: readonly PhigrosBestImagePickerItem[];
  selection: PhigrosImageStyleChoice | null;
  onClose: () => void;
  onSelect: (choice: PhigrosImageStyleChoice) => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const label = kind ? LABELS[kind] : '';

  useEffect(() => {
    if (visible) setQuery('');
  }, [kind, visible]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return items;
    return items.filter((item) => item.label.toLocaleLowerCase().includes(normalized)
      || item.key.toLocaleLowerCase().includes(normalized));
  }, [items, query]);

  const selectRandom = () => {
    const item = items[Math.floor(Math.random() * items.length)];
    if (item) onSelect({ mode: 'random', key: item.key });
  };

  return (
    <Modal
      visible={visible && kind !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.background }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>选择{label}</Text>
            <Text style={[styles.count, { color: theme.textMuted }]}>{filteredItems.length} 项</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭素材选择" hitSlop={12} onPress={onClose}>
            <Text style={[styles.done, { color: theme.accent }]}>完成</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel={`搜索${label}`}
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setQuery}
          placeholder={`搜索${label}名称或 ID`}
          placeholderTextColor={theme.textMuted}
          style={[styles.search, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
          value={query}
        />
        <FlatList
          data={filteredItems}
          initialNumToRender={16}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          maxToRenderPerBatch={16}
          windowSize={7}
          ListHeaderComponent={(
            <View style={styles.quickChoices}>
              <Pressable
                accessibilityLabel={`使用玩家当前${label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: selection?.mode === 'current' }}
                onPress={() => onSelect({ mode: 'current' })}
                style={({ pressed }) => [styles.item, { backgroundColor: theme.surface }, styles.currentItem, pressed && styles.pressed]}
              >
                <View style={[styles.currentBadge, { backgroundColor: theme.accentSoft }]}><Text style={[styles.currentBadgeText, { color: theme.accent }]}>当前</Text></View>
                <View style={styles.itemCopy}><Text style={[styles.itemName, { color: theme.text }]}>使用玩家当前{label}</Text><Text style={[styles.itemMeta, { color: theme.textMuted }]}>恢复账号同步的素材</Text></View>
                {selection?.mode === 'current' ? <Text style={[styles.check, { color: theme.accent }]}>✓</Text> : null}
              </Pressable>
              <View style={styles.quickChoiceRow}>
                <Pressable
                  accessibilityLabel={`随机${label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selection?.mode === 'random' }}
                  disabled={items.length === 0}
                  onPress={selectRandom}
                  style={({ pressed }) => [styles.quickChoice, { backgroundColor: theme.surface }, selection?.mode === 'random' && { borderColor: theme.accent, backgroundColor: theme.accentSoft }, pressed && styles.pressed]}
                >
                  <Text style={[styles.quickChoiceIcon, { color: theme.textMuted }]}>↻</Text><Text style={[styles.quickChoiceText, { color: theme.text }]}>随机</Text>
                  {selection?.mode === 'random' ? <Text style={[styles.check, { color: theme.accent }]}>✓</Text> : null}
                </Pressable>
                <Pressable
                  accessibilityLabel={`关闭${label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selection?.mode === 'off' }}
                  onPress={() => onSelect({ mode: 'off' })}
                  style={({ pressed }) => [styles.quickChoice, { backgroundColor: theme.surface }, selection?.mode === 'off' && { borderColor: theme.accent, backgroundColor: theme.accentSoft }, pressed && styles.pressed]}
                >
                  <Text style={[styles.quickChoiceIcon, { color: theme.textMuted }]}>×</Text><Text style={[styles.quickChoiceText, { color: theme.text }]}>关闭</Text>
                  {selection?.mode === 'off' ? <Text style={[styles.check, { color: theme.accent }]}>✓</Text> : null}
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={[styles.empty, { color: theme.textMuted }]}>没有符合条件的{label}</Text>}
          renderItem={({ item }) => {
            const selected = selection?.mode === 'item' && selection.key === item.key;
            return (
              <Pressable
                accessibilityLabel={`${item.label}，${item.meta}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSelect({ mode: 'item', key: item.key })}
                style={({ pressed }) => [styles.item, { backgroundColor: theme.surface }, selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }, pressed && styles.pressed]}
              >
                <View style={styles.imagePreview}>
                  <Image source={item.source} resizeMode="cover" style={kind === 'avatar' ? styles.avatarImage : styles.backgroundImage} />
                </View>
                <View style={styles.itemCopy}><Text numberOfLines={2} style={[styles.itemName, { color: theme.text }]}>{item.label}</Text><Text numberOfLines={1} style={[styles.itemMeta, { color: theme.textMuted }]}>{item.meta}</Text></View>
                {selected ? <Text style={[styles.check, { color: theme.accent }]}>✓</Text> : null}
              </Pressable>
            );
          }}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 10 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800' },
  count: { fontSize: 12, marginTop: 3 },
  done: { fontSize: 16, fontWeight: '700' },
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
  avatarImage: { width: 48, height: 48, borderRadius: 10 },
  backgroundImage: { width: 128, height: 48, borderRadius: 10 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: '700' },
  itemMeta: { fontSize: 11, marginTop: 3 },
  check: { fontSize: 18, fontWeight: '900' },
  currentBadge: { width: 48, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  currentBadgeText: { fontSize: 11, fontWeight: '800' },
  empty: { paddingVertical: 40, fontSize: 14, textAlign: 'center' },
});
