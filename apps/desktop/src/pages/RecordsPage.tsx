import type { Difficulty, ScoreRecord } from '@rranker/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_RECORD_FILTERS,
  filterAndSortRecords,
  type RecordsFilters,
  type RecordsSort,
} from '../app/records';
import { DIFFICULTY_LABELS, formatDxScore } from '../app/format';
import { useAppRuntime } from '../app/runtime';
import { DifficultyBadge } from '../components/DifficultyBadge';
import { SongCover } from '../components/SongCover';
import { LoadingView } from '../components/StateViews';

const DIFFICULTIES: Difficulty[] = [
  'basic',
  'advanced',
  'expert',
  'master',
  'remaster',
];

const SORT_COLUMNS: { id: RecordsSort; label: string }[] = [
  { id: 'title', label: '歌曲 / 谱面' },
  { id: 'constant', label: '定数' },
  { id: 'achievements', label: '达成率' },
  { id: 'dxScore', label: 'DX Score' },
  { id: 'rating', label: 'Rating' },
];

function SortHeader({
  column,
  filters,
  onChange,
}: {
  column: (typeof SORT_COLUMNS)[number];
  filters: RecordsFilters;
  onChange(next: RecordsFilters): void;
}) {
  const active = filters.sort === column.id;
  return (
    <button
      type="button"
      className={`table-sort${active ? ' table-sort-active' : ''}`}
      onClick={() =>
        onChange({
          ...filters,
          sort: column.id,
          descending: active ? !filters.descending : column.id !== 'title',
        })
      }
    >
      {column.label}
      {active ? (
        filters.descending ? (
          <ArrowDown size={13} />
        ) : (
          <ArrowUp size={13} />
        )
      ) : null}
    </button>
  );
}

function RecordRow({ record, index }: { record: ScoreRecord; index: number }) {
  return (
    <div className="record-row" role="row" data-index={index}>
      <span className="record-index">{index + 1}</span>
      <div className="record-song">
        <SongCover songId={record.songId} size={42} />
        <span>
          <strong title={record.title}>{record.title}</strong>
          <small>
            <DifficultyBadge difficulty={record.difficulty} compact />
            {record.type} · {record.level}
          </small>
        </span>
      </div>
      <span className="table-number">{record.difficultyConstant.toFixed(1)}</span>
      <strong className="achievement-cell">{record.achievements.toFixed(4)}%</strong>
      <span className="table-number">{formatDxScore(record)}</span>
      <span className="status-cell">AP+ · FDX+</span>
      <strong className="rating-cell">{record.rating}</strong>
    </div>
  );
}

export function RecordsPage() {
  const { snapshot } = useAppRuntime();
  const [filters, setFilters] = useState(DEFAULT_RECORD_FILTERS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const versions = useMemo(
    () =>
      snapshot
        ? [...new Set(snapshot.records.map((record) => record.version))].sort(
            (left, right) => left.localeCompare(right, 'zh-CN'),
          )
        : [],
    [snapshot],
  );
  const records = useMemo(
    () => (snapshot ? filterAndSortRecords(snapshot.records, filters) : []),
    [filters, snapshot],
  );
  // TanStack Virtual intentionally exposes imperative measurement functions.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 62,
    overscan: 10,
  });

  if (!snapshot) return <LoadingView />;

  const filterCount = [
    filters.keyword,
    filters.difficulty !== 'all',
    filters.chartType !== 'all',
    filters.version !== 'all',
  ].filter(Boolean).length;

  return (
    <div className="page-stack records-page">
      <section className="page-heading records-heading">
        <div>
          <span className="eyebrow">舞萌 DX · 全部成绩</span>
          <h1>成绩工作台</h1>
          <p>
            当前显示 {records.length.toLocaleString('zh-CN')} /{' '}
            {snapshot.records.length.toLocaleString('zh-CN')} 张谱面。
          </p>
        </div>
        {filterCount > 0 ? (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => setFilters(DEFAULT_RECORD_FILTERS)}
          >
            <X size={15} />
            清除 {filterCount} 项筛选
          </button>
        ) : null}
      </section>

      <section className="records-toolbar">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
            value={filters.keyword}
            placeholder="搜索歌曲名或曲目 ID"
            onChange={(event) =>
              setFilters({ ...filters, keyword: event.target.value })
            }
          />
        </label>
        <label className="select-field">
          <SlidersHorizontal size={15} aria-hidden="true" />
          <select
            aria-label="难度筛选"
            value={filters.difficulty}
            onChange={(event) =>
              setFilters({
                ...filters,
                difficulty: event.target.value as Difficulty | 'all',
              })
            }
          >
            <option value="all">全部难度</option>
            {DIFFICULTIES.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {DIFFICULTY_LABELS[difficulty]}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <select
            aria-label="谱面类型筛选"
            value={filters.chartType}
            onChange={(event) =>
              setFilters({
                ...filters,
                chartType: event.target.value as 'all' | 'SD' | 'DX',
              })
            }
          >
            <option value="all">SD + DX</option>
            <option value="SD">仅 SD</option>
            <option value="DX">仅 DX</option>
          </select>
        </label>
        <label className="select-field select-version">
          <select
            aria-label="版本筛选"
            value={filters.version}
            onChange={(event) =>
              setFilters({ ...filters, version: event.target.value })
            }
          >
            <option value="all">全部版本</option>
            {versions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="records-table" role="table" aria-label="舞萌成绩">
        <div className="record-header" role="row">
          <span>#</span>
          {SORT_COLUMNS.filter((column) => column.id !== 'rating').map((column) => (
            <SortHeader
              key={column.id}
              column={column}
              filters={filters}
              onChange={setFilters}
            />
          ))}
          <span>成就</span>
          <SortHeader
            column={SORT_COLUMNS.find((column) => column.id === 'rating')!}
            filters={filters}
            onChange={setFilters}
          />
        </div>
        <div className="record-scroll" ref={scrollRef}>
          {records.length === 0 ? (
            <div className="table-empty">
              <Search size={24} />
              <strong>没有符合条件的成绩</strong>
              <span>调整关键词或筛选条件后再试。</span>
            </div>
          ) : (
            <div
              className="record-virtual-space"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={virtualRow.key}
                  className="record-virtual-row"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <RecordRow
                    record={records[virtualRow.index]}
                    index={virtualRow.index}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
