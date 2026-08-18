import { StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import {
  buildOsuCatalogFilterSummary,
  OsuCatalogFilterBar,
  osuGeneralValueLabel,
} from '@/components/osu/OsuCatalogFilterBar';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    surface: '#FFFFFF',
    input: '#F3F4F6',
    text: '#111827',
    textMuted: '#6B7280',
    textSecondary: '#374151',
    border: '#D1D5DB',
    accent: '#246BFD',
    accentSoft: '#EAF2FF',
    background: '#F7F8FA',
    surfaceMuted: '#F3F4F6',
  }),
}));

const baseProps = {
  collapsed: false,
  general: [] as const,
  status: 'any' as const,
  genre: 0,
  language: 0,
  nsfw: false,
  extras: [] as const,
  recommendedDifficulty: null as number | null,
  onCollapsedChange: jest.fn(),
  onGeneralChange: jest.fn(),
  onStatusChange: jest.fn(),
  onGenreChange: jest.fn(),
  onLanguageChange: jest.fn(),
  onNsfwChange: jest.fn(),
  onExtrasChange: jest.fn(),
  onReset: jest.fn(),
};

describe('buildOsuCatalogFilterSummary 摘要', () => {
  it('全默认时显示「全部」', () => {
    expect(buildOsuCatalogFilterSummary(baseProps)).toBe('全部');
  });

  it('仅列生效条件并按 常规/分类/流派/语言/不良内容/其他 排序', () => {
    expect(buildOsuCatalogFilterSummary({
      general: ['recommended'],
      status: 'loved',
      genre: 9,
      language: 6,
      nsfw: true,
      extras: ['video'],
      recommendedDifficulty: 4.72,
    })).toBe('推荐难度4.72★ · 社区喜爱 · 嘻哈 · 日语 · 显示不良内容 · 有视频');
  });

  it('推荐难度未知时仅显示「推荐难度」', () => {
    expect(buildOsuCatalogFilterSummary({
      ...baseProps,
      general: ['recommended'],
      recommendedDifficulty: null,
    })).toBe('推荐难度');
  });
});

describe('osuGeneralValueLabel 常规值标签', () => {
  it('空选为「全部」，选中推荐难度且已知星数时追加 N★', () => {
    expect(osuGeneralValueLabel([], 4.72)).toBe('全部');
    expect(osuGeneralValueLabel(['recommended', 'converts'], 4.72)).toBe('推荐难度4.72★ · 包括转谱');
    expect(osuGeneralValueLabel(['recommended'], null)).toBe('推荐难度');
  });
});

describe('OsuCatalogFilterBar 筛选栏', () => {
  it('展开态渲染六个筛选组且无任何模式控件', async () => {
    const screen = await render(<OsuCatalogFilterBar {...baseProps} />);
    expect(screen.getByText('常规')).toBeTruthy();
    expect(screen.getByText('分类')).toBeTruthy();
    expect(screen.getByText('流派')).toBeTruthy();
    expect(screen.getByText('语言')).toBeTruthy();
    expect(screen.getByText('不良内容')).toBeTruthy();
    expect(screen.getByText('其他')).toBeTruthy();
    expect(screen.queryByText('模式')).toBeNull();
  });

  it('布局合同：两行各两个下拉、两行独占，且每个下拉都位于横向行容器内（防纵向 flex 塌陷叠压）', async () => {
    const screen = await render(<OsuCatalogFilterBar {...baseProps} />);
    const pairRows = screen.getAllByTestId('osu-catalog-filter-pair-row');
    expect(pairRows).toHaveLength(2);
    const fullRows = screen.getAllByTestId('osu-catalog-filter-full-row');
    expect(fullRows).toHaveLength(2);
    for (const row of [...pairRows, ...fullRows]) {
      expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('row');
    }
    // 一行两个：每个 pair row 直接包含两个下拉根节点；独占行各一个。
    for (const row of pairRows) {
      expect(row.children.filter((child) => typeof child !== 'string')).toHaveLength(2);
    }
    for (const row of fullRows) {
      expect(row.children.filter((child) => typeof child !== 'string')).toHaveLength(1);
    }
  });

  it('单选分类：选择后回调且触发器值标签更新', async () => {
    const onStatusChange = jest.fn();
    const screen = await render(<OsuCatalogFilterBar
      {...baseProps}
      status="any"
      onStatusChange={onStatusChange}
    />);
    await fireEvent.press(screen.getByLabelText('osu! 分类筛选，当前 全部'));
    await waitFor(() => expect(screen.getByLabelText('选择分类 社区喜爱')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('选择分类 社区喜爱'));
    expect(onStatusChange).toHaveBeenCalledWith('loved');
  });

  it('多选常规：勾选即回调、完成按钮关闭', async () => {
    const onGeneralChange = jest.fn();
    const screen = await render(<OsuCatalogFilterBar
      {...baseProps}
      general={[]}
      onGeneralChange={onGeneralChange}
    />);
    await fireEvent.press(screen.getByLabelText('osu! 常规筛选，当前 全部'));
    await waitFor(() => expect(screen.getByLabelText('选择常规 包括转谱')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('选择常规 包括转谱'));
    expect(onGeneralChange).toHaveBeenCalledWith(['converts']);
    await fireEvent.press(screen.getByLabelText('完成筛选选择'));
  });

  it('不良内容单选：显示/隐藏映射 nsfw', async () => {
    const onNsfwChange = jest.fn();
    const screen = await render(<OsuCatalogFilterBar {...baseProps} onNsfwChange={onNsfwChange} />);
    await fireEvent.press(screen.getByLabelText('osu! 不良内容筛选，当前 隐藏'));
    await waitFor(() => expect(screen.getByLabelText('选择不良内容 显示')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('选择不良内容 显示'));
    expect(onNsfwChange).toHaveBeenCalledWith(true);
  });

  it('重置触发回调', async () => {
    const onReset = jest.fn();
    const screen = await render(<OsuCatalogFilterBar {...baseProps} onReset={onReset} />);
    await fireEvent.press(screen.getByLabelText('重置 osu! 筛选'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('收起态显示摘要且不含筛选组标题', async () => {
    const screen = await render(<OsuCatalogFilterBar
      {...baseProps}
      collapsed
      status="ranked"
      recommendedDifficulty={null}
    />);
    expect(screen.getByLabelText('展开 osu! 筛选，当前 上架')).toBeTruthy();
    expect(screen.queryByText('常规')).toBeNull();
  });
});
