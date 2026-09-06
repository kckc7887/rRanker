import type { RuntimeErrorContext } from '@/domain/runtime-log';

export type RuntimeDiagnosticRecorder = (
  type: string,
  fields?: Readonly<Record<string, unknown>>,
) => Promise<void>;

let recorder: RuntimeDiagnosticRecorder = async () => undefined;
let logRecorder: ((type: string, fields: Readonly<Record<string, unknown>>) => void) | undefined;

export function installRuntimeLogRecorder(next: typeof logRecorder): void {
  logRecorder = next;
}

let operationSequence = 0;
export function nextRuntimeOperationId(): number {
  return ++operationSequence;
}

export function createRuntimeOperation(source: string) {
  const operationId = nextRuntimeOperationId();
  const started = Date.now();
  const recorded = new Set<string>();
  return {
    operationId,
    record(phase: string, fields: Readonly<Record<string, unknown>> = {}, generation = '') {
      const key = `${generation}:${phase}:${fields.pageIndex ?? ''}:${fields.result ?? ''}`;
      if (recorded.has(key)) return;
      recorded.add(key);
      void recordRuntimeDiagnostic('operation', { ...fields, source, phase, operationId, durationMs: Math.max(0, Date.now() - started) });
    },
  };
}

export function recordRuntimeError(source: string, error: unknown, fatal = false, context: RuntimeErrorContext = {}): void {
  void recordRuntimeDiagnostic('error', { ...context, source, error, fatal });
}

export function installRuntimeDiagnosticRecorder(next: RuntimeDiagnosticRecorder): void {
  recorder = next;
}

export function recordRuntimeDiagnostic(
  type: string,
  fields: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  // 手动日志在原错误处理器结束进程之前同步落盘；任一路径失败均不影响业务。
  try { logRecorder?.(type, fields); } catch { /* 日志不得递归报告自身错误。 */ }
  try { return recorder(type, fields).catch(() => undefined); } catch { return Promise.resolve(); }
}
