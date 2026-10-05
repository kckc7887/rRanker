import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import type { BoundAccount } from '@/domain/bound-account';
import { findGame, findProvider, type GameId, type ProviderId } from '@/domain/game-bind-options';
import { useGamePickerUi } from '@/state/game-picker-ui';
import { useAppLifecycle } from '@/state/app-lifecycle';

/** 一个绑定面板同一时间只持有一个请求；隐藏、取消或释放使旧请求永久失效。 */
export function useAccountBindingRequest(visible: boolean, cancelOnBackground = true) {
  const lifecycle = useAppLifecycle();
  const eligible = useRef(true);
  eligible.current = visible && (!cancelOnBackground || lifecycle.phase !== 'background');
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const cancel = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
  }, []);
  useEffect(() => {
    if (!eligible.current) cancel();
  }, [visible, cancelOnBackground, lifecycle.phase, cancel]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); };
  }, [cancel]);
  const begin = useCallback((parentSignal?: AbortSignal) => {
    if (request.current?.signal.aborted) request.current = null;
    if (!mounted.current || !eligible.current || request.current || parentSignal?.aborted) return null;
    const controller = new AbortController();
    request.current = controller;
    const epoch = ++generation.current;
    const onAbort = () => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener('abort', onAbort, { once: true });
    const isCurrent = () => mounted.current && eligible.current && !controller.signal.aborted
      && request.current === controller && generation.current === epoch;
    return {
      signal: controller.signal,
      isCurrent,
      assertCurrent: () => {
        if (!isCurrent()) throw controller.signal.reason ?? Object.assign(new Error('绑定请求已取消'), { name: 'AbortError' });
      },
      finish: () => {
        parentSignal?.removeEventListener('abort', onAbort);
        if (request.current === controller) request.current = null;
      },
    };
  }, []);
  return { begin, cancel };
}

type AccountDialog =
  | { kind: 'closed' | 'picker' | 'tuf' | 'musedash' | 'phira' }
  | { kind: 'login'; gameId: GameId; providerId: ProviderId }
  | { kind: 'rename'; account: BoundAccount };

export function useAccountBindingFlow() {
  const [dialog, setDialog] = useState<AccountDialog>({ kind: 'closed' });
  const pendingRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
  const expandedPickerGameId = useGamePickerUi(s => s.expandedGameId);
  const setExpandedPickerGameId = useGamePickerUi(s => s.setExpandedGameId);
  const toggleExpandedPickerGameId = useGamePickerUi(s => s.toggleExpandedGameId);
  useEffect(() => () => pendingRef.current?.cancel(), []);

  const close = () => {
    pendingRef.current?.cancel();
    pendingRef.current = null;
    setDialog({ kind: 'closed' });
  };
  const afterClose = (action: () => void) => {
    close();
    pendingRef.current = InteractionManager.runAfterInteractions(() => {
      pendingRef.current = null;
      action();
    });
  };
  return {
    expandedPickerGameId,
    toggleExpandedPickerGameId,
    pickerVisible: dialog.kind === 'picker',
    loginVisible: dialog.kind === 'login',
    tufPickerVisible: dialog.kind === 'tuf',
    museDashPickerVisible: dialog.kind === 'musedash',
    phiraPickerVisible: dialog.kind === 'phira',
    renameAccount: dialog.kind === 'rename' ? dialog.account : null,
    loginGame: dialog.kind === 'login' ? findGame(dialog.gameId) : null,
    loginProvider: dialog.kind === 'login' ? findProvider(dialog.providerId) ?? null : null,
    close,
    afterClose,
    openPicker: () => { close(); setExpandedPickerGameId(null); setDialog({ kind: 'picker' }); },
    setPickerVisible: (visible: boolean) => { if (visible) setDialog({ kind: 'picker' }); else close(); },
    openPublicPlayer: (providerId: ProviderId) => {
      close();
      setDialog({ kind: providerId === 'musedash-moe' ? 'musedash' : providerId === 'phira-community' ? 'phira' : 'tuf' });
    },
    openLogin: (gameId: GameId, providerId: ProviderId) => {
      close();
      setExpandedPickerGameId(gameId);
      setDialog({ kind: 'login', gameId, providerId });
    },
    closeLogin: () => afterClose(() => setDialog({ kind: 'picker' })),
    setRenameAccount: (account: BoundAccount | null) => { close(); if (account) setDialog({ kind: 'rename', account }); },
  };
}
