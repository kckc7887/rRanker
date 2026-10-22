import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CollectionImage } from '@/components/CollectionImage';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import type { CollectionItem } from '@/domain/models';
import { useAppTheme } from '@/theme/app-theme';
import {
  normalizeTrophyTone,
  TROPHY_BADGE_THEMES,
} from './best-image-badge-theme';
import { BestImageResourcePicker } from './best-image-picker-shell';
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

export function BestImageCollectionPicker({ visible, kind, items, selectedId, selectedMode, isLoading, isError, onRetry, onClose, onSelect }: {
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
  const theme = useAppTheme();
  const [selectedTrophyLevel, setSelectedTrophyLevel] = useState<TrophyLevel>('all');
  useEffect(() => { if (visible) setSelectedTrophyLevel('all'); }, [kind, visible]);
  const label = kind ? LABELS[kind] : '';
  const kindItems = useMemo(() => items.filter(item => item.kind === kind), [items, kind]);
  const filteredItems = useMemo(() => kind === 'trophy' && selectedTrophyLevel !== 'all'
    ? kindItems.filter(item => trophyLevel(item.color) === selectedTrophyLevel) : kindItems, [kind, kindItems, selectedTrophyLevel]);
  return <BestImageResourcePicker
    visible={visible && kind !== null}
    label={label}
    items={filteredItems}
    getKey={item => String(item.id)}
    getName={item => item.name}
    getMeta={item => `#${item.id}${item.kind === 'trophy' ? ` · ${trophyLevelLabel(item.color)}` : ''}`}
    itemLabel={item => `${item.name}，#${item.id}`}
    renderPreview={item => <ItemPreview item={item} />}
    isSelected={item => selectedMode === 'item' && item.id === selectedId}
    onSelect={item => onSelect({ mode: 'item', item })}
    onClose={onClose}
    currentChoice={{ label: `使用玩家当前${label}`, selected: selectedMode === 'current', onPress: () => onSelect({ mode: 'current' }) }}
    quickChoices={[
      { label: '随机', actionLabel: `随机${label}`, icon: '↻', selected: selectedMode === 'random', disabled: !kindItems.length, onPress: () => {
        const item = kindItems[Math.floor(Math.random() * kindItems.length)];
        if (item) onSelect({ mode: 'random', item });
      } },
      { label: '关闭', actionLabel: `关闭${label}`, icon: '×', selected: selectedMode === 'off', onPress: () => onSelect({ mode: 'off' }) },
    ]}
    aboveList={kind === 'trophy' ? <View style={styles.levelSection}>
      <Text style={[styles.levelLabel, { color: theme.textSecondary }]}>称号等级</Text>
      <View style={styles.levelFilters}>{TROPHY_LEVELS.map(level => {
        const selected = selectedTrophyLevel === level.id;
        return <Pressable key={level.id} accessibilityLabel={`筛选称号等级 ${level.label}`} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedTrophyLevel(level.id)} style={[styles.levelFilter, { borderColor: theme.border, backgroundColor: theme.surface }, selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
          <Text style={[styles.levelFilterText, { color: theme.textMuted }, selected && { color: theme.accent }]}>{level.label}</Text>
        </Pressable>;
      })}</View>
    </View> : null}
    isLoading={isLoading}
    isError={isError}
    onRetry={onRetry}
  />;
}

const styles = StyleSheet.create({
  levelSection: { paddingHorizontal: 16, paddingBottom: 10 },
  levelLabel: { fontSize: 12, fontWeight: '700', marginBottom: 7 },
  levelFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  levelFilter: { minHeight: 30, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1 },
  levelFilterText: { fontSize: 12, fontWeight: '700' },
  imagePreview: { width: 128, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  trophyPreview: { maxWidth: 150, minWidth: 96, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  solidTrophyPreview: { paddingHorizontal: 12, borderWidth: 1 },
  rainbowTrophyPreviewContent: { paddingHorizontal: 10 },
  trophyPreviewText: { fontSize: 12, lineHeight: 16, fontWeight: '400', textAlign: 'center', includeFontPadding: false },
});
