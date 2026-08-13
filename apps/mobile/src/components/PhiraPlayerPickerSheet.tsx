import { useEffect, useState } from 'react';
import { PublicPlayerPickerSheet } from './PublicPlayerPickerSheet';
import { findGame, findProvider } from '@/domain/game-bind-options';
import type { PhiraUser } from '@/domain/phira';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePhiraPlayerSearch } from '@/hooks/use-phira';

export function PhiraPlayerPickerSheet({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (player: PhiraUser) => Promise<void> | void }) {
  const [query, setQuery] = useState(''); const debounced = useDebouncedValue(query, 350).trim();
  const result = usePhiraPlayerSearch(debounced);
  useEffect(() => { if (!visible) setQuery(''); }, [visible]);
  return <PublicPlayerPickerSheet visible={visible} onClose={onClose} onSelect={onSelect} title="绑定 Phira 玩家"
    providerTitle={findProvider('phira-community')!.title} gameTitle={findGame('phira')?.title ?? 'Phira'} icon={findProvider('phira-community')!.icon}
    query={query} onQueryChange={setQuery} placeholder="玩家 ID 或用户名" accessibilityLabel="搜索 Phira 玩家"
    optionAccessibilityPrefix="绑定 Phira 玩家"
    options={(result.data ?? []).map((item) => ({ key: String(item.id), name: item.name, meta: `ID ${item.id} · RKS ${item.rks.toFixed(4)}`, avatarUrl: item.avatar, value: item }))}
    loading={result.isFetching} error={result.error} emptyText="没有找到公开玩家" fallbackLetter="P" />;
}
