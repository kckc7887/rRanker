import { create } from 'zustand';
import type { MuseDashAchievementFilter, MuseDashDifficultySlot, MuseDashDlcFilter } from '@/components/musedash/MuseDashFilterBar';

interface MuseDashRecordsFilterState {
  keyword: string;
  collapsed: boolean;
  difficultySlot: MuseDashDifficultySlot;
  dlc: MuseDashDlcFilter;
  constantMin: string;
  constantMax: string;
  accMin: string;
  accMax: string;
  achievement: MuseDashAchievementFilter;
  setKeyword: (keyword: string) => void;
  setCollapsed: (collapsed: boolean) => void;
  setDifficultySlot: (slot: MuseDashDifficultySlot) => void;
  setDlc: (dlc: MuseDashDlcFilter) => void;
  setConstantMin: (value: string) => void;
  setConstantMax: (value: string) => void;
  setAccMin: (value: string) => void;
  setAccMax: (value: string) => void;
  setAchievement: (achievement: MuseDashAchievementFilter) => void;
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
  accMin: '',
  accMax: '',
  achievement: 'all' as const,
};

export const useMuseDashRecordsFilter = create<MuseDashRecordsFilterState>((set) => ({
  ...DEFAULT_STATE,
  setKeyword: (keyword) => set({ keyword }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setDifficultySlot: (difficultySlot) => set({ difficultySlot }),
  setDlc: (dlc) => set({ dlc }),
  setConstantMin: (constantMin) => set({ constantMin }),
  setConstantMax: (constantMax) => set({ constantMax }),
  setAccMin: (accMin) => set({ accMin }),
  setAccMax: (accMax) => set({ accMax }),
  setAchievement: (achievement) => set({ achievement }),
  clearFilters: () => set({
    keyword: '', difficultySlot: 'all', dlc: 'all', constantMin: '', constantMax: '',
    accMin: '', accMax: '', achievement: 'all',
  }),
  reset: () => set(DEFAULT_STATE),
}));
