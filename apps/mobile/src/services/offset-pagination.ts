export type OffsetPageFailure = {
  offset: number;
  error: unknown;
};

export type BoundedLoadFailure<T> = { item: T; error: unknown };

/** 公共有限并发加载器：支持取消，并将单项失败隔离后返回。 */
export async function loadItemsBounded<T, R>({
  items, concurrency, load, onItem, signal,
}: {
  items: readonly T[];
  concurrency: number;
  load: (item: T) => Promise<R>;
  onItem?: (result: R, item: T) => void;
  signal?: AbortSignal;
}): Promise<BoundedLoadFailure<T>[]> {
  const queue = [...items];
  const failures: BoundedLoadFailure<T>[] = [];
  let cursor = 0;
  const workerCount = Math.min(queue.length, Math.max(1, Math.floor(concurrency)));
  const worker = async () => {
    while (!signal?.aborted) {
      const index = cursor++;
      const item = queue[index];
      if (item === undefined) return;
      try {
        const result = await load(item);
        if (!signal?.aborted) onItem?.(result, item);
      } catch (error) {
        if (!signal?.aborted) failures.push({ item, error });
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return failures;
}

export async function loadOffsetPagesBounded<T>({
  offsets,
  concurrency,
  loadPage,
  onPage,
  signal,
}: {
  offsets: readonly number[];
  concurrency: number;
  loadPage: (offset: number) => Promise<T>;
  onPage?: (page: T, offset: number) => void;
  signal?: AbortSignal;
}): Promise<OffsetPageFailure[]> {
  const queue = [...new Set(offsets)].filter((offset) => Number.isInteger(offset) && offset >= 0);
  const failures = await loadItemsBounded({
    items: queue, concurrency, load: loadPage, onItem: onPage, signal,
  });
  return failures.map(({ item, error }) => ({ offset: item, error })).sort((left, right) => left.offset - right.offset);
}

export function offsetPageStarts(total: number, limit: number): number[] {
  if (!Number.isFinite(total) || !Number.isFinite(limit) || total <= 0 || limit <= 0) return [];
  const pageCount = Math.ceil(Math.floor(total) / Math.floor(limit));
  return Array.from({ length: pageCount }, (_, index) => index * Math.floor(limit));
}
