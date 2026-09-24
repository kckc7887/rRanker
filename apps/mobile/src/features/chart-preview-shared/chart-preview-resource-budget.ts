/**
 * 谱面确认资源预算。下载、解压、事件、音符、循环、纹理与解析让出都使用有限上限。
 * 声明大小、实际读出字节、解码像素和进程内存是四套口径。
 * 本模块约束声明大小和实际读出字节；单张纹理像素由播放器在解码时检查。
 * JSZip 会先分配完整解压输出，随后的 CRC 按块让出并检查取消。这些常量不是进程内存上限。
 */

export const CHART_PREVIEW_MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
export const CHART_PREVIEW_MAX_ARCHIVE_ENTRIES = 4_096;
export const CHART_PREVIEW_MAX_ENTRY_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
export const CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
export const CHART_PREVIEW_MAX_EVENTS = 200_000;
export const CHART_PREVIEW_MAX_NOTES = 100_000;
export const CHART_PREVIEW_MAX_NESTING_DEPTH = 32;
/** 不超过该条数时才把循环展开成指令对象；超出后按时间求值。 */
export const CHART_PREVIEW_MAX_LOOP_EXPANSION = 4_096;
export const CHART_PREVIEW_MAX_TEXTURE_PIXELS = 4_096 * 4_096;
export const CHART_PREVIEW_MAX_GIF_FRAME_PIXELS = 2_048 * 2_048;
/** 长循环每隔这么多步检查取消，并在异步解析中让出主线程。 */
export const CHART_PREVIEW_PARSE_YIELD_INTERVAL = 128;
/** CRC 每处理这么多字节检查一次取消，并让出主线程。 */
export const CHART_PREVIEW_CRC_CHUNK_BYTES = 64 * 1024;

export class ChartPreviewBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChartPreviewBudgetError';
  }
}

export type ChartPreviewActualBytes = { actualBytes: number };

export function createChartPreviewActualBytes(): ChartPreviewActualBytes {
  return { actualBytes: 0 };
}

export type ChartPreviewCancellation = {
  signal?: AbortSignal;
  assertCurrent?: () => void;
  /** 同一次准备里实际读出的解压字节。超出总声明上限时停止后续条目。 */
  actualBytes?: ChartPreviewActualBytes;
};

type ZipEntryData = { uncompressedSize?: number; crc32?: number };

export type BudgetedZipEntry = {
  dir: boolean;
  _data?: ZipEntryData;
  async(type: 'uint8array'): Promise<Uint8Array>;
};

export function throwIfChartPreviewCancelled(cancellation?: ChartPreviewCancellation): void {
  cancellation?.assertCurrent?.();
  if (!cancellation?.signal?.aborted) return;
  const reason = cancellation.signal.reason;
  if (reason instanceof Error) throw reason;
  throw new Error('操作已取消');
}

export function interruptChartPreviewParse(iteration: number, cancellation?: ChartPreviewCancellation): void {
  if (iteration % CHART_PREVIEW_PARSE_YIELD_INTERVAL !== 0) return;
  throwIfChartPreviewCancelled(cancellation);
}

export async function pauseChartPreviewParse(iteration: number, cancellation?: ChartPreviewCancellation): Promise<void> {
  interruptChartPreviewParse(iteration, cancellation);
  if (iteration === 0 || iteration % CHART_PREVIEW_PARSE_YIELD_INTERVAL !== 0) return;
  await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  throwIfChartPreviewCancelled(cancellation);
}

export function assertChartPreviewDownloadBytes(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > CHART_PREVIEW_MAX_DOWNLOAD_BYTES) {
    throw new ChartPreviewBudgetError('谱面下载超出预算');
  }
}

export function assertChartPreviewEntryCount(count: number): void {
  if (!Number.isFinite(count) || count < 0 || count > CHART_PREVIEW_MAX_ARCHIVE_ENTRIES) {
    throw new ChartPreviewBudgetError('谱面包条目数量超出预算');
  }
}

export function assertChartPreviewEntryUncompressed(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > CHART_PREVIEW_MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw new ChartPreviewBudgetError('谱面资源解压大小超出预算');
  }
}

export function assertChartPreviewTotalUncompressed(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw new ChartPreviewBudgetError('谱面解压总量超出预算');
  }
}

export function assertChartPreviewEventCount(count: number): void {
  if (!Number.isFinite(count) || count < 0 || count > CHART_PREVIEW_MAX_EVENTS) {
    throw new ChartPreviewBudgetError('故事板事件数量超出预算');
  }
}

export function assertChartPreviewNoteCount(count: number): void {
  if (!Number.isFinite(count) || count < 0 || count > CHART_PREVIEW_MAX_NOTES) {
    throw new ChartPreviewBudgetError('谱面音符数量超出预算');
  }
}

export function assertChartPreviewNestingDepth(depth: number): void {
  if (!Number.isInteger(depth) || depth < 0 || depth > CHART_PREVIEW_MAX_NESTING_DEPTH) {
    throw new ChartPreviewBudgetError('谱面嵌套深度超出预算');
  }
}

