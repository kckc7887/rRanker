import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import ChunithmRatingToolScreen from '../app/tools/chunithm-rating';
import ChunithmCollectionsToolScreen from '../app/tools/chunithm-collections';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), dismissTo: jest.fn() },
}));

const source = {
  kind: 'lxns' as const,
  label: 'LXNS 中二收藏品列表',
  updatedAt: '2026-08-08T00:00:00.000Z',
  isStale: false,
};

let mockCollectionsData: { items: unknown[]; source: typeof source } | undefined;
let mockGameData: {
  data?: { payload: { kind: 'chunithm'; scores: unknown[]; source: { label: string; updatedAt: string; isStale: boolean } } };
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: ReturnType<typeof jest.fn>;
};

jest.mock('@/hooks/use-chunithm-collections', () => ({
  useChunithmCollections: () => ({
    data: mockCollectionsData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => mockGameData,
}));

jest.mock('@/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({
    data: {
      songs: [
        { id: 100, title: '曲A' },
        { id: 200, title: '曲B' },
        { id: 300, title: '曲C' },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: ({ accessibilityLabel, style, source: imageSource, ...props }: { accessibilityLabel?: string; style?: object; source?: unknown }) => (
      <RN.Image
        {...props}
        accessibilityLabel={accessibilityLabel ?? '图片'}
        source={{ uri: String(imageSource) }}
        style={style}
      />
    ),
  };
});

jest.mock('expo-linear-gradient', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LinearGradient: ({ children, style }: { children?: React.ReactNode; style?: object }) =>
      <RN.View style={style}>{children}</RN.View>,
  };
});

