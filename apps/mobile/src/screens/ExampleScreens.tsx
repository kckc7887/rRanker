import { SongListSectionHeader } from '@/components/game-content/SongListSectionHeader';
import { useMemo, useState } from 'react';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { ExampleScoreCard, ExampleSongRow } from '@/components/example/ExampleSongContent';
import { EXAMPLE_SONGS, type ExampleRecord } from '@/domain/example';
import { useGameData } from '@/hooks/use-game-data';
import { useUserLibrary } from '@/hooks/use-user-library';

export function ExampleBestScreen() {
  const query = useGameData();
  const sections = query.data?.payload.kind === 'example' ? query.data.payload.bestSections : undefined;
  return <BestListPage<ExampleRecord, NonNullable<typeof sections>[number]>
    data={sections} isLoading={query.isPending} isError={query.isError} error={query.error} isEmpty={!sections?.length}
    emptyText="同步数据后，最佳成绩会显示在这里" onRetry={() => void query.refetch()}
    sectionListProps={{
      keyExtractor: record => record.song.id,
      renderSectionHeader: ({ section }) => <SongListSectionHeader title={section.title} value={section.data.reduce((total, record) => total + record.rating, 0)} />,
      renderItem: ({ item, index }) => <ExampleScoreCard record={item} rank={index + 1} />,
    }} />;
}

export function ExampleRecordsScreen() {
  const query = useGameData();
  const records = query.data?.payload.kind === 'example' ? query.data.payload.records : undefined;
  return <RecordsListPage
    data={records} isLoading={query.isPending} isError={query.isError} error={query.error} isEmpty={!records?.length}
    emptyText="同步数据后，成绩会显示在这里" onRetry={() => void query.refetch()}
    flatListProps={{
      refreshing: query.isFetching, onRefresh: () => void query.refetch(),
      keyExtractor: record => record.song.id, renderItem: ({ item }) => <ExampleScoreCard record={item} />,
    }} />;
}

export function ExampleCatalogScreen() {
  const library = useUserLibrary();
  const [keyword, setKeyword] = useState('');
  const songs = useMemo(() => EXAMPLE_SONGS.filter(song => `${song.title} ID${song.id}`.toLowerCase().includes(keyword.trim().toLowerCase())), [keyword]);
  const favorites = new Set(library.data?.filter(item => item.kind === 'song' && item.favorite).map(item => item.songId));
  return <CatalogListPage
    beforeList={<GameSearchHeader value={keyword} onChangeText={setKeyword} placeholder="搜索曲名或 ID" />}
    data={songs.length ? songs : undefined} isLoading={false} isError={false} isEmpty={!songs.length} emptyText="没有符合条件的歌曲"
    emptyActionLabel={keyword ? '清除搜索' : undefined} onEmptyAction={keyword ? () => setKeyword('') : undefined}
    flatListProps={{
      keyExtractor: song => song.id,
      renderItem: ({ item }) => <ExampleSongRow song={item} favorite={favorites.has(item.id)} pending={library.isLoading || library.isUpdating}
        onFavoriteChange={favorite => { void library.setSongFavorite(item.id, favorite); }} />,
    }} />;
}
