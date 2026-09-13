import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { fetchMe } from '@/services/score-hub-client';
import { isScoreHubAuthExpired, resolveUploadTargets, uploadTaskController } from '@/services/upload-maimai-from-friend-code';
import { uploadPrefsStore } from '@/storage/upload-prefs-store';
import { scoreHubAccountStore, type ScoreHubAccountEntry } from '@/storage/score-hub-account-store';

export function useUploadAccountPreferences({ visible, running, decodingQr, accounts, sessionsByAccountId, temporarySelectedAccountIds }: {
  visible: boolean; running: boolean; decodingQr: boolean; accounts: BoundAccount[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  temporarySelectedAccountIds?: readonly string[];
}) {
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
  const persist = useCallback((nextCode: string, nextIds: string[], writeSelection = true) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void uploadPrefsStore.save({
        friendCode: nextCode,
        selectedAccountIds: nextIds,
        // 临时勾选仅改当前会话 UI，不写入该好友码的持久勾选
        writeSelection: temporarySelectedAccountIds ? false : writeSelection,
      });
    }, 300);
  }, [temporarySelectedAccountIds]);

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
    const list = await scoreHubAccountStore.listWithToken();
    setStoredAccounts(list);
    return list;
  }, []);

  const applyLocalAccountState = useCallback((code: string, entry: ScoreHubAccountEntry | null) => {
    setHasStoredToken(Boolean(entry?.token));
    setHasCabinetBound(entry?.hasCabinetBound === true);
  }, []);

  const refreshBindStatus = useCallback(async (code: string) => {
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

      if (!entry?.token) {
        setBindingLookup(false);
        return;
      }

      try {
        const me = await fetchMe(entry.token);
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
        await refreshStoredList();
      } catch (error) {
        if (seq !== bindLookupSeqRef.current) return;
        // JWT 过期：保留本地绑定缓存与 token，上传时会话失败再回退好友码
        if (!isScoreHubAuthExpired(error)) {
          // 网络不可用时保留本地数据。
        }
      }
    } finally {
      if (seq === bindLookupSeqRef.current) setBindingLookup(false);
    }
  }, [applyLocalAccountState, refreshStoredList]);

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
    void Promise.all([
      uploadPrefsStore.load(),
      scoreHubAccountStore.load(),
      scoreHubAccountStore.listWithToken(),
    ]).then(([prefs, hubAccount, list]) => {
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
    };
  }, [
    visible,
    accounts,
    sessionsByAccountId,
    temporarySelectedAccountIds,
    refreshBindStatus,
    resolveSelectionForCode,
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

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); bindLookupSeqRef.current += 1; }, []);
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
      void (async () => {
        if (!temporarySelectedAccountIds) {
          const prefs = await uploadPrefsStore.load();
          const writableIds = resolveUploadTargets(accounts, sessionsByAccountId)
            .filter((target) => target.writable)
            .map((target) => target.account.id);
          const nextIds = resolveSelectionForCode(digits, prefs, writableIds);
          setSelectedIds(nextIds);
        }
        await refreshBindStatus(digits);
      })();
    } else {
      void scoreHubAccountStore.getByFriendCode(digits).then((entry) => {
        applyLocalAccountState(digits, entry);
      });
    }
  };

  const selectStoredFriendCode = async (code: string) => {
    if (running || decodingQr) return;
    setHistoryVisible(false);
    setFriendCode(code);
    if (!temporarySelectedAccountIds) {
      const prefs = await uploadPrefsStore.load();
      const writableIds = resolveUploadTargets(accounts, sessionsByAccountId)
        .filter((target) => target.writable)
        .map((target) => target.account.id);
      const nextIds = resolveSelectionForCode(code, prefs, writableIds);
      setSelectedIds(nextIds);
      persist(code, nextIds, false);
    } else {
      persist(code, selectedIds, false);
    }
    await scoreHubAccountStore.select(code);
    await refreshBindStatus(code);
  };

  const removeStoredFriendCode = async (code: string) => {
    if (running || decodingQr) return;
    await scoreHubAccountStore.remove(code);
    await uploadPrefsStore.removeSelection(code);
    const list = await refreshStoredList();
    if (list.length === 0) setHistoryVisible(false);
    if (friendCode.trim() === code.trim()) {
      setHasStoredToken(false);
      setHasCabinetBound(false);
    }
  };

  const refreshAfterUpload = async (code?: string) => {
    await refreshStoredList();
    if (code !== undefined) await refreshBindStatus(code);
    else {
      const latest = await scoreHubAccountStore.load();
      if (latest.friendCode) {
        setFriendCode(latest.friendCode);
        setHasStoredToken(Boolean(latest.token));
        setHasCabinetBound(latest.hasCabinetBound);
      }
    }
  };
  return { friendCode, hasCabinetBound, hasStoredToken, storedAccounts, historyVisible, setHistoryVisible,
    bindingLookup, selectedIds, prefsReady, refreshStoredList, refreshAfterUpload,
    toggleAccount, onFriendCodeChange, selectStoredFriendCode, removeStoredFriendCode,
    targets: resolveUploadTargets(accounts, sessionsByAccountId), useSessionUpload: hasStoredToken && hasCabinetBound };
}
