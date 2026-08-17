import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { OsuGameId } from '@/domain/game-mode-family';
import { useAppTheme } from '@/theme/app-theme';
import { OsuModeSelectContent } from './OsuModeSelectContent';

/** 绑定页内的模式选择弹层（复用已有 osu 账号时进入）。 */
export function OsuModeSelectSheet({ visible, alreadyBound, busy, onClose, onSubmit }: {
  visible: boolean;
  alreadyBound: readonly OsuGameId[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (selected: readonly OsuGameId[]) => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={busy ? undefined : onClose}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.background }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭模式选择"
            hitSlop={12}
            disabled={busy}
            onPress={onClose}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
          >
            <Text style={[styles.close, { color: theme.accent }]}>取消</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>选择 osu! 模式</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <OsuModeSelectContent
            alreadyBound={alreadyBound}
            busy={busy}
            submitLabel="绑定选中模式"
            onSubmit={onSubmit}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAction: { minWidth: 56, paddingVertical: 4 },
  headerSpacer: { minWidth: 56 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  close: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  scroll: { flexGrow: 1, paddingTop: 8 },
});
