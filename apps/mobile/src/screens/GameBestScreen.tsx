import { useMemo } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { GameScoreCard } from '@/components/game-model/GameScoreCard';
import type { BestSectionDocument } from '@/domain/game-model';
import { useGameModel } from '@/hooks/use-game-model';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useAppTheme } from '@/theme/app-theme';

type Section = BestSectionDocument & { data: BestSectionDocument['records'] };

export function GameBestTabScreen() {
  return <CachedTabScreen><GameBestScreen /></CachedTabScreen>;
}

export function GameBestScreen() {
  const model = useGameModel();
  const theme = useAppTheme();
  const tabBottomInset = useNativeTabBottomInset();
  const sections = useMemo<Section[]>(() => (model.document?.bestSections ?? []).map((section) => ({
    ...section,
    data: section.records,
  })), [model.document?.bestSections]);
  const sourceHeader = useMemo(() => model.document ? (
    <View style={styles.header}>
      {model.manifest.pages.best.actions.length ? (
        <View style={styles.actions}>
          {model.manifest.pages.best.actions.map((item) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.label}
              key={item.id}
              onPress={() => {
                const pathname = item.action.params.pathname;
                if (item.action.id === 'route' && typeof pathname === 'string') {
                  router.push(pathname as Href);
                }
              }}
              style={[styles.action, { backgroundColor: theme.accent }]}
            >
              <Text style={styles.actionText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <SourceStatus items={model.document.overview.sources.map((source) => ({
        key: source.id,
        label: source.label,
        updatedAt: source.updatedAt,
        state: source.state,
      }))} />
    </View>
  ) : null, [model.document, model.manifest.pages.best.actions, theme.accent]);

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <QueryStateView<Section[]>
        isLoading={model.isLoading}
        isError={model.isError}
        isEmpty={!!model.document && sections.every((section) => section.records.length === 0)}
        error={model.error}
        onRetry={() => void model.refetch()}
        emptyText="当前账号暂无最佳成绩"
        data={model.document && sections.length ? sections : undefined}
        renderData={(result) => (
          <SectionList
            testID="game-best-results-list"
            contentInsetAdjustmentBehavior="automatic"
            sections={result}
            keyExtractor={(record) => record.id}
            {...TAB_LIST_CACHE_PROPS}
            contentContainerStyle={[styles.content, { paddingBottom: tabBottomInset + 20 }]}
            scrollIndicatorInsets={{ bottom: tabBottomInset }}
            ListHeaderComponent={sourceHeader}
            renderSectionHeader={({ section }) => (
              <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
                <Text style={[styles.sectionCount, { color: theme.textMuted }]}>
                  {section.chartCountLabel}
                </Text>
              </View>
            )}
            renderItem={({ item, index }) => (
              <GameScoreCard manifest={model.manifest} record={item} position={index + 1} />
            )}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 12, gap: 9 },
  header: { gap: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  action: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  sectionHeader: {
    paddingTop: 12,
    paddingBottom: 7,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 17, fontWeight: '900' },
  sectionCount: { fontSize: 11, fontWeight: '600' },
});
