import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { BackHandler } from 'react-native';
import MaimaiChartPreviewScreen from '../app/songs/chart-preview';
import {
  createLatestFrameScheduler,
  resolveInitialBackgroundState,
} from '@/features/maimai-chart-preview/webview-player/interactionScheduler';
import {
  getAvailableDifficulties,
  parseSimaiChart,
} from '@/features/maimai-chart-preview/engine/core/parser/SimaiParser';

const mockInjectJavaScript = jest.fn();
const mockSaveSettings = jest.fn(async (_key: string, _value: string) => undefined);
const mockPrepareChartPreview = jest.fn(async (_input: unknown) => ({
  uri: 'file:///chart-preview/index.html',
  allowingReadAccessToURL: 'file:///chart-preview/',
}));
const mockShowActionNotification = jest.fn();
let latestScreenOptions: Record<string, unknown> | undefined;
let latestWebViewProps: Record<string, unknown> = {};
let hardwareBackHandler: (() => boolean | null | undefined) | undefined;

jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      latestScreenOptions = options;
      return null;
    },
  },
  useLocalSearchParams: () => ({
    songId: '834',
    chartType: 'DX',
    levelIndex: '3',
    title: '测试曲 DX MASTER',
  }),
}));

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  const MockWebView = React.forwardRef((_props: Record<string, unknown>, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }));
    latestWebViewProps = _props;
    return React.createElement(ReactNative.View, _props);
  });
  MockWebView.displayName = 'MockWebView';
  return { WebView: MockWebView };
});

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: (key: string, value: string) => mockSaveSettings(key, value),
  },
}));

jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    dark: false,
    statusBar: 'dark',
    accent: '#246BFD',
    background: '#ffffff',
    text: '#111111',
    textMuted: '#666666',
  }),
}));

jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({
    showNotification: jest.fn(),
    showActionNotification: mockShowActionNotification,
  }),
}));

jest.mock('@/features/maimai-chart-preview/prepare-chart-preview-webview', () => ({
  buildChartPreviewInjectedJavaScript: () => 'true;',
  chartPreviewAllowsFileAccess: () => true,
  chartPreviewExitFullscreenScript: () => "window.postMessage({type:'exit-fullscreen'}, '*');true;",
  chartPreviewStopScript: () => "window.postMessage({type:'stop'}, '*');true;",
  parseChartPreviewBridgeMessage: (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed !== null && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  },
  prepareChartPreviewWebViewSource: (input: unknown) => mockPrepareChartPreview(input),
}));

