import { ScrollView, StyleSheet, Text } from 'react-native';
import { AppSheet } from '@rranker/sdk/components/AppSheet';
import type { GameId } from '@rranker/sdk/domain/game-bind-options';
import type { BoundAccount } from '@rranker/sdk/account';
import { BoundAccountGroupedList } from '@rranker/sdk/components/BoundAccountGroupedList';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';

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
  const theme = useAppTheme();

  return (
    <AppSheet visible={visible} presentationStyle="formSheet" backdropColor={theme.background} onRequestClose={onClose}
      title="切换账号" rightAction={{ label: '完成', accessibilityLabel: '关闭', onPress: onClose }}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>已绑定</Text>
        <BoundAccountGroupedList accounts={accounts} expandedGameId={expandedGameId} activeAccountId={activeAccountId}
          hydrationEnabled={visible}
          onToggleGame={onToggleGame} onSelectAccount={onSelectAccount}
          emptyText="暂无已绑定账号，请先在设置 → 游戏管理中绑定。" />
      </ScrollView>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 8 },
  sectionLabel: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
    marginBottom: 2,
    letterSpacing: 0.3,
  },
});
