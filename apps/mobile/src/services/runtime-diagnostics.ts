import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { deleteAsync, getInfoAsync, moveAsync, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';
import { sanitizeRuntimeLogEntry, type RuntimeLogEntry, type RuntimeLogSeverity } from '@/domain/runtime-log';
import { RUNTIME_DIAGNOSTIC_STORE_FILE_NAME } from '@/features/storage-management/cache-policy';
import {
  installRuntimeDiagnosticRecorder,
  captureEmergencyRuntimeDiagnostic,
  snapshotEmergencyRuntimeDiagnostics,
} from '@/services/runtime-diagnostics-recorder';
export { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';

export type RuntimeDiagnosticEventType =
  | 'lifecycle'
  | 'memory-warning'
  | 'account-hydration'
  | 'query-memory'
  | 'task'
  | 'web-content';
type EmergencyDiagnosticType = 'error' | 'operation' | 'session';

export type RuntimeDiagnosticFields = {
  lifecyclePhase?: 'background' | 'foreground-waiting' | 'foreground-ready';
  gameType?: string;
  providerType?: string;
  accountCount?: number;
  queryCount?: number;
  taskPhase?: string;
  webContentState?: 'mounted' | 'released' | 'preparing';
  memoryWarning?: boolean;
  source?: string;
  phase?: string;
  operationId?: number;
  parentOperationId?: number;
  phaseDurationMs?: number;
  severity?: RuntimeLogSeverity;
  durationMs?: number;
  credentialWrite?: string;
  attempts?: number;
  error?: unknown;
};

export type RuntimeDiagnosticEvent = RuntimeDiagnosticFields & {
  at: string;
  type: RuntimeDiagnosticEventType | EmergencyDiagnosticType;
  platform: string;
  appVersion: string;
  error?: RuntimeLogEntry['error'];
  details?: RuntimeLogEntry['fields'];
};

export type RuntimeDiagnosticSession = {
  startedAt: string;
  events: RuntimeDiagnosticEvent[];
};

export type RuntimeDiagnosticStore = {
  sessions: RuntimeDiagnosticSession[];
};

const storeFile = () => new File(Paths.document, RUNTIME_DIAGNOSTIC_STORE_FILE_NAME);
const previousStoreFile = () => new File(Paths.document, `${RUNTIME_DIAGNOSTIC_STORE_FILE_NAME}.previous`);
const pendingStoreFile = () => new File(Paths.document, `${RUNTIME_DIAGNOSTIC_STORE_FILE_NAME}.pending`);
const exportFile = () => new File(Paths.cache, 'rranker-runtime-diagnostics.txt');
const MAX_SESSIONS = 3;
const MAX_EVENTS = 256;
const SAFE_VALUE = /^[a-z0-9_.:-]{1,48}$/iu;
let writeQueue = Promise.resolve();
let activeSessionStartedAt: string | null = null;
let initialization: Promise<void> | null = null;
let initialized = false;
let eventBatch: { events: RuntimeDiagnosticEvent[]; promise: Promise<void> } | null = null;
let loadedStore: RuntimeDiagnosticStore | null = null;
let currentFileValid = false;

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_VALUE.test(value) ? value : undefined;
}

function safeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100_000
    ? value
    : undefined;
}