describe('MaimaiChartPreviewScreen fullscreen bridge', () => {
  beforeEach(() => {
    latestScreenOptions = undefined;
    latestWebViewProps = {};
    hardwareBackHandler = undefined;
    mockInjectJavaScript.mockClear();
    mockSaveSettings.mockClear();
    mockPrepareChartPreview.mockClear();
    mockShowActionNotification.mockClear();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      hardwareBackHandler = handler;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('switches the native screen to immersive landscape and restores portrait on exit', async () => {
    render(<MaimaiChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('maimai-chart-preview-webview')).toBeTruthy());
    const webview = screen.getByTestId('maimai-chart-preview-webview');

    expect(latestScreenOptions).toMatchObject({
      headerShown: true,
      orientation: 'portrait_up',
    });
    expect(latestScreenOptions).not.toHaveProperty('statusBarHidden');
    expect(latestScreenOptions).not.toHaveProperty('navigationBarHidden');

    fireEvent(webview, 'message', {
      nativeEvent: { data: '{"type":"fullscreen","active":true}' },
    });

    await waitFor(() => expect(latestScreenOptions).toMatchObject({
      headerShown: false,
      orientation: 'landscape',
      autoHideHomeIndicator: true,
    }));
    expect(latestScreenOptions).not.toHaveProperty('statusBarHidden');
    expect(latestScreenOptions).not.toHaveProperty('navigationBarHidden');

    expect(hardwareBackHandler?.()).toBe(true);
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("type:'exit-fullscreen'"),
    );

    fireEvent(webview, 'message', {
      nativeEvent: { data: '{"type":"fullscreen","active":false}' },
    });

    await waitFor(() => expect(latestScreenOptions).toMatchObject({
      headerShown: true,
      orientation: 'portrait_up',
      autoHideHomeIndicator: false,
    }));
  });

  it('persists only player settings fields from bridge messages', async () => {
    render(<MaimaiChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('maimai-chart-preview-webview')).toBeTruthy());
    const webview = screen.getByTestId('maimai-chart-preview-webview');

    fireEvent(webview, 'message', {
      nativeEvent: {
        data: '{"type":"settings","active":false,"message":"ignored","hiSpeed":7.5,"backgroundMode":"video","videoBackgroundPrompted":true}',
      },
    });

    await waitFor(() => expect(mockSaveSettings).toHaveBeenCalledWith(
      'maimai-chart-preview-settings',
      JSON.stringify({ hiSpeed: 7.5, backgroundMode: 'video', videoBackgroundPrompted: true }),
    ));
  });

  it('serializes rapid settings messages without losing earlier fields', async () => {
    render(<MaimaiChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('maimai-chart-preview-webview')).toBeTruthy());
    const webview = screen.getByTestId('maimai-chart-preview-webview');

    await act(async () => {
      fireEvent(webview, 'message', {
        nativeEvent: { data: '{"type":"settings","backgroundMode":"image"}' },
      });
      fireEvent(webview, 'message', {
        nativeEvent: { data: '{"type":"settings","videoBackgroundPrompted":true}' },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSaveSettings).toHaveBeenLastCalledWith(
      'maimai-chart-preview-settings',
      JSON.stringify({ backgroundMode: 'image', videoBackgroundPrompted: true }),
    );
  });

  it('uses the shared action notification for the one-time video warning', async () => {
    render(<MaimaiChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('maimai-chart-preview-webview')).toBeTruthy());
    const webview = screen.getByTestId('maimai-chart-preview-webview');

    fireEvent(webview, 'message', {
      nativeEvent: { data: '{"type":"background-video-confirmation"}' },
    });

    expect(mockShowActionNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: '启用视频背景？',
      actions: expect.arrayContaining([
        expect.objectContaining({ label: '暂不启用', tone: 'cancel' }),
        expect.objectContaining({ label: '启用' }),
      ]),
    }));
    const notification = mockShowActionNotification.mock.calls[0]?.[0] as {
      actions: { label: string; onPress?: () => void }[];
    };
    notification.actions.find((action) => action.label === '暂不启用')?.onPress?.();
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('background-video-confirmation-result'),
    );
    expect(mockInjectJavaScript).toHaveBeenCalledWith(expect.stringContaining('"accepted":false'));
  });

  it('keeps the player open when an optional background resource returns an HTTP error', async () => {
    render(<MaimaiChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('maimai-chart-preview-webview')).toBeTruthy());

    await act(async () => {
      (latestWebViewProps.onHttpError as (() => void) | undefined)?.();
    });

    expect(screen.getByTestId('maimai-chart-preview-webview')).toBeTruthy();
    expect(screen.queryByText('播放器加载失败，请返回重试。')).toBeNull();
  });

  it('passes the current jacket and reference video source into the player config', async () => {
    render(<MaimaiChartPreviewScreen />);
    await waitFor(() => expect(mockPrepareChartPreview).toHaveBeenCalled());

    expect(mockPrepareChartPreview).toHaveBeenCalledWith(expect.objectContaining({
      backgroundImageUrl: 'https://assets2.lxns.net/maimai/jacket/834.png',
      backgroundVideoUrl: 'https://maimai-video.lxns.net/834.mp4',
    }));
  });

  it('parses MASTER from inote_5 when the song has no Re:MASTER', () => {
    const simai = [
      '&title=没有 Re:MASTER 的歌曲',
      '&bpm=150',
      '&inote_2=(150){4}1,',
      '&inote_3=(150){4}2,',
      '&inote_4=(150){4}3,',
      '&inote_5=(150){4}4,',
    ].join('\n');
    expect(getAvailableDifficulties(simai)).toEqual({ 2: true, 3: true, 4: true, 5: true });
    expect(parseSimaiChart(simai, 5).difficulty).toBe(5);
  });

  it('coalesces repeated pointer work into the latest display frame', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    const rendered: number[] = [];
    let nextHandle = 1;
    const scheduler = createLatestFrameScheduler<number>(
      (callback) => {
        const handle = nextHandle++;
        callbacks.set(handle, callback);
        return handle;
      },
      (handle) => callbacks.delete(handle),
      (value) => rendered.push(value),
    );
    scheduler.schedule(10);
    scheduler.schedule(20);
    expect(callbacks.size).toBe(1);
    callbacks.values().next().value?.(0);
    expect(rendered).toEqual([20]);
  });

  it('defaults old settings to image and remembers either prompt marker', () => {
    expect(resolveInitialBackgroundState({})).toEqual({ mode: 'image', prompted: false });
    expect(resolveInitialBackgroundState({
      backgroundMode: 'video',
      videoBackgroundPrompted: false,
    })).toEqual({ mode: 'image', prompted: false });
    expect(resolveInitialBackgroundState({
      backgroundMode: 'video',
      videoBackgroundConfirmed: true,
    })).toEqual({ mode: 'video', prompted: true });
  });
});
