import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { View } from 'react-native';
import { ArcadeMap } from '@/components/ArcadeMap';
import type { ArcadeMapAvailability, NativeArcadeMapProps } from '@/components/ArcadeMap.types';

let mockAvailability: ArcadeMapAvailability = 'available';
let mockNative: NativeArcadeMapProps;
const mockAgree = jest.fn();
const MockView = View;
jest.mock('@/components/NativeArcadeMap', () => ({
  getArcadeMapAvailability: () => mockAvailability,
  acceptArcadeMapPrivacy: () => mockAgree(),
  NativeArcadeMap: (props: NativeArcadeMapProps) => { mockNative = props; return <MockView testID="native-map" />; },
}));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({}) }));
jest.mock('@/components/AppModal', () => ({ AppModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null }));

beforeEach(() => { mockAvailability = 'available'; jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });
const props = () => ({ camera: null, shops: [], selectedShopId: null, compact: false, locating: false,
  onLocate: jest.fn(), onGestureStart: jest.fn(), onCenterChange: jest.fn(), onSelectShop: jest.fn() });

it('emits a settled center only after a map gesture', async () => {
  const events = props(); const view = await render(<ArcadeMap {...events} />);
  await act(async () => { mockNative.onReady(); mockNative.onCenterChange({ latitude: 30, longitude: 120 }); });
  expect(events.onCenterChange).not.toHaveBeenCalled();
  await fireEvent(view.getByTestId('native-map'), 'touchMove');
  await act(async () => { mockNative.onCenterChange({ latitude: 31, longitude: 121 }); });
  expect(events.onGestureStart).toHaveBeenCalled();
  expect(events.onCenterChange).toHaveBeenCalledWith({ latitude: 31, longitude: 121 });
  await act(async () => { mockNative.onCenterChange({ latitude: 32, longitude: 122 }); });
  expect(events.onCenterChange).toHaveBeenLastCalledWith({ latitude: 31, longitude: 121 });
});

it('requires agreement before mounting AMap and allows declining', async () => {
  mockAvailability = 'consent'; const view = await render(<ArcadeMap {...props()} />);
  expect(view.queryByTestId('native-map')).toBeNull();
  await fireEvent.press(view.getByText('使用列表'));
  expect(mockAgree).not.toHaveBeenCalled();
  expect(view.queryByTestId('native-map')).toBeNull();
  await fireEvent.press(view.getByText('启用地图'));
  await fireEvent.press(view.getByText('同意并启用'));
  expect(mockAgree).toHaveBeenCalled();
  expect(view.getByTestId('native-map')).toBeTruthy();
});

it('map load timeout exposes retry without taking over the list', async () => {
  const view = await render(<View><ArcadeMap {...props()} /><View testID="shop-list" /></View>);
  await act(async () => { jest.advanceTimersByTime(20_000); });
  expect(view.getByText('地图加载失败')).toBeTruthy();
  expect(view.getByTestId('shop-list')).toBeTruthy();
  await fireEvent.press(view.getByText('重试地图'));
  await act(async () => { mockNative.onReady(); });
  await act(async () => { jest.advanceTimersByTime(20_000); });
  expect(view.getByTestId('native-map')).toBeTruthy();
});
