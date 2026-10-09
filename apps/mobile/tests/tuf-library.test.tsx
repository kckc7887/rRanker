import { fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import type { TufLevel } from '@/domain/tuf';
import type { UserLibraryItem } from '@/domain/user-library';
import { TufLevelDetailScreen } from '@/screens/TufScreens';
import UserLibraryScreen from '../app/library';

const mockSetFavorite = jest.fn(async () => []);
const mockSetTags = jest.fn(async () => []);
const mockSetTagPresets = jest.fn(async () => []);
let mockLibraryItems: UserLibraryItem[] = [];
const mockGetLevel = jest.fn<typeof import('@/providers/tuf-provider').tufProvider.getLevel>();
const mockSearchLevels = jest.fn<typeof import('@/providers/tuf-provider').tufProvider.searchLevels>();
const mockForeground = new AbortController();

const level = {
  id: 11372, songId: 401, song: '关卡 A', artist: '艺术家 A', diffId: 8, baseScore: 12.34,
  bpm: null, tilecount: 421, autoTileCount: null, levelLengthInMs: null,
  difficulty: { id: 8, name: 'G12', type: 'SPECIAL', sortOrder: 12, baseScore: 12.34 },
  levelCredits: [], tags: [], curations: [],
} as TufLevel;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/providers/tuf-provider', () => ({ tufProvider: {
  getLevel: (...args: Parameters<typeof mockGetLevel>) => mockGetLevel(...args),
  searchLevels: (...args: Parameters<typeof mockSearchLevels>) => mockSearchLevels(...args),
} }));
jest.mock('@/state/app-lifecycle', () => ({
  useAppLifecycle: () => ({ foregroundReady: true, foregroundGeneration: 1 }),
  getForegroundAbortSignal: () => mockForeground.signal,
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: RN.View,
    Pressable: (props: React.ComponentProps<typeof RN.Pressable>) => React.createElement(
      RN.Pressable,
      { ...props, testID: props.testID ?? 'gesture-handler-pressable' },
    ),
  };
});
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    accent: '#F15B55', accentSoft: '#FDE8E7', background: '#F7F8FA', surface: '#FFF',
    surfaceMuted: '#EEF2F7', border: '#DDD', text: '#111', textSecondary: '#4B5563',
    textMuted: '#666', danger: '#B42318', input: '#FFF',
  }),
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: unknown) => unknown) => selector({
    activeAccountId: 'adofai:tuf:25', activeGameId: 'adofai',
  }),
}));
jest.mock('@/hooks/use-tuf', () => ({
  ...jest.requireActual<typeof import('@/hooks/use-tuf')>('@/hooks/use-tuf'),
  useTufLevel: () => ({
    data: { level, rerateHistory: [] }, isLoading: false, isError: false, error: null,
    refetch: jest.fn(),
  }),
  useTufLevelBestPass: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
  useTufVideoDetails: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({
    data: mockLibraryItems,
    isLoading: false,
    isError: false,
    isUpdating: false,
    songKey: (songId: string | number) => `song:adofai:${songId}`,
    chartKey: (songId: string | number) => `chart:adofai:${songId}`,
    setSongFavorite: mockSetFavorite,
    setChartPractice: jest.fn(async () => []),
    setTags: mockSetTags,
    setTagPresets: mockSetTagPresets,
    tagPresets: ['爆发', '交互'],
    refetch: jest.fn(),
  }),
}));

describe('ADOFAI personal library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLibraryItems = [];
    mockGetLevel.mockReset();
    mockSearchLevels.mockReset();
  });

  it('toggles song favorite from the detail header', async () => {
    const screen = await render(<TufLevelDetailScreen levelId="11372" />);
    const toggle = screen.getByLabelText('收藏 关卡 A');
    await fireEvent.press(toggle);
    expect(mockSetFavorite).toHaveBeenCalledWith('11372', true);
  });

  it('shows an active favorite and untoggles it', async () => {
    mockLibraryItems = [{
      key: 'song:adofai:11372', gameId: 'adofai', kind: 'song', songId: '11372', favorite: true,
      tags: [], createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
    }];
    const screen = await render(<TufLevelDetailScreen levelId="11372" />);
    await fireEvent.press(screen.getByLabelText('取消收藏 关卡 A'));
    expect(mockSetFavorite).toHaveBeenCalledWith('11372', false);
  });

  it('edits song-level tags through the shared TagEditor', async () => {
    mockLibraryItems = [{
      key: 'song:adofai:11372', gameId: 'adofai', kind: 'song', songId: '11372', favorite: false,
      tags: [], createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
    }];
    const screen = await render(<TufLevelDetailScreen levelId="11372" />);
    await fireEvent.changeText(screen.getByLabelText('新标签'), '练习谱');
    await fireEvent.press(screen.getByLabelText('添加标签'));
    await waitFor(() => expect(mockSetTags).toHaveBeenCalledWith(
      { kind: 'song', songId: '11372' },
      ['练习谱'],
    ));
  });

  it('never exposes chart-level practice actions', async () => {
    const screen = await render(<TufLevelDetailScreen levelId="11372" />);
    expect(screen.queryByText(/加入练习清单/)).toBeNull();
    expect(screen.queryByTestId(/maimai-chart-local-tags/)).toBeNull();
  });

  it('loads saved levels outside the recent catalog and retains a favorite whose detail fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockLibraryItems = [987654, 765432].map((id) => ({
      key: `song:adofai:${id}`, gameId: 'adofai', kind: 'song', songId: String(id), favorite: true,
      tags: [], createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
    }));
    mockSearchLevels.mockResolvedValue({ results: [level], total: 1, offset: 0, limit: 30, hasMore: false });
    mockGetLevel.mockImplementation(async (id) => {
      if (id === 765432) throw new Error('详情暂不可用');
      return { level: { ...level, id, song: '较早收藏的关卡' }, rerateHistory: [] };
    });
    const screen = await render(<QueryClientProvider client={client}><UserLibraryScreen /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('较早收藏的关卡')).toBeTruthy());
    await waitFor(() => expect(client.getQueryState(['tuf', 'level', 765432])?.status).toBe('error'));
    expect(screen.getByText('歌曲 ID 765432')).toBeTruthy();
    expect(screen.getByText('曲库暂不可用，个人数据已保留')).toBeTruthy();
    expect(screen.getAllByText('已收藏歌曲')).toHaveLength(2);
    expect(mockSetFavorite).not.toHaveBeenCalled();
    await screen.unmount();
    client.clear();
  });

  it('reuses a level loaded by the detail hook when opening the personal library', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { useTufLevel } = jest.requireActual<typeof import('@/hooks/use-tuf')>('@/hooks/use-tuf');
    mockGetLevel.mockResolvedValue({ level, rerateHistory: [] });
    mockLibraryItems = [{
      key: `song:adofai:${level.id}`, gameId: 'adofai', kind: 'song', songId: String(level.id), favorite: true,
      tags: [], createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
    }];
    const detail = await renderHook(() => useTufLevel(level.id), { wrapper });
    await waitFor(() => expect(detail.result.current.data?.level.song).toBe('关卡 A'));
    await detail.unmount();
    const screen = await render(<UserLibraryScreen />, { wrapper });
    await waitFor(() => expect(screen.getByText('关卡 A')).toBeTruthy());
    expect(mockGetLevel).toHaveBeenCalledTimes(1);
    await screen.unmount();
    client.clear();
  });
});
