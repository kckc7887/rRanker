import { CollectionProgressBar } from '@/components/CollectionProgress';
import { overviewStyles as styles } from '@/features/overview/overview-styles';

import { ChunithmCollectionPreview } from '@/components/chunithm/ChunithmCollectionImage';
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { calculateChunithmCollectionProgress, isChunithmCollectionComputable, type ChunithmCollectionKind } from '@/domain/chunithm-collections';
import type { ChunithmScore } from '@/domain/chunithm-personal';
import type { PinnedChunithmCollection } from '@/features/toolbox/pinned-tool-preferences';
import { useChunithmCollections } from '@/hooks/use-chunithm-collections';

import { useAppTheme } from '@/theme/app-theme';

export function PinnedChunithmCollectionCards({
  pinned,
  scores,
}: {
  pinned: readonly PinnedChunithmCollection[];
  scores: readonly ChunithmScore[];
}) {
  const theme = useAppTheme();
  const byKind = useMemo(() => {
    const map = new Map<ChunithmCollectionKind, PinnedChunithmCollection[]>();
    for (const entry of pinned) {
      const list = map.get(entry.kind) ?? [];
      list.push(entry);
      map.set(entry.kind, list);
    }
    return map;
  }, [pinned]);
  const kindList = [...byKind.keys()];

  return kindList.map((kind) => (
    <PinnedChunithmCollectionKindGroup
      key={kind}
      kind={kind}
      entries={byKind.get(kind) ?? []}
      scores={scores}
      theme={theme}
    />
  ));
}

function PinnedChunithmCollectionKindGroup({
  kind,
  entries,
  scores,
  theme,
}: {
  kind: ChunithmCollectionKind;
  entries: readonly PinnedChunithmCollection[];
  scores: readonly ChunithmScore[];
  theme: ReturnType<typeof useAppTheme>;
}) {
  const collections = useChunithmCollections(kind);
  const items = useMemo(() => {
    const wanted = new Set(entries.map((entry) => entry.id));
    return (collections.data?.items ?? []).filter((item) => wanted.has(item.id));
  }, [collections.data?.items, entries]);

  return items.map((collection) => {
    const progress = isChunithmCollectionComputable(collection)
      ? calculateChunithmCollectionProgress(collection, scores)
      : null;
    return (
      <Pressable
        key={`${kind}:${collection.id}`}
        accessibilityRole="button"
        accessibilityLabel={`打开主页收藏品 ${collection.name || `#${collection.id}`}`}
        onPress={() => router.push({
          pathname: '/tools/chunithm-collections',
          params: { kind, id: String(collection.id) },
        } as Href)}
      >
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={styles.pinnedToolEyebrow}>收藏品进度</Text>
          <View style={styles.collectionHomeTitleRow}>
            <ChunithmCollectionPreview height={34} borderRadius={6} kind={kind} collection={collection} />
            <Text numberOfLines={1} style={[styles.cardTitle, styles.collectionHomeTitle, { color: theme.text }]}>
              {collection.name || `#${collection.id}`}
            </Text>
          </View>
          {progress ? (
            <>
              <CollectionProgressBar progress={progress} />
              <Text style={[styles.body, { color: theme.textSecondary }]}>
                {progress.completed} / {progress.total} 完成
              </Text>
            </>
          ) : (
            <Text style={[styles.body, { color: theme.textSecondary }]}>该收藏品没有可计算的达成条件</Text>
          )}
        </View>
      </Pressable>
    );
  });
}
