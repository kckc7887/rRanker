import { AppState, PixelRatio, Platform, type AppStateStatus, type LayoutChangeEvent } from 'react-native';
import { useMemo } from 'react';
import { AppLifecycleProvider } from '@/state/app-lifecycle';
import { clearUnusedBestImageAssets } from '@/features/best-image/load-best-image-session';
import { jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useBestImageScreenController, usePreparedBestImageSources } from '@/features/best-image/use-best-image-screen-controller';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import type { ActionNotificationInput } from '@/components/AppNotification';

const mockPermission = jest.fn<() => Promise<void>>();
const mockCapture = jest.fn<(...args: unknown[]) => Promise<string>>();
const mockSave = jest.fn<(uri: string, name: string) => Promise<void>>();
const mockDelete = jest.fn();
const mockNotify = jest.fn();
const mockShowProgress = jest.fn<(input: ActionNotificationInput) => number>(() => 1);
const mockUpdateProgress = jest.fn();
const mockDismissProgress = jest.fn();
const mockFiles = new Map<string, string>();
const mockWrite = jest.fn<(uri: string, content: string) => Promise<void>>();
const mockBase64 = jest.fn<() => Promise<string>>();
const mockDeletedDirectories = new Set<string>();
jest.mock('react-native-view-shot', () => ({ captureRef: (...args: unknown[]) => mockCapture(...args) }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({
  showNotification: mockNotify, showActionNotification: mockShowProgress,
  updateNotification: mockUpdateProgress, dismissNotification: mockDismissProgress,
}) }));
jest.mock('@/features/best-image/best-image-export', () => ({
  BestImageExportError: class BestImageExportError extends Error {},
  bestImageCaptureDimensions: (width: number, height: number) => ({ width, height }), deleteBestImageCapture: async (uri: string) => mockDelete(uri),
  requestBestImageExportPermission: () => mockPermission(),
  saveBestImageCapture: (uri: string, name: string) => mockSave(uri, name),
}));
const config = {
  game: 'maimai' as const,
  accountId: 'account-a', defaultType: 'best', defaultWidth: 1080, defaultQuantityText: '50', defaultPreferences: {},
  preferences: { load: async () => ({}), save: async () => undefined }, defaultExportHeight: () => 1440,
};
const runtime = (count = 1) => ({
  pages: Array.from({ length: count }, (_, i) => ({ id: String(i) })), htmlPages: Array(count).fill('<html/>') as string[],
  sources: Array.from({ length: count }, () => ({ uri: 'file:///page.html' })),
  canExport: true, buildExportFilename: (index: number) => `${index}.png`,
});
const ready = '{"type":"best-image-ready","width":1080,"height":1440}';
const layout = (height = 1440) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 1080 / PixelRatio.get(), height: height / PixelRatio.get() } } }) as LayoutChangeEvent;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('best image export lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks(); mockFiles.clear(); mockDeletedDirectories.clear();
    mockPermission.mockResolvedValue(undefined); mockSave.mockResolvedValue(undefined);
    mockCapture.mockResolvedValue('file:///capture.png');
    mockWrite.mockReset().mockImplementation(async (uri, content) => { mockFiles.set(uri, content); });
    mockBase64.mockReset().mockResolvedValue('Y292ZXI=');
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('locks synchronously before permissions and cancels before mounting a canvas', async () => {
    const permission = deferred<void>(); mockPermission.mockReturnValueOnce(permission.promise);
    const { result } = await renderHook(() => useBestImageScreenController(config));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime()); await result.current.exportImages(runtime()); });
    expect(mockPermission).toHaveBeenCalledTimes(1);
    expect(result.current.exportStatus).toBe('正在准备导出');
    expect(mockShowProgress).toHaveBeenCalledWith(expect.objectContaining({ title: '导出成绩图片', progress: { label: '正在准备导出', value: 0 } }));
    await act(async () => { void mockShowProgress.mock.calls[0]![0].actions[0]!.onPress?.(); permission.resolve(); await pending; });
    expect(mockDismissProgress).toHaveBeenCalledWith(1);
    expect(result.current.exportStatus).toBeNull();
    expect(result.current.exportIndex).toBeNull(); expect(mockCapture).not.toHaveBeenCalled(); expect(mockNotify).not.toHaveBeenCalled();
  });

  it('cancels layout waiting and rejects callbacks from a previous canvas', async () => {
    const { result } = await renderHook(() => useBestImageScreenController(config));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime()); });
    const oldMessage = result.current.handleExportMessage;
    await act(async () => { result.current.handleExportMessage(ready); result.current.handleExportLayout(layout()); result.current.cancelExportRequest(); await pending; });
    expect(mockCapture).not.toHaveBeenCalled();
    await act(async () => { pending = result.current.exportImages(runtime()); });
    await act(async () => { oldMessage(ready); await jest.advanceTimersByTimeAsync(320); });
    expect(mockCapture).not.toHaveBeenCalled();
    await act(async () => { result.current.handleExportMessage(ready); result.current.handleExportLayout(layout()); await jest.advanceTimersByTimeAsync(320); await pending; });
    expect(mockCapture).toHaveBeenCalledTimes(1); expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: '导出完成' }));
    expect(mockUpdateProgress).toHaveBeenLastCalledWith(1, { progress: { label: '已保存 1/1，正在完成导出', value: 1 } });
    expect(mockDismissProgress).toHaveBeenCalledWith(1);
  });

  it('waits for the final native layout and a fresh ready message after the height changes', async () => {
    const { result } = await renderHook(() => useBestImageScreenController(config));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime()); });
    await act(async () => {
      result.current.handleExportMessage('{"type":"best-image-ready","width":1080,"height":3200}');
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(mockCapture).not.toHaveBeenCalled();
    await act(async () => {
      result.current.handleExportLayout(layout(3200));
      await jest.advanceTimersByTimeAsync(250);
      result.current.handleExportMessage('{"type":"best-image-height","width":1080,"height":4000}');
      result.current.handleExportLayout(layout(4000));
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(mockCapture).not.toHaveBeenCalled();
    await act(async () => {
      result.current.handleExportMessage('{"type":"best-image-ready","width":1080,"height":4000}');
      await jest.advanceTimersByTimeAsync(320);
      await pending;
    });
    expect(mockCapture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ width: 1080, height: 4000 }));
    expect(mockSave).toHaveBeenCalled();
  });

  it('rejects a renderer image error immediately without capturing or saving', async () => {
    const { result } = await renderHook(() => useBestImageScreenController(config));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime()); });
    await act(async () => {
      result.current.handleExportMessage('{"type":"best-image-error","width":1080,"message":"图片加载失败，请重试。"}');
      await pending;
    });
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: '导出失败', message: '图片加载失败，请重试。' }));
    expect(mockDismissProgress).toHaveBeenCalledWith(1);
  });

  it('retries a transient iOS capture failure with the same snapshot strategy and saves the result', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockCapture.mockRejectedValueOnce(new Error('snapshot failed'));
    const { result } = await renderHook(() => useBestImageScreenController({ ...config, defaultWidth: 1440 }));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime()); });
    await act(async () => {
      result.current.handleExportMessage('{"type":"best-image-ready","width":1440,"height":1920}');
      result.current.handleExportLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 1440 / PixelRatio.get(), height: 1920 / PixelRatio.get() } } } as LayoutChangeEvent);
      await jest.advanceTimersByTimeAsync(320 + 250);
      await pending;
    });
    expect(mockCapture.mock.calls.map(call => call[1])).toEqual([
      { width: 1440, height: 1920, format: 'png', quality: 1, result: 'tmpfile' },
      { width: 1440, height: 1920, format: 'png', quality: 1, result: 'tmpfile' },
    ]);
    expect(mockSave).toHaveBeenCalledWith('file:///capture.png', '0.png');
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: '导出完成' }));
  });

  it('cleans up a cancelled in-flight capture without saving or starting another export', async () => {
    const capture = deferred<string>(); mockCapture.mockReturnValueOnce(capture.promise);
    const { result } = await renderHook(() => useBestImageScreenController(config));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime(2)); });
    expect(result.current.exportStatus).toBe('正在加载图片 1/2');
    await act(async () => { result.current.handleExportMessage(ready); result.current.handleExportLayout(layout()); await jest.advanceTimersByTimeAsync(320); });
    expect(result.current.exportStatus).toBe('正在生成图片 1/2');
    await act(async () => { result.current.cancelExportRequest(); await result.current.exportImages(runtime()); });
    expect(mockPermission).toHaveBeenCalledTimes(1);
    await act(async () => { capture.resolve('file:///late.png'); await pending; });
    expect(mockCapture).toHaveBeenCalledTimes(1); expect(mockSave).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('file:///late.png'); expect(mockNotify).not.toHaveBeenCalled();
  });

  it('lets an existing native save finish and stops before saving the next image', async () => {
    const save = deferred<void>(); mockSave.mockReturnValueOnce(save.promise);
    const { result } = await renderHook(() => useBestImageScreenController(config));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime(2)); });
    await act(async () => { result.current.handleExportMessage(ready); result.current.handleExportLayout(layout()); await jest.advanceTimersByTimeAsync(320); });
    expect(result.current.exportIndex).toBe(1);
    expect(result.current.exportStatus).toBe('正在加载图片 2/2');
    expect(mockUpdateProgress).toHaveBeenLastCalledWith(1, { progress: { label: '正在加载图片 2/2', value: 0.25 } });
    await act(async () => { result.current.handleExportMessage(ready); result.current.handleExportLayout(layout()); await jest.advanceTimersByTimeAsync(320); });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(result.current.exportIndex).toBeNull();
    expect(result.current.exportStatus).toBe('正在保存 1/2');
    expect(mockUpdateProgress).toHaveBeenLastCalledWith(1, { progress: { label: '正在保存 1/2', value: 0.5 } });
    await act(async () => { result.current.cancelExportRequest(); });
    expect(result.current.exportStatus).toBeNull();
    expect(mockDelete).not.toHaveBeenCalled();
    await act(async () => { save.resolve(); await pending; });
    expect(mockSave).toHaveBeenCalledTimes(1); expect(mockDelete).toHaveBeenCalledTimes(2); expect(mockNotify).not.toHaveBeenCalled();
  });

  it.each(['unmount', 'account'] as const)('cancels permission waiting on %s', async (change) => {
    const permission = deferred<void>(); mockPermission.mockReturnValueOnce(permission.promise);
    const { result, unmount, rerender } = await renderHook(({ accountId }: { accountId: string }) => useBestImageScreenController({ ...config, accountId }), { initialProps: { accountId: 'account-a' } });
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime()); });
    if (change === 'unmount') await unmount(); else await rerender({ accountId: 'account-b' });
    await act(async () => { permission.resolve(); await pending; });
    expect(mockCapture).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled(); expect(mockNotify).not.toHaveBeenCalled();
  });

  it('retains the page session until a cancelled native capture returns after unmount', async () => {
    const capture = deferred<string>(); mockCapture.mockReturnValueOnce(capture.promise);
    const { result, unmount } = await renderHook(() => useBestImageScreenController(config));
    const directory = result.current.assetSession.directory.uri;
    mockFiles.set(`${directory}/cover.png`, 'original cover');
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime()); });
    await act(async () => { result.current.handleExportMessage(ready); result.current.handleExportLayout(layout()); await jest.advanceTimersByTimeAsync(320); });
    await unmount();
    expect(mockDeletedDirectories.has(directory)).toBe(false);
    await clearUnusedBestImageAssets('maimai');
    expect(mockFiles.get(`${directory}/cover.png`)).toBe('original cover');
    await act(async () => { capture.resolve('file:///late.png'); await pending; });
    await waitFor(() => expect(mockDeletedDirectories.has(directory)).toBe(true));
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('file:///late.png');
  });

  it('releases replaced HTML only after the old native capture finishes', async () => {
    const capture = deferred<string>(); mockCapture.mockReturnValueOnce(capture.promise);
    const { result, rerender } = await renderHook(({ htmlPages }: { htmlPages: string[] }) => {
      const controller = useBestImageScreenController(config);
      const template = useMemo(() => ({ assets: [], build: () => htmlPages }), [htmlPages]);
      const prepared = usePreparedBestImageSources(template, controller.assetSession, controller.assetSession.directory, controller.cancelExportRequest);
      return { ...controller, sources: prepared.sources };
    }, { initialProps: { htmlPages: ['<p>old</p>'] } });
    await waitFor(() => expect(result.current.sources).not.toBeNull());
    const oldUri = result.current.sources![0]!.uri;
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages({ ...runtime(), sources: result.current.sources }); });
    await act(async () => { result.current.handleExportMessage(ready); result.current.handleExportLayout(layout()); await jest.advanceTimersByTimeAsync(320); });
    await rerender({ htmlPages: ['<p>next</p>'] });
    await waitFor(() => expect(result.current.sources?.[0]?.uri).not.toBe(oldUri));
    expect(mockFiles.get(oldUri)).toBe('<p>old</p>');
    await act(async () => { capture.resolve('file:///late.png'); await pending; });
    await waitFor(() => expect(mockFiles.has(oldUri)).toBe(false));
    expect(mockFiles.get(result.current.sources![0]!.uri)).toBe('<p>next</p>');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('cancels a foreground wait without requiring the app to return from background', async () => {
    const originalState = AppState.currentState;
    AppState.currentState = 'background';
    try {
      const { result, unmount } = await renderHook(() => useBestImageScreenController(config), { wrapper: AppLifecycleProvider });
      const directory = result.current.assetSession.directory.uri;
      let pending!: Promise<void>;
      await act(async () => { pending = result.current.exportImages(runtime()); });
      await act(async () => { result.current.handleExportMessage(ready); result.current.handleExportLayout(layout()); await jest.advanceTimersByTimeAsync(320); });
      expect(mockCapture).not.toHaveBeenCalled();
      await unmount();
      await act(async () => { await pending; });
      await waitFor(() => expect(mockDeletedDirectories.has(directory)).toBe(true));
      expect(mockCapture).not.toHaveBeenCalled();
      expect(mockSave).not.toHaveBeenCalled();
    } finally { AppState.currentState = originalState; }
  });

  it('does not persist the previous account preferences during account hydration', async () => {
    const second = deferred<{ value: string }>();
    const save = jest.fn<(_id: string, _prefs: { value: string }) => Promise<void>>(async () => undefined);
    const preferences = { load: (id: string) => id === 'account-a' ? Promise.resolve({ value: 'a' }) : second.promise, save };
    const { result, rerender } = await renderHook(({ accountId }: { accountId: string }) => useBestImageScreenController({
      ...config, accountId, preferences, defaultPreferences: { value: '' },
    }), { initialProps: { accountId: 'account-a' } });
    expect(result.current.prefs).toEqual({ value: 'a' });
    save.mockClear();
    await rerender({ accountId: 'account-b' });
    expect(result.current.prefsReady).toBe(false); expect(save).not.toHaveBeenCalled();
    await act(async () => { second.resolve({ value: 'b' }); });
    expect(save).not.toHaveBeenCalled();
    await act(async () => { result.current.setPrefs(current => ({ ...current, value: current.value + '-edited' })); });
    expect(save).toHaveBeenCalledWith('account-b', { value: 'b-edited' });
    expect(save).not.toHaveBeenCalledWith('account-b', { value: 'a' });
  });

  it('preserves unread fields and the latest updater after a failed native read', async () => {
    const reading = deferred<{ value: string; unchanged: number }>();
    const load = jest.fn<() => Promise<{ value: string; unchanged: number }>>()
      .mockRejectedValueOnce(new Error('locked')).mockImplementation(() => reading.promise);
    const save = jest.fn<(_id: string, _value: { value: string; unchanged: number }) => Promise<void>>(async () => undefined);
    const { result } = await renderHook(() => useBestImageScreenController({
      ...config, defaultPreferences: { value: '', unchanged: 0 }, preferences: { load, save },
    }));
    await act(async () => { result.current.setPrefs(current => ({ ...current, value: 'first' })); });
    await act(async () => { await jest.advanceTimersByTimeAsync(300_000); });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.prefsReady).toBe(false);
    await act(async () => { result.current.setPrefs(current => ({ ...current, value: current.value + '-latest' })); });
    await act(async () => { reading.resolve({ value: 'stored', unchanged: 14 }); });
    expect(result.current.prefs).toEqual({ value: 'first-latest', unchanged: 14 });
    expect(save).toHaveBeenLastCalledWith('account-a', { value: 'first-latest', unchanged: 14 });
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: '样式读取失败' }));
  });

  it('automatically saves the current selection after a native write failure', async () => {
    let stored = { value: 'stored' };
    const save = jest.fn<(_id: string, value: typeof stored) => Promise<void>>()
      .mockRejectedValueOnce(new Error('locked')).mockImplementation(async (_id, value) => { stored = value; });
    const { result } = await renderHook(() => useBestImageScreenController({
      ...config, defaultPreferences: stored, preferences: { load: async () => stored, save },
    }));
    await act(async () => { result.current.setPrefs(current => ({ ...current, value: 'chosen' })); });
    expect(stored.value).toBe('stored');
    expect(result.current.prefs.value).toBe('chosen');
    await act(async () => { await jest.advanceTimersByTimeAsync(500); });
    expect(stored.value).toBe('chosen');
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: '样式保存失败' }));
  });

  it('ignores an old account read that finishes after switching accounts', async () => {
    const first = deferred<{ value: string }>();
    const save = jest.fn<(_id: string, _value: { value: string }) => Promise<void>>(async () => undefined);
    const preferences = { load: (id: string) => id === 'account-a' ? first.promise : Promise.resolve({ value: 'b' }), save };
    const { result, rerender } = await renderHook(({ accountId }: { accountId: string }) => useBestImageScreenController({
      ...config, accountId, defaultPreferences: { value: '' }, preferences,
    }), { initialProps: { accountId: 'account-a' } });
    await rerender({ accountId: 'account-b' });
    await act(async () => { first.resolve({ value: 'a' }); });
    expect(result.current.prefs).toEqual({ value: 'b' });
    await act(async () => { result.current.setPrefs(current => ({ ...current, value: 'chosen' })); });
    expect(save).toHaveBeenCalledWith('account-b', { value: 'chosen' });
    expect(save).not.toHaveBeenCalledWith('account-a', expect.anything());
  });

  it('hydrates a revisited account independently from its previous ready view', async () => {
    const second = deferred<{ ratingStyle: string; unchanged: number }>();
    const returned = deferred<{ ratingStyle: string; unchanged: number }>();
    let stored = { ratingStyle: 'app', unchanged: 7 };
    const save = jest.fn<(_id: string, value: typeof stored) => Promise<void>>(async (_id, value) => { stored = value; });
    const load = jest.fn<(_id: string) => Promise<typeof stored>>()
      .mockResolvedValueOnce(stored).mockImplementationOnce(() => second.promise).mockImplementationOnce(() => returned.promise);
    const { result, rerender } = await renderHook(({ accountId }: { accountId: string }) => useBestImageScreenController({
      ...config, accountId, defaultPreferences: { ratingStyle: 'game', unchanged: 0 }, preferences: { load, save },
    }), { initialProps: { accountId: 'account-a' } });
    expect(result.current.prefs.ratingStyle).toBe('app');
    expect(result.current.prefsReady).toBe(true);
    await rerender({ accountId: 'account-b' });
    await rerender({ accountId: 'account-a' });
    expect(result.current.prefsReady).toBe(false);
    expect(result.current.prefs).toEqual({ ratingStyle: 'game', unchanged: 0 });
    await act(async () => { result.current.setPrefs(current => ({ ...current, ratingStyle: 'app' })); });
    expect(save).not.toHaveBeenCalled();
    await act(async () => { returned.resolve({ ratingStyle: 'game', unchanged: 14 }); });
    expect(result.current.prefsReady).toBe(true);
    expect(result.current.prefs).toEqual({ ratingStyle: 'app', unchanged: 14 });
    expect(stored).toEqual({ ratingStyle: 'app', unchanged: 14 });
    expect(save).toHaveBeenCalledWith('account-a', stored);
    expect(save).not.toHaveBeenCalledWith('account-b', expect.anything());
  });

  it('retries real HTML write failure and waits for a slow successful write', async () => {
    const writing = deferred<void>();
    mockWrite.mockRejectedValueOnce(new Error('disk full')).mockImplementationOnce(async (uri, content) => {
      await writing.promise; mockFiles.set(uri, content);
    });
    const pages = ['<p>content</p>'];
    const template = { assets: [], build: () => pages };
    const { result } = await renderHook(() => {
      const controller = useBestImageScreenController(config);
      return usePreparedBestImageSources(template, controller.assetSession, controller.assetSession.directory, controller.cancelExportRequest);
    });
    expect(result.current.sources).toBeNull();
    expect(result.current.error).toBe('成绩图片准备失败，正在自动重试。');
    await act(async () => { await jest.advanceTimersByTimeAsync(500); });
    await act(async () => { await jest.advanceTimersByTimeAsync(300_000); });
    expect(result.current.sources).toBeNull();
    await act(async () => { writing.resolve(); });
    expect(result.current.error).toBeNull();
    expect(mockFiles.get(result.current.sources![0]!.uri)).toBe('<p>content</p>');
  });

  it('waits for declared template assets and reuses them across output changes', async () => {
    const reading = deferred<string>(); mockBase64.mockReturnValueOnce(reading.promise);
    const { result, rerender } = await renderHook(({ width }: { width: number }) => {
      const controller = useBestImageScreenController(config);
      const template = useMemo(() => ({
        assets: [{ id: 'card', key: 'master', sources: ['file:///cover.png'],
          build: (images: readonly string[]) => `<svg><image href="${images[0]}"/></svg>` }],
        build: (urls: Readonly<Record<string, string>>) => [`<img width="${width}" src="${urls.card}">`],
      }), [width]);
      return usePreparedBestImageSources(template, controller.assetSession, controller.assetSession.directory, controller.cancelExportRequest);
    }, { initialProps: { width: 1080 } });
    expect(result.current.htmlPages).toBeNull();
    expect(result.current.sources).toBeNull();
    await act(async () => { reading.resolve('Y292ZXI='); });
    await waitFor(() => expect(result.current.sources).not.toBeNull());
    const html = mockFiles.get(result.current.sources![0]!.uri)!;
    const background = /src="([^"]+)"/u.exec(html)![1]!;
    expect(mockFiles.get(background)).toBe('<svg><image href="data:image/png;base64,Y292ZXI="/></svg>');
    expect(html).toContain('width="1080"');
    mockBase64.mockRejectedValue(new Error('source unavailable'));
    await rerender({ width: 2160 });
    await waitFor(() => expect(mockFiles.get(result.current.sources?.[0]?.uri ?? '')).toBe(`<img width="2160" src="${background}">`));
    expect(mockFiles.get(background)).toBe('<svg><image href="data:image/png;base64,Y292ZXI="/></svg>');
  });

  it.each(['inactive', 'background'] as const)('pauses HTML recovery while %s and retains completed files', async state => {
    const originalState = AppState.currentState;
    AppState.currentState = 'active';
    let change: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'change') change = listener;
      return { remove: () => undefined };
    });
    try {
      mockWrite.mockRejectedValueOnce(new Error('disk full'));
      const pages = ['<p>retained</p>'];
      const template = { assets: [], build: () => pages };
      const { result } = await renderHook(() => {
        const controller = useBestImageScreenController(config);
        return usePreparedBestImageSources(template, controller.assetSession, controller.assetSession.directory, controller.cancelExportRequest);
      }, { wrapper: AppLifecycleProvider });
      await act(async () => { await jest.advanceTimersByTimeAsync(0); });
      expect(result.current.error).toBe('成绩图片准备失败，正在自动重试。');
      await act(async () => { change?.(state); });
      await act(async () => { await jest.advanceTimersByTimeAsync(300_000); });
      expect(result.current.sources).toBeNull();
      expect([...mockFiles.values()]).not.toContain('<p>retained</p>');
      await act(async () => { change?.('active'); });
      await act(async () => { await jest.advanceTimersByTimeAsync(0); });
      const uri = result.current.sources![0]!.uri;
      expect(mockFiles.get(uri)).toBe('<p>retained</p>');
      await act(async () => { change?.(state); });
      await act(async () => { change?.('active'); });
      await act(async () => { await jest.advanceTimersByTimeAsync(0); });
      expect(result.current.sources![0]!.uri).toBe(uri);
      expect(mockFiles.get(uri)).toBe('<p>retained</p>');
    } finally { AppState.currentState = originalState; }
  });

  it('discards late HTML after resource clearing and prepares a current source', async () => {
    const writing = deferred<void>();
    let oldUri = '';
    mockWrite.mockImplementationOnce(async (uri, content) => {
      oldUri = uri;
      await writing.promise; mockFiles.set(uri, content);
    });
    const pages = ['<p>invalidated</p>'];
    const template = { assets: [], build: () => pages };
    const { result } = await renderHook(() => {
      const controller = useBestImageScreenController(config);
      return usePreparedBestImageSources(template, controller.assetSession, controller.assetSession.directory, controller.cancelExportRequest);
    });
    await waitFor(() => expect(oldUri).not.toBe(''));
    await act(async () => { invalidateResourceWrites('maimai'); writing.resolve(); });
    await waitFor(() => expect(result.current.sources).not.toBeNull());
    expect(result.current.sources![0]!.uri).not.toBe(oldUri);
    expect(mockFiles.has(oldUri)).toBe(false);
    expect(mockFiles.get(result.current.sources![0]!.uri)).toBe('<p>invalidated</p>');
  });
});

jest.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/$/u, '')).join('/');
    }
    get type() { return 'image/png'; }
    base64() { return mockBase64(); }
  }
  return { File: Entry, Directory: Entry, Paths: { cache: 'file:///cache', document: 'file:///document' } };
});
jest.mock('expo-file-system/legacy', () => ({
  makeDirectoryAsync: async () => undefined,
  getInfoAsync: async (uri: string) => ({ exists: [...mockFiles.keys()].some((key) => key === uri || key.startsWith(uri + '/')), size: mockFiles.get(uri)?.length ?? 0 }),
  readDirectoryAsync: async (uri: string) => [...new Set([...mockFiles.keys()].filter((key) => key.startsWith(uri + '/')).map((key) => key.slice(uri.length + 1).split('/')[0]))],
  writeAsStringAsync: (uri: string, content: string) => mockWrite(uri, content),
  moveAsync: async ({ from, to }: { from: string; to: string }) => { mockFiles.set(to, mockFiles.get(from)!); mockFiles.delete(from); },
  deleteAsync: async (uri: string) => {
    mockDeletedDirectories.add(uri);
    for (const key of mockFiles.keys()) if (key === uri || key.startsWith(uri + '/')) mockFiles.delete(key);
  },
}));
