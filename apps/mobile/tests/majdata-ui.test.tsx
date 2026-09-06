import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { MajdataBestScreen, MajdataCatalogScreen, MajdataRecordsScreen } from '@/screens/MajdataScreens';
import { useMajdataCatalogFilter, useMajdataRecordsFilter } from '@/state/majdata-filters';
import type { MajdataSong } from '@/domain/majdata';

const mockPush = jest.fn(); const mockMore = jest.fn();
const mockRefetch = jest.fn();
const mockSong: MajdataSong = { id: '0dff2974-9419-4290-bea9-307caa5825b7', title: '测试歌曲', artist: '曲师', designer: '谱师', uploader: '上传者', description: '简介文本', timestamp: '2026-09-01T00:00:00Z', hash: 'revision', levels: ['1', '3', '', '13+', '14.5', '15', '宴'], tags: ['在线 A'], publicTags: ['在线 B'] };
let mockSongs = [mockSong];
const mockScore = { chartInfo: mockSong, chartLevel: 4, acc: { dx: 100.1234, classic: 99.5678 }, dxScore: 500, comboState: 2, hash: 'revision', timestamp: mockSong.timestamp };
const mockRecent = { chartId: mockSong.id, title: mockSong.title, artist: '', uploader: '', designer: '', level: 4, difficulty: '14.5', acc: 98.1234, comboState: 1, timestamp: mockSong.timestamp };
jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) }, Stack: { Screen: () => null } }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: string) => value }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({ dark: false, background: '#FFF', surface: '#FFF', surfaceMuted: '#EEE', input: '#FFF', text: '#111', textSecondary: '#555', textMuted: '#777', border: '#DDD', accent: '#2563EB' }) }));
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: unknown) => unknown) => selector({ activeAccountId: 'a', activeGameId: 'majdata-net' }) }));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({ isLoading: false, isError: false, isRefetching: false, refetch: mockRefetch, data: { payload: { kind: 'majdata-net', snapshot: { player: { username: 'player' }, records: [mockScore], recent: [mockRecent, { ...mockRecent, timestamp: '2026-09-02T00:00:00Z' }] } } } }) }));
jest.mock('@/hooks/use-majdata', () => ({
  useMajdataSong: () => ({ data: mockSong, isLoading: false, isError: false, isRefetching: false, refetch: mockRefetch }),
  useMajdataSongs: () => ({ data: { pages: [mockSongs] }, hasNextPage: true, isLoading: false, isError: false, isRefetching: false, isFetchingNextPage: false, fetchNextPage: mockMore }),
  useMajdataRanking: () => ({ data: { hash: 'revision', scores: [[], [], [], [{ player: { username: 'player' } }], []] } }),
  useMajdataParsedChart: () => ({ data: { statistics: { counts: { tap: 1, hold: 2, slide: 3, touch: 4, break: 5, mine: 6 } } }, isError: false }),
}));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({ data: [], tagPresets: [], songKey: (id: string) => id, chartKey: (id: string) => id, setSongFavorite: jest.fn(), setChartPractice: jest.fn(), setTags: jest.fn(), setTagPresets: jest.fn() }) }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showActionNotification: jest.fn() }) }));
jest.mock('@/features/chart-download-shared/use-chart-package-download', () => ({ useChartPackageDownload: () => ({ isRunning: false, start: jest.fn() }) }));
jest.mock('@/components/TagEditor', () => ({ TagEditor: () => null }));
jest.mock('@/components/game-content/SongDetailChrome', () => ({ SongDetailChrome: () => null }));
jest.mock('@/components/RemoteImage', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { RemoteImage: View, RemoteImagePersistenceScope: View, RemoteImageActivityScope: View };
});

beforeEach(() => { jest.clearAllMocks(); mockSongs = [mockSong]; useMajdataCatalogFilter.getState().clearFilters(); useMajdataRecordsFilter.getState().clearFilters(); });
describe('Majdata page contracts', () => {
  it('shows Recent without inventing Classic and retains both plays', async () => {
    const screen = await render(<MajdataBestScreen />); expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getAllByText('排名')).toHaveLength(2); expect(screen.queryByText(/Classic/)).toBeNull();
    await screen.unmount();
  });
  it('shows only DX achievements and never borrows a different difficulty rank', async () => {
    const screen = await render(<MajdataRecordsScreen />); expect(screen.queryByText(/Classic/)).toBeNull(); expect(screen.getByText('-')).toBeTruthy();
    expect(screen.getByText('MASTER (14.5)')).toBeTruthy(); expect(screen.queryByText('Rating')).toBeNull(); await screen.unmount();
  });
  it('keeps the upstream cursor when a fetched page has no matching difficulty', async () => {
    mockSongs = [{ ...mockSong, levels: ['1', '', '', '', '', '', ''] }]; useMajdataCatalogFilter.setState({ difficulties: [5] });
    const screen = await render(<MajdataCatalogScreen />); expect(screen.queryByText(mockSong.title)).toBeNull();
    expect(mockMore).toHaveBeenCalled(); await screen.unmount();
  });
});
