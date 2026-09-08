import { type ReactNode, useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  FlatList,
  SectionList,
  type FlatListProps,
  type SectionListData,
  type SectionListProps,
} from 'react-native';
import { QueryStateView } from '@/components/QueryStateView';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { ScoreCardArtworkScope } from '@/components/game-content/GameScoreCard';
import { RemoteImagePersistenceScope } from '@/components/RemoteImage';

const REMOTE_IMAGE_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 250,
  waitForInteraction: false,
} as const;

type ViewabilityChange<TItem> = Parameters<
  NonNullable<FlatListProps<TItem>['onViewableItemsChanged']>
>[0];

function createViewabilityStore<TItem>() {
  let visible = new Set<TItem>();
  const listeners = new Map<TItem, Set<() => void>>();
  return {
    has: (item: TItem) => visible.has(item),
    subscribe(item: TItem, listener: () => void) {
      let group = listeners.get(item);
      if (!group) listeners.set(item, group = new Set());
      group.add(listener);
      return () => { group.delete(listener); if (!group.size) listeners.delete(item); };
    },
    update(next: Set<TItem>) {
      const previous = visible;
      visible = next;
      for (const item of previous) if (!next.has(item)) listeners.get(item)?.forEach((notify) => notify());
      for (const item of next) if (!previous.has(item)) listeners.get(item)?.forEach((notify) => notify());
    },
  };
}

function VisibleItemScope<TItem>({ store, item, children }: {
  store: ReturnType<typeof createViewabilityStore<TItem>>; item: TItem; children: ReactNode;
}) {
  const subscribe = useCallback((notify: () => void) => store.subscribe(item, notify), [store, item]);
  const snapshot = useCallback(() => store.has(item), [store, item]);
  const visible = useSyncExternalStore(subscribe, snapshot, snapshot);
  return <RemoteImagePersistenceScope enabled={visible}>{children}</RemoteImagePersistenceScope>;
}

function useRemoteImageViewability<TItem>(onViewableItemsChanged: FlatListProps<TItem>['onViewableItemsChanged']) {
  const [store] = useState(() => createViewabilityStore<TItem>());
  const handleViewableItemsChanged = useCallback((info: ViewabilityChange<TItem>) => {
    store.update(new Set(info.viewableItems.map((token) => token.item)));
    onViewableItemsChanged?.(info);
  }, [onViewableItemsChanged, store]);
  return { store, handleViewableItemsChanged };
}

export function RemoteImageFlatList<TItem>({
  extraData,
  onViewableItemsChanged,
  renderItem,
  viewabilityConfig,
  ...props
}: FlatListProps<TItem>) {
  const { store, handleViewableItemsChanged } = useRemoteImageViewability(onViewableItemsChanged);
  const scopedRenderItem = useCallback<NonNullable<FlatListProps<TItem>['renderItem']>>((info) => {
    const content = renderItem?.(info) ?? null;
    return (
      <VisibleItemScope store={store} item={info.item}>
        {content}
      </VisibleItemScope>
    );
  }, [renderItem, store]);
  const mergedViewabilityConfig = useMemo(() => ({
    ...viewabilityConfig,
    ...REMOTE_IMAGE_VIEWABILITY_CONFIG,
  }), [viewabilityConfig]);

  return (
    <FlatList<TItem>
      {...props}
      {...TAB_LIST_CACHE_PROPS}
      extraData={extraData}
      onViewableItemsChanged={handleViewableItemsChanged}
      renderItem={scopedRenderItem}
      viewabilityConfig={mergedViewabilityConfig}
    />
  );
}

function RemoteImageSectionList<
  TItem,
  TSection extends SectionListData<TItem>,
