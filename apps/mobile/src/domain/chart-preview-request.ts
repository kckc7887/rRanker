import type { PhiraChart } from '@/domain/phira';

export type ChartPreviewNavigationRequest =
  | {
      game: 'phigros';
      songId: string;
      levelIndex: number;
      title: string;
    }
  | {
      game: 'phira';
      chart: PhiraChart;
    };
