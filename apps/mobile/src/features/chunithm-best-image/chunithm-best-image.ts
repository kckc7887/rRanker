import type { ChunithmScoreCardData } from '@/domain/chunithm-score-presentation';

export type ChunithmBestImageType = 'best50';
export type ChunithmBestImageSelectionCount = 0 | 5 | 10;

export type ChunithmBestImageSection = {
  id: string;
  title: string;
  records: ChunithmScoreCardData[];
};

export type ChunithmBestImagePage = {
  id: string;
  pageIndex: number;
  pageCount: number;
  sections: ChunithmBestImageSection[];
};

/** 在 Best 30 / New 20 之后追加 Selection 分区；count=0 不加分区。 */
export function appendChunithmSelectionScores(
  sections: readonly ChunithmBestImageSection[],
  selections: readonly ChunithmScoreCardData[],
  count: ChunithmBestImageSelectionCount,
): ChunithmBestImageSection[] {
  const copied = sections.map((section) => ({
    ...section,
    records: [...section.records],
  }));
  if (count === 0) return copied;
  const picked = selections.slice(0, count);
  if (!picked.length) return copied;
  copied.push({
    id: 'selection',
    title: 'Selection',
    records: picked,
  });
  return copied;
}

/** 按调用方指定的单页数量分页，保持分区顺序与区内顺序。 */
export function paginateChunithmBestImageSections(
  sections: readonly ChunithmBestImageSection[],
  pageSize = 50,
): ChunithmBestImagePage[] {
  const flat = sections.flatMap((section) => (
    section.records.map((record) => ({ section, record }))
  ));
  const pageCount = Math.max(1, Math.ceil(flat.length / Math.max(1, pageSize)));
  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const slice = flat.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
    const pageSections: ChunithmBestImageSection[] = [];
    for (const { section, record } of slice) {
      const last = pageSections.at(-1);
      if (last?.id === section.id) {
        last.records.push(record);
      } else {
        pageSections.push({
          id: section.id,
          title: section.title,
          records: [record],
        });
      }
    }
    return {
      id: `chunithm-page-${pageIndex}`,
      pageIndex,
      pageCount,
      sections: pageSections,
    };
  });
}
