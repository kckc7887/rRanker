function timingEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export function startTimer(label: string): () => void {
  if (!timingEnabled()) return () => undefined;
  const startedAt = Date.now();
  return () => {
    const elapsed = Date.now() - startedAt;
    console.log(`[perf] ${label} ${elapsed}ms`);
  };
}

export async function timed<T>(label: string, task: () => Promise<T>): Promise<T> {
  const stop = startTimer(label);
  try {
    return await task();
  } finally {
    stop();
  }
}
