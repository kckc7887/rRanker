import { Animated } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Best50Screen } from '../app/(tabs)/b50';
import { RecordsScreen } from '../app/(tabs)/records';
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
    difficulty: 'expert' as const, difficultyConstant: 12.4, achievements: 99, rating: 100, rate: 'ss', fs: null };
  const b35High = { ...base, songId: '352', title: 'B35高', type: 'SD' as const, levelIndex: 3,
    difficulty: 'master' as const, difficultyConstant: 13.7, achievements: 100.5, rating: 300, rate: 'sssp', fs: 'fs' };
  const b15Low = { ...base, songId: '151', title: 'B15低', type: 'SD' as const, levelIndex: 1,
    difficulty: 'advanced' as const, difficultyConstant: 10.2, achievements: 99.5, rating: 200, rate: 'ssp', fs: 'fs' };
  const b15High = { ...base, songId: '152', title: 'B15高', type: 'DX' as const, levelIndex: 4,
    difficulty: 'remaster' as const, difficultyConstant: 14.8, achievements: 99.9999, rating: 400, rate: 'sss',
    version: '舞萌DX 2026', fs: 'fsdp' };
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
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => {
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  return { data: fixtures.fixtureCatalog, isLoading: false, isError: false, error: null };
} }));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => {
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  const profile = jest.requireActual<typeof import('../src/domain/game-profile')>('../src/domain/game-profile')
    .getGameProfile('maimai');
  const base = fixtures.fixtureRecords[0];
  const b35Low = { ...base, songId: '351', title: 'B35低', type: 'DX' as const, levelIndex: 2,
    difficulty: 'expert' as const, difficultyConstant: 12.4, achievements: 99, rating: 100, rate: 'ss', fs: null };
  const b35High = { ...base, songId: '352', title: 'B35高', type: 'SD' as const, levelIndex: 3,
    difficulty: 'master' as const, difficultyConstant: 13.7, achievements: 100.5, rating: 300, rate: 'sssp', fs: 'fs' };
  const b15Low = { ...base, songId: '151', title: 'B15低', type: 'SD' as const, levelIndex: 1,
    difficulty: 'advanced' as const, difficultyConstant: 10.2, achievements: 99.5, rating: 200, rate: 'ssp', fs: 'fs' };
  const b15High = { ...base, songId: '152', title: 'B15高', type: 'DX' as const, levelIndex: 4,
    difficulty: 'remaster' as const, difficultyConstant: 14.8, achievements: 99.9999, rating: 400, rate: 'sss',
    version: '舞萌DX 2026', fs: 'fsdp' };
  return {
    data: {
      gameId: 'maimai',
      providerId: 'diving-fish',
      profile,
      payload: {
        kind: 'maimai',
        player: fixtures.fixturePlayer,
        playerScore: { label: profile.ratingLabel, value: fixtures.fixturePlayer.rating },
        bestSections: [
          { id: 'b35', title: profile.bestSections[0].title, records: [b35Low, b35High] },
          { id: 'b15', title: profile.bestSections[1].title, records: [b15Low, b15High] },
        ],
        recordCount: 4,
        source: fixtures.fixtureSource,
        catalogSource: fixtures.fixtureSource,
        unmatchedRecordCount: 0,
      },
    },
    isLoading: false, isError: false, isDataStale: false, error: null, refetch: jest.fn(),
    profile,
    activeGameId: 'maimai',
    activeProviderId: 'diving-fish',
    activeAccountId: 'maimai:diving-fish:demo',
  };
} }));

