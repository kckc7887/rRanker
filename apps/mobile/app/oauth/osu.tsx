import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { OAuthResultCard } from '@/components/game-content/OAuthResultCard';

import { OsuModeSelectContent } from '@/components/osu/OsuModeSelectContent';
import { bindOsuModes } from '@/services/osu-account-binding';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import {
  exchangeOsuAuthorizationCode,
  notifyOsuOAuthOutcome,
  requireOsuOAuthState,
} from '@/providers/osu-oauth';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { providerErrorToUserMessage, runProviderOperation } from '@/providers/errors';
import { useAccountBindingRequest } from '@/hooks/use-account-binding-flow';

type CallbackStatus =
  | { kind: 'processing' }
  | { kind: 'selecting'; session: OsuOAuthSession }
  | { kind: 'binding' }
  | { kind: 'success'; accountName: string }
  | { kind: 'error'; message: string };

function messageFor(error: unknown): string {
  return providerErrorToUserMessage(error, '授权失败，请重试。', {
    authentication: '远端授权验证未通过，请重新发起授权。',
  });
}

function invalidateAll() {
  void queryClient.invalidateQueries({ queryKey: ['score-snapshot'] });
  void queryClient.invalidateQueries({ queryKey: ['game-data'] });
  void queryClient.invalidateQueries({ queryKey: ['songs'] });
}

export default function OsuOAuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [status, setStatus] = useState<CallbackStatus>({ kind: 'processing' });
  const processedRef = useRef(false);
  const focused = useRef(true);
  const lifecycle = useAppLifecycle();
  const { begin, cancel } = useAccountBindingRequest(true);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => {
      focused.current = false;
      processedRef.current = true;
      cancel();
      setStatus(current => current.kind === 'processing' || current.kind === 'binding'
        ? { kind: 'error', message: '操作已取消，请重新发起授权。' } : current);
    };
  }, [cancel]));

  useEffect(() => {
    if (lifecycle.phase !== 'background' || !processedRef.current) return;
    setStatus(current => current.kind === 'processing' || current.kind === 'binding'
      ? { kind: 'error', message: '操作已取消，请重新发起授权。' } : current);
  }, [lifecycle.phase]);

  useFocusEffect(useCallback(() => {
    if (!lifecycle.foregroundReady || processedRef.current) return;
    const request = begin();
    if (!request) return;
    processedRef.current = true;
    notifyOsuOAuthOutcome({ status: 'callback-received' });

    const fail = (message: string) => {
      if (!request.isCurrent()) return;
      setStatus({ kind: 'error', message });
      notifyOsuOAuthOutcome({ status: 'error', message });
    };

    const run = async () => {
      if (params.error) {
        fail('osu! 授权被拒绝，请重新发起授权');
        return;
      }
      const code = typeof params.code === 'string' ? params.code : '';
      if (!code) {
        fail('回调缺少授权码，请在 App 内重新发起授权');
        return;
      }
      let state = '';
      try {
        state = requireOsuOAuthState(Array.isArray(params.state) ? undefined : params.state);
      } catch (error) {
        fail(messageFor(error));
        return;
      }
      try {
        const session = await runProviderOperation('authorization_callback', () => exchangeOsuAuthorizationCode(code, state, request.signal));
        if (!request.isCurrent()) return;
        setStatus({ kind: 'selecting', session });
      } catch (error) {
        fail(messageFor(error));
      }
    };

    void run().finally(request.finish);
  }, [begin, lifecycle.foregroundReady, params.code, params.error, params.state]));

  const bindWith = async (modeGameIds: Parameters<typeof bindOsuModes>[0]['modeGameIds'], session: OsuOAuthSession) => {
    if (!focused.current) return;
    const request = begin();
    if (!request) return;
    setStatus({ kind: 'binding' });
    try {
      const state = useSession.getState();
      const result = await runProviderOperation('verification', () => bindOsuModes({
        modeGameIds,
        session,
        existingAccounts: state.boundAccounts,
        credentialIdsByAccountId: state.credentialIdsByAccountId,
        signal: request.signal,
        assertCurrent: request.assertCurrent,
      }));
      if (!request.isCurrent()) return;
      await runProviderOperation('local_commit', () => state.setOsuBinding({
        accounts: result.accounts,
        credentialId: result.credentialId,
        session: result.session,
        activeAccountId: result.activeAccountId,
      }));
      if (!request.isCurrent()) return;
      invalidateAll();
      const accountName = result.accounts[0]?.displayName ?? 'osu! 账号';
      setStatus({ kind: 'success', accountName });
      notifyOsuOAuthOutcome({ status: 'success', accountName });
    } catch (error) {
      if (!request.isCurrent()) return;
      setStatus({ kind: 'error', message: messageFor(error) });
      notifyOsuOAuthOutcome({ status: 'error', message: messageFor(error) });
    } finally { request.finish(); }
  };

  if (status.kind === 'processing') return <OAuthResultCard busy title="正在完成 osu! 授权…" message="正在换取令牌，请稍候。" />;
  if (status.kind === 'binding') return <OAuthResultCard busy title="正在绑定 osu! 模式…" message="正在读取所选模式数据并保存账号。" />;
  if (status.kind === 'selecting') return (
    <OAuthResultCard title="选择 osu! 模式" message="已通过 osu! 官方授权，请选择要绑定的模式。">
      <OsuModeSelectContent alreadyBound={[]} busy={false} submitLabel="绑定选中模式"
        onSubmit={(selected) => void bindWith(selected, status.session)} />
    </OAuthResultCard>
  );
  return <OAuthResultCard result={status} />;
}
