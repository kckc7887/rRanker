export type RandomChartsCount = 1 | 2 | 3 | 4;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function clampCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.min(4, Math.max(1, Math.floor(count)));
}

export function pickRandomItems<T>(
  items: readonly T[],
  count: number,
  seed: string,
): T[] {
  const pool = [...items];
  const size = Math.min(clampCount(count), pool.length);
  if (size === 0) return [];

  const random = createRng(seed);
  const picked: T[] = [];
  for (let index = 0; index < size; index += 1) {
    const choice = Math.floor(random() * pool.length);
    picked.push(pool[choice]!);
    pool.splice(choice, 1);
  }
  return picked;
}
