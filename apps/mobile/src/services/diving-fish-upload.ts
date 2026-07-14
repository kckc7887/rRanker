import { fetch as expoFetch } from 'expo/fetch';
import type { DivingFishUploadRecord } from '@/services/score-hub-sync-map';
import { ProviderError } from '@/providers/errors';

const BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';
const RETRY_DELAYS_MS = [0, 15_000, 60_000];

export async function uploadRecordsToDivingFish(
  importToken: string,
  records: DivingFishUploadRecord[],
): Promise<{ uploaded: number }> {
  if (!importToken.trim()) {
    throw new ProviderError('authentication', '上传需要 Import-Token', false);
  }
  if (records.length === 0) {
    throw new ProviderError('no_data', '没有可上传的成绩', false);
  }

  let lastError: unknown;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      try {
        const response = await expoFetch(`${BASE_URL}/player/update_records`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Import-Token': importToken,
          },
          body: JSON.stringify(records),
          signal: controller.signal,
        });
        if (response.ok) {
          return { uploaded: records.length };
        }
        // Diving-Fish 偶发 HTML 500 但仍写入：按 degraded success
        const text = await response.text();
        if (response.status === 500 && /<!DOCTYPE html>/i.test(text)) {
          return { uploaded: records.length };
        }
        if (response.status >= 500) {
          lastError = new ProviderError('network', `水鱼上传失败（${response.status}）`, true);
          continue;
        }
        throw new ProviderError('unknown', `水鱼上传失败（${response.status}）`, false);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof ProviderError && !error.retryable) throw error;
      lastError = error;
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new ProviderError('timeout', '水鱼上传超时', true, { cause: error });
        continue;
      }
      if (!(error instanceof ProviderError)) {
        lastError = new ProviderError('network', '无法连接水鱼上传服务', true, { cause: error });
      }
    }
  }

  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError('network', '水鱼上传失败', true, { cause: lastError });
}
