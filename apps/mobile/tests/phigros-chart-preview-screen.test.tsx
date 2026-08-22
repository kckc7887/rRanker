import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { BackHandler } from 'react-native';
import JSZip from 'jszip';
import PhigrosChartPreviewScreen from '../app/songs/phigros-chart-preview';
import { stageChartPreviewNavigation } from '@/features/phigros-chart-preview/chart-preview-navigation';

const mockInjectJavaScript = jest.fn();
const mockSaveSettings = jest.fn(async (_key: string, _value: string) => undefined);
const mockPrepare = jest.fn();
const mockStageMusic = jest.fn();
const mockStageRpeBundle = jest.fn();
const mockLoadPhigrosBundle = jest.fn(async (...args: unknown[]) => ({
  target: { songId: (args[0] as { songId: string }).songId, difficulty: 'AT' },
  song: { title: 'Distorted Fate' },
  chart: { url: 'https://assets.example/charts/DistortedFate.Sakuzyo/AT.json' },
  music: { url: 'https://assets.example/music/DistortedFate.Sakuzyo.ogg' },
  illustration: { url: 'https://assets.example/illustrations/DistortedFate.Sakuzyo.png' },
}));
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
  // 真实 useLocalSearchParams 每次渲染都返回新对象；这里同样每次展开，
  // 防止屏幕对 params 对象身份的错误依赖在测试中被掩盖。
  useLocalSearchParams: () => ({ ...mockRouteParams }),
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
    mockPrepare(args[0], args[1]);
    return Promise.resolve({
      uri: 'file:///phigros-chart-preview/index.html',
      allowingReadAccessToURL: 'file:///phigros-chart-preview/',
    });
  },
  stagePhiraChartMusic: (...args: unknown[]) => {
    mockStageMusic(args[0], args[1]);
    return Promise.resolve({
      uri: 'file:///phigros-chart-preview/song.mp3',
      base64: 'QUJDRA==',
    });
  },
  stagePhiraRpeBundle: (...args: unknown[]) => {
    mockStageRpeBundle(args[0], args[1]);
    return Promise.resolve({ basePath: './rpe/38294/' });
  },
}));

jest.mock('@/features/chart-preview-shared/chart-preview-assets', () => ({
  createChartPreviewSessionDirectory: () => ({ uri: 'file:///phigros-chart-preview/session/' }),
  disposeChartPreviewSessionDirectory: jest.fn(),
}));

jest.mock('@/domain/phigros-chart-preview', () => ({
  loadPhigrosChartPreviewBundle: (...args: unknown[]) => mockLoadPhigrosBundle(...args),
  phigrosChartPreviewLevelLabel: () => 'AT',
}));

