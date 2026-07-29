import { useCallback, useDeferredValue, useMemo } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View, type ListRenderItem } from 'react-native';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { GameFilterBar } from '@/components/game-model/GameFilterBar';
import { GameScoreCard } from '@/components/game-model/GameScoreCard';
import { filterGameItems } from '@/domain/game-model-filter';
import type { ScoreCardDocument } from '@/domain/game-model';
import { useGameModel } from '@/hooks/use-game-model';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import {
  selectGamePageFilters,
  useGameFilters,
} from '@/state/game-filters';
import { useAppTheme } from '@/theme/app-theme';

export function GameRecordsTabScreen() {
  return <CachedTabScreen><GameRecordsScreen /></CachedTabScreen>;
}

export function GameRecordsScreen() {
  const model = useGameModel();
  const theme = useAppTheme();
  const tabBottomInset = useNativeTabBottomInset();
  const pageDefinition = model.manifest.pages.records;
  const state = useGameFilters((store) => selectGamePageFilters(
    store.pages,
    model.manifest.gameId,
    'records',
  ));
  const setKeyword = useGameFilters((store) => store.setKeyword);
  const setCollapsed = useGameFilters((store) => store.setCollapsed);
  const setFilter = useGameFilters((store) => store.setFilter);
  const clear = useGameFilters((store) => store.clear);
  const deferredKeyword = useDeferredValue(state.keyword);
  const deferredFilters = useDeferredValue(state.filters);
  const filtered = useMemo(() => filterGameItems(
    model.document?.records ?? [],
    deferredKeyword,
    pageDefinition.filters,
    deferredFilters,
  ), [deferredFilters, deferredKeyword, model.document?.records, pageDefinition.filters]);
  const renderItem = useCallback<ListRenderItem<ScoreCardDocument>>(({ item }) => (
    <GameScoreCard manifest={model.manifest} record={item} />
  ), [model.manifest]);
  const header = useMemo(() => (
    <View style={styles.listHeader}>
      {model.document ? <SourceStatus items={model.document.overview.sources.map((source) => ({
        key: source.id,
        label: source.label,
        updatedAt: source.updatedAt,
        state: source.state,
      }))} /> : null}
      <Text style={[styles.count, { color: theme.textMuted }]}>共 {filtered.length} 条成绩</Text>
    </View>
  ), [filtered.length, model.document, theme.textMuted]);

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput
          accessibilityLabel="成绩搜索"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={pageDefinition.searchPlaceholder ?? '搜索成绩'}
          placeholderTextColor={theme.textMuted}
          value={state.keyword}
          onChangeText={(keyword) => setKeyword(model.manifest.gameId, 'records', keyword)}
          style={[
            styles.searchBox,
            { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
          ]}
        />
      </View>
      <GameFilterBar
        manifest={model.manifest}
        definitions={pageDefinition.filters}
        collapsed={state.collapsed}
        selections={state.filters}
        onCollapsedChange={(collapsed) => setCollapsed(model.manifest.gameId, 'records', collapsed)}
        onSelectionChange={(filterId, selection) => (
          setFilter(model.manifest.gameId, 'records', filterId, selection)
        )}
        onReset={() => clear(model.manifest.gameId, 'records')}
      />
      <QueryStateView<ScoreCardDocument[]>
        isLoading={model.isLoading}
        isError={model.isError}
        isEmpty={!!model.document && filtered.length === 0}
        error={model.error}
        onRetry={() => void model.refetch()}
        emptyText="当前筛选条件下没有成绩"
        data={model.document && filtered.length > 0 ? filtered : undefined}
        renderData={(records) => (
          <FlatList
            testID="game-records-results-list"
            contentInsetAdjustmentBehavior="automatic"
            data={records}
            keyExtractor={(record) => record.id}
            {...TAB_LIST_CACHE_PROPS}
            contentContainerStyle={[styles.listContent, { paddingBottom: tabBottomInset + 16 }]}
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
  searchArea: { padding: 12, paddingBottom: 8 },
  searchBox: { borderWidth: 1, borderRadius: 10, padding: 11 },
  listContent: { padding: 12, gap: 9 },
  listHeader: { gap: 8 },
  count: { fontSize: 11 },
});
