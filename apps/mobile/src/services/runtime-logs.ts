import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { runtimeBuildContext } from '@/domain/runtime-log';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getRuntimeLogDatabase, runSerializedSchemaInit } from '@/storage/rranker-database';
import { RUNTIME_LOG_SCHEMA, RuntimeLogRepository } from '@/storage/runtime-log-repository';
import { runtimeLogPreferencesStore } from '@/storage/runtime-log-preferences-store';
import { createRuntimeLogController } from './runtime-log-controller';
import { installRuntimeLogErrors, type RuntimeExceptionHost } from './runtime-log-errors';
import { installRuntimeLogRecorder, recordRuntimeDiagnostic, recordRuntimeError } from './runtime-diagnostics-recorder';
import { snapshotRuntimeDiagnostics } from './runtime-diagnostics';

let route = '/';
export const runtimeLogs = createRuntimeLogController({
  repository: async () => {
    const db = await getRuntimeLogDatabase();
    await runSerializedSchemaInit(async () => { await db.execAsync(RUNTIME_LOG_SCHEMA); });
    return new RuntimeLogRepository(db);
  },
  preferences: runtimeLogPreferencesStore,
  context: () => ({
    route, platform: process.env.EXPO_OS ?? 'unknown',
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    ...runtimeBuildContext(
      Platform.OS === 'ios' ? Constants.platform?.ios?.buildNumber : Constants.platform?.android?.versionCode,
      Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : Constants.expoConfig?.android?.versionCode,
    ),
    systemVersion: String(Platform.Version ?? 'unknown'), executionEnvironment: Constants.executionEnvironment,
    development: __DEV__,
  }),
});

export function initializeRuntimeLogs(): Promise<void> {
  installRuntimeLogRecorder(runtimeLogs.record);
  installRuntimeLogErrors(globalThis as RuntimeExceptionHost, (error, fatal) => recordRuntimeError('runtime', error, fatal));
  return runtimeLogs.initialize();
}

export function recordRuntimeRoute(segments: readonly string[]): void {
  route = `/${segments.join('/')}`;
  void recordRuntimeDiagnostic('route', { route });
}

let sharing = false;
let exportSequence = 0;
export async function shareRuntimeLog(id: number): Promise<void> {
  if (sharing) return;
  // 在第一个 await 前固定正文，分享面板触发的生命周期事件不进入此次快照。
  const contents = runtimeLogs.snapshot(id);
  sharing = true;
  try {
    const diagnostics = await snapshotRuntimeDiagnostics();
    const combined = JSON.stringify({ ...JSON.parse(contents), diagnostics }, null, 2);
    if (!await Sharing.isAvailableAsync()) throw new Error('sharing unavailable');
    const file = new File(Paths.cache, `rranker-runtime-log-${id}-${Date.now()}-${++exportSequence}.txt`);
    file.write(combined);
    await Sharing.shareAsync(file.uri, { dialogTitle: '分享日志', mimeType: 'text/plain', UTI: 'public.plain-text' });
  } finally { sharing = false; }
}
