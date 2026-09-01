import { act, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Platform } from 'react-native';
import { useChartPackageDownload } from '@/features/chart-download-shared/use-chart-package-download';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';

const originalPlatform = Platform.OS;
let mockLifecycle: AppLifecycleSnapshot = {
  appState: 'active',
  phase: 'foreground-ready',
  foregroundReady: true,
  foregroundGeneration: 1,
  memoryWarningGeneration: 0,
};
const mockDismissNotification = jest.fn();
const mockShowActionNotification = jest.fn(() => 7);
const mockShowNotification = jest.fn();
const mockUpdateNotification = jest.fn();

jest.mock('@/state/app-lifecycle', () => ({
  useAppLifecycle: () => mockLifecycle,
}));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({
    dismissNotification: mockDismissNotification,
    showActionNotification: mockShowActionNotification,
    showNotification: mockShowNotification,
    updateNotification: mockUpdateNotification,
  }),
}));

describe('chart package download lifecycle', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockLifecycle = {
      appState: 'active',
      phase: 'foreground-ready',
      foregroundReady: true,
      foregroundGeneration: 1,
      memoryWarningGeneration: 0,
    };
    mockDismissNotification.mockClear();
    mockShowActionNotification.mockClear();
    mockShowNotification.mockClear();
    mockUpdateNotification.mockClear();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('continues through inactive and cancels only after a real background transition', async () => {
    const captured = { signal: null as AbortSignal | null };
    const { result, rerender } = await renderHook(() => useChartPackageDownload({
      successMessage: '已保存',
    }));

    let downloadPromise: Promise<void> | null = null;
    await act(async () => {
      downloadPromise = result.current.start(async (options) => {
        const runnerSignal = options.signal;
        if (!runnerSignal) return false;
        captured.signal = runnerSignal;
        return new Promise<boolean>((resolve) => {
          runnerSignal.addEventListener('abort', () => resolve(false), { once: true });
        });
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(captured.signal).not.toBeNull());

    mockLifecycle = { ...mockLifecycle, appState: 'inactive', phase: 'inactive', foregroundReady: false };
    await rerender({});
    expect(captured.signal?.aborted).toBe(false);
    expect(mockDismissNotification).not.toHaveBeenCalled();

    mockLifecycle = { ...mockLifecycle, appState: 'background', phase: 'background' };
    await rerender({});
    await waitFor(() => expect(captured.signal?.aborted).toBe(true));
    await downloadPromise;

    mockLifecycle = {
      ...mockLifecycle,
      appState: 'active',
      phase: 'foreground-ready',
      foregroundReady: true,
      foregroundGeneration: 2,
    };
    await rerender({});
    expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ title: '下载已停止' }));
  });
});
