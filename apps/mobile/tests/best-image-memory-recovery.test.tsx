import { useMemo, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import {
  BestImageScreenShell,
  bestImageScreenSharedStyles,
} from '@/features/best-image/best-image-screen-shell';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';
import { useBestImagePreview } from '@/features/best-image/use-best-image-preview';

let mockLifecycle: AppLifecycleSnapshot = {
  appState: 'active', phase: 'foreground-ready', foregroundReady: true,
  foregroundGeneration: 1, memoryWarningGeneration: 0,
};

jest.mock('@/state/app-lifecycle', () => ({
  useAppLifecycle: () => mockLifecycle,
}));

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WebView: (props: Record<string, unknown>) => {
      return React.createElement(ReactNative.View, props);
    },
  };
});

const widths = [1080, 1440, 2160] as const;
const chosenWidths: number[] = [];

function Harness({ drawingReady = true, gameReady = true, sourceUri = 'file:///session/preview.html', showSource = true, pageCount = 1, pageIndex = 0 } = {}) {
  const [width, setWidth] = useState<number>(2160);
  const preview = useBestImagePreview(width, undefined, true);
  const sources = useMemo(() => showSource ? Array.from({ length: pageCount }, (_, index) => ({ uri: `${sourceUri}?page=${index}` })) : null, [sourceUri, showSource, pageCount]);
  return <BestImageScreenShell
    appearance={{
      imageTypes: [{ id: 'best', label: 'Best50' }],
      activeType: 'best',
      onSelectType: () => undefined,
      customPanelBody: null,
      styleListHeader: null,
      styleRows: null,
      widths,
      activeWidth: width,
      onChooseWidth: (next) => { chosenWidths.push(next); setWidth(next); },
      dimensionMeta: '2160 × 2880',
      preparation: { drawingReady, gameReady, error: null },
      pickers: null,
      styles: bestImageScreenSharedStyles,
    }}
    preview={{
      previewTestIdPrefix: 'best-image',
      sources,
      pages: Array.from({ length: pageCount }, (_, index) => ({ id: `page-${index + 1}` })),
      pageIndex,
      previewStates: preview.previewStates,
      onPageIndexChange: () => undefined,
      onPreviewStatesChange: preview.setPreviewStates,
      onPreviewMessage: preview.handlePreviewMessage,
      fileAccessFromFileURLs: false,
      allowingReadAccessToUrl: null,
    }}
    exportSession={{
      exportDisabled: false,
      exportSpinner: false,
      exportIdleLabel: '导出',
      exportStatus: null,
      onExport: () => undefined,
      exportIndex: null,
      exportHeight: 2880,
      exportSource: null,
      exportWebViewKeyPrefix: 'export',
      captureRef: { current: null },
      onExportMessage: () => undefined,
      onRequestCloseExport: () => undefined,
    }}
  />;
}

describe('best image memory recovery', () => {
  beforeEach(() => {
    chosenWidths.length = 0;
    mockLifecycle = {
      appState: 'active', phase: 'foreground-ready', foregroundReady: true,
      foregroundGeneration: 1, memoryWarningGeneration: 0,
    };
  });

  it('keeps a recoverable paused preview after foreground memory warnings', async () => {
    const view = await render(<Harness />);
    expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy();

    mockLifecycle = { ...mockLifecycle, memoryWarningGeneration: 1 };
    await view.rerender(<Harness />);
    expect(screen.queryByTestId('best-image-html-preview-0')).toBeNull();
    expect(screen.getByLabelText('降低分辨率并重新加载')).toBeTruthy();
    expect(chosenWidths).toEqual([]);

    mockLifecycle = { ...mockLifecycle, memoryWarningGeneration: 2 };
    await view.rerender(<Harness />);
    expect(screen.queryByTestId('best-image-html-preview-0')).toBeNull();
    expect(chosenWidths).toEqual([]);

    await fireEvent.press(screen.getByLabelText('降低分辨率并重新加载'));
    expect(chosenWidths).toEqual([1440]);
    expect(screen.getByLabelText('宽度 1440 像素').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy();
  });

  it('shows the shared preparation steps and waits for each new image to be ready', async () => {
    const view = await render(<Harness drawingReady={false} gameReady={false} showSource={false} />);
    expect(screen.getByText('下载绘图资源中')).toBeTruthy();
    await view.rerender(<Harness gameReady={false} showSource={false} />);
    expect(screen.getByText('下载游戏资源中')).toBeTruthy();
    await view.rerender(<Harness />);
    expect(screen.getByText('图片加载中')).toBeTruthy();
    await fireEvent(screen.getByTestId('best-image-html-preview-0'), 'message', {
      nativeEvent: { data: '{"type":"best-image-ready","width":2160,"height":2880}' },
    });
    expect(screen.queryByText('图片加载中')).toBeNull();
    await view.rerender(<Harness sourceUri="file:///session/next.html" />);
    expect(screen.getByText('图片加载中')).toBeTruthy();
    await fireEvent(screen.getByTestId('best-image-html-preview-0'), 'message', {
      nativeEvent: { data: '{"type":"best-image-ready","width":2160,"height":2880}' },
    });
    expect(screen.queryByText('图片加载中')).toBeNull();
    mockLifecycle = { ...mockLifecycle, foregroundGeneration: 2 };
    await view.rerender(<Harness sourceUri="file:///session/next.html" />);
    expect(screen.getByText('图片加载中')).toBeTruthy();
  });

  it('ignores a late ready message after returning to the same page', async () => {
    const view = await render(<Harness pageCount={2} />);
    const abandonedMessage = screen.getByTestId('best-image-html-preview-0').props.onMessage;
    await view.rerender(<Harness pageCount={2} pageIndex={1} />);
    await view.rerender(<Harness pageCount={2} />);
    await act(async () => abandonedMessage({ nativeEvent: { data: '{"type":"best-image-ready","width":2160,"height":2880}' } }));
    expect(screen.getByText('图片加载中')).toBeTruthy();
    await fireEvent(screen.getByTestId('best-image-html-preview-0'), 'message', {
      nativeEvent: { data: '{"type":"best-image-ready","width":2160,"height":2880}' },
    });
    expect(screen.queryByText('图片加载中')).toBeNull();
  });

  it('offers a retry when the image renderer does not report readiness', async () => {
    jest.useFakeTimers();
    try {
      await render(<Harness />);
      await fireEvent(screen.getByTestId('best-image-html-preview-0'), 'loadStart');
      await act(async () => jest.advanceTimersByTime(12_000));
      expect(screen.getByText('图片加载失败，请重试。')).toBeTruthy();
      await fireEvent.press(screen.getByText('重试'));
      expect(screen.queryByText('图片加载失败，请重试。')).toBeNull();
      expect(screen.getByText('图片加载中')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
