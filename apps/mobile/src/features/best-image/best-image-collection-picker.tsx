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
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import type { CollectionItem } from '@/domain/models';
import {
  normalizeTrophyTone,
  TROPHY_BADGE_THEMES,
} from './best-image-badge-theme';
import type {
  BestImageCollectionChoice,
  BestImageCollectionKind,
  BestImageCollectionSelectionMode,
} from './best-image-style-preferences';

export type {
  BestImageCollectionChoice,
  BestImageCollectionKind,
  BestImageCollectionSelectionMode,
} from './best-image-style-preferences';

type TrophyLevel = 'all' | 'normal' | 'bronze' | 'silver' | 'gold' | 'rainbow';

const LABELS: Record<BestImageCollectionKind, string> = {
  icon: '头像',
  plate: '姓名框',
  trophy: '称号',
  frame: '背景',
};
const TROPHY_LEVELS: { id: TrophyLevel; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'normal', label: '普通' },
  { id: 'bronze', label: '铜' },
  { id: 'silver', label: '银' },
  { id: 'gold', label: '金' },
  { id: 'rainbow', label: '彩虹' },
];

function trophyLevel(color: string | null | undefined): Exclude<TrophyLevel, 'all'> {
  return normalizeTrophyTone(color);
}

function trophyLevelLabel(color: string | null | undefined): string {
  return TROPHY_LEVELS.find((item) => item.id === trophyLevel(color))?.label ?? '普通';
}

