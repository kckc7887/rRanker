import { jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { createContext, type ReactNode, useContext } from 'react';
import { Text, View, type FlatListProps } from 'react-native';
import { BestListPage, RemoteImageFlatList } from '@/components/game-content/GameListPages';
import { useCachedTabActive } from '@/components/CachedTabScreen';

const mockPersistenceContext = createContext(false);
jest.mock('@/components/RemoteImage', () => ({
  RemoteImagePersistenceScope: ({ enabled, children }: { enabled: boolean; children: ReactNode }) => (
    <mockPersistenceContext.Provider value={enabled}>{children}</mockPersistenceContext.Provider>
  ),
}));
jest.mock('@/components/game-content/GameScoreCard', () => ({ ScoreCardArtworkScope: ({ children }: { children: ReactNode }) => children }));

type Result = { id: string; song: { id: string; title: string } };

function SongResult({ item }: { item: Result }) {
  const active = useCachedTabActive();
  const persistence = useContext(mockPersistenceContext);
  return <View style={{ height: 40 }}>
    <Text testID={`song-${item.song.id}`}>{item.song.title}</Text>
    <Text testID={`activity-${item.song.id}`}>{active ? '活动' : '暂停'}</Text>
    <Text testID={`image-${item.song.id}`}>{persistence ? '图片处理开启' : '图片处理暂停'}</Text>
  </View>;
}

const result = (id: string, title = id): Result => ({ id, song: { id, title } });
const renderItem: NonNullable<FlatListProps<Result>['renderItem']> = ({ item }) => <SongResult item={item} />;
const songKey = (item: Result) => item.song.id;
const getItemLayout = (_data: unknown, index: number) => ({ index, length: 40, offset: index * 40 });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it.each([songKey, undefined])('keeps visible song work enabled when search replaces rows with the same keys (%s)', async (keyExtractor) => {
  const page = (items: Result[]) => <RemoteImageFlatList
    testID="results" data={items} renderItem={renderItem} keyExtractor={keyExtractor} getItemLayout={getItemLayout}
  />;
  const screen = await render(page(['one', 'two', 'three', 'four'].map(id => result(id))));
  await fireEvent(screen.getByTestId('results'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 80 } } });
  await fireEvent(screen.getByTestId('results'), 'contentSizeChange', 320, 160);
  await fireEvent.scroll(screen.getByTestId('results'), { nativeEvent: {
    contentOffset: { x: 0, y: 0 }, contentSize: { width: 320, height: 160 }, layoutMeasurement: { width: 320, height: 80 },
  } });
  await act(() => jest.advanceTimersByTime(300));
  expect(screen.getByTestId('activity-one')).toHaveTextContent('活动');
  expect(screen.getByTestId('image-one')).toHaveTextContent('图片处理开启');
  expect(screen.getByTestId('image-three')).toHaveTextContent('图片处理暂停');

  await screen.rerender(page(['one', 'two', 'three', 'four'].map(id => result(id, `${id} 新别名`))));
  await act(() => jest.advanceTimersByTime(300));
  expect(screen.getByTestId('song-one')).toHaveTextContent('one 新别名');
  expect(screen.getByTestId('activity-one')).toHaveTextContent('活动');
  expect(screen.getByTestId('image-one')).toHaveTextContent('图片处理开启');
  expect(screen.getByTestId('activity-three')).toHaveTextContent('暂停');
  expect(screen.getByTestId('image-three')).toHaveTextContent('图片处理暂停');

  await fireEvent.scroll(screen.getByTestId('results'), { nativeEvent: {
    contentOffset: { x: 0, y: 80 }, contentSize: { width: 320, height: 160 }, layoutMeasurement: { width: 320, height: 80 },
  } });
  await act(() => jest.advanceTimersByTime(300));
  expect(screen.getByTestId('activity-one')).toHaveTextContent('暂停');
  expect(screen.getByTestId('image-one')).toHaveTextContent('图片处理暂停');
  expect(screen.getByTestId('activity-three')).toHaveTextContent('活动');
  expect(screen.getByTestId('image-three')).toHaveTextContent('图片处理开启');
  await screen.unmount();
});

it('keeps identical row keys in different score sections independent after data replacement', async () => {
  const keyExtractor = (item: Result) => item.id;
  const sections = (title: string) => ['best', 'recent'].map(key => ({
    key, keyExtractor, data: [{ id: 'same-chart', song: { id: key, title: `${key} ${title}` } }],
  }));
  const page = (title: string) => <BestListPage
    isLoading={false} isError={false} isEmpty={false} emptyText="空" data={sections(title)}
    sectionListProps={{
      testID: 'results', renderItem, getItemLayout, stickySectionHeadersEnabled: false,
      renderSectionHeader: () => <View style={{ height: 40 }} />,
      renderSectionFooter: () => <View style={{ height: 40 }} />,
    }}
  />;
  const screen = await render(page('成绩'));
  await fireEvent(screen.getByTestId('results'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 40 } } });
  await fireEvent(screen.getByTestId('results'), 'contentSizeChange', 320, 240);
  const scrollTo = async (y: number) => {
    await fireEvent.scroll(screen.getByTestId('results'), { nativeEvent: {
      contentOffset: { x: 0, y }, contentSize: { width: 320, height: 240 }, layoutMeasurement: { width: 320, height: 40 },
    } });
    await act(() => jest.advanceTimersByTime(300));
  };
  await scrollTo(40);
  expect(screen.getByTestId('image-best')).toHaveTextContent('图片处理开启');
  expect(screen.getByTestId('image-recent')).toHaveTextContent('图片处理暂停');
  await screen.rerender(page('更新成绩'));
  await act(() => jest.advanceTimersByTime(300));
  expect(screen.getByTestId('song-best')).toHaveTextContent('best 更新成绩');
  expect(screen.getByTestId('activity-best')).toHaveTextContent('活动');
  expect(screen.getByTestId('image-best')).toHaveTextContent('图片处理开启');
  expect(screen.getByTestId('image-recent')).toHaveTextContent('图片处理暂停');
  await scrollTo(160);
  expect(screen.getByTestId('image-best')).toHaveTextContent('图片处理暂停');
  expect(screen.getByTestId('activity-best')).toHaveTextContent('暂停');
  expect(screen.getByTestId('image-recent')).toHaveTextContent('图片处理开启');
  expect(screen.getByTestId('activity-recent')).toHaveTextContent('活动');
  await screen.unmount();
});
