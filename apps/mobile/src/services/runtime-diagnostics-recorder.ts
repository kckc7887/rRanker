export type RuntimeDiagnosticRecorder = (
  type: string,
  fields?: Readonly<Record<string, unknown>>,
) => Promise<void>;

let recorder: RuntimeDiagnosticRecorder = async () => undefined;
let logRecorder: ((type: string, fields: Readonly<Record<string, unknown>>) => void) | undefined;

export function installRuntimeLogRecorder(next: typeof logRecorder): void {
  logRecorder = next;
}

export function recordRuntimeError(source: string, error: unknown, fatal = false): void {
  void recordRuntimeDiagnostic('error', { source, error, fatal });
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
