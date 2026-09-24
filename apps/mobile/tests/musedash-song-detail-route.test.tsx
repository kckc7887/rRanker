import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import SongDetailScreen from '../app/songs/[songId]';
import { MuseDashSongDetailScreen } from '@/screens/MuseDashScreens';
import type { MuseDashAlbumsResponse, MuseDashCeResponse, MuseDashPlayer } from '@/domain/muse-dash';

let mockRouteParams: Record<string, string> = { songId: '0-47' };
const mockDiffdiff = [
  ['0-47', 3, '11', 640.1, 11.5],
  ['0-47', 4, '12', 739.7, 12.5],
] as [string, number, string, number, number][];

const mockAlbums: MuseDashAlbumsResponse = {
  ALBUM1: {
    title: 'Default Music', json: 'ALBUM1', tag: 'Default',
    music: {
      '0-47': {
        uid: '0-47', name: 'Sample Song', author: 'Sample Author', cover: 'sample_cover',
        bpm: '128', levelDesigner: ['Mapper A'], difficulty: ['2', '5', '8', '11', '12'],
        ChineseS: { name: '示例歌曲', author: '示例作者' },
      },
    },
  },
};
const mockCe: MuseDashCeResponse = { c: { ChineseS: ['凛'], English: [] }, e: { ChineseS: ['喵斯'], English: [] } };
const mockPlayer: MuseDashPlayer = {
  lastUpdate: 1786311369798, rl: 3.45, diffHistoryNumber: 2,
  plays: [
    { score: 302027, acc: 94.17, platform: 'mobile', difficulty: 3, uid: '0-47', sum: 3950 },
  ],
  user: { user_id: 'user-1', nickname: 'Tester' },
};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), replace: jest.fn() },
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }),
  useLocalSearchParams: () => mockRouteParams,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: RN.View,
    Pressable: RN.Pressable,
    ScrollView: RN.ScrollView,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/AppNotification', () => ({
  NotificationOutlet: () => null,
  useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }),
  useNotificationModalRequestClose: () => () => false,
}));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  dark: false, accent: '#246BFD', accentSoft: '#EAF1FF', background: '#F7F8FA', surface: '#FFFFFF',
  surfaceMuted: '#EEF2F7', input: '#FFFFFF', border: '#D1D5DB', text: '#111827',
  textSecondary: '#4B5563', textMuted: '#6B7280', danger: '#B42318',
}) }));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: unknown) => unknown) => selector({
    activeGameId: 'musedash',
    activeAccountId: 'musedash:musedash-moe:user-1',
  }),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: { payload: { kind: 'musedash', player: mockPlayer } },
    isLoading: false, isError: false, error: null, refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-muse-dash', () => {
  const query = (data: unknown) => ({
    data,
    source: { kind: 'musedash', label: 'MuseDash.moe', updatedAt: new Date(0).toISOString(), isStale: false },
    isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn(),
  });
  return {
    useMuseDashPlayer: () => query(mockPlayer),
    useMuseDashAlbums: () => query(mockAlbums),
    useMuseDashCe: () => query(mockCe),
    useMuseDashDiffdiff: () => query(mockDiffdiff),
    useMuseDashPlayDetail: () => query(undefined),
    useMuseDashPlayDetails: () => new Map(),
  };
});
jest.mock('@/hooks/use-user-library', () => {
  const { chartLibraryKey, songLibraryKey } = jest.requireActual<typeof import('../src/domain/user-library')>('../src/domain/user-library');
  return {
    useUserLibrary: () => ({
      data: [], isLoading: false, isUpdating: false,
      setSongFavorite: jest.fn(), setChartPractice: jest.fn(), setTags: jest.fn(), setTagPresets: jest.fn(),
      tagPresets: [], songKey: (songId: string | number) => songLibraryKey('musedash', songId),
      chartKey: (songId: string | number, type: 'SD' | 'DX', levelIndex: number) => chartLibraryKey('musedash', songId, type, levelIndex),
    }),
  };
});
jest.mock('@/components/TagEditor', () => ({ TagEditor: () => null }));
jest.mock('@/components/SongCover', () => ({ SongCover: () => null }));
jest.mock('@/components/CollectionImage', () => ({ CollectionImage: () => null }));
jest.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => true }));

const carouselOffset = (screen: Awaited<ReturnType<typeof render>>): number => {
  const carousel = screen.getByTestId('musedash-chart-carousel');
  return carousel.props.contentOffset.x as number;
};

beforeEach(() => {
  mockRouteParams = { songId: '0-47' };
});

describe('Muse Dash 歌曲详情真实路由', () => {
  it('路由带 levelIndex 时定位到与直接渲染组件一致的难度', async () => {
    const direct = await render(<MuseDashSongDetailScreen songId="0-47" levelIndex={3} />);
    const directOffset = carouselOffset(direct);
    const directInterval = direct.getByTestId('musedash-chart-carousel').props.snapToInterval as number;
    await direct.unmount();
    expect(directOffset).toBe(directInterval);

    mockRouteParams = { songId: '0-47', levelIndex: '3' };
    const routed = await render(<SongDetailScreen />);
    const routedOffset = carouselOffset(routed);
    expect(routedOffset).toBe(directOffset);
    await routed.unmount();
  });

  it('路由不带 levelIndex 时保持默认难度定位', async () => {
    const direct = await render(<MuseDashSongDetailScreen songId="0-47" />);
    const directOffset = carouselOffset(direct);
    await direct.unmount();

    const routed = await render(<SongDetailScreen />);
    expect(carouselOffset(routed)).toBe(directOffset);
    await routed.unmount();
  });
});
