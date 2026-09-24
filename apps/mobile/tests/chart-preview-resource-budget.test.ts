import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  CHART_PREVIEW_CRC_CHUNK_BYTES,
  CHART_PREVIEW_MAX_DOWNLOAD_BYTES,
  CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES,
  assertChartPreviewDownloadBytes,
  chartPreviewDeclaredUncompressedSize,
  ChartPreviewBudgetError,
  ChartPreviewBudgetExceededError,
  createChartPreviewActualBytes,
  readBudgetedZipEntry,
} from '@/features/chart-preview-shared/chart-preview-resource-budget';

function zipEntry(bytes: Uint8Array, checksum = bytes.byteLength === 0 ? 0 : crc32(bytes)) {
  return {
    dir: false,
    _data: { uncompressedSize: bytes.byteLength, crc32: checksum },
    async: async () => bytes,
  };
}

describe('chart preview actual bytes and cancellation', () => {
  it('accumulates actual uncompressed bytes and stops the next entry at the total budget', async () => {
    const actualBytes = createChartPreviewActualBytes();
    actualBytes.actualBytes = CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES - 4;
    await readBudgetedZipEntry(zipEntry(Uint8Array.from([1, 2, 3, 4])), { actualBytes });
    expect(actualBytes.actualBytes).toBe(CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES);
    await expect(readBudgetedZipEntry(zipEntry(Uint8Array.from([5])), { actualBytes }))
      .rejects.toBeInstanceOf(ChartPreviewBudgetError);
    expect(actualBytes.actualBytes).toBe(CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES);
  });

  it('checks cancellation while checksumming a large entry', async () => {
    let checks = 0;
    const bytes = new Uint8Array(CHART_PREVIEW_CRC_CHUNK_BYTES + 1);
    await expect(readBudgetedZipEntry(zipEntry(bytes, 0), {
      assertCurrent() {
        checks += 1;
        if (checks >= 3) throw new Error('操作已取消');
      },
    })).rejects.toThrow('操作已取消');
    expect(checks).toBeGreaterThanOrEqual(3);
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
