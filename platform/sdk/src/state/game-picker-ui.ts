import { create } from 'zustand';
import { getGameOptions, type GameId } from '@rranker/sdk/domain/game-bind-options';

interface GamePickerUiState {
  expandedGameId: GameId | null;
  setExpandedGameId: (id: GameId | null) => void;
  toggleExpandedGameId: (id: GameId) => void;
}

export const useGamePickerUi = create<GamePickerUiState>((set, get) => ({
  expandedGameId: getGameOptions().find((game) => game.available)?.id ?? null,
  setExpandedGameId: (id) => set({ expandedGameId: id }),
  toggleExpandedGameId: (id) => {
    const current = get().expandedGameId;
    set({ expandedGameId: current === id ? null : id });
  },
}));
