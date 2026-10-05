import { sanitizeRuntimeLogEntry, type RuntimeErrorContext, type RuntimeLogEntry } from '@/domain/runtime-log';

const emergencyEvents: RuntimeLogEntry[] = [];
export function captureEmergencyRuntimeDiagnostic(type: string, fields: Readonly<Record<string, unknown>> = {}): void {
  emergencyEvents.push(sanitizeRuntimeLogEntry(type, fields, new Date().toISOString()));
  if (emergencyEvents.length > 64) emergencyEvents.splice(0, emergencyEvents.length - 64);
}
export function snapshotEmergencyRuntimeDiagnostics(): RuntimeLogEntry[] {
  return JSON.parse(JSON.stringify(emergencyEvents)) as RuntimeLogEntry[];
}

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

export function createRuntimeOperation(source: string, context: { parentOperationId?: number } = {}) {
  const operationId = nextRuntimeOperationId();
  const started = Date.now();
  const recorded = new Set<string>();
  let previousPhaseAt = started;
  return {
    operationId,
    record(phase: string, fields: Readonly<Record<string, unknown>> = {}, generation = '') {
      const key = `${generation}:${phase}:${fields.pageIndex ?? ''}:${fields.result ?? ''}`;
      if (recorded.has(key)) return;
      recorded.add(key);
      const at = Date.now();
      void recordRuntimeDiagnostic('operation', { ...context, ...fields, source, phase, operationId,
        durationMs: Math.max(0, at - started), phaseDurationMs: Math.max(0, at - previousPhaseAt) });
      previousPhaseAt = at;
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
  captureEmergencyRuntimeDiagnostic(type, fields);
  /** 致命事件须在平台错误处理器结束进程前落盘。 */
  try { logRecorder?.(type, fields); } catch {}
  try { return recorder(type, fields).catch(() => undefined); } catch { return Promise.resolve(); }
}
