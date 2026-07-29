import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet, Text } from 'react-native';
import { RandomChartsPage } from '@/components/RandomChartsPage';
import { fixtureSource } from '@/fixtures/sanitized';

const onCountChange = jest.fn();
const onDraw = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
}));

describe('RandomChartsPage host contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps source, count, filter, draw and result regions in the shared shell', async () => {
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
        sourceItems={[{
          key: 'catalog',
          label: fixtureSource.label,
          updatedAt: fixtureSource.updatedAt,
          state: 'live',
        }]}
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
});
