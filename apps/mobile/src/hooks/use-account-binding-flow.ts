import { useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import type { BoundAccount } from '@/domain/bound-account';
import { findGame, findProvider, type GameId, type ProviderId } from '@/domain/game-bind-options';
import { useGamePickerUi } from '@/state/game-picker-ui';

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
