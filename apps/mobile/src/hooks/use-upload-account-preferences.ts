import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { fetchMe } from '@/services/score-hub-client';
import { resolveUploadTargets, uploadTaskController } from '@/services/upload-maimai-from-friend-code';
import { uploadPrefsStore } from '@/storage/upload-prefs-store';
import { scoreHubAccountStore, type ScoreHubAccountEntry } from '@/storage/score-hub-account-store';
import { useNotification } from '@/components/AppNotification';
import { providerErrorToUserMessage } from '@/providers/errors';

export function useUploadAccountPreferences({ visible, running, decodingQr, accounts, sessionsByAccountId, temporarySelectedAccountIds }: {
  visible: boolean; running: boolean; decodingQr: boolean; accounts: BoundAccount[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  temporarySelectedAccountIds?: readonly string[];
}) {
  const { showActionNotification } = useNotification();
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const [friendCode, setFriendCode] = useState('');
  const [hasCabinetBound, setHasCabinetBound] = useState(false);
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [storedAccounts, setStoredAccounts] = useState<ScoreHubAccountEntry[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [bindingLookup, setBindingLookup] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prefsReady, setPrefsReady] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasVisibleRef = useRef(false);
  const bindLookupSeqRef = useRef(0);
  const storedAccountsRef = useRef(storedAccounts);
  storedAccountsRef.current = storedAccounts;
  const runAccountOperation = useCallback(async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    try { return await operation(); }
    catch (error) {
      if (visibleRef.current) showActionNotification({
        title: '账号操作失败',
        message: providerErrorToUserMessage(error, '暂时无法读取或保存账号信息，请重试。'),
        variant: 'error',
        actions: [
          { label: '稍后', tone: 'cancel' },
          { label: '重试', onPress: async () => { await run(operation); } },
        ],
      });
      return undefined;
    }
  }, [showActionNotification]);
  const persist = useCallback((nextCode: string, nextIds: string[], writeSelection = true) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void runAccountOperation(() => uploadPrefsStore.save({
        friendCode: nextCode,
        selectedAccountIds: nextIds,
        // 临时勾选仅改当前会话 UI，不写入该好友码的持久勾选
        writeSelection: temporarySelectedAccountIds ? false : writeSelection,
      }));
    }, 300);
  }, [temporarySelectedAccountIds, runAccountOperation]);

  const resolveSelectionForCode = useCallback((
    code: string,
    prefs: Awaited<ReturnType<typeof uploadPrefsStore.load>>,
    writableIds: string[],
  ) => {
    const trimmed = code.trim();
    const map = prefs.selectionsByFriendCode ?? {};
    const stored = map[trimmed]
      ?? (prefs.friendCode === trimmed ? prefs.selectedAccountIds : []);
    const restored = (stored ?? []).filter((id) => writableIds.includes(id));
    return restored.length > 0 ? restored : writableIds;
  }, []);

  const refreshStoredList = useCallback(async () => {
    const list = await runAccountOperation(async () => {
      const next = await scoreHubAccountStore.listWithToken();
      if (visibleRef.current) setStoredAccounts(next);
      return next;
    });
    return list ?? storedAccountsRef.current;
  }, [runAccountOperation]);

  const applyLocalAccountState = useCallback((code: string, entry: ScoreHubAccountEntry | null) => {
    setHasStoredToken(Boolean(entry?.token));
    setHasCabinetBound(entry?.hasCabinetBound === true);
  }, []);

  const refreshBindStatus = useCallback(async (code: string) => {
    await runAccountOperation(async () => {
      const trimmed = code.trim();
      const seq = ++bindLookupSeqRef.current;
      if (!/^\d{15}$/.test(trimmed)) {
        const entry = trimmed ? await scoreHubAccountStore.getByFriendCode(trimmed) : null;
        if (seq !== bindLookupSeqRef.current) return;
        applyLocalAccountState(trimmed, entry);
        setBindingLookup(false);
        return;
      }

      setBindingLookup(true);
      try {
        await scoreHubAccountStore.select(trimmed);
        const entry = await scoreHubAccountStore.getByFriendCode(trimmed);
        if (seq !== bindLookupSeqRef.current) return;
        applyLocalAccountState(trimmed, entry);

        if (!entry?.token) return;

        // 认证或网络失败继续使用本地缓存；存储故障由外层公共错误路径承接。
        const me = await fetchMe(entry.token).catch(() => null);
        if (me) {
          if (seq !== bindLookupSeqRef.current) return;
          const bound = me.hasCabinetUserId === true;
          await scoreHubAccountStore.upsert({
            friendCode: me.friendCode ?? trimmed,
            token: entry.token,
            hasCabinetBound: bound,
          });
          if (seq !== bindLookupSeqRef.current) return;
          setHasCabinetBound(bound);
          setHasStoredToken(true);
          const list = await scoreHubAccountStore.listWithToken();
          if (seq === bindLookupSeqRef.current) setStoredAccounts(list);
        }
      } finally {
        if (seq === bindLookupSeqRef.current) setBindingLookup(false);
      }
    });
  }, [applyLocalAccountState, runAccountOperation]);

  useEffect(() => {
    if (!visible) {
      setPrefsReady(false);
      setHistoryVisible(false);
      wasVisibleRef.current = false;
      return;
    }
    const justOpened = !wasVisibleRef.current;
    wasVisibleRef.current = true;
    if (!justOpened) return;

    let active = true;
    const snapshot = uploadTaskController.getSnapshot();
    const inFlight = snapshot.status === 'running' || snapshot.status === 'paused';
    setPrefsReady(false);
    void runAccountOperation(async () => {
      const [prefs, hubAccount, list] = await Promise.all([
        uploadPrefsStore.load(),
        scoreHubAccountStore.load(),
        scoreHubAccountStore.listWithToken(),
      ]);
      if (!active) return;
      const code = prefs.friendCode || hubAccount.friendCode;
      setFriendCode(code);
      setStoredAccounts(list);
      setHasStoredToken(Boolean(hubAccount.token) || list.some((item) => item.friendCode === code));
      setHasCabinetBound(hubAccount.hasCabinetBound);
      const writableIds = resolveUploadTargets(accounts, sessionsByAccountId)
        .filter((target) => target.writable)
        .map((target) => target.account.id);
      const persisted = resolveSelectionForCode(code, prefs, writableIds);
      const temporary = temporarySelectedAccountIds
        ?.filter((id) => writableIds.includes(id)) ?? [];
      setSelectedIds(temporarySelectedAccountIds ? temporary : persisted);
      setPrefsReady(true);
      if (!inFlight && code) {
        void refreshBindStatus(code);
      }
    });
    return () => {
      active = false;
      bindLookupSeqRef.current += 1;
    };
  }, [
    visible,
    accounts,
    sessionsByAccountId,
    temporarySelectedAccountIds,
    refreshBindStatus,
    resolveSelectionForCode,
    runAccountOperation,
  ]);

  useEffect(() => {
    if (!visible || running) return;
    const writableIds = new Set(
      resolveUploadTargets(accounts, sessionsByAccountId)
        .filter((target) => target.writable)
        .map((target) => target.account.id),
    );
    setSelectedIds((prev) => prev.filter((id) => writableIds.has(id)));
  }, [visible, running, accounts, sessionsByAccountId]);

  useEffect(() => () => { visibleRef.current = false; if (saveTimerRef.current) clearTimeout(saveTimerRef.current); bindLookupSeqRef.current += 1; }, []);
  const toggleAccount = (accountId: string, writable: boolean) => {
    if (!writable || running) return;
    setSelectedIds((prev) => {
      const next = prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId];
      persist(friendCode, next);
      return next;
    });
  };

  const onFriendCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 15);
    setFriendCode(digits);
    persist(digits, selectedIds, /^\d{15}$/.test(digits));
    if (digits.length === 15) {
      void runAccountOperation(async () => {
        if (!temporarySelectedAccountIds) {
          const prefs = await uploadPrefsStore.load();
          const writableIds = resolveUploadTargets(accounts, sessionsByAccountId)
            .filter((target) => target.writable)
            .map((target) => target.account.id);
          const nextIds = resolveSelectionForCode(digits, prefs, writableIds);
          setSelectedIds(nextIds);
        }
        await refreshBindStatus(digits);
      });
    } else {
      void runAccountOperation(async () => {
        const entry = await scoreHubAccountStore.getByFriendCode(digits);
        applyLocalAccountState(digits, entry);
      });
    }
  };

  const selectStoredFriendCode = async (code: string) => {
    if (running || decodingQr) return;
    await runAccountOperation(async () => {
      let nextIds = selectedIds;
      if (!temporarySelectedAccountIds) {
        const prefs = await uploadPrefsStore.load();
        const writableIds = resolveUploadTargets(accounts, sessionsByAccountId)
          .filter((target) => target.writable)
          .map((target) => target.account.id);
        nextIds = resolveSelectionForCode(code, prefs, writableIds);
      }
      const selected = await scoreHubAccountStore.select(code);
      if (!visibleRef.current) return;
      setHistoryVisible(false);
      setFriendCode(code);
      setSelectedIds(nextIds);
      setHasStoredToken(Boolean(selected.token));
      setHasCabinetBound(selected.hasCabinetBound);
      persist(code, nextIds, false);
      await refreshBindStatus(code);
    });
  };

  const removeStoredFriendCode = async (code: string) => {
    if (running || decodingQr) return;
    await runAccountOperation(async () => {
      await scoreHubAccountStore.remove(code);
      await uploadPrefsStore.removeSelection(code);
      const list = await scoreHubAccountStore.listWithToken();
      if (!visibleRef.current) return;
      setStoredAccounts(list);
      if (list.length === 0) setHistoryVisible(false);
      if (friendCode.trim() === code.trim()) {
        setHasStoredToken(false);
        setHasCabinetBound(false);
      }
    });
  };

  const refreshAfterUpload = async (code?: string) => {
    await runAccountOperation(async () => {
      await refreshStoredList();
      if (code !== undefined) await refreshBindStatus(code);
      else {
        const latest = await scoreHubAccountStore.load();
        if (latest.friendCode && visibleRef.current) {
          setFriendCode(latest.friendCode);
          setHasStoredToken(Boolean(latest.token));
          setHasCabinetBound(latest.hasCabinetBound);
        }
      }
    });
  };
  return { friendCode, hasCabinetBound, hasStoredToken, storedAccounts, historyVisible, setHistoryVisible,
    bindingLookup, selectedIds, prefsReady, refreshStoredList, refreshAfterUpload,
    toggleAccount, onFriendCodeChange, selectStoredFriendCode, removeStoredFriendCode,
    targets: resolveUploadTargets(accounts, sessionsByAccountId), useSessionUpload: hasStoredToken && hasCabinetBound };
}
