import { jest } from '@jest/globals';
import { Directory } from 'expo-file-system';
import { downloadPhiraChartPreviewZip, stagePhiraRpeBundle } from '@/features/phigros-chart-preview/prepare-phigros-chart-preview-webview';

const mockWrites = jest.fn<(path: string, bytes: Uint8Array) => void>();
const mockBytes = jest.fn<() => Promise<Uint8Array>>();
let mockSize = 0;
jest.mock('expo-file-system', () => ({
  Directory: class {
    uri: string;
    constructor(parent: string | { uri: string }, child?: string) { this.uri = (typeof parent === 'string' ? parent : parent.uri) + (child ? '/' + child : ''); }
    create = jest.fn();
  },
  File: class {
    uri: string;
    constructor(parent: { uri: string }, child: string) { this.uri = parent.uri + '/' + child; }
    exists = false; create = jest.fn(); delete = jest.fn();
    write(bytes: Uint8Array) { mockWrites(this.uri, bytes); }
  },
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

  it('stops writing resources after cancellation', async () => {
    const controller = new AbortController();
    mockWrites.mockImplementationOnce(() => controller.abort(new Error('cancel staging')));
    const files = [{ name: 'chart.json', bytes: new Uint8Array([1]) }, { name: 'music.ogg', bytes: new Uint8Array([2]) }];
    await expect(stagePhiraRpeBundle(1, files, new Directory('file:///preview'), controller.signal)).rejects.toThrow('cancel staging');
    expect(mockWrites).toHaveBeenCalledWith('file:///preview/rpe/1/chart.json', new Uint8Array([1]));
    expect(mockWrites).not.toHaveBeenCalledWith('file:///preview/rpe/1/music.ogg', expect.anything());
  });

  it('writes resources at their relative paths with intact byte contents', async () => {
    const files = [{ name: 'chart.json', bytes: new Uint8Array([1, 2]) }, { name: 'nested/image.png', bytes: new Uint8Array([3, 4]) }];
    await expect(stagePhiraRpeBundle(2, files, new Directory('file:///preview'))).resolves.toEqual({ basePath: './rpe/2/' });
    expect(mockWrites).toHaveBeenCalledWith('file:///preview/rpe/2/chart.json', new Uint8Array([1, 2]));
    expect(mockWrites).toHaveBeenCalledWith('file:///preview/rpe/2/nested/image.png', new Uint8Array([3, 4]));
  });

  it('rejects oversized downloads and returns only downloaded byte contents', async () => {
    const controller = new AbortController();
    mockSize = 257 * 1024 * 1024;
    await expect(downloadPhiraChartPreviewZip(new Directory('file:///preview'), 'https://example.com/chart.zip', controller.signal)).rejects.toThrow('超出预算');
    expect(mockBytes).not.toHaveBeenCalled();
    const bytes = new Uint8Array([1, 2, 3]);
    mockSize = bytes.byteLength;
    mockBytes.mockResolvedValue(bytes);
    const downloaded = await downloadPhiraChartPreviewZip(new Directory('file:///preview'), 'https://example.com/chart.zip', controller.signal);
    expect([...new Uint8Array(downloaded)]).toEqual([1, 2, 3]);
    mockBytes.mockResolvedValue(bytes.subarray(1));
    const sliced = await downloadPhiraChartPreviewZip(new Directory('file:///preview'), 'https://example.com/chart.zip', controller.signal);
    expect([...new Uint8Array(sliced)]).toEqual([2, 3]);
  });
});
