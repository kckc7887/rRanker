import { create } from 'zustand';
import type { ChartType, Difficulty } from '@/domain/models';

interface RecordsFilterState {
  difficulty: Difficulty | 'all';
  version: string | 'all';
  type: ChartType | 'all';
  sortBy: 'rating' | 'achievements' | 'title';
  setDifficulty: (d: Difficulty | 'all') => void;
  setVersion: (v: string | 'all') => void;
  setType: (t: ChartType | 'all') => void;
  setSortBy: (s: 'rating' | 'achievements' | 'title') => void;
  reset: () => void;
}

export const useRecordsFilter = create<RecordsFilterState>((set) => ({
  difficulty: 'all',
  version: 'all',
  type: 'all',
  sortBy: 'rating',
  setDifficulty: (difficulty) => set({ difficulty }),
  setVersion: (version) => set({ version }),
  setType: (type) => set({ type }),
  setSortBy: (sortBy) => set({ sortBy }),
  reset: () => set({ difficulty: 'all', version: 'all', type: 'all', sortBy: 'rating' }),
}));
