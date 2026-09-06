import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { MajdataBestScreen, MajdataCatalogScreen, MajdataFilter, MajdataRecordsScreen } from '@/screens/MajdataScreens';
import { MajdataDifficultyBadge, MajdataScoreCard, MajdataSongRow, majdataVisual } from '@/components/majdata/MajdataCards';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { DifficultyBadge } from '@/components/ScoreVisuals';
import { filterShellStyles } from '@/components/game-content/FilterShell';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { SIMAI_CATALOG_LIST_STYLES, SIMAI_RECORDS_LIST_STYLES } from '@/components/game-content/SimaiListStyles';
import { phigrosLevelColors } from '@/domain/phigros-level-theme';
import type { MajdataSong } from '@/domain/majdata';
import { majdataRecordCard } from '@/features/game-content/adapters/majdata';
import { useMajdataCatalogFilter, useMajdataRecordsFilter } from '@/state/majdata-filters';

const mockPush = jest.fn();
const mockMore = jest.fn();
const mockFavorite = jest.fn(async () => []);
const mockSong: MajdataSong = {
  id: '0dff2974-9419-4290-bea9-307caa5825b7', title: '歌曲名称', artist: '曲师', designer: '谱师',
  uploader: '上传者', description: '', timestamp: '2026-09-01T00:00:00Z', hash: 'revision',
  levels: ['1', '', '', '13+', '14.5', '', '宴'], tags: ['线上一'], publicTags: ['线上一', '线上二'],
};
const mockScore = { chartInfo: mockSong, chartLevel: 4, acc: { dx: 97, classic: 98 }, dxScore: 500,
  comboState: 0, hash: 'revision', timestamp: mockSong.timestamp };
const mockRecent = { chartId: mockSong.id, title: mockSong.title, artist: mockSong.artist, uploader: '', designer: '',
  level: 4, difficulty: '14.5', acc: 96, comboState: 0, timestamp: mockSong.timestamp };
let mockSongs = [mockSong];
let mockHasNextPage = true;
let mockTabActive = true;
let mockRecords = [mockScore];
let mockFavorites: { kind: 'song'; favorite: boolean; songId: string; tags: string[] }[] = [];

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 34 }));
jest.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: string) => value }));
jest.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => mockTabActive }));
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: unknown) => unknown) => selector({ activeAccountId: 'player', activeGameId: 'majdata-net' }) }));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({ isLoading: false, isError: false, isRefetching: false, refetch: jest.fn(), data: {
  payload: { kind: 'majdata-net', snapshot: { player: { username: 'player' }, records: mockRecords,
    recent: [mockRecent, { ...mockRecent, timestamp: '2026-09-02T00:00:00Z', acc: 97 }] } },
} }) }));
jest.mock('@/hooks/use-majdata', () => ({
  useMajdataSongs: () => ({ data: { pages: [mockSongs] }, hasNextPage: mockHasNextPage, isLoading: false, isFetching: false,
    isError: false, isRefetching: false, isFetchingNextPage: false, fetchNextPage: mockMore, refetch: jest.fn() }),
  useMajdataRanking: () => ({ data: { hash: 'revision', scores: [[], [], [], [{ player: { username: 'player' } }], []] } }),
}));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({ data: mockFavorites,
  setSongFavorite: mockFavorite, isLoading: false, isUpdating: false }) }));
jest.mock('@/components/RemoteImage', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { RemoteImage: View, RemoteImagePersistenceScope: View, RemoteImageActivityScope: View };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSongs = [mockSong]; mockRecords = [mockScore]; mockHasNextPage = true; mockTabActive = true; mockFavorites = [];
  useMajdataCatalogFilter.getState().clearFilters(); useMajdataCatalogFilter.setState({ collapsed: true });
  useMajdataRecordsFilter.getState().clearFilters(); useMajdataRecordsFilter.setState({ collapsed: true });
});

