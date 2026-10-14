import { imageDownloads } from './remote-image-native-mock';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OsuBeatmapsetDetail } from '@/domain/osu';
import UserLibraryScreen from '../app/library/index';

const mockPush = jest.fn();
const mockGetBeatmapset = jest.fn<(id: string) => Promise<OsuBeatmapsetDetail>>();
let mockFocused = true;
const mockTransitions = new Map<string, (event: { data: { closing: boolean } }) => void>();
const mockNavigation = {
  isFocused: () => mockFocused,
  addListener: (event: string, listener: (event: { data: { closing: boolean } }) => void) => {
    mockTransitions.set(event, listener);
    return () => { mockTransitions.delete(event); };
  },
};

const beatmapset: OsuBeatmapsetDetail = {
  beatmapSetId: 3720,
  title: '鳥の詩',
  artist: 'Lia',
  creator: 'James',
  cover: 'https://assets.ppy.sh/beatmaps/3720/covers/card@2x.jpg',
  status: 'ranked',
  genreName: '动漫',
  languageName: '日语',
  rating: 4.8,
  favouriteCount: 1234,
  tags: [],
  beatmaps: [{
    id: 22423,
    version: 'Hard',
    difficultyRating: 5.5,
    mode: 'osu',
    totalLength: 129,
    bpm: 180,
    cs: 4,
    drain: 6,
    accuracy: 8,
    ar: 9,
    countCircles: 520,
    countSliders: 12,
    countSpinners: 3,
    maxCombo: 450,
  }],
};

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useNavigation: () => mockNavigation,
  useIsFocused: () => mockFocused,
}));
jest.mock('expo-file-system', () => jest.requireActual<typeof import('./remote-image-native-mock')>('./remote-image-native-mock').fileSystem);
jest.mock('expo-file-system/legacy', () => jest.requireActual<typeof import('./remote-image-native-mock')>('./remote-image-native-mock').legacyFileSystem);
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: ({ source, ...props }: { source?: unknown }) => (
      <RN.Image {...props} source={typeof source === 'string' ? { uri: source } : source as React.ComponentProps<typeof RN.Image>['source']} />
    ),
  };
});
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: {
    activeGameId: 'osu-standard'; activeProviderId: 'osu-test'; activeAccountId: string; session: null;
  }) => unknown) => (
    selector({ activeGameId: 'osu-standard', activeProviderId: 'osu-test', activeAccountId: 'osu-standard:osu-test:demo', session: null })
  ),
}));
jest.mock('@/providers/osu-public-catalog-provider', () => ({ OsuPublicCatalogProvider: class {
  getBeatmapset(id: string) { return mockGetBeatmapset(id); }
} }));
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => ({ data: undefined }) }));
jest.mock('@/hooks/use-chunithm-catalog', () => ({ useChunithmCatalog: () => ({ data: undefined }) }));
jest.mock('@/hooks/use-phigros-catalog', () => ({ usePhigrosCatalog: () => ({ data: undefined }) }));
jest.mock('@/hooks/use-phira', () => ({ usePhiraChartsByIds: () => ({ data: [] }) }));
jest.mock('@/hooks/use-muse-dash', () => ({ useMuseDashAlbums: () => ({ data: undefined }) }));
jest.mock('@/hooks/use-tuf', () => ({ useTufLevelSearch: () => ({ data: undefined }) }));
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({
    data: [
      {
        key: 'song:osu-standard:3720', gameId: 'osu-standard', kind: 'song', songId: '3720',
        favorite: true, tags: [], createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z',
      },
      {
        key: 'chart:osu-standard:3720:SD:22423', gameId: 'osu-standard', kind: 'chart', songId: '3720',
        type: 'SD', levelIndex: 22423, practice: true, tags: ['爆发'],
        createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z',
      },
      {
        key: 'song:osu-standard:9999', gameId: 'osu-standard', kind: 'song', songId: '9999',
        favorite: true, tags: [], createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z',
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    accent: '#246BFD', background: '#F7F8FA', surface: '#FFFFFF', surfaceMuted: '#EEF2F7',
    text: '#111827', textSecondary: '#4B5563', textMuted: '#6B7280', danger: '#B42318',
  }),
}));

describe('osu personal library', () => {
  let client: QueryClient;
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
    mockTransitions.clear();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    mockGetBeatmapset.mockImplementation(async id => {
      if (id === '3720') return beatmapset;
      throw new Error('not found');
    });
  });
  afterEach(async () => { await cleanup(); client.clear(); });

  const screenRoute = (client: QueryClient) => <QueryClientProvider client={client}><UserLibraryScreen /></QueryClientProvider>;
  const finishTransition = () => act(() => { mockTransitions.get('transitionEnd')?.({ data: { closing: false } }); });

  it('按当前模式补齐真实歌曲与谱面信息，并保留失败 ID 占位', async () => {
    const screen = await render(screenRoute(client));
    await finishTransition();
    await waitFor(() => expect(screen.getAllByText('鳥の詩')).toHaveLength(2));

    expect(mockGetBeatmapset.mock.calls.map(([id]) => id)).toEqual(['3720', '9999']);
    expect(screen.getAllByText('鳥の詩')).toHaveLength(2);
    expect(screen.getByText('练习谱面 · Hard · 5.50★')).toBeTruthy();
    expect(screen.getByText('歌曲 ID 9999')).toBeTruthy();
    expect(screen.getByText('曲库暂不可用，个人数据已保留')).toBeTruthy();
    expect(imageDownloads.get(screen.getAllByLabelText('曲绘')[0]?.props.source?.uri)).toBe(beatmapset.cover);

    await fireEvent.press(screen.getByText('练习谱面 · Hard · 5.50★'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '3720', beatmapId: '22423', gameId: 'osu-standard' },
    });
  });

  it('等待真实路由入场后补全歌曲，失焦与返回保留练习筛选', async () => {
    const screen = await render(screenRoute(client));
    expect(mockGetBeatmapset).not.toHaveBeenCalled();
    expect(screen.getAllByText('歌曲 ID 3720')).toHaveLength(2);
    await finishTransition();
    await waitFor(() => expect(screen.getAllByText('鳥の詩')).toHaveLength(2));
    await fireEvent.press(screen.getByText('练习'));
    expect(screen.getAllByText('鳥の詩')).toHaveLength(1);
    expect(screen.queryByText('歌曲 ID 9999')).toBeNull();
    mockFocused = false;
    await act(() => { mockTransitions.get('transitionStart')?.({ data: { closing: true } }); });
    await screen.rerender(screenRoute(client));
    expect(screen.getByText('练习谱面 · Hard · 5.50★')).toBeVisible();
    expect(screen.queryByText('歌曲 ID 9999')).toBeNull();
    mockFocused = true;
    await screen.rerender(screenRoute(client));
    await finishTransition();
    expect(screen.getAllByText('鳥の詩')).toHaveLength(1);
    expect(screen.queryByText('歌曲 ID 9999')).toBeNull();
  });
});
