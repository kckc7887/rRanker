import { fetch as expoFetch } from 'expo/fetch';
import type { DivingFishUploadRecord } from '@/services/score-hub-sync-map';
import { ProviderError } from '@/providers/errors';

const BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';
const RETRY_DELAYS_MS = [0, 15_000, 60_000];

type UploadAbortSignal = { aborted: boolean };

function canceledError(): ProviderError {
  return new ProviderError('unknown', '已取消', false);
}

function waitForRetry(ms: number, signal?: UploadAbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(canceledError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    let watch: ReturnType<typeof setInterval> | undefined;
    if (signal) {
      watch = setInterval(() => {
        if (signal.aborted) {
          clearTimeout(timer);
          if (watch !== undefined) clearInterval(watch);
          reject(canceledError());
        }
      }, 100);
      setTimeout(() => {
        if (watch !== undefined) clearInterval(watch);
      }, ms + 10);
    }
  });
}

export async function uploadRecordsToDivingFish(
  importToken: string,
  records: DivingFishUploadRecord[],
  signal?: UploadAbortSignal,
): Promise<{ uploaded: number }> {
  if (!importToken.trim()) {
    throw new ProviderError('authentication', '上传需要 Import-Token', false);
  }
  if (records.length === 0) {
    throw new ProviderError('no_data', '没有可上传的成绩', false);
  }

  let lastError: unknown;
  for (const delay of RETRY_DELAYS_MS) {
    if (signal?.aborted) throw canceledError();
    if (delay > 0) {
      await waitForRetry(delay, signal);
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      const abortWatch = signal ? setInterval(() => {
        if (signal.aborted) controller.abort();
      }, 100) : null;
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
        if (abortWatch !== null) clearInterval(abortWatch);
      }
    } catch (error) {
      if (signal?.aborted) throw canceledError();
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
