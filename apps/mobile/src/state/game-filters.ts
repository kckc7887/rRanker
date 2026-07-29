import { create } from 'zustand';
import type { GameId } from '@/domain/game-bind-options';

export type GameFilterPage = 'catalog' | 'records';

export type FilterSelection = {
  value?: string;
  minimum?: string;
  maximum?: string;
  toggle?: boolean;
};

export type GamePageFilterState = {
  keyword: string;
  collapsed: boolean;
  filters: Record<string, FilterSelection>;
};

const EMPTY_PAGE_STATE: GamePageFilterState = {
  keyword: '',
  collapsed: true,
  filters: {},
};

function pageKey(gameId: GameId, page: GameFilterPage): string {
  return `${gameId}:${page}`;
}

type Store = {
  pages: Record<string, GamePageFilterState>;
  setKeyword: (gameId: GameId, page: GameFilterPage, keyword: string) => void;
  setCollapsed: (gameId: GameId, page: GameFilterPage, collapsed: boolean) => void;
  setFilter: (
    gameId: GameId,
    page: GameFilterPage,
    filterId: string,
    selection: FilterSelection,
  ) => void;
  clear: (gameId: GameId, page: GameFilterPage) => void;
  reset: () => void;
};

function updatePage(
  pages: Store['pages'],
  gameId: GameId,
  page: GameFilterPage,
  update: (current: GamePageFilterState) => GamePageFilterState,
): Store['pages'] {
  const key = pageKey(gameId, page);
  return { ...pages, [key]: update(pages[key] ?? EMPTY_PAGE_STATE) };
}

export const useGameFilters = create<Store>((set) => ({
  pages: {},
  setKeyword: (gameId, page, keyword) => set((state) => ({
    pages: updatePage(state.pages, gameId, page, (current) => ({ ...current, keyword })),
  })),
  setCollapsed: (gameId, page, collapsed) => set((state) => ({
    pages: updatePage(state.pages, gameId, page, (current) => ({ ...current, collapsed })),
  })),
  setFilter: (gameId, page, filterId, selection) => set((state) => ({
    pages: updatePage(state.pages, gameId, page, (current) => ({
      ...current,
      filters: { ...current.filters, [filterId]: selection },
    })),
  })),
  clear: (gameId, page) => set((state) => ({
    pages: updatePage(state.pages, gameId, page, (current) => ({
      ...EMPTY_PAGE_STATE,
      collapsed: current.collapsed,
    })),
  })),
  reset: () => set({ pages: {} }),
}));

export function selectGamePageFilters(
  pages: Store['pages'],
  gameId: GameId,
  page: GameFilterPage,
): GamePageFilterState {
  return pages[pageKey(gameId, page)] ?? EMPTY_PAGE_STATE;
}
