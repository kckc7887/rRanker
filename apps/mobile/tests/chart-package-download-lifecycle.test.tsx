import { act, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { useChartPackageDownload } from '@/features/chart-download-shared/use-chart-package-download';
import { saveChartPackage } from '@/features/chart-download-shared/chart-download-shared';
import type { ActionNotificationInput } from '@/components/AppNotification';
import { AppLifecycleProvider, type AppLifecycleSnapshot } from '@/state/app-lifecycle';
import { ProviderError } from '@/providers/errors';

const originalPlatform = Platform.OS;
const originalAppState = AppState.currentState;
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
const mockPickDirectory = jest.fn<() => Promise<unknown>>();
const mockWritePackage = jest.fn();
let mockUseNativeLifecycle = false;

jest.mock('@/state/app-lifecycle', () => {
  const actual = jest.requireActual<typeof import('@/state/app-lifecycle')>('@/state/app-lifecycle');
  return { ...actual, useAppLifecycle: () => {
    const native = actual.useAppLifecycle();
    return mockUseNativeLifecycle ? native : mockLifecycle;
  } };
});
jest.mock('expo-file-system', () => ({
  Directory: { pickDirectoryAsync: () => mockPickDirectory() },
  File: jest.fn(),
  Paths: { cache: 'file:///cache' },
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
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    mockUseNativeLifecycle = false;
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
    mockPickDirectory.mockReset();
    mockWritePackage.mockReset();
    globalThis.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: originalAppState });
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
    expect(choice.blocking).not.toBe(false);
    expect(mockFetch).toHaveBeenCalledWith('https://example.test/video', expect.objectContaining({ method: 'HEAD', signal: expect.anything() }));
    await act(async () => {
      choice.actions[includeVideo ? 0 : 1].onPress?.();
      await pending;
    });
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.anything() }), includeVideo);
    expect(mockShowActionNotification.mock.calls[1][0].progress).toEqual({ label: '下载进度', value: 0 });
    expect(mockShowActionNotification.mock.calls[1][0].blocking).toBe(false);
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

  it('reports public resource permission failures as download unavailability and releases the task', async () => {
    const { result } = await renderHook(() => useChartPackageDownload({ successMessage: '已保存' }));
    await act(async () => {
      await result.current.start(async () => { throw new ProviderError('permission', 'private resource response', false); });
    });
    expect(mockShowNotification).toHaveBeenCalledTimes(1);
    expect(mockShowNotification).toHaveBeenCalledWith({
      title: '下载失败', message: '下载服务暂时不可用，请稍后重试。', variant: 'error',
    });
    expect(mockDismissNotification).toHaveBeenCalledWith(7);
    expect(result.current.isRunning).toBe(false);
  });

  it('keeps parallel download cancellation independent while both report progress', async () => {
    const { result } = await renderHook(() => ({
      first: useChartPackageDownload({ successMessage: '甲已保存' }),
      second: useChartPackageDownload({ successMessage: '乙已保存' }),
    }));
    const signals: AbortSignal[] = [];
    const run: Parameters<typeof result.current.first.start>[0] = async (options) => {
      signals.push(options.signal!);
      options.onProgress?.({ phase: 'downloading', progress: 0.5 });
      return new Promise<boolean>((resolve) => {
        options.signal!.addEventListener('abort', () => resolve(false), { once: true });
      });
    };
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.first.start(run);
      second = result.current.second.start(run);
    });
    expect(result.current.first.isRunning).toBe(true);
    expect(result.current.second.isRunning).toBe(true);
    const firstProgress = mockShowActionNotification.mock.calls[0][0];
    const secondProgress = mockShowActionNotification.mock.calls[1][0];
    expect(firstProgress.blocking).toBe(false);
    expect(secondProgress.blocking).toBe(false);
    await act(async () => { secondProgress.actions[0].onPress?.(); await second; });
    expect(signals[1].aborted).toBe(true);
    expect(signals[0].aborted).toBe(false);
    expect(result.current.second.isRunning).toBe(false);
    expect(result.current.first.isRunning).toBe(true);
    await act(async () => { firstProgress.actions[0].onPress?.(); await first; });
    expect(signals[0].aborted).toBe(true);
    expect(result.current.first.isRunning).toBe(false);
  });

  it('保留系统选择期间的并行任务并在恢复后依次写盘，普通后台仍取消', async () => {
    mockUseNativeLifecycle = true;
    let changeState!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'change') changeState = handler;
      return { remove: jest.fn() };
    });
    const firstPicker = Promise.withResolvers<unknown>();
    const secondPicker = Promise.withResolvers<unknown>();
    mockPickDirectory.mockReturnValueOnce(firstPicker.promise).mockReturnValueOnce(secondPicker.promise);
    const directory = { uri: 'content://directory', createFile: (name: string) => ({
      write: (bytes: Uint8Array) => mockWritePackage(name, bytes),
    }) };
    const { result, unmount } = await renderHook(() => ({
      first: useChartPackageDownload({ successMessage: '甲已保存' }),
      second: useChartPackageDownload({ successMessage: '乙已保存' }),
    }), { wrapper: AppLifecycleProvider });
    const download = Promise.withResolvers<void>();
    const signals: AbortSignal[] = [];
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.first.start(async options => {
        signals.push(options.signal!);
        return saveChartPackage('first.zip', { kind: 'bytes', bytes: new Uint8Array([1]) }, options.signal);
      });
      second = result.current.second.start(async options => {
        signals.push(options.signal!);
        await download.promise;
        return saveChartPackage('second.zip', { kind: 'bytes', bytes: new Uint8Array([2]) }, options.signal);
      });
    });
    await waitFor(() => expect(mockPickDirectory).toHaveBeenCalledTimes(1));
    await act(async () => { changeState('background'); download.resolve(); });
    expect(signals.every(signal => !signal.aborted)).toBe(true);
    expect(result.current.second.isRunning).toBe(true);
    expect(mockPickDirectory).toHaveBeenCalledTimes(1);
    await act(async () => { firstPicker.resolve(directory); });
    expect(mockWritePackage).not.toHaveBeenCalled();
    expect(mockPickDirectory).toHaveBeenCalledTimes(1);
    await act(async () => { changeState('active'); });
    await waitFor(() => expect(mockPickDirectory).toHaveBeenCalledTimes(2));
    await act(async () => { changeState('background'); secondPicker.resolve(directory); });
    expect(signals.every(signal => !signal.aborted)).toBe(true);
    expect(mockWritePackage).toHaveBeenCalledTimes(1);
    await act(async () => { changeState('active'); await first; await second; });
    expect(mockWritePackage.mock.calls).toEqual([
      ['first.zip', new Uint8Array([1])], ['second.zip', new Uint8Array([2])],
    ]);

    let ordinarySignal!: AbortSignal;
    let ordinary!: Promise<void>;
    await act(async () => { ordinary = result.current.first.start(async options => {
      ordinarySignal = options.signal!;
      return new Promise<boolean>(resolve => ordinarySignal.addEventListener('abort', () => resolve(false), { once: true }));
    }); });
    await act(async () => { changeState('background'); });
    await ordinary;
    expect(ordinarySignal.aborted).toBe(true);
    await act(async () => { changeState('active'); await new Promise(resolve => setTimeout(resolve, 0)); });
    await unmount();
  });

  it('选择期间卸载后不写入文件，也不打开已取消的排队选择', async () => {
    const picker = Promise.withResolvers<unknown>();
    mockPickDirectory.mockReturnValueOnce(picker.promise);
    const { result, unmount } = await renderHook(() => ({
      first: useChartPackageDownload({ successMessage: '甲已保存' }),
      second: useChartPackageDownload({ successMessage: '乙已保存' }),
    }));
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.first.start(options => saveChartPackage('first.zip', { kind: 'bytes', bytes: new Uint8Array([1]) }, options.signal));
      second = result.current.second.start(options => saveChartPackage('second.zip', { kind: 'bytes', bytes: new Uint8Array([2]) }, options.signal));
    });
    await waitFor(() => expect(mockPickDirectory).toHaveBeenCalledTimes(1));
    await unmount();
    expect(mockPickDirectory).toHaveBeenCalledTimes(1);
    await act(async () => { picker.resolve({ uri: 'content://directory', createFile: () => ({ write: mockWritePackage }) }); await first; await second; });
    expect(mockPickDirectory).toHaveBeenCalledTimes(1);
    expect(mockWritePackage).not.toHaveBeenCalled();
  });
});
