import { crc32 } from 'node:zlib';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import {
  CHART_PREVIEW_CRC_CHUNK_BYTES,
  CHART_PREVIEW_MAX_DOWNLOAD_BYTES,
  CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES,
  CHART_PREVIEW_MAX_GIF_FRAMES,
  assertChartPreviewDownloadBytes,
  assertChartPreviewGifFrameCount,
  chartPreviewDeclaredUncompressedSize,
  ChartPreviewBudgetError,
  ChartPreviewBudgetExceededError,
  createChartPreviewActualBytes,
  readBudgetedZipEntry,
  readBudgetedChartDownload,
} from '@/features/chart-preview-shared/chart-preview-resource-budget';

async function zipEntry(bytes: Uint8Array, checksum = bytes.byteLength === 0 ? 0 : crc32(bytes)) {
  const source = new JSZip(); source.file('chart', bytes);
  const zip = await JSZip.loadAsync(await source.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  const entry = zip.file('chart')!;
  (entry as typeof entry & { _data: { crc32: number } })._data.crc32 = checksum;
  return entry;
}

describe('chart preview actual bytes and cancellation', () => {
  it('checks downloaded size and cancellation before allocating a file buffer', async () => {
    const bytes = vi.fn(async () => new Uint8Array([1, 2]));
    await expect(readBudgetedChartDownload({ size: CHART_PREVIEW_MAX_DOWNLOAD_BYTES + 1, bytes }))
      .rejects.toBeInstanceOf(ChartPreviewBudgetExceededError);
    expect(bytes).not.toHaveBeenCalled();
    const controller = new AbortController(); controller.abort(new Error('cancelled'));
    await expect(readBudgetedChartDownload({ size: 2, bytes }, { signal: controller.signal })).rejects.toThrow('cancelled');
    expect(bytes).not.toHaveBeenCalled();
    const buffer = new Uint8Array([1, 2]);
    bytes.mockResolvedValue(buffer);
    expect(await readBudgetedChartDownload({ size: 2, bytes })).toBe(buffer);
    const late = new AbortController();
    bytes.mockImplementation(async () => { late.abort(new Error('late cancel')); return buffer; });
    await expect(readBudgetedChartDownload({ size: 2, bytes }, { signal: late.signal })).rejects.toThrow('late cancel');
  });
  it('bounds GIF frame counts before allocating decoded frames', () => {
    expect(() => assertChartPreviewGifFrameCount(CHART_PREVIEW_MAX_GIF_FRAMES)).not.toThrow();
    for (const count of [CHART_PREVIEW_MAX_GIF_FRAMES + 1, Infinity, NaN, -1, 1.5]) {
      expect(() => assertChartPreviewGifFrameCount(count)).toThrow(ChartPreviewBudgetExceededError);
    }
  });
  it('accumulates actual uncompressed bytes and stops the next entry at the total budget', async () => {
    const actualBytes = createChartPreviewActualBytes();
    actualBytes.actualBytes = CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES - 4;
    await readBudgetedZipEntry(await zipEntry(Uint8Array.from([1, 2, 3, 4])), { actualBytes });
    expect(actualBytes.actualBytes).toBe(CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES);
    await expect(readBudgetedZipEntry(await zipEntry(Uint8Array.from([5])), { actualBytes }))
      .rejects.toBeInstanceOf(ChartPreviewBudgetError);
    expect(actualBytes.actualBytes).toBe(CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES);
  });

  it('checks cancellation while checksumming a large entry', async () => {
    let checks = 0;
    const bytes = new Uint8Array(CHART_PREVIEW_CRC_CHUNK_BYTES + 1);
    await expect(readBudgetedZipEntry(await zipEntry(bytes, 0), {
      assertCurrent() {
        checks += 1;
        if (checks >= 3) throw new Error('操作已取消');
      },
    })).rejects.toThrow('操作已取消');
    expect(checks).toBeGreaterThanOrEqual(3);
  });

  it('stops inflation as soon as output exceeds a forged declaration', async () => {
    const entry = await zipEntry(new Uint8Array(16 * 1024 * 1024));
    (entry as typeof entry & { _data: { uncompressedSize: number } })._data.uncompressedSize = 1;
    let outputBytes = 0;
    const actual = entry as typeof entry & { internalStream(type: 'uint8array'): { on(event: 'data', fn: (bytes: Uint8Array) => void): unknown } };
    const original = actual.internalStream.bind(entry);
    actual.internalStream = type => {
      const stream = original(type); stream.on('data', bytes => { outputBytes += bytes.length; }); return stream;
    };
    await expect(readBudgetedZipEntry(entry)).rejects.toThrow('大小与声明不一致');
    expect(outputBytes).toBeLessThanOrEqual(64 * 1024);
  });

  it('rejects a wrong CRC and aborts an active inflater without uncaught callbacks', async () => {
    await expect(readBudgetedZipEntry(await zipEntry(new Uint8Array([1, 2, 3]), 0))).rejects.toThrow('校验失败');
    const controller = new AbortController();
    const entry = await zipEntry(new Uint8Array(1024 * 1024));
    const task = readBudgetedZipEntry(entry, { signal: controller.signal });
    setTimeout(() => controller.abort(new Error('主动取消')), 0);
    await expect(task).rejects.toThrow('主动取消');
  });

  it('handles abort inside a ZIP data observer without leaking an EventTarget exception', async () => {
    const controller = new AbortController();
    const entry = await zipEntry(new Uint8Array(16 * 1024 * 1024));
    let outputBytes = 0;
    const actual = entry as typeof entry & { internalStream(type: 'uint8array'): { on(event: 'data', fn: (bytes: Uint8Array) => void): unknown } };
    const original = actual.internalStream.bind(entry);
    actual.internalStream = type => {
      const stream = original(type);
      stream.on('data', bytes => { outputBytes += bytes.length; controller.abort(new Error('同步取消')); });
      return stream;
    };
    await expect(readBudgetedZipEntry(entry, { signal: controller.signal })).rejects.toThrow('同步取消');
    expect(outputBytes).toBeLessThanOrEqual(64 * 1024);
  });

  it('separates budget overflow from undeterminable declared sizes', () => {
    expect(() => assertChartPreviewDownloadBytes(CHART_PREVIEW_MAX_DOWNLOAD_BYTES + 1))
      .toThrow(ChartPreviewBudgetExceededError);
    expect(() => assertChartPreviewDownloadBytes(CHART_PREVIEW_MAX_DOWNLOAD_BYTES + 1))
      .toThrow(ChartPreviewBudgetError);
    expect(() => chartPreviewDeclaredUncompressedSize({ dir: false }))
      .toThrow(ChartPreviewBudgetError);
    expect(() => chartPreviewDeclaredUncompressedSize({ dir: false }))
      .not.toThrow(ChartPreviewBudgetExceededError);
  });
});
