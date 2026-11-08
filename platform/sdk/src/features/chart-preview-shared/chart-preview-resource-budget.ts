/** 下载与解压按字节计限额；纹理解码另按像素限制。 */

export const CHART_PREVIEW_MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
export const CHART_PREVIEW_MAX_ARCHIVE_ENTRIES = 4_096;
export const CHART_PREVIEW_MAX_ENTRY_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
export const CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
export const CHART_PREVIEW_MAX_EVENTS = 200_000;
export const CHART_PREVIEW_MAX_NOTES = 100_000;
export const CHART_PREVIEW_MAX_NESTING_DEPTH = 32;
/** 短循环展开，长循环按时间求值。 */
export const CHART_PREVIEW_MAX_LOOP_EXPANSION = 4_096;
export const CHART_PREVIEW_MAX_TEXTURE_PIXELS = 4_096 * 4_096;
export const CHART_PREVIEW_MAX_GIF_FRAME_PIXELS = 2_048 * 2_048;
export const CHART_PREVIEW_MAX_GIF_FRAMES = 4_096;

export const CHART_PREVIEW_PARSE_YIELD_INTERVAL = 128;

export const CHART_PREVIEW_PARSE_SLICE_MS = 8;

export const CHART_PREVIEW_CRC_CHUNK_BYTES = 64 * 1024;

export class ChartPreviewBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChartPreviewBudgetError';
  }
}

/** 超限时换源无效，停止重试。 */
export class ChartPreviewBudgetExceededError extends ChartPreviewBudgetError {
  constructor(message: string) {
    super(message);
    this.name = 'ChartPreviewBudgetExceededError';
  }
}

export const CHART_PREVIEW_DOWNLOAD_BUDGET_MESSAGE = '谱面下载超出预算';

export type ChartPreviewActualBytes = { actualBytes: number };

export function createChartPreviewActualBytes(): ChartPreviewActualBytes {
  return { actualBytes: 0 };
}

export type ChartPreviewCancellation = {
  signal?: AbortSignal;
  assertCurrent?: () => void;

  actualBytes?: ChartPreviewActualBytes;
};

type ZipEntryData = { uncompressedSize?: number; crc32?: number };

export type BudgetedZipEntry = {
  dir: boolean;
  _data?: ZipEntryData;
};
type ZipOutputStream = {
  on(event: 'data', listener: (bytes: Uint8Array) => void): ZipOutputStream;
  on(event: 'error', listener: (error: unknown) => void): ZipOutputStream;
  on(event: 'end', listener: () => void): ZipOutputStream;
  pause(): ZipOutputStream;
  resume(): ZipOutputStream;
  _worker?: ZipWorker;
};
type ZipWorker = {
  previous?: ZipWorker | null;
  isPaused: boolean;
  error(error: Error): boolean;
  push(chunk: unknown): unknown;
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

/** 首个检查点让出，此后按时间片让出。 */
export async function pauseChartPreviewParse(
  iteration: number,
  cancellation?: ChartPreviewCancellation,
  slice?: { resumedAt?: number },
): Promise<void> {
  interruptChartPreviewParse(iteration, cancellation);
  if (iteration === 0 || iteration % CHART_PREVIEW_PARSE_YIELD_INTERVAL !== 0) return;
  if (slice?.resumedAt !== undefined && performance.now() - slice.resumedAt < CHART_PREVIEW_PARSE_SLICE_MS) return;
  await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  throwIfChartPreviewCancelled(cancellation);
  if (slice) slice.resumedAt = performance.now();
}

export function assertChartPreviewDownloadBytes(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > CHART_PREVIEW_MAX_DOWNLOAD_BYTES) {
    throw new ChartPreviewBudgetExceededError(CHART_PREVIEW_DOWNLOAD_BUDGET_MESSAGE);
  }
}

export async function readBudgetedChartDownload(
  file: { readonly size: number; bytes(): Promise<Uint8Array> },
  cancellation?: ChartPreviewCancellation,
): Promise<Uint8Array> {
  throwIfChartPreviewCancelled(cancellation);
  assertChartPreviewDownloadBytes(file.size);
  const bytes = await file.bytes();
  throwIfChartPreviewCancelled(cancellation);
  assertChartPreviewDownloadBytes(bytes.byteLength);
  return bytes;
}

export function assertChartPreviewEntryCount(count: number): void {
  if (!Number.isFinite(count) || count < 0 || count > CHART_PREVIEW_MAX_ARCHIVE_ENTRIES) {
    throw new ChartPreviewBudgetExceededError('谱面包条目数量超出预算');
  }
}

export function assertChartPreviewEntryUncompressed(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > CHART_PREVIEW_MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw new ChartPreviewBudgetExceededError('谱面资源解压大小超出预算');
  }
}

export function assertChartPreviewTotalUncompressed(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > CHART_PREVIEW_MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw new ChartPreviewBudgetExceededError('谱面解压总量超出预算');
  }
}

export function assertChartPreviewEventCount(count: number): void {
  if (!Number.isFinite(count) || count < 0 || count > CHART_PREVIEW_MAX_EVENTS) {
    throw new ChartPreviewBudgetExceededError('故事板事件数量超出预算');
  }
}

export function assertChartPreviewNoteCount(count: number): void {
  if (!Number.isFinite(count) || count < 0 || count > CHART_PREVIEW_MAX_NOTES) {
    throw new ChartPreviewBudgetExceededError('谱面音符数量超出预算');
  }
}

export function assertChartPreviewNestingDepth(depth: number): void {
  if (!Number.isInteger(depth) || depth < 0 || depth > CHART_PREVIEW_MAX_NESTING_DEPTH) {
    throw new ChartPreviewBudgetExceededError('谱面嵌套深度超出预算');
  }
}

