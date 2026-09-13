import { jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useBestImageScreenController } from '@/features/best-image/use-best-image-screen-controller';

const mockPermission = jest.fn<() => Promise<void>>();
const mockCapture = jest.fn<() => Promise<string>>();
const mockSave = jest.fn<(uri: string, name: string) => Promise<void>>();
const mockDelete = jest.fn();
const mockNotify = jest.fn();
jest.mock('react-native-view-shot', () => ({ captureRef: () => mockCapture() }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: mockNotify }) }));
jest.mock('@/features/best-image/best-image-export', () => ({
  bestImageCaptureDimensions: () => ({ width: 1080, height: 1440 }), deleteBestImageCapture: (uri: string) => mockDelete(uri),
  isDrawViewHierarchyError: () => false, requestBestImageExportPermission: () => mockPermission(),
  saveBestImageCapture: (uri: string, name: string) => mockSave(uri, name), shouldUseBestImageRenderInContext: () => false,
}));
const config = {
  accountId: 'account-a', defaultType: 'best', defaultWidth: 1080, defaultQuantityText: '50', defaultPreferences: {},
  preferences: { load: async () => ({}), save: async () => undefined }, defaultExportHeight: () => 1440,
};
const runtime = (count = 1) => ({
  pages: Array.from({ length: count }, (_, i) => ({ id: String(i) })), htmlPages: Array(count).fill('<html/>') as string[],
  sources: Array.from({ length: count }, () => ({ html: '<html/>', baseUrl: 'file:///' })),
  canExport: true, buildExportFilename: (index: number) => `${index}.png`,
});
const ready = '{"type":"best-image-ready","width":1080,"height":1440}';
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('best image export lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks();
    mockPermission.mockResolvedValue(undefined); mockSave.mockResolvedValue(undefined);
    mockCapture.mockResolvedValue('file:///capture.png');
  });
  afterEach(() => jest.useRealTimers());

  it('locks synchronously before permissions and cancels before mounting a canvas', async () => {
    const permission = deferred<void>(); mockPermission.mockReturnValueOnce(permission.promise);
    const { result } = await renderHook(() => useBestImageScreenController(config));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime()); await result.current.exportImages(runtime()); });
    expect(mockPermission).toHaveBeenCalledTimes(1);
    await act(async () => { result.current.cancelExportRequest(); permission.resolve(); await pending; });
    expect(result.current.exportIndex).toBeNull(); expect(mockCapture).not.toHaveBeenCalled(); expect(mockNotify).not.toHaveBeenCalled();
  });

  it('cancels the native-layout delay and rejects callbacks from a previous canvas', async () => {
    const { result } = await renderHook(() => useBestImageScreenController(config));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime()); });
    const oldMessage = result.current.handleExportMessage;
    await act(async () => { result.current.handleExportMessage(ready); result.current.cancelExportRequest(); await pending; });
    expect(mockCapture).not.toHaveBeenCalled();
    await act(async () => { pending = result.current.exportImages(runtime()); });
    await act(async () => { oldMessage(ready); await jest.advanceTimersByTimeAsync(320); });
    expect(mockCapture).not.toHaveBeenCalled();
    await act(async () => { result.current.handleExportMessage(ready); await jest.advanceTimersByTimeAsync(320); await pending; });
    expect(mockCapture).toHaveBeenCalledTimes(1); expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: '导出完成' }));
  });

  it('cleans up a cancelled in-flight capture without saving or starting another export', async () => {
    const capture = deferred<string>(); mockCapture.mockReturnValueOnce(capture.promise);
    const { result } = await renderHook(() => useBestImageScreenController(config));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime(2)); });
    await act(async () => { result.current.handleExportMessage(ready); await jest.advanceTimersByTimeAsync(320); });
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
    await act(async () => { result.current.handleExportMessage(ready); await jest.advanceTimersByTimeAsync(320); });
    expect(result.current.exportIndex).toBe(1);
    await act(async () => { result.current.handleExportMessage(ready); await jest.advanceTimersByTimeAsync(320); });
    expect(mockSave).toHaveBeenCalledTimes(1);
    await act(async () => { result.current.cancelExportRequest(); });
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
    expect(save).toHaveBeenCalledWith('account-b', { value: 'b' });
    expect(save).not.toHaveBeenCalledWith('account-b', { value: 'a' });
  });
});
