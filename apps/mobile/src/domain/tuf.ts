import { z } from 'zod';

const nullableNumber = z.number().finite().nullable().optional();
const nullableString = z.string().nullable().optional();

export const TufDifficultySchema = z.object({
  id: z.number().int(), name: z.string().min(1), type: z.string().min(1),
  sortOrder: z.number().int().optional(), baseScore: nullableNumber,
  color: nullableString, icon: nullableString,
}).passthrough();

export const TufJudgementsSchema = z.object({
  earlyDouble: z.number().int().nonnegative().optional(),
  earlySingle: z.number().int().nonnegative().optional(),
  ePerfect: z.number().int().nonnegative().optional(),
  perfect: z.number().int().nonnegative().optional(),
  lPerfect: z.number().int().nonnegative().optional(),
  lateSingle: z.number().int().nonnegative().optional(),
  lateDouble: z.number().int().nonnegative().optional(),
}).passthrough();

const TufCreatorSchema = z.object({
  id: z.number().int().optional(), name: z.string().min(1),
}).passthrough();

const TufLevelCreditSchema = z.object({
  role: z.string().min(1), creator: TufCreatorSchema,
}).passthrough();

export const TufLevelSchema = z.object({
  id: z.number().int(),
  songId: z.number().int().nullable().optional(),
  song: z.string().min(1), artist: z.string().optional().default(''),
  diffId: z.number().int().nullable().optional(), baseScore: nullableNumber,
  bpm: nullableNumber, tilecount: z.number().int().nonnegative().nullable().optional(),
  autoTileCount: z.number().int().nonnegative().nullable().optional(),
  levelLengthInMs: z.number().finite().nonnegative().nullable().optional(),
  description: nullableString, downloadLink: nullableString, dlLink: nullableString,
  workshopLink: nullableString, videoLink: nullableString,
  isHidden: z.boolean().optional(), isDeleted: z.boolean().optional(),
  difficulty: TufDifficultySchema.nullable().optional(),
  levelCredits: z.array(TufLevelCreditSchema).optional().default([]),
  tags: z.array(z.union([
    z.string(),
    z.object({ id: z.number().int().optional(), name: z.string().min(1) }).passthrough(),
  ])).optional().default([]),
  curations: z.array(z.unknown()).optional().default([]),
  stats: z.record(z.string(), z.unknown()).optional(),
  clears: z.number().int().nonnegative().nullable().optional(),
  uniqueClears: z.number().int().nonnegative().nullable().optional(),
  likes: z.number().int().nonnegative().nullable().optional(),
  downloadCount: z.number().int().nonnegative().nullable().optional(),
}).passthrough();

export const TufPassSchema = z.object({
  id: z.number().int(), levelId: z.number().int(), scoreV2: z.number().finite(),
  accuracy: z.number().finite(), speed: z.number().finite(),
  vidUploadTime: z.string().nullable().optional(), videoLink: nullableString,
  isHidden: z.boolean().optional(), isWorldsFirst: z.boolean().nullable().optional(),
  isWorldsFirstPP: z.boolean().nullable().optional(), isDuplicate: z.boolean().optional(),
  impact: nullableNumber, judgements: TufJudgementsSchema.nullable().optional(),
  level: TufLevelSchema,
}).passthrough();

const TufTopScoreSchema = z.object({ id: z.number().int(), impact: z.number().finite() }).passthrough();

export const TufPlayerSchema = z.object({
  id: z.number().int(), name: z.string().min(1), avatar: nullableString, avatarUrl: nullableString, pfp: nullableString,
  discordId: nullableString, rankedScore: z.number().finite().optional().default(0),
  generalScore: z.number().finite().optional().default(0),
  ppScore: z.number().finite().optional().default(0), averageXacc: nullableNumber,
  globalRank: z.number().int().positive().nullable().optional(),
  rankedScoreRank: z.number().int().positive().nullable().optional(),
  rank: z.number().int().positive().nullable().optional(),
  totalPasses: z.number().int().nonnegative().optional().default(0),
  universalPassCount: z.number().int().nonnegative().optional().default(0),
  worldFirstCount: z.number().int().nonnegative().optional(),
  worldsFirstCount: z.number().int().nonnegative().optional(),
  topDiff: z.union([z.string(), z.number(), TufDifficultySchema]).nullable().optional(),
  topScores: z.array(TufTopScoreSchema).optional().default([]),
}).passthrough().transform((player) => ({
  ...player,
  avatarUrl: player.avatarUrl ?? player.pfp ?? player.avatar,
  globalRank: player.globalRank ?? player.rankedScoreRank ?? player.rank,
  worldFirstCount: player.worldFirstCount ?? player.worldsFirstCount ?? 0,
}));

export const TufPlayerSearchResponseSchema = z.object({
  total: z.number().int().nonnegative(), results: z.array(TufPlayerSchema),
  limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
}).passthrough();
export const TufPassPageSchema = z.object({
  total: z.number().int().nonnegative(), passes: z.array(TufPassSchema),
  limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
}).passthrough();
export const TufLevelPageSchema = z.object({
  total: z.number().int().nonnegative(), results: z.array(TufLevelSchema),
  limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
  hasMore: z.boolean(), page: z.number().int().nonnegative().optional(),
}).passthrough();
export const TufLevelDetailResponseSchema = z.object({
  level: TufLevelSchema, rerateHistory: z.array(z.unknown()).optional().default([]),
}).passthrough();
export const TufDifficultyListSchema = z.array(TufDifficultySchema);
export const TufDifficultyHashSchema = z.object({ hash: z.string().min(1) }).passthrough();

export type TufDifficulty = z.infer<typeof TufDifficultySchema>;
export type TufJudgements = z.infer<typeof TufJudgementsSchema>;
export type TufLevel = z.infer<typeof TufLevelSchema>;
export type TufPass = z.infer<typeof TufPassSchema>;
export type TufPlayer = z.infer<typeof TufPlayerSchema>;
export type TufPlayerSearchResponse = z.infer<typeof TufPlayerSearchResponseSchema>;
export type TufPassPage = z.infer<typeof TufPassPageSchema>;
export type TufLevelPage = z.infer<typeof TufLevelPageSchema>;
export type TufLevelDetailResponse = z.infer<typeof TufLevelDetailResponseSchema>;
export type TufPassSort = 'score' | 'speed' | 'date' | 'xacc' | 'difficulty' | 'impact';
export type TufSortOrder = 'ASC' | 'DESC';
export type TufPassQuery = { offset: number; limit: number; sortBy: TufPassSort; order: TufSortOrder; bestPerLevel: boolean };
export type TufLevelQuery = { query?: string; offset: number; limit: number };
export const TUF_PAGE_SIZE = 30;

export type TufSongExtension = { level: TufLevel; upstreamSongId: number | null };
export type TufChartExtension = { level: TufLevel; upstreamSongId: number | null };
export type TufScoreExtension = {
  pass: TufPass; scoreV2: number; accuracy: number; speed: number;
  judgements: TufJudgements | null; isWorldsFirst: boolean | null;
  isWorldsFirstPP: boolean | null; isDuplicate: boolean; impact: number | null;
};
