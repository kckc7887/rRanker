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
import { CachedContentActivityScope } from '@/components/CachedTabScreen';

const REMOTE_IMAGE_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 250,
  waitForInteraction: false,
} as const;

type ViewabilityChange<TItem> = Parameters<
  NonNullable<FlatListProps<TItem>['onViewableItemsChanged']>
>[0];

function listItemKey(item: unknown, index: number): string {
  if (typeof item === 'object' && item !== null) {
    if ('key' in item && item.key != null) return String(item.key);
    if ('id' in item && item.id != null) return String(item.id);
  }
  return String(index);
}

const viewTokenKey = (token: { key: string }) => token.key;

function createViewabilityStore() {
  let visible = new Set<string>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    has: (item: string) => visible.has(item),
    subscribe(item: string, listener: () => void) {
      let group = listeners.get(item);
      if (!group) listeners.set(item, group = new Set());
      group.add(listener);
      return () => { group.delete(listener); if (!group.size) listeners.delete(item); };
    },
    update(next: Set<string>) {
      const previous = visible;
      visible = next;
      for (const item of previous) if (!next.has(item)) listeners.get(item)?.forEach((notify) => notify());
      for (const item of next) if (!previous.has(item)) listeners.get(item)?.forEach((notify) => notify());
    },
  };
}

function VisibleItemScope({ store, itemKey, children }: {
  store: ReturnType<typeof createViewabilityStore>; itemKey: string; children: ReactNode;
}) {
  const subscribe = useCallback((notify: () => void) => store.subscribe(itemKey, notify), [store, itemKey]);
  const snapshot = useCallback(() => store.has(itemKey), [store, itemKey]);
  const visible = useSyncExternalStore(subscribe, snapshot, snapshot);
  return <CachedContentActivityScope active={visible}>
    <RemoteImagePersistenceScope enabled={visible}>{children}</RemoteImagePersistenceScope>
  </CachedContentActivityScope>;
}

function useRemoteImageViewability<TItem>(
  onViewableItemsChanged: FlatListProps<TItem>['onViewableItemsChanged'],
  getKey: (token: ViewabilityChange<TItem>['viewableItems'][number]) => string = viewTokenKey,
) {
  const [store] = useState(createViewabilityStore);
  const handleViewableItemsChanged = useCallback((info: ViewabilityChange<TItem>) => {
    store.update(new Set(info.viewableItems.map(getKey)));
    onViewableItemsChanged?.(info);
  }, [getKey, onViewableItemsChanged, store]);
  return { store, handleViewableItemsChanged };
}

export function RemoteImageFlatList<TItem>({
  extraData,
  keyExtractor = listItemKey,
  onViewableItemsChanged,
  renderItem,
  viewabilityConfig,
  ...props
}: FlatListProps<TItem>) {
  const { store, handleViewableItemsChanged } = useRemoteImageViewability(onViewableItemsChanged);
  const scopedRenderItem = useCallback<NonNullable<FlatListProps<TItem>['renderItem']>>((info) => {
    const content = renderItem?.(info) ?? null;
    return (
      <VisibleItemScope store={store} itemKey={keyExtractor(info.item, info.index)}>
        {content}
      </VisibleItemScope>
    );
  }, [keyExtractor, renderItem, store]);
  const mergedViewabilityConfig = useMemo(() => ({
    ...viewabilityConfig,
    ...REMOTE_IMAGE_VIEWABILITY_CONFIG,
  }), [viewabilityConfig]);

  return (
    <FlatList<TItem>
      {...props}
      {...TAB_LIST_CACHE_PROPS}
      extraData={extraData}
      keyExtractor={keyExtractor}
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
      /** RN 会将分组对象传给行 keyExtractor；弱引用也保留迟到回调所需的分组键。 */
      sectionKeys.set(section, key);
      if (!section.keyExtractor) return section;
      hasSectionExtractor = true;
      const result = { ...section, keyExtractor: protectKeyExtractor(section.keyExtractor) };
      sectionKeys.set(result, key);
      return result;
    });
    return hasSectionExtractor ? guarded : sections;
  }, [protectKeyExtractor, sectionKeys, sections]);
  const getViewableKey = useCallback((token: ViewabilityChange<TItem>['viewableItems'][number]) => (
    `${sectionKey(token.section)}:${token.key}`
  ), [sectionKey]);
  const { store, handleViewableItemsChanged } = useRemoteImageViewability(onViewableItemsChanged, getViewableKey);
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
      <VisibleItemScope store={store} itemKey={`${sectionKey(info.section)}:${
        (info.section.keyExtractor ?? keyExtractor ?? listItemKey)(info.item, info.index)
      }`}>
        {content}
      </VisibleItemScope>
    );
  }, [keyExtractor, renderItem, sectionKey, store]);
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
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
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
  emptyActionLabel,
  onEmptyAction,
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
      emptyActionLabel={emptyActionLabel}
      onEmptyAction={onEmptyAction}
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
  emptyActionLabel,
  onEmptyAction,
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
        emptyActionLabel={emptyActionLabel}
        onEmptyAction={onEmptyAction}
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
