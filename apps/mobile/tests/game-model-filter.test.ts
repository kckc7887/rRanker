import { filterGameItems } from '@/domain/game-model-filter';
import type { FilterDefinition } from '@/domain/game-model';

const filters: FilterDefinition[] = [
  {
    id: 'difficulty',
    title: '难度',
    control: 'tags',
    options: [{ value: 'master', label: 'MASTER' }],
  },
  {
    id: 'version',
    title: '版本',
    control: 'list',
    options: [{ value: 'current', label: '当前版本' }],
    toggle: { leftLabel: '国服', rightLabel: '日服', defaultValue: false },
  },
  {
    id: 'constant',
    title: '定数',
    control: 'range',
    minimum: 0,
    maximum: 20,
  },
];

const items = [
  {
    id: 'a',
    searchText: 'alpha composer charter',
    filterValues: { difficulty: ['expert', 'master'], version: 'current', constant: [12.5, 14.6] },
  },
  {
    id: 'b',
    searchText: 'beta composer',
    filterValues: { difficulty: 'expert', version: 'old', constant: 11.0 },
  },
];

describe('generic game filters', () => {
  it('combines normalized search, tags, list and range filters', () => {
    expect(filterGameItems(items, 'ＡＬＰＨＡ charter', filters, {
      difficulty: { value: 'master' },
      version: { value: 'current', toggle: true },
      constant: { minimum: '14', maximum: '15' },
    }).map((item) => item.id)).toEqual(['a']);
  });

  it('treats empty selections as no-op and rejects out-of-range values', () => {
    expect(filterGameItems(items, '', filters, {}).length).toBe(2);
    expect(filterGameItems(items, '', filters, {
      constant: { minimum: '15' },
    })).toEqual([]);
  });
});
