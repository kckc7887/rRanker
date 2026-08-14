import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { BackHandler } from 'react-native';
import JSZip from 'jszip';
import PhigrosChartPreviewScreen from '../app/songs/phigros-chart-preview';

const mockInjectJavaScript = jest.fn();
const mockSaveSettings = jest.fn(async (_key: string, _value: string) => undefined);
const mockPrepare = jest.fn();
const mockStageMusic = jest.fn();
let latestScreenOptions: Record<string, unknown> | undefined;
let hardwareBackHandler: (() => boolean | null | undefined) | undefined;
let mockRouteParams: Record<string, string> = {
  game: 'phigros',
  songId: 'DistortedFate.Sakuzyo',
  levelIndex: '3',
  title: 'Distorted Fate AT',
};

jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      latestScreenOptions = options;
      return null;
    },
  },
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  const MockWebView = React.forwardRef((_props: Record<string, unknown>, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }));
    return React.createElement(ReactNative.View, _props);
  });
  MockWebView.displayName = 'MockWebView';
  return { WebView: MockWebView };
});

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => JSON.stringify({ playbackSpeed: 1.5 })),
    setItem: (key: string, value: string) => mockSaveSettings(key, value),
  },
}));

jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    accent: '#246BFD',
    background: '#ffffff',
    text: '#111111',
    textMuted: '#666666',
  }),
}));

jest.mock('@/features/phigros-chart-preview/prepare-phigros-chart-preview-webview', () => ({
  phigrosChartPreviewAllowsFileAccess: () => true,
  preparePhigrosChartPreviewWebViewSource: (...args: unknown[]) => {
    mockPrepare(...args);
    return Promise.resolve({
      uri: 'file:///phigros-chart-preview/index.html',
      allowingReadAccessToURL: 'file:///phigros-chart-preview/',
    });
  },
  stagePhiraChartMusic: (...args: unknown[]) => {
    mockStageMusic(...args);
    return Promise.resolve('file:///phigros-chart-preview/song.mp3');
  },
}));

jest.mock('@/domain/phigros-chart-preview', () => ({
  loadPhigrosChartPreviewBundle: () => Promise.resolve({
    target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    song: { title: 'Distorted Fate' },
    chart: { url: 'https://assets.example/charts/DistortedFate.Sakuzyo/AT.json' },
    music: { url: 'https://assets.example/music/DistortedFate.Sakuzyo.ogg' },
    illustration: { url: 'https://assets.example/illustrations/DistortedFate.Sakuzyo.png' },
  }),
  phigrosChartPreviewLevelLabel: () => 'AT',
}));

jest.mock('@/hooks/use-phira', () => ({
  usePhiraChart: (chartId: number | null) => ({
    data: chartId === null ? undefined : {
      id: chartId,
      name: '测试谱面',
      illustration: null,
      file: 'https://phira.example/chart.zip',
    },
    isError: false,
    error: null,
  }),
}));

const mockGetChart = jest.fn(async (...args: unknown[]) => ({
  id: Number(args[0]),
  name: '测试谱面',
  illustration: null,
  file: 'https://phira.example/chart.zip',
}));
let mockZipBuffer: ArrayBuffer = new Uint8Array([1, 2, 3]).buffer;
jest.mock('@/providers/phira-provider', () => ({
  phiraProvider: {
    getChart: (...args: unknown[]) => mockGetChart(...args),
    downloadChart: () => Promise.resolve(mockZipBuffer),
  },
}));

