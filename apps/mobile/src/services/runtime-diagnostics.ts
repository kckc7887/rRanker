import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  installRuntimeDiagnosticRecorder,
} from '@/services/runtime-diagnostics-recorder';
export { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';

export type RuntimeDiagnosticEventType =
  | 'lifecycle'
  | 'memory-warning'
  | 'account-hydration'
  | 'query-memory'
  | 'task'
  | 'web-content';

export type RuntimeDiagnosticFields = {
  lifecyclePhase?: 'background' | 'foreground-waiting' | 'foreground-ready';
  gameType?: string;
  providerType?: string;
  accountCount?: number;
  queryCount?: number;
  taskPhase?: string;
  webContentState?: 'mounted' | 'released' | 'preparing';
  memoryWarning?: boolean;
};

export type RuntimeDiagnosticEvent = RuntimeDiagnosticFields & {
  at: string;
  type: RuntimeDiagnosticEventType;
  platform: string;
  appVersion: string;
};

export type RuntimeDiagnosticSession = {
  startedAt: string;
  events: RuntimeDiagnosticEvent[];
};

export type RuntimeDiagnosticStore = {
  sessions: RuntimeDiagnosticSession[];
};

const storeFile = () => new File(Paths.cache, 'rranker-runtime-diagnostics.json');
const exportFile = () => new File(Paths.cache, 'rranker-runtime-diagnostics.txt');
const MAX_SESSIONS = 3;
const MAX_EVENTS = 256;
const SAFE_VALUE = /^[a-z0-9_.:-]{1,48}$/iu;
let writeQueue = Promise.resolve();
let activeSessionStartedAt: string | null = null;

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_VALUE.test(value) ? value : undefined;
}

function safeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100_000
    ? value
    : undefined;
}

export function sanitizeRuntimeDiagnosticEvent(
  type: RuntimeDiagnosticEventType,
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
  };
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

async function readStore(): Promise<RuntimeDiagnosticStore> {
  const file = storeFile();
  if (!file.exists) return { sessions: [] };
  try {
    const parsed = JSON.parse(await file.text()) as RuntimeDiagnosticStore;
    return Array.isArray(parsed.sessions) ? trimRuntimeDiagnosticStore(parsed) : { sessions: [] };
  } catch {
    return { sessions: [] };
  }
}

function enqueueWrite(operation: () => Promise<void>): Promise<void> {
  const pending = writeQueue.catch(() => undefined).then(operation);
  writeQueue = pending.catch(() => undefined);
  return writeQueue;
}

export function initializeRuntimeDiagnostics(): Promise<void> {
  if (activeSessionStartedAt) return writeQueue;
  activeSessionStartedAt = new Date().toISOString();
  return enqueueWrite(async () => {
    const store = await readStore();
    store.sessions.push({ startedAt: activeSessionStartedAt!, events: [] });
    await storeFile().write(JSON.stringify(trimRuntimeDiagnosticStore(store)));
  });
}

function persistRuntimeDiagnostic(
  type: RuntimeDiagnosticEventType,
  fields: RuntimeDiagnosticFields = {},
): Promise<void> {
  if (!activeSessionStartedAt) void initializeRuntimeDiagnostics();
  const event = sanitizeRuntimeDiagnosticEvent(type, fields);
  return enqueueWrite(async () => {
    const store = await readStore();
    let session = store.sessions.find((item) => item.startedAt === activeSessionStartedAt);
    if (!session) {
      session = { startedAt: activeSessionStartedAt ?? event.at, events: [] };
      store.sessions.push(session);
    }
    session.events.push(event);
    await storeFile().write(JSON.stringify(trimRuntimeDiagnosticStore(store)));
  });
}

installRuntimeDiagnosticRecorder((type, fields) => persistRuntimeDiagnostic(
  type as RuntimeDiagnosticEventType,
  fields as RuntimeDiagnosticFields,
));

export async function exportRuntimeDiagnostics(): Promise<void> {
  await writeQueue;
  const store = await readStore();
  const file = exportFile();
  await file.write(JSON.stringify(store, null, 2));
  if (!await Sharing.isAvailableAsync()) throw new Error('sharing unavailable');
  await Sharing.shareAsync(file.uri, {
    dialogTitle: '导出诊断记录',
    mimeType: 'text/plain',
    UTI: 'public.plain-text',
  });
}
