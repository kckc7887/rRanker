import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { DivingFishUploadRecord } from '@/services/score-hub-sync-map';
import { ProviderError } from '@/providers/errors';
import { requestProviderWrite } from '@/providers/http-json';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { uploadedRecordsAreVisible } from '@/services/upload-refresh-visibility';
import { assertUploadActive, withUploadAbortSignal, type ScoreHubAbortSignal } from '@/services/score-hub-http';
import type { UploadWriteResult } from '@/services/upload-maimai-types';

const BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';

export async function uploadRecordsToDivingFish(
  importToken: string,
  records: DivingFishUploadRecord[],
  signal?: ScoreHubAbortSignal,
  options: { assertEligible?: () => void } = {},
): Promise<UploadWriteResult> {
  if (!importToken.trim()) throw new ProviderError('authentication', '上传需要 Import-Token', false);
  if (!records.length) throw new ProviderError('no_data', '没有可上传的成绩', false);
  return withUploadAbortSignal(signal, async nativeSignal => {
    options.assertEligible?.();
    const result = await requestProviderWrite({
        baseUrl: BASE_URL, path: '/player/update_records', fetcher: expoFetch as unknown as typeof fetch,
        schema: z.unknown(), label: '水鱼上传', signal: nativeSignal,
        authenticated: true, timeoutMs: 120_000, totalAttempts: 1,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json', 'Import-Token': importToken }, body: JSON.stringify(records) },
        error: status => new ProviderError(status >= 500 ? 'network' : 'unknown', `水鱼上传失败（${status}）`, status >= 500),
      }, response => response.text());
    if (result.status === 'success') return { status: 'success', uploaded: records.length };
    // 写请求的响应不确定时只核验一次；新 Provider 不复用旧在飞读取或缓存。
    try {
      await signal?.waitUntilResumed?.();
      assertUploadActive(nativeSignal);
      options.assertEligible?.();
      const actual = await new DivingFishProvider({ mode: 'import-token', value: importToken, persistable: true }).getRecords(nativeSignal);
      const comparable = uploadedRecordsAreVisible(actual, records, 'exact');
      if (comparable) return { status: 'success', uploaded: records.length };
    } catch { assertUploadActive(nativeSignal); }
    return { status: 'unconfirmed', uploaded: 0 };
  });
}
