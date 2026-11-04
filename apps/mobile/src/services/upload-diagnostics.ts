import { recordRuntimeLog } from '@/services/runtime-diagnostics-recorder';

export function recordUploadFailure(error: unknown, phase: string): void {
  const details = error && typeof error === 'object' ? error as { code?: unknown; status?: unknown; nativeCode?: unknown } : {};
  recordRuntimeLog('upload', { source: 'maimai', phase, result: 'failed',
    serviceCode: details.code, status: details.status, nativeCode: details.nativeCode });
}
