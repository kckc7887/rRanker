import { describe, expect, it } from 'vitest';
import { DEFAULT_RECORD_FILTERS, filterAndSortRecords } from '../src/app/records';
import { desktopSnapshot } from './fixtures';

describe('桌面成绩筛选与排序', () => {
  it('默认按 Rating 降序', async () => {
    const snapshot = await desktopSnapshot();
    const records = filterAndSortRecords(snapshot.records, DEFAULT_RECORD_FILTERS);
    expect(records.map((record) => record.title)).toEqual([
      'Beta Song',
      'Alpha Song',
    ]);
  });

  it('组合应用关键词、难度、类型与版本筛选', async () => {
    const snapshot = await desktopSnapshot();
    const records = filterAndSortRecords(snapshot.records, {
      ...DEFAULT_RECORD_FILTERS,
      keyword: 'beta',
      difficulty: 'remaster',
      chartType: 'DX',
      version: '当前版本',
    });
    expect(records).toHaveLength(1);
    expect(records[0]?.title).toBe('Beta Song');
  });

  it('支持标题升序', async () => {
    const snapshot = await desktopSnapshot();
    const records = filterAndSortRecords(snapshot.records, {
      ...DEFAULT_RECORD_FILTERS,
      sort: 'title',
      descending: false,
    });
    expect(records.map((record) => record.title)).toEqual([
      'Alpha Song',
      'Beta Song',
    ]);
  });
});
