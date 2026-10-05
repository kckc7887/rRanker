/** Immutable interval tree. Queries preserve input order and support overlapping, reversed and unbounded intervals. */
export function createIntervalIndex<T>(items: readonly T[], bounds: (item: T) => readonly [number, number]): (min: number, max: number) => T[] {
  let size = 1;
  while (size < items.length) size *= 2;
  const starts = new Float64Array(size * 2).fill(Infinity);
  const ends = new Float64Array(size * 2).fill(-Infinity);
  items.forEach((item, i) => {
    const [a, b] = bounds(item);
    // Unknown bounds must retain the candidate rather than hide chart content.
    starts[size + i] = Number.isNaN(a) || Number.isNaN(b) ? -Infinity : Math.min(a, b);
    ends[size + i] = Number.isNaN(a) || Number.isNaN(b) ? Infinity : Math.max(a, b);
  });
  for (let node = size - 1; node > 0; node--) {
    starts[node] = Math.min(starts[node * 2]!, starts[node * 2 + 1]!);
    ends[node] = Math.max(ends[node * 2]!, ends[node * 2 + 1]!);
  }
  return (min, max) => {
    const result: T[] = [];
    const visit = (node: number, first: number, end: number): void => {
      if (first >= items.length || ends[node]! < min || starts[node]! > max) return;
      if (end - first === 1) { result.push(items[first]!); return; }
      const mid = Math.floor((first + end) / 2);
      visit(node * 2, first, mid);
      visit(node * 2 + 1, mid, end);
    };
    visit(1, 0, size);
    return result;
  };
}
