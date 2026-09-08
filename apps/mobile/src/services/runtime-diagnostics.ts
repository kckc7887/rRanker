import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { RUNTIME_DIAGNOSTIC_STORE_FILE_NAME } from '@/features/storage-management/cache-policy';
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

const storeFile = () => new File(Paths.document, RUNTIME_DIAGNOSTIC_STORE_FILE_NAME);
const previousStoreFile = () => new File(Paths.document, `${RUNTIME_DIAGNOSTIC_STORE_FILE_NAME}.previous`);
const pendingStoreFile = () => new File(Paths.document, `${RUNTIME_DIAGNOSTIC_STORE_FILE_NAME}.pending`);
const legacyStoreFile = () => new File(Paths.cache, RUNTIME_DIAGNOSTIC_STORE_FILE_NAME);
const exportFile = () => new File(Paths.cache, 'rranker-runtime-diagnostics.txt');
const MAX_SESSIONS = 3;
const MAX_EVENTS = 256;
const SAFE_VALUE = /^[a-z0-9_.:-]{1,48}$/iu;
let writeQueue = Promise.resolve();
let activeSessionStartedAt: string | null = null;
let initialization: Promise<void> | null = null;
let initialized = false;

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

async function readStoreFile(file: File): Promise<RuntimeDiagnosticStore | null> {
  if (!file.exists) return null;
  // 读取失败须保留原文件供重试，不能按空记录继续写入。
  const contents = await file.text();
  try {
    const parsed = JSON.parse(contents) as RuntimeDiagnosticStore;
    return Array.isArray(parsed.sessions) ? trimRuntimeDiagnosticStore(parsed) : null;
  } catch {
    return null;
  }
}

async function readStore(): Promise<RuntimeDiagnosticStore> {
  return await readStoreFile(storeFile()) ?? await readStoreFile(previousStoreFile())
    ?? await readStoreFile(legacyStoreFile()) ?? { sessions: [] };
}

async function writeStore(store: RuntimeDiagnosticStore): Promise<void> {
  const pending = pendingStoreFile();
  await pending.write(JSON.stringify(trimRuntimeDiagnosticStore(store)));
  const current = storeFile();
  if (current.exists) {
    if (await readStoreFile(current)) {
      const previous = previousStoreFile();
      if (previous.exists) previous.delete();
      current.move(previous);
    } else {
      current.delete();
    }
  }
  // 暂存写入和替换均可能失败；替换期间保留可读取的上一份完整正文。
  pending.move(storeFile());
  for (const obsoleteFile of [previousStoreFile, legacyStoreFile]) {
    try {
      const obsolete = obsoleteFile();
      if (obsolete.exists) obsolete.delete();
    } catch { /* 已保存正文仍有效，下次写入继续回收旧副本。 */ }
  }
}

function enqueueWrite(operation: () => Promise<void>): Promise<void> {
  const pending = writeQueue.catch(() => undefined).then(operation);
  writeQueue = pending.catch(() => undefined);
  return writeQueue;
}

export function initializeRuntimeDiagnostics(): Promise<void> {
  if (initialization) return initialization;
  if (initialized) return writeQueue;
  activeSessionStartedAt ??= new Date().toISOString();
  initialization = enqueueWrite(async () => {
    const store = await readStore();
    if (!store.sessions.some((session) => session.startedAt === activeSessionStartedAt)) {
      store.sessions.push({ startedAt: activeSessionStartedAt!, events: [] });
    }
    await writeStore(store);
    initialized = true;
  }).finally(() => { initialization = null; });
  return initialization;
}

function persistRuntimeDiagnostic(
  type: RuntimeDiagnosticEventType,
  fields: RuntimeDiagnosticFields = {},
): Promise<void> {
  if (!['lifecycle', 'memory-warning', 'account-hydration', 'query-memory', 'task', 'web-content'].includes(type)) {
    return Promise.resolve();
  }
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
    await writeStore(store);
  });
}

installRuntimeDiagnosticRecorder((type, fields) => persistRuntimeDiagnostic(
  type as RuntimeDiagnosticEventType,
  fields as RuntimeDiagnosticFields,
));

export function snapshotRuntimeDiagnostics(): Promise<RuntimeDiagnosticStore> {
  // 读取也占据队列位置，后续事件不能抢在本次快照之前落盘。
  const pending = writeQueue.then(readStore);
  writeQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

let exporting = false;
export async function exportRuntimeDiagnostics(): Promise<void> {
  if (exporting) return;
  exporting = true;
  try {
    const store = await snapshotRuntimeDiagnostics();
    const file = exportFile();
    await file.write(JSON.stringify(store, null, 2));
    if (!await Sharing.isAvailableAsync()) throw new Error('sharing unavailable');
    await Sharing.shareAsync(file.uri, {
      dialogTitle: '分享诊断信息',
      mimeType: 'text/plain',
      UTI: 'public.plain-text',
    });
  } finally { exporting = false; }
}
