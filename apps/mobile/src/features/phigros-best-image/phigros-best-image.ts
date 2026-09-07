import type { ScoreRecord } from '@/domain/models';

export type PhigrosBestImageType = 'best30' | 'custom';
export type PhigrosBestImageOverflowCount = 0 | 3 | 6 | 9;

export type PhigrosBestImageSection = {
  id: string;
  title: string;
  titleNote?: string;
  records: ScoreRecord[];
};
export type PhigrosBestImagePage = {
  id: string;
  pageIndex: number;
  pageCount: number;
  sections: PhigrosBestImageSection[];
};

export function sortPhigrosBestImageRecords(records: readonly ScoreRecord[]): ScoreRecord[] {
  return records.map((record, index) => ({ record, index }))
    .sort((left, right) => right.record.rating - left.record.rating
      || right.record.achievements - left.record.achievements
      || left.index - right.index)
    .map(({ record }) => record);
}

function recordKey(record: Pick<ScoreRecord, 'songId' | 'levelIndex'>): string {
  return `${record.songId}:${record.levelIndex}`;
}

export function appendPhigrosOverflowRecords(
  sections: readonly PhigrosBestImageSection[],
  records: readonly ScoreRecord[],
  count: PhigrosBestImageOverflowCount,
): PhigrosBestImageSection[] {
  const copied = sections.map((section) => ({ ...section, records: [...section.records] }));
  if (count === 0) return copied;
  const bestKeys = new Set(
    copied.filter((section) => !section.id.toLocaleLowerCase().includes('phi'))
      .flatMap((section) => section.records.map(recordKey)),
  );
  const overflow = sortPhigrosBestImageRecords(records)
    .filter((record) => !bestKeys.has(recordKey(record)))
    .slice(0, count);
  if (overflow.length) copied.push({ id: 'overflow', title: 'OVER FLOW', records: overflow });
  return copied;
}

/** 按调用方指定的单页数量分页，保持分区顺序与区内顺序。 */
export function paginatePhigrosBestImageSections(
  sections: readonly PhigrosBestImageSection[],
  pageSize = 30,
): PhigrosBestImagePage[] {
  const flat = sections.flatMap((section) => section.records.map((record) => ({ section, record })));
  const pageCount = Math.max(1, Math.ceil(flat.length / pageSize));
  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const slice = flat.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
    const pageSections: PhigrosBestImageSection[] = [];
    for (const { section, record } of slice) {
      const last = pageSections.at(-1);
      if (last?.id === section.id) last.records.push(record);
      else {
        pageSections.push({
          id: section.id,
          title: section.title,
          ...(section.titleNote ? { titleNote: section.titleNote } : {}),
          records: [record],
        });
      }
    }
    return { id: `phi-page-${pageIndex}`, pageIndex, pageCount, sections: pageSections };
  });
}

export function preparePhigrosBestImageCards(type: PhigrosBestImageType, page: PhigrosBestImagePage) {
  const phiRecords = type === 'best30' ? page.sections.filter((section) => section.id.toLowerCase().includes('phi')).flatMap((section) => section.records) : [];
  const bestRecords = type === 'best30' ? page.sections.filter((section) => !section.id.toLowerCase().includes('phi')).flatMap((section) => section.records) : page.sections.flatMap((section) => section.records);
  const cutoffIndex = type === 'best30' ? 26 : 29;
  const cutoffRks = bestRecords[Math.min(cutoffIndex, bestRecords.length - 1)]?.rating ?? bestRecords.at(-1)?.rating ?? 0;
  const lowestPhiRks = phiRecords.at(-1)?.rating ?? 0;
  const pageOffset = type === 'custom' ? page.pageIndex * 30 : 0;
  const bestLimit = type === 'best30' ? 27 : 30;
  let phiIndex = 0, bestIndex = 0;
  return page.sections.filter((section) => section.records.length > 0).map((section) => {
    const isPhi = type === 'best30' && section.id.toLowerCase().includes('phi');
    return { section, cards: section.records.map((record) => {
      if (isPhi) return { record, rank: 'P' + (++phiIndex), isPhi: true, inBest: false, referenceRks: cutoffRks, allowPerfect: false };
      const index = bestIndex++;
      return { record, rank: '#' + (pageOffset + index + 1), isPhi: false, inBest: index < bestLimit,
        referenceRks: index < cutoffIndex ? record.rating : cutoffRks, allowPerfect: !lowestPhiRks || record.rating > lowestPhiRks };
    }) };
  });
}
