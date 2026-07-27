import { rankScoreRecords, type Difficulty, type ScoreRecord } from '@rranker/core';

export type RecordsSort =
  | 'rating'
  | 'achievements'
  | 'constant'
  | 'dxScore'
  | 'title';

export type RecordsFilters = {
  keyword: string;
  difficulty: Difficulty | 'all';
  chartType: ScoreRecord['type'] | 'all';
  version: string;
  sort: RecordsSort;
  descending: boolean;
};

export const DEFAULT_RECORD_FILTERS: RecordsFilters = {
  keyword: '',
  difficulty: 'all',
  chartType: 'all',
  version: 'all',
  sort: 'rating',
  descending: true,
};

function compareRecords(
  left: ScoreRecord,
  right: ScoreRecord,
  sort: RecordsSort,
): number {
  switch (sort) {
    case 'achievements':
      return left.achievements - right.achievements;
    case 'constant':
      return left.difficultyConstant - right.difficultyConstant;
    case 'dxScore':
      return (left.dxScore ?? -1) - (right.dxScore ?? -1);
    case 'title':
      return left.title.localeCompare(right.title, 'zh-CN');
    case 'rating':
      return left.rating - right.rating;
  }
}

export function filterAndSortRecords(
  records: readonly ScoreRecord[],
  filters: RecordsFilters,
): ScoreRecord[] {
  const keyword = filters.keyword.trim().toLocaleLowerCase();
  const filtered = records.filter((record) => {
    if (
      keyword &&
      !record.title.toLocaleLowerCase().includes(keyword) &&
      !record.songId.toLocaleLowerCase().includes(keyword)
    ) {
      return false;
    }
    if (
      filters.difficulty !== 'all' &&
      record.difficulty !== filters.difficulty
    ) {
      return false;
    }
    if (filters.chartType !== 'all' && record.type !== filters.chartType) {
      return false;
    }
    if (filters.version !== 'all' && record.version !== filters.version) {
      return false;
    }
    return true;
  });
  if (filters.sort === 'rating' && filters.descending) {
    return rankScoreRecords(filtered);
  }
  return [...filtered].sort((left, right) => {
    const value = compareRecords(left, right, filters.sort);
    const ordered = filters.descending ? -value : value;
    return ordered || left.songId.localeCompare(right.songId);
  });
}
