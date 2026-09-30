import type { File, FileHandle } from 'expo-file-system';
import { CHART_PREVIEW_CRC_CHUNK_BYTES, createChartPreviewCrc32 } from '../chart-preview-shared/chart-preview-resource-budget';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { ChartPackageDownloadError, throwIfChartDownloadCancelled, type ChartPackageDownloadOptions } from './chart-download-shared';

const ZIP32_MAX = 0xffffffff;
type ZipEntry = { name: Uint8Array; size: number; offset: number; crc: number; directory?: boolean };

function uint64(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
  view.setUint32(offset + 4, Math.floor(value / 0x100000000), true);
}

/** STORE 头只保留长度、CRC 与偏移，媒体正文直接从文件写入文件。 */
export function storedZipHeader(entry: ZipEntry, central = false): Uint8Array {
  const largeSize = entry.size >= ZIP32_MAX;
  const largeOffset = central && entry.offset >= ZIP32_MAX;
  const extraLength = largeSize || largeOffset ? 4 + (largeSize ? 16 : 0) + (largeOffset ? 8 : 0) : 0;
  const baseLength = central ? 46 : 30;
  const output = new Uint8Array(baseLength + entry.name.length + extraLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, central ? 0x02014b50 : 0x04034b50, true);
  const base = central ? 6 : 4;
  if (central) view.setUint16(4, 45, true);
  view.setUint16(base, largeSize || largeOffset ? 45 : 20, true);
  view.setUint16(base + 2, 0x800, true);
  view.setUint16(base + 8, 0x21, true);
  view.setUint32(base + 10, entry.crc, true);
  const sizeField = largeSize ? ZIP32_MAX : entry.size;
  view.setUint32(base + 14, sizeField, true);
  view.setUint32(base + 18, sizeField, true);
  view.setUint16(base + 22, entry.name.length, true);
  view.setUint16(base + 24, extraLength, true);
  if (central) {
    view.setUint32(38, entry.directory ? 0x10 : 0, true);
    view.setUint32(42, largeOffset ? ZIP32_MAX : entry.offset, true);
  }
  output.set(entry.name, baseLength);
  if (extraLength) {
    let offset = baseLength + entry.name.length;
    view.setUint16(offset, 1, true);
    view.setUint16(offset + 2, extraLength - 4, true);
    offset += 4;
    if (largeSize) { uint64(view, offset, entry.size); uint64(view, offset + 8, entry.size); offset += 16; }
    if (largeOffset) uint64(view, offset, entry.offset);
  }
  return output;
}

export function storedZipEnd(count: number, centralSize: number, centralOffset: number): Uint8Array {
  const zip64 = count >= 0xffff || centralSize >= ZIP32_MAX || centralOffset >= ZIP32_MAX;
  const output = new Uint8Array(zip64 ? 98 : 22);
  const view = new DataView(output.buffer);
  let offset = 0;
  if (zip64) {
    view.setUint32(0, 0x06064b50, true);
    uint64(view, 4, 44);
    view.setUint16(12, 45, true); view.setUint16(14, 45, true);
    uint64(view, 24, count); uint64(view, 32, count);
    uint64(view, 40, centralSize); uint64(view, 48, centralOffset);
    view.setUint32(56, 0x07064b50, true);
    uint64(view, 64, centralOffset + centralSize);
    view.setUint32(72, 1, true);
    offset = 76;
  }
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, Math.min(count, 0xffff), true);
  view.setUint16(offset + 10, Math.min(count, 0xffff), true);
  view.setUint32(offset + 12, Math.min(centralSize, ZIP32_MAX), true);
  view.setUint32(offset + 16, Math.min(centralOffset, ZIP32_MAX), true);
  return output;
}

function closeFile(handle: FileHandle): void {
  try { handle.close(); }
  catch (error) { recordRuntimeError('chart-package-file-close', error, false, { phase: 'cleanup' }); }
}

