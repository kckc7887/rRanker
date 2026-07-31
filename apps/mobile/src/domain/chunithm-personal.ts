import { z } from 'zod';
import type { DataSource } from './models';

const CollectionSchema = z.object({
  id: z.number().int(),
  name: z.string().optional(),
  color: z.string().nullable().optional(),
  level: z.number().int().nullable().optional(),
}).passthrough();

export const ChunithmPlayerSchema = z.object({
  name: z.string(),
  level: z.number().int().nonnegative(),
  rating: z.number().finite().nonnegative(),
  rating_possession: z.string().optional(),
  friend_code: z.union([z.number().int(), z.string()]),
  class_emblem: z.object({
    base: z.number().int().nonnegative(),
    medal: z.number().int().nonnegative(),
  }).passthrough(),
  reborn_count: z.number().int().nonnegative(),
  over_power: z.number().finite().nonnegative(),
  over_power_progress: z.number().finite().nonnegative(),
  currency: z.number().int().nonnegative(),
  total_currency: z.number().int().nonnegative(),
  total_play_count: z.number().int().nonnegative(),
  trophy: CollectionSchema.nullable().optional(),
  character: CollectionSchema.nullable().optional(),
  name_plate: CollectionSchema.nullable().optional(),
  map_icon: CollectionSchema.nullable().optional(),
  upload_time: z.string().optional(),
}).passthrough();

export const ChunithmScoreSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  song_name: z.string().optional(),
  level: z.string().optional(),
  level_index: z.number().int().min(0).max(5),
  score: z.number().int().nonnegative(),
  rating: z.number().finite().nonnegative().optional(),
  over_power: z.number().finite().nonnegative().optional(),
  clear: z.enum(['catastrophy', 'absolute', 'brave', 'hard', 'clear', 'failed']),
  full_combo: z.enum(['alljusticecritical', 'alljustice', 'fullcombo']).nullable().optional(),
  full_chain: z.enum(['fullchain', 'fullchain2']).nullable().optional(),
  rank: z.enum([
    'sssp', 'sss', 'ssp', 'ss', 'sp', 's',
    'aaa', 'aa', 'a', 'bbb', 'bb', 'b', 'c', 'd',
  ]).optional(),
  play_time: z.string().nullable().optional(),
  upload_time: z.string().optional(),
  last_played_time: z.string().nullable().optional(),
}).passthrough();

export type ChunithmPlayer = z.infer<typeof ChunithmPlayerSchema>;
export type ChunithmScore = z.infer<typeof ChunithmScoreSchema>;

export const ChunithmBestsSchema = z.object({
  bests: z.array(ChunithmScoreSchema),
  selections: z.array(ChunithmScoreSchema).optional().default([]),
  new_bests: z.array(ChunithmScoreSchema).optional().default([]),
}).passthrough();

export type ChunithmBests = z.infer<typeof ChunithmBestsSchema>;

export type ChunithmPersonalSnapshot = {
  player: ChunithmPlayer | null;
  scores: ChunithmScore[];
  bests: ChunithmBests;
  source: DataSource;
};

export type LegacyChunithmPersonalSnapshot = Omit<ChunithmPersonalSnapshot, 'bests'>;

export const CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION = 2;
export const CHUNITHM_PERSONAL_LEGACY_SCHEMA_VERSION = 1;

export function emptyChunithmBests(): ChunithmBests {
  return {
    bests: [],
    selections: [],
    new_bests: [],
  };
}

export function chunithmPersonalResourceKey(accountId: string): string {
  return `chunithm-score:${accountId}`;
}

export function buildChunithmMapIconUrl(iconId: number | null | undefined): string | null {
  if (!Number.isSafeInteger(iconId) || (iconId ?? -1) < 0) return null;
  return `https://assets2.lxns.net/chunithm/icon/${iconId}.png`;
}

export function buildChunithmCharacterUrl(characterId: number | null | undefined): string | null {
  if (!Number.isSafeInteger(characterId) || (characterId ?? -1) < 0) return null;
  return `https://assets2.lxns.net/chunithm/character/${characterId}.png`;
}

export function buildChunithmNamePlateUrl(plateId: number | null | undefined): string | null {
  if (!Number.isSafeInteger(plateId) || (plateId ?? -1) < 0) return null;
  return `https://assets2.lxns.net/chunithm/plate/${plateId}.png`;
}

export function buildChunithmTrophyUrl(trophyId: number | null | undefined): string | null {
  if (!Number.isSafeInteger(trophyId) || (trophyId ?? -1) < 0) return null;
  return `https://assets2.lxns.net/chunithm/trophy/${trophyId}.png`;
}
