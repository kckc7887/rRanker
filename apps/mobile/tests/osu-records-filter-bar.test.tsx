import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import {
  buildOsuRecordsFilterSummary,
  OsuRecordsFilterBar,
  osuModsValueLabel,
} from '@/components/osu/OsuRecordsFilterBar';

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
  gameId: 'osu-standard' as const,
  mods: [] as string[],
  starMin: '',
  starMax: '',
  accuracyMin: '',
  accuracyMax: '',
  ppMin: '',
  ppMax: '',
  onCollapsedChange: jest.fn(),
  onModsChange: jest.fn(),
  onStarMinChange: jest.fn(),
  onStarMaxChange: jest.fn(),
  onAccuracyMinChange: jest.fn(),
  onAccuracyMaxChange: jest.fn(),
  onPpMinChange: jest.fn(),
  onPpMaxChange: jest.fn(),
  onReset: jest.fn(),
};

describe('buildOsuRecordsFilterSummary / osuModsValueLabel', () => {
  it('全默认时摘要与值标签均为「全部」', () => {
    expect(buildOsuRecordsFilterSummary(baseProps)).toBe('全部');
    expect(osuModsValueLabel([])).toBe('全部');
  });

  it('仅列生效条件：模组 acronym 加号连接、NM 显示无模组、区间缺省侧不限', () => {
    expect(buildOsuRecordsFilterSummary({
      ...baseProps,
      mods: ['HD', 'DT'],
      starMin: '5',
      accuracyMax: '99.5',
      ppMin: '100',
      ppMax: '300',
    })).toBe('模组 HD+DT · 星数 5~不限 · 达成率 不限~99.5% · PP 100~300');
    expect(buildOsuRecordsFilterSummary({ ...baseProps, mods: ['NM'] })).toBe('模组 无模组');
    expect(osuModsValueLabel(['HD', 'DT'])).toBe('HD · DT');
    expect(osuModsValueLabel(['NM'])).toBe('无模组');
  });
});

