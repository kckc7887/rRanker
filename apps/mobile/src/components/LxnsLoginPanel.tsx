import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import {
  CHUNITHM_TEMP_ACCOUNT_ID,
  type BoundAccount,
} from '@/domain/bound-account';
import type { GameId } from '@/domain/game-bind-options';
import { reusableLxnsAccounts } from '@/domain/lxns-account-reuse';
import { providerErrorToUserMessage } from '@/providers/errors';
import {
  beginLxnsAuthorize,
  subscribeLxnsOAuthOutcome,
} from '@/providers/lxns-oauth';
import { bindLxnsAccount, type LxnsBindingResult } from '@/services/lxns-account-binding';
import { ChunithmTempAccountStore } from '@/storage/chunithm-temp-account-store';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { providerLoginSheetStyles as styles } from '@/components/provider-login-sheet-styles';

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
  const theme = useAppTheme();
  const setSession = useSession((s) => s.setSession);
  const boundAccounts = useSession((s) => s.boundAccounts);
  const sessionsByAccountId = useSession((s) => s.sessionsByAccountId);
  const credentialIdsByAccountId = useSession((s) => s.credentialIdsByAccountId);
  const removeBoundAccount = useSession((s) => s.removeBoundAccount);
  const lifecycle = useAppLifecycle();
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

  const messageFor = (error: unknown) => providerErrorToUserMessage(error, '验证失败，请稍后重试。');

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['score-snapshot'] });
    void queryClient.invalidateQueries({ queryKey: ['game-data'] });
    void queryClient.invalidateQueries({ queryKey: ['songs'] });
  };

  const activateLxnsBinding = async (result: LxnsBindingResult) => {
    const rating = Number(result.account.scoreDisplay);
    setSession(result.session, {
      accountId: result.account.id,
      credentialId: result.credentialId,
      displayName: result.account.displayName,
      rating: Number.isFinite(rating) ? rating : null,
      providerId: 'lxns',
      gameId: result.account.gameId,
      avatarUrl: result.account.avatarUrl,
      ratingPossession: result.account.ratingPossession,
    });
    if (result.account.gameId === 'chunithm') {
      removeBoundAccount(CHUNITHM_TEMP_ACCOUNT_ID);
      await chunithmTempAccount.remove().catch(() => undefined);
    }
    invalidateAll();
  };

  const openLxnsAuthorize = async () => {
    setBusy(true);
    setMessage('正在打开落雪授权页…');
    try {
      const url = await beginLxnsAuthorize({
        gameId: gameId === 'chunithm' ? 'chunithm' : 'maimai',
      });
      await Linking.openURL(url);
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
    setBusy(true);
    setMessage(`正在使用「${account.displayName}」绑定 ${gameTitle}…`);
    try {
      const result = await bindLxnsAccount({
        gameId: gameId === 'chunithm' ? 'chunithm' : 'maimai',
        session,
        credentialId,
      });
      await activateLxnsBinding(result);
      reset();
      onSuccess();
    } catch (error) {
      setMessage(messageFor(error));
      setBusy(false);
    }
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
    <>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Pressable
        disabled={busy}
        onPress={() => void openLxnsAuthorize()}
        style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent }, pressed && !busy && styles.primaryPressed]}
      >
        <Text style={styles.primaryText}>前往落雪授权</Text>
      </Pressable>
      <Text style={styles.hint}>
        同意授权后将自动返回并绑定。
      </Text>
      {reusableAccounts.length > 0 ? (
        <View style={[styles.reuseSection, { borderTopColor: theme.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="使用已有落雪账号"
            disabled={busy}
            onPress={() => setShowReusableAccounts((current) => !current)}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: theme.accent },
              pressed && !busy && styles.secondaryPressed,
            ]}
          >
            <Text style={[styles.secondaryText, { color: theme.accent }]}>
              使用已有落雪账号
            </Text>
          </Pressable>
          {showReusableAccounts ? (
            <View style={styles.reuseList}>
              {reusableAccounts.map((account) => (
                <Pressable
                  key={credentialIdsByAccountId[account.id]}
                  accessibilityRole="button"
                  accessibilityLabel={`使用已有落雪账号 ${account.displayName}`}
                  disabled={busy}
                  onPress={() => void connectWithExistingLxns(account)}
                  style={({ pressed }) => [
                    styles.reuseAccount,
                    { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
                    pressed && !busy && styles.secondaryPressed,
                  ]}
                >
                  <Text style={[styles.reuseName, { color: theme.text }]}>
                    {account.displayName}
                  </Text>
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    已绑定{account.gameId === 'maimai' ? '舞萌 DX' : '中二节奏'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
}
