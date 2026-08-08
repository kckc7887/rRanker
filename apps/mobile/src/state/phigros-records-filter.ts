import { create } from 'zustand';
import type { PhigrosRankFilter } from '@/domain/phigros-filters';
import type { PhigrosLevel } from '@/domain/phigros';
import type { PhigrosXingKind } from '@/domain/phigros-xing';

interface PhigrosRecordsFilterState {
  keyword: string;
  collapsed: boolean;
  level: PhigrosLevel | 'all';
  constantMin: string;
  constantMax: string;
  accuracyMin: string;
  accuracyMax: string;
  rank: PhigrosRankFilter | null;
  xing: PhigrosXingKind | null;
  chapter: string | 'all';
  setKeyword: (value: string) => void;
  setCollapsed: (value: boolean) => void;
  setLevel: (level: PhigrosLevel | 'all') => void;
  setConstantMin: (value: string) => void;
  setConstantMax: (value: string) => void;
  setAccuracyMin: (value: string) => void;
  setAccuracyMax: (value: string) => void;
  setRank: (value: PhigrosRankFilter | null) => void;
  setXing: (value: PhigrosXingKind | null) => void;
  setChapter: (value: string | 'all') => void;
  clearFilters: () => void;
  reset: () => void;
}

const DEFAULT_STATE = {
  keyword: '',
  collapsed: true,
  level: 'all' as const,
  constantMin: '',
  constantMax: '',
  accuracyMin: '',
  accuracyMax: '',
  rank: null as PhigrosRankFilter | null,
  xing: null as PhigrosXingKind | null,
  chapter: 'all' as const,
};

export const usePhigrosRecordsFilter = create<PhigrosRecordsFilterState>((set) => ({
  ...DEFAULT_STATE,
  setKeyword: (keyword) => set({ keyword }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setLevel: (level) => set({ level }),
  setConstantMin: (constantMin) => set({ constantMin }),
  setConstantMax: (constantMax) => set({ constantMax }),
  setAccuracyMin: (accuracyMin) => set({ accuracyMin }),
  setAccuracyMax: (accuracyMax) => set({ accuracyMax }),
  setRank: (rank) => set({ rank }),
  setXing: (xing) => set({ xing }),
  setChapter: (chapter) => set({ chapter }),
  clearFilters: () => set({
    keyword: '',
    level: 'all',
    constantMin: '',
    constantMax: '',
    accuracyMin: '',
    accuracyMax: '',
    rank: null,
    xing: null,
    chapter: 'all',
  }),
  reset: () => set(DEFAULT_STATE),
}));
