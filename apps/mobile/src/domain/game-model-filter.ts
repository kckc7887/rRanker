import type { FilterDefinition } from './game-model';
import type { FilterSelection } from '@/state/game-filters';

type Filterable = {
  searchText: string;
  filterValues: Record<string, string | number | boolean | (string | number | boolean)[]>;
};

function values(value: Filterable['filterValues'][string]): (string | number | boolean)[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function matchesText(searchText: string, keyword: string): boolean {
  const terms = keyword.normalize('NFKC').trim().toLowerCase().split(/\s+/u).filter(Boolean);
  return terms.every((term) => searchText.includes(term));
}

function matchesFilter(
  item: Filterable,
  definition: FilterDefinition,
  selection: FilterSelection | undefined,
): boolean {
  if (!selection) return true;
  const sourceValues = values(item.filterValues[definition.id]);
  if ((definition.control === 'tags' || definition.control === 'list') && selection.value) {
    return sourceValues.some((value) => String(value) === selection.value);
  }
  if (definition.control === 'range') {
    const minimum = selection.minimum?.trim() ? Number(selection.minimum) : undefined;
    const maximum = selection.maximum?.trim() ? Number(selection.maximum) : undefined;
    if (minimum === undefined && maximum === undefined) return true;
    return sourceValues.some((value) => {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) return false;
      return (minimum === undefined || numeric >= minimum)
        && (maximum === undefined || numeric <= maximum);
    });
  }
  return true;
}

export function filterGameItems<T extends Filterable>(
  items: readonly T[],
  keyword: string,
  definitions: readonly FilterDefinition[],
  selections: Record<string, FilterSelection>,
): T[] {
  return items.filter((item) => matchesText(item.searchText, keyword)
    && definitions.every((definition) => matchesFilter(
      item,
      definition,
      selections[definition.id],
    )));
}
