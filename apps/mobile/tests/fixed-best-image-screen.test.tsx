import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Platform } from 'react-native';
import { FixedBestImageScreen } from '@/components/FixedBestImageScreen';

const mockCaptureRef = jest.fn(async (_ref: unknown, _options: unknown) => 'file:///capture.png');
const mockDispose = jest.fn();
const mockSave = jest.fn(async (_uri: string, _filename: string) => undefined);

jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: jest.fn() }),
}));
jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: (props: Record<string, unknown>) => React.createElement(ReactNative.View, props) };
});
jest.mock('react-native-view-shot', () => ({ captureRef: mockCaptureRef }));
jest.mock('@/features/best-image/prepare-best-image-webview-sources', () => ({
  prepareBestImageWebViewSources: () => ({ sources: [{ uri: 'file:///cache/page.html' }], dispose: mockDispose }),
}));
jest.mock('@/features/best-image/best-image-export', () => ({
  bestImageCaptureDimensions: (width: number, height: number) => ({ width, height }),
  bestImageExportFilename: () => 'fixed.png',
  deleteBestImageCapture: jest.fn(),
  isDrawViewHierarchyError: () => false,
  requestBestImageExportPermission: jest.fn(async () => undefined),
  saveBestImageCapture: mockSave,
  shouldUseBestImageRenderInContext: () => false,
}));

describe('FixedBestImageScreen shared WebView path', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(Platform, 'OS');

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  });

  afterAll(() => {
    if (originalPlatform) Object.defineProperty(Platform, 'OS', originalPlatform);
  });

  it('uses the same prepared local HTML source for preview and export', async () => {
    const screen = await render(<FixedBestImageScreen
      htmlForWidth={(width) => `<html>${width}</html>`}
      imageType="top20"
      playerName="测试玩家"
    />);
    const preview = screen.getByTestId('fixed-best-image-preview');
    expect(preview.props.source).toEqual({ uri: 'file:///cache/page.html' });

    await act(async () => { fireEvent.press(screen.getByLabelText('导出成绩图片')); });
    const exporter = screen.getByTestId('fixed-best-image-export');
    expect(exporter.props.source).toEqual({ uri: 'file:///cache/page.html' });
    await act(async () => { screen.unmount(); });
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

});
