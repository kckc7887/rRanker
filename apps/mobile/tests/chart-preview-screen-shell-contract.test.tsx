/**
 * 谱面确认公共屏幕壳——虚构游戏契约测试：
 * 用一组完全虚构的配置（settingsKey/testID/无障碍标签/文案/payload/prepare）
 * 渲染 ChartPreviewScreenShell 的 loading/ready/error 与设置持久化分支，
 * 证明接入全新游戏只需向壳提供配置项、无需修改共享层任何代码。
 * 共享层不得枚举游戏 ID，也不得出现任何游戏专属分支。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { jest } from '@jest/globals';
import {
  ChartPreviewScreenShell,
  type ChartPreviewScreenShellProps,
  type ChartPreviewShellRequest,
  type ChartPreviewShellSource,
} from '@/features/chart-preview-shared/chart-preview-screen-shell';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';
import { installRuntimeLogRecorder } from '@/services/runtime-diagnostics-recorder';
import { ProviderError } from '@/providers/errors';

let mockLifecycle: AppLifecycleSnapshot = {
  appState: 'active', phase: 'foreground-ready', foregroundReady: true,
  foregroundGeneration: 1, memoryWarningGeneration: 0,
};

jest.mock('@/state/app-lifecycle', () => ({
  useAppLifecycle: () => mockLifecycle,
}));

const mockInjectJavaScript = jest.fn();
const mockLoadSettings = jest.fn<() => Promise<string | null>>(async () => null);
const mockSaveSettings = jest.fn(async (_key: string, _value: string) => undefined);
let latestWebViewProps: Record<string, unknown> = {};
let mockScreenOptions: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockScreenOptions = options;
      return null;
    },
  },
}));

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  const MockWebView = React.forwardRef((props: Record<string, unknown>, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }));
    latestWebViewProps = props;
    return React.createElement(ReactNative.View, props);
  });
  MockWebView.displayName = 'MockWebView';
  return { WebView: MockWebView };
});

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: () => mockLoadSettings(),
    setItem: (key: string, value: string) => mockSaveSettings(key, value),
  },
}));

jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    dark: true,
    statusBar: 'light',
    accent: '#246BFD',
    background: '#ffffff',
    text: '#111111',
    textMuted: '#666666',
    surfaceMuted: '#21262D',
  }),
}));

jest.mock('expo-status-bar', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    StatusBar: (props: { style?: string }) =>
      React.createElement(ReactNative.View, { testID: `shell-status-bar-${props.style}` }),
  };
});

/** 虚构游戏专属 payload：壳对该结构零感知，只透传给注入构建器。 */
type FictionalPayload = { chartName: string };

const fictionalSettingsKey = 'fictional-chart-preview-settings';
const fictionalTestID = 'fictional-chart-preview-webview';
const fictionalAccessibilityLabel = '虚构游戏谱面确认播放器';
const fictionalErrorHint = '虚构提示文案';
const fictionalPrepareErrorFallback = '虚构准备失败';
const fictionalSource: ChartPreviewShellSource = {
  uri: 'file://fictional/index.html',
  allowingReadAccessToURL: 'file://fictional/',
};

/** 虚构游戏的接入方式：仅提供配置项与注入构建器，不触碰共享层。 */
type FictionalShellOptions = Pick<ChartPreviewScreenShellProps<FictionalPayload>, 'onBridgeMessage' | 'reInjectOnLoadEnd' | 'externalError'>;

async function renderFictionalShell(request: ChartPreviewShellRequest<FictionalPayload>, options: FictionalShellOptions = {}) {
  return render(<FictionalShell request={request} options={options} />);
}

function FictionalShell({ request, options }: { request: ChartPreviewShellRequest<FictionalPayload>; options?: FictionalShellOptions }) {
  return (
    <ChartPreviewScreenShell<FictionalPayload>
      request={request}
      settingsKey={fictionalSettingsKey}
      testID={fictionalTestID}
      accessibilityLabel={fictionalAccessibilityLabel}
      errorHint={fictionalErrorHint}
      prepareErrorFallback={fictionalPrepareErrorFallback}
      allowFileAccess
      buildInjectedJavaScript={(payload) =>
        `window.__FICTIONAL__=${JSON.stringify(payload.chartName)};true;`}
      {...options}
    />
  );
}

