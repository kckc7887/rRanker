import { getDataSource, isPluginAvailable } from '@rranker/sdk/registry';
import { captureResourceWrites, subscribeResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoundAccount } from '@rranker/sdk/account';
import { findGame, findProvider, type GameId, type ProviderId } from '@rranker/sdk/domain/game-bind-options';
import { useGamePickerUi } from '@rranker/sdk/state/game-picker-ui';
import { scheduleIdleTask, useAppLifecycle } from '@rranker/sdk/state/app-lifecycle';

export function useAccountBindingRequest(visible: boolean, providerId: ProviderId, gameId?: GameId, cancelOnBackground = true) {
  const lifecycle = useAppLifecycle();
  const eligible = useRef(true);
  eligible.current = visible && (!cancelOnBackground || lifecycle.phase !== 'background');
  const mounted = useRef(true);
  const request = useRef<{ controller: AbortController; release: () => void } | null>(null);
  const generation = useRef(0);
  const cancel = useCallback(() => {
    generation.current += 1;
    request.current?.controller.abort();
    request.current?.release();
    request.current = null;
  }, []);
  useEffect(() => {
    if (!eligible.current) cancel();
  }, [visible, cancelOnBackground, lifecycle.phase, cancel]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); };
  }, [cancel, providerId, gameId]);
  const begin = useCallback((parentSignal?: AbortSignal) => {
    if (request.current?.controller.signal.aborted) { request.current.release(); request.current = null; }
    const source = getDataSource(providerId);
    if (!mounted.current || !eligible.current || request.current || parentSignal?.aborted
      || !source || !isPluginAvailable(source.id, gameId)) return null;
    const controller = new AbortController();
    const epoch = ++generation.current;
    const onAbort = () => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener('abort', onAbort, { once: true });
    const scopes = [source.id, ...(gameId ? [gameId] : source.gameIds)];
    const guards = scopes.map(scope => captureResourceWrites(scope, controller.signal));
    const subscriptions = scopes.map(scope => subscribeResourceWrites(scope, cancel));
    const entry = { controller, release: () => {
      parentSignal?.removeEventListener('abort', onAbort);
      for (const unsubscribe of subscriptions) unsubscribe();
    } };
    request.current = entry;
    const isCurrent = () => {
      try { for (const guard of guards) guard(); } catch { return false; }
      return mounted.current && eligible.current && !controller.signal.aborted
        && isPluginAvailable(source.id, gameId) && request.current === entry && generation.current === epoch;
    };
    return {
      signal: controller.signal,
      isCurrent,
      assertCurrent: () => {
        if (!isCurrent()) throw controller.signal.reason ?? Object.assign(new Error('绑定请求已取消'), { name: 'AbortError' });
      },
      finish: () => { entry.release(); if (request.current === entry) request.current = null; },
    };
  }, [providerId, gameId, cancel]);
  return { begin, cancel };
}

type AccountDialog =
  | { kind: 'closed' | 'picker' }
  | { kind: 'login'; gameId: GameId; providerId: ProviderId }
  | { kind: 'rename'; account: BoundAccount };

export function useAccountBindingFlow() {
  const [dialog, setDialog] = useState<AccountDialog>({ kind: 'closed' });
  const pendingRef = useRef<(() => void) | null>(null);
  const expandedPickerGameId = useGamePickerUi(s => s.expandedGameId);
  const setExpandedPickerGameId = useGamePickerUi(s => s.setExpandedGameId);
  const toggleExpandedPickerGameId = useGamePickerUi(s => s.toggleExpandedGameId);
  useEffect(() => () => pendingRef.current?.(), []);

  const close = () => {
    pendingRef.current?.();
    pendingRef.current = null;
    setDialog({ kind: 'closed' });
  };
  const afterClose = (action: () => void) => {
    close();
    pendingRef.current = scheduleIdleTask(() => {
      pendingRef.current = null;
      action();
    });
  };
  return {
    expandedPickerGameId,
    toggleExpandedPickerGameId,
    pickerVisible: dialog.kind === 'picker',
    loginVisible: dialog.kind === 'login',
    renameAccount: dialog.kind === 'rename' ? dialog.account : null,
    loginGame: dialog.kind === 'login' ? findGame(dialog.gameId) : null,
    loginProvider: dialog.kind === 'login' ? findProvider(dialog.providerId) ?? null : null,
    close,
    afterClose,
    openPicker: () => { close(); setExpandedPickerGameId(null); setDialog({ kind: 'picker' }); },
    setPickerVisible: (visible: boolean) => { if (visible) setDialog({ kind: 'picker' }); else close(); },
    openLogin: (gameId: GameId, providerId: ProviderId) => {
      close();
      setExpandedPickerGameId(gameId);
      setDialog({ kind: 'login', gameId, providerId });
    },
    closeLogin: () => afterClose(() => setDialog({ kind: 'picker' })),
    setRenameAccount: (account: BoundAccount | null) => { close(); if (account) setDialog({ kind: 'rename', account }); },
  };
}