async function buildPhiraZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('info.yml', 'chart: chart.json\nmusic: song.mp3\nformat: pgr');
  zip.file('chart.json', JSON.stringify({ formatVersion: 3, offset: 0, judgeLineList: [] }));
  zip.file('song.mp3', new Uint8Array([1, 2, 3, 4]));
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('PhigrosChartPreviewScreen', () => {
  beforeEach(() => {
    latestScreenOptions = undefined;
    hardwareBackHandler = undefined;
    mockRouteParams = {
      game: 'phigros',
      songId: 'DistortedFate.Sakuzyo',
      levelIndex: '3',
      title: 'Distorted Fate AT',
    };
    mockInjectJavaScript.mockClear();
    mockSaveSettings.mockClear();
    mockPrepare.mockClear();
    mockStageMusic.mockClear();
    mockGetChart.mockClear();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      hardwareBackHandler = handler;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('phigros 参数经 OSS 解析后注入谱面确认配置并渲染 WebView', async () => {
    render(<PhigrosChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('phigros-chart-preview-webview')).toBeTruthy());

    await waitFor(() => expect(mockPrepare).toHaveBeenCalledWith(expect.objectContaining({
      game: 'phigros',
      chartUrl: 'https://assets.example/charts/DistortedFate.Sakuzyo/AT.json',
      musicUrl: 'https://assets.example/music/DistortedFate.Sakuzyo.ogg',
      illustrationUrl: 'https://assets.example/illustrations/DistortedFate.Sakuzyo.png',
      settings: { playbackSpeed: 1.5 },
    })));
  });

  it('phira 参数经 ZIP 解包后注入谱面文本与本地音乐 URI', async () => {
    mockZipBuffer = await buildPhiraZip();
    mockRouteParams = { game: 'phira', chartId: '38294', title: '测试谱面' };
    render(<PhigrosChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('phigros-chart-preview-webview')).toBeTruthy());

    await waitFor(() => expect(mockPrepare).toHaveBeenCalledWith(expect.objectContaining({
      game: 'phira',
      chartText: expect.stringContaining('"formatVersion"'),
      musicUrl: 'file:///phigros-chart-preview/song.mp3',
    })));
    expect(mockStageMusic).toHaveBeenCalled();
  });

  it('缺少游戏参数时显示阻断错误且不渲染 WebView', async () => {
    mockRouteParams = { songId: 'DistortedFate.Sakuzyo' };
    render(<PhigrosChartPreviewScreen />);
    await waitFor(() => expect(screen.getByText('缺少游戏参数')).toBeTruthy());
    expect(screen.queryByTestId('phigros-chart-preview-webview')).toBeNull();
  });

  it('全屏桥切换原生屏幕为沉浸横屏并处理返回键退出', async () => {
    render(<PhigrosChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('phigros-chart-preview-webview')).toBeTruthy());
    const webview = screen.getByTestId('phigros-chart-preview-webview');

    expect(latestScreenOptions).toMatchObject({ headerShown: true, orientation: 'portrait_up' });

    fireEvent(webview, 'message', { nativeEvent: { data: '{"type":"fullscreen","active":true}' } });
    await waitFor(() => expect(latestScreenOptions).toMatchObject({
      headerShown: false,
      orientation: 'landscape',
      autoHideHomeIndicator: true,
    }));

    expect(hardwareBackHandler?.()).toBe(true);
    expect(mockInjectJavaScript).toHaveBeenCalledWith(expect.stringContaining("type:'exit-fullscreen'"));

    fireEvent(webview, 'message', { nativeEvent: { data: '{"type":"fullscreen","active":false}' } });
    await waitFor(() => expect(latestScreenOptions).toMatchObject({
      headerShown: true,
      orientation: 'portrait_up',
      autoHideHomeIndicator: false,
    }));
  });

  it('仅持久化播放器设置字段到 KV', async () => {
    render(<PhigrosChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('phigros-chart-preview-webview')).toBeTruthy());
    const webview = screen.getByTestId('phigros-chart-preview-webview');

    fireEvent(webview, 'message', {
      nativeEvent: {
        data: '{"type":"settings","active":false,"message":"ignored","playbackSpeed":2,"noteScale":0.8}',
      },
    });

    await waitFor(() => expect(mockSaveSettings).toHaveBeenCalledWith(
      'phigros-chart-preview-settings',
      JSON.stringify({ playbackSpeed: 2, noteScale: 0.8 }),
    ));
  });
});
