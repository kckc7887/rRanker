import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CollectionImage } from '@/components/CollectionImage';
import type { CollectionItem } from '@/domain/models';

export type BestImageCollectionKind = 'icon' | 'plate' | 'trophy' | 'frame';

const LABELS: Record<BestImageCollectionKind, string> = {
  icon: '头像',
  plate: '姓名框',
  trophy: '称号',
  frame: '背景',
};

function trophyColors(color: string | null | undefined) {
  switch (color?.toLowerCase()) {
    case 'bronze': return { borderColor: '#B87333', backgroundColor: '#FBF3EA', color: '#8B5A1A' };
    case 'silver': return { borderColor: '#9CA3AF', backgroundColor: '#F3F4F6', color: '#4B5563' };
    case 'gold': return { borderColor: '#D4A017', backgroundColor: '#FFF8E6', color: '#92650A' };
    case 'rainbow': return { borderColor: '#8B5CF6', backgroundColor: '#F5F3FF', color: '#5B21B6' };
    default: return { borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', color: '#475569' };
  }
}

export function TrophyPreview({ item, fallback }: { item?: CollectionItem; fallback?: string }) {
  const tone = trophyColors(item?.color);
  return (
    <View style={[styles.trophyPreview, { borderColor: tone.borderColor, backgroundColor: tone.backgroundColor }]}>
      <Text numberOfLines={1} style={[styles.trophyPreviewText, { color: tone.color }]}>
        {item?.name ?? fallback ?? '未设置'}
      </Text>
    </View>
  );
}

function ItemPreview({ item }: { item: CollectionItem }) {
  if (item.kind === 'trophy') return <TrophyPreview item={item} />;
  return (
    <View style={styles.imagePreview}>
      <CollectionImage
        kind={item.kind}
        collectionId={item.id}
        size={item.kind === 'plate' ? 20 : 48}
        borderRadius={item.kind === 'plate' ? 4 : 10}
      />
    </View>
  );
}

export function BestImageCollectionPicker({
  visible,
  kind,
  items,
  selectedId,
  isLoading,
  isError,
  onRetry,
  onClose,
  onSelect,
}: {
  visible: boolean;
  kind: BestImageCollectionKind | null;
  items: readonly CollectionItem[];
  selectedId: number | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onClose: () => void;
  onSelect: (item: CollectionItem | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const label = kind ? LABELS[kind] : '';

  useEffect(() => {
    if (visible) setQuery('');
  }, [kind, visible]);

  const filteredItems = useMemo(() => {
    if (!kind) return [];
    const normalized = query.trim().toLocaleLowerCase();
    return items.filter((item) => item.kind === kind && (
      normalized.length === 0
      || item.name.toLocaleLowerCase().includes(normalized)
      || String(item.id).includes(normalized)
    ));
  }, [items, kind, query]);

  return (
    <Modal
      visible={visible && kind !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>选择{label}</Text>
            <Text style={styles.count}>{isLoading ? '正在读取落雪收藏品…' : `${filteredItems.length} 项`}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭收藏品选择器" hitSlop={12} onPress={onClose}>
            <Text style={styles.done}>完成</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel={`搜索${label}`}
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setQuery}
          placeholder={`搜索${label}名称或 ID`}
          placeholderTextColor="#9CA3AF"
          style={styles.search}
          value={query}
        />

        {isLoading && items.length === 0 ? (
          <View style={styles.center}><ActivityIndicator color="#246BFD" /><Text style={styles.status}>正在从落雪读取完整列表</Text></View>
        ) : isError && items.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.status}>落雪收藏品加载失败</Text>
            <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>重试</Text></Pressable>
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            initialNumToRender={16}
            keyExtractor={(item) => `${item.kind}-${item.id}`}
            keyboardShouldPersistTaps="handled"
            maxToRenderPerBatch={16}
            windowSize={7}
            ListHeaderComponent={(
              <Pressable
                accessibilityLabel={`使用玩家当前${label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedId === null }}
                onPress={() => onSelect(null)}
                style={({ pressed }) => [styles.item, styles.currentItem, pressed && styles.pressed]}
              >
                <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>当前</Text></View>
                <View style={styles.itemCopy}><Text style={styles.itemName}>使用玩家当前{label}</Text><Text style={styles.itemId}>恢复账号同步的素材</Text></View>
                {selectedId === null ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.empty}>没有符合条件的{label}</Text>}
            renderItem={({ item }) => {
              const selected = item.id === selectedId;
              return (
                <Pressable
                  accessibilityLabel={`${item.name}，#${item.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [styles.item, selected && styles.selectedItem, pressed && styles.pressed]}
                >
                  <ItemPreview item={item} />
                  <View style={styles.itemCopy}><Text numberOfLines={2} style={styles.itemName}>{item.name}</Text><Text style={styles.itemId}>#{item.id}</Text></View>
                  {selected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            }}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F3F7' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: '#D1D5DB', marginTop: 10 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#111827', fontSize: 20, fontWeight: '800' },
  count: { color: '#8A93A3', fontSize: 12, marginTop: 3 },
  done: { color: '#246BFD', fontSize: 16, fontWeight: '700' },
  search: { marginHorizontal: 16, marginBottom: 10, minHeight: 44, borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 14, color: '#111827', fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  status: { color: '#6B7280', fontSize: 14 },
  retry: { borderRadius: 10, backgroundColor: '#246BFD', paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  item: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'transparent' },
  currentItem: { marginBottom: 4 },
  selectedItem: { borderColor: '#246BFD', backgroundColor: '#F2F6FF' },
  pressed: { opacity: 0.72 },
  imagePreview: { width: 128, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  trophyPreview: { maxWidth: 150, minWidth: 96, minHeight: 28, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  trophyPreviewText: { fontSize: 12, fontWeight: '400' },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { color: '#111827', fontSize: 14, fontWeight: '700' },
  itemId: { color: '#9CA3AF', fontSize: 11, marginTop: 3 },
  check: { color: '#246BFD', fontSize: 18, fontWeight: '900' },
  currentBadge: { width: 48, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#E8F0FF' },
  currentBadgeText: { color: '#246BFD', fontSize: 11, fontWeight: '800' },
  empty: { paddingVertical: 40, color: '#8A93A3', fontSize: 14, textAlign: 'center' },
});
