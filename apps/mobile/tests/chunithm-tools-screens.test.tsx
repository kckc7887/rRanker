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

let mockSessionMode: string | null = null;
let mockCollectionsData: { items: unknown[]; source: typeof source } | undefined;
let mockProgressData: unknown;

jest.mock('@/hooks/use-chunithm-collections', () => ({
  useChunithmCollections: () => ({
    data: mockCollectionsData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
  useChunithmCollectionProgress: () => ({
    data: mockProgressData,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { session: { mode: string } | null }) => unknown) => selector({
    session: mockSessionMode === 'lxns-oauth' ? { mode: 'lxns-oauth' } : null,
  }),
}));

describe('chunithm tool screens', () => {
  beforeEach(() => {
    mockSessionMode = null;
    mockCollectionsData = undefined;
    mockProgressData = undefined;
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
    const { getByText } = await render(<ChunithmCollectionsToolScreen />);
    expect(getByText('称号')).toBeTruthy();
    expect(getByText('角色')).toBeTruthy();
    expect(getByText('名牌版')).toBeTruthy();
    expect(getByText('地图头像')).toBeTruthy();
    expect(getByText('当前收藏品')).toBeTruthy();
    expect(getByText('请选择')).toBeTruthy();
  });

  it('shows the login hint without a bound Lxns account', async () => {
    mockCollectionsData = { items: [], source };
    const { getByText } = await render(<ChunithmCollectionsToolScreen />);
    expect(getByText(/未绑定落雪账号/)).toBeTruthy();
  });

  it('shows the connected hint with a bound Lxns account', async () => {
    mockCollectionsData = { items: [], source };
    mockSessionMode = 'lxns-oauth';
    const { getByText } = await render(<ChunithmCollectionsToolScreen />);
    expect(getByText(/已连接落雪账号/)).toBeTruthy();
  });

  it('opens the picker and searches collection items by name', async () => {
    mockCollectionsData = {
      items: [
        { id: 0, name: 'NEW COMER' },
        { id: 866, name: 'LUNA ROUND' },
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

  it('renders selected collection progress detail', async () => {
    mockCollectionsData = {
      items: [
        {
          id: 866,
          name: 'LUNA ROUND',
          required: [{
            difficulties: [3],
            rank: 's',
            songs: [{ id: 100, title: '曲A', completed: true }],
            completed: false,
          }],
        },
      ],
      source,
    };
    mockProgressData = {
      collection: {
        id: 866,
        name: 'LUNA ROUND',
        required: [{
          difficulties: [3],
          rank: 's',
          songs: [{ id: 100, title: '曲A', completed: true }],
          completed: true,
        }],
      },
      source,
    };
    const { getByText, getByLabelText } = await render(<ChunithmCollectionsToolScreen />);
    await fireEvent.press(getByLabelText('选择收藏品'));
    await fireEvent.press(getByLabelText('选择 LUNA ROUND'));
    expect(getByText('100.0%')).toBeTruthy();
    expect(getByText('条件组 1/1')).toBeTruthy();
    expect(getByText('已完成')).toBeTruthy();
    expect(getByText('曲A')).toBeTruthy();
  });
});