>({
  extraData,
  keyExtractor,
  onViewableItemsChanged,
  renderItem,
  sections,
  viewabilityConfig,
  ...props
}: SectionListProps<TItem, TSection>) {
  const [sectionKeys] = useState(() => new WeakMap<object, string>());
  const sectionKey = useCallback((item: unknown) => (
    item !== null && typeof item === 'object' ? sectionKeys.get(item) : undefined
  ), [sectionKeys]);
  const protectKeyExtractor = useCallback((extractor: NonNullable<SectionListProps<TItem, TSection>['keyExtractor']>) => (
    (item: TItem, index: number) => sectionKey(item) ?? extractor(item, index)
  ), [sectionKey]);
  const guardedKeyExtractor = useMemo(() => (
    keyExtractor ? protectKeyExtractor(keyExtractor) : undefined
  ), [keyExtractor, protectKeyExtractor]);
  const guardedSections = useMemo(() => {
    let hasSectionExtractor = false;
    const guarded = sections.map((section, index) => {
      const key = section.key || String(index);
      // RN sends section objects through item key extractors for header/footer visibility.
      // Retain old identities weakly because delayed callbacks can outlive a sections update.
      sectionKeys.set(section, key);
      if (!section.keyExtractor) return section;
      hasSectionExtractor = true;
      const result = { ...section, keyExtractor: protectKeyExtractor(section.keyExtractor) };
      sectionKeys.set(result, key);
      return result;
    });
    return hasSectionExtractor ? guarded : sections;
  }, [protectKeyExtractor, sectionKeys, sections]);
  const { store, handleViewableItemsChanged } = useRemoteImageViewability(onViewableItemsChanged);
  const handleRowViewability = useCallback((info: ViewabilityChange<TItem>) => {
    const isRow = (token: ViewabilityChange<TItem>['viewableItems'][number]) => (
      token.index != null && sectionKey(token.item) === undefined
    );
    handleViewableItemsChanged({
      ...info,
      viewableItems: info.viewableItems.filter(isRow),
      changed: info.changed.filter(isRow),
    });
  }, [handleViewableItemsChanged, sectionKey]);
  const scopedRenderItem = useCallback<NonNullable<SectionListProps<TItem, TSection>['renderItem']>>((info) => {
    const content = renderItem?.(info) ?? null;
    return (
      <VisibleItemScope store={store} item={info.item}>
        {content}
      </VisibleItemScope>
    );
  }, [renderItem, store]);
  const mergedViewabilityConfig = useMemo(() => ({
    ...viewabilityConfig,
    ...REMOTE_IMAGE_VIEWABILITY_CONFIG,
  }), [viewabilityConfig]);

  return (
    <SectionList<TItem, TSection>
      {...props}
      {...TAB_LIST_CACHE_PROPS}
      extraData={extraData}
      keyExtractor={guardedKeyExtractor}
      onViewableItemsChanged={handleRowViewability}
      renderItem={scopedRenderItem}
      sections={guardedSections}
      viewabilityConfig={mergedViewabilityConfig}
    />
  );
}

type QueryPageProps<TData> = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyText: string;
  data?: TData;
};

type BestListPageProps<
  TItem,
  TSection extends SectionListData<TItem>,
> = QueryPageProps<readonly TSection[]> & {
  sectionListProps: Omit<SectionListProps<TItem, TSection>, 'sections'>;
};

export function BestListPage<
  TItem,
  TSection extends SectionListData<TItem>,
>({
  isLoading,
  isError,
  isEmpty,
  error,
  onRetry,
  emptyText,
  data,
  sectionListProps,
}: BestListPageProps<TItem, TSection>) {
  return (
    <ScoreCardArtworkScope>
      <QueryStateView<readonly TSection[]>
      isLoading={isLoading}
      isError={isError}
      isEmpty={isEmpty}
      error={error}
      onRetry={onRetry}
      emptyText={emptyText}
      data={data}
      renderData={(sections) => (
        <RemoteImageSectionList<TItem, TSection>
          {...sectionListProps}
          sections={sections}
        />
      )}
      />
    </ScoreCardArtworkScope>
  );
}

type FlatListPageProps<TItem> = QueryPageProps<readonly TItem[]> & {
  flatListProps: Omit<FlatListProps<TItem>, 'data'>;
  beforeList?: ReactNode;
};

function FlatListPage<TItem>({
  isLoading,
  isError,
  isEmpty,
  error,
  onRetry,
  emptyText,
  data,
  flatListProps,
  beforeList,
}: FlatListPageProps<TItem>) {
  return (
    <>
      {beforeList}
      <QueryStateView<readonly TItem[]>
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        error={error}
        onRetry={onRetry}
        emptyText={emptyText}
        data={data}
        renderData={(items) => (
          <RemoteImageFlatList<TItem>
            {...flatListProps}
            data={items}
          />
        )}
      />
    </>
  );
}

export function RecordsListPage<TItem>(props: FlatListPageProps<TItem>) {
  return <ScoreCardArtworkScope><FlatListPage {...props} /></ScoreCardArtworkScope>;
}

export function CatalogListPage<TItem>(props: FlatListPageProps<TItem>) {
  return <FlatListPage {...props} />;
}
