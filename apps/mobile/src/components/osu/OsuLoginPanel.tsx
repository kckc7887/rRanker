import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { BoundAccount } from '@/domain/bound-account';
import {
  boundModesOfCredential,
  familyForGameId,
  OSU_FAMILY,
  type OsuGameId,
} from '@/domain/game-mode-family';
import { reusablePartiallyBoundAccounts } from '@/domain/shared-credential-account-reuse';
import { OsuModeSelectSheet } from '@/components/osu/OsuModeSelectSheet';
import { providerErrorToUserMessage } from '@/providers/errors';
import {
  beginOsuAuthorize,
  subscribeOsuOAuthOutcome,
  type OsuOAuthSession,
} from '@/providers/osu-oauth';
import { bindOsuModes } from '@/services/osu-account-binding';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { providerLoginSheetStyles as styles } from '@/components/provider-login-sheet-styles';

export function OsuLoginPanel({
  visible,
  onSuccess,
  onBusyChange,
}: {
  visible: boolean;
  onSuccess: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const theme = useAppTheme();
  const boundAccounts = useSession((s) => s.boundAccounts);
  const sessionsByAccountId = useSession((s) => s.sessionsByAccountId);
  const credentialIdsByAccountId = useSession((s) => s.credentialIdsByAccountId);
  const setOsuBinding = useSession((s) => s.setOsuBinding);
  const lifecycle = useAppLifecycle();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showReusableAccounts, setShowReusableAccounts] = useState(false);
  const [osuModeAccount, setOsuModeAccount] = useState<BoundAccount | null>(null);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (lifecycle.foregroundReady) setBusy(false);
  }, [lifecycle.foregroundGeneration, lifecycle.foregroundReady]);

  const osuReusableAccounts = useMemo(() => {
    return reusablePartiallyBoundAccounts({
      providerId: 'osu',
      sessionMode: 'osu-oauth',
      familyModeGameIds: OSU_FAMILY.modeGameIds,
      accounts: boundAccounts,
      sessionsByAccountId,
      credentialIdsByAccountId,
    });
  }, [boundAccounts, credentialIdsByAccountId, sessionsByAccountId]);

  const osuModeAccountBound = useMemo<readonly OsuGameId[]>(() => {
    if (!osuModeAccount) return [];
    const credentialId = credentialIdsByAccountId[osuModeAccount.id];
    if (!credentialId) return [];
    return [...boundModesOfCredential(boundAccounts, credentialIdsByAccountId, credentialId)]
      .filter((gameId): gameId is OsuGameId => OSU_FAMILY.modeGameIds.includes(gameId));
  }, [boundAccounts, credentialIdsByAccountId, osuModeAccount]);

  const reset = () => {
    setMessage('');
    setBusy(false);
    setShowReusableAccounts(false);
    setOsuModeAccount(null);
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

  const openOsuAuthorize = async () => {
    setBusy(true);
    setMessage('正在打开 osu! 授权页…');
    try {
      const url = await beginOsuAuthorize();
      await Linking.openURL(url);
      setMessage('请在浏览器完成授权，完成后将选择模式并绑定。');
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const bindOsuReuse = async (selected: readonly OsuGameId[]) => {
    const account = osuModeAccount;
    const session = account ? sessionsByAccountId[account.id] : undefined;
    const credentialId = account ? credentialIdsByAccountId[account.id] : undefined;
    if (!account || session?.mode !== 'osu-oauth' || !credentialId) {
      setOsuModeAccount(null);
      setMessage('已有 osu! 账号凭据不可用，请重新授权');
      return;
    }
    setBusy(true);
    setMessage(`正在使用「${account.displayName}」绑定选中模式…`);
    try {
      const result = await bindOsuModes({
        modeGameIds: selected,
        session,
        credentialId,
        existingAccounts: boundAccounts,
        credentialIdsByAccountId,
      });
      setOsuBinding({
        accounts: result.accounts,
        credentialId: result.credentialId,
        session: result.session as OsuOAuthSession,
        activeAccountId: result.activeAccountId,
      });
      invalidateAll();
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
    return subscribeOsuOAuthOutcome((outcome) => {
      if (outcome.status === 'success' || outcome.status === 'awaiting-mode-selection') {
        reset();
        onSuccessRef.current();
        return;
      }
      setMessage(outcome.message);
      setBusy(false);
    });
  }, [visible]);

  return (
    <>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Pressable
        disabled={busy}
        onPress={() => void openOsuAuthorize()}
        style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent }, pressed && !busy && styles.primaryPressed]}
      >
        <Text style={styles.primaryText}>前往 osu! 授权</Text>
      </Pressable>
      <Text style={styles.hint}>
        点击后跳转浏览器完成授权，同意后返回并选择要绑定的模式。
      </Text>
      {osuReusableAccounts.length > 0 ? (
        <View style={[styles.reuseSection, { borderTopColor: theme.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="使用已有osu账号"
            disabled={busy}
            onPress={() => setShowReusableAccounts((current) => !current)}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: theme.accent },
              pressed && !busy && styles.secondaryPressed,
            ]}
          >
            <Text style={[styles.secondaryText, { color: theme.accent }]}>
              使用已有osu账号
            </Text>
          </Pressable>
          {showReusableAccounts ? (
            <View style={styles.reuseList}>
              {osuReusableAccounts.map((account) => {
                const credentialId = credentialIdsByAccountId[account.id];
                const boundModes = credentialId
                  ? [...boundModesOfCredential(boundAccounts, credentialIdsByAccountId, credentialId)]
                    .map((id) => familyForGameId(id)?.title)
                    .filter((title): title is string => typeof title === 'string')
                  : [];
                return (
                  <Pressable
                    key={credentialId}
                    accessibilityRole="button"
                    accessibilityLabel={`使用已有osu账号 ${account.displayName}`}
                    disabled={busy}
                    onPress={() => setOsuModeAccount(account)}
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
                      已绑定 {boundModes.length > 0 ? boundModes.join('、') : '部分模式'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}
      <OsuModeSelectSheet
        visible={osuModeAccount !== null}
        alreadyBound={osuModeAccountBound}
        busy={busy}
        onClose={() => setOsuModeAccount(null)}
        onSubmit={(selected) => void bindOsuReuse(selected)}
      />
    </>
  );
}
