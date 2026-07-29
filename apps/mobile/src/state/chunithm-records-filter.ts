import { create } from 'zustand';
import type { ChunithmLevelIndex } from '@/domain/chunithm';
import type { ChunithmRank } from '@/domain/chunithm-score-presentation';

interface ChunithmRecordsFilterState {
  keyword: string;
  collapsed: boolean;
  difficulty: ChunithmLevelIndex | 'all';
  version: string | 'all';
  constantMin: string;
  constantMax: string;
  rankMin: ChunithmRank | null;
  rankMax: ChunithmRank | null;
  setKeyword: (value: string) => void;
  setCollapsed: (value: boolean) => void;
  setDifficulty: (value: ChunithmLevelIndex | 'all') => void;
  setVersion: (value: string | 'all') => void;
  setConstantMin: (value: string) => void;
  setConstantMax: (value: string) => void;
  setRankMin: (value: ChunithmRank | null) => void;
  setRankMax: (value: ChunithmRank | null) => void;
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
  rankMin: null as ChunithmRank | null,
  rankMax: null as ChunithmRank | null,
};

export const useChunithmRecordsFilter = create<ChunithmRecordsFilterState>((set) => ({
  ...DEFAULT_STATE,
  setKeyword: (keyword) => set({ keyword }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setVersion: (version) => set({ version }),
  setConstantMin: (constantMin) => set({ constantMin }),
  setConstantMax: (constantMax) => set({ constantMax }),
  setRankMin: (rankMin) => set({ rankMin }),
  setRankMax: (rankMax) => set({ rankMax }),
  clearFilters: () => set({
    keyword: '',
    difficulty: 'all',
    version: 'all',
    constantMin: '',
    constantMax: '',
    rankMin: null,
    rankMax: null,
  }),
  reset: () => set(DEFAULT_STATE),
}));
