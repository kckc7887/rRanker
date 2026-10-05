import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { resolveChartPreviewAssetUri } from './chart-preview-asset-uri';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';

let sessionCounter = 0;

export function chartPreviewStageDirectory(name: string): Directory {
  const directory = new Directory(Paths.cache, name);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function createChartPreviewSessionDirectory(name: string): Directory {
  sessionCounter += 1;
  const directory = new Directory(Paths.cache, `${name}-session-${Date.now()}-${sessionCounter}`);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function disposeChartPreviewSessionDirectory(directory: Directory): void {
  try { if (directory.exists) directory.delete(); }
  catch (error) { recordRuntimeError('chart-preview-cleanup', error, false, { phase: 'cleanup' }); }
}

export async function stageAsset(moduleId: number, fileName: string, directory: Directory, signal?: AbortSignal): Promise<File> {
  const assertCurrent = captureResourceWrites('shared', signal);
  assertCurrent();
  const sourceUri = await loadAssetFileUri(moduleId, fileName);
  assertCurrent();
  const target = new File(directory, fileName);
  const source = new File(sourceUri);
  if (target.exists) target.delete();
  source.copy(target);
  return target;
}

export async function loadAssetFileUri(moduleId: number, fileName: string): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error(`无法加载资源 ${fileName}`);

  const resolved = resolveChartPreviewAssetUri(asset.localUri, asset.type, Platform.OS);
  if (!resolved.requiresDownload) return resolved.uri;

  const embeddedAsset = Asset.fromURI(resolved.uri);
  await embeddedAsset.downloadAsync();
  if (!embeddedAsset.localUri) throw new Error(`无法加载资源 ${fileName}`);
  return embeddedAsset.localUri;
}

export async function readAssetText(moduleId: number): Promise<string> {
  const sourceUri = await loadAssetFileUri(moduleId, 'index.html');
  return await new File(sourceUri).text();
}
