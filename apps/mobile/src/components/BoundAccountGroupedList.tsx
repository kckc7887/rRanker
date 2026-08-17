import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { BoundAccountAvatar } from '@/components/BoundAccountAvatar';
import { ChunithmRatingTag } from '@/components/ChunithmRatingTag';
import { DxRatingTag } from '@/components/DxRatingTag';
import { PhigrosAccountTags } from '@/components/PhigrosAccountTags';
import { TintedRatingTag } from '@/components/TintedRatingTag';
import { TUF_RATING_THEME } from '@/components/adofai/TufOverviewDetails';
import { MUSE_DASH_RATING_THEME } from '@/components/musedash/MuseDashOverviewDetails';
import { groupBoundAccountGameIds, type BoundAccount } from '@/domain/bound-account';
import { findGame, type GameId } from '@/domain/game-bind-options';
import { familyForGameId } from '@/domain/game-mode-family';
import { useAppTheme } from '@/theme/app-theme';
import { hydrateBoundAccountAvatars } from '@/services/hydrate-bound-account-avatars';
import { hydrateBoundAccountThumbnails } from '@/services/account-thumbnail';
import { hydrateChunithmAccountSummaries } from '@/services/hydrate-chunithm-account-summaries';
import { hydratePhigrosAccountSummaries } from '@/services/hydrate-phigros-account-summaries';

function useHydrateAccountSummaries(accountIds: string): void {
  const ranFor = useRef<string | null>(null);
  useEffect(() => {
    if (!accountIds) return;
    if (ranFor.current === accountIds) return;
    ranFor.current = accountIds;
    void hydrateBoundAccountAvatars();
    void hydrateBoundAccountThumbnails();
    void hydrateChunithmAccountSummaries();
    void hydratePhigrosAccountSummaries();
  }, [accountIds]);
}

function ratingNumber(display: string): number | null {
  const value = Number.parseInt(display, 10);
  return Number.isFinite(value) ? value : null;
}

type ModeGroup = {
  gameId: GameId;
  title: string;
  icon: ImageSourcePropType;
  accounts: BoundAccount[];
};

type FamilyGroup = {
  familyId: string;
  title: string;
  icon: ImageSourcePropType;
  modes: ModeGroup[];
};

type GameGroup = {
  gameId: GameId;
  title: string;
  icon: ImageSourcePropType;
  accounts: BoundAccount[];
};

