export type OffsetPageFailure = {
  offset: number;
  error: unknown;
};

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
  const failures: OffsetPageFailure[] = [];
  let cursor = 0;
  const workerCount = Math.min(queue.length, Math.max(1, Math.floor(concurrency)));

  const worker = async () => {
    while (!signal?.aborted) {
      const index = cursor;
      cursor += 1;
      const offset = queue[index];
      if (offset === undefined) return;
      try {
        const page = await loadPage(offset);
        if (!signal?.aborted) onPage?.(page, offset);
      } catch (error) {
        if (!signal?.aborted) failures.push({ offset, error });
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
  return failures.sort((left, right) => left.offset - right.offset);
}

export function offsetPageStarts(total: number, limit: number): number[] {
  if (!Number.isFinite(total) || !Number.isFinite(limit) || total <= 0 || limit <= 0) return [];
  const pageCount = Math.ceil(Math.floor(total) / Math.floor(limit));
  return Array.from({ length: pageCount }, (_, index) => index * Math.floor(limit));
}
