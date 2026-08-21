import { Animated } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Best50Screen } from '../app/(tabs)/b50';
import { RecordsScreen } from '../app/(tabs)/records';
import { useRecordsFilter } from '@/state/records-filter';

const mockPush = jest.fn();
let mockRecordsDxRatingState: 'live' | 'cache' | 'error' | 'loading' = 'live';
let mockActiveAccountId = 'maimai:diving-fish:demo';

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(), stop: jest.fn(), reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@/state/session-store', () => ({
  UNBOUND_ACCOUNT_ID: 'maimai:unbound',
  useSession: (selector: (state: { activeGameId: 'maimai'; activeAccountId: string }) => unknown) => selector({
    activeGameId: 'maimai',
    activeAccountId: mockActiveAccountId,
  }),
}));
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: RN.View,
    Pressable: (props: React.ComponentProps<typeof RN.Pressable>) => React.createElement(RN.Pressable, props),
    ScrollView: RN.ScrollView,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  ...(jest.requireActual('react-native-safe-area-context') as object),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
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
  const charts = [
    { id: '351', title: 'B35低', type: 'DX' as const, levelIndex: 2, difficulty: 'expert' as const, difficultyConstant: 12.4 },
    { id: '352', title: 'B35高', type: 'SD' as const, levelIndex: 3, difficulty: 'master' as const, difficultyConstant: 13.7 },
    { id: '151', title: 'B15低', type: 'SD' as const, levelIndex: 1, difficulty: 'advanced' as const, difficultyConstant: 10.2 },
    { id: '152', title: 'B15高', type: 'DX' as const, levelIndex: 4, difficulty: 'remaster' as const, difficultyConstant: 14.8 },
  ];
  return { data: {
    ...fixtures.fixtureCatalog,
    songs: [...fixtures.fixtureCatalog.songs, ...charts.map((item) => ({
      id: item.id,
      title: item.title,
      version: '舞萌DX 2026',
      charts: [{
        songId: item.id,
        type: item.type,
        levelIndex: item.levelIndex,
        difficulty: item.difficulty,
        difficultyConstant: item.difficultyConstant,
        level: String(item.difficultyConstant),
      }],
    }))],
  }, isLoading: false, isError: false, error: null };
} }));
jest.mock('@/hooks/use-dxrating-chart-tags', () => ({ useDxRatingChartTags: () => {
  if (mockRecordsDxRatingState === 'loading') {
    return { data: undefined, isLoading: true, isError: false, error: null };
  }
  if (mockRecordsDxRatingState === 'error') {
    return { data: undefined, isLoading: false, isError: true, error: new Error('offline') };
  }
  return { data: {
    tags: [
      { id: 1, name: '错位', description: '', descriptionSegments: [], color: '#7dd3fc', groupId: 1, groupName: '配置' },
      { id: 2, name: '高难', description: '', descriptionSegments: [], color: '#a5b4fc', groupId: 2, groupName: '难度' },
    ],
    relations: [
      { songTitle: 'B35低', sheetType: 'dx', sheetDifficulty: 'expert', tagId: 1 },
      { songTitle: 'B15高', sheetType: 'dx', sheetDifficulty: 'remaster', tagId: 1 },
      { songTitle: 'B15高', sheetType: 'dx', sheetDifficulty: 'remaster', tagId: 2 },
    ],
    source: {
      kind: mockRecordsDxRatingState === 'cache' ? 'cache' : 'dxrating',
      label: mockRecordsDxRatingState === 'cache' ? 'DXRating 谱面标签缓存' : 'DXRating 谱面标签',
      updatedAt: new Date(0).toISOString(),
      isStale: mockRecordsDxRatingState === 'cache',
    },
  },
  isLoading: false,
  isError: false,
  error: null,
}; } }));
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordsDxRatingState = 'live';
    mockActiveAccountId = 'maimai:diving-fish:demo';
    useRecordsFilter.getState().reset();
  });

  it('shows the unbound empty state on best and records', async () => {
    mockActiveAccountId = 'maimai:unbound';
    const best = await render(<Best50Screen />);
    expect(best.getByText('暂无绑定账号')).toBeTruthy();
    expect(best.queryByTestId('best50-results-list')).toBeNull();

    const records = await render(<RecordsScreen />);
    expect(records.getByText('暂无绑定账号')).toBeTruthy();
    expect(records.queryByTestId('records-results-list')).toBeNull();
  });

  it('renders Best35 above Best15 and sorts each section by Rating', async () => {
    const screen = await render(<Best50Screen />);
    expect(screen.getByTestId('best50-results-list').props).toEqual(expect.objectContaining({
      initialNumToRender: 8,
      maxToRenderPerBatch: 4,
      updateCellsBatchingPeriod: 50,
      windowSize: 3,
    }));
    await fireEvent.press(screen.getByLabelText('生成B50图片'));
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
    expect(screen.getByLabelText('舞萌定数范围下限 5.0')).toBeTruthy();
    expect(screen.getByLabelText('舞萌定数范围上限 14.8')).toBeTruthy();

    for (const label of ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER']) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    await act(() => useRecordsFilter.getState().setConstantMin('14.8'));
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();
    expect(screen.queryByLabelText('查看谱面 B35高 SD master')).toBeNull();
    await act(() => useRecordsFilter.getState().setConstantMax('14.8'));
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('版本筛选，当前 全部'));
    await waitFor(() => {
      expect(screen.getByLabelText('选择版本 舞萌DX 2026')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('版本名称切换为日文'));
    expect(screen.getByLabelText('版本筛选，当前 全部')).toBeTruthy();
    expect(screen.getByLabelText('选择版本 maimai でらっくす PRiSM PLUS')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('选择版本 maimai でらっくす PRiSM PLUS'));
    expect(screen.getByLabelText('版本筛选，当前 maimai でらっくす PRiSM PLUS')).toBeTruthy();
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('收起筛选'));
    expect(screen.getByLabelText(/展开筛选，当前.*PRiSM PLUS.*定数 14.8~14.8/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/展开筛选/));

    await act(() => useRecordsFilter.getState().setConstantMin('15'));
    expect(screen.getByText('当前筛选条件下没有成绩')).toBeTruthy();
  });

  it('filters records by inclusive achievement range', async () => {
    const screen = await render(<RecordsScreen />);
    await fireEvent.press(screen.getByLabelText(/展开筛选/));

    await act(() => useRecordsFilter.getState().setAchievementMin('100'));
    expect(screen.getByLabelText('查看谱面 B35高 SD master')).toBeTruthy();
    expect(screen.queryByLabelText('查看谱面 B15高 DX remaster')).toBeNull();
    expect(screen.queryByLabelText('查看谱面 B35低 DX expert')).toBeNull();

    await act(() => useRecordsFilter.getState().setAchievementMax('100.5'));
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
    expect(screen.queryByLabelText('查看谱面 B15高 DX remaster')).toBeNull();
    expect(screen.queryByLabelText('查看谱面 B35低 DX expert')).toBeNull();
    await fireEvent.press(screen.getByLabelText('收起筛选'));
    expect(screen.getByLabelText(/展开筛选，当前.*多人 FS/)).toBeTruthy();
  });

  it('filters records by every selected DXRating tag on the exact score chart', async () => {
    const screen = await render(<RecordsScreen />);
    await fireEvent.press(screen.getByLabelText(/展开筛选/));
    await fireEvent.press(screen.getByLabelText('谱面标签筛选，当前 全部'));
    await fireEvent.press(screen.getByLabelText('谱面标签 错位，未选中'));
    await fireEvent.press(screen.getByLabelText('完成谱面标签筛选'));
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();
    expect(screen.getByLabelText('查看谱面 B35低 DX expert')).toBeTruthy();
    expect(screen.queryByLabelText('查看谱面 B35高 SD master')).toBeNull();
    expect(screen.queryByLabelText('查看谱面 B15低 SD advanced')).toBeNull();

    await fireEvent.press(screen.getByLabelText('谱面标签筛选，当前 错位'));
    await fireEvent.press(screen.getByLabelText('谱面标签 高难，未选中'));
    await fireEvent.press(screen.getByLabelText('完成谱面标签筛选'));
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();
    expect(screen.queryByLabelText('查看谱面 B35低 DX expert')).toBeNull();

    await fireEvent.press(screen.getByLabelText('筛选类型 SD'));
    expect(screen.getByText('当前筛选条件下没有成绩')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('重置筛选'));
    expect(screen.getByLabelText('查看谱面 B35高 SD master')).toBeTruthy();
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();
    expect(screen.getByLabelText('谱面标签筛选，当前 全部')).toBeTruthy();
  });

  it('does not render a cached DXRating source bar and keeps records available', async () => {
    mockRecordsDxRatingState = 'cache';
    const screen = await render(<RecordsScreen />);
    expect(screen.queryByText(/DXRating 谱面标签缓存/)).toBeNull();
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();
  });

  it('keeps DXRating selections and records visible while tags are loading', async () => {
    mockRecordsDxRatingState = 'loading';
    useRecordsFilter.getState().setSelectedDxRatingTagIds([1]);
    const screen = await render(<RecordsScreen />);
    await fireEvent.press(screen.getByLabelText(/展开筛选/));
    expect(screen.getByLabelText('谱面标签筛选，加载中').props.accessibilityState)
      .toEqual(expect.objectContaining({ disabled: true }));
    expect(useRecordsFilter.getState().selectedDxRatingTagIds).toEqual([1]);
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();
    expect(screen.getByLabelText('查看谱面 B35高 SD master')).toBeTruthy();
  });

  it('disables unavailable DXRating filtering and removes stale selections', async () => {
    mockRecordsDxRatingState = 'error';
    useRecordsFilter.getState().setSelectedDxRatingTagIds([1]);
    const screen = await render(<RecordsScreen />);
    await fireEvent.press(screen.getByLabelText(/展开筛选/));
    expect(screen.getByLabelText('谱面标签筛选，不可用').props.accessibilityState)
      .toEqual(expect.objectContaining({ disabled: true }));
    expect(screen.queryByText('DXRating 标签不可用')).toBeNull();
    await waitFor(() => expect(useRecordsFilter.getState().selectedDxRatingTagIds).toEqual([]));
    expect(screen.getByLabelText('查看谱面 B35高 SD master')).toBeTruthy();
  });

  it('resets records filters from the shared filter bar', async () => {
    const screen = await render(<RecordsScreen />);
    await fireEvent.press(screen.getByLabelText(/展开筛选/));
    await act(() => {
      useRecordsFilter.getState().setConstantMin('14.8');
      useRecordsFilter.getState().setConstantMax('14.8');
    });
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();
    expect(screen.queryByLabelText('查看谱面 B35高 SD master')).toBeNull();

    await fireEvent.press(screen.getByLabelText('重置筛选'));
    expect(screen.getByLabelText('查看谱面 B35高 SD master')).toBeTruthy();
    expect(screen.getByLabelText('查看谱面 B15高 DX remaster')).toBeTruthy();
    expect(useRecordsFilter.getState().constantMin).toBe('');
    expect(useRecordsFilter.getState().constantMax).toBe('');
  });
});