export function sanitizeRuntimeDiagnosticEvent(
  type: RuntimeDiagnosticEventType | EmergencyDiagnosticType,
  fields: RuntimeDiagnosticFields,
  at = new Date().toISOString(),
): RuntimeDiagnosticEvent {
  const lifecyclePhase = fields.lifecyclePhase === 'background'
    || fields.lifecyclePhase === 'foreground-waiting'
    || fields.lifecyclePhase === 'foreground-ready'
    ? fields.lifecyclePhase
    : undefined;
  const webContentState = fields.webContentState === 'mounted'
    || fields.webContentState === 'released'
    || fields.webContentState === 'preparing'
    ? fields.webContentState
    : undefined;
  return {
    at,
    type,
    platform: process.env.EXPO_OS ?? 'unknown',
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    ...(lifecyclePhase ? { lifecyclePhase } : {}),
    ...(safeString(fields.gameType) ? { gameType: safeString(fields.gameType) } : {}),
    ...(safeString(fields.providerType) ? { providerType: safeString(fields.providerType) } : {}),
    ...(safeCount(fields.accountCount) !== undefined ? { accountCount: safeCount(fields.accountCount) } : {}),
    ...(safeCount(fields.queryCount) !== undefined ? { queryCount: safeCount(fields.queryCount) } : {}),
    ...(safeString(fields.taskPhase) ? { taskPhase: safeString(fields.taskPhase) } : {}),
    ...(webContentState ? { webContentState } : {}),
    ...(fields.memoryWarning === true ? { memoryWarning: true } : {}),
    ...sanitizeDiagnosticDetails(type, fields, at),
  };
}

function sanitizeDiagnosticDetails(type: RuntimeDiagnosticEventType | EmergencyDiagnosticType, fields: RuntimeDiagnosticFields, at: string): Partial<RuntimeDiagnosticEvent> {
  if (!['error', 'operation', 'session'].includes(type)) return {};
  const safeEntry = sanitizeRuntimeLogEntry(type, { ...fields }, at);
  return { details: safeEntry.fields, severity: safeEntry.severity, ...(safeEntry.error ? { error: safeEntry.error } : {}) };
}

export function trimRuntimeDiagnosticStore(store: RuntimeDiagnosticStore): RuntimeDiagnosticStore {
  const sessions = store.sessions.slice(-MAX_SESSIONS).map((session) => ({
    startedAt: session.startedAt,
    events: [...session.events],
  }));
  let overflow = sessions.reduce((sum, session) => sum + session.events.length, 0) - MAX_EVENTS;
  for (const session of sessions) {
    if (overflow <= 0) break;
    const removeCount = Math.min(overflow, session.events.length);
    session.events.splice(0, removeCount);
    overflow -= removeCount;
  }
  return { sessions: sessions.filter((session) => session.events.length > 0 || session === sessions.at(-1)) };
}

async function readStoreFile(file: File): Promise<RuntimeDiagnosticStore | null> {
  if (!(await getInfoAsync(file.uri)).exists) return null;
  const contents = await readAsStringAsync(file.uri);
  try {
    const parsed = JSON.parse(contents) as RuntimeDiagnosticStore;
    return Array.isArray(parsed.sessions) ? trimRuntimeDiagnosticStore(parsed) : null;
  } catch {
    return null;
  }
}

async function readStore(): Promise<RuntimeDiagnosticStore> {
  if (loadedStore) return loadedStore;
  const current = await readStoreFile(storeFile());
  currentFileValid = current !== null;
  loadedStore = current ?? await readStoreFile(previousStoreFile()) ?? { sessions: [] };
  return loadedStore;
}

async function writeStore(store: RuntimeDiagnosticStore): Promise<void> {
  const pending = pendingStoreFile();
  const next = trimRuntimeDiagnosticStore(store);
  await writeAsStringAsync(pending.uri, JSON.stringify(next));
  const current = storeFile();
  if (currentFileValid) {
    await deleteAsync(previousStoreFile().uri, { idempotent: true });
    await moveAsync({ from: current.uri, to: previousStoreFile().uri });
    currentFileValid = false;
  } else {
    await deleteAsync(current.uri, { idempotent: true });
  }
  /** 替换失败时保留上一份完整正文。 */
  await moveAsync({ from: pending.uri, to: current.uri });
  currentFileValid = true;
  loadedStore = next;
  try {
    await deleteAsync(previousStoreFile().uri, { idempotent: true });
  } catch { /** 正文已保存，副本留待下次写入清理。 */ }
}

