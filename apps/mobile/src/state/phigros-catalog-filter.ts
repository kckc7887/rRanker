import { create } from 'zustand';
import type { PhigrosLevel } from '@/domain/phigros';

interface PhigrosCatalogFilterState {
  keyword: string;
  collapsed: boolean;
  level: PhigrosLevel | 'all';
  constantMin: string;
  constantMax: string;
  chapter: string | 'all';
  selectedKyouTagIds: number[];
  setKeyword: (keyword: string) => void;
  setCollapsed: (collapsed: boolean) => void;
  setLevel: (level: PhigrosLevel | 'all') => void;
  setConstantMin: (constantMin: string) => void;
  setConstantMax: (constantMax: string) => void;
  setChapter: (chapter: string | 'all') => void;
  setSelectedKyouTagIds: (tagIds: number[]) => void;
  clearFilters: () => void;
  reset: () => void;
}

const DEFAULT_STATE = {
  keyword: '',
  collapsed: true,
  level: 'all' as const,
  constantMin: '',
  constantMax: '',
  chapter: 'all' as const,
  selectedKyouTagIds: [] as number[],
};

export const usePhigrosCatalogFilter = create<PhigrosCatalogFilterState>((set) => ({
  ...DEFAULT_STATE,
  setKeyword: (keyword) => set({ keyword }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setLevel: (level) => set({ level }),
  setConstantMin: (constantMin) => set({ constantMin }),
  setConstantMax: (constantMax) => set({ constantMax }),
  setChapter: (chapter) => set({ chapter }),
  setSelectedKyouTagIds: (selectedKyouTagIds) => set({ selectedKyouTagIds }),
  clearFilters: () => set({
    keyword: '',
    level: 'all',
    constantMin: '',
    constantMax: '',
    chapter: 'all',
    selectedKyouTagIds: [],
  }),
  reset: () => set(DEFAULT_STATE),
}));