export function assertChartPreviewLoopExpansion(count: number): void {
  if (!Number.isFinite(count) || count < 0 || count > CHART_PREVIEW_MAX_LOOP_EXPANSION) {
    throw new ChartPreviewBudgetError('故事板循环超出预算');
  }
}

export function assertChartPreviewTexturePixels(pixels: number): void {
  if (!Number.isFinite(pixels) || pixels < 0 || pixels > CHART_PREVIEW_MAX_TEXTURE_PIXELS) {
    throw new ChartPreviewBudgetError('纹理像素超出预算');
  }
}

export function assertChartPreviewGifFramePixels(pixels: number): void {
  if (!Number.isFinite(pixels) || pixels < 0 || pixels > CHART_PREVIEW_MAX_GIF_FRAME_PIXELS) {
    throw new ChartPreviewBudgetError('GIF 帧像素超出预算');
  }
}

export function chartPreviewDeclaredUncompressedSize(entry: { dir: boolean; _data?: ZipEntryData }): number {
  const size = entry._data?.uncompressedSize;
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
    throw new ChartPreviewBudgetError('无法确定谱面资源的解压大小');
  }
  return size;
}

export async function scanChartPreviewArchiveEntries<T extends { dir: boolean }>(
  entries: readonly T[],
  downloadBytes: number,
  options: {
    cancellation?: ChartPreviewCancellation;
    uncompressedSize: (entry: T) => number;
    visit?: (entry: T, index: number) => void;
  },
): Promise<void> {
  assertChartPreviewDownloadBytes(downloadBytes);
  assertChartPreviewEntryCount(entries.length);
  let total = 0;
  for (let index = 0; index < entries.length; index += 1) {
    await pauseChartPreviewParse(index, options.cancellation);
    const entry = entries[index]!;
    if (!entry.dir) options.visit?.(entry, index);
    if (entry.dir) continue;
    const size = options.uncompressedSize(entry);
    assertChartPreviewEntryUncompressed(size);
    total += size;
    assertChartPreviewTotalUncompressed(total);
  }
}

let crc32Table: Uint32Array | undefined;

function crc32TableBytes(): Uint32Array {
  if (!crc32Table) {
    crc32Table = new Uint32Array(256);
    for (let index = 0; index < crc32Table.length; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      crc32Table[index] = value;
    }
  }
  return crc32Table;
}

async function crc32(bytes: Uint8Array, cancellation?: ChartPreviewCancellation): Promise<number> {
  if (bytes.length === 0) return 0;
  const table = crc32TableBytes();
  let crc = -1;
  for (let index = 0; index < bytes.length; index += 1) {
    if (index > 0 && index % CHART_PREVIEW_CRC_CHUNK_BYTES === 0) {
      throwIfChartPreviewCancelled(cancellation);
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      throwIfChartPreviewCancelled(cancellation);
    }
    crc = (crc >>> 8) ^ table[(crc ^ bytes[index]!) & 0xff]!;
  }
  return (crc ^ -1) >>> 0;
}

export async function assertChartPreviewZipPayload(
  bytes: Uint8Array,
  declaredSize: number,
  expectedCrc32?: number,
  cancellation?: ChartPreviewCancellation,
): Promise<void> {
  if (bytes.byteLength !== declaredSize) throw new Error('谱面资源解压大小与声明不一致');
  assertChartPreviewEntryUncompressed(bytes.byteLength);
  if (typeof expectedCrc32 === 'number' && await crc32(bytes, cancellation) !== (expectedCrc32 >>> 0)) {
    throw new Error('谱面资源校验失败');
  }
}

function noteActualUncompressed(cancellation: ChartPreviewCancellation | undefined, byteLength: number): void {
  const ledger = cancellation?.actualBytes;
  if (!ledger) return;
  ledger.actualBytes += byteLength;
  assertChartPreviewTotalUncompressed(ledger.actualBytes);
}

export async function readBudgetedZipEntry(
  entry: BudgetedZipEntry,
  cancellation?: ChartPreviewCancellation,
): Promise<Uint8Array> {
  const declared = chartPreviewDeclaredUncompressedSize(entry);
  assertChartPreviewEntryUncompressed(declared);
  if (cancellation?.actualBytes) {
    assertChartPreviewTotalUncompressed(cancellation.actualBytes.actualBytes + declared);
  }
  throwIfChartPreviewCancelled(cancellation);
  const bytes = await entry.async('uint8array');
  throwIfChartPreviewCancelled(cancellation);
  await assertChartPreviewZipPayload(bytes, declared, entry._data?.crc32, cancellation);
  noteActualUncompressed(cancellation, bytes.byteLength);
  return bytes;
}

export async function readBudgetedZipText(
  entry: BudgetedZipEntry,
  byteLimit: number,
  cancellation?: ChartPreviewCancellation,
): Promise<string> {
  const declared = chartPreviewDeclaredUncompressedSize(entry);
  if (!Number.isFinite(byteLimit) || declared > byteLimit) throw new ChartPreviewBudgetError('谱面过大，暂不支持预览');
  const bytes = await readBudgetedZipEntry(entry, cancellation);
  if (bytes.byteLength > byteLimit) throw new ChartPreviewBudgetError('谱面过大，暂不支持预览');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
