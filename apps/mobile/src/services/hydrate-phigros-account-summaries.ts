import { useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';
import { hydratePhigrosAccount } from '@/services/resolve-account-avatar';

/**
 * 只读取 LeanCloud summary，为所有 TapTap 账号刷新列表元数据。
 * 不下载或解密完整成绩存档。
 */
export async function hydratePhigrosAccountSummaries(
  signal: AbortSignal = getForegroundAbortSignal(),
): Promise<void> {
  const snapshot = useSession.getState();
  const accounts = snapshot.boundAccounts.filter((account) => account.providerId === 'phi-taptap');
  const secureStore = new SecureSessionStore();

  await Promise.all(accounts.map(async (account) => {
    const session = snapshot.sessionsByAccountId[account.id];
    if (session?.mode !== 'phi-session') return;
    try {
      const { summary, avatarUrl } = await hydratePhigrosAccount(account, session, signal);
      if (signal.aborted) return;
      const scoreDisplay = summary.rankingScore.toFixed(4);
      useSession.getState().updateBoundAccountScore(
        account.id,
        scoreDisplay,
        session.playerId,
        avatarUrl ?? undefined,
        summary.challengeModeRank,
      );
      if (signal.aborted) return;
      await secureStore.updateAccountMetadata(account.id, {
        displayName: session.playerId,
        scoreDisplay,
        ...(avatarUrl ? { avatarUrl } : {}),
        challengeModeRank: summary.challengeModeRank,
      });
    } catch {
      // 单个账号网络失败不阻断列表；保留上次持久化的元数据。
    }
  }));
}
