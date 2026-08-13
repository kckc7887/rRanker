import { create } from 'zustand';
import type { PhigrosRankFilter } from '@/domain/phigros-filters';
import type { PhigrosXingKind } from '@/domain/phigros-xing';
import type { PhiraScoreSort } from '@/domain/phira-filters';

const DEFAULTS = {
  keyword: '', collapsed: true, constantMin: '', constantMax: '', accuracyMin: '', accuracyMax: '',
  rank: null as PhigrosRankFilter | null, xing: null as PhigrosXingKind | null, sort: 'score' as PhiraScoreSort,
};

type State = typeof DEFAULTS & {
  setKeyword: (value: string) => void; setCollapsed: (value: boolean) => void;
  setConstantMin: (value: string) => void; setConstantMax: (value: string) => void;
  setAccuracyMin: (value: string) => void; setAccuracyMax: (value: string) => void;
  setRank: (value: PhigrosRankFilter | null) => void; setXing: (value: PhigrosXingKind | null) => void;
  setSort: (value: PhiraScoreSort) => void; clearFilters: () => void;
};

export const usePhiraRecordsFilter = create<State>((set) => ({
  ...DEFAULTS,
  setKeyword: (keyword) => set({ keyword }), setCollapsed: (collapsed) => set({ collapsed }),
  setConstantMin: (constantMin) => set({ constantMin }), setConstantMax: (constantMax) => set({ constantMax }),
  setAccuracyMin: (accuracyMin) => set({ accuracyMin }), setAccuracyMax: (accuracyMax) => set({ accuracyMax }),
  setRank: (rank) => set({ rank }), setXing: (xing) => set({ xing }), setSort: (sort) => set({ sort }),
  clearFilters: () => set(DEFAULTS),
}));