export function TrophyPreview({ item, fallback }: { item?: CollectionItem; fallback?: string }) {
  const tone = normalizeTrophyTone(item?.color);
  const label = item?.name ?? fallback ?? '未设置';
  if (tone === 'rainbow') return (
    <LayeredGradientBadge
      contentStyle={styles.rainbowTrophyPreviewContent}
      label={label}
      numberOfLines={1}
      style={styles.trophyPreview}
      textStyle={styles.trophyPreviewText}
      tone="rainbow"
    />
  );
  const theme = TROPHY_BADGE_THEMES[tone];
  return (
    <View style={[styles.trophyPreview, styles.solidTrophyPreview, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <Text numberOfLines={1} style={[styles.trophyPreviewText, { color: theme.text }]}>{label}</Text>
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
  selectedMode,
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
  selectedMode: BestImageCollectionSelectionMode;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onClose: () => void;
  onSelect: (choice: BestImageCollectionChoice) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [selectedTrophyLevel, setSelectedTrophyLevel] = useState<TrophyLevel>('all');
  const label = kind ? LABELS[kind] : '';

  useEffect(() => {
    if (visible) {
      setQuery('');
      setSelectedTrophyLevel('all');
    }
  }, [kind, visible]);

  const kindItems = useMemo(() => items.filter((item) => item.kind === kind), [items, kind]);
  const filteredItems = useMemo(() => {
    if (!kind) return [];
    const normalized = query.trim().toLocaleLowerCase();
    return kindItems.filter((item) => (
      kind !== 'trophy' || selectedTrophyLevel === 'all' || trophyLevel(item.color) === selectedTrophyLevel
    ) && (
      normalized.length === 0
        || item.name.toLocaleLowerCase().includes(normalized)
        || String(item.id).includes(normalized)
    ));
  }, [kind, kindItems, query, selectedTrophyLevel]);

  const selectRandom = () => {
    if (kindItems.length === 0) return;
    const item = kindItems[Math.floor(Math.random() * kindItems.length)];
    if (item) onSelect({ mode: 'random', item });
  };

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
        {kind === 'trophy' ? (
          <View style={styles.levelSection}>
            <Text style={styles.levelLabel}>称号等级</Text>
            <View style={styles.levelFilters}>
              {TROPHY_LEVELS.map((level) => {
                const selected = selectedTrophyLevel === level.id;
                return (
                  <Pressable
                    key={level.id}
                    accessibilityLabel={`筛选称号等级 ${level.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedTrophyLevel(level.id)}
                    style={[styles.levelFilter, selected && styles.levelFilterSelected]}
                  >
                    <Text style={[styles.levelFilterText, selected && styles.levelFilterTextSelected]}>{level.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

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
              <View style={styles.quickChoices}>
                <Pressable
                  accessibilityLabel={`使用玩家当前${label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedMode === 'current' }}
                  onPress={() => onSelect({ mode: 'current' })}
                  style={({ pressed }) => [styles.item, styles.currentItem, pressed && styles.pressed]}
                >
                  <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>当前</Text></View>
                  <View style={styles.itemCopy}><Text style={styles.itemName}>使用玩家当前{label}</Text><Text style={styles.itemId}>恢复账号同步的素材</Text></View>
                  {selectedMode === 'current' ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
                <View style={styles.quickChoiceRow}>
                  <Pressable
                    accessibilityLabel={`随机${label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedMode === 'random' }}
                    disabled={kindItems.length === 0}
                    onPress={selectRandom}
                    style={({ pressed }) => [styles.quickChoice, selectedMode === 'random' && styles.selectedItem, pressed && styles.pressed]}
                  >
                    <Text style={styles.quickChoiceIcon}>↻</Text><Text style={styles.quickChoiceText}>随机</Text>
                    {selectedMode === 'random' ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`关闭${label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedMode === 'off' }}
                    onPress={() => onSelect({ mode: 'off' })}
                    style={({ pressed }) => [styles.quickChoice, selectedMode === 'off' && styles.selectedItem, pressed && styles.pressed]}
                  >
                    <Text style={styles.quickChoiceIcon}>×</Text><Text style={styles.quickChoiceText}>关闭</Text>
                    {selectedMode === 'off' ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>没有符合条件的{label}</Text>}
            renderItem={({ item }) => {
              const selected = selectedMode === 'item' && item.id === selectedId;
              return (
                <Pressable
                  accessibilityLabel={`${item.name}，#${item.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect({ mode: 'item', item })}
                  style={({ pressed }) => [styles.item, selected && styles.selectedItem, pressed && styles.pressed]}
                >
                  <ItemPreview item={item} />
                  <View style={styles.itemCopy}><Text numberOfLines={2} style={styles.itemName}>{item.name}</Text><Text style={styles.itemId}>#{item.id}{item.kind === 'trophy' ? ` · ${trophyLevelLabel(item.color)}` : ''}</Text></View>
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
  levelSection: { paddingHorizontal: 16, paddingBottom: 10 },
  levelLabel: { color: '#6B7280', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  levelFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  levelFilter: { minHeight: 30, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#D8DDE6', backgroundColor: '#FFFFFF' },
  levelFilterSelected: { borderColor: '#246BFD', backgroundColor: '#EEF4FF' },
  levelFilterText: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  levelFilterTextSelected: { color: '#246BFD' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  status: { color: '#6B7280', fontSize: 14 },
  retry: { borderRadius: 10, backgroundColor: '#246BFD', paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  quickChoices: { gap: 8, marginBottom: 4 },
  quickChoiceRow: { flexDirection: 'row', gap: 8 },
  quickChoice: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', backgroundColor: '#FFFFFF' },
  quickChoiceIcon: { color: '#65748B', fontSize: 18, fontWeight: '800' },
  quickChoiceText: { color: '#263246', fontSize: 14, fontWeight: '800' },
  item: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'transparent' },
  currentItem: { marginBottom: 4 },
  selectedItem: { borderColor: '#246BFD', backgroundColor: '#F2F6FF' },
  pressed: { opacity: 0.72 },
  imagePreview: { width: 128, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  trophyPreview: { maxWidth: 150, minWidth: 96, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  solidTrophyPreview: { paddingHorizontal: 12, borderWidth: 1 },
  rainbowTrophyPreviewContent: { paddingHorizontal: 10 },
  trophyPreviewText: { fontSize: 12, lineHeight: 16, fontWeight: '400', textAlign: 'center', includeFontPadding: false },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { color: '#111827', fontSize: 14, fontWeight: '700' },
  itemId: { color: '#9CA3AF', fontSize: 11, marginTop: 3 },
  check: { color: '#246BFD', fontSize: 18, fontWeight: '900' },
  currentBadge: { width: 48, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#E8F0FF' },
  currentBadgeText: { color: '#246BFD', fontSize: 11, fontWeight: '800' },
  empty: { paddingVertical: 40, color: '#8A93A3', fontSize: 14, textAlign: 'center' },
});
