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
import {
  GAME_OPTIONS,
  type GameId,
  type ProviderOption,
} from '@/domain/game-bind-options';
import { useAppTheme } from '@/theme/app-theme';

function Chevron({ expanded }: { expanded: boolean }) {
  const theme = useAppTheme();
  return (
    <SymbolView
      name={expanded ? 'chevron.down' : 'chevron.right'}
      size={14}
      tintColor={theme.textMuted}
      weight="semibold"
      fallback={<Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.textMuted} />}
    />
  );
}

export type GamePickerSheetMode = 'bind' | 'switch';

export function GamePickerSheet({
  visible,
  mode,
  title,
  expandedGameId,
  currentGameId,
  currentProviderId,
  onClose,
  onToggleGame,
  onSelectProvider,
  onSelectGame,
  onSelectUnavailableGame,
}: {
  visible: boolean;
  mode: GamePickerSheetMode;
  title?: string;
  expandedGameId: GameId | null;
  currentGameId?: GameId;
  currentProviderId?: string | null;
  onClose: () => void;
  onToggleGame: (id: GameId) => void;
  onSelectProvider: (gameId: GameId, provider: ProviderOption) => void;
  /** switch 模式下，无查分器的游戏（如测试游戏）点此项切换 */
  onSelectGame?: (gameId: GameId) => void;
  onSelectUnavailableGame: (title: string, detail: string) => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const sheetTitle = title ?? (mode === 'switch' ? '切换游戏' : '选择游戏');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.background }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{sheetTitle}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭"
            hitSlop={12}
            onPress={onClose}
            style={({ pressed }) => [styles.closeHit, pressed && styles.softPressed]}
          >
            <Text style={[styles.close, { color: theme.accent }]}>完成</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>游戏</Text>
          <View style={styles.list}>
            {GAME_OPTIONS.map((game) => {
              const expanded = expandedGameId === game.id;
              const gameIsCurrent = mode === 'switch' && currentGameId === game.id
                && (game.providers.length === 0 || currentProviderId != null);
              return (
                <View key={game.id} style={[styles.gameCard, { backgroundColor: theme.surface }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: game.available ? expanded : undefined }}
                    onPress={() => {
                      if (!game.available) {
                        onSelectUnavailableGame(game.title, game.pendingDetail);
                        return;
                      }
                      onToggleGame(game.id);
                    }}
                    style={({ pressed }) => [
                      styles.gameRow,
                      pressed && styles.softPressed,
                      !game.available && styles.disabled,
                    ]}
                  >
                    <Image source={game.icon} style={styles.gameIcon} />
                    <View style={styles.copy}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.gameName, { color: theme.text }, !game.available && { color: theme.textMuted }]}>
                          {game.title}
                        </Text>
                        {!game.available ? <Text style={styles.badge}>待实现</Text> : null}
                        {gameIsCurrent && game.providers.length === 0 ? (
                          <Text style={styles.currentBadge}>当前</Text>
                        ) : null}
                      </View>
                      <Text style={[styles.detail, { color: theme.textMuted }]}>
                        {!game.available
                          ? game.pendingDetail
                          : game.providers.length === 0
                            ? mode === 'switch'
                              ? '空数据预览 · 点下方切换'
                              : '空数据预览 · 在总览切换'
                            : expanded
                              ? mode === 'switch' ? '选择查分器切换' : '选择查分器继续绑定'
                              : `${game.providers.length} 个查分器 · 点按展开`}
                      </Text>
                    </View>
                    {game.available ? <Chevron expanded={expanded} /> : (
                      <SymbolView
                        name="lock.fill"
                        size={14}
                        tintColor="#D1D5DB"
                        fallback={<Ionicons name="lock-closed" size={14} color="#D1D5DB" />}
                      />
                    )}
                  </Pressable>

                  {game.available && expanded ? (
                    <View style={[styles.providerNest, { backgroundColor: theme.surfaceMuted, borderTopColor: theme.border }]}>
                      {game.providers.length === 0 ? (
                        mode === 'switch' && onSelectGame ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`切换到${game.title}`}
                            onPress={() => onSelectGame(game.id)}
                            style={({ pressed }) => [
                              styles.providerRow, { backgroundColor: theme.surface },
                              pressed && styles.providerPressed,
                              currentGameId === game.id && { borderColor: theme.accent, borderWidth: 1 },
                            ]}
                          >
                            <View style={styles.copy}>
                              <View style={styles.titleRow}>
                                <Text style={[styles.providerName, { color: theme.text }]}>使用空数据</Text>
                                {currentGameId === game.id ? <Text style={styles.currentBadge}>当前</Text> : null}
                              </View>
                              <Text style={[styles.detail, { color: theme.textMuted }]}>空数据</Text>
                            </View>
                            <SymbolView
                              name="chevron.right"
                              size={14}
                              tintColor="#C0C4CC"
                              weight="semibold"
                              fallback={<Ionicons name="chevron-forward" size={16} color="#C0C4CC" />}
                            />
                          </Pressable>
                        ) : (
                          <Text style={[styles.detail, { color: theme.textMuted }]}>
                            此游戏无需绑定账号。请在总览页点击玩家名，切换到「{game.title}」。
                          </Text>
                        )
                      ) : (
                        <>
                          <Text style={[styles.providerLabel, { color: theme.textMuted }]}>查分器</Text>
                          {game.providers.map((provider) => {
                            const isCurrent = mode === 'switch'
                              && currentGameId === game.id
                              && currentProviderId === provider.id;
                            return (
                              <Pressable
                                key={provider.id}
                                accessibilityRole="button"
                                accessibilityLabel={provider.title}
                                disabled={!provider.available && mode === 'bind'}
                                onPress={() => {
                                  if (!provider.available) {
                                    onSelectUnavailableGame(provider.title, provider.detail);
                                    return;
                                  }
                                  onSelectProvider(game.id, provider);
                                }}
                                style={({ pressed }) => [
                                  styles.providerRow, { backgroundColor: theme.surface },
                                  pressed && provider.available && styles.providerPressed,
                                  !provider.available && styles.disabled,
                                  isCurrent && { borderColor: theme.accent, borderWidth: 1 },
                                ]}
                              >
                                <Image source={provider.icon} style={styles.providerIcon} />
                                <View style={styles.copy}>
                                  <View style={styles.titleRow}>
                                    <Text style={[styles.providerName, { color: theme.text }, !provider.available && { color: theme.textMuted }]}>
                                      {provider.title}
                                    </Text>
                                    {!provider.available ? <Text style={styles.badge}>待实现</Text> : null}
                                    {isCurrent ? <Text style={styles.currentBadge}>当前</Text> : null}
                                  </View>
                                  <Text style={[styles.detail, { color: theme.textMuted }]}>{provider.detail}</Text>
                                </View>
                                {provider.available ? (
                                  <SymbolView
                                    name="chevron.right"
                                    size={14}
                                    tintColor="#C0C4CC"
                                    weight="semibold"
                                    fallback={<Ionicons name="chevron-forward" size={16} color="#C0C4CC" />}
                                  />
                                ) : (
                                  <SymbolView
                                    name="lock.fill"
                                    size={14}
                                    tintColor="#D1D5DB"
                                    fallback={<Ionicons name="lock-closed" size={14} color="#D1D5DB" />}
                                  />
                                )}
                              </Pressable>
                            );
                          })}
                        </>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
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
  disabled: { opacity: 0.72 },
  gameIcon: { width: 52, height: 52, borderRadius: 14 },
  copy: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  gameName: { color: '#111827', fontSize: 17, fontWeight: '700' },
  muted: { color: '#6B7280' },
  detail: { color: '#6B7280', fontSize: 13, lineHeight: 18 },
  providerNest: {
    backgroundColor: '#F7F8FA',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },
  providerLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
    letterSpacing: 0.4,
  },
  providerRow: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  providerPressed: { backgroundColor: '#EEF2F7' },
  providerCurrent: { borderWidth: 1, borderColor: '#246BFD' },
  providerIcon: { width: 36, height: 36, borderRadius: 9 },
  providerName: { color: '#111827', fontSize: 15, fontWeight: '700' },
  badge: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: '#EEF2F7',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
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
