import { act, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { useBestImageScreenController } from '@/features/best-image/use-best-image-screen-controller';
import { installRuntimeLogRecorder } from '@/services/runtime-diagnostics-recorder';
import { sanitizeRuntimeLogEntry } from '@/domain/runtime-log';

const mockCapture = jest.fn(async () => 'file:///private/capture.png');
const mockSave = jest.fn(async () => undefined);
jest.mock('react-native-view-shot', () => ({ captureRef: () => mockCapture() }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: jest.fn() }) }));
jest.mock('@/features/best-image/best-image-export', () => ({
  bestImageCaptureDimensions: () => ({ width: 1080, height: 1440 }),
  deleteBestImageCapture: jest.fn(),
  isDrawViewHierarchyError: () => false,
  requestBestImageExportPermission: async () => undefined,
  saveBestImageCapture: () => mockSave(),
  shouldUseBestImageRenderInContext: () => false,
}));

const config = {
  accountId: 'secret-account', defaultType: 'best', defaultWidth: 1080, defaultQuantityText: '50',
  defaultPreferences: {}, preferences: { load: async () => ({}), save: async () => undefined },
  defaultExportHeight: () => 1440,
};
const runtime = {
  pages: [{ id: 'secret-page' }], htmlPages: ['secret-html'], sources: [{ html: 'secret-html', baseUrl: 'file:///private/' }],
  canExport: true, buildExportFilename: () => 'secret-name.png',
};

describe('best image shared export diagnostics', () => {
  const log = jest.fn<(type: string, fields: Readonly<Record<string, unknown>>) => void>();
  beforeEach(() => {
    jest.useFakeTimers(); log.mockClear(); mockCapture.mockClear(); mockSave.mockClear();
    installRuntimeLogRecorder(log);
  });
  afterEach(() => { installRuntimeLogRecorder(undefined); jest.useRealTimers(); });
  const events = () => log.mock.calls.filter(([type]) => type === 'operation').map(([type, fields]) => sanitizeRuntimeLogEntry(type, fields, '2026-09-06'));

  it.each(['success', 'capture', 'save'] as const)('records %s at the actual stage', async (outcome) => {
    if (outcome === 'capture') mockCapture.mockRejectedValueOnce(new Error('private capture error'));
    if (outcome === 'save') mockSave.mockRejectedValueOnce(new Error('private save error'));
    const { result } = await renderHook(() => useBestImageScreenController(config));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime); });
    await waitFor(() => expect(result.current.exportIndex).toBe(0));
    await act(async () => {
      result.current.handleExportMessage('{"type":"best-image-ready","width":1080,"height":1440}');
      await jest.advanceTimersByTimeAsync(320);
      await pending;
    });
    const entries = events();
    expect(new Set(entries.map((entry) => entry.fields.operationId)).size).toBe(1);
    expect(entries.at(-1)?.fields).toMatchObject({ phase: 'export', result: outcome === 'success' ? 'success' : 'error' });
    if (outcome !== 'success') expect(entries.find((entry) => entry.fields.result === 'error')?.fields).toMatchObject({ phase: outcome, pageIndex: 1 });
    expect(entries.some((entry) => entry.fields.phase === 'canvas' && entry.fields.result === 'success')).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/secret|private|file:/u);
  });

  it.each(['cancelled', 'timeout'] as const)('distinguishes %s while waiting for the canvas', async (outcome) => {
    const { result } = await renderHook(() => useBestImageScreenController(config));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.exportImages(runtime); });
    await waitFor(() => expect(result.current.exportIndex).toBe(0));
    await act(async () => {
      if (outcome === 'cancelled') result.current.cancelExportRequest();
      else await jest.advanceTimersByTimeAsync(30_000);
      await pending;
    });
    expect(events().find((entry) => entry.fields.phase === 'canvas' && entry.fields.result === outcome)?.fields.errorCode).toBe(outcome);
    if (outcome === 'cancelled') expect(events().every((entry) => !entry.error)).toBe(true);
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
