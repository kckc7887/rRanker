import { z } from 'zod';

export const SCORE_HUB_ALL_DIFFICULTIES = [0, 1, 2, 3, 4, 10] as const;

export const QR_LOGIN_STATUS_LABEL: Record<string, string> = {
  pending: '正在准备读取…',
  adding_rival: '正在确认玩家信息…',
  waiting_snapshot: '正在确认玩家账号…',
};

export type QrLoginCredential =
  | { kind: 'text'; qrCode: string }
  | { kind: 'image'; imageUri: string; mimeType?: string; fileName?: string };

export type QrLoginTokenResult = {
  token: string;
  friendCode: string | null;
};

export type ScoreHubSyncScore = {
  musicId: string;
  cid?: string;
  chartIndex: number;
  type: string;
  dxScore?: string | number | null;
  score?: string | number | null;
  fs?: string | null;
  fc?: string | null;
  rating?: number;
  isNew?: boolean;
};

export type ScoreHubLatestSync = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  scores?: ScoreHubSyncScore[];
  autoExportResult?: unknown;
} | null;

export const ScoreHubLatestSyncSchema: z.ZodType<ScoreHubLatestSync> = z.object({
  id: z.string().min(1), createdAt: z.string().optional(), updatedAt: z.string().optional(),
  scores: z.array(z.object({
    musicId: z.string().min(1), cid: z.string().optional(), chartIndex: z.number().int().nonnegative(), type: z.string(),
    dxScore: z.union([z.string(), z.number()]).nullable().optional(),
    score: z.union([z.string(), z.number()]).nullable().optional(),
    fc: z.string().nullable().optional(), fs: z.string().nullable().optional(),
    rating: z.number().optional(), isNew: z.boolean().optional(),
  })).optional(),
  autoExportResult: z.unknown().optional(),
}).nullable();

export type ScoreHubScoreProgress = {
  completedDiffs: number[];
  totalDiffs: number;
};

export type ScoreHubDxnetJobStats = {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  successRate: number;
  avgDuration: number | null;
};

export type ScoreHubStatistics = {
  dxnetJobs: ScoreHubDxnetJobStats;
};

export const ScoreHubDxnetJobStatsSchema = z.object({
  totalCount: z.number().int().nonnegative(), completedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(), successRate: z.number().nonnegative(),
  avgDuration: z.number().nonnegative().nullish().transform(value => value ?? null),
});

export const ScoreHubMeProfileSchema = z.object({
  friendCode: z.string().nullable().optional(), hasCabinetUserId: z.boolean().optional(),
}).refine(value => value.friendCode !== undefined || value.hasCabinetUserId !== undefined)
  .transform(value => ({ friendCode: value.friendCode ?? null, hasCabinetUserId: value.hasCabinetUserId ?? false }));

export type ScoreHubCabinetScoreJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ScoreHubCabinetScoreJobCleanupStatus =
  | 'not_required'
  | 'pending'
  | 'succeeded'
  | 'unconfirmed';
export type ScoreHubCabinetScoreJobStage =
  | 'queued'
  | 'qr_auth'
  | 'preview'
  | 'login'
  | 'get_music'
  | 'logout'
  | 'cleanup'
  | 'persist';
export type ScoreHubCabinetScoreJobError = {
  code: string;
  retryAfter: string | null;
};
export type ScoreHubCabinetScoreJob = {
  id: string;
  status: ScoreHubCabinetScoreJobStatus;
  stage: ScoreHubCabinetScoreJobStage;
  cleanupStatus: ScoreHubCabinetScoreJobCleanupStatus;
  progress: { detailsFetched: number } | null;
  syncId: string | null;
  scoreCount: number | null;
  error: ScoreHubCabinetScoreJobError | null;
  createdAt: string;
  updatedAt: string;
};

export const ScoreHubCabinetScoreJobFieldsSchema = z.object({
  id: z.string().min(1), status: z.enum(['queued', 'processing', 'completed', 'failed']),
  stage: z.enum(['queued', 'qr_auth', 'preview', 'login', 'get_music', 'logout', 'cleanup', 'persist']),
  cleanupStatus: z.enum(['not_required', 'pending', 'succeeded', 'unconfirmed']),
  progress: z.object({ detailsFetched: z.number().int().nonnegative() }).nullish().transform(value => value ?? null),
  syncId: z.string().nullish().transform(value => value ?? null),
  scoreCount: z.number().int().nonnegative().nullish().transform(value => value ?? null),
  createdAt: z.string().min(1), updatedAt: z.string().min(1),
});

export function friendCodeFromUser(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null;
  const friendCode = (user as { friendCode?: unknown }).friendCode;
  return typeof friendCode === 'string' && friendCode.trim() ? friendCode.trim() : null;
}
