import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import {
  BestImageScreenShell,
  bestImageScreenSharedStyles,
} from '@/features/best-image/best-image-screen-shell';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';

let mockLifecycle: AppLifecycleSnapshot = {
  appState: 'active', phase: 'foreground-ready', foregroundReady: true,
  foregroundGeneration: 1, memoryWarningGeneration: 0,
};
let webViewRenders = 0;

jest.mock('@/state/app-lifecycle', () => ({
  useAppLifecycle: () => mockLifecycle,
}));

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WebView: (props: Record<string, unknown>) => {
      if (props.testID === 'best-image-html-preview-0') webViewRenders += 1;
      return React.createElement(ReactNative.View, props);
    },
  };
});

const widths = [1080, 1440, 2160] as const;
const chosenWidths: number[] = [];

function Harness() {
  const [width, setWidth] = useState<number>(2160);
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
      loadingPreview: null,
      fontStatus: null,
      fontStatusAboveDots: false,
      pickers: null,
      styles: bestImageScreenSharedStyles,
    }}
    preview={{
      previewTestIdPrefix: 'best-image',
      sources: [{ html: '<p>preview</p>', baseUrl: 'https://assets.example/' }],
      pages: [{ id: 'page-1' }],
      pageIndex: 0,
      onPageIndexChange: () => undefined,
      onPreviewStatesChange: () => undefined,
      onPreviewMessage: () => undefined,
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
    webViewRenders = 0;
    chosenWidths.length = 0;
    mockLifecycle = {
      appState: 'active', phase: 'foreground-ready', foregroundReady: true,
      foregroundGeneration: 1, memoryWarningGeneration: 0,
    };
  });

  it('keeps a recoverable paused preview after foreground memory warnings', async () => {
    const view = await render(<Harness />);
    expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy();
    const rendersWithPreview = webViewRenders;

    mockLifecycle = { ...mockLifecycle, memoryWarningGeneration: 1 };
    await view.rerender(<Harness />);
    expect(screen.queryByTestId('best-image-html-preview-0')).toBeNull();
    expect(screen.getByLabelText('降低分辨率并重新加载')).toBeTruthy();
    expect(chosenWidths).toEqual([]);

    mockLifecycle = { ...mockLifecycle, memoryWarningGeneration: 2 };
    await view.rerender(<Harness />);
    expect(screen.queryByTestId('best-image-html-preview-0')).toBeNull();
    expect(webViewRenders).toBe(rendersWithPreview);
    expect(chosenWidths).toEqual([]);

    await fireEvent.press(screen.getByLabelText('降低分辨率并重新加载'));
    expect(chosenWidths).toEqual([1440]);
    expect(screen.getByLabelText('宽度 1440 像素').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy();
    expect(webViewRenders).toBe(rendersWithPreview + 1);
  });
});