describe('chunithm tool screens', () => {
  beforeEach(() => {
    mockCollectionsData = undefined;
    mockGameData = {
      data: {
        payload: {
          kind: 'chunithm',
          scores: [],
          source: { label: '落雪咖啡屋', updatedAt: '2026-08-08T00:00:00.000Z', isStale: false },
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    };
    jest.clearAllMocks();
  });

  it('renders the rating calculator with default values', async () => {
    const { getByText } = await render(<ChunithmRatingToolScreen />);
    expect(getByText('单谱面评分')).toBeTruthy();
    expect(getByText(/Rating：/)).toBeTruthy();
    expect(getByText(/OVER POWER：/)).toBeTruthy();
    expect(getByText(/理论最高 OVER POWER/)).toBeTruthy();
    expect(getByText('反推最低分数')).toBeTruthy();
    expect(getByText('分数档位')).toBeTruthy();
  });

  it('switches CLEAR tier and recomputes the over power', async () => {
    const { getByText, getByLabelText } = await render(<ChunithmRatingToolScreen />);
    const ajText = getByText(/OVER POWER：/).props.children as string;
    await fireEvent.press(getByLabelText('无（无连击奖励）'));
    const noneText = getByText(/OVER POWER：/).props.children as string;
    expect(ajText).not.toBe(noneText);
  });

  it('shows input validation errors', async () => {
    const { getByText, getByLabelText } = await render(<ChunithmRatingToolScreen />);
    await fireEvent.changeText(getByLabelText('定数'), '99');
    expect(getByText('定数必须大于 0 且不超过 16。')).toBeTruthy();
  });

  it('renders collection kind tabs and the picker trigger', async () => {
    mockCollectionsData = {
      items: [
        { id: 0, name: 'NEW COMER', color: 'normal' },
        { id: 866, name: 'LUNA ROUND', description: '彩虹称号' },
      ],
      source,
    };
    const { getByText, queryByText } = await render(<ChunithmCollectionsToolScreen />);
    expect(getByText('称号')).toBeTruthy();
    expect(getByText('角色')).toBeTruthy();
    expect(queryByText('名牌版')).toBeNull();
    expect(queryByText('地图头像')).toBeNull();
    expect(getByText('当前收藏品')).toBeTruthy();
    expect(getByText('请选择')).toBeTruthy();
  });

  it('opens the picker and searches collection items by name', async () => {
    mockCollectionsData = {
      items: [
        { id: 0, name: 'NEW COMER', required: [{ difficulties: [0], songs: [{ id: 1, title: '曲1' }] }] },
        { id: 866, name: 'LUNA ROUND', required: [{ difficulties: [3], songs: [{ id: 100, title: '曲A' }] }] },
      ],
      source,
    };
    const { getByText, queryByText, getByLabelText, getByTestId } = await render(<ChunithmCollectionsToolScreen />);
    await fireEvent.press(getByLabelText('选择收藏品'));
    expect(getByText('NEW COMER')).toBeTruthy();
    expect(getByText('LUNA ROUND')).toBeTruthy();
    await fireEvent.changeText(getByLabelText('搜索收藏品名称或描述'), 'LUNA');
    expect(queryByText('NEW COMER')).toBeNull();
    expect(getByText('LUNA ROUND')).toBeTruthy();
    expect(getByTestId('chunithm-collection-picker-list')).toBeTruthy();
  });

  it('filters out collections without computable conditions', async () => {
    mockCollectionsData = {
      items: [
        { id: 0, name: 'NEW COMER', color: 'normal' },
        {
          id: 866,
          name: 'LUNA ROUND',
          required: [{ difficulties: [3], rank: 's', songs: [{ id: 100, title: '曲A' }] }],
        },
      ],
      source,
    };
    const { getByText, queryByText, getByLabelText } = await render(<ChunithmCollectionsToolScreen />);
    await fireEvent.press(getByLabelText('选择收藏品'));
    expect(queryByText('NEW COMER')).toBeNull();
    expect(getByText('LUNA ROUND')).toBeTruthy();
  });

  it('renders selected collection progress from the local score snapshot', async () => {
    mockCollectionsData = {
      items: [
        {
          id: 866,
          name: 'LUNA ROUND',
          required: [{ difficulties: [3], rank: 's', songs: [{ id: 100, title: '曲A' }] }],
        },
      ],
      source,
    };
    mockGameData = {
      data: {
        payload: {
          kind: 'chunithm',
          scores: [
            { id: 100, level_index: 3, score: 1_009_000, rank: 'sssp', clear: 'clear' },
          ],
          source: { label: '落雪咖啡屋', updatedAt: '2026-08-08T00:00:00.000Z', isStale: false },
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    };
    const { getByText, getByLabelText } = await render(<ChunithmCollectionsToolScreen />);
    await fireEvent.press(getByLabelText('选择收藏品'));
    await fireEvent.press(getByLabelText('选择 LUNA ROUND'));
    expect(getByText('100.0%')).toBeTruthy();
    expect(getByText('1 / 1')).toBeTruthy();
    expect(getByText('全部完成')).toBeTruthy();
  });

  it('lists missing songs when the snapshot does not meet the requirements', async () => {
    mockCollectionsData = {
      items: [
        {
          id: 866,
          name: 'LUNA ROUND',
          required: [{ difficulties: [3], rank: 'sss', songs: [{ id: 100, title: '曲A' }] }],
        },
      ],
      source,
    };
    mockGameData = {
      data: {
        payload: {
          kind: 'chunithm',
          scores: [
            { id: 100, level_index: 3, score: 990_000, rank: 's', clear: 'clear' },
          ],
          source: { label: '落雪咖啡屋', updatedAt: '2026-08-08T00:00:00.000Z', isStale: false },
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    };
    const { getByText, getAllByText, getByLabelText } = await render(<ChunithmCollectionsToolScreen />);
    await fireEvent.press(getByLabelText('选择收藏品'));
    await fireEvent.press(getByLabelText('选择 LUNA ROUND'));
    expect(getByText('0.0%')).toBeTruthy();
    expect(getByText(/缺失曲目/)).toBeTruthy();
    expect(getByText('#100')).toBeTruthy();
    expect(getByText('曲A')).toBeTruthy();
    expect(getAllByText('MASTER').length).toBeGreaterThan(0);
  });

  it('renders the trophy color as a badge instead of a raw enum', async () => {
    mockCollectionsData = {
      items: [
        {
          id: 866,
          name: 'LUNA ROUND',
          color: 'rainbow',
          required: [{ difficulties: [3], songs: [{ id: 100, title: '曲A' }] }],
        },
      ],
      source,
    };
    const { getByText, getAllByText, queryByText, getByLabelText } = await render(<ChunithmCollectionsToolScreen />);
    await fireEvent.press(getByLabelText('选择收藏品'));
    await fireEvent.press(getByLabelText('选择 LUNA ROUND'));
    expect(queryByText(/颜色/)).toBeNull();
    expect(getAllByText('LUNA ROUND').length).toBeGreaterThan(0);
    expect(getByText('0.0%')).toBeTruthy();
  });

  it('excludes plate and icon kinds from the tool tabs', async () => {
    mockCollectionsData = { items: [], source };
    const { queryByText, queryByLabelText } = await render(<ChunithmCollectionsToolScreen />);
    expect(queryByText('名牌版')).toBeNull();
    expect(queryByText('地图头像')).toBeNull();
    expect(queryByLabelText('收藏品类型 名牌版')).toBeNull();
    expect(queryByLabelText('收藏品类型 地图头像')).toBeNull();
  });
});
