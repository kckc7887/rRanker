import { jest } from '@jest/globals';
import { Directory } from 'expo-file-system';
import { downloadPhiraChartPreviewZip, stagePhiraRpeBundle } from '@/features/phigros-chart-preview/prepare-phigros-chart-preview-webview';

const mockWrites = jest.fn();
const mockBytes = jest.fn<() => Promise<Uint8Array>>();
let mockSize = 0;
jest.mock('expo-file-system', () => ({
  Directory: class { uri = 'file:///preview'; create = jest.fn(); },
  File: class { exists = false; create = jest.fn(); delete = jest.fn(); write(bytes: Uint8Array) { mockWrites(bytes); } },
}));
jest.mock('../assets/phigros-chart-preview/index.html', () => 1);
jest.mock('../assets/phigros-chart-preview/player.bundle', () => 2);
jest.mock('@/features/chart-download-shared/chart-download-shared', () => ({
  downloadChartResource: async () => ({ get size() { return mockSize; }, bytes: mockBytes }),
}));
jest.mock('@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan', () => ({ prepareChartPreviewWebviewFromPlan: jest.fn() }));
jest.mock('@/features/chart-preview-shared/chart-preview-assets', () => ({ chartPreviewStageDirectory: jest.fn() }));

describe('native Phira staging', () => {
  beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it.each([1, 8 * 1024 * 1024])('yields between resource batches and stops on cancellation for %i byte files', async size => {
    const controller = new AbortController();
    const bytes = new Uint8Array(size);
    const files = Array.from({ length: 40 }, (_, i) => ({ name: `image-${i}.png`, bytes }));
    const pending = stagePhiraRpeBundle(1, files, new Directory('file:///preview'), controller.signal);
    const rejected = expect(pending).rejects.toThrow('cancel staging');
    const firstBatch = size === 1 ? 16 : 1;
    expect(mockWrites).toHaveBeenCalledTimes(firstBatch);
    controller.abort(new Error('cancel staging'));
    await jest.runAllTimersAsync();
    await rejected;
    expect(mockWrites).toHaveBeenCalledTimes(firstBatch);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('writes all resources across batches without changing their buffers', async () => {
    const files = Array.from({ length: 41 }, (_, i) => ({ name: `nested/${i}.png`, bytes: new Uint8Array([i]) }));
    const pending = stagePhiraRpeBundle(2, files, new Directory('file:///preview'));
    await jest.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ basePath: './rpe/2/' });
    expect(mockWrites).toHaveBeenCalledTimes(files.length);
    files.forEach((file, i) => expect(mockWrites.mock.calls[i]![0]).toBe(file.bytes));
  });

  it.each([100, 400, 1600])('stages a %i-resource ladder completely, in order, with a bounded number of timers', async count => {
    const files = Array.from({ length: count }, (_, i) => ({ name: `ladder/${i}.png`, bytes: new Uint8Array([i % 256]) }));
    const pending = stagePhiraRpeBundle(3, files, new Directory('file:///preview'));
    expect(jest.getTimerCount()).toBeLessThanOrEqual(1);
    await jest.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ basePath: './rpe/3/' });
    expect(mockWrites).toHaveBeenCalledTimes(count);
    files.forEach((file, i) => expect(mockWrites.mock.calls[i]![0]).toBe(file.bytes));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('checks download size before bytes and keeps a whole buffer without copying', async () => {
    const controller = new AbortController();
    mockSize = 257 * 1024 * 1024;
    await expect(downloadPhiraChartPreviewZip(new Directory('file:///preview'), 'https://example.com/chart.zip', controller.signal)).rejects.toThrow('超出预算');
    expect(mockBytes).not.toHaveBeenCalled();
    const bytes = new Uint8Array([1, 2, 3]);
    mockSize = bytes.byteLength;
    mockBytes.mockResolvedValue(bytes);
    await expect(downloadPhiraChartPreviewZip(new Directory('file:///preview'), 'https://example.com/chart.zip', controller.signal)).resolves.toBe(bytes.buffer);
    mockBytes.mockResolvedValue(bytes.subarray(1));
    const sliced = await downloadPhiraChartPreviewZip(new Directory('file:///preview'), 'https://example.com/chart.zip', controller.signal);
    expect([...new Uint8Array(sliced)]).toEqual([2, 3]);
  });
});
