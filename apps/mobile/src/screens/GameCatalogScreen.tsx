import { useCallback, useDeferredValue, useMemo } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View, type ListRenderItem } from 'react-native';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { GameFilterBar } from '@/components/game-model/GameFilterBar';
import { GameSongCard } from '@/components/game-model/GameSongCard';
import { filterGameItems } from '@/domain/game-model-filter';
import type { SongDocument } from '@/domain/game-model';
import { useGameModel } from '@/hooks/use-game-model';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import {
  selectGamePageFilters,
  useGameFilters,
} from '@/state/game-filters';
import { useAppTheme } from '@/theme/app-theme';

export function GameCatalogTabScreen() {
  return <CachedTabScreen><GameCatalogScreen /></CachedTabScreen>;
}

export function GameCatalogScreen() {
  const model = useGameModel();
  const theme = useAppTheme();
  const tabBottomInset = useNativeTabBottomInset();
  const pageDefinition = model.manifest.pages.catalog;
  const state = useGameFilters((store) => selectGamePageFilters(
    store.pages,
    model.manifest.gameId,
    'catalog',
  ));
  const setKeyword = useGameFilters((store) => store.setKeyword);
  const setCollapsed = useGameFilters((store) => store.setCollapsed);
  const setFilter = useGameFilters((store) => store.setFilter);
  const clear = useGameFilters((store) => store.clear);
  const deferredKeyword = useDeferredValue(state.keyword);
  const deferredFilters = useDeferredValue(state.filters);
  const filtered = useMemo(() => filterGameItems(
    model.document?.songs ?? [],
    deferredKeyword,
    pageDefinition.filters,
    deferredFilters,
  ), [deferredFilters, deferredKeyword, model.document?.songs, pageDefinition.filters]);
  const favoriteSongIds = useMemo(
    () => new Set((model.library.data ?? [])
      .filter((item) => item.kind === 'song' && item.favorite)
      .map((item) => item.songId)),
    [model.library.data],
  );
  const renderItem = useCallback<ListRenderItem<SongDocument>>(({ item }) => (
    <GameSongCard
      manifest={model.manifest}
      song={item}
      favorite={favoriteSongIds.has(item.id)}
      favoritePending={model.library.isLoading || model.library.isUpdating}
      onFavoriteChange={(songId, favorite) => {
        void model.library.setSongFavorite(songId, favorite);
      }}
    />
  ), [favoriteSongIds, model.library, model.manifest]);
  const catalogSource = model.document?.overview.sources.find((source) => source.id === 'catalog');
  const header = useMemo(() => (
    <View style={styles.header}>
      {catalogSource ? <SourceStatus items={[{
        key: 'catalog',
        label: catalogSource.label,
        updatedAt: catalogSource.updatedAt,
        state: catalogSource.state,
      }]} /> : null}
    </View>
  ), [catalogSource]);

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput
          accessibilityLabel="歌曲搜索"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={pageDefinition.searchPlaceholder ?? '搜索歌曲'}
          placeholderTextColor={theme.textMuted}
          value={state.keyword}
          onChangeText={(keyword) => setKeyword(model.manifest.gameId, 'catalog', keyword)}
          style={[
            styles.searchBox,
            { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
          ]}
        />
        <Text style={[styles.resultCount, { color: theme.textMuted }]}>
          {state.keyword !== deferredKeyword || state.filters !== deferredFilters
            ? '正在筛选…'
            : `共 ${filtered.length} 首`}
        </Text>
      </View>
      <GameFilterBar
        manifest={model.manifest}
        definitions={pageDefinition.filters}
        collapsed={state.collapsed}
        selections={state.filters}
        onCollapsedChange={(collapsed) => setCollapsed(model.manifest.gameId, 'catalog', collapsed)}
        onSelectionChange={(filterId, selection) => (
          setFilter(model.manifest.gameId, 'catalog', filterId, selection)
        )}
        onReset={() => clear(model.manifest.gameId, 'catalog')}
      />
      <QueryStateView<SongDocument[]>
        isLoading={model.isLoading}
        isError={model.isError}
        isEmpty={!!model.document && filtered.length === 0}
        error={model.error}
        onRetry={() => void model.refetch()}
        emptyText={state.keyword.trim() || Object.keys(state.filters).length
          ? '筛选结果为空'
          : '暂无曲库数据'}
        data={model.document && filtered.length > 0 ? filtered : undefined}
        renderData={(songs) => (
          <FlatList
            testID="game-catalog-results-list"
            contentInsetAdjustmentBehavior="automatic"
            data={songs}
            keyExtractor={(song) => song.id}
            {...TAB_LIST_CACHE_PROPS}
            contentContainerStyle={[styles.listContent, { paddingBottom: tabBottomInset + 20 }]}
            scrollIndicatorInsets={{ bottom: tabBottomInset }}
            ListHeaderComponent={header}
            renderItem={renderItem}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  searchArea: { padding: 12, paddingBottom: 8, gap: 6 },
  searchBox: { borderWidth: 1, borderRadius: 10, padding: 11 },
  resultCount: { fontSize: 11 },
  header: { gap: 8 },
  listContent: { paddingHorizontal: 12, paddingTop: 12, gap: 9 },
});
