import type { ReactElement, ReactNode } from 'react';
import {
  FlatList,
  StyleSheet,
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

/** 成绩图素材选择器的弹层外壳。 */
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
  /** 标题子节点。 */
  title: ReactNode;
  /** 计数子节点。 */
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

export const standardBestImagePickerStyles = StyleSheet.create({
  root: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 10 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800' },
  count: { fontSize: 12, marginTop: 3 },
  done: { fontSize: 16, fontWeight: '700' },
  search: { marginHorizontal: 16, marginBottom: 10, minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
});

export const compactBestImagePickerStyles = StyleSheet.create({
  root: { flex: 1, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 42, height: 5, borderRadius: 999, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  count: { marginTop: 2, fontSize: 12, fontWeight: '600' },
  close: { fontSize: 15, fontWeight: '700' },
  search: { marginHorizontal: 16, minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, fontSize: 14 },
});
