import { Animated } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import Best50Screen from '../app/(tabs)/b50';
import RecordsScreen from '../app/(tabs)/records';
import { useRecordsFilter } from '@/state/records-filter';

const mockPush = jest.fn();

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(), stop: jest.fn(), reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-score-snapshot', () => ({ useScoreSnapshot: () => {
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  const base = fixtures.fixtureRecords[0];
  const b35Low = { ...base, songId: '351', title: 'B35低', type: 'DX' as const, levelIndex: 2,
    difficulty: 'expert' as const, difficultyConstant: 12.4, achievements: 99, rating: 100, rate: 'ss' };
  const b35High = { ...base, songId: '352', title: 'B35高', type: 'SD' as const, levelIndex: 3,
    difficulty: 'master' as const, difficultyConstant: 13.7, achievements: 100.5, rating: 300, rate: 'sssp' };
  const b15Low = { ...base, songId: '151', title: 'B15低', type: 'SD' as const, levelIndex: 1,
    difficulty: 'advanced' as const, difficultyConstant: 10.2, achievements: 99.5, rating: 200, rate: 'ssp' };
  const b15High = { ...base, songId: '152', title: 'B15高', type: 'DX' as const, levelIndex: 4,
    difficulty: 'remaster' as const, difficultyConstant: 14.8, achievements: 99.9999, rating: 400, rate: 'sss' };
  return {
    data: {
      player: fixtures.fixturePlayer,
      records: [b35Low, b15Low, b35High, b15High],
      source: fixtures.fixtureSource,
      catalogSource: fixtures.fixtureSource,
      best50: {
        player: fixtures.fixturePlayer, currentVersion: fixtures.fixtureCatalog.currentVersion,
        b35: [b35Low, b35High], b15: [b15Low, b15High], unmatchedRecordCount: 0,
        rating: 1000, generatedAt: '2026-07-14T00:00:00.000Z', source: fixtures.fixtureSource,
      },
    },
    isLoading: false, isError: false, isDataStale: false, error: null, refetch: jest.fn(),
  };
} }));

describe('M4 score list cards', () => {
  beforeEach(() => { jest.clearAllMocks(); useRecordsFilter.getState().reset(); });

  it('renders Best35 above Best15 and sorts each section by Rating', async () => {
    const screen = await render(<Best50Screen />);
    expect(screen.getByText('过往版本 Best35')).toBeTruthy();
    expect(screen.getByText('当前版本 Best15')).toBeTruthy();
    expect(screen.getByText('MASTER (13.7)')).toBeTruthy();
    const labels = screen.getAllByLabelText(/^查看谱面/).map((node) => node.props.accessibilityLabel);
    expect(labels).toEqual([
      '查看谱面 B35高 SD master', '查看谱面 B35低 DX expert',
      '查看谱面 B15高 DX remaster', '查看谱面 B15低 SD advanced',
    ]);

    await fireEvent.press(screen.getByLabelText('查看谱面 B35高 SD master'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '352', chartType: 'SD', levelIndex: '3' },
    });
  });

  it('always sorts filtered records by Rating and opens the exact chart', async () => {
    useRecordsFilter.getState().setSortBy('title');
    const screen = await render(<RecordsScreen />);
    expect(screen.queryByText('排序')).toBeNull();
    const labels = screen.getAllByLabelText(/^查看谱面/).map((node) => node.props.accessibilityLabel);
    expect(labels).toEqual([
      '查看谱面 B15高 DX remaster', '查看谱面 B35高 SD master',
      '查看谱面 B15低 SD advanced', '查看谱面 B35低 DX expert',
    ]);

    await fireEvent.press(screen.getByLabelText('查看谱面 B15高 DX remaster'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '152', chartType: 'DX', levelIndex: '4' },
    });
  });
});
