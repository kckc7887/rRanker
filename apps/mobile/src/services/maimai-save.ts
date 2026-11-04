import { z } from 'zod';
import { ScoreHubError, type ScoreHubSyncScore } from '@/services/score-hub-client';

const errorSchema = z.object({
  code: z.enum(['INVALID_INPUT', 'INVALID_QR', 'BUSY', 'QR_FAILED', 'READ_FAILED', 'CLEANUP_FAILED', 'INTERNAL']),
  status: z.number().int().optional(),
  nativeCode: z.number().int().optional(),
});
const saveSchema = z.object({
  error: errorSchema.optional(),
  logout_error: errorSchema.optional(),
  logout_confirmed: z.boolean().optional(),
  scores: z.array(z.object({
    id: z.number().int().safe(),
    type: z.enum(['standard', 'dx', 'utage']).nullable(),
    level_index: z.number().int().nullable(),
    achievements: z.number().nullable(),
    dx_score: z.number().int().nullable(),
    fc: z.string().nullable(),
    fs: z.string().nullable(),
  })).optional(),
});

export async function readMaimaiSave(qrCode: string): Promise<ScoreHubSyncScore[]> {
  const { requireOptionalNativeModule } = await import('expo-modules-core');
  const native = requireOptionalNativeModule<{ readSaveAsync(code: string): Promise<string> }>('MaimaiSave');
  if (!native) throw new ScoreHubError('二维码同步暂不可用', undefined, false, { code: 'NATIVE_UNAVAILABLE' });
  let raw: unknown;
  try { raw = JSON.parse(await native.readSaveAsync(qrCode)); }
  catch { throw new ScoreHubError('读取失败', undefined, false, { code: 'READ_FAILED' }); }
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) throw new ScoreHubError('读取失败', undefined, false, { code: 'INVALID_RESPONSE' });
  const save = parsed.data;
  const failure = save.error ?? save.logout_error;
  if (failure) {
    const error = new ScoreHubError('读取失败', failure.status, false, { code: failure.code });
    throw Object.assign(error, { nativeCode: failure.nativeCode });
  }
  if (save.logout_confirmed !== true || !save.scores) {
    throw new ScoreHubError('读取失败', undefined, false, { code: 'CLEANUP_FAILED' });
  }
  return save.scores.map(score => ({
    musicId: String(score.id), type: score.type ?? '', chartIndex: score.level_index ?? -1,
    score: score.achievements, dxScore: score.dx_score, fc: score.fc, fs: score.fs,
  }));
}