describe('OsuRecordsFilterBar 成绩筛选栏', () => {
  it('展开态渲染模组与三组区间行（testID 合同）', async () => {
    const screen = await render(<OsuRecordsFilterBar {...baseProps} />);
    expect(screen.getByTestId('osu-records-filter-mods')).toBeTruthy();
    expect(screen.getByTestId('osu-records-filter-star-row')).toBeTruthy();
    expect(screen.getByTestId('osu-records-filter-accuracy-row')).toBeTruthy();
    expect(screen.getByTestId('osu-records-filter-pp-row')).toBeTruthy();
    expect(screen.getByTestId('osu-records-filter-star-lower-thumb')).toBeTruthy();
    expect(screen.getByTestId('osu-records-filter-star-upper-thumb')).toBeTruthy();
    expect(screen.getByTestId('osu-records-filter-accuracy-lower-thumb')).toBeTruthy();
    expect(screen.getByTestId('osu-records-filter-accuracy-upper-thumb')).toBeTruthy();
    expect(screen.getByTestId('osu-records-filter-pp-min')).toBeTruthy();
    expect(screen.getByTestId('osu-records-filter-pp-max')).toBeTruthy();
    expect(screen.getByLabelText('osu! 成绩模组筛选，当前 全部')).toBeTruthy();
  });

  it('滑块无障碍增减直连回调，PP 仍为文本输入', async () => {
    const screen = await render(<OsuRecordsFilterBar {...baseProps} />);
    await fireEvent(screen.getByTestId('osu-records-filter-star-lower-thumb'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(baseProps.onStarMinChange).toHaveBeenCalledWith('0.01');
    await fireEvent(screen.getByTestId('osu-records-filter-accuracy-upper-thumb'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(baseProps.onAccuracyMaxChange).toHaveBeenCalledWith('99.99');
    await fireEvent.changeText(screen.getByLabelText('最低 PP'), '100');
    expect(baseProps.onPpMinChange).toHaveBeenCalledWith('100');
  });

  it('模组弹页使用草稿提交，完成后才回调', async () => {
    const onModsChange = jest.fn();
    const screen = await render(<OsuRecordsFilterBar {...baseProps} onModsChange={onModsChange} />);
    await fireEvent.press(screen.getByLabelText('osu! 成绩模组筛选，当前 全部'));
    await waitFor(() => expect(screen.getByLabelText('HD 隐藏，未选中')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('HD 隐藏，未选中'));
    expect(onModsChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('完成 osu! 模组筛选'));
    expect(onModsChange).toHaveBeenCalledWith(['HD']);
  });

  it('NM 互斥：从空勾 NM 只留 NM；NM 选中时勾具体模组清除 NM', async () => {
    const onModsChange = jest.fn();
    const screen = await render(
      <OsuRecordsFilterBar {...baseProps} onModsChange={onModsChange} />,
    );
    await fireEvent.press(screen.getByLabelText('osu! 成绩模组筛选，当前 全部'));
    await waitFor(() => expect(screen.getByLabelText('NM 无模组，未选中')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('NM 无模组，未选中'));
    await waitFor(() => expect(screen.getByLabelText('NM 无模组，已选中')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('完成 osu! 模组筛选'));
    expect(onModsChange).toHaveBeenCalledWith(['NM']);

    await screen.unmount();
    // NM 已选再勾 DT：草稿立即移除 NM，完成后提交 DT。
    const withNone = await render(
      <OsuRecordsFilterBar {...baseProps} mods={['NM']} onModsChange={onModsChange} />,
    );
    await fireEvent.press(withNone.getByLabelText('osu! 成绩模组筛选，当前 无模组'));
    await waitFor(() => expect(withNone.getByLabelText('NM 无模组，已选中')).toBeTruthy());
    await fireEvent.press(withNone.getByTestId('osu-mod-filter-option-DT'));
    await waitFor(() => expect(withNone.getByLabelText('DT 双倍速度，已选中')).toBeTruthy());
    await fireEvent.press(withNone.getByLabelText('完成 osu! 模组筛选'));
    expect(onModsChange).toHaveBeenCalledWith(['DT']);

    await withNone.unmount();
    // 已有具体模组时勾 NM：草稿只保留 NM。
    const withHd = await render(
      <OsuRecordsFilterBar {...baseProps} mods={['HD']} onModsChange={onModsChange} />,
    );
    await fireEvent.press(withHd.getByLabelText('osu! 成绩模组筛选，当前 HD'));
    await waitFor(() => expect(withHd.getByLabelText('HD 隐藏，已选中')).toBeTruthy());
    await fireEvent.press(withHd.getByLabelText('NM 无模组，未选中'));
    await waitFor(() => expect(withHd.getByLabelText('NM 无模组，已选中')).toBeTruthy());
    await fireEvent.press(withHd.getByLabelText('完成 osu! 模组筛选'));
    expect(onModsChange).toHaveBeenCalledWith(['NM']);
    await withHd.unmount();
  });

  it('重置触发回调', async () => {
    const onReset = jest.fn();
    const screen = await render(<OsuRecordsFilterBar {...baseProps} onReset={onReset} />);
    await fireEvent.press(screen.getByLabelText('重置 osu! 成绩筛选'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('收起态显示摘要且不含筛选行', async () => {
    const screen = await render(
      <OsuRecordsFilterBar {...baseProps} collapsed mods={['HD', 'DT']} ppMin="100" />,
    );
    expect(screen.getByLabelText('展开 osu! 成绩筛选，当前 模组 HD+DT · PP 100~不限')).toBeTruthy();
    expect(screen.queryByTestId('osu-records-filter-mods')).toBeNull();
    expect(screen.queryByTestId('osu-records-filter-pp-row')).toBeNull();
  });
});
