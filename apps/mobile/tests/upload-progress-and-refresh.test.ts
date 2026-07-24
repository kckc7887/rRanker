import { fixtureRecords } from '@/fixtures/sanitized';
import { uploadedRecordsAreVisible } from '@/services/upload-refresh-visibility';
import {
  compactUploadPhaseLabel,
  formatScoreHubStatsSummary,
  scoreHubSuccessHint,
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
    [{ kind: 'logging_in', message: '', authMode: 'qr' }, '二维码登录中'],
    [{ kind: 'awaiting_friend', message: '', botFriendCode: null }, '好友申请中'],
    [{ kind: 'fetching_scores', message: '' }, '获取成绩中'],
    [{ kind: 'uploading', message: '', providerTitle: '水鱼' }, '上传成绩中'],
    [{ kind: 'syncing', message: '', providerTitle: '水鱼' }, '上传成绩中'],
    [{ kind: 'canceling', message: '' }, '取消中'],
    [{ kind: 'idle' }, '好友码'],
  ])('为总览上传按钮生成紧凑状态 %#', (phase, expected) => {
    expect(compactUploadPhaseLabel(phase)).toBe(expected);
  });
});

describe('score-hub 成功率分档提示', () => {
  it.each<[number | null, number, string]>([
    [null, 0, '近一小时暂无公开任务统计，服务状态不明，可稍后再试。'],
    [88, 0, '近一小时暂无公开任务统计，服务状态不明，可稍后再试。'],
    [100, 10, '近一小时同步非常畅通，可以放心上传。'],
    [85, 10, '近一小时成功率良好，通常可顺利完成。'],
    [70, 10, '近一小时成功率一般，可能稍慢，请耐心等待。'],
    [50, 10, '近一小时成功率偏低，建议错峰或多试一次。'],
    [30, 10, '近一小时成功率较差，失败概率较高，建议稍后再试。'],
    [29.9, 10, '近一小时服务很不稳定，不建议现在上传。'],
  ])('rate=%s total=%s', (rate, total, expected) => {
    expect(scoreHubSuccessHint(rate, total)).toBe(expected);
  });

  it('格式化近一小时统计摘要', () => {
    expect(formatScoreHubStatsSummary(null)).toBe('近 1 小时：暂无公开任务样本');
    expect(formatScoreHubStatsSummary({
      totalCount: 12,
      completedCount: 10,
      failedCount: 2,
      successRate: 83.33,
      avgDuration: 95_000,
    })).toBe('近 1 小时成功率 83.3%（成功 10 / 失败 2 / 共 12），平均约 95 秒');
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
