import { create } from 'zustand';
import type { MuseDashDifficultySlot, MuseDashDlcFilter } from '@/components/musedash/MuseDashFilterBar';

interface MuseDashCatalogFilterState {
  keyword: string;
  collapsed: boolean;
  difficultySlot: MuseDashDifficultySlot;
  dlc: MuseDashDlcFilter;
  constantMin: string;
  constantMax: string;
  setKeyword: (keyword: string) => void;
  setCollapsed: (collapsed: boolean) => void;
  setDifficultySlot: (slot: MuseDashDifficultySlot) => void;
  setDlc: (dlc: MuseDashDlcFilter) => void;
  setConstantMin: (value: string) => void;
  setConstantMax: (value: string) => void;
  clearFilters: () => void;
  reset: () => void;
}

const DEFAULT_STATE = {
  keyword: '',
  collapsed: true,
  difficultySlot: 'all' as const,
  dlc: 'all' as const,
  constantMin: '',
  constantMax: '',
};

export const useMuseDashCatalogFilter = create<MuseDashCatalogFilterState>((set) => ({
  ...DEFAULT_STATE,
  setKeyword: (keyword) => set({ keyword }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setDifficultySlot: (difficultySlot) => set({ difficultySlot }),
  setDlc: (dlc) => set({ dlc }),
  setConstantMin: (constantMin) => set({ constantMin }),
  setConstantMax: (constantMax) => set({ constantMax }),
  clearFilters: () => set({
    keyword: '', difficultySlot: 'all', dlc: 'all', constantMin: '', constantMax: '',
  }),
  reset: () => set(DEFAULT_STATE),
}));
