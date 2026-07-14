import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DxRatingTag } from '@/components/DxRatingTag';
import {
  findGame,
  findProvider,
  type GameId,
} from '@/domain/game-bind-options';
import {
  groupBoundAccountGameIds,
  type BoundAccount,
} from '@/domain/bound-account';

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <SymbolView
      name={expanded ? 'chevron.down' : 'chevron.right'}
      size={14}
      tintColor="#9CA3AF"
      weight="semibold"
      fallback={<Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color="#9CA3AF" />}
    />
  );
}

function accountIcon(account: BoundAccount) {
  if (account.providerId) {
    return findProvider(account.providerId)?.icon ?? findGame(account.gameId)?.icon;
  }
  return findGame(account.gameId)?.icon;
}

function ratingNumber(display: string): number | null {
  const value = Number.parseInt(display, 10);
  return Number.isFinite(value) ? value : null;
}

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
  const groups = groupBoundAccountGameIds(accounts).flatMap((gameId) => {
    const game = findGame(gameId);
    if (!game) return [];
    return [{
      gameId,
      title: game.title,
      icon: game.icon,
      accounts: accounts.filter((account) => account.gameId === gameId),
    }];
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
          {groups.length === 0 ? (
            <Text style={styles.empty}>暂无已绑定账号，请先在设置 → 游戏管理中绑定。</Text>
          ) : (
            <>
              <Text style={styles.sectionLabel}>已绑定</Text>
              <View style={styles.list}>
                {groups.map((group) => {
                  const expanded = expandedGameId === group.gameId;
                  return (
                    <View key={group.gameId} style={styles.gameCard}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        onPress={() => onToggleGame(group.gameId)}
                        style={({ pressed }) => [styles.gameRow, pressed && styles.softPressed]}
                      >
                        <Image source={group.icon} style={styles.gameIcon} />
                        <View style={styles.copy}>
                          <Text style={styles.gameName}>{group.title}</Text>
                          <Text style={styles.detail}>
                            {expanded ? '选择账号' : `${group.accounts.length} 个账号 · 点按展开`}
                          </Text>
                        </View>
                        <Chevron expanded={expanded} />
                      </Pressable>

                      {expanded ? (
                        <View style={styles.accountNest}>
                          {group.accounts.map((account) => {
                            const current = account.id === activeAccountId;
                            const icon = accountIcon(account);
                            return (
                              <Pressable
                                key={account.id}
                                accessibilityRole="button"
                                accessibilityLabel={`${account.displayName}，${account.scoreLabel} ${account.scoreDisplay}，${account.providerTitle}`}
                                onPress={() => onSelectAccount(account)}
                                style={({ pressed }) => [
                                  styles.accountRow,
                                  pressed && styles.accountPressed,
                                  current && styles.accountCurrent,
                                ]}
                              >
                                {icon ? <Image source={icon} style={styles.providerIcon} /> : null}
                                <View style={styles.copy}>
                                  <View style={styles.titleRow}>
                                    <Text style={styles.accountName}>{account.displayName}</Text>
                                    {current ? <Text style={styles.currentBadge}>当前</Text> : null}
                                  </View>
                                  {account.gameId === 'maimai' ? (
                                    <DxRatingTag
                                      rating={ratingNumber(account.scoreDisplay)}
                                      display={account.scoreDisplay}
                                    />
                                  ) : null}
                                  <Text style={styles.providerLine}>{account.providerTitle}</Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </>
          )}
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
