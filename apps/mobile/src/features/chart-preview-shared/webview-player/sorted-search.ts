/** 已按 `read` 升序排列的序列上，第一个键不小于 target 的下标；全部更小时返回长度。 */
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

/** 已按 `read` 升序排列的序列上，第一个键大于 target 的下标；全部不大于时返回长度。 */
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
