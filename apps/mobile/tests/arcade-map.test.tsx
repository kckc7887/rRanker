import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { View } from 'react-native';
import type { Camera, MapViewProps } from 'react-native-maps';
import { ArcadeMap } from '@/components/ArcadeMap';
import type { NativeArcadeMapProps } from '@/components/ArcadeMap.types';
import type { ArcadeMapAvailability } from '@/services/arcade-map-platform';

let mockAvailability: ArcadeMapAvailability = 'available';
let mockNative: NativeArcadeMapProps;
const mockAgree = jest.fn();
const MockView = View;
let mockCamera: Camera;
const mockAnimateCamera = jest.fn((camera: Partial<Camera>) => { mockCamera = { ...mockCamera, ...camera }; });
jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { __esModule: true,
    default: React.forwardRef(function MockMapKit(props: MapViewProps, ref) {
      React.useImperativeHandle(ref, () => ({
        getCamera: async () => mockCamera,
        animateCamera: mockAnimateCamera,
        animateToRegion: jest.fn(),
      }));
      return <MockView testID="native-map" onLayout={props.onMapReady} />;
    }),
    Marker: () => null,
  };
});
jest.mock('@/services/arcade-map-platform', () => ({
  getArcadeMapAvailability: () => mockAvailability,
  acceptArcadeMapPrivacy: () => { mockAgree(); mockAvailability = 'available'; },
}));
jest.mock('@/components/NativeArcadeMap', () => ({
  NativeArcadeMap: (props: NativeArcadeMapProps) => {
    mockNative = props;
    const { NativeArcadeMap } = jest.requireActual<typeof import('@/components/NativeArcadeMap.ios')>('@/components/NativeArcadeMap.ios');
    return <NativeArcadeMap {...props} />;
  },
}));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({}) }));
jest.mock('@/components/AppModal', () => ({ AppModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null }));

beforeEach(() => {
  mockAvailability = 'available'; jest.clearAllMocks(); jest.useFakeTimers();
  mockCamera = { center: { latitude: 31, longitude: 120 }, altitude: 1600, heading: 0, pitch: 0 };
});
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

it('zooms the current MapKit view without changing its center or querying nearby shops', async () => {
  const events = props(); const view = await render(<ArcadeMap {...events} />);
  await fireEvent(view.getByTestId('native-map'), 'layout');
  await fireEvent.press(view.getByTestId('arcade-map-zoom-in'));
  expect(mockCamera.altitude).toBe(800);
  await fireEvent.press(view.getByTestId('arcade-map-zoom-in'));
  expect(mockCamera.altitude).toBe(400);
  await fireEvent.press(view.getByTestId('arcade-map-zoom-out'));
  expect(mockCamera.altitude).toBe(800);
  expect(mockCamera.center).toEqual({ latitude: 31, longitude: 120 });
  await act(async () => { mockNative.onCenterChange(mockCamera.center); });
  expect(events.onCenterChange).not.toHaveBeenCalled();
  await view.rerender(<ArcadeMap {...events} camera={{ center: { latitude: 32, longitude: 121 } }} />);
  expect(mockCamera.center).toEqual({ latitude: 32, longitude: 121 });
  expect(mockCamera.altitude).toBe(800);
});

it('locates from the icon control and disables it while waiting for GPS', async () => {
  const events = props(); const view = await render(<ArcadeMap {...events} />);
  await fireEvent.press(view.getByTestId('arcade-map-locate'));
  expect(events.onLocate).toHaveBeenCalledTimes(1);
  await view.rerender(<ArcadeMap {...events} locating />);
  await fireEvent.press(view.getByTestId('arcade-map-locate'));
  expect(events.onLocate).toHaveBeenCalledTimes(1);
  expect(view.queryByText('定位')).toBeNull();
});
