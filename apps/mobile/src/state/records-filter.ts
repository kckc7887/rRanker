import { create } from 'zustand';
import type { MaimaiFcAchievement, MaimaiFsAchievement } from '@/domain/maimai-filters';
import type { ChartType, Difficulty } from '@/domain/models';
import type { VersionNameLocale } from '@/domain/version-names';

interface RecordsFilterState {
  keyword: string;
  collapsed: boolean;
  difficulty: Difficulty | 'all';
  version: string | 'all';
  type: ChartType | 'all';
  constantMin: string;
  constantMax: string;
  achievementMin: string;
  achievementMax: string;
  soloAchievement: MaimaiFcAchievement | null;
  multiAchievement: MaimaiFsAchievement | null;
  sortBy: 'rating' | 'achievements' | 'title';
  versionLocale: VersionNameLocale;
  setKeyword: (value: string) => void;
  setCollapsed: (value: boolean) => void;
  setDifficulty: (d: Difficulty | 'all') => void;
  setVersion: (v: string | 'all') => void;
  setType: (t: ChartType | 'all') => void;
  setConstantMin: (value: string) => void;
  setConstantMax: (value: string) => void;
  setAchievementMin: (value: string) => void;
  setAchievementMax: (value: string) => void;
  setSoloAchievement: (value: MaimaiFcAchievement | null) => void;
  setMultiAchievement: (value: MaimaiFsAchievement | null) => void;
  setSortBy: (s: 'rating' | 'achievements' | 'title') => void;
  setVersionLocale: (locale: VersionNameLocale) => void;
  reset: () => void;
}

export const useRecordsFilter = create<RecordsFilterState>((set) => ({
  keyword: '',
  collapsed: true,
  difficulty: 'all',
  version: 'all',
  type: 'all',
  constantMin: '',
  constantMax: '',
  achievementMin: '',
  achievementMax: '',
  soloAchievement: null,
  multiAchievement: null,
  sortBy: 'rating',
  versionLocale: 'china',
  setKeyword: (keyword) => set({ keyword }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setVersion: (version) => set({ version }),
  setType: (type) => set({ type }),
  setConstantMin: (constantMin) => set({ constantMin }),
  setConstantMax: (constantMax) => set({ constantMax }),
  setAchievementMin: (achievementMin) => set({ achievementMin }),
  setAchievementMax: (achievementMax) => set({ achievementMax }),
  setSoloAchievement: (soloAchievement) => set({ soloAchievement }),
  setMultiAchievement: (multiAchievement) => set({ multiAchievement }),
  setSortBy: (sortBy) => set({ sortBy }),
  setVersionLocale: (versionLocale) => set({ versionLocale }),
  reset: () => set({
    keyword: '', collapsed: true, difficulty: 'all', version: 'all', type: 'all',
    constantMin: '', constantMax: '', achievementMin: '', achievementMax: '',
    soloAchievement: null, multiAchievement: null, sortBy: 'rating', versionLocale: 'china',
  }),
}));