export function assertChartPreviewLoopExpansion(count: number): void {
  if (!Number.isFinite(count) || count < 0 || count > CHART_PREVIEW_MAX_LOOP_EXPANSION) {
    throw new ChartPreviewBudgetExceededError('故事板循环超出预算');
  }
}

export function assertChartPreviewTexturePixels(pixels: number): void {
  if (!Number.isFinite(pixels) || pixels < 0 || pixels > CHART_PREVIEW_MAX_TEXTURE_PIXELS) {
    throw new ChartPreviewBudgetExceededError('纹理像素超出预算');
  }
}

export function assertChartPreviewGifFramePixels(pixels: number): void {
  if (!Number.isFinite(pixels) || pixels < 0 || pixels > CHART_PREVIEW_MAX_GIF_FRAME_PIXELS) {
    throw new ChartPreviewBudgetExceededError('GIF 帧像素超出预算');
  }
}

export function assertChartPreviewGifFrameCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0 || count > CHART_PREVIEW_MAX_GIF_FRAMES) {
    throw new ChartPreviewBudgetExceededError('GIF 帧数量超出预算');
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

export function createChartPreviewCrc32() {
  const table = crc32TableBytes();
  let crc = -1;
  return {
    update(bytes: Uint8Array): void {
      for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]!;
    },
    value: () => (crc ^ -1) >>> 0,
  };
}

async function crc32(bytes: Uint8Array, cancellation?: ChartPreviewCancellation): Promise<number> {
  const crc = createChartPreviewCrc32();
  for (let offset = 0; offset < bytes.length; offset += CHART_PREVIEW_CRC_CHUNK_BYTES) {
    throwIfChartPreviewCancelled(cancellation);
    crc.update(bytes.subarray(offset, offset + CHART_PREVIEW_CRC_CHUNK_BYTES));
    if (offset + CHART_PREVIEW_CRC_CHUNK_BYTES < bytes.length) {
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    }
  }
  throwIfChartPreviewCancelled(cancellation);
  return crc.value();
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
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const streamingEntry = entry as BudgetedZipEntry & { internalStream?: (type: 'uint8array') => ZipOutputStream };
    if (typeof streamingEntry.internalStream !== 'function') { reject(new Error('谱面资源不支持受限解压流')); return; }
    const stream = streamingEntry.internalStream('uint8array');
    /** JSZip 错误在 inflater 调用栈内中止；销毁监听器需等 data 回调退出。 */
    const worker = stream._worker;
    if (!worker) { stream.pause(); reject(new Error('无法中止谱面解压流')); return; }
    const workers: ZipWorker[] = [];
    for (let current: ZipWorker | null | undefined = worker; current; current = current.previous) {
      if (workers.length >= 16 || typeof current.error !== 'function' || typeof current.push !== 'function') {
        stream.pause(); reject(new Error('不支持的谱面解压流')); return;
      }
      workers.push(current);
    }
    const source = workers[workers.length - 1]!;
    const push = source.push;
    let insidePush = false;
    const destroy = (error: Error) => {

      for (const current of workers) current.isPaused = false;
      worker.error(error);
    };
    let chunks: Uint8Array[] = [];
    let length = 0;
    let settled = false;
    let pendingDestroy: Error | undefined;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      cancellation?.signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error: unknown, unwind = true) => {
      if (settled) return;
      settled = true; chunks = []; cleanup();
      const reason = error instanceof Error ? error : new Error('谱面解压已取消');
      reject(reason);
      stream.pause();
      if (insidePush) {
        pendingDestroy = reason;
        if (unwind) throw reason;
      } else destroy(reason);
    };

    const onAbort = () => fail(cancellation?.signal?.reason, false);

    source.push = function (chunk: unknown) {
      insidePush = true;
      try { return push.call(this, chunk); }
      catch (error) {
        if (!settled) fail(error, false);
      } finally {
        insidePush = false;
        if (pendingDestroy) { const reason = pendingDestroy; pendingDestroy = undefined; destroy(reason); }
      }
    };
    cancellation?.signal?.addEventListener('abort', onAbort, { once: true });
    stream.on('data', (chunk: Uint8Array) => {
      if (settled) { if (insidePush && pendingDestroy) throw pendingDestroy; return; }

      try {
        throwIfChartPreviewCancelled(cancellation);
        const next = length + chunk.byteLength;
        assertChartPreviewEntryUncompressed(next);
        if (cancellation?.actualBytes) assertChartPreviewTotalUncompressed(cancellation.actualBytes.actualBytes + next);
        if (next > declared) throw new Error('谱面资源解压大小与声明不一致');
        length = next; chunks.push(chunk);
        stream.pause();
        if (!resumeTimer) resumeTimer = setTimeout(() => {
          resumeTimer = undefined;
          try { throwIfChartPreviewCancelled(cancellation); if (!settled) stream.resume(); }
          catch (error) { fail(error); }
        }, 0);
      } catch (error) {
        if (settled) throw error;
        fail(error);
      }
    });
    stream.on('error', fail);
    stream.on('end', () => {
      if (settled) return;
      try {
        throwIfChartPreviewCancelled(cancellation);
        if (length !== declared) throw new Error('谱面资源解压大小与声明不一致');
        const output = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
        settled = true; chunks = []; cleanup(); resolve(output);
      } catch (error) { fail(error); }
    });
    if (cancellation?.signal?.aborted) onAbort();
    else stream.resume();
  });
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
  if (!Number.isFinite(byteLimit) || declared > byteLimit) throw new ChartPreviewBudgetExceededError('谱面过大，暂不支持预览');
  const bytes = await readBudgetedZipEntry(entry, cancellation);
  if (bytes.byteLength > byteLimit) throw new ChartPreviewBudgetExceededError('谱面过大，暂不支持预览');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
