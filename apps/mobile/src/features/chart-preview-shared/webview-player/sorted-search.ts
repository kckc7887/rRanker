export function lowerBoundBy<T>(items: readonly T[], target: number, read: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (read(items[middle]!) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function upperBoundBy<T>(items: readonly T[], target: number, read: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (read(items[middle]!) <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}
