import { GameGroupRow } from '@rranker/sdk/components/GameGroupRow';
import { usePluginRevision } from '@rranker/sdk';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import {
  getGameOptions,
  canBindProvider,
  type GameId,
  type GameOption,
  type ProviderOption,
} from '@rranker/sdk/domain/game-bind-options';
import { familyForId } from '@rranker/sdk/domain/game-mode-family';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { AppSheet } from '@rranker/sdk/components/AppSheet';

export type GamePickerSheetMode = 'bind' | 'switch';

export function GamePickerSheet({
  visible,
  mode,
  title,
  expandedGameId,
  currentGameId,
  currentProviderId,
  testAccountsEnabled = false,
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
  testAccountsEnabled?: boolean;
  onClose: () => void;
  onToggleGame: (id: GameId) => void;
  onSelectProvider: (gameId: GameId, provider: ProviderOption) => void;
  onSelectGame?: (gameId: GameId) => void;
  onSelectUnavailableGame: (title: string, detail: string) => void;
}) {
  const theme = useAppTheme();
  usePluginRevision();
  const sheetTitle = title ?? (mode === 'switch' ? '切换游戏' : '选择游戏');

  const entries: { key: string; game: GameOption; familyTitle?: string; modeGames: GameOption[] }[] = [];
  const seenFamilies = new Set<string>();
  const games = getGameOptions();
  for (const registeredGame of games) {
    if (registeredGame.fixture && !testAccountsEnabled) continue;
    const game = mode === 'bind' ? {
      ...registeredGame,
      providers: registeredGame.providers.filter((provider) => canBindProvider(provider, testAccountsEnabled)),
    } : registeredGame;
    if (game.hiddenInPicker) continue;
    if (!game.familyId) {
      entries.push({ key: game.id, game, modeGames: [] });
      continue;
    }
    if (seenFamilies.has(game.familyId)) continue;
    seenFamilies.add(game.familyId);
    entries.push({
      key: `family:${game.familyId}`,
      game,
      familyTitle: familyForId(game.familyId)?.title,
      modeGames: games.filter((item) => item.familyId === game.familyId),
    });
  }


  return (
    <AppSheet visible={visible} presentationStyle="formSheet" onRequestClose={onClose}
      title={sheetTitle} rightAction={{ label: '完成', accessibilityLabel: '关闭', onPress: onClose }}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>游戏</Text>
        <View style={styles.list}>
          {entries.map(({ key, game, familyTitle, modeGames }) => {
            const isFamily = familyTitle !== undefined;
            const expanded = expandedGameId === game.id;
            const gameIsCurrent = mode === 'switch' && currentGameId === game.id
              && (game.providers.length === 0 || currentProviderId != null);
            return (
              <View key={key} style={[styles.gameCard, { backgroundColor: theme.surface }]}>
                <GameGroupRow icon={isFamily ? (game.familyIcon ?? game.icon) : game.icon}
                  title={familyTitle ?? game.title} expanded={expanded} locked={!game.available}
                  detail={!game.available
                        ? game.pendingDetail
                        : isFamily && mode === 'switch'
                          ? `${modeGames.length} 个模式 · 点按展开`
                          : game.providers.length === 0
                            ? mode === 'switch'
                              ? '空数据预览 · 点下方切换'
                              : '空数据预览 · 在总览切换'
                            : expanded
                              ? mode === 'switch' ? '选择查分器切换' : '选择查分器继续绑定'
                              : `${game.providers.length} 个查分器 · 点按展开`}
                  onPress={() => game.available ? onToggleGame(game.id) : onSelectUnavailableGame(familyTitle ?? game.title, game.pendingDetail)}
                  badges={<>
                    {!game.available && <Text style={styles.badge}>已停用</Text>}
                    {gameIsCurrent && game.providers.length === 0 && <Text style={styles.currentBadge}>当前</Text>}
                  </>} />

                {game.available && expanded ? (
                  <View style={[styles.providerNest, { backgroundColor: theme.surfaceMuted, borderTopColor: theme.border }]}>
                    {isFamily && mode === 'switch' ? (
                      modeGames.map((modeGame) => (
                        <Pressable
                          key={modeGame.id}
                          accessibilityRole="button"
                          accessibilityLabel={`切换到${modeGame.title}`}
                          disabled={!onSelectGame}
                          onPress={() => onSelectGame?.(modeGame.id)}
                          style={({ pressed }) => [
                            styles.providerRow, { backgroundColor: theme.surface },
                            pressed && styles.providerPressed,
                            currentGameId === modeGame.id && { borderColor: theme.accent, borderWidth: 1 },
                          ]}
                        >
                          <Image source={modeGame.icon} style={styles.providerIcon} />
                          <View style={styles.copy}>
                            <View style={styles.titleRow}>
                              <Text style={[styles.providerName, { color: theme.text }]}>{modeGame.title}</Text>
                              {currentGameId === modeGame.id ? <Text style={styles.currentBadge}>当前</Text> : null}
                            </View>
                            <Text style={[styles.detail, { color: theme.textMuted }]}>模式</Text>
                          </View>
                          <SymbolView
                            name="chevron.right"
                            size={14}
                            tintColor="#C0C4CC"
                            weight="semibold"
                            fallback={<Ionicons name="chevron-forward" size={16} color="#C0C4CC" />}
                          />
                        </Pressable>
                      ))
                    ) : game.providers.length === 0 ? (
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
                                  {!provider.available ? <Text style={styles.badge}>已停用</Text> : null}
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
  list: { gap: 12 },
  gameCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  disabled: { opacity: 0.72 },
  copy: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
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
