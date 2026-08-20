import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { OsuBeatmapsetDetail } from '@/domain/osu';
import UserLibraryScreen from '../app/library/index';

const mockPush = jest.fn();
const mockUseBeatmapsets = jest.fn();

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
}));
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: ({ source, ...props }: { source?: unknown }) => (
      <RN.Image {...props} source={{ uri: String(source) }} />
    ),
  };
});
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: 'osu-standard' }) => unknown) => (
    selector({ activeGameId: 'osu-standard' })
  ),
}));
jest.mock('@/hooks/use-osu-beatmapsets-by-ids', () => ({
  useOsuBeatmapsetsByIds: (...args: unknown[]) => mockUseBeatmapsets(...args),
}));
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseBeatmapsets.mockReturnValue({ data: new Map([['3720', beatmapset]]) });
  });

  it('按当前模式补齐真实歌曲与谱面信息，并保留失败 ID 占位', async () => {
    const screen = await render(<UserLibraryScreen />);

    expect(mockUseBeatmapsets).toHaveBeenCalledWith('osu-standard', ['3720', '9999']);
    expect(screen.getAllByText('鳥の詩')).toHaveLength(2);
    expect(screen.getByText('练习谱面 · Hard · 5.50★')).toBeTruthy();
    expect(screen.getByText('歌曲 ID 9999')).toBeTruthy();
    expect(screen.getByText('曲库暂不可用，个人数据已保留')).toBeTruthy();
    expect(screen.getAllByLabelText('曲绘')[0]?.props.source.uri).toBe(beatmapset.cover);

    await fireEvent.press(screen.getByText('练习谱面 · Hard · 5.50★'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '3720', levelIndex: '22423' },
    });
  });
});
