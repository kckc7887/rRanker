import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { DxRatingTag } from '@/components/DxRatingTag';
import { groupBoundAccountGameIds, type BoundAccount } from '@/domain/bound-account';
import { findGame, findProvider, type GameId } from '@/domain/game-bind-options';
import { useAppTheme } from '@/theme/app-theme';

function accountIcon(account: BoundAccount) {
  return account.providerId ? findProvider(account.providerId)?.icon ?? findGame(account.gameId)?.icon : findGame(account.gameId)?.icon;
}

function ratingNumber(display: string): number | null {
  const value = Number.parseInt(display, 10);
  return Number.isFinite(value) ? value : null;
}

export function BoundAccountGroupedList({ accounts, expandedGameId, isGameExpanded, activeAccountId, onToggleGame, onSelectAccount, renderActions, emptyText }: {
  accounts: BoundAccount[];
  expandedGameId: GameId | null;
  isGameExpanded?: (gameId: GameId) => boolean;
  activeAccountId: string | null;
  onToggleGame: (gameId: GameId) => void;
  onSelectAccount?: (account: BoundAccount) => void;
  renderActions?: (account: BoundAccount) => ReactNode;
  emptyText?: string;
}) {
  const theme = useAppTheme();
  const groups = groupBoundAccountGameIds(accounts).flatMap((gameId) => {
    const game = findGame(gameId);
    return game ? [{ gameId, title: game.title, icon: game.icon, accounts: accounts.filter((item) => item.gameId === gameId) }] : [];
  });
  if (!groups.length) return <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyText ?? '暂无已绑定账号'}</Text>;
  return <View style={styles.list}>{groups.map((group) => {
    const expanded = isGameExpanded?.(group.gameId) ?? expandedGameId === group.gameId;
    return <View key={group.gameId} style={[styles.gameCard, { backgroundColor: theme.surface }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? '收起' : '展开'}游戏 ${group.title}`}
        accessibilityState={{ expanded }} onPress={() => onToggleGame(group.gameId)} style={styles.gameRow}>
        <Image source={group.icon} style={styles.gameIcon} />
        <View style={styles.copy}><Text style={[styles.gameName, { color: theme.text }]}>{group.title}</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>{expanded ? '选择或管理账号' : `${group.accounts.length} 个账号 · 点按展开`}</Text></View>
        <SymbolView name={expanded ? 'chevron.down' : 'chevron.right'} size={14} tintColor={theme.textMuted}
          fallback={<Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.textMuted} />} />
      </Pressable>
      {expanded ? <View style={[styles.accountNest, { backgroundColor: theme.surfaceMuted, borderTopColor: theme.border }]}>
        {group.accounts.map((account) => {
          const current = account.id === activeAccountId;
          const icon = accountIcon(account);
          return <View key={account.id} testID={`account-card-${account.id}`}
            style={[styles.accountCard, { backgroundColor: theme.surface }, current && { borderColor: theme.accent }]}>
            <Pressable accessibilityRole="button" disabled={!onSelectAccount}
              accessibilityLabel={`${account.displayName}，${account.scoreLabel} ${account.scoreDisplay}，${account.providerTitle}`}
              onPress={() => onSelectAccount?.(account)} style={styles.accountRow}>
              {icon ? <Image source={icon} style={styles.providerIcon} /> : null}
              <View style={styles.copy}><View style={styles.titleRow}>
                <Text style={[styles.accountName, { color: theme.text }]}>{account.displayName}</Text>
                {current ? <Text style={[styles.currentBadge, { color: theme.accent, backgroundColor: theme.accentSoft }]}>当前</Text> : null}
              </View>
              {account.gameId === 'maimai' ? <DxRatingTag rating={ratingNumber(account.scoreDisplay)} display={account.scoreDisplay} /> : null}
              <Text style={[styles.providerLine, { color: theme.textMuted }]}>{account.providerTitle}</Text></View>
            </Pressable>
            {renderActions ? <View style={[styles.actions, { borderTopColor: theme.border }]}>{renderActions(account)}</View> : null}
          </View>;
        })}
      </View> : null}
    </View>;
  })}</View>;
}

const styles = StyleSheet.create({
  list: { gap: 12 }, empty: { fontSize: 14, lineHeight: 20, padding: 12 }, gameCard: { borderRadius: 16, overflow: 'hidden' },
  gameRow: { paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  gameIcon: { width: 52, height: 52, borderRadius: 14 }, copy: { flex: 1, gap: 2 }, gameName: { fontSize: 17, fontWeight: '700' },
  detail: { fontSize: 13, lineHeight: 18 }, accountNest: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, gap: 8 },
  accountCard: { borderRadius: 12, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden' },
  accountRow: { paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerIcon: { width: 40, height: 40, borderRadius: 10 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  accountName: { fontSize: 17, fontWeight: '700' }, providerLine: { fontSize: 12, marginTop: 2 }, currentBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, gap: 6 },
});
