import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { PanResponder, Text } from 'react-native';
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
  beforeEach(() => {
    jest.spyOn(PanResponder, 'create').mockImplementation(config => ({
      panHandlers: {
        onResponderGrant: config.onPanResponderGrant,
        onResponderMove: config.onPanResponderMove,
        onResponderRelease: config.onPanResponderRelease,
      },
    } as ReturnType<typeof PanResponder.create>));
  });
  afterEach(() => jest.restoreAllMocks());
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

  it('拖动期间受控值更新后继续按本次手势起点计算', async () => {
    const onLower = jest.fn();
    const onUpper = jest.fn();
    const page = (lowerValue: string) => <RangeSelector accessibilityLabel="测试范围" minimum={0} maximum={10} step={1}
      lowerValue={lowerValue} upperValue="" onLowerValueChange={onLower} onUpperValueChange={onUpper} testID="range" />;
    const screen = await render(page(''));
    await fireEvent(screen.getByTestId('range-track'), 'layout', { nativeEvent: { layout: { width: 100 } } });
    await fireEvent(screen.getByTestId('range-lower-thumb'), 'responderGrant');
    await fireEvent(screen.getByTestId('range-lower-thumb'), 'responderMove', {}, { dx: 20 });
    await screen.rerender(page('2'));
    await fireEvent(screen.getByTestId('range-lower-thumb'), 'responderMove', {}, { dx: 40 });
    await fireEvent(screen.getByTestId('range-lower-thumb'), 'responderRelease');
    expect(onLower).toHaveBeenLastCalledWith('4');
  });

  it('拖动不能让双端交叉', async () => {
    const onLower = jest.fn();
    const onUpper = jest.fn();
    const screen = await render(<RangeSelector accessibilityLabel="测试范围" minimum={0} maximum={10} step={1}
      lowerValue="6" upperValue="6" onLowerValueChange={onLower} onUpperValueChange={onUpper} testID="range" />);
    await fireEvent(screen.getByTestId('range-track'), 'layout', { nativeEvent: { layout: { width: 100 } } });
    await fireEvent(screen.getByTestId('range-lower-thumb'), 'responderGrant');
    await fireEvent(screen.getByTestId('range-lower-thumb'), 'responderMove', {}, { dx: 30 });
    await fireEvent(screen.getByTestId('range-lower-thumb'), 'responderRelease');
    expect(onLower).toHaveBeenLastCalledWith('6');
    await fireEvent(screen.getByTestId('range-upper-thumb'), 'responderGrant');
    await fireEvent(screen.getByTestId('range-upper-thumb'), 'responderMove', {}, { dx: -30 });
    await fireEvent(screen.getByTestId('range-upper-thumb'), 'responderRelease');
    expect(onUpper).toHaveBeenLastCalledWith('6');
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
    expect(screen.getByTestId('bounds')).toHaveTextContent('2:8');
    await screen.rerender(<Probe values={[3, 7]} lower="1" upper="9" />);
    expect(screen.getByTestId('bounds')).toHaveTextContent('1:9');
    await screen.rerender(<Probe values={[4, 6]} resetKey="b" />);
    expect(screen.getByTestId('bounds')).toHaveTextContent('4:6');
    await screen.rerender(<Probe values={[5]} resetKey="c" />);
    expect(screen.getByTestId('bounds')).toHaveTextContent('5:5');
  });
});
