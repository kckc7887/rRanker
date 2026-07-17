import { fetch as expoFetch } from 'expo/fetch';
import type { ProviderSession } from '@/providers/contracts';
import { ProviderError } from '@/providers/errors';
import {
  lxnsAccessTokenExpired,
  refreshLxnsAccessToken,
  type LxnsOAuthSession,
} from '@/providers/lxns-oauth';
import { LXNS_API_ROOT } from '@/providers/lxns-config';
import type { LxnsUploadScore } from '@/services/score-hub-sync-map';

type UploadAbortSignal = { aborted: boolean };
const RETRY_DELAYS_MS = [0, 15_000, 60_000];

function canceledError(): ProviderError {
  return new ProviderError('unknown', '已取消', false);
}

async function waitForRetry(ms: number, signal?: UploadAbortSignal): Promise<void> {
  if (signal?.aborted) throw canceledError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const watch = signal ? setInterval(() => {
      if (signal.aborted) {
        clearTimeout(timer);
        clearInterval(watch!);
        reject(canceledError());
      }
    }, 100) : null;
    setTimeout(() => {
      if (watch !== null) clearInterval(watch);
    }, ms + 10);
  });
}

export async function uploadRecordsToLxns(input: {
  session: ProviderSession;
  records: LxnsUploadScore[];
  signal?: UploadAbortSignal;
  onTokensRotated?: (session: LxnsOAuthSession) => void | Promise<void>;
}): Promise<{ uploaded: number; session: LxnsOAuthSession }> {
  if (input.session.mode !== 'lxns-oauth') {
    throw new ProviderError('authentication', '落雪上传需要 OAuth 授权', false);
  }
  if (input.records.length === 0) {
    throw new ProviderError('no_data', '没有可上传到落雪的成绩', false);
  }

  let session = input.session;
  if (lxnsAccessTokenExpired(session)) {
    session = await refreshLxnsAccessToken(session.refreshToken);
    await input.onTokensRotated?.(session);
  }

  let lastError: ProviderError | null = null;
  for (const delay of RETRY_DELAYS_MS) {
    if (input.signal?.aborted) throw canceledError();
    if (delay > 0) await waitForRetry(delay, input.signal);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const abortWatch = input.signal ? setInterval(() => {
      if (input.signal?.aborted) controller.abort();
    }, 100) : null;
    try {
      const response = await expoFetch(`${LXNS_API_ROOT}/user/maimai/player/scores`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ scores: input.records }),
        signal: controller.signal,
      });
      if (response.ok) return { uploaded: input.records.length, session };
      if (response.status === 401) {
        throw new ProviderError('authentication', '落雪 OAuth 已失效，请重新授权', false);
      }
      if (response.status === 403) {
        throw new ProviderError('permission', '落雪授权未包含 write_player 权限', false);
      }
      if (response.status === 429) {
        lastError = new ProviderError('rate_limit', '落雪请求过于频繁，请稍后重试', true);
        continue;
      }
      if (response.status >= 500) {
        lastError = new ProviderError('network', `落雪上传失败（${response.status}）`, true);
        continue;
      }
      throw new ProviderError('unknown', `落雪上传失败（${response.status}）`, false);
    } catch (error) {
      if (input.signal?.aborted) throw canceledError();
      if (error instanceof ProviderError && !error.retryable) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new ProviderError('timeout', '落雪上传超时', true, { cause: error });
      } else if (error instanceof ProviderError) {
        lastError = error;
      } else {
        lastError = new ProviderError('network', '无法连接落雪上传服务', true, { cause: error });
      }
    } finally {
      clearTimeout(timeout);
      if (abortWatch !== null) clearInterval(abortWatch);
    }
  }
  throw lastError ?? new ProviderError('network', '落雪上传失败', true);
}
