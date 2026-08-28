import type { ReactNode } from 'react';
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
        <SectionList<TItem, TSection>
          {...sectionListProps}
          {...TAB_LIST_CACHE_PROPS}
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
          <FlatList<TItem>
            {...flatListProps}
            {...TAB_LIST_CACHE_PROPS}
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
