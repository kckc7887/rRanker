/** 仅开发构建（Expo Go / dev client）启用；release 与测试环境返回空操作，零开销。 */
function timingEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/**
 * 启动与数据加载链路耗时埋点。
 * 返回停止函数，调用时输出 `[perf] label Xms`。
 */
export function startTimer(label: string): () => void {
  if (!timingEnabled()) return () => undefined;
  const startedAt = Date.now();
  return () => {
    const elapsed = Date.now() - startedAt;
    console.log(`[perf] ${label} ${elapsed}ms`);
  };
}

/** 包裹异步任务计时（可安全用于 Promise.all 内，保持并行执行）。 */
export async function timed<T>(label: string, task: () => Promise<T>): Promise<T> {
  const stop = startTimer(label);
  try {
    return await task();
  } finally {
    stop();
  }
}