/** 递归统计序列化树中指定类型的节点数（jest-expo mock 的 ActivityIndicator 无 role/testID 可查）。 */
function countTreeNodesOfType(json: unknown, type: string): number {
  if (Array.isArray(json)) {
    return json.reduce((total, child) => total + countTreeNodesOfType(child, type), 0);
  }
  if (json !== null && typeof json === 'object') {
    const node = json as { type?: unknown; children?: unknown };
    return (node.type === type ? 1 : 0) + countTreeNodesOfType(node.children, type);
  }
  return 0;
}

describe('ChartPreviewScreenShell 虚构游戏契约', () => {
  const log = jest.fn<(type: string, fields: Readonly<Record<string, unknown>>) => void>();
  afterEach(() => { installRuntimeLogRecorder(undefined); jest.useRealTimers(); });
  beforeEach(() => {
    log.mockClear(); installRuntimeLogRecorder(log);
    mockInjectJavaScript.mockClear();
    mockLoadSettings.mockReset().mockResolvedValue(null);
    mockSaveSettings.mockClear();
    latestWebViewProps = {};
    mockScreenOptions = {};
    mockLifecycle = {
      appState: 'active', phase: 'foreground-ready', foregroundReady: true,
      foregroundGeneration: 1, memoryWarningGeneration: 0,
    };
  });

  it('关联准备、加载和就绪，去重回调并隔离旧内容进程', async () => {
    await renderFictionalShell({ kind: 'ready', payload: { chartName: 'secret' }, prepare: async () => fictionalSource });
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());
    const old = latestWebViewProps;
    await act(() => {
      (old.onLoadEnd as () => void)(); (old.onLoadEnd as () => void)();
      (old.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"ready"}' } });
      (old.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"ready"}' } });
    });
    const operations = () => log.mock.calls.filter(([type]) => type === 'operation').map(([, fields]) => fields);
    expect(operations().map((fields) => [fields.phase, fields.result])).toEqual([
      ['prepare', 'start'], ['prepare', 'success'], ['loaded', undefined], ['ready', undefined],
    ]);
    expect(new Set(operations().map((fields) => fields.operationId)).size).toBe(1);
    await act(() => { (old.onContentProcessDidTerminate as () => void)(); });
    await act(() => { (old.onError as (event: unknown) => void)({ nativeEvent: {} }); });
    expect(operations().some((fields) => fields.phase === 'load-error')).toBe(false);
    expect(operations().some((fields) => fields.phase === 'terminated')).toBe(true);
    expect(JSON.stringify(operations())).not.toContain('secret');
  });

  it('后台取消只记录一次，迟到的准备结果不会记录成功', async () => {
    let resolve!: (source: ChartPreviewShellSource) => void;
    const dispose = jest.fn();
    const request: ChartPreviewShellRequest<FictionalPayload> = { kind: 'ready', payload: { chartName: 'secret' }, prepare: () => new Promise((done) => { resolve = done; }) };
    const view = await renderFictionalShell(request);
    mockLifecycle = { ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false };
    await view.rerender(<FictionalShell request={request} />);
    await act(() => resolve({ ...fictionalSource, dispose }));
    const phases = log.mock.calls.filter(([type]) => type === 'operation').map(([, fields]) => fields.result);
    expect(phases).toEqual(['start', 'cancelled']);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('准备超时与正常取消分别记录', async () => {
    jest.useFakeTimers();
    const view = await renderFictionalShell({ kind: 'ready', payload: { chartName: 'secret' }, timeoutMs: 50, prepare: () => new Promise(() => {}) });
    await act(async () => { jest.advanceTimersByTime(50); });
    expect(screen.getByText('准备谱面确认资源超时，请重新加载。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy();
    await view.unmount();
    const phases = log.mock.calls.filter(([type]) => type === 'operation').map(([, fields]) => fields.result);
    expect(phases).toEqual(['start', 'timeout']);
  });

  it('prepare 挂起时渲染加载进度条，虚构 WebView 尚未出现', async () => {
    const pending = new Promise<ChartPreviewShellSource>(() => {});
    const view = await renderFictionalShell({
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare: () => pending,
    });

    expect(screen.getByText('正在准备播放器…')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByLabelText('正在准备播放器 0%')).toBeTruthy();
    expect(screen.getByTestId('chart-preview-load-progress')).toBeTruthy();
    expect(countTreeNodesOfType(view.toJSON(), 'ActivityIndicator')).toBe(0);
    expect(screen.queryByTestId(fictionalTestID)).toBeNull();
  });

  it('waiting 请求显示 0% 进度条，虚构 WebView 尚未出现', async () => {
    const view = await renderFictionalShell({ kind: 'waiting' });

    expect(screen.getByText('正在准备播放器…')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByLabelText('正在准备播放器 0%')).toBeTruthy();
    expect(screen.getByTestId('chart-preview-load-progress')).toBeTruthy();
    expect(countTreeNodesOfType(view.toJSON(), 'ActivityIndicator')).toBe(0);
    expect(screen.queryByTestId(fictionalTestID)).toBeNull();
  });

  it('prepare 与播放器 progress 推进同一进度条，ready 后遮罩消失', async () => {
    await renderFictionalShell({
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare: async (_signal, _settings, onProgress) => {
        onProgress?.({ label: '正在加载资源…', value: 0.5 });
        return fictionalSource;
      },
    });

    await waitFor(() => expect(screen.getByText('正在加载资源…')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('45%')).toBeTruthy());
    await waitFor(() => expect(screen.getByLabelText('正在加载资源 45%')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());
    expect(screen.getByTestId('chart-preview-load-progress')).toBeTruthy();

    await act(() => {
      (latestWebViewProps.onMessage as (event: unknown) => void)({
        nativeEvent: { data: JSON.stringify({ type: 'progress', label: '正在加载谱面…', value: 0.5 }) },
      });
    });
    await waitFor(() => expect(screen.getByText('正在加载谱面…')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('95%')).toBeTruthy());

    await act(() => {
      (latestWebViewProps.onMessage as (event: unknown) => void)({
        nativeEvent: { data: '{"type":"ready"}' },
      });
    });
    expect(screen.queryByTestId('chart-preview-load-progress')).toBeNull();
    expect(screen.getByTestId(fictionalTestID)).toBeTruthy();
  });

  it('壳显式接管状态栏样式，不被栈内前页的深色沉浸头声明覆盖', async () => {
    await renderFictionalShell({
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare: async () => fictionalSource,
    });

    // 主题 mock 的 statusBar 为 'light'；虚构游戏无需自带 StatusBar 组件。
    expect(screen.getByTestId('shell-status-bar-light')).toBeTruthy();
  });

  it('prepare 完成后按虚构配置渲染 WebView 并透传 source 与注入脚本', async () => {
    await renderFictionalShell({
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare: async () => fictionalSource,
    });

    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());

    expect(latestWebViewProps.source).toEqual({ uri: fictionalSource.uri });
    expect(latestWebViewProps.allowingReadAccessToURL).toBe(fictionalSource.allowingReadAccessToURL);
    expect(latestWebViewProps.accessibilityLabel).toBe(fictionalAccessibilityLabel);
    expect(String(latestWebViewProps.injectedJavaScriptBeforeContentLoaded)).toContain('虚构谱面');
  });

  it('error 请求渲染阻断错误与虚构提示文案，不渲染 WebView', async () => {
    await renderFictionalShell({ kind: 'error', message: '虚构错误' });

    expect(screen.getByText('虚构错误')).toBeTruthy();
    expect(screen.getByText(fictionalErrorHint)).toBeTruthy();
    expect(screen.getByLabelText('谱面确认错误：虚构错误')).toBeTruthy();
    expect(screen.queryByTestId(fictionalTestID)).toBeNull();
  });

  it('虚构播放器设置经桥接消息写入虚构 settingsKey', async () => {
    await renderFictionalShell({
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare: async () => fictionalSource,
    });
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());
    const webview = screen.getByTestId(fictionalTestID);

    fireEvent(webview, 'message', {
      nativeEvent: { data: JSON.stringify({ type: 'settings', speed: 2 }) },
    });

    await waitFor(() => expect(mockSaveSettings).toHaveBeenCalledWith(
      fictionalSettingsKey,
      JSON.stringify({ speed: 2 }),
    ));
  });

  it('缺省仍把主播放器 HTTP 错误作为阻断错误', async () => {
    await renderFictionalShell({
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare: async () => fictionalSource,
    });
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());

    await act(async () => {
      (latestWebViewProps.onHttpError as (() => void) | undefined)?.();
    });

    expect(screen.getByText('播放器加载失败，请返回重试。')).toBeTruthy();
  });

  it('页面卸载时由公共壳统一释放会话 stage', async () => {
    const dispose = jest.fn();
    const view = await renderFictionalShell({
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare: async () => ({ ...fictionalSource, dispose }),
    });
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());

    await act(async () => view.unmount());
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('后台卸载播放器，回前台重新准备资源', async () => {
    const prepare = jest.fn(async () => fictionalSource);
    const request: ChartPreviewShellRequest<FictionalPayload> = {
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare,
    };
    const view = await renderFictionalShell(request);
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());
    expect(latestWebViewProps.originWhitelist).toEqual(['file://*']);
    expect((latestWebViewProps.onShouldStartLoadWithRequest as (request: Record<string, unknown>) => boolean)({
      isTopFrame: true,
      url: fictionalSource.uri,
    })).toBe(true);
    expect((latestWebViewProps.onShouldStartLoadWithRequest as (request: Record<string, unknown>) => boolean)({
      isTopFrame: true,
      url: 'https://example.invalid/',
    })).toBe(false);

    mockLifecycle = {
      ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false,
    };
    await view.rerender(<FictionalShell request={request} />);
    expect(screen.queryByTestId(fictionalTestID)).toBeNull();

    mockLifecycle = {
      ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true,
      foregroundGeneration: 2,
    };
    await view.rerender(<FictionalShell request={request} />);
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('短暂 inactive 只暂停播放器，不卸载或重新准备资源', async () => {
    const prepare = jest.fn(async () => fictionalSource);
    const request: ChartPreviewShellRequest<FictionalPayload> = {
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare,
    };
    const view = await renderFictionalShell(request);
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());
    expect(prepare).toHaveBeenCalledTimes(1);

    mockLifecycle = {
      ...mockLifecycle, appState: 'inactive', phase: 'inactive', foregroundReady: false,
    };
    await view.rerender(<FictionalShell request={request} />);
    expect(screen.getByTestId(fictionalTestID)).toBeTruthy();

    mockLifecycle = {
      ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true,
    };
    await view.rerender(<FictionalShell request={request} />);
    expect(screen.getByTestId(fictionalTestID)).toBeTruthy();
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('全屏经 inactive 回前台仍保持全屏，只下发生命周期暂停命令', async () => {
    const prepare = jest.fn(async () => fictionalSource);
    const request: ChartPreviewShellRequest<FictionalPayload> = {
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare,
    };
    const view = await renderFictionalShell(request);
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());
    await act(() => {
      (latestWebViewProps.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"ready"}' } });
      (latestWebViewProps.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"fullscreen","active":true}' } });
    });
    expect(mockScreenOptions.headerShown).toBe(false);
    mockInjectJavaScript.mockClear();

    mockLifecycle = {
      ...mockLifecycle, appState: 'inactive', phase: 'inactive', foregroundReady: false,
    };
    await view.rerender(<FictionalShell request={request} />);
    expect(mockInjectJavaScript).toHaveBeenCalledWith(expect.stringContaining('"cause":"lifecycle"'));
    expect(mockInjectJavaScript.mock.calls.every(([script]) => !String(script).includes('fullscreen'))).toBe(true);
    // 生命周期暂停不得静默清除全屏：原生与页面的全屏状态在 inactive 前后一致。
    expect(mockScreenOptions.headerShown).toBe(false);

    mockLifecycle = {
      ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true,
    };
    await view.rerender(<FictionalShell request={request} />);
    expect(mockScreenOptions.headerShown).toBe(false);
    expect(mockInjectJavaScript.mock.calls.every(([script]) => !String(script).includes('"type":"dispose"'))).toBe(true);
  });

  it('内容进程终止与后台释放下发释放命令，而不是生命周期暂停', async () => {
    const dispose = jest.fn();
    const request: ChartPreviewShellRequest<FictionalPayload> = {
      kind: 'ready', payload: { chartName: '虚构谱面' }, prepare: async () => ({ ...fictionalSource, dispose }),
    };
    const view = await renderFictionalShell(request);
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());
    mockInjectJavaScript.mockClear();

    await act(() => { (latestWebViewProps.onContentProcessDidTerminate as () => void)(); });
    expect(mockInjectJavaScript).toHaveBeenCalledWith(expect.stringContaining('"type":"dispose"'));
    expect(mockInjectJavaScript.mock.calls.every(([script]) => !String(script).includes('"type":"pause"'))).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);

    await act(() => { fireEvent.press(screen.getByRole('button', { name: '重新加载' })); });
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());
    mockInjectJavaScript.mockClear();
    const mounted = latestWebViewProps;
    mockLifecycle = {
      ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false,
    };
    await view.rerender(<FictionalShell request={request} />);
    expect(mockInjectJavaScript).toHaveBeenCalledWith(expect.stringContaining('"type":"dispose"'));
    // 释放后旧实例的迟到设置不再写入存储。
    await act(() => {
      (mounted.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"settings","settings":{"speed":9}}' } });
    });
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it('只读取声明的设置载荷，旧扁平设置归一化后仍可持久化', async () => {
    await renderFictionalShell({
      kind: 'ready', payload: { chartName: '虚构谱面' }, prepare: async () => fictionalSource,
    });
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());

    await act(() => {
      (latestWebViewProps.onMessage as (event: unknown) => void)({
        nativeEvent: { data: '{"type":"settings","settings":{"speed":2},"ignored":true}' },
      });
    });
    await waitFor(() => expect(mockSaveSettings).toHaveBeenCalledWith(fictionalSettingsKey, '{"speed":2}'));

    await act(() => {
      (latestWebViewProps.onMessage as (event: unknown) => void)({
        nativeEvent: { data: '{"type":"settings","speed":3,"active":false,"message":"ignored"}' },
      });
    });
    await waitFor(() => expect(mockSaveSettings).toHaveBeenLastCalledWith(fictionalSettingsKey, '{"speed":3}'));

    const calls = mockSaveSettings.mock.calls.length;
    await act(() => {
      for (const payload of ['{"type":"settings","settings":"broken"}', '{"type":"settings","settings":null}', '{"result":"ok"}']) {
        (latestWebViewProps.onMessage as (event: unknown) => void)({ nativeEvent: { data: payload } });
      }
    });
    expect(mockSaveSettings).toHaveBeenCalledTimes(calls);
  });

  it('宿主命令脚本经判别联合序列化，返回键仍退出全屏', async () => {
    let hardwareBackHandler: (() => boolean | null | undefined) | undefined;
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      hardwareBackHandler = handler as () => boolean;
      return { remove: jest.fn() };
    });
    const request: ChartPreviewShellRequest<FictionalPayload> = {
      kind: 'ready', payload: { chartName: '虚构谱面' }, prepare: async () => fictionalSource,
    };
    await renderFictionalShell(request);
    await waitFor(() => expect(screen.getByTestId(fictionalTestID)).toBeTruthy());
    await act(() => {
      (latestWebViewProps.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"fullscreen","active":true}' } });
    });
    mockInjectJavaScript.mockClear();

    expect(hardwareBackHandler?.()).toBe(true);
    expect(mockInjectJavaScript).toHaveBeenCalledWith(expect.stringContaining("type:'exit-fullscreen'"));
    addEventListener.mockRestore();
  });

  it('ready 后内存警告显示手动重载，前后台切换不绕过用户操作', async () => {
    const dispose = jest.fn();
    const prepare = jest.fn(async () => ({
      ...fictionalSource,
      uri: `file://fictional/session-${prepare.mock.calls.length}/index.html`,
      dispose,
    }));
    const request: ChartPreviewShellRequest<FictionalPayload> = {
      kind: 'ready', payload: { chartName: '虚构谱面' }, prepare,
    };
    const view = await renderFictionalShell(request);
    await act(() => {
      (latestWebViewProps.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"ready"}' } });
      (latestWebViewProps.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"fullscreen","active":true}' } });
    });
    expect(mockScreenOptions.headerShown).toBe(false);
    const oldSource = latestWebViewProps.source;

    mockLifecycle = { ...mockLifecycle, memoryWarningGeneration: 1 };
    await view.rerender(<FictionalShell request={request} />);
    expect(screen.getByText('设备内存紧张，播放器已暂停。')).toBeTruthy();
    expect(screen.queryByTestId('chart-preview-load-progress')).toBeNull();
    expect(screen.queryByTestId(fictionalTestID)).toBeNull();
    expect(mockScreenOptions.headerShown).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);

    mockLifecycle = { ...mockLifecycle, memoryWarningGeneration: 2 };
    await view.rerender(<FictionalShell request={request} />);
    mockLifecycle = { ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false };
    await view.rerender(<FictionalShell request={request} />);
    mockLifecycle = { ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 2 };
    await view.rerender(<FictionalShell request={request} />);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(fictionalTestID)).toBeNull();

    await act(() => { fireEvent.press(screen.getByRole('button', { name: '重新加载' })); });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(latestWebViewProps.source).not.toEqual(oldSource);
    expect(screen.getByTestId(fictionalTestID)).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(mockInjectJavaScript.mock.calls.every(([script]) => !String(script).includes("type:'play'"))).toBe(true);
  });

  it.each(['onContentProcessDidTerminate', 'onRenderProcessGone'])(
    '%s 后只手动重载，旧实例重复终止事件不重新准备', async (eventName) => {
      const dispose = jest.fn();
      const prepare = jest.fn(async () => ({ ...fictionalSource, dispose }));
      await renderFictionalShell({ kind: 'ready', payload: { chartName: '虚构谱面' }, prepare });
      const old = latestWebViewProps;
      await act(() => { (old[eventName] as () => void)(); });
      expect(screen.getByText('播放器意外停止，请重新加载。')).toBeTruthy();
      expect(screen.queryByTestId(fictionalTestID)).toBeNull();
      expect(dispose).toHaveBeenCalledTimes(1);
      await act(() => { (old[eventName] as () => void)(); });
      expect(prepare).toHaveBeenCalledTimes(1);
      await act(() => { fireEvent.press(screen.getByRole('button', { name: '重新加载' })); });
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId(fictionalTestID)).toBeTruthy();
    },
  );

  it('旧实例所有事件和延迟确认回调不能改动重载后的界面、设置、桥接或诊断', async () => {
    jest.useFakeTimers();
    const onBridgeMessage = jest.fn<NonNullable<FictionalShellOptions['onBridgeMessage']>>();
    await renderFictionalShell({
      kind: 'ready', payload: { chartName: '虚构谱面' }, prepare: async () => fictionalSource,
    }, { onBridgeMessage, reInjectOnLoadEnd: true });
    const old = latestWebViewProps;
    await act(() => {
      (old.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"confirmation"}' } });
    });
    const oldBridge = onBridgeMessage.mock.calls[0]![1];
    await act(() => { (old.onContentProcessDidTerminate as () => void)(); });
    await act(() => { fireEvent.press(screen.getByRole('button', { name: '重新加载' })); });
    const logCount = log.mock.calls.length;
    const injectCount = mockInjectJavaScript.mock.calls.length;
    const bridgeCount = onBridgeMessage.mock.calls.length;
    await act(() => {
      for (const message of [
        { type: 'progress', label: '旧实例', value: 1 },
        { type: 'ready' }, { type: 'fullscreen', active: true },
        { type: 'settings', speed: 3 }, { type: 'error', diagnostic: 'stale' },
        { type: 'confirmation' },
      ]) {
        (old.onMessage as (event: unknown) => void)({ nativeEvent: { data: JSON.stringify(message) } });
      }
      for (const name of ['onLoadEnd', 'onError', 'onHttpError', 'onContentProcessDidTerminate', 'onRenderProcessGone']) {
        (old[name] as (event?: unknown) => void)({ nativeEvent: { statusCode: 500 } });
      }
      oldBridge.postMessage({ type: 'confirmation-result', accepted: true });
      jest.advanceTimersByTime(50);
    });
    expect((old.onShouldStartLoadWithRequest as (navigation: unknown) => boolean)({ url: fictionalSource.uri })).toBe(false);
    expect(log).toHaveBeenCalledTimes(logCount);
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(injectCount);
    expect(onBridgeMessage).toHaveBeenCalledTimes(bridgeCount);
    expect(mockSaveSettings).not.toHaveBeenCalled();
    expect(mockScreenOptions.headerShown).toBe(true);
    expect(screen.getByTestId(fictionalTestID)).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.queryByText('旧实例')).toBeNull();
    await act(() => {
      (latestWebViewProps.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"ready"}' } });
    });
    expect(screen.queryByTestId('chart-preview-load-progress')).toBeNull();
  });

  it('prepare 不响应 abort 时仍在默认 120 秒结束等待，迟到结果只释放且不影响重试', async () => {
    jest.useFakeTimers();
    const attempts: {
      signal: AbortSignal;
      resolve: (source: ChartPreviewShellSource) => void;
      progress?: (progress: { label: string; value: number }) => void;
    }[] = [];
    const prepare: Extract<ChartPreviewShellRequest<FictionalPayload>, { kind: 'ready' }>['prepare'] =
      (signal, _settings, progress) => new Promise((resolve) => { attempts.push({ signal, resolve, progress }); });
    await renderFictionalShell({ kind: 'ready', payload: { chartName: '虚构谱面' }, prepare });
    await act(() => { jest.advanceTimersByTime(119_999); });
    expect(screen.getByText('0%')).toBeTruthy();
    await act(() => { jest.advanceTimersByTime(1); });
    expect(attempts[0]!.signal.aborted).toBe(true);
    expect(screen.getByText('准备谱面确认资源超时，请重新加载。')).toBeTruthy();
    await act(() => { fireEvent.press(screen.getByRole('button', { name: '重新加载' })); });
    expect(attempts).toHaveLength(2);
    const dispose = jest.fn();
    const logCount = log.mock.calls.length;
    await act(() => {
      attempts[0]!.progress?.({ label: '超时旧结果', value: 1 });
      attempts[0]!.resolve({ ...fictionalSource, dispose });
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(logCount);
    expect(screen.queryByTestId(fictionalTestID)).toBeNull();
    expect(screen.getByText('0%')).toBeTruthy();
    await act(() => { attempts[1]!.resolve({ ...fictionalSource, uri: 'file://fictional/new/index.html' }); });
    expect(screen.getByTestId(fictionalTestID)).toBeTruthy();
    expect(latestWebViewProps.source).toEqual({ uri: 'file://fictional/new/index.html' });
  });

  it('准备期间内存警告取消在途操作，迟到拒绝不会覆盖暂停提示', async () => {
    let reject!: (error: Error) => void;
    let signal!: AbortSignal;
    const request: ChartPreviewShellRequest<FictionalPayload> = {
      kind: 'ready', payload: { chartName: '虚构谱面' },
      prepare: (currentSignal) => {
        signal = currentSignal;
        return new Promise((_resolve, fail) => { reject = fail; });
      },
    };
    const view = await renderFictionalShell(request);
    mockLifecycle = { ...mockLifecycle, memoryWarningGeneration: 1 };
    await view.rerender(<FictionalShell request={request} />);
    expect(signal.aborted).toBe(true);
    const logCount = log.mock.calls.length;
    await act(() => { reject(new Error('late rejected preparation')); });
    expect(log).toHaveBeenCalledTimes(logCount);
    expect(screen.getByText('设备内存紧张，播放器已暂停。')).toBeTruthy();
    expect(screen.queryByText(fictionalPrepareErrorFallback)).toBeNull();
  });

  it('等待选谱不启动超时，参数就绪后才开始计时', async () => {
    jest.useFakeTimers();
    const view = await renderFictionalShell({ kind: 'waiting' });
    await act(() => { jest.advanceTimersByTime(240_000); });
    expect(screen.getByText('0%')).toBeTruthy();
    expect(log.mock.calls.filter(([type]) => type === 'operation')).toHaveLength(0);
    const request: ChartPreviewShellRequest<FictionalPayload> = {
      kind: 'ready', payload: { chartName: '虚构谱面' }, timeoutMs: 50,
      prepare: () => new Promise(() => {}),
    };
    await view.rerender(<FictionalShell request={request} />);
    await act(() => { jest.advanceTimersByTime(50); });
    expect(screen.getByText('准备谱面确认资源超时，请重新加载。')).toBeTruthy();
  });

  it('外部错误移除播放器时释放会话并屏蔽旧事件', async () => {
    const dispose = jest.fn();
    const request: ChartPreviewShellRequest<FictionalPayload> = {
      kind: 'ready', payload: { chartName: '虚构谱面' }, prepare: async () => ({ ...fictionalSource, dispose }),
    };
    const view = await renderFictionalShell(request);
    const old = latestWebViewProps;
    await view.rerender(<FictionalShell request={request} options={{ externalError: '谱面请求已失效' }} />);
    const logCount = log.mock.calls.length;
    await act(() => {
      (old.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"settings","speed":5}' } });
      (old.onError as () => void)();
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(mockSaveSettings).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(logCount);
    expect(screen.getByText('谱面请求已失效')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '重新加载' })).toBeNull();
  });

  it.each([undefined, 75])('播放器始终不发 ready 时按 %s 毫秒配置结束等待并允许重载', async (readyTimeoutMs) => {
    jest.useFakeTimers();
    const dispose = jest.fn();
    await renderFictionalShell({
      kind: 'ready', payload: { chartName: '虚构谱面' }, readyTimeoutMs,
      prepare: async () => ({ ...fictionalSource, dispose }),
    });
    const old = latestWebViewProps;
    await act(() => { jest.advanceTimersByTime((readyTimeoutMs ?? 60_000) - 1); });
    expect(screen.getByTestId(fictionalTestID)).toBeTruthy();
    await act(() => { jest.advanceTimersByTime(1); });
    expect(screen.getByText('播放器准备超时，请重新加载。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy();
    expect(dispose).toHaveBeenCalledTimes(1);
    await act(() => { (old.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"ready"}' } }); });
    expect(screen.getByText('播放器准备超时，请重新加载。')).toBeTruthy();
    expect(screen.queryByTestId(fictionalTestID)).toBeNull();
  });

  it('收到 ready 前即使 progress 为 1 也只显示 99%，ready 清除就绪定时器', async () => {
    jest.useFakeTimers();
    const view = await renderFictionalShell({
      kind: 'ready', payload: { chartName: '虚构谱面' }, prepare: async () => fictionalSource,
    });
    await act(() => {
      (latestWebViewProps.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"progress","value":1}' } });
      jest.advanceTimersByTime(50);
    });
    expect(screen.getByText('99%')).toBeTruthy();
    expect(screen.queryByText('100%')).toBeNull();
    await act(() => {
      (latestWebViewProps.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"ready"}' } });
      jest.advanceTimersByTime(180_000);
    });
    expect(screen.queryByTestId('chart-preview-load-progress')).toBeNull();
    expect(screen.getByTestId(fictionalTestID)).toBeTruthy();
    await view.unmount();
    const logCount = log.mock.calls.length;
    await act(() => { jest.advanceTimersByTime(180_000); });
    expect(log).toHaveBeenCalledTimes(logCount);
  });

  it('读取设置挂起也受准备超时约束，迟到设置不会传入新会话', async () => {
    jest.useFakeTimers();
    let resolveOldSettings!: (value: string) => void;
    mockLoadSettings.mockImplementationOnce(() => new Promise((resolve) => { resolveOldSettings = resolve; }));
    mockLoadSettings.mockResolvedValue('{"speed":2}');
    const prepare = jest.fn(async () => fictionalSource);
    await renderFictionalShell({
      kind: 'ready', payload: { chartName: '虚构谱面' }, timeoutMs: 50, prepare,
    });
    await act(() => { jest.advanceTimersByTime(50); });
    expect(prepare).not.toHaveBeenCalled();
    expect(screen.getByText('准备谱面确认资源超时，请重新加载。')).toBeTruthy();
    await act(() => { fireEvent.press(screen.getByRole('button', { name: '重新加载' })); });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(expect.any(AbortSignal), { speed: 2 }, expect.any(Function));
    await act(() => { resolveOldSettings('{"speed":5}'); });
    expect(prepare).toHaveBeenCalledTimes(1);
    await act(() => {
      (latestWebViewProps.onMessage as (event: unknown) => void)({ nativeEvent: { data: '{"type":"settings","volume":3}' } });
    });
    expect(mockSaveSettings).toHaveBeenLastCalledWith(fictionalSettingsKey, '{"speed":2,"volume":3}');
  });

  it('准备错误沿 ProviderError 映射显示，未知和无数据错误保留调用方安全文案', async () => {
    const request = (error: Error): ChartPreviewShellRequest<FictionalPayload> => ({
      kind: 'ready', payload: { chartName: '虚构谱面' }, prepare: async () => { throw error; },
    });
    const view = await renderFictionalShell(request(new ProviderError('network', 'private upstream host', true)));
    expect(screen.getByText('网络连接失败，请检查网络后重试。')).toBeTruthy();
    expect(screen.queryByText('private upstream host')).toBeNull();
    await view.rerender(<FictionalShell request={request(new ProviderError('no_data', 'private mirror list', false))} />);
    expect(screen.getByText(fictionalPrepareErrorFallback)).toBeTruthy();
    expect(screen.queryByText('private mirror list')).toBeNull();
  });

  it('公共资源访问被拒绝时显示资源不可用并允许重载，不提示账号问题', async () => {
    await renderFictionalShell({
      kind: 'ready', payload: { chartName: '虚构谱面' },
      prepare: async () => { throw new ProviderError('permission', 'private resource response', false); },
    });
    expect(screen.getByText('谱面资源暂时不可用，请稍后重试。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy();
    expect(screen.queryByText('当前账号无法完成此操作。')).toBeNull();
    expect(screen.queryByText('private resource response')).toBeNull();
  });
});
