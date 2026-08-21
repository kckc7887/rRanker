import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Text } from 'react-native';
import {
  RangeSelector,
  rangeValueForDrag,
  serializeRangeValue,
  snapRangeValue,
  useStableRangeBounds,
} from '@/components/game-content/RangeSelector';

jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  surface: '#FFFFFF', border: '#D1D5DB', text: '#111827', textMuted: '#6B7280', accent: '#246BFD',
}) }));

describe('RangeSelector', () => {
  it('按步长吸附、钳制并在完整边界回写空字符串', () => {
    expect(snapRangeValue(3.141, 0, 10, 0.01)).toBe(3.14);
    expect(snapRangeValue(-1, 0, 10, 0.1)).toBe(0);
    expect(snapRangeValue(11, 0, 10, 0.1)).toBe(10);
    expect(serializeRangeValue(0, 0, 0.01, 'lower')).toBe('');
    expect(serializeRangeValue(10, 10, 0.01, 'upper')).toBe('');
    expect(serializeRangeValue(9.5, 10, 0.01, 'upper')).toBe('9.5');
  });

  it('轨道点击移动最近滑块', async () => {
    const onLower = jest.fn();
    const screen = await render(<RangeSelector accessibilityLabel="测试范围" minimum={0} maximum={10} step={1}
      lowerValue="" upperValue="" onLowerValueChange={onLower} onUpperValueChange={jest.fn()} testID="range" />);
    await fireEvent(screen.getByTestId('range-track'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 36 } },
    });
    await fireEvent.press(screen.getByTestId('range-track'), { nativeEvent: { locationX: 20 } });
    expect(onLower).toHaveBeenCalledWith('2');
  });

  it('水平拖动距离按轨道比例换算，随后由公共吸附函数落到步长', () => {
    expect(rangeValueForDrag(0, 34, 100, 0, 10)).toBeCloseTo(3.4);
    expect(snapRangeValue(rangeValueForDrag(0, 34, 100, 0, 10), 0, 10, 1)).toBe(3);
    expect(rangeValueForDrag(4, 10, 0, 0, 10)).toBe(4);
  });

  it('受控值回写重渲染时保持同一手势响应器，避免拖动起点被重置后回闪', async () => {
    const onLower = jest.fn();
    const onUpper = jest.fn();
    const screen = await render(<RangeSelector accessibilityLabel="测试范围" minimum={0} maximum={10} step={1}
      lowerValue="" upperValue="" onLowerValueChange={onLower} onUpperValueChange={onUpper} testID="range" />);
    const moveHandler = screen.getByTestId('range-lower-thumb').props.onResponderMove;

    await screen.rerender(<RangeSelector accessibilityLabel="测试范围" minimum={0} maximum={10} step={1}
      lowerValue="2" upperValue="" onLowerValueChange={onLower} onUpperValueChange={onUpper} testID="range" />);
    expect(screen.getByTestId('range-lower-thumb').props.onResponderMove).toBe(moveHandler);
  });

  it('双端不可交叉，且支持无障碍增减', async () => {
    const onLower = jest.fn();
    const onUpper = jest.fn();
    const screen = await render(<RangeSelector accessibilityLabel="测试范围" minimum={0} maximum={10} step={1}
      lowerValue="6" upperValue="6" onLowerValueChange={onLower} onUpperValueChange={onUpper} testID="range" />);
    await fireEvent(screen.getByTestId('range-lower-thumb'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onLower).toHaveBeenLastCalledWith('6');
    await fireEvent(screen.getByTestId('range-upper-thumb'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onUpper).toHaveBeenCalledWith('6');
  });

  it('动态边界同一生命周期只扩不缩，筛选值可扩边，resetKey 切换后重建', async () => {
    function Probe({ values, lower = '', upper = '', resetKey = 'a' }: {
      values: readonly number[];
      lower?: string;
      upper?: string;
      resetKey?: string;
    }) {
      const bounds = useStableRangeBounds(values, { minimum: 0, maximum: 10 }, lower, upper, resetKey);
      return <Text testID="bounds">{bounds.minimum}:{bounds.maximum}</Text>;
    }

    const screen = await render(<Probe values={[2, 8]} />);
    expect(screen.getByTestId('bounds').props.children.join('')).toBe('2:8');
    await screen.rerender(<Probe values={[3, 7]} lower="1" upper="9" />);
    expect(screen.getByTestId('bounds').props.children.join('')).toBe('1:9');
    await screen.rerender(<Probe values={[4, 6]} resetKey="b" />);
    expect(screen.getByTestId('bounds').props.children.join('')).toBe('4:6');
  });
});
