import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import SearchScreen from '../app/(tabs)/search';
import SongDetailScreen from '../app/songs/[songId]';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null }, router: { push: jest.fn() }, useLocalSearchParams: () => ({ songId: '1' }),
}));
jest.mock('@/components/SongCover', () => ({ SongCover: () => null }));
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => {
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  return { data: { ...fixtures.fixtureCatalog, songs: fixtures.fixtureCatalog.songs.map((song: { id: string }) => song.id === '1' ? { ...song, aliases: ['唯一别名'] } : song) }, isLoading: false, isError: false, error: null, refetch: jest.fn() };
} }));
jest.mock('@/hooks/use-score-snapshot', () => ({ useScoreSnapshot: () => {
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  return { data: { records: fixtures.fixtureRecords, source: fixtures.fixtureSource }, isLoading: false, isError: false, error: null, refetch: jest.fn() };
} }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], isLoading: false, isUpdating: false, setSongFavorite: jest.fn(), setChartPractice: jest.fn(), setTags: jest.fn(),
}) }));

describe('M2 song query screens', () => {
  it('searches aliases after debounce and supports empty filter state', async () => {
    const screen = await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '完全不存在');
    await waitFor(() => expect(screen.getByText('筛选结果为空')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '唯一别名');
    await waitFor(() => expect(screen.getAllByText('正常曲目 A').length).toBeGreaterThan(0));
  });
  it('renders song metadata, chart status and source status', async () => {
    const screen = await render(<SongDetailScreen />);
    expect(screen.getByText('歌曲信息')).toBeTruthy();
    expect(screen.getByText(/别名：唯一别名/)).toBeTruthy();
    expect(screen.getByLabelText('数据来源状态')).toBeTruthy();
    expect(screen.getAllByText(/未游玩|最佳/).length).toBeGreaterThan(0);
  });
});
