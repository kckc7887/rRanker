import { StyleSheet, Text, View } from 'react-native';
import { buildChunithmCharacterUrl, buildChunithmPlateUrl } from '@/domain/chunithm-personal';
import { useAppTheme } from '@/theme/app-theme';
import { BestImageResourcePicker } from '@/features/best-image/best-image-picker-shell';
import { TrophyPreview } from '@/features/best-image/best-image-collection-picker';
import { ChunithmCollectionImage } from '@/components/chunithm/ChunithmCollectionImage';
import { RemoteNativeImage as Image } from '@/components/RemoteNativeImage';
import type { ChunithmCollection } from '@/domain/chunithm-collections';
import type { ChunithmBestImageStyleChoice } from './chunithm-best-image-preferences';

export function ChunithmBestImageStylePicker({ kind = 'character', visible, items, selection, onClose, onSelect, isLoading, isError, onRetry }: {
  kind?: 'character' | 'plate' | 'trophy';
  visible: boolean;
  items: readonly ChunithmCollection[];
  selection: ChunithmBestImageStyleChoice | null;
  onClose: () => void;
  onSelect: (choice: ChunithmBestImageStyleChoice) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const theme = useAppTheme();
  const label = kind === 'plate' ? '名牌' : kind === 'trophy' ? '称号' : '角色';
  const defaultMode = kind === 'plate' ? 'default' : 'off';
  const choice = (mode: 'item' | 'random', item: ChunithmCollection): ChunithmBestImageStyleChoice => ({ mode, id: item.id, name: item.name, color: item.color, level: item.level });
  return <BestImageResourcePicker
    visible={visible}
    label={label}
    items={items}
    getKey={item => String(item.id)}
    getName={item => item.name || `#${item.id}`}
    getMeta={item => `#${item.id}`}
    itemLabel={item => `选择${item.name}`}
    renderPreview={item => {
      if (kind === 'trophy') return <ChunithmBestImageTrophyPreview trophy={item} />;
      const uri = kind === 'plate' ? buildChunithmPlateUrl(item.id) : buildChunithmCharacterUrl(item.id);
      return uri ? <Image cacheProfile="native" source={{ uri }} style={kind === 'plate' ? styles.plate : styles.character} resizeMode="contain" />
        : <Text style={{ color: theme.textMuted }}>无预览</Text>;
    }}
    isSelected={item => selection?.mode === 'item' && selection.id === item.id}
    onSelect={item => onSelect(choice('item', item))}
    onClose={onClose}
    currentChoice={{ label: `使用玩家当前${label}`, selected: selection?.mode === 'current', onPress: () => onSelect({ mode: 'current' }) }}
    quickChoices={[
      { label: '随机', actionLabel: `随机${label}`, icon: '↻', selected: selection?.mode === 'random', disabled: !items.length, onPress: () => {
        const item = items[Math.floor(Math.random() * items.length)];
        if (item) onSelect(choice('random', item));
      } },
      { label: kind === 'plate' ? '默认板' : '关闭', actionLabel: kind === 'plate' ? '使用默认板' : `关闭${label}`, icon: '×', selected: selection?.mode === defaultMode, onPress: () => onSelect({ mode: defaultMode }) },
    ]}
    isLoading={isLoading}
    isError={isError}
    onRetry={onRetry}
  />;
}

export function ChunithmBestImageTrophyPreview({ trophy }: { trophy?: { id: number; name?: string; color?: string | null } | null }) {
  if (trophy?.color === 'image') return <ChunithmCollectionImage kind="trophy-image" collectionId={trophy.id} height={15} borderRadius={0} />;
  if (trophy?.color === 'platina' || trophy?.color === 'platinum' || trophy?.color === 'ultima') {
    const ultima = trophy.color === 'ultima';
    return <View style={[styles.trophy, { backgroundColor: ultima ? '#512D67' : '#FFFDDD', borderColor: ultima ? '#A071B9' : '#DEC27B' }]}><Text numberOfLines={1} style={[styles.trophyText, { color: ultima ? '#FFF' : '#29333A' }]}>{trophy.name || `#${trophy.id}`}</Text></View>;
  }
  return <TrophyPreview item={trophy ? { ...trophy, name: trophy.name ?? `#${trophy.id}`, kind: 'trophy', requirements: [] } : undefined} fallback="未设置" />;
}

const styles = StyleSheet.create({
  plate: { width: 116, height: 46 },
  character: { width: 48, height: 48 },
  trophy: { maxWidth: 128, minWidth: 96, height: 28, borderRadius: 999, paddingHorizontal: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  trophyText: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
});
