import type { DetailParams } from './navigation';

type LibraryTargetBase = {
  gameId: string;
  id: string;
  target: DetailParams;
};

export type SongLibraryTarget = LibraryTargetBase & { kind: 'song' };
export type ChartLibraryTarget = LibraryTargetBase & { kind: 'chart' };
export type LibraryTarget = SongLibraryTarget | ChartLibraryTarget;