describe('M4 score list cards', () => {
  beforeEach(() => { jest.clearAllMocks(); useRecordsFilter.getState().reset(); });

  it('renders Best35 above Best15 and sorts each section by Rating', async () => {
    const screen = await render(<Best50Screen />);
    expect(screen.getByTestId('best50-results-list').props).toEqual(expect.objectContaining({
      initialNumToRender: 8,
      maxToRenderPerBatch: 4,
      updateCellsBatchingPeriod: 50,
      windowSize: 3,
    }));
    await fireEvent.press(screen.getByLabelText('生成成绩图片'));
    expect(mockPush).toHaveBeenCalledWith('/best-image');
    expect(screen.getByText('过往版本 Best35')).toBeTruthy();
    expect(screen.getByText('当前版本 Best15')).toBeTruthy();
    expect(screen.getByText('MASTER (13.7)')).toBeTruthy();
    const labels = screen.getAllByLabelText(/^查看谱面/).map((node) => node.props.accessibilityLabel);
    expect(labels).toEqual([
      '查看谱面 B35高 SD master', '查看谱面 B35低 DX expert',
      '查看谱面 B15高 DX remaster', '查看谱面 B15低 SD advanced',
    ]);
    const collectText = (node: unknown): string[] => {
      if (typeof node === 'string' || typeof node === 'number') return [String(node)];
      if (!node || typeof node !== 'object' || !('children' in node)) return [];
      return (node as { children: unknown[] }).children.flatMap(collectText);
    };
    const badgeTexts = collectText(screen.getByTestId('score-card-badges-152'));
    expect(badgeTexts.slice(0, 3)).toEqual(['Re:MASTER (14.8)', 'DX', '寸']);

    await fireEvent.press(screen.getByLabelText('查看谱面 B35高 SD master'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: '352', chartType: 'SD', levelIndex: '3' },
    });
  });

  it('always sorts filtered records by Rating and opens the exact chart', async () => {
    useRecordsFilter.getState().setSortBy('title');
    const screen = await render(<RecordsScreen />);
    expect(screen.getByTestId('records-results-list').props).toEqual(expect.objectContaining({
      contentInsetAdjustmentBehavior: 'automatic',
      initialNumToRender: 8,
      maxToRenderPerBatch: 4,
      updateCellsBatchingPeriod: 50,
      windowSize: 3,
    }));
    expect(screen.queryByText('排序')).toBeNull();
    expect(screen.getByLabelText('成绩搜索')).toBeTruthy();
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

  it('filters records by inclusive constants and localizes the expandable version picker', async () => {
    const screen = await render(<RecordsScreen />);
    await fireEvent.press(screen.getByLabelText(/展开筛选/));

    for (const label of ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER']) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    await fireEvent.changeText(screen.getByLabelText('最低定数'), '14.8');
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();
    expect(screen.queryByLabelText('查看谱面 B35高 SD master')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('最高定数'), '14.8');
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('版本筛选，当前 全部'));
    await waitFor(() => {
      expect(screen.getByLabelText('选择版本 舞萌DX 2026')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('选择版本 舞萌DX 2026'));
    await fireEvent.press(screen.getByLabelText('版本名称切换为日文'));
    expect(screen.getByLabelText('版本筛选，当前 maimai でらっくす PRiSM PLUS')).toBeTruthy();
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('收起筛选'));
    expect(screen.getByLabelText(/展开筛选，当前.*PRiSM PLUS.*定数 14.8~14.8/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/展开筛选/));

    await fireEvent.changeText(screen.getByLabelText('最低定数'), '15');
    expect(screen.getByText('当前筛选条件下没有成绩')).toBeTruthy();
  });

  it('filters records by inclusive achievement range', async () => {
    const screen = await render(<RecordsScreen />);
    await fireEvent.press(screen.getByLabelText(/展开筛选/));

    await fireEvent.changeText(screen.getByLabelText('最低达成率'), '100');
    expect(screen.getByLabelText('查看谱面 B35高 SD master')).toBeTruthy();
    expect(screen.queryByLabelText('查看谱面 B15高 DX remaster')).toBeNull();
    expect(screen.queryByLabelText('查看谱面 B35低 DX expert')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('最高达成率'), '100.5');
    expect(screen.getByLabelText('查看谱面 B35高 SD master')).toBeTruthy();
    expect(screen.queryByLabelText('查看谱面 B15高 DX remaster')).toBeNull();
  });

  it('filters records by solo and multi achievements independently', async () => {
    const screen = await render(<RecordsScreen />);
    await fireEvent.press(screen.getByLabelText(/展开筛选/));
    await fireEvent.press(screen.getByLabelText('多人成就筛选，当前 全部'));
    await waitFor(() => {
      expect(screen.getByLabelText('选择多人成就 FS')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('选择多人成就 FS'));
    expect(screen.getByLabelText('查看谱面 B35高 SD master')).toBeTruthy();
    expect(screen.getByLabelText('查看谱面 B15低 SD advanced')).toBeTruthy();
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();
    expect(screen.queryByLabelText('查看谱面 B35低 DX expert')).toBeNull();
    await fireEvent.press(screen.getByLabelText('收起筛选'));
    expect(screen.getByLabelText(/展开筛选，当前.*多人 FS/)).toBeTruthy();
  });
});
