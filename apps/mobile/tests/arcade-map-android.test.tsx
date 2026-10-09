import { jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform, View } from 'react-native';
import type { CameraPosition, CameraUpdate, MapViewProps } from 'expo-gaode-map';
import { NativeArcadeMap } from '@/components/NativeArcadeMap.android';
import { getArcadeMapAvailability } from '@/services/arcade-map-platform';

let mockSupport = { amapSupported: false, amapConfigured: true };
const mockPrivacy = jest.fn(() => ({ isReady: false }));
let mockCamera: CameraPosition;
const MockView = View;
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => mockSupport }));
jest.mock('expo-gaode-map', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ExpoGaodeMapModule: { getPrivacyStatus: () => mockPrivacy() },
    MapView: React.forwardRef(function MockAMap(props: MapViewProps, ref) {
      React.useImperativeHandle(ref, () => ({
        getCameraPosition: async () => mockCamera,
        moveCamera: async (camera: CameraUpdate) => {
          if (camera.target) mockCamera = { ...camera, zoom: camera.zoom ?? 0 };
        },
        setCenter: async (target: CameraPosition['target']) => { mockCamera = { ...mockCamera, target }; },
        setZoom: async (zoom: number) => { mockCamera = { ...mockCamera, zoom }; },
      }));
      return <MockView testID="amap" onLayout={props.onLoad} />;
    }),
    Marker: () => null,
  };
});

it('unsupported architectures and absent keys never access the AMap SDK', () => {
  const previous = Platform.OS; Platform.OS = 'android';
  expect(getArcadeMapAvailability()).toBe('unsupported');
  mockSupport = { amapSupported: true, amapConfigured: false };
  expect(getArcadeMapAvailability()).toBe('unconfigured');
  expect(mockPrivacy).not.toHaveBeenCalled();
  mockSupport = { amapSupported: true, amapConfigured: true };
  expect(getArcadeMapAvailability()).toBe('consent');
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
