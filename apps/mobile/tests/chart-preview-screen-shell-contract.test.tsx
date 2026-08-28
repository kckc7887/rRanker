/**
 * 谱面确认公共屏幕壳——虚构游戏契约测试：
 * 用一组完全虚构的配置（settingsKey/testID/无障碍标签/文案/payload/prepare）
 * 渲染 ChartPreviewScreenShell 的 loading/ready/error 与设置持久化分支，
 * 证明接入全新游戏只需向壳提供配置项、无需修改共享层任何代码。
 * 共享层不得枚举游戏 ID，也不得出现任何游戏专属分支。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import {
  ChartPreviewScreenShell,
  type ChartPreviewShellRequest,
  type ChartPreviewShellSource,
} from '@/features/chart-preview-shared/chart-preview-screen-shell';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';

let mockLifecycle: AppLifecycleSnapshot = {
  appState: 'active', phase: 'foreground-ready', foregroundReady: true,
  foregroundGeneration: 1, memoryWarningGeneration: 0,
};

jest.mock('@/state/app-lifecycle', () => ({
  useAppLifecycle: () => mockLifecycle,
}));

const mockInjectJavaScript = jest.fn();
const mockSaveSettings = jest.fn(async (_key: string, _value: string) => undefined);
let latestWebViewProps: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
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
    getItem: jest.fn(async () => null),
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
async function renderFictionalShell(request: ChartPreviewShellRequest<FictionalPayload>) {
  return render(<FictionalShell request={request} />);
}

function FictionalShell({ request }: { request: ChartPreviewShellRequest<FictionalPayload> }) {
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
  beforeEach(() => {
    mockInjectJavaScript.mockClear();
    mockSaveSettings.mockClear();
    latestWebViewProps = {};
    mockLifecycle = {
      appState: 'active', phase: 'foreground-ready', foregroundReady: true,
      foregroundGeneration: 1, memoryWarningGeneration: 0,
    };
  });

  it('prepare 挂起时渲染加载分支，虚构 WebView 尚未出现', async () => {
    const pending = new Promise<ChartPreviewShellSource>(() => {});
    const view = await renderFictionalShell({
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare: () => pending,
    });

    expect(screen.getByText('正在准备播放器…')).toBeTruthy();
    expect(countTreeNodesOfType(view.toJSON(), 'ActivityIndicator')).toBe(1);
    expect(screen.queryByTestId(fictionalTestID)).toBeNull();
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

  it('后台卸载播放器，回前台只重建当前资源并恢复内容进程', async () => {
    const request: ChartPreviewShellRequest<FictionalPayload> = {
      kind: 'ready',
      payload: { chartName: '虚构谱面' },
      prepare: async () => fictionalSource,
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
    await act(() => {
      (latestWebViewProps.onContentProcessDidTerminate as (() => void) | undefined)?.();
      (latestWebViewProps.onRenderProcessGone as (() => void) | undefined)?.();
    });
    expect(screen.getByTestId(fictionalTestID)).toBeTruthy();
  });
});
