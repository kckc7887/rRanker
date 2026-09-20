import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Directory } from 'expo-file-system';
import { ChartPackageDownloadCancelledError, downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import { ProviderError } from '@/providers/errors';

const native = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(), download: vi.fn(), cancel: vi.fn(), diagnostic: vi.fn(),
}));
vi.mock('expo-file-system', () => {
  class Directory { constructor(readonly uri: string) {} }
  class File {
    readonly uri: string;
    constructor(directory: Directory, name: string) { this.uri = `${directory.uri}/${name}`; }
    get exists() { return native.files.has(this.uri); }
    get size() { return native.files.get(this.uri)?.length ?? 0; }
    delete() { native.files.delete(this.uri); }
  }
  return { Directory, File, Paths: { cache: 'file:///cache' } };
});
vi.mock('expo-file-system/legacy', () => ({
  createDownloadResumable: (url: string, uri: string, _options: unknown, onProgress: unknown) => ({
    downloadAsync: () => native.download(url, uri, onProgress), cancelAsync: () => native.cancel(),
  }),
}));
vi.mock('@/services/runtime-diagnostics-recorder', () => ({
  nextRuntimeOperationId: () => 1, recordRuntimeDiagnostic: (...args: unknown[]) => native.diagnostic(...args),
}));

const directory = new Directory('file:///session');
const uri = 'file:///session/resource.bin';
beforeEach(() => {
  native.files.clear(); vi.clearAllMocks();
  native.cancel.mockResolvedValue(undefined);
  native.download.mockImplementation(async () => {
    native.files.set(uri, new Uint8Array([1, 2, 3]));
    return { uri, status: 200, headers: {} };
  });
});

describe('公共资源下载响应与取消', () => {
  it('保留成功文件并仅记录受限请求字段', async () => {
    const file = await downloadChartResource(directory, 'resource.bin', 'https://download.test/private');
    expect(file.uri).toBe(uri);
    expect(file.size).toBe(3);
    const fields = native.diagnostic.mock.calls.at(-1)![1];
    expect(fields).toMatchObject({ result: 'success', status: 200, source: 'chart-resource-download' });
    expect(JSON.stringify(fields)).not.toContain('download.test');
    expect(JSON.stringify(fields)).not.toContain('resource.bin');
  });

  it.each([[503, 'network'], [404, 'no_data'], [403, 'permission'], [429, 'rate_limit']])(
    '拒绝HTTP %i的非空错误文件并保留规范化错误', async (status, code) => {
      native.download.mockImplementation(async () => {
        native.files.set(uri, new TextEncoder().encode('<html>unavailable</html>'));
        return { uri, status, headers: {} };
      });
      await expect(downloadChartResource(directory, 'resource.bin', 'https://download.test'))
        .rejects.toMatchObject({ name: 'ProviderError', code });
      expect(native.files.size).toBe(0);
      expect(native.diagnostic.mock.calls.at(-1)![1]).toMatchObject({ status, errorCode: code, result: 'error' });
    },
  );

  it('空成功响应仍为无效内容，网络异常统一归一化', async () => {
    native.download.mockResolvedValueOnce({ uri, status: 200, headers: {} });
    await expect(downloadChartResource(directory, 'resource.bin', 'https://download.test'))
      .rejects.toMatchObject({ code: 'upstream_schema' });
    native.download.mockRejectedValueOnce(new Error('socket closed'));
    await expect(downloadChartResource(directory, 'resource.bin', 'https://download.test'))
      .rejects.toBeInstanceOf(ProviderError);
  });

  it('原生取消尚未返回也立即结束，迟到写入回收且不再报告进度', async () => {
    let complete!: (value: unknown) => void;
    let report!: (value: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void;
    native.cancel.mockImplementation(() => new Promise(() => {}));
    native.download.mockImplementation((_url, _uri, onProgress) => {
      report = onProgress;
      return new Promise(resolve => { complete = resolve; });
    });
    const controller = new AbortController();
    const progress = vi.fn();
    const pending = downloadChartResource(directory, 'resource.bin', 'https://download.test', controller.signal, progress);
    await Promise.resolve();
    const rejection = expect(pending).rejects.toBeInstanceOf(ChartPackageDownloadCancelledError);
    controller.abort();
    await rejection;
    expect(native.cancel).toHaveBeenCalledOnce();
    native.files.set(uri, new Uint8Array([9]));
    report({ totalBytesWritten: 1, totalBytesExpectedToWrite: 1 });
    complete({ uri, status: 200, headers: {} });
    await Promise.resolve(); await Promise.resolve();
    expect(native.files.size).toBe(0);
    expect(progress).not.toHaveBeenCalled();
  });

  it('已取消请求不会启动原生下载', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(downloadChartResource(directory, 'resource.bin', 'https://download.test', controller.signal))
      .rejects.toBeInstanceOf(ChartPackageDownloadCancelledError);
    expect(native.download).not.toHaveBeenCalled();
  });
});