test('single score uses the exact shared maimai card styles with only the requested data changes', async () => {
  const maimai = await render(<ScoreRecordCard record={{ songId: '1', title: mockSong.title, type: 'DX',
    difficulty: 'master', difficultyConstant: 14.5, levelIndex: 3, achievements: 97, rating: undefined }} />);
  const majdata = await render(<MajdataScoreCard card={majdataRecordCard(mockScore)} username="player" visible />);
  expect(majdata.toJSON()?.props.style)
    .toEqual(maimai.toJSON()?.props.style);
  for (const label of [mockSong.title, 'MASTER (14.5)', '97.0000%']) {
    expect(majdata.getByText(label).props.style).toEqual(maimai.getByText(label).props.style);
  }
  expect(majdata.getByText('排名').props.style).toEqual(maimai.getByText('Rating').props.style);
  expect(majdata.getByText('-')).toBeTruthy();
  expect(majdata.queryByText(/Classic/)).toBeNull();
  expect(majdata.queryByText('DX')).toBeNull();
  expect(majdata.queryByText(/2026/)).toBeNull();
  await fireEvent.press(majdata.getByRole('button'));
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ songId: mockSong.id, levelIndex: '4', gameId: 'majdata-net' }) }));
});

test('raw difficulty keeps the maimai compact sizes and Easy uses the shared HD blue', async () => {
  const original = await render(<DifficultyBadge difficulty="expert" constant={13.5} compact />);
  const raw = await render(<MajdataDifficultyBadge level={3} value="13+" compact />);
  expect(raw.toJSON()?.props.style)
    .toEqual(original.toJSON()?.props.style);
  expect(raw.getByText('EXPERT (13+)').props.style).toEqual(original.getByText('EXPERT (13.5)').props.style);
  expect(majdataVisual(0)).toMatchObject({ color: phigrosLevelColors(1).fg, tint: phigrosLevelColors(1).bg });
});

