import { useEffect, useState } from 'react';
import { PublicPlayerPickerSheet } from './PublicPlayerPickerSheet';
import { resolveTufAvatarUrl, type TufPlayer } from '@/domain/tuf';
import { findGame, findProvider } from '@/domain/game-bind-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTufPlayerSearch } from '@/hooks/use-tuf';

export function TufPlayerPickerSheet({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (player: TufPlayer) => Promise<void> | void }) {
  const [query, setQuery] = useState(''); const debounced = useDebouncedValue(query, 350).trim();
  const search = useTufPlayerSearch(debounced);
  const players = search.data?.results ?? [];
  useEffect(() => { if (!visible) setQuery(''); }, [visible]);
  return <PublicPlayerPickerSheet visible={visible} onClose={onClose} onSelect={onSelect} title="绑定 TUF 玩家"
    providerTitle={findProvider('tuf')!.title} gameTitle={findGame('adofai')?.title ?? '冰与火之舞'} icon={findProvider('tuf')!.icon}
    query={query} onQueryChange={setQuery} placeholder="昵称、PID 数字、Discord ID 或用户名" accessibilityLabel="搜索 TUF 玩家"
    optionAccessibilityPrefix="绑定 TUF 玩家"
    options={players.map((item) => ({ key: String(item.id), name: item.name, meta: `PID ${item.id}${item.globalRank ? ` · 世界 #${item.globalRank}` : ''}`, avatarUrl: resolveTufAvatarUrl(item), value: item }))}
    loading={search.isFetching} error={search.error}
    emptyText="没有找到公开玩家" fallbackLetter="T" />;
}
