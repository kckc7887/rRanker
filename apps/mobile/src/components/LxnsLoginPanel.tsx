import { OAuthLoginPanel } from '@/components/game-content/OAuthLoginPanel';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import {
  CHUNITHM_TEMP_ACCOUNT_ID,
  type BoundAccount,
} from '@/domain/bound-account';
import type { GameId } from '@/domain/game-bind-options';
import { reusableLxnsAccounts } from '@/domain/lxns-account-reuse';
import { providerErrorToUserMessage, runProviderOperation } from '@/providers/errors';
import {
  beginLxnsAuthorize,
  subscribeLxnsOAuthOutcome,
} from '@/providers/lxns-oauth';
import { bindLxnsAccount, type LxnsBindingResult } from '@/services/lxns-account-binding';
import { ChunithmTempAccountStore } from '@/storage/chunithm-temp-account-store';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { useAccountBindingRequest } from '@/hooks/use-account-binding-flow';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';

const chunithmTempAccount = new ChunithmTempAccountStore();

export function LxnsLoginPanel({
  visible,
  gameId,
  gameTitle,
  onSuccess,
  onBusyChange,
}: {
  visible: boolean;
  gameId: GameId;
  gameTitle: string;
  onSuccess: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const setSession = useSession((s) => s.setSession);
  const boundAccounts = useSession((s) => s.boundAccounts);
  const sessionsByAccountId = useSession((s) => s.sessionsByAccountId);
  const credentialIdsByAccountId = useSession((s) => s.credentialIdsByAccountId);
  const removeBoundAccount = useSession((s) => s.removeBoundAccount);
  const lifecycle = useAppLifecycle();
  const reuseRequests = useAccountBindingRequest(visible);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showReusableAccounts, setShowReusableAccounts] = useState(false);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (lifecycle.foregroundReady) setBusy(false);
  }, [lifecycle.foregroundGeneration, lifecycle.foregroundReady]);

  const reusableAccounts = useMemo(() => {
    if (gameId !== 'maimai' && gameId !== 'chunithm') return [];
    return reusableLxnsAccounts({
      targetGameId: gameId,
      accounts: boundAccounts,
      sessionsByAccountId,
      credentialIdsByAccountId,
    });
  }, [
    boundAccounts,
    credentialIdsByAccountId,
    gameId,
    sessionsByAccountId,
  ]);

  const reset = () => {
    setMessage('');
    setBusy(false);
    setShowReusableAccounts(false);
  };

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const messageFor = (error: unknown) => providerErrorToUserMessage(error, '绑定失败，请稍后重试。', {
    authentication: '远端账号验证未通过，请重新授权。',
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['score-snapshot'] });
    void queryClient.invalidateQueries({ queryKey: ['game-data'] });
    void queryClient.invalidateQueries({ queryKey: ['songs'] });
  };

  const activateLxnsBinding = async (result: LxnsBindingResult, assertCurrent: () => void) => {
    assertCurrent();
    const rating = Number(result.account.scoreDisplay);
    await runProviderOperation('local_commit', () => setSession(result.session, {
      accountId: result.account.id,
      credentialId: result.credentialId,
      displayName: result.account.displayName,
      rating: Number.isFinite(rating) ? rating : null,
      providerId: 'lxns',
      gameId: result.account.gameId,
      avatarUrl: result.account.avatarUrl,
      ratingPossession: result.account.ratingPossession,
    }));
    assertCurrent();
    if (result.account.gameId === 'chunithm') {
      await runProviderOperation('local_commit', () => removeBoundAccount(CHUNITHM_TEMP_ACCOUNT_ID));
      assertCurrent();
      await chunithmTempAccount.remove().catch(() => undefined);
      assertCurrent();
    }
    assertCurrent();
    invalidateAll();
  };

  const openLxnsAuthorize = async () => {
    setBusy(true);
    setMessage('正在打开落雪授权页…');
    try {
      const url = await runProviderOperation('authorization_prepare', () => beginLxnsAuthorize({
        gameId: gameId === 'chunithm' ? 'chunithm' : 'maimai',
      }));
      await runProviderOperation('authorization_open', () => Linking.openURL(url));
      setMessage('请在浏览器完成授权，完成后将自动返回并绑定。');
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const connectWithExistingLxns = async (account: BoundAccount) => {
    const session = sessionsByAccountId[account.id];
    const credentialId = credentialIdsByAccountId[account.id];
    if (session?.mode !== 'lxns-oauth' || !credentialId) {
      setMessage('已有落雪账号凭据不可用，请重新授权');
      return;
    }
    const task = reuseRequests.begin();
    if (!task) return;
    const assertAccountCurrent = captureResourceWrites(account.gameId, task.signal, account.id);
    const assertCurrent = () => { task.assertCurrent(); assertAccountCurrent(); };
    setBusy(true);
    setMessage(`正在使用「${account.displayName}」绑定 ${gameTitle}…`);
    try {
      const result = await runProviderOperation('verification', () => bindLxnsAccount({
        gameId: gameId === 'chunithm' ? 'chunithm' : 'maimai',
        session,
        credentialId,
        signal: task.signal,
        assertCurrent,
      }));
      assertCurrent();
      await activateLxnsBinding(result, assertCurrent);
      assertCurrent();
      reset();
      onSuccess();
    } catch (error) {
      if (task.isCurrent()) setMessage(messageFor(error));
    } finally { if (task.isCurrent()) setBusy(false); task.finish(); }
  };

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!visible) return;
    const expectedGameId = gameId === 'chunithm' ? 'chunithm' : 'maimai';
    return subscribeLxnsOAuthOutcome((outcome) => {
      if (outcome.status === 'success') {
        if (outcome.gameId !== expectedGameId) return;
        reset();
        onSuccessRef.current();
        return;
      }
      setMessage(outcome.message);
      setBusy(false);
    });
  }, [visible, gameId]);

  return (
    <OAuthLoginPanel provider="落雪" authorizeLabel="前往落雪授权" hint="同意授权后将自动返回并绑定。"
      message={message} busy={busy} expanded={showReusableAccounts} onToggle={() => setShowReusableAccounts(current => !current)}
      onAuthorize={() => void openLxnsAuthorize()}
      accounts={reusableAccounts.map(account => ({
        id: account.id, name: account.displayName, detail: '已绑定' + (account.gameId === 'maimai' ? '舞萌 DX' : '中二节奏'),
        onPress: () => void connectWithExistingLxns(account),
      }))} />
  );
}
