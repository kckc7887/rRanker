import { runSharedCacheFileOperation } from '@/features/storage-management/fs-storage';
import { Directory, File } from 'expo-file-system';
import { deleteAsync, makeDirectoryAsync, writeAsStringAsync } from 'expo-file-system/legacy';

export type BestImageWebViewSource = { uri: string };

export type PreparedBestImageWebViewSources = {
  sources: BestImageWebViewSource[];
  dispose: () => Promise<void>;
};

let sourceBatch = 0;

export async function prepareBestImageWebViewSources(
  htmlPages: readonly string[], directory: Directory, signal?: AbortSignal,
): Promise<PreparedBestImageWebViewSources> {
  const batch = ++sourceBatch;
  const files: File[] = [];
  const dispose = async () => {
    for (const file of files) await deleteAsync(file.uri, { idempotent: true });
  };
  return runSharedCacheFileOperation(async () => {
    try {
      if (signal?.aborted) throw signal.reason ?? new Error('成绩图会话已结束');
      await makeDirectoryAsync(directory.uri, { intermediates: true });
      for (const [index, html] of htmlPages.entries()) {
        if (signal?.aborted) throw signal.reason ?? new Error('成绩图会话已结束');
        const file = new File(directory, `rranker-best-image-${batch}-${index}.html`);
        files.push(file);
        await writeAsStringAsync(file.uri, html);
      }
      if (signal?.aborted) throw signal.reason ?? new Error('成绩图会话已结束');
      return { sources: files.map((file) => ({ uri: file.uri })), dispose: () => runSharedCacheFileOperation(dispose) };
    } catch (error) {
      await dispose();
      throw error;
    }
  });
}
