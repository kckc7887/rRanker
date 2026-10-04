import { uploadTaskController } from '@/services/upload-task-controller';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotification } from '@/components/AppNotification';
import type { BoundAccount } from '@/domain/bound-account';
import { formatPlayerScore } from '@/domain/game-data';
import type { GameId } from '@/domain/game-bind-options';
import type { ProviderSession } from '@/providers/contracts';
import { providerErrorToUserMessage } from '@/providers/errors';
import { applyLxnsTokenRotation, useSession } from '@/state/session-store';
import { invalidateAccountDataQueries } from '@/services/invalidate-account-data';
import { resolveUploadTargets, type UploadPhase, type UploadResult } from '@/services/upload-maimai-from-friend-code';
import { transferMaimaiFromLxns, type LxnsTransferPhase } from '@/services/transfer-maimai-from-lxns';
import { isMaimaiMaintenanceWindow, MAIMAI_MAINTENANCE_MESSAGE } from '@/domain/maimai-maintenance';
import { isChunithmMaintenanceWindow, CHUNITHM_MAINTENANCE_MESSAGE } from '@/domain/chunithm-maintenance';
import type { MaimaiUploadPage } from '@/components/maimai/MaimaiUploadTabs';
import type { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import type { useOverviewOperation } from '@/hooks/use-overview-operation';

export function useOverviewUpload({ boundAccounts, activeAccountId, activeGameId, sessionsByAccountId, catalogQuery, ratingDigits, syncBusy, operation }: {
  boundAccounts: BoundAccount[];
  activeAccountId: string;
  activeGameId: GameId;
  sessionsByAccountId: Record<string, ProviderSession>;
  catalogQuery: ReturnType<typeof useDetailedCatalog>;
  ratingDigits: number;
  syncBusy: boolean;
  operation: ReturnType<typeof useOverviewOperation>['operation'];
}) {
  const { showNotification } = useNotification();
  const { data: catalogData, error: catalogError, refetch: refetchCatalog } = catalogQuery;
  const updateBoundAccountScore = useSession(s => s.updateBoundAccountScore);
  const [uploadVisible, setUploadVisible] = useState(false);
  const [maimaiUploadPage, setMaimaiUploadPage] = useState<MaimaiUploadPage>('friend_code');
  const [maimaiSourceAccountId, setMaimaiSourceAccountId] = useState<string | null>(null);
  const [maimaiTransferTargetIds, setMaimaiTransferTargetIds] = useState<string[]>([]);
  const [chunithmSyncGuideVisible, setChunithmSyncGuideVisible] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>({ kind: 'idle' });
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const maimaiLxnsSources = useMemo(
    () => boundAccounts.filter((account) => (
      account.gameId === 'maimai'
      && account.providerId === 'lxns'
      && sessionsByAccountId[account.id]?.mode === 'lxns-oauth'
    )),
    [boundAccounts, sessionsByAccountId],
  );
  const maimaiTransferTargets = useMemo(
    () => resolveUploadTargets(boundAccounts, sessionsByAccountId),
    [boundAccounts, sessionsByAccountId],
  );
  const maimaiLxnsGuideAvailable = activeGameId === 'maimai';
  const friendCodeUploadBusy = !['idle', 'done', 'error'].includes(uploadPhase.kind);
  const showingMaimaiSyncGuide = maimaiLxnsGuideAvailable && maimaiUploadPage === 'lxns_guide';
  const currentUploadSelection = useMemo(() => [activeAccountId], [activeAccountId]);
  const finishUpload = useCallback((result: UploadResult) => {
    for (const refreshed of result.refreshedAccounts) {
      try { refreshed.assertCurrent?.(); } catch { continue; }
      updateBoundAccountScore(
        refreshed.account.id,
        formatPlayerScore(refreshed.snapshot.best50.rating, ratingDigits),
        refreshed.snapshot.player.displayName,
      );
    }
    void invalidateAccountDataQueries();
  }, [ratingDigits, updateBoundAccountScore]);

  const syncMaimaiFromLxns = useCallback(async (): Promise<boolean> => {
    const sourceAccount = maimaiLxnsSources.find((account) => account.id === maimaiSourceAccountId);
    const sourceSession = sourceAccount
      ? sessionsByAccountId[sourceAccount.id]
      : undefined;
    const selected = maimaiTransferTargets.filter((target) => (
      target.account.id !== sourceAccount?.id
      && maimaiTransferTargetIds.includes(target.account.id)
      && target.writable
    ));
    if (!sourceAccount || sourceSession?.mode !== 'lxns-oauth') {
      showNotification({
        title: '请选择读取账号',
        message: '需要选择一个已授权的舞萌落雪账号。',
        variant: 'warning',
      });
      return false;
    }
    if (selected.length === 0) {
      showNotification({
        title: '请选择上传目标',
        message: '请至少勾选一个可写的查分器账号。',
        variant: 'warning',
      });
      return false;
    }

    const current = uploadTaskController.getSnapshot();
    if (['running', 'paused'].includes(current.status) || !operation.begin()) return false;
    const signal = uploadTaskController.begin();
    const isCurrent = () => uploadTaskController.isCurrent(signal);
    const applyPhase = (phase: UploadPhase) => {
      uploadTaskController.setPhase(phase, signal);
      if (mounted.current && isCurrent()) setUploadPhase(phase);
    };
    try {
      await signal.waitUntilResumed?.();
      const catalog = catalogData ?? (await refetchCatalog()).data;
      if (!isCurrent()) return false;
      if (!catalog) throw catalogError ?? new Error('舞萌曲库尚未就绪，请稍后重试');
      const phaseLabel = (phase: LxnsTransferPhase) => {
        if (phase.kind === 'reading') return `正在读取 ${phase.account.displayName} 的落雪成绩…`;
        if (phase.kind === 'refreshing') return `正在刷新 ${phase.account.displayName}…`;
        return `正在写入 ${phase.account.displayName}…`;
      };
      const result = await transferMaimaiFromLxns({
        sourceAccount,
        sourceSession,
        selected,
        sessionsByAccountId,
        catalog,
        signal,
        onLxnsTokensRotated: applyLxnsTokenRotation,
        onPhase: (phase) => applyPhase({
          kind: phase.kind === 'refreshing' ? 'syncing' : 'uploading',
          message: phaseLabel(phase),
          providerTitle: phase.account.providerTitle,
        }),
      });
      if (!isCurrent()) return false;
      await finishUpload(result);
      if (!isCurrent()) return false;
      uploadTaskController.complete(result, signal);
      if (!mounted.current) {
        presentTransferResult(result, sourceAccount.displayName, selected.length, () => {}, applyPhase);
        return false;
      }

      return presentTransferResult(result, sourceAccount.displayName, selected.length, showNotification, applyPhase);
    } catch (transferError) {
      if (!isCurrent()) return false;
      const message = providerErrorToUserMessage(
        transferError,
        '暂时无法传输成绩，请稍后重试。',
      );
      applyPhase({ kind: 'error', message });
      if (mounted.current) showNotification({ title: '传输失败', message, variant: 'error' });
      return false;
    } finally {
      if (signal.aborted) uploadTaskController.finishCanceled(signal);
      operation.finish();
    }
  }, [
    catalogData,
    catalogError,
    finishUpload,
    maimaiLxnsSources,
    maimaiSourceAccountId,
    maimaiTransferTargetIds,
    maimaiTransferTargets,
    refetchCatalog,
    sessionsByAccountId,
    showNotification,
    operation,
  ]);

  const openUpload = () => {
    if (isMaimaiMaintenanceWindow()) {
      showNotification({ title: '游戏服务器维护中', message: MAIMAI_MAINTENANCE_MESSAGE, variant: 'warning' });
      return;
    }
    const activeSource = maimaiLxnsSources.find((account) => account.id === activeAccountId);
    const sourceId = activeSource?.id ?? maimaiLxnsSources[0]?.id ?? null;
    const activeTarget = maimaiTransferTargets.find((target) => (
      target.account.id === activeAccountId
      && target.account.id !== sourceId
      && target.writable
    ));
    setMaimaiSourceAccountId(sourceId);
    setMaimaiTransferTargetIds(activeTarget ? [activeTarget.account.id] : []);
    if (!friendCodeUploadBusy && !syncBusy) setMaimaiUploadPage('friend_code');
    setUploadVisible(true);
  };

  const closeUpload = () => {
    setUploadVisible(false);
    if (!friendCodeUploadBusy && !syncBusy) setMaimaiUploadPage('friend_code');
  };
  const openChunithmUpload = () => {
    if (isChunithmMaintenanceWindow()) {
      showNotification({
        title: '游戏服务器维护中',
        message: CHUNITHM_MAINTENANCE_MESSAGE,
        variant: 'warning',
      });
      return;
    }
    setChunithmSyncGuideVisible(true);
  };

  return { uploadVisible, maimaiUploadPage, setMaimaiUploadPage, maimaiSourceAccountId, setMaimaiSourceAccountId,
    maimaiTransferTargetIds, setMaimaiTransferTargetIds, chunithmSyncGuideVisible, setChunithmSyncGuideVisible,
    uploadPhase, setUploadPhase, maimaiLxnsSources, maimaiTransferTargets, maimaiLxnsGuideAvailable,
    friendCodeUploadBusy, showingMaimaiSyncGuide, currentUploadSelection, finishUpload, syncMaimaiFromLxns,
    openUpload, closeUpload, openChunithmUpload };
}
function presentTransferResult(result: UploadResult, sourceName: string, targetCount: number,
  showNotification: (input: Parameters<ReturnType<typeof useNotification>['showNotification']>[0]) => void,
  applyPhase: (phase: UploadPhase) => void): boolean {
  const failed = result.targetResults.filter((target) => target.status === 'failed');
  const unconfirmed = result.targetResults.filter(target => target.status === 'unconfirmed');
  if (unconfirmed.length) {
    const message = `已确认写入 ${result.uploaded} 条；${unconfirmed.map(target => target.account.displayName).join('、')}写入未确认，请先核对成绩。${failed.length ? `；${failed.map(target => target.account.displayName).join('、')}写入失败。` : ''}`;
    showNotification({ title: '传输结果未确认', message, variant: 'warning' });
    applyPhase({ kind: 'done', message, uploaded: result.uploaded, skipped: result.skipped });
    return false;
  }
  if (failed.length > 0) {
    showNotification({
      title: failed.length === result.targetResults.length ? '传输失败' : '部分传输完成',
      message: failed.map((target) => (
        `${target.account.displayName}：写入失败，请重试。`
      )).join('；'),
      variant: failed.length === result.targetResults.length ? 'error' : 'warning',
    });
    applyPhase({
      kind: 'error',
      message: failed.length === result.targetResults.length
        ? '所有目标均写入失败'
        : `部分完成，${failed.length} 个目标失败`,
    });
    return false;
  }

  const refreshWarning = result.failedAccountNames.length > 0
    ? `；${result.failedAccountNames.join('、')}的页面未能更新`
    : '';
  showNotification({
    title: '传输完成',
    message: `已从 ${sourceName} 向 ${targetCount} 个账号写入 ${result.uploaded} 条成绩${refreshWarning}`,
    variant: result.failedAccountNames.length > 0 ? 'warning' : 'success',
  });
  applyPhase({
    kind: 'done',
    message: `传输完成：写入 ${result.uploaded} 条`,
    uploaded: result.uploaded,
    skipped: result.skipped,
  });
  return true;
}
