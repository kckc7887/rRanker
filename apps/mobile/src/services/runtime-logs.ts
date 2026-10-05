import Constants from 'expo-constants';
import { Platform, Share } from 'react-native';
import { runtimeBuildContext } from '@/domain/runtime-log';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getRuntimeLogDatabase, runSerializedSchemaInit } from '@/storage/rranker-database';
import { RUNTIME_LOG_SCHEMA, RuntimeLogRepository } from '@/storage/runtime-log-repository';
import { runtimeLogPreferencesStore } from '@/storage/runtime-log-preferences-store';
import { getAppLifecycleSnapshot, subscribeAppLifecycleSnapshot } from '@/state/app-lifecycle-core';
import { createRuntimeLogController } from './runtime-log-controller';
import { installRuntimeLogErrors, type RuntimeExceptionHost } from './runtime-log-errors';
import { installRuntimeLogRecorder, recordRuntimeDiagnostic, recordRuntimeError } from './runtime-diagnostics-recorder';
import { snapshotRuntimeDiagnosticsForExport } from './runtime-diagnostics';

let route = '/';
export const runtimeLogs = createRuntimeLogController({
  repository: async () => {
    const db = await getRuntimeLogDatabase();
    await runSerializedSchemaInit(async () => { await db.execAsync(RUNTIME_LOG_SCHEMA); }, 'runtime-log');
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

let lifecycleSubscribed = false;
export function initializeRuntimeLogs(): Promise<void> {
  installRuntimeLogRecorder(runtimeLogs.record);
  installRuntimeLogErrors(globalThis as RuntimeExceptionHost, (error, fatal) => recordRuntimeError('runtime', error, fatal));
  if (!lifecycleSubscribed) {
    lifecycleSubscribed = true;
    let previousPhase = getAppLifecycleSnapshot().phase;
    subscribeAppLifecycleSnapshot(snapshot => {
      const enteringBackground = snapshot.phase === 'background' && previousPhase !== 'background';
      previousPhase = snapshot.phase;
      if (enteringBackground) void recordRuntimeDiagnostic('lifecycle', { lifecyclePhase: 'background' });
      if (snapshot.phase === 'background') runtimeLogs.flush();
    });
  }
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
  /** 分享面板触发的生命周期事件不进入此次快照。 */
  const contents = runtimeLogs.snapshot(id);
  sharing = true;
  let file: File | undefined;
  try {
    const { emergency, storageAvailable, ...diagnostics } = await snapshotRuntimeDiagnosticsForExport();
    const combined = JSON.stringify({ ...JSON.parse(contents), diagnostics, emergency, storageAvailable }, null, 2);
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error('sharing unavailable');
      file = new File(Paths.cache, `rranker-runtime-log-${id}-${Date.now()}-${++exportSequence}.txt`);
      await file.write(combined);
      await Sharing.shareAsync(file.uri, { dialogTitle: '分享日志', mimeType: 'text/plain', UTI: 'public.plain-text' });
    } catch { await Share.share({ title: '日志', message: combined }); }
  } finally {
    try { if (file?.exists) file.delete(); }
    catch (error) { recordRuntimeError('runtime-log', error, false, { phase: 'share-cleanup' }); }
    sharing = false;
  }
}
