import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import UserLibraryScreen from '../app/library/index';

const mockPush = jest.fn();
const mockSong = {
  id: 3,
  title: 'B.B.K.K.B.K.K.',
  artist: 'nora2r',
  genre: '其他游戏',
  bpm: 170,
  versionId: 23000,
  versionTitle: 'CHUNITHM VERSE',
  locked: false,
  disabled: false,
  difficulties: [{
    difficulty: 3 as const,
    level: '12+',
    levelValue: 12.5,
    noteDesigner: 'Master Designer',
    versionId: 23000,
    versionTitle: 'CHUNITHM VERSE',
  }],
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
  useSession: (selector: (state: { activeGameId: 'chunithm' }) => unknown) => (
    selector({ activeGameId: 'chunithm' })
  ),
}));
jest.mock('@/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({
    data: { songs: [mockSong] },
  }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({ data: undefined }),
}));
jest.mock('@/hooks/use-phigros-catalog', () => ({
  usePhigrosCatalog: () => ({ data: undefined }),
}));
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({
    data: [
      {
        key: 'song:chunithm:3',
        gameId: 'chunithm',
        kind: 'song',
        songId: '3',
        favorite: true,
        tags: [],
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T00:00:00.000Z',
      },
      {
        key: 'chart:chunithm:3:SD:3',
        gameId: 'chunithm',
        kind: 'chart',
        songId: '3',
        type: 'SD',
        levelIndex: 3,
        practice: true,
        tags: ['爆发'],
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T00:00:00.000Z',
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    accent: '#246BFD',
    background: '#F7F8FA',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF2F7',
    text: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#6B7280',
    danger: '#B42318',
  }),
}));

describe('Chunithm personal library', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows favorites and practice charts without an SD label and opens exact difficulty', async () => {
    const screen = await render(<UserLibraryScreen />);
    expect(screen.getAllByText('B.B.K.K.B.K.K.')).toHaveLength(2);
    expect(screen.getByText('已收藏歌曲')).toBeTruthy();
    expect(screen.getByText('练习谱面 · MASTER')).toBeTruthy();
    expect(screen.queryByText(/SD MASTER/)).toBeNull();
    expect(screen.getAllByLabelText('曲绘')[0]?.props.source.uri)
      .toBe('https://assets2.lxns.net/chunithm/jacket/3.png');

    await fireEvent.press(screen.getByText('练习谱面 · MASTER'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '3', levelIndex: '3' },
    });
  });
});