function readFileBytes(handle: FileHandle, length: number): Uint8Array {
  const start = handle.offset;
  const bytes = handle.readBytes(length);
  const end = handle.offset;
  if (start === null || end === null || end <= start || end - start > length || end - start > bytes.length) {
    throw new ChartPackageDownloadError('谱面资源读取不完整，请稍后重试。');
  }
  return bytes.subarray(0, end - start);
}

function writeFileBytes(handle: FileHandle, bytes: Uint8Array): void {
  let written = 0;
  while (written < bytes.length) {
    const start = handle.offset;
    handle.writeBytes(bytes.subarray(written));
    const end = handle.offset;
    if (start === null || end === null || end <= start || end - start > bytes.length - written) {
      throw new ChartPackageDownloadError('谱面压缩包写入不完整，请稍后重试。');
    }
    written += end - start;
  }
}

function coverFileName(handle: FileHandle, size: number): string {
  const signature = new Uint8Array(Math.min(8, size));
  let read = 0;
  while (read < signature.length) {
    const bytes = readFileBytes(handle, signature.length - read);
    signature.set(bytes, read); read += bytes.length;
  }
  handle.offset = 0;
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => signature[index] === byte)) return 'bg.png';
  if (signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) return 'bg.jpg';
  throw new ChartPackageDownloadError('该谱面的封面暂时无法保存，请稍后重试。');
}

export async function writeStoredZip(
  output: File,
  folder: string,
  files: ReadonlyMap<string, File>,
  options: ChartPackageDownloadOptions,
): Promise<void> {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];
  const total = [...files.values()].reduce((sum, file) => sum + file.size, 0);
  let copied = 0;
  let offset = 0;
  output.create();
  const target = output.open();
  const write = (bytes: Uint8Array) => {
    writeFileBytes(target, bytes);
    offset += bytes.length;
    if (!Number.isSafeInteger(offset)) throw new ChartPackageDownloadError('谱面压缩包无法保存，请稍后重试。');
  };
  try {
    const directory: ZipEntry = { name: encoder.encode(`${folder}/`), size: 0, offset, crc: 0, directory: true };
    write(storedZipHeader(directory)); entries.push(directory);
    for (const [fileName, file] of files) {
      throwIfChartDownloadCancelled(options.signal);
      const source = file.open();
      try {
        const size = source.size;
        if (size === null || !Number.isSafeInteger(size) || size < 0) throw new ChartPackageDownloadError('无法读取谱面资源，请稍后重试。');
        const name = fileName === 'bg.auto' ? coverFileName(source, size) : fileName;
        const entry: ZipEntry = { name: encoder.encode(`${folder}/${name}`), size, offset, crc: 0 };
        if (entry.name.length > 0xffff) throw new ChartPackageDownloadError('谱面文件名过长，请稍后重试。');
        write(storedZipHeader(entry));
        const crc = createChartPreviewCrc32();
        let read = 0;
        while (read < size) {
          throwIfChartDownloadCancelled(options.signal);
          const requested = Math.min(CHART_PREVIEW_CRC_CHUNK_BYTES, size - read);
          const bytes = readFileBytes(source, requested);
          crc.update(bytes); write(bytes); read += bytes.length; copied += bytes.length;
          options.onProgress?.({ phase: 'organizing', progress: total > 0 ? Math.min(1, copied / total) : 1 });
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
        throwIfChartDownloadCancelled(options.signal);
        if (source.size !== size) throw new ChartPackageDownloadError('谱面资源已变化，请重新下载。');
        entry.crc = crc.value();
        const end = offset;
        target.offset = entry.offset;
        writeFileBytes(target, storedZipHeader(entry));
        target.offset = end;
        entries.push(entry);
      } finally { closeFile(source); }
    }
    const centralOffset = offset;
    for (const entry of entries) write(storedZipHeader(entry, true));
    write(storedZipEnd(entries.length, offset - centralOffset, centralOffset));
    throwIfChartDownloadCancelled(options.signal);
  } finally { closeFile(target); }
}
