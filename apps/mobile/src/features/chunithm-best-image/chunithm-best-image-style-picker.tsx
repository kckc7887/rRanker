import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildChunithmCharacterUrl,
  buildChunithmNamePlateUrl,
  buildChunithmTrophyUrl,
} from '@/domain/chunithm-personal';
import { useAppTheme } from '@/theme/app-theme';
import type { ChunithmBestImageCollectionItem } from './load-chunithm-best-image-collections';
import type {
  ChunithmBestImageStyleChoice,
  ChunithmBestImageStyleKind,
} from './chunithm-best-image-preferences';

const LABELS: Record<ChunithmBestImageStyleKind, string> = {
  character: '角色',
  plate: '名牌板',
  trophy: '称号',
};

function previewUrl(kind: ChunithmBestImageStyleKind, id: number): string | null {
  if (kind === 'character') return buildChunithmCharacterUrl(id);
  if (kind === 'plate') return buildChunithmNamePlateUrl(id);
  return buildChunithmTrophyUrl(id);
}

export function ChunithmBestImageStylePicker({
  visible,
  kind,
  items,
  selection,
  onClose,
  onSelect,
}: {
  visible: boolean;
  kind: ChunithmBestImageStyleKind | null;
  items: readonly ChunithmBestImageCollectionItem[];
  selection: ChunithmBestImageStyleChoice | null;
  onClose: () => void;
  onSelect: (choice: ChunithmBestImageStyleChoice) => void;
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
    return items.filter((item) => (
      item.name.toLocaleLowerCase().includes(normalized)
      || String(item.id).includes(normalized)
    ));
  }, [items, query]);

  const selectRandom = () => {
    const item = items[Math.floor(Math.random() * items.length)];
    if (item) onSelect({ mode: 'random', id: item.id, name: item.name });
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
            <Text style={[styles.close, { color: theme.accent }]}>完成</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel={`搜索${label}`}
          value={query}
          onChangeText={setQuery}
          placeholder={`搜索${label}`}
          placeholderTextColor={theme.textMuted}
          style={[styles.search, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
        />
        <View style={styles.modeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`使用当前${label}`}
            onPress={() => onSelect({ mode: 'current' })}
            style={[styles.modeChip, { borderColor: theme.border, backgroundColor: theme.surface }, selection?.mode === 'current' && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
          >
            <Text style={[styles.modeText, { color: theme.textSecondary }, selection?.mode === 'current' && { color: theme.accent }]}>玩家当前</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`随机${label}`}
            onPress={selectRandom}
            style={[styles.modeChip, { borderColor: theme.border, backgroundColor: theme.surface }, selection?.mode === 'random' && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
          >
            <Text style={[styles.modeText, { color: theme.textSecondary }, selection?.mode === 'random' && { color: theme.accent }]}>随机</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`关闭${label}`}
            onPress={() => onSelect({ mode: 'off' })}
            style={[styles.modeChip, { borderColor: theme.border, backgroundColor: theme.surface }, selection?.mode === 'off' && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
          >
            <Text style={[styles.modeText, { color: theme.textSecondary }, selection?.mode === 'off' && { color: theme.accent }]}>关闭</Text>
          </Pressable>
        </View>
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const selected = (selection?.mode === 'item' || selection?.mode === 'random')
              && selection.id === item.id;
            const uri = previewUrl(item.kind, item.id);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`选择${item.name}`}
                onPress={() => onSelect({ mode: 'item', id: item.id, name: item.name })}
                style={[styles.item, { backgroundColor: theme.surface, borderColor: theme.border }, selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
              >
                <View style={[styles.preview, item.kind === 'plate' && styles.platePreview, item.kind === 'trophy' && styles.trophyPreview]}>
                  {uri ? (
                    <Image source={{ uri }} style={styles.previewImage} resizeMode={item.kind === 'character' ? 'cover' : 'contain'} />
                  ) : (
                    <Text style={[styles.noPreview, { color: theme.textMuted }]}>无预览</Text>
                  )}
                </View>
                <View style={styles.copy}>
                  <Text numberOfLines={2} style={[styles.itemName, { color: theme.text }]}>{item.name}</Text>
                  <Text style={[styles.itemId, { color: theme.textMuted }]}>#{item.id}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 42, height: 5, borderRadius: 999, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  count: { marginTop: 2, fontSize: 12, fontWeight: '600' },
  close: { fontSize: 15, fontWeight: '700' },
  search: { marginHorizontal: 16, minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, fontSize: 14 },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  modeChip: { minHeight: 34, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  modeText: { fontSize: 12, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 14 },
  preview: { width: 54, height: 54, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  platePreview: { width: 120, height: 40, borderRadius: 8 },
  trophyPreview: { width: 120, height: 36, borderRadius: 8 },
  previewImage: { width: '100%', height: '100%' },
  noPreview: { fontSize: 11, fontWeight: '600' },
  copy: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: '700' },
  itemId: { marginTop: 3, fontSize: 12 },
});
