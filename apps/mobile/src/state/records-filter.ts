import { create } from 'zustand';
import type { ChartType, Difficulty } from '@/domain/models';
import type { VersionNameLocale } from '@/domain/version-names';

interface RecordsFilterState {
  difficulty: Difficulty | 'all';
  version: string | 'all';
  type: ChartType | 'all';
  constantMin: string;
  constantMax: string;
  sortBy: 'rating' | 'achievements' | 'title';
  versionLocale: VersionNameLocale;
  setDifficulty: (d: Difficulty | 'all') => void;
  setVersion: (v: string | 'all') => void;
  setType: (t: ChartType | 'all') => void;
  setConstantMin: (value: string) => void;
  setConstantMax: (value: string) => void;
  setSortBy: (s: 'rating' | 'achievements' | 'title') => void;
  setVersionLocale: (locale: VersionNameLocale) => void;
  reset: () => void;
}

export const useRecordsFilter = create<RecordsFilterState>((set) => ({
  difficulty: 'all',
  version: 'all',
  type: 'all',
  constantMin: '',
  constantMax: '',
  sortBy: 'rating',
  versionLocale: 'china',
  setDifficulty: (difficulty) => set({ difficulty }),
  setVersion: (version) => set({ version }),
  setType: (type) => set({ type }),
  setConstantMin: (constantMin) => set({ constantMin }),
  setConstantMax: (constantMax) => set({ constantMax }),
  setSortBy: (sortBy) => set({ sortBy }),
  setVersionLocale: (versionLocale) => set({ versionLocale }),
  reset: () => set({
    difficulty: 'all', version: 'all', type: 'all', constantMin: '', constantMax: '', sortBy: 'rating',
    versionLocale: 'china',
  }),
}));
