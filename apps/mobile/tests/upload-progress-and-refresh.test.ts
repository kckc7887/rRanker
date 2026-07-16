import { fixtureRecords } from '@/fixtures/sanitized';
import { uploadedRecordsAreVisible } from '@/services/upload-refresh-visibility';
import {
  compactUploadPhaseLabel,
  scoreProgressMessage,
  type UploadPhase,
} from '@/services/upload-maimai-from-friend-code';

describe('好友码上传进度', () => {
  it('把 score-hub 的已完成难度转换成详细进度', () => {
    expect(scoreProgressMessage({ completedDiffs: [], totalDiffs: 6 }))
      .toBe('获取各难度成绩中…（0/6）');
    expect(scoreProgressMessage({ completedDiffs: [3, 0, 3], totalDiffs: 6 }))
      .toBe('获取成绩中：已完成 BASIC、MASTER（2/6）');
    expect(scoreProgressMessage({ completedDiffs: [0, 1, 2, 3, 4, 10], totalDiffs: 6 }))
      .toBe('各难度成绩已获取，正在整理…（6/6）');
  });

  it.each<[UploadPhase, string]>([
    [{ kind: 'logging_in', message: '' }, '好友申请中'],
    [{ kind: 'awaiting_friend', message: '', botFriendCode: null }, '好友申请中'],
    [{ kind: 'fetching_scores', message: '' }, '获取成绩中'],
    [{ kind: 'uploading', message: '', providerTitle: '水鱼' }, '上传成绩中'],
    [{ kind: 'syncing', message: '', providerTitle: '水鱼' }, '上传成绩中'],
    [{ kind: 'canceling', message: '' }, '取消中'],
  ])('为总览上传按钮生成紧凑状态 %#', (phase, expected) => {
    expect(compactUploadPhaseLabel(phase)).toBe(expected);
  });
});

describe('上传后水鱼可见性验证', () => {
  const actual = fixtureRecords[0]!;
  const upload = {
    title: actual.title,
    type: actual.type,
    level_index: actual.levelIndex,
    achievements: actual.achievements,
    dxScore: actual.dxScore,
    fc: actual.fc,
    fs: actual.fs,
  };

  it('接受相同或更高的水鱼历史最佳成绩', () => {
    expect(uploadedRecordsAreVisible([actual], [upload])).toBe(true);
    expect(uploadedRecordsAreVisible(
      [{ ...actual, achievements: actual.achievements + 0.1 }],
      [upload],
    )).toBe(true);
  });

  it('在刚上传成绩尚不可见时要求继续重试', () => {
    expect(uploadedRecordsAreVisible([], [upload])).toBe(false);
    expect(uploadedRecordsAreVisible(
      [{ ...actual, achievements: actual.achievements - 0.1 }],
      [upload],
    )).toBe(false);
  });
});
