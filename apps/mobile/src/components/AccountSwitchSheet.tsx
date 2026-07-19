import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GameId } from '@/domain/game-bind-options';
import type { BoundAccount } from '@/domain/bound-account';
import { BoundAccountGroupedList } from '@/components/BoundAccountGroupedList';
import { useAppTheme } from '@/theme/app-theme';

/** 总览切换：仅列出已绑定游戏，展开为账号行。 */
export function AccountSwitchSheet({
  visible,
  accounts,
  expandedGameId,
  activeAccountId,
  onClose,
  onToggleGame,
  onSelectAccount,
}: {
  visible: boolean;
  accounts: BoundAccount[];
  expandedGameId: GameId | null;
  activeAccountId: string | null;
  onClose: () => void;
  onToggleGame: (id: GameId) => void;
  onSelectAccount: (account: BoundAccount) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.background }]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Text style={styles.title}>切换账号</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭"
            hitSlop={12}
            onPress={onClose}
            style={({ pressed }) => [styles.closeHit, pressed && styles.softPressed]}
          >
            <Text style={styles.close}>完成</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>已绑定</Text>
          <BoundAccountGroupedList accounts={accounts} expandedGameId={expandedGameId} activeAccountId={activeAccountId}
            onToggleGame={onToggleGame} onSelectAccount={onSelectAccount}
            emptyText="暂无已绑定账号，请先在设置 → 游戏管理中绑定。" />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F3F7' },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#111827', fontSize: 20, fontWeight: '700' },
  closeHit: { paddingVertical: 4, paddingHorizontal: 2 },
  close: { color: '#246BFD', fontSize: 16, fontWeight: '600' },
  softPressed: { opacity: 0.72 },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 8 },
  empty: { color: '#6B7280', fontSize: 14, lineHeight: 20, padding: 12 },
  sectionLabel: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  list: { gap: 12 },
  gameCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  gameRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gameIcon: { width: 52, height: 52, borderRadius: 14 },
  copy: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  gameName: { color: '#111827', fontSize: 17, fontWeight: '700' },
  detail: { color: '#6B7280', fontSize: 13, lineHeight: 18 },
  accountNest: {
    backgroundColor: '#F7F8FA',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },
  accountRow: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountPressed: { backgroundColor: '#EEF2F7' },
  accountCurrent: { borderWidth: 1, borderColor: '#246BFD' },
  providerIcon: { width: 40, height: 40, borderRadius: 10 },
  accountName: { color: '#111827', fontSize: 17, fontWeight: '700' },
  providerLine: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  currentBadge: {
    color: '#246BFD',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#E8F0FF',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
