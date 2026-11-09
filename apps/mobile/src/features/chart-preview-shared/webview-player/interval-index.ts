export function createIntervalIndex<T>(items: readonly T[], bounds: (item: T) => readonly [number, number],
  secondary?: (item: T) => readonly [number, number]): (min: number, max: number, near?: number, far?: number) => T[] {
  let size = 1;
  while (size < items.length) size *= 2;
  const starts = new Float64Array(size * 2).fill(Infinity);
  const ends = new Float64Array(size * 2).fill(-Infinity);
  const low = secondary ? new Float64Array(size * 2).fill(Infinity) : null;
  const high = secondary ? new Float64Array(size * 2).fill(-Infinity) : null;
  items.forEach((item, i) => {
    const [a, b] = bounds(item);
    if (secondary && low && high) {
      const [c, d] = secondary(item);
      low[size + i] = Number.isNaN(c + d) ? -Infinity : Math.min(c, d);
      high[size + i] = Number.isNaN(c + d) ? Infinity : Math.max(c, d);
    }
    /** 未知边界保留候选，避免隐藏谱面内容。 */
    starts[size + i] = Number.isNaN(a) || Number.isNaN(b) ? -Infinity : Math.min(a, b);
    ends[size + i] = Number.isNaN(a) || Number.isNaN(b) ? Infinity : Math.max(a, b);
  });
  for (let node = size - 1; node > 0; node--) {
    if (low && high) {
      low[node] = Math.min(low[node * 2]!, low[node * 2 + 1]!);
      high[node] = Math.max(high[node * 2]!, high[node * 2 + 1]!);
    }
    starts[node] = Math.min(starts[node * 2]!, starts[node * 2 + 1]!);
    ends[node] = Math.max(ends[node * 2]!, ends[node * 2 + 1]!);
  }
  return (min, max, near = -Infinity, far = Infinity) => {
    const result: T[] = [];
    const visit = (node: number, first: number, end: number): void => {
      if (first >= items.length || ends[node]! < min || starts[node]! > max || (low && high && (high[node]! < near || low[node]! > far))) return;
      if (end - first === 1) { result.push(items[first]!); return; }
      const mid = Math.floor((first + end) / 2);
      visit(node * 2, first, mid);
      visit(node * 2 + 1, mid, end);
    };
    visit(1, 0, size);
    return result;
  };
}