test('catalog row uses compact value-only badges and the existing 44px local favorite control', async () => {
  const onFavoriteChange = jest.fn();
  const screen = await render(<MajdataSongRow song={mockSong} favorite={false} favoritePending={false} onFavoriteChange={onFavoriteChange} />);
  expect(screen.getByText('13+')).toBeTruthy(); expect(screen.getByText('14.5')).toBeTruthy();
  expect(screen.queryByText(/MASTER/)).toBeNull(); expect(screen.queryByText('SD')).toBeNull();
  const favorite = screen.getByLabelText(`收藏 ${mockSong.title}`);
  expect(StyleSheet.flatten(favorite.props.style)).toEqual({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' });
  await fireEvent.press(favorite);
  expect(onFavoriteChange).toHaveBeenCalledWith(mockSong.id, true);
  expect(screen.getByLabelText('歌曲封面').props).toMatchObject({ contentFit: 'cover', transition: 120,
    source: expect.stringContaining(mockSong.id), style: { width: 58, height: 58, borderRadius: 9 } });
});

test('expanded filters have independent existing filter rows and immediate checkbox multi-select', async () => {
  useMajdataRecordsFilter.setState({ collapsed: false });
  const screen = await render(<MajdataFilter catalog={false} tags={['线上一', '线上二']} />);
  for (const name of ['difficulty', 'tags', 'achievement']) {
    expect(screen.getByTestId(`majdata-filter-${name}-row`).props.style).toEqual(filterShellStyles.filterRow);
  }
  expect(screen.getAllByText('难度')).toHaveLength(1);
  expect(screen.getAllByText('标签')).toHaveLength(1);
  await fireEvent.press(screen.getByLabelText('筛选难度，当前 全部'));
  await fireEvent.press(screen.getByLabelText('难度 Easy'));
  await fireEvent.press(screen.getByLabelText('难度 Master'));
  expect(useMajdataRecordsFilter.getState().difficulties).toEqual([0, 4]);
  expect(screen.getByLabelText('难度 Master').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByLabelText('关闭下拉列表'));
  await fireEvent.press(screen.getByLabelText('筛选线上标签，当前 全部'));
  await fireEvent.press(screen.getByLabelText('线上标签 线上一'));
  await fireEvent.press(screen.getByLabelText('线上标签 线上二'));
  expect(useMajdataRecordsFilter.getState().tags).toEqual(['线上一', '线上二']);
  await fireEvent.press(screen.getByLabelText('重置筛选'));
  expect(useMajdataRecordsFilter.getState()).toMatchObject({ difficulties: [], tags: [], min: '', max: '' });
  expect(screen.queryByLabelText('线上标签 线上一')).toBeNull();
});

test('catalog sorting is in its own row and reset closes its dropdown', async () => {
  useMajdataCatalogFilter.setState({ collapsed: false });
  const screen = await render(<MajdataFilter catalog tags={[]} />);
  expect(screen.getByTestId('majdata-filter-sort-row').props.style).toEqual(filterShellStyles.filterRow);
  expect(screen.queryByTestId('majdata-filter-achievement-row')).toBeNull();
  await fireEvent.press(screen.getByLabelText('曲库排序'));
  await fireEvent.press(screen.getByLabelText('排序 点赞数'));
  expect(useMajdataCatalogFilter.getState().sort).toBe('likep');
  await fireEvent.press(screen.getByLabelText('曲库排序'));
  await fireEvent.press(screen.getByLabelText('重置筛选'));
  expect(useMajdataCatalogFilter.getState().sort).toBe('timep');
  expect(screen.queryByLabelText('排序 点赞数')).toBeNull();
});

test('search inputs use the original maimai records/catalog styles', async () => {
  for (const [layout, styles] of [['records', SIMAI_RECORDS_LIST_STYLES], ['catalog', SIMAI_CATALOG_LIST_STYLES]] as const) {
    const screen = await render(<GameSearchHeader layout={layout} accessibilityLabel="搜索" placeholder="歌曲" value="" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('搜索').props.style[0]).toEqual(styles.searchBox);
    expect(screen.getByLabelText('搜索').props).toMatchObject({ autoCapitalize: 'none', autoCorrect: false });
    await screen.unmount();
  }
});

test('Recent keeps repeated plays newest first and uses the maimai section header size', async () => {
  const screen = await render(<MajdataBestScreen />);
  expect(screen.getByText('Recent').props.style[0]).toMatchObject({ fontSize: 18, fontWeight: '800' });
  expect(screen.getByText('1. 歌曲名称')).toBeTruthy(); expect(screen.getByText('2. 歌曲名称')).toBeTruthy();
  expect(screen.queryByText(/Classic/)).toBeNull();
  expect(screen.getAllByText('排名')).toHaveLength(2);
});

test('a filtered empty page continues the upstream cursor, while exhaustion shows the shared empty state', async () => {
  mockSongs = [{ ...mockSong, levels: ['1', '', '', '', '', '', ''] }];
  useMajdataCatalogFilter.setState({ difficulties: [5] });
  const screen = await render(<MajdataCatalogScreen />);
  expect(mockMore).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('当前筛选条件下没有歌曲')).toBeNull();
  expect(screen.queryByText('加载更多')).toBeNull();
  await screen.unmount();
  mockHasNextPage = false;
  const exhausted = await render(<MajdataCatalogScreen />);
  expect(exhausted.getByText('当前筛选条件下没有歌曲')).toBeTruthy();
});

test('catalog favorites use the shared local library and records show DX with the existing count header', async () => {
  const catalog = await render(<MajdataCatalogScreen />);
  await fireEvent.press(catalog.getByLabelText(`收藏 ${mockSong.title}`));
  expect(mockFavorite).toHaveBeenCalledWith(mockSong.id, true);
  await catalog.unmount();
  const records = await render(<MajdataRecordsScreen />);
  expect(records.getByText('共 1 条成绩')).toBeTruthy();
  expect(records.queryByText(/Classic/)).toBeNull();
});

test('an inactive catalog does not continue fetching pages after local filtering', async () => {
  mockTabActive = false;
  mockSongs = [{ ...mockSong, levels: ['1', '', '', '', '', '', ''] }];
  useMajdataCatalogFilter.setState({ difficulties: [5] });
  await render(<MajdataCatalogScreen />);
  expect(mockMore).not.toHaveBeenCalled();
});
