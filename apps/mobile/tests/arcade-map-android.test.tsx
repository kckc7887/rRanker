import { jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform, View, type NativeSyntheticEvent } from 'react-native';
import type { ArcadeCoordinate } from '@/domain/arcade-coordinates';
import type { ArcadeShop } from '@/domain/arcade-shops';
import { NativeArcadeMap } from '@/components/NativeArcadeMap.android';
import { acceptArcadeMapPrivacy, getArcadeMapAvailability } from '@/services/arcade-map-platform';

const mockPrivacy = jest.fn(() => false);
const mockAccept = jest.fn(() => { mockPrivacy.mockReturnValue(true); });
let mockSupport: { amapConfigured: boolean; isPrivacyReady: typeof mockPrivacy; acceptPrivacy: typeof mockAccept } | null;
let mockCamera: { target: ArcadeCoordinate; zoom: number };
type NativeMapProps = {
  initialCamera: typeof mockCamera;
  shops: { id: number; name: string; position: ArcadeCoordinate }[];
  selectedShopId: number | null;
  onReady: () => void;
  onCenterChange: (event: NativeSyntheticEvent<ArcadeCoordinate>) => void;
  onMarkerPress: (event: NativeSyntheticEvent<{ id: number }>) => void;
};
let mockProps: NativeMapProps;
const MockView = View;
jest.mock('expo-modules-core', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    requireOptionalNativeModule: () => mockSupport,
    requireNativeViewManager: () => React.forwardRef(function MockAMap(props: NativeMapProps, ref) {
      mockProps = props;
      React.useImperativeHandle(ref, () => ({
        setCamera: async (target: ArcadeCoordinate, zoom: number | null) => {
          mockCamera = { target, zoom: zoom ?? mockCamera.zoom };
        },
        zoomBy: async (delta: number) => { mockCamera = { ...mockCamera, zoom: Math.max(3, Math.min(20, mockCamera.zoom + delta)) }; },
      }));
      return <MockView testID="amap" onLayout={props.onReady} />;
    }),
  };
});

beforeEach(() => {
  jest.clearAllMocks(); mockPrivacy.mockReturnValue(false);
  mockSupport = { amapConfigured: true, isPrivacyReady: mockPrivacy, acceptPrivacy: mockAccept };
});

it('requires a configured native module and consent before enabling Android maps', () => {
  const previous = Platform.OS; Platform.OS = 'android';
  mockSupport = null;
  expect(getArcadeMapAvailability()).toBe('unsupported');
  mockSupport = { amapConfigured: false, isPrivacyReady: mockPrivacy, acceptPrivacy: mockAccept };
  expect(getArcadeMapAvailability()).toBe('unconfigured');
  expect(mockPrivacy).not.toHaveBeenCalled();
  mockSupport.amapConfigured = true;
  expect(getArcadeMapAvailability()).toBe('consent');
  acceptArcadeMapPrivacy();
  expect(getArcadeMapAvailability()).toBe('available');
  mockPrivacy.mockImplementationOnce(() => { throw new Error('native failure'); });
  expect(getArcadeMapAvailability()).toBe('failed');
  Platform.OS = previous;
});

it.each([[13, 1, 14], [13, -1, 12], [20, 1, 20], [3, -1, 3]] as const)(
  'zooms AMap from %s by %s to %s and keeps the zoom when recentering', async (zoom, delta, expected) => {
    mockCamera = { target: { latitude: 31, longitude: 120 }, zoom };
    const props = { camera: null, shops: [], selectedShopId: null, onSelectShop: jest.fn(),
      onCenterChange: jest.fn(), onReady: jest.fn(), onError: jest.fn() };
    const view = await render(<NativeArcadeMap {...props} />);
    await fireEvent(view.getByTestId('amap'), 'layout');
    await act(async () => { await view.rerender(<NativeArcadeMap {...props} zoomRequest={{ delta }} />); });
    expect(mockCamera.zoom).toBe(expected);
    expect(mockCamera.target).toEqual({ latitude: 31, longitude: 120 });
    await view.rerender(<NativeArcadeMap {...props} camera={{ center: { latitude: 40, longitude: 120 } }} />);
    expect(mockCamera.target?.latitude).toBeCloseTo(40, 1);
    expect(mockCamera.zoom).toBe(expected);
  },
);

it.each([
  [{ latitude: 31.2304, longitude: 121.4737 }, { latitude: 31.2284577, longitude: 121.4782231 }],
  [{ latitude: 35.68, longitude: 139.76 }, { latitude: 35.68, longitude: 139.76 }],
] as const)('aligns the native camera and pin and returns business coordinates', async (center, nativeCenter) => {
  const shop: ArcadeShop = { id: 42, name: '机厅', ...center, addressDetailed: '', addressGeneral: [],
    comment: '', games: [], openingHours: [], distanceKm: 0 };
  const select = jest.fn(); const move = jest.fn();
  await render(<NativeArcadeMap camera={null} initialCamera={{ center, radiusKm: 2 }} shops={[shop]} selectedShopId={42}
    onSelectShop={select} onCenterChange={move} onReady={jest.fn()} onError={jest.fn()} />);
  const expected = { latitude: expect.closeTo(nativeCenter.latitude, 6), longitude: expect.closeTo(nativeCenter.longitude, 6) };
  expect(mockProps.initialCamera.target).toEqual(expected);
  expect(mockProps.shops[0].position).toEqual(expected);
  await act(async () => {
    mockProps.onMarkerPress({ nativeEvent: { id: 42 } } as NativeSyntheticEvent<{ id: number }>);
    mockProps.onCenterChange({ nativeEvent: nativeCenter } as NativeSyntheticEvent<ArcadeCoordinate>);
  });
  expect(select).toHaveBeenCalledWith(shop);
  expect(move).toHaveBeenCalledWith({ latitude: expect.closeTo(center.latitude, 5), longitude: expect.closeTo(center.longitude, 5) });
});
