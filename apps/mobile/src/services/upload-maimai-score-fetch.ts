import {
  createUpdateScoreJob,
  pollUpdateScoreUntilDone,
  type ScoreHubScoreProgress,
} from '@/services/score-hub-client';
import { uploadLatestScoreHubSyncToTargets } from '@/services/upload-maimai-target-write';
import type { UploadCommonInput, UploadResult, UploadTarget } from '@/services/upload-maimai-from-friend-code';

const DIFFICULTY_LABELS: Record<number, string> = {
  0: 'BASIC',
  1: 'ADVANCED',
  2: 'EXPERT',
  3: 'MASTER',
  4: 'Re:MASTER',
  10: '宴会场',
};

export function scoreProgressMessage(progress: ScoreHubScoreProgress | null): string {
  if (!progress || progress.totalDiffs <= 0) return '获取成绩中…';
  const completed = [...new Set(progress.completedDiffs)].sort((left, right) => left - right);
  if (completed.length === 0) {
    return `获取各难度成绩中…（0/${progress.totalDiffs}）`;
  }
  const completedLabels = completed
    .map((difficulty) => DIFFICULTY_LABELS[difficulty] ?? `难度 ${difficulty}`)
    .join('、');
  const count = Math.min(completed.length, progress.totalDiffs);
  if (count >= progress.totalDiffs) {
    return `各难度成绩已获取，正在整理…（${count}/${progress.totalDiffs}）`;
  }
  return `获取成绩中：已完成 ${completedLabels}（${count}/${progress.totalDiffs}）`;
}

export async function uploadMaimaiAfterScoreHubToken(input: UploadCommonInput & {
  token: string;
  friendshipJobId: string | null;
  playerIdForLocal: string;
  selected: UploadTarget[];
  persistFriendCode?: string | null;
  assertAccount: (accountId: string) => void;
}): Promise<UploadResult> {
  input.onPhase({ kind: 'fetching_scores', message: '获取各难度成绩中…' });
  const scoreJobId = await createUpdateScoreJob(input.token, input.friendshipJobId, input.signal);
  await pollUpdateScoreUntilDone({
    token: input.token,
    jobId: scoreJobId,
    signal: input.signal,
    onProgress: ({ progress, stage }) => {
      if (typeof stage === 'string' && stage.includes('重试')) {
        input.onPhase({ kind: 'fetching_scores', message: stage });
        return;
      }
      input.onPhase({ kind: 'fetching_scores', message: scoreProgressMessage(progress) });
    },
  });
  return uploadLatestScoreHubSyncToTargets(input);
}
