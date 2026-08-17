import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { OsuModeSelectContent } from '@/components/osu/OsuModeSelectContent';
import { bindOsuModes } from '@/services/osu-account-binding';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import {
  exchangeOsuAuthorizationCode,
  notifyOsuOAuthOutcome,
} from '@/providers/osu-oauth';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

type CallbackStatus =
  | { kind: 'processing' }
  | { kind: 'selecting'; session: OsuOAuthSession }
  | { kind: 'binding' }
  | { kind: 'success'; accountName: string }
  | { kind: 'error'; message: string };

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : '授权失败，请重试';
}

function invalidateAll() {
  void queryClient.invalidateQueries({ queryKey: ['score-snapshot'] });
  void queryClient.invalidateQueries({ queryKey: ['game-data'] });
  void queryClient.invalidateQueries({ queryKey: ['songs'] });
}

/** osu! OAuth 回调页：承接 rranker://oauth/osu?code=…&state=…，换取令牌后进入模式选择并绑定。 */
export default function OsuOAuthCallbackScreen() {
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
      notifyOsuOAuthOutcome({ status: 'error', message });
    };

    const run = async () => {
      if (params.error) {
        fail(`osu! 授权被拒绝：${params.error}`);
        return;
      }
      const code = typeof params.code === 'string' ? params.code : '';
      if (!code) {
        fail('回调缺少授权码，请在 App 内重新发起授权');
        return;
      }
      try {
        const session = await exchangeOsuAuthorizationCode(
          code,
          typeof params.state === 'string' ? params.state : undefined,
        );
        if (cancelled) return;
        setStatus({ kind: 'selecting', session });
        // 深链把本页压在登录 Sheet（Modal）之下：先通知 Sheet 关闭，
        // 否则用户仍停留在绑定页、看不到本页的模式选择。
        notifyOsuOAuthOutcome({ status: 'awaiting-mode-selection' });
      } catch (error) {
        fail(messageFor(error));
      }
    };

    void run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bindWith = async (modeGameIds: Parameters<typeof bindOsuModes>[0]['modeGameIds'], session: OsuOAuthSession) => {
    setStatus({ kind: 'binding' });
    try {
      const state = useSession.getState();
      const result = await bindOsuModes({
        modeGameIds,
        session,
        existingAccounts: state.boundAccounts,
        credentialIdsByAccountId: state.credentialIdsByAccountId,
      });
      state.setOsuBinding({
        accounts: result.accounts,
        credentialId: result.credentialId,
        session: result.session,
        activeAccountId: result.activeAccountId,
      });
      invalidateAll();
      const accountName = result.accounts[0]?.displayName ?? 'osu! 账号';
      setStatus({ kind: 'success', accountName });
      notifyOsuOAuthOutcome({ status: 'success', accountName });
    } catch (error) {
      setStatus({ kind: 'error', message: messageFor(error) });
      notifyOsuOAuthOutcome({ status: 'error', message: messageFor(error) });
    }
  };

  const renderBody = () => {
    if (status.kind === 'processing' || status.kind === 'binding') {
      return (
        <>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.title, { color: theme.text }]}>
            {status.kind === 'processing' ? '正在完成 osu! 授权…' : '正在绑定 osu! 模式…'}
          </Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>
            {status.kind === 'processing' ? '正在换取令牌，请稍候。' : '正在读取所选模式数据并保存账号。'}
          </Text>
        </>
      );
    }
    if (status.kind === 'selecting') {
      return (
        <View style={styles.selecting}>
          <Text style={[styles.title, { color: theme.text }]}>选择 osu! 模式</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>
            已通过 osu! 官方授权，请选择要绑定的模式。
          </Text>
          <OsuModeSelectContent
            alreadyBound={[]}
            busy={false}
            submitLabel="绑定选中模式"
            onSubmit={(selected) => void bindWith(selected, status.session)}
          />
        </View>
      );
    }
    if (status.kind === 'success') {
      return (
        <>
          <Text style={[styles.title, { color: theme.text }]}>授权成功</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>
            已绑定「{status.accountName}」，返回即可查看数据。
          </Text>
        </>
      );
    }
    return (
      <>
        <Text style={[styles.title, { color: theme.text }]}>授权失败</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>{status.message}</Text>
      </>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        {renderBody()}
        {status.kind === 'success' || status.kind === 'error' ? (
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
  card: { width: '100%', maxWidth: 380, borderRadius: 16, padding: 22, gap: 12, alignItems: 'stretch' },
  selecting: { gap: 10 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  primary: { borderRadius: 10, padding: 13, alignItems: 'center', alignSelf: 'stretch', marginTop: 4 },
  primaryPressed: { opacity: 0.9 },
  primaryText: { color: '#FFF', fontWeight: '700' },
});
