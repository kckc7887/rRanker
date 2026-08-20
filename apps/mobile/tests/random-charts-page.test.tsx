import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet, Text } from 'react-native';
import { RandomChartsPage } from '@/components/RandomChartsPage';

const onCountChange = jest.fn();
const onDraw = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
}));

describe('RandomChartsPage host contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps count, filter, draw and result regions in the shared shell', async () => {
    const screen = await render(
      <RandomChartsPage
        count={2}
        emptyMessage="无结果"
        filter={<Text>成绩页筛选器</Text>}
        hasDrawn
        onCountChange={onCountChange}
        onDraw={onDraw}
        poolSize={3}
        resultCount={1}
        results={<Text>结果卡片</Text>}
      />,
    );

    expect(screen.getByTestId('random-charts-scroll')).toBeTruthy();
    expect(screen.getByText('成绩页筛选器')).toBeTruthy();
    expect(screen.getByText('候选谱面 3 条')).toBeTruthy();
    expect(screen.getByText('结果卡片')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('random-charts-filter').props.style))
      .toMatchObject({ overflow: 'hidden', borderRadius: 12 });

    await fireEvent.press(screen.getByLabelText('抽取 4 首'));
    expect(onCountChange).toHaveBeenCalledWith(4);
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  it('shows complete-pool progress and keeps drawing disabled until ready', async () => {
    const retry = jest.fn();
    const screen = await render(<RandomChartsPage
      count={1}
      drawDisabled
      emptyMessage="无结果"
      filter={<Text>筛选器</Text>}
      hasDrawn={false}
      onCountChange={onCountChange}
      onDraw={onDraw}
      onRetryPool={retry}
      poolError="有 1 页加载失败"
      poolSize={30}
      poolStatus="正在加载完整随机池 · 已加载 30/90"
      resultCount={0}
      results={null}
    />);
    expect(screen.getByText('正在加载完整随机池 · 已加载 30/90')).toBeTruthy();
    expect(screen.getByTestId('random-charts-draw').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(screen.getByTestId('random-charts-draw'));
    expect(onDraw).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('重试加载随机池'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
