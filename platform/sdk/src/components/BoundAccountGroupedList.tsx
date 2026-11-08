import { GameGroupRow } from '@rranker/sdk/components/GameGroupRow';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { BoundAccountAvatar } from '@rranker/sdk/components/BoundAccountAvatar';
import { boundAccountRatingTag } from './account-rating-tags';
import { groupBoundAccountGameIds } from '@rranker/sdk/domain/bound-account';
import type { BoundAccount } from '@rranker/sdk/account';
import { findGame, type GameId } from '@rranker/sdk/domain/game-bind-options';
import { familyForGameId } from '@rranker/sdk/domain/game-mode-family';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { hydrateAccountDisplayData } from '@rranker/sdk/services/account-hydration';
import { getForegroundAbortSignal, useAppLifecycle } from '@rranker/sdk/state/app-lifecycle';
import { accountIsAvailable } from '@rranker/sdk/state/account-store';
import appIcon from '../../assets/icon.png';

function useHydrateAccountSummaries(accountIds: string, enabled: boolean): void {
  const lifecycle = useAppLifecycle();
  const ranFor = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !lifecycle.foregroundReady || !accountIds) return;
    const hydrationKey = `${lifecycle.foregroundGeneration}:${accountIds}`;
    if (ranFor.current === hydrationKey) return;
    ranFor.current = hydrationKey;
    const signal = getForegroundAbortSignal();
    void hydrateAccountDisplayData(signal).catch(() => undefined);
  }, [accountIds, enabled, lifecycle.foregroundGeneration, lifecycle.foregroundReady]);
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

export function BoundAccountGroupedList({ accounts, expandedGameId, isGameExpanded, activeAccountId, onToggleGame, onSelectAccount, renderActions, emptyText, hydrationEnabled = true }: {
  accounts: BoundAccount[];
  expandedGameId: GameId | null;
  isGameExpanded?: (gameId: GameId) => boolean;
  activeAccountId: string | null;
  onToggleGame: (gameId: GameId) => void;
  onSelectAccount?: (account: BoundAccount) => void;
  renderActions?: (account: BoundAccount) => ReactNode;
  emptyText?: string;
  hydrationEnabled?: boolean;
}) {
  const theme = useAppTheme();
  const avatarHydrateKey = accounts
    .map((account) => account.id)
    .join('|');
  useHydrateAccountSummaries(avatarHydrateKey, hydrationEnabled);

  const { gameGroups, familyGroups } = useMemo(() => {
    const gameGroups: GameGroup[] = [];
    const familyByMode = new Map<string, FamilyGroup>();
    for (const gameId of groupBoundAccountGameIds(accounts)) {
      const game = findGame(gameId) ?? { title: `${gameId} · 适配器未安装`, icon: appIcon, familyIcon: undefined };
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
        entry = { familyId: family.id, title: family.title, icon: game.familyIcon ?? game.icon, modes: [] };
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
    const available = accountIsAvailable(account);
    return <View key={account.id} testID={`account-card-${account.id}`}
      style={[styles.accountCard, { backgroundColor: theme.surface }, current && { borderColor: theme.accent }]}>
      <Pressable accessibilityRole="button" disabled={!onSelectAccount || !available}
        accessibilityLabel={`${account.displayName}，${account.scoreLabel} ${account.scoreDisplay}，${account.providerTitle}`}
        onPress={() => onSelectAccount?.(account)} style={styles.accountRow}>
        <BoundAccountAvatar accountId={account.id} style={styles.providerIcon} />
        <View style={styles.copy}><View style={styles.titleRow}>
          <Text style={[styles.accountName, { color: theme.text }]}>{account.displayName}</Text>
          {current ? <Text style={[styles.currentBadge, { color: theme.accent, backgroundColor: theme.accentSoft }]}>当前</Text> : null}
        </View>
        {boundAccountRatingTag(account)}
        <Text style={[styles.providerLine, { color: theme.textMuted }]}>{account.providerTitle}{available ? '' : ' · 插件不可用'}</Text></View>
      </Pressable>
      {renderActions ? <View style={[styles.actions, { borderTopColor: theme.border }]}>{renderActions(account)}</View> : null}
    </View>;
  };

  const renderGameCard = (group: GameGroup) => {
    const expanded = isGameExpanded?.(group.gameId) ?? expandedGameId === group.gameId;
    return <View key={group.gameId} style={[styles.gameCard, { backgroundColor: theme.surface }]}>
      <GameGroupRow icon={group.icon} title={group.title} detail={expanded ? '选择或管理账号' : `${group.accounts.length} 个账号 · 点按展开`}
          expanded={expanded} label={`${expanded ? '收起' : '展开'}游戏 ${group.title}`} onPress={() => onToggleGame(group.gameId)} />
      {expanded ? <View style={[styles.accountNest, { backgroundColor: theme.surfaceMuted, borderTopColor: theme.border }]}>
        {group.accounts.map(renderAccount)}
      </View> : null}
    </View>;
  };

  const renderFamilyCard = (group: FamilyGroup) => {
    const expanded = !collapsedFamilies.has(group.familyId);
    return <View key={group.familyId} style={[styles.gameCard, { backgroundColor: theme.surface }]}>
      <GameGroupRow icon={group.icon} title={group.title} detail={expanded ? '选择模式' : `${group.modes.length} 个模式 · 点按展开`}
          expanded={expanded} label={`${expanded ? '收起' : '展开'}游戏 ${group.title}`} onPress={() => toggleFamily(group.familyId)} />
      {expanded ? <View style={[styles.familyNest, { backgroundColor: theme.surfaceMuted, borderTopColor: theme.border }]}>
        {group.modes.map((mode) => {
          const modeExpanded = isGameExpanded?.(mode.gameId) ?? expandedGameId === mode.gameId;
          return <View key={mode.gameId} style={[styles.modeCard, { backgroundColor: theme.surface }]}>
            <GameGroupRow compact icon={mode.icon} title={mode.title} detail={modeExpanded ? '选择或管理账号' : `${mode.accounts.length} 个账号 · 点按展开`}
          expanded={modeExpanded} label={`${modeExpanded ? '收起' : '展开'}模式 ${mode.title}`} onPress={() => onToggleGame(mode.gameId)} />
            {modeExpanded ? <View style={[styles.accountNest, { backgroundColor: theme.surfaceMuted, borderTopColor: theme.border }]}>
              {mode.accounts.map(renderAccount)}
            </View> : null}
          </View>;
        })}
      </View> : null}
    </View>;
  };

  return <View style={styles.list}>
    {groupBoundAccountGameIds(accounts).map(gameId => {
      const game = gameGroups.find(group => group.gameId === gameId);
      if (game) return renderGameCard(game);
      const family = familyGroups.find(group => group.modes[0]?.gameId === gameId);
      return family ? renderFamilyCard(family) : null;
    })}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 12 }, empty: { fontSize: 14, lineHeight: 20, padding: 12 }, gameCard: { borderRadius: 16, overflow: 'hidden' },
  copy: { flex: 1, gap: 2 },
  accountNest: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, gap: 8 },
  familyNest: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, gap: 8 },
  modeCard: { borderRadius: 12, overflow: 'hidden' },
  accountCard: { borderRadius: 12, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden' },
  accountRow: { paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerIcon: { width: 40, height: 40, borderRadius: 10 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  accountName: { fontSize: 17, fontWeight: '700' }, providerLine: { fontSize: 12, marginTop: 2 }, currentBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, gap: 6 },
});
