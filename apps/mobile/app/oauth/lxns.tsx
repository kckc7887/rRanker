import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { CHUNITHM_TEMP_ACCOUNT_ID } from '@/domain/bound-account';
import {
  exchangeLxnsAuthorizationCode,
  notifyLxnsOAuthOutcome,
  readPendingLxnsOAuth,
} from '@/providers/lxns-oauth';
import { bindLxnsAccount } from '@/services/lxns-account-binding';
import { ChunithmTempAccountStore } from '@/storage/chunithm-temp-account-store';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { providerErrorToUserMessage } from '@/providers/errors';

const chunithmTempAccount = new ChunithmTempAccountStore();

type CallbackStatus =
  | { kind: 'processing' }
  | { kind: 'success'; accountName: string }
  | { kind: 'error'; message: string };

function messageFor(error: unknown): string {
  return providerErrorToUserMessage(error, '授权失败，请重试。');
}

/** 完成落雪授权并绑定对应游戏账号。 */
export default function LxnsOAuthCallbackScreen() {
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [status, setStatus] = useState<CallbackStatus>({ kind: 'processing' });
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;
    let cancelled = false;

    const fail = (message: string) => {
      if (cancelled) return;
      setStatus({ kind: 'error', message });
      notifyLxnsOAuthOutcome({ status: 'error', message });
    };

    const run = async () => {
      if (params.error) {
        fail(`落雪授权被拒绝：${params.error}`);
        return;
      }
      const code = typeof params.code === 'string' ? params.code : '';
      if (!code) {
        fail('回调缺少授权码，请在 App 内重新发起授权');
        return;
      }
      try {
        const pending = await readPendingLxnsOAuth();
        if (!pending) {
          fail('找不到本机授权信息，请在 App 内重新发起授权');
          return;
        }
        const session = await exchangeLxnsAuthorizationCode(
          code,
          typeof params.state === 'string' ? params.state : undefined,
        );
        const result = await bindLxnsAccount({ gameId: pending.gameId, session });
        const store = useSession.getState();
        const rating = Number(result.account.scoreDisplay);
        store.setSession(result.session, {
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
          store.removeBoundAccount(CHUNITHM_TEMP_ACCOUNT_ID);
          await chunithmTempAccount.remove().catch(() => undefined);
        }
        void queryClient.invalidateQueries({ queryKey: ['score-snapshot'] });
        void queryClient.invalidateQueries({ queryKey: ['game-data'] });
        void queryClient.invalidateQueries({ queryKey: ['songs'] });
        if (cancelled) return;
        setStatus({ kind: 'success', accountName: result.account.displayName });
        notifyLxnsOAuthOutcome({
          status: 'success',
          gameId: pending.gameId,
          accountName: result.account.displayName,
        });
      } catch (error) {
        fail(messageFor(error));
      }
    };

    void run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        {status.kind === 'processing' ? (
          <>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.title, { color: theme.text }]}>正在完成落雪授权…</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>
              正在换取令牌并绑定账号，请稍候。
            </Text>
          </>
        ) : status.kind === 'success' ? (
          <>
            <Text style={[styles.title, { color: theme.text }]}>授权成功</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>
              已绑定「{status.accountName}」，返回即可查看数据。
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: theme.text }]}>授权失败</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{status.message}</Text>
          </>
        )}
        {status.kind !== 'processing' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回首页"
            // dismissTo('/')：回退到栈内已有的主页（tabs），而不是 replace 新建一份
            // 主页实例（replace 会造成「主页可被退出、退出回到账号管理页」的叠层 bug）。
            onPress={() => router.dismissTo('/')}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: theme.accent },
              pressed && styles.primaryPressed,
            ]}
          >
            <Text style={styles.primaryText}>返回首页</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 22, gap: 12, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  primary: { borderRadius: 10, padding: 13, alignItems: 'center', alignSelf: 'stretch', marginTop: 4 },
  primaryPressed: { opacity: 0.9 },
  primaryText: { color: '#FFF', fontWeight: '700' },
});
