import { StyleSheet } from 'react-native';
import { BestImageResourcePicker } from '@/features/best-image/best-image-picker-shell';
import { RemoteNativeImage as Image } from '@/components/RemoteNativeImage';
import type { ImageSourcePropType } from 'react-native';
import type { PhigrosImageStyleChoice } from './phigros-best-image-preferences';

export type PhigrosBestImagePickerKind = 'avatar' | 'background';
export type PhigrosBestImagePickerItem = {
  key: string;
  label: string;
  meta: string;
  source: ImageSourcePropType;
};

export function PhigrosBestImageStylePicker({ visible, kind, items, selection, onClose, onSelect }: {
  visible: boolean;
  kind: PhigrosBestImagePickerKind | null;
  items: readonly PhigrosBestImagePickerItem[];
  selection: PhigrosImageStyleChoice | null;
  onClose: () => void;
  onSelect: (choice: PhigrosImageStyleChoice) => void;
}) {
  const label = kind === 'avatar' ? '头像' : '背景';
  return <BestImageResourcePicker
    visible={visible && kind !== null}
    label={label}
    items={items}
    getKey={item => item.key}
    getName={item => item.label}
    getMeta={item => item.meta}
    renderPreview={item => kind === 'avatar'
      ? <Image cacheProfile="native" source={item.source} resizeMode="cover" style={styles.avatarImage} />
      : <Image cacheProfile="thumbnail" gameId="phigros" source={item.source} resizeMode="cover" style={styles.backgroundImage} />}
    isSelected={item => selection?.mode === 'item' && selection.key === item.key}
    onSelect={item => onSelect({ mode: 'item', key: item.key })}
    onClose={onClose}
    currentChoice={{ label: `使用玩家当前${label}`, selected: selection?.mode === 'current', onPress: () => onSelect({ mode: 'current' }) }}
    quickChoices={[
      { label: '随机', actionLabel: `随机${label}`, icon: '↻', selected: selection?.mode === 'random', disabled: !items.length, onPress: () => {
        const item = items[Math.floor(Math.random() * items.length)];
        if (item) onSelect({ mode: 'random', key: item.key });
      } },
      { label: '关闭', actionLabel: `关闭${label}`, icon: '×', selected: selection?.mode === 'off', onPress: () => onSelect({ mode: 'off' }) },
    ]}
  />;
}

const styles = StyleSheet.create({
  avatarImage: { width: 48, height: 48, borderRadius: 10 },
  backgroundImage: { width: 128, height: 48, borderRadius: 10 },
});
