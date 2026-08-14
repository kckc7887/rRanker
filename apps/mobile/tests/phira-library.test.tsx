import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import UserLibraryScreen from '../app/library/index';
import type { UserLibraryItem } from '@/domain/user-library';

const mockPush = jest.fn();
let mockLibraryItems: UserLibraryItem[] = [];
let mockCharts: { id: number; name: string; illustration: string | null }[] = [];

const timestamp = '2026-08-15T00:00:00.000Z';
const phiraFavorite: UserLibraryItem = {
  key: 'song:phira:66661', gameId: 'phira', kind: 'song', songId: '66661', favorite: true,
  tags: ['交互'], createdAt: timestamp, updatedAt: timestamp,
};

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: ({ source: imageSource, ...props }: { source?: unknown }) => (
      <RN.Image {...props} source={{ uri: String(imageSource) }} />
    ),
  };
});
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: 'phira' }) => unknown) => (
    selector({ activeGameId: 'phira' })
  ),
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    accent: '#8D5BD6', background: '#F7F8FA', surface: '#FFF', surfaceMuted: '#EEF2F7',
    border: '#DDD', text: '#111', textSecondary: '#4B5563', textMuted: '#666', danger: '#B42318',
  }),
}));
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({
    data: mockLibraryItems, isLoading: false, isError: false, isUpdating: false,
    refetch: jest.fn(), tagPresets: [], setSongFavorite: jest.fn(),
    setChartPractice: jest.fn(), setTags: jest.fn(), setTagPresets: jest.fn(),
    songKey: (songId: string | number) => `song:phira:${songId}`,
  }),
}));
jest.mock('@/hooks/use-phira', () => ({
  usePhiraChartsByIds: () => ({ data: mockCharts, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));

describe('Phira personal library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLibraryItems = [];
    mockCharts = [];
  });

  it('shows favorited phira charts by name instead of the catalog-unavailable placeholder', async () => {
    mockLibraryItems = [phiraFavorite];
    mockCharts = [{ id: 66661, name: 'Help me, ERINNNNNN!!', illustration: 'https://example.com/cover.png' }];
    const screen = await render(<UserLibraryScreen />);
    expect(screen.getByText('Help me, ERINNNNNN!!')).toBeTruthy();
    expect(screen.getByText('已收藏歌曲')).toBeTruthy();
    expect(screen.getAllByText('交互').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/曲库暂不可用/)).toBeNull();
    expect(screen.getAllByLabelText('曲绘')[0]?.props.source.uri).toBe('https://example.com/cover.png');
  });

  it('opens the phira song detail with the full chart id', async () => {
    mockLibraryItems = [phiraFavorite];
    mockCharts = [{ id: 66661, name: 'Help me, ERINNNNNN!!', illustration: null }];
    const screen = await render(<UserLibraryScreen />);
    await fireEvent.press(screen.getByText('Help me, ERINNNNNN!!'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '66661' },
    });
  });

  it('keeps the id placeholder when the chart lookup misses the favorite', async () => {
    mockLibraryItems = [phiraFavorite];
    const screen = await render(<UserLibraryScreen />);
    expect(screen.getByText('歌曲 ID 66661')).toBeTruthy();
    expect(screen.getByText(/个人数据已保留/)).toBeTruthy();
  });
});
