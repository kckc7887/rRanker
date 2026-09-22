import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { PasswordLoginPanel } from '@/components/game-content/PasswordLoginPanel';
import { SmsLoginPanel } from '@/components/game-content/SmsLoginPanel';
import { providerLoginSheetStyles as styles } from '@/components/provider-login-sheet-styles';
import { createRizlineBoundAccount } from '@/domain/bound-account';
import type { RizlineSave } from '@/domain/rizline';
import type { LoginCredentials, RizlineSession } from '@/providers/contracts';
import { isRizlineNeedsSmsError, RizlineProvider } from '@/providers/rizline-provider';
import { persistBoundAccountThumbnail } from '@/services/account-thumbnail';
import { cacheRizlineSave } from '@/services/rizline-service';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { cancelBoundAccountQueries } from '@/screens/game-accounts-actions';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { deleteRizlinePassword, writeRizlinePassword } from '@/storage/rizline-password-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { useAppTheme } from '@/theme/app-theme';

const validatePhone = (phone: string) => /^1\d{10}$/u.test(phone);

export function RizlineLoginPanel(props: { visible: boolean; onSuccess: () => void; onBusyChange: (busy: boolean) => void }) {
  const theme = useAppTheme();
  const [provider] = useState(() => new RizlineProvider());
  const [method, setMethod] = useState<'sms' | 'password'>('sms');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!props.visible) { setMethod('sms'); setNotice(''); }
  }, [props.visible]);
  const setBusyState = (value: boolean) => { setBusy(value); props.onBusyChange(value); };
  const bind = async (session: RizlineSession, player: { userId: string; username: string; totalRks: number }, save: RizlineSave, signal: AbortSignal) => {
    const assertGameCurrent = captureResourceWrites('rizline', signal);
    assertGameCurrent();
    const account = createRizlineBoundAccount(player);
    const cancelling = cancelBoundAccountQueries(account, queryClient);
    const assertCurrent = captureResourceWrites('rizline', signal, account.id);
    await cancelling;
    assertCurrent();
    const credentialId = await new SecureSessionStore().upsertAccount({ id: account.id,
      gameId: 'rizline', providerId: 'rizline-official', displayName: player.username,
      scoreDisplay: account.scoreDisplay, session }, signal);
    assertCurrent();
    useSession.getState().setSession(session, { gameId: 'rizline', providerId: 'rizline-official',
      accountId: account.id, playerId: player.userId, displayName: player.username,
      rating: player.totalRks, credentialId });
    await cacheRizlineSave(account.id, save, signal);
    assertCurrent();
    void persistBoundAccountThumbnail(account.id, { scoreDisplay: account.scoreDisplay }).catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: ['game-data'] });
    return account.id;
  };
  const login = async (phone: string, code: string, signal: AbortSignal) => {
    const assertGameCurrent = captureResourceWrites('rizline', signal);
    const { session, player, save } = await provider.login(phone, code, signal);
    assertGameCurrent();
    await bind(session, player, save, signal);
  };
  const loginWithPassword = async (credentials: LoginCredentials, signal: AbortSignal) => {
    const assertGameCurrent = captureResourceWrites('rizline', signal);
    try {
      const { session, player, save } = await provider.loginWithPassword(credentials.username, credentials.password, signal);
      assertGameCurrent();
      const accountId = await bind(session, player, save, signal);
      await writeRizlinePassword(accountId, credentials.password);
    } catch (error) {
      if (isRizlineNeedsSmsError(error)) {
        setNotice(error instanceof Error ? error.message : '请改用验证码登录');
        setMethod('sms');
      }
      throw error;
    }
  };
  return <>
    {notice && method === 'sms' ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: theme.textSecondary }]}>{notice}</Text> : null}
    {method === 'sms' ? (
      <SmsLoginPanel visible={props.visible} onSuccess={props.onSuccess} onBusyChange={setBusyState}
        validatePhone={validatePhone} cooldownKey="rizline-official"
        sendCode={(phone, signal) => provider.sendVerificationCode(phone, signal)} login={login} />
    ) : (
      <>
      <PasswordLoginPanel visible={props.visible} onSuccess={props.onSuccess} onBusyChange={setBusyState}
        login={loginWithPassword} usernameLabel="手机号" usernameKeyboardType="phone-pad"
        validateUsername={validatePhone} emptyMessage="请输入手机号和密码" invalidUsernameMessage="请输入正确的手机号" />
      <Text style={[styles.message, { color: theme.textMuted }]}>密码只保存在本机，用于下次续期。可以随时清除。</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => {
        const state = useSession.getState();
        const account = state.boundAccounts.find((item) => item.gameId === 'rizline' && item.id === state.activeAccountId);
        if (!account) { setNotice('当前没有可清除密码的 Rizline 账号'); return; }
        void deleteRizlinePassword(account.id).then(() => setNotice('已清除本机保存的密码'));
      }} style={[styles.secondary, { borderColor: theme.border, opacity: busy ? 0.5 : 1 }]}>
        <Text style={[styles.secondaryText, { color: theme.text }]}>清除本机密码</Text>
      </Pressable>
      </>
    )}
    <Text style={[styles.or, { color: theme.textMuted }]}>或</Text>
    <Pressable accessibilityRole="button" disabled={busy}
      onPress={() => { if (busy) return; setNotice(''); setMethod(current => current === 'sms' ? 'password' : 'sms'); }}
      style={[styles.secondary, { borderColor: theme.accent, opacity: busy ? 0.5 : 1 }]}>
      <Text style={[styles.secondaryText, { color: theme.accent }]}>
        {method === 'sms' ? '使用账号密码登录' : '使用验证码登录'}
      </Text>
    </Pressable>
  </>;
}