function enqueueWrite(operation: () => Promise<void>): Promise<void> {
  const pending = writeQueue.catch(() => undefined).then(operation);
  writeQueue = pending.catch((error) => {
    loadedStore = null;
    currentFileValid = false;
    captureEmergencyRuntimeDiagnostic('error', { source: 'runtime-diagnostics', phase: 'file', error });
  });
  return writeQueue;
}

export function initializeRuntimeDiagnostics(): Promise<void> {
  if (initialization) return initialization;
  if (initialized) return writeQueue;
  activeSessionStartedAt ??= new Date().toISOString();
  initialization = enqueueWrite(async () => {
    const store = trimRuntimeDiagnosticStore(await readStore());
    if (!store.sessions.some((session) => session.startedAt === activeSessionStartedAt)) {
      store.sessions.push({ startedAt: activeSessionStartedAt!, events: [] });
    }
    await writeStore(store);
    initialized = true;
  }).finally(() => { initialization = null; });
  return initialization;
}

function persistRuntimeDiagnostic(
  type: RuntimeDiagnosticEventType | EmergencyDiagnosticType,
  fields: RuntimeDiagnosticFields = {},
): Promise<void> {
  if (!['lifecycle', 'memory-warning', 'account-hydration', 'query-memory', 'task', 'web-content', 'error', 'operation', 'session'].includes(type)) {
    return Promise.resolve();
  }
  if (!activeSessionStartedAt) void initializeRuntimeDiagnostics();
  const event = sanitizeRuntimeDiagnosticEvent(type, fields);
  if (eventBatch) {
    eventBatch.events.push(event);
    if (eventBatch.events.length > MAX_EVENTS) eventBatch.events.shift();
    return eventBatch.promise;
  }
  const events = [event];
  const promise = enqueueWrite(async () => {
    if (eventBatch?.events === events) eventBatch = null;
    const store = trimRuntimeDiagnosticStore(await readStore());
    let session = store.sessions.find((item) => item.startedAt === activeSessionStartedAt);
    if (!session) {
      session = { startedAt: activeSessionStartedAt ?? event.at, events: [] };
      store.sessions.push(session);
    }
    session.events.push(...events);
    await writeStore(store);
  });
  eventBatch = { events, promise };
  return promise;
}

installRuntimeDiagnosticRecorder((type, fields) => persistRuntimeDiagnostic(
  type as RuntimeDiagnosticEventType | EmergencyDiagnosticType,
  fields as RuntimeDiagnosticFields,
));

export function snapshotRuntimeDiagnostics(): Promise<RuntimeDiagnosticStore> {
  eventBatch = null;
  const pending = writeQueue.then(async () => JSON.parse(JSON.stringify(await readStore())) as RuntimeDiagnosticStore);
  writeQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

export async function snapshotRuntimeDiagnosticsForExport() {
  const emergency = snapshotEmergencyRuntimeDiagnostics();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let store: RuntimeDiagnosticStore = { sessions: [] };
  let storageAvailable = true;
  try {
    store = await Promise.race([snapshotRuntimeDiagnostics(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('diagnostic snapshot timeout')), 1_500);
    })]);
  } catch { storageAvailable = false; }
  finally { if (timer) clearTimeout(timer); }
  return { ...store, storageAvailable, emergency };
}

let exporting = false;
export async function exportRuntimeDiagnostics(): Promise<void> {
  if (exporting) return;
  exporting = true;
  try {
    const contents = JSON.stringify(await snapshotRuntimeDiagnosticsForExport(), null, 2);
    try {
      const file = exportFile();
      await writeAsStringAsync(file.uri, contents);
      if (!await Sharing.isAvailableAsync()) throw new Error('sharing unavailable');
      await Sharing.shareAsync(file.uri, { dialogTitle: '分享诊断信息', mimeType: 'text/plain', UTI: 'public.plain-text' });
    } catch {
      await Share.share({ title: '诊断信息', message: contents });
    }
  } finally { exporting = false; }
}
