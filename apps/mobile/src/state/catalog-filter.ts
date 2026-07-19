import { create } from 'zustand';
import type { ChartType, Difficulty } from '@/domain/models';
import type { VersionNameLocale } from '@/domain/version-names';

interface CatalogFilterState {
  keyword: string;
  collapsed: boolean;
  type: ChartType | 'all';
  difficulty: Difficulty | 'all';
  constantMin: string;
  constantMax: string;
  version: string | 'all';
  versionLocale: VersionNameLocale;
  setKeyword: (keyword: string) => void;
  setCollapsed: (collapsed: boolean) => void;
  setType: (type: ChartType | 'all') => void;
  setDifficulty: (difficulty: Difficulty | 'all') => void;
  setConstantMin: (constantMin: string) => void;
  setConstantMax: (constantMax: string) => void;
  setVersion: (version: string | 'all') => void;
  setVersionLocale: (versionLocale: VersionNameLocale) => void;
  reset: () => void;
}

const DEFAULT_CATALOG_FILTERS = {
  keyword: '',
  collapsed: false,
  type: 'all' as const,
  difficulty: 'all' as const,
  constantMin: '',
  constantMax: '',
  version: 'all' as const,
  versionLocale: 'china' as const,
};

export const useCatalogFilter = create<CatalogFilterState>((set) => ({
  ...DEFAULT_CATALOG_FILTERS,
  setKeyword: (keyword) => set({ keyword }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setType: (type) => set({ type }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setConstantMin: (constantMin) => set({ constantMin }),
  setConstantMax: (constantMax) => set({ constantMax }),
  setVersion: (version) => set({ version }),
  setVersionLocale: (versionLocale) => set({ versionLocale }),
  reset: () => set(DEFAULT_CATALOG_FILTERS),
}));