const mockPhiraChart = {
  id: 38294,
  name: '测试谱面',
  illustration: null,
  file: 'https://phira.example/chart.zip',
};
jest.mock('@/hooks/use-phira', () => ({
  usePhiraChart: (chartId: number | null) => ({
    // 与 react-query 的结构共享一致：data 身份在渲染间保持稳定。
    data: chartId === null ? undefined : mockPhiraChart,
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

async function buildPhiraRpeZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('info.yml', 'chart: chart.json\nmusic: song.mp3\nname: Test RPE\nlevel: IN Lv.16');
  zip.file('chart.json', JSON.stringify({ META: { RPEVersion: 160 }, BPMList: [{ bpm: 120, startTime: [0, 0, 1] }], judgeLineList: [] }));
  zip.file('extra.json', JSON.stringify({ bpm: [{ time: [0, 0, 1], bpm: 120 }], effects: [] }));
  zip.file('camera_pr.glsl', 'void main(){}');
  zip.file('bg.png', new Uint8Array([9, 9, 9]));
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
    mockStageRpeBundle.mockClear();
    mockLoadPhigrosBundle.mockClear();
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
    }), null));
    // 参数对象身份在每次渲染都会变化，prepare 只应执行一次。
    expect(mockPrepare).toHaveBeenCalledTimes(1);
  });

  it('从短令牌完整接收 Phigros 问题歌曲，不依赖原始查询参数', async () => {
    const songId = '祈-我ら神祖と共に歩む者なり-.光吉猛修VS穴山大輔VSKaiVS水野健治VS大国奏音';
    const href = stageChartPreviewNavigation({
      game: 'phigros', songId, levelIndex: 3, title: '祈-我ら神祖と共に歩む者なり- AT',
    });
    mockRouteParams = { requestId: href.params.requestId };

    render(<PhigrosChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('phigros-chart-preview-webview')).toBeTruthy());

    expect(mockLoadPhigrosBundle).toHaveBeenCalledWith({ songId, difficulty: 'AT' }, expect.any(AbortSignal));
    expect(mockPrepare).toHaveBeenCalledWith(expect.objectContaining({
      game: 'phigros', title: '祈-我ら神祖と共に歩む者なり- AT',
    }), null);
  });

  it('phira 参数经 ZIP 解包后注入谱面文本与本地音乐 URI', async () => {
    mockZipBuffer = await buildPhiraZip();
    mockRouteParams = { game: 'phira', chartId: '38294', title: '测试谱面' };
    render(<PhigrosChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('phigros-chart-preview-webview')).toBeTruthy());

    await waitFor(() => expect(mockPrepare).toHaveBeenCalledWith(expect.objectContaining({
      game: 'phira',
      chartText: expect.stringContaining('"formatVersion"'),
    }), 'QUJDRA=='));
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockStageMusic).toHaveBeenCalled();
  });

  it('从短令牌直接接收 Phira 谱面元数据，不在目标页重复请求详情', async () => {
    mockZipBuffer = await buildPhiraZip();
    const chart = {
      id: 66661,
      name: 'Help me, ERINNNNNN!!',
      level: 'IN Lv.16', difficulty: 16, charter: '测试谱师', composer: '测试曲师',
      illustrator: null, description: null, ranked: false, stable: false,
      illustration: null, preview: null, file: 'https://phira.example/66661.zip',
      uploader: 1, tags: [], rating: null, ratingCount: 0,
      created: null, updated: null, chartUpdated: null,
    };
    const href = stageChartPreviewNavigation({ game: 'phira', chart });
    mockRouteParams = { requestId: href.params.requestId };

    render(<PhigrosChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('phigros-chart-preview-webview')).toBeTruthy());

    expect(mockGetChart).not.toHaveBeenCalled();
    expect(mockPrepare).toHaveBeenCalledWith(expect.objectContaining({
      game: 'phira', title: 'Help me, ERINNNNNN!!', chartText: expect.stringContaining('"formatVersion"'),
    }), 'QUJDRA==');
  });

  it('短令牌不存在时明确显示交接错误，不静默等待', async () => {
    mockRouteParams = { requestId: 'missing-request' };
    render(<PhigrosChartPreviewScreen />);
    await waitFor(() => expect(screen.getByText('谱面确认请求已失效，请返回歌曲详情重试')).toBeTruthy());
    expect(screen.queryByTestId('phigros-chart-preview-webview')).toBeNull();
  });

  it('phira RPE 谱面：文本资源注入、其余资源落盘 rpe/{chartId}/', async () => {
    mockZipBuffer = await buildPhiraRpeZip();
    mockRouteParams = { game: 'phira', chartId: '38294', title: '测试 RPE' };
    render(<PhigrosChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('phigros-chart-preview-webview')).toBeTruthy());

    await waitFor(() => expect(mockPrepare).toHaveBeenCalledWith(expect.objectContaining({
      game: 'phira',
      chartText: expect.stringContaining('"META"'),
      format: 'rpe',
      rpeAssets: expect.objectContaining({
        basePath: './rpe/38294/',
        extraJson: expect.stringContaining('"effects"'),
        infoYml: expect.stringContaining('Test RPE'),
        shaders: { 'camera_pr.glsl': 'void main(){}' },
      }),
    }), 'QUJDRA=='));
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    // 非文本条目（bg.png/song.mp3）落盘；文本条目（chart.json/extra.json/info.yml/glsl）不落盘
    expect(mockStageRpeBundle).toHaveBeenCalledWith(38294, [
      { name: 'bg.png', bytes: expect.any(Uint8Array) },
      { name: 'song.mp3', bytes: expect.any(Uint8Array) },
    ]);
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
