import { act, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Platform } from 'react-native';
import { useChartPackageDownload } from '@/features/chart-download-shared/use-chart-package-download';
import type { ActionNotificationInput } from '@/components/AppNotification';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';

const originalPlatform = Platform.OS;
const originalFetch = globalThis.fetch;
const mockFetch = jest.fn<typeof fetch>();
let mockLifecycle: AppLifecycleSnapshot = {
  appState: 'active',
  phase: 'foreground-ready',
  foregroundReady: true,
  foregroundGeneration: 1,
  memoryWarningGeneration: 0,
};
const mockDismissNotification = jest.fn();
const mockShowActionNotification = jest.fn((_input: ActionNotificationInput) => 7);
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
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => { jest.useRealTimers(); });
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    globalThis.fetch = originalFetch;
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

  it.each([true, false])('waits for the video choice before running with includeVideo=%s', async includeVideo => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    const runner = jest.fn(async () => false);
    const { result } = await renderHook(() => useChartPackageDownload({ successMessage: '已保存' }));
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.start(runner, { optionalVideoUrl: 'https://example.test/video' });
    });
    expect(result.current.isRunning).toBe(true);
    expect(runner).not.toHaveBeenCalled();
    expect(mockShowActionNotification).toHaveBeenCalledTimes(1);
    const choice = mockShowActionNotification.mock.calls[0][0];
    expect(choice.progress).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith('https://example.test/video', expect.objectContaining({ method: 'HEAD', signal: expect.anything() }));
    await act(async () => {
      choice.actions[includeVideo ? 0 : 1].onPress?.();
      await pending;
    });
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.anything() }), includeVideo);
    expect(mockShowActionNotification.mock.calls[1][0].progress).toEqual({ label: '下载进度', value: 0 });
    expect(mockDismissNotification.mock.invocationCallOrder[0]).toBeLessThan(mockShowActionNotification.mock.invocationCallOrder[1]);
    expect(result.current.isRunning).toBe(false);
  });

  it('cancels the video choice without running and ignores stale actions', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    const runner = jest.fn(async () => false);
    const { result } = await renderHook(() => useChartPackageDownload({ successMessage: '已保存' }));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.start(runner, { optionalVideoUrl: 'https://example.test/video' }); });
    const choice = mockShowActionNotification.mock.calls[0][0];
    await act(async () => { choice.actions[2].onPress?.(); await pending; choice.actions[0].onPress?.(); });
    expect(runner).not.toHaveBeenCalled();
    expect(mockShowActionNotification).toHaveBeenCalledTimes(1);
    expect(mockDismissNotification).toHaveBeenCalledWith(7);
    expect(result.current.isRunning).toBe(false);
  });

  it('locks repeated presses during HEAD and cancels it on unmount', async () => {
    mockFetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const runner = jest.fn(async () => false);
    const { result, unmount } = await renderHook(() => useChartPackageDownload({ successMessage: '已保存' }));
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.start(runner, { optionalVideoUrl: 'https://example.test/video' });
      await result.current.start(runner, { optionalVideoUrl: 'https://example.test/video' });
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await unmount();
    await pending;
    expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(runner).not.toHaveBeenCalled();
    expect(mockShowActionNotification).not.toHaveBeenCalled();
  });

  it('times out the optional HEAD once and downloads without video', async () => {
    jest.useFakeTimers();
    mockFetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const runner = jest.fn(async () => false);
    const { result } = await renderHook(() => useChartPackageDownload({ successMessage: '已保存' }));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.start(runner, { optionalVideoUrl: 'https://example.test/video' }); });
    await act(async () => { await jest.advanceTimersByTimeAsync(12_000); await pending; });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith(expect.anything(), false);
    expect(mockShowActionNotification).toHaveBeenCalledTimes(1);
  });

  it('dismisses a pending video choice on background and never starts its runner', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    const runner = jest.fn(async () => false);
    const { result, rerender } = await renderHook(() => useChartPackageDownload({ successMessage: '已保存' }));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.start(runner, { optionalVideoUrl: 'https://example.test/video' }); });
    mockLifecycle = { ...mockLifecycle, appState: 'background', phase: 'background' };
    await rerender({});
    await pending;
    expect(runner).not.toHaveBeenCalled();
    expect(mockDismissNotification).toHaveBeenCalledWith(7);
    expect(mockShowNotification).not.toHaveBeenCalled();
  });
});
