import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { MaimaiFilterBar } from '@/components/MaimaiFilterBar';
import { DxRatingTagFilterRow } from '@/components/maimai/DxRatingTagFilterRow';
import type { DxRatingChartTag } from '@/domain/dxrating-chart-tags';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const tags: DxRatingChartTag[] = [
  {
    id: 1,
    name: '标签1',
    description: '',
    descriptionSegments: [],
    color: '#7dd3fc',
    groupId: 1,
    groupName: '分组一',
  },
  {
    id: 2,
    name: '标签2',
    description: '',
    descriptionSegments: [],
    color: '#a5b4fc',
    groupId: 1,
    groupName: '分组一',
  },
];

const noop = () => {};

const filterBarProps = {
  collapsed: false,
  difficulty: 'master' as const,
  version: 'all' as const,
  type: 'all' as const,
  constantMin: '',
  constantMax: '',
  versionLocale: 'china' as const,
  versions: [],
  dxRatingTags: tags,
  selectedDxRatingTagIds: [],
  onCollapsedChange: noop,
  onDifficultyChange: noop,
  onVersionChange: noop,
  onTypeChange: noop,
  onConstantMinChange: noop,
  onConstantMaxChange: noop,
  onVersionLocaleChange: noop,
  onReset: noop,
};

describe('舞萌谱面标签筛选入口', () => {
  it('入口行由舞萌模块提供', async () => {
    const row = await render(<DxRatingTagFilterRow
      visible={false} tags={tags} selectedTagIds={[]} state="ready" value="全部"
      onApply={noop} onOpen={noop} onClose={noop}
    />);
    expect(row.getByLabelText('谱面标签筛选，当前 全部')).toBeTruthy();
  });

  it('共享筛选条经注入的入口打开弹层并提交选择', async () => {
    const onDxRatingTagIdsChange = jest.fn();
    const screen = await render(<MaimaiFilterBar
      {...filterBarProps}
      dxRatingTagState="ready"
      onDxRatingTagIdsChange={onDxRatingTagIdsChange}
    />);

    expect(screen.queryByTestId('dxrating-tag-filter-sheet')).toBeNull();
    await fireEvent.press(screen.getByLabelText('谱面标签筛选，当前 全部'));
    expect(screen.getByTestId('dxrating-tag-filter-sheet')).toBeTruthy();
    expect(screen.getByTestId('dxrating-tag-filter-group-1')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('谱面标签 标签1，未选中'));
    await fireEvent.press(screen.getByLabelText('完成谱面标签筛选'));
    expect(onDxRatingTagIdsChange).toHaveBeenCalledWith([1]);
    expect(screen.queryByTestId('dxrating-tag-filter-sheet')).toBeNull();
  });

  it('无数据未终态失败时入口不可用', async () => {
    const loading = await render(<MaimaiFilterBar
      {...filterBarProps}
      dxRatingTagState="loading"
      onDxRatingTagIdsChange={noop}
    />);
    expect(loading.getByLabelText('谱面标签筛选，加载中').props.accessibilityState)
      .toMatchObject({ disabled: true });

    const unavailable = await render(<MaimaiFilterBar
      {...filterBarProps}
      dxRatingTagState="unavailable"
      onDxRatingTagIdsChange={noop}
    />);
    expect(unavailable.getByLabelText('谱面标签筛选，不可用').props.accessibilityState)
      .toMatchObject({ disabled: true });
  });

  it('重置筛选同时收起标签弹层', async () => {
    const screen = await render(<MaimaiFilterBar
      {...filterBarProps}
      dxRatingTagState="ready"
      onDxRatingTagIdsChange={noop}
    />);
    await fireEvent.press(screen.getByLabelText('谱面标签筛选，当前 全部'));
    expect(screen.getByTestId('dxrating-tag-filter-sheet')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('重置筛选'));
    expect(screen.queryByTestId('dxrating-tag-filter-sheet')).toBeNull();
  });
});
