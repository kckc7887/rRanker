import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { ProviderSession } from '@/providers/contracts';
import { ProviderError } from '@/providers/errors';
import { requestProviderWrite } from '@/providers/http-json';
import { lxnsAccessTokenExpired, rotateLxnsTokens, type LxnsOAuthSession } from '@/providers/lxns-oauth';
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import { LXNS_API_ROOT } from '@/providers/lxns-config';
import type { LxnsUploadScore } from '@/services/score-hub-sync-map';
import { assertUploadActive, withUploadAbortSignal, type ScoreHubAbortSignal } from '@/services/score-hub-http';
import type { UploadWriteResult } from '@/services/upload-maimai-types';

export async function uploadRecordsToLxns(input: {
  session: ProviderSession;
  records: LxnsUploadScore[];
  signal?: ScoreHubAbortSignal;
  assertEligible?: () => void;
  onTokensRotated?: (update: LxnsTokenRotationUpdate) => void | Promise<unknown>;
}): Promise<UploadWriteResult & { session: LxnsOAuthSession }> {
  if (input.session.mode !== 'lxns-oauth') throw new ProviderError('authentication', '落雪上传需要 OAuth 授权', false);
  if (!input.records.length) throw new ProviderError('no_data', '没有可上传到落雪的成绩', false);
  let session = input.session;
  return withUploadAbortSignal(input.signal, async signal => {
    input.assertEligible?.();
    if (lxnsAccessTokenExpired(session)) {
      const previous = session;
      session = await rotateLxnsTokens(previous.refreshToken);
      await input.onTokensRotated?.({ previous, next: session });
    }
    await input.signal?.waitUntilResumed?.();
    assertUploadActive(signal);
    input.assertEligible?.();
    const result = await requestProviderWrite({
        baseUrl: LXNS_API_ROOT, path: '/user/maimai/player/scores', fetcher: expoFetch as unknown as typeof fetch,
        schema: z.unknown(), label: '落雪上传', signal, authenticated: true, timeoutMs: 120_000, totalAttempts: 1,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ scores: input.records }) },
        error: status => status === 401 ? new ProviderError('authentication', '落雪 OAuth 已失效，请重新授权', false)
          : status === 403 ? new ProviderError('permission', '落雪授权未包含 write_player 权限', false)
          : status === 429 ? new ProviderError('rate_limit', '落雪请求过于频繁，请稍后重试', false)
          : new ProviderError(status >= 500 ? 'network' : 'unknown', `落雪上传失败（${status}）`, status >= 500),
      }, response => response.text());
    return { status: result.status, uploaded: result.status === 'success' ? input.records.length : 0, session };
  });
}
