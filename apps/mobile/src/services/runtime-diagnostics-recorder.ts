export type RuntimeDiagnosticRecorder = (
  type: string,
  fields?: Readonly<Record<string, unknown>>,
) => Promise<void>;

let recorder: RuntimeDiagnosticRecorder = async () => undefined;

export function installRuntimeDiagnosticRecorder(next: RuntimeDiagnosticRecorder): void {
  recorder = next;
}

export function recordRuntimeDiagnostic(
  type: string,
  fields: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  return recorder(type, fields);
}
