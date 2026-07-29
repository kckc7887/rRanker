import { create } from 'zustand';
import type { ChunithmLevelIndex } from '@/domain/chunithm';

interface ChunithmCatalogFilterState {
  keyword: string;
  collapsed: boolean;
  difficulty: ChunithmLevelIndex | 'all';
  version: string | 'all';
  constantMin: string;
  constantMax: string;
  setKeyword: (value: string) => void;
  setCollapsed: (value: boolean) => void;
  setDifficulty: (value: ChunithmLevelIndex | 'all') => void;
  setVersion: (value: string | 'all') => void;
  setConstantMin: (value: string) => void;
  setConstantMax: (value: string) => void;
  clearFilters: () => void;
  reset: () => void;
}

const DEFAULT_STATE = {
  keyword: '',
  collapsed: true,
  difficulty: 'all' as const,
  version: 'all' as const,
  constantMin: '',
  constantMax: '',
};

export const useChunithmCatalogFilter = create<ChunithmCatalogFilterState>((set) => ({
  ...DEFAULT_STATE,
  setKeyword: (keyword) => set({ keyword }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setVersion: (version) => set({ version }),
  setConstantMin: (constantMin) => set({ constantMin }),
  setConstantMax: (constantMax) => set({ constantMax }),
  clearFilters: () => set({
    keyword: '',
    difficulty: 'all',
    version: 'all',
    constantMin: '',
    constantMax: '',
  }),
  reset: () => set(DEFAULT_STATE),
}));
