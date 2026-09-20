import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import RizlineChartPreviewScreen from '../app/songs/rizline-chart-preview';

const mockInject = jest.fn();
const mockDispose = jest.fn();
const mockPrepare = jest.fn(async (..._args: unknown[]) => ({
  uri: 'file:///rizline-session/index.html', allowingReadAccessToURL: 'file:///rizline-session/', dispose: mockDispose,
}));
const mockSaveSettings = jest.fn(async (_key: string, _value: string) => undefined);
let mockParams: Record<string, string>;
let latestScreenOptions: Record<string, unknown> | undefined;

jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      latestScreenOptions = options;
      return null;
    },
  },
  useLocalSearchParams: () => ({ ...mockParams }),
}));
jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const WebView = React.forwardRef((props: Record<string, unknown>, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
    return React.createElement(RN.View, props);
  });
  WebView.displayName = 'MockWebView';
  return { WebView };
});
jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: async () => JSON.stringify({ userSpeed: 5 }),
    setItem: (key: string, value: string) => mockSaveSettings(key, value),
  },
}));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  dark: true, background: '#000000', text: '#ffffff', textMuted: '#cccccc',
  accent: '#5b8cff', surfaceMuted: '#333333', statusBar: 'light',
}) }));
jest.mock('@/features/rizline-chart-preview/prepare-rizline-chart-preview-webview', () => ({
  rizlineChartPreviewAllowsFileAccess: () => true,
  prepareRizlineChartPreviewWebViewSource: (...args: unknown[]) => mockPrepare(...args),
}));

describe('Rizline 谱面确认页面', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestScreenOptions = undefined;
    mockParams = { songId: 'Song.A.0', levelIndex: '2', title: 'Song IN' };
  });

  it('通过公共壳恢复设置、准备当前难度并在 ready 后撤下进度', async () => {
    const screen = await render(<RizlineChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('rizline-chart-preview-webview')).toBeTruthy());
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockPrepare).toHaveBeenCalledWith(
      { songId: 'Song.A.0', levelIndex: 2, title: 'Song IN' },
      'dark', { userSpeed: 5 }, expect.any(AbortSignal), expect.any(Function),
    );
    expect(screen.getByTestId('chart-preview-load-progress')).toBeTruthy();
    const player = screen.getByTestId('rizline-chart-preview-webview');
    expect(player.props.allowFileAccess).toBe(true);
    expect(player.props.allowingReadAccessToURL).toBe('file:///rizline-session/');
    await fireEvent(player, 'message', { nativeEvent: { data: JSON.stringify({ type: 'ready' }) } });
    expect(screen.queryByTestId('chart-preview-load-progress')).toBeNull();
    await fireEvent(player, 'message', {
      nativeEvent: { data: JSON.stringify({ type: 'settings', volume: 0.4 }) },
    });
    await waitFor(() => expect(mockSaveSettings).toHaveBeenCalledWith(
      'rranker.rizline-chart-preview.settings.v1',
      JSON.stringify({ userSpeed: 5, volume: 0.4 }),
    ));
    await fireEvent(player, 'message', { nativeEvent: { data: JSON.stringify({ type: 'fullscreen', active: true }) } });
    expect(latestScreenOptions).toMatchObject({ orientation: 'portrait_up', headerShown: false });
    await screen.unmount();
    expect(mockDispose).toHaveBeenCalledTimes(1);
    expect((mockPrepare.mock.calls[0][3] as AbortSignal).aborted).toBe(true);
  });

  it('无效路由参数不触发下载', async () => {
    mockParams.levelIndex = '9';
    const screen = await render(<RizlineChartPreviewScreen />);
    expect(screen.getByText('缺少或无效的谱面参数，请返回歌曲详情重试。')).toBeTruthy();
    expect(mockPrepare).not.toHaveBeenCalled();
  });

  it('下载失败使用固定文案，不向页面显示底层异常', async () => {
    mockPrepare.mockRejectedValueOnce(new Error('private native download failure'));
    const screen = await render(<RizlineChartPreviewScreen />);
    await waitFor(() => expect(screen.getByText('谱面暂时无法加载，请稍后重试。')).toBeTruthy());
    expect(screen.queryByText('private native download failure')).toBeNull();
  });
});