export function BoundAccountGroupedList({ accounts, expandedGameId, isGameExpanded, activeAccountId, onToggleGame, onSelectAccount, renderActions, renderRatingTag, emptyText }: {
  accounts: BoundAccount[];
  expandedGameId: GameId | null;
  isGameExpanded?: (gameId: GameId) => boolean;
  activeAccountId: string | null;
  onToggleGame: (gameId: GameId) => void;
  onSelectAccount?: (account: BoundAccount) => void;
  renderActions?: (account: BoundAccount) => ReactNode;
  /** 账号行 Rating 标签槽位：提供时替换内置各游戏标签（如 osu PP 标签）。 */
  renderRatingTag?: (account: BoundAccount) => ReactNode;
  emptyText?: string;
}) {
  const theme = useAppTheme();
  const avatarHydrateKey = accounts
    .filter((account) => account.providerId === 'lxns' || account.providerId === 'phi-taptap' || account.providerId === 'tuf' || account.providerId === 'osu')
    .map((account) => account.id)
    .join('|');
  useHydrateAccountSummaries(avatarHydrateKey);

  /** 家族分组：osu! 板块 → 模式子组（仅显示有绑定账号的模式）→ 账号；非家族游戏保持原样。 */
  const { gameGroups, familyGroups } = useMemo(() => {
    const gameGroups: GameGroup[] = [];
    const familyByMode = new Map<string, FamilyGroup>();
    for (const gameId of groupBoundAccountGameIds(accounts)) {
      const game = findGame(gameId);
      if (!game) continue;
      const family = familyForGameId(gameId);
      if (!family) {
        gameGroups.push({
          gameId,
          title: game.title,
          icon: game.icon,
          accounts: accounts.filter((account) => account.gameId === gameId),
        });
        continue;
      }
      let entry = familyByMode.get(family.id);
      if (!entry) {
        entry = { familyId: family.id, title: family.title, icon: game.icon, modes: [] };
        familyByMode.set(family.id, entry);
      }
      entry.modes.push({
        gameId,
        title: game.title,
        icon: game.icon,
        accounts: accounts.filter((account) => account.gameId === gameId),
      });
    }
    return { gameGroups, familyGroups: [...familyByMode.values()] };
  }, [accounts]);

  const [collapsedFamilies, setCollapsedFamilies] = useState<ReadonlySet<string>>(() => new Set());
  const toggleFamily = (familyId: string) => setCollapsedFamilies((current) => {
    const next = new Set(current);
    if (next.has(familyId)) next.delete(familyId);
    else next.add(familyId);
    return next;
  });

  const totalGroups = gameGroups.length + familyGroups.length;
  if (totalGroups === 0) return <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyText ?? '暂无已绑定账号'}</Text>;

  const renderAccount = (account: BoundAccount) => {
    const current = account.id === activeAccountId;
    const ratingTag = renderRatingTag?.(account)
      ?? (account.gameId === 'maimai' ? <DxRatingTag rating={ratingNumber(account.scoreDisplay)} display={account.scoreDisplay} /> : null)
      ?? (account.gameId === 'chunithm' ? (
        <ChunithmRatingTag
          display={account.scoreDisplay}
          ratingPossession={account.ratingPossession}
        />
      ) : null)
      ?? (account.gameId === 'phigros' ? <PhigrosAccountTags rks={account.scoreDisplay} challengeModeRank={account.challengeModeRank} /> : null)
      ?? (account.gameId === 'adofai' ? (
        <TintedRatingTag
          theme={TUF_RATING_THEME}
          display={account.scoreDisplay}
          accessibilityLabel={`RANKED SCORE ${account.scoreDisplay}`}
          testID="tuf-rating-tag"
        />
      ) : null)
      ?? (account.gameId === 'musedash' ? (
        <TintedRatingTag
          theme={MUSE_DASH_RATING_THEME}
          display={account.scoreDisplay}
          accessibilityLabel={`Rating ${account.scoreDisplay}`}
          testID="musedash-rating-tag"
        />
      ) : null);
    return <View key={account.id} testID={`account-card-${account.id}`}
      style={[styles.accountCard, { backgroundColor: theme.surface }, current && { borderColor: theme.accent }]}>
      <Pressable accessibilityRole="button" disabled={!onSelectAccount}
        accessibilityLabel={`${account.displayName}，${account.scoreLabel} ${account.scoreDisplay}，${account.providerTitle}`}
        onPress={() => onSelectAccount?.(account)} style={styles.accountRow}>
        <BoundAccountAvatar accountId={account.id} style={styles.providerIcon} />
        <View style={styles.copy}><View style={styles.titleRow}>
          <Text style={[styles.accountName, { color: theme.text }]}>{account.displayName}</Text>
          {current ? <Text style={[styles.currentBadge, { color: theme.accent, backgroundColor: theme.accentSoft }]}>当前</Text> : null}
        </View>
        {ratingTag}
        <Text style={[styles.providerLine, { color: theme.textMuted }]}>{account.providerTitle}</Text></View>
      </Pressable>
      {renderActions ? <View style={[styles.actions, { borderTopColor: theme.border }]}>{renderActions(account)}</View> : null}
    </View>;
  };

  const renderGameCard = (group: GameGroup) => {
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
        {group.accounts.map(renderAccount)}
      </View> : null}
    </View>;
  };

  const renderFamilyCard = (group: FamilyGroup) => {
    const expanded = !collapsedFamilies.has(group.familyId);
    return <View key={group.familyId} style={[styles.gameCard, { backgroundColor: theme.surface }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? '收起' : '展开'}游戏 ${group.title}`}
        accessibilityState={{ expanded }} onPress={() => toggleFamily(group.familyId)} style={styles.gameRow}>
        <Image source={group.icon} style={styles.gameIcon} />
        <View style={styles.copy}><Text style={[styles.gameName, { color: theme.text }]}>{group.title}</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>{expanded ? '选择模式' : `${group.modes.length} 个模式 · 点按展开`}</Text></View>
        <SymbolView name={expanded ? 'chevron.down' : 'chevron.right'} size={14} tintColor={theme.textMuted}
          fallback={<Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.textMuted} />} />
      </Pressable>
      {expanded ? <View style={[styles.familyNest, { backgroundColor: theme.surfaceMuted, borderTopColor: theme.border }]}>
        {group.modes.map((mode) => {
          const modeExpanded = isGameExpanded?.(mode.gameId) ?? expandedGameId === mode.gameId;
          return <View key={mode.gameId} style={[styles.modeCard, { backgroundColor: theme.surface }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${modeExpanded ? '收起' : '展开'}模式 ${mode.title}`}
              accessibilityState={{ expanded: modeExpanded }} onPress={() => onToggleGame(mode.gameId)} style={styles.modeRow}>
              <Image source={mode.icon} style={styles.modeIcon} />
              <View style={styles.copy}><Text style={[styles.modeName, { color: theme.text }]}>{mode.title}</Text>
                <Text style={[styles.detail, { color: theme.textMuted }]}>{modeExpanded ? '选择或管理账号' : `${mode.accounts.length} 个账号 · 点按展开`}</Text></View>
              <SymbolView name={modeExpanded ? 'chevron.down' : 'chevron.right'} size={13} tintColor={theme.textMuted}
                fallback={<Ionicons name={modeExpanded ? 'chevron-down' : 'chevron-forward'} size={15} color={theme.textMuted} />} />
            </Pressable>
            {modeExpanded ? <View style={[styles.accountNest, { backgroundColor: theme.surfaceMuted, borderTopColor: theme.border }]}>
              {mode.accounts.map(renderAccount)}
            </View> : null}
          </View>;
        })}
      </View> : null}
    </View>;
  };

  return <View style={styles.list}>
    {gameGroups.map(renderGameCard)}
    {familyGroups.map(renderFamilyCard)}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 12 }, empty: { fontSize: 14, lineHeight: 20, padding: 12 }, gameCard: { borderRadius: 16, overflow: 'hidden' },
  gameRow: { paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  gameIcon: { width: 52, height: 52, borderRadius: 14 }, copy: { flex: 1, gap: 2 }, gameName: { fontSize: 17, fontWeight: '700' },
  detail: { fontSize: 13, lineHeight: 18 }, accountNest: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, gap: 8 },
  familyNest: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, gap: 8 },
  modeCard: { borderRadius: 12, overflow: 'hidden' },
  modeRow: { paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  modeIcon: { width: 36, height: 36, borderRadius: 10 },
  modeName: { fontSize: 15, fontWeight: '700' },
  accountCard: { borderRadius: 12, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden' },
  accountRow: { paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerIcon: { width: 40, height: 40, borderRadius: 10 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  accountName: { fontSize: 17, fontWeight: '700' }, providerLine: { fontSize: 12, marginTop: 2 }, currentBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, gap: 6 },
});
