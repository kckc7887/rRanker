import { type ReactNode, useCallback, useMemo, useState } from 'react';
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

function useRemoteImageViewability<TItem>(
  onViewableItemsChanged: FlatListProps<TItem>['onViewableItemsChanged'],
) {
  const [visibleItems, setVisibleItems] = useState<ReadonlySet<TItem>>(() => new Set());
  const handleViewableItemsChanged = useCallback((info: ViewabilityChange<TItem>) => {
    const next = new Set(info.viewableItems.map((token) => token.item));
    setVisibleItems((current) => (
      current.size === next.size && [...current].every((item) => next.has(item)) ? current : next
    ));
    onViewableItemsChanged?.(info);
  }, [onViewableItemsChanged]);
  return { visibleItems, handleViewableItemsChanged };
}

export function RemoteImageFlatList<TItem>({
  extraData,
  onViewableItemsChanged,
  renderItem,
  viewabilityConfig,
  ...props
}: FlatListProps<TItem>) {
  const { visibleItems, handleViewableItemsChanged } = useRemoteImageViewability(onViewableItemsChanged);
  const scopedExtraData = useMemo(() => [extraData, visibleItems] as const, [extraData, visibleItems]);
  const scopedRenderItem = useCallback<NonNullable<FlatListProps<TItem>['renderItem']>>((info) => {
    const content = renderItem?.(info) ?? null;
    return (
      <RemoteImagePersistenceScope enabled={visibleItems.has(info.item)}>
        {content}
      </RemoteImagePersistenceScope>
    );
  }, [renderItem, visibleItems]);
  const mergedViewabilityConfig = useMemo(() => ({
    ...viewabilityConfig,
    ...REMOTE_IMAGE_VIEWABILITY_CONFIG,
  }), [viewabilityConfig]);

  return (
    <FlatList<TItem>
      {...props}
      {...TAB_LIST_CACHE_PROPS}
      extraData={scopedExtraData}
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
  onViewableItemsChanged,
  renderItem,
  viewabilityConfig,
  ...props
}: SectionListProps<TItem, TSection>) {
  const { visibleItems, handleViewableItemsChanged } = useRemoteImageViewability(onViewableItemsChanged);
  const scopedExtraData = useMemo(() => [extraData, visibleItems] as const, [extraData, visibleItems]);
  const scopedRenderItem = useCallback<NonNullable<SectionListProps<TItem, TSection>['renderItem']>>((info) => {
    const content = renderItem?.(info) ?? null;
    return (
      <RemoteImagePersistenceScope enabled={visibleItems.has(info.item)}>
        {content}
      </RemoteImagePersistenceScope>
    );
  }, [renderItem, visibleItems]);
  const mergedViewabilityConfig = useMemo(() => ({
    ...viewabilityConfig,
    ...REMOTE_IMAGE_VIEWABILITY_CONFIG,
  }), [viewabilityConfig]);

  return (
    <SectionList<TItem, TSection>
      {...props}
      {...TAB_LIST_CACHE_PROPS}
      extraData={scopedExtraData}
      onViewableItemsChanged={handleViewableItemsChanged}
      renderItem={scopedRenderItem}
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
