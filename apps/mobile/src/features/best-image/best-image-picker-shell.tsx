import type { ReactElement, ReactNode } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  type ListRenderItem,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/app-theme';

/**
 * best-image 族选择器共享 Modal 外壳。
 *
 * 只承载四份 picker 完全同构的骨架：pageSheet Modal + grabber + header（标题/计数/完成）
 * + 搜索框 + 列表容器；主题色/insets 的注入顺序与各 picker 原实现逐字一致。
 * 样式值不在此统一：各家把自有 StyleSheet 的对应键经 `styles` 注入
 * （A 派 maimai/phigros 与 B 派 chunithm 的字号、间距、圆角存在原值差异，必须原样保留）。
 * 结构差异经插槽表达：`aboveList`（称号等级筛选 / 模式 chip 行 / 默认背景卡）、
 * `listHeaderComponent`/`listEmptyComponent`（快捷选择区 / 空态文案）、
 * `listNode`（maimai 加载/错误占位整块替换列表）。
 */
export type BestImagePickerShellStyles = {
  root: ViewStyle;
  grabber: ViewStyle;
  header: ViewStyle;
  title: TextStyle;
  count: TextStyle;
  done: TextStyle;
  search: TextStyle;
  listContent: StyleProp<ViewStyle>;
};

export type BestImagePickerShellFlatListProps<TItem> = {
  initialNumToRender?: number;
  maxToRenderPerBatch?: number;
  windowSize?: number;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  ListHeaderComponent?: ReactElement | React.ComponentType<TItem> | null;
  ListEmptyComponent?: ReactElement | React.ComponentType<any> | null;
  renderItem: ListRenderItem<TItem>;
};

export function BestImagePickerShell<TItem>({
  visible,
  onClose,
  title,
  countText,
  closeLabel,
  searchLabel,
  searchPlaceholder,
  searchProps,
  query,
  onQueryChange,
  aboveList,
  data,
  keyExtractor,
  flatListProps,
  listNode,
  styles,
}: {
  visible: boolean;
  onClose: () => void;
  /** 标题子节点：传各家原有 JSX 子节点结构（如 ['选择', label]），避免改变 Text children 形态。 */
  title: ReactNode;
  /** 计数子节点：同上，保留 [n, ' 项'] 与整体模板字符串等原始结构差异。 */
  countText: ReactNode;
  closeLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchProps?: {
    autoCorrect?: boolean;
    clearButtonMode?: 'never' | 'while-editing' | 'always' | 'unless-editing';
  };
  query: string;
  onQueryChange: (text: string) => void;
  aboveList?: ReactNode;
  data: readonly TItem[];
  keyExtractor: (item: TItem) => string;
  flatListProps: BestImagePickerShellFlatListProps<TItem>;
  listNode?: ReactNode;
  styles: BestImagePickerShellStyles;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.background }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <Text style={[styles.count, { color: theme.textMuted }]}>{countText}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={12} onPress={onClose}>
            <Text style={[styles.done, { color: theme.accent }]}>完成</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel={searchLabel}
          {...searchProps}
          onChangeText={onQueryChange}
          placeholder={searchPlaceholder}
          placeholderTextColor={theme.textMuted}
          style={[styles.search, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
          value={query}
        />
        {aboveList}
        {listNode ?? (
          <FlatList
            data={data}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            {...flatListProps}
          />
        )}
      </View>
    </Modal>
  );
}
