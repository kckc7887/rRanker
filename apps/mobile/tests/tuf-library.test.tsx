import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { TufLevel } from '@/domain/tuf';
import type { UserLibraryItem } from '@/domain/user-library';
import { TufLevelDetailScreen } from '@/screens/TufScreens';

const mockSetFavorite = jest.fn(async () => []);
const mockSetTags = jest.fn(async () => []);
const mockSetTagPresets = jest.fn(async () => []);
let mockLibraryItems: UserLibraryItem[] = [];

const level = {
  id: 11372, songId: 401, song: '关卡 A', artist: '艺术家 A', diffId: 8, baseScore: 12.34,
  bpm: null, tilecount: 421, autoTileCount: null, levelLengthInMs: null,
  difficulty: { id: 8, name: 'G12', type: 'SPECIAL', sortOrder: 12, baseScore: 12.34 },
  levelCredits: [], tags: [], curations: [],
} as TufLevel;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
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
  useTufLevel: () => ({
    data: { level, rerateHistory: [] }, isLoading: false, isError: false, error: null,
    refetch: jest.fn(),
  }),
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
});
