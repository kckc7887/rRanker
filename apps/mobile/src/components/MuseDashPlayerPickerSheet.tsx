import { useEffect, useMemo, useState } from 'react';
import { PublicPlayerPickerSheet } from './PublicPlayerPickerSheet';
import { findGame, findProvider } from '@/domain/game-bind-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMuseDashPlayer, useMuseDashSearch } from '@/hooks/use-muse-dash';

export type MuseDashSearchResult = { nickname: string; userId: string };

/** user_id 是 32 位十六进制串，也可能带连字符。 */
function normalizeUserId(value: string): string | null {
  const normalized = value.replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(normalized) ? normalized : null;
}

export function MuseDashPlayerPickerSheet({
  visible, onClose, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (player: MuseDashSearchResult) => Promise<void> | void;
}) {
  const museDashProvider = findProvider('musedash-moe')!;
  const museDashGame = findGame('musedash');
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 350).trim();
  const userId = useMemo(() => normalizeUserId(debounced), [debounced]);
  const search = useMuseDashSearch(userId === null ? debounced : '');
  const direct = useMuseDashPlayer(userId);
  const players: MuseDashSearchResult[] = userId === null
    ? (search.data ?? []).map(([nickname, uid]) => ({ nickname, userId: uid }))
    : direct.data
      ? [{ nickname: direct.data.user.nickname, userId: direct.data.user.user_id }]
      : [];
  const loading = userId === null ? search.isFetching : direct.isFetching;
  const error = userId === null ? search.error : direct.error;

  useEffect(() => { if (!visible) setQuery(''); }, [visible]);

  return <PublicPlayerPickerSheet visible={visible} onClose={onClose} onSelect={onSelect}
    title="绑定喵斯快跑玩家" providerTitle={museDashProvider.title} gameTitle={museDashGame?.title ?? '喵斯快跑'} icon={museDashProvider.icon}
    query={query} onQueryChange={setQuery} hasQuery={!!debounced} prompt="可输入昵称或玩家 ID"
    placeholder="昵称或玩家 ID" accessibilityLabel="搜索喵斯快跑玩家" optionAccessibilityPrefix="绑定喵斯快跑玩家"
    options={players.map(player => ({ key: player.userId, name: player.nickname, meta: player.userId, value: player }))}
    loading={loading} error={error} emptyText="没有找到公开玩家" fallbackLetter="M" fallbackColor="#B8194D" />;
}
