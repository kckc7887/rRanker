import { describe, expect, it } from 'vitest';
import albums from './fixtures/musedash/albums.sanitized.json';
import diffdiff from './fixtures/musedash/diffdiff.sanitized.json';
import { MUSEDASH_TEST_USER_ID } from '@/domain/bound-account';
import {
  museDashDiffdiffMap,
  museDashSongsFromAlbums,
  MuseDashAlbumsResponseSchema,
  MuseDashDiffdiffResponseSchema,
  MuseDashPlayerSchema,
} from '@/domain/muse-dash';
import { isCatalogDrivenScoreProvider } from '@/providers/contracts';
import {
  buildMaxedMuseDashPlayDetail,
  buildMaxedMuseDashPlays,
  buildMaxedMuseDashPlayer,
  buildMaxedMuseDashRl,
  MaxedMuseDashTestProvider,
  maxedMuseDashPlayDetailSnapshot,
  maxedMuseDashPlayerSnapshot,
  MUSE_DASH_MAX_SCORE,
} from '@/providers/maxed-musedash-test-provider';

const parsedAlbums = MuseDashAlbumsResponseSchema.parse(albums);
const parsedDiffdiff = MuseDashDiffdiffResponseSchema.parse(diffdiff);

describe('喵斯快跑全满示例账号', () => {
  it('按曲库生成全部非空难度档全满成绩，未上榜谱面无定数', () => {
    const plays = buildMaxedMuseDashPlays(parsedAlbums, null);
    expect(plays).toHaveLength(8);
    expect(plays.every((play) => play.score === MUSE_DASH_MAX_SCORE)).toBe(true);
    expect(plays.every((play) => play.acc === 100)).toBe(true);
    expect(plays.every((play) => play.i === 1)).toBe(true);
    expect(plays.every((play) => play.history?.lastRank === 1)).toBe(true);
    expect(plays.every((play) => play.platform === 'mobile')).toBe(true);
    expect(plays.every((play) => play.character_uid === '1')).toBe(true);
    expect(plays.every((play) => play.elfin_uid === '1')).toBe(true);
    expect(plays.some((play) => play.uid === '0-47' && play.difficulty === 4)).toBe(true);
    expect(plays.some((play) => play.uid === '1-1' && play.difficulty === 0)).toBe(true);
    expect(plays.some((play) => play.uid === '1-1' && play.difficulty === 2)).toBe(false);
    expect(plays.every((play) => play.sum === undefined)).toBe(true);
  });

  it('有社区定数的谱面 sum 为定数 × 1000（全 AP 时 P = D）', () => {
    const entries: [string, number, string, number, number][] = [
      ...parsedDiffdiff,
      ['0-48', 0, '1', 0, 1.3],
    ];
    const constants = new Map(entries.map((entry) => [`${entry[0]}:${entry[1]}`, entry] as const));
    const plays = buildMaxedMuseDashPlays(parsedAlbums, constants);
    const sumBySlot = new Map(plays.map((play) => [`${play.uid}:${play.difficulty}`, play.sum]));
    expect(sumBySlot.get('0-48:0')).toBe(1300);
    expect(sumBySlot.get('0-47:3')).toBe(11500);
    expect(sumBySlot.get('0-47:4')).toBe(12500);
    expect(sumBySlot.get('0-47:0')).toBeUndefined();
  });

  it('RL 按 P 降序计算 (1/5)Σ0.8^(i-1)P_i', () => {
    const entries: [string, number, string, number, number][] = [
      ['0-48', 0, '1', 0, 1.3],
      ['0-48', 1, '3', 0, 3.5],
      ...parsedDiffdiff,
    ];
    const constants = new Map(entries.map((entry) => [`${entry[0]}:${entry[1]}`, entry] as const));
    const plays = buildMaxedMuseDashPlays(parsedAlbums, constants);
    const rl = buildMaxedMuseDashRl(plays);
    const expected = (12500 + 0.8 * 11500 + 0.64 * 3500 + 0.512 * 1300) / 1000 / 5;
    expect(rl).toBeCloseTo(expected, 12);
  });

  it('生成玩家资料：哨兵 user_id、昵称与公式 RL', () => {
    const player = buildMaxedMuseDashPlayer(parsedAlbums, parsedDiffdiff, '喵斯全满');
    expect(player.user.user_id).toBe(MUSEDASH_TEST_USER_ID);
    expect(player.user.nickname).toBe('喵斯全满');
    expect(player.plays).toHaveLength(8);
    expect(player.rl).toBeCloseTo(
      buildMaxedMuseDashRl(player.plays),
      12,
    );
    expect(MuseDashPlayerSchema.parse(player).user.user_id).toBe(MUSEDASH_TEST_USER_ID);
  });

  it('成绩明细全 AP：miss 0 且 ACC 100', () => {
    const detail = buildMaxedMuseDashPlayDetail();
    expect(detail.play).toMatchObject({
      acc: 100,
      miss: 0,
      judge: 'AP',
      score: MUSE_DASH_MAX_SCORE,
    });
    const snapshot = maxedMuseDashPlayDetailSnapshot();
    expect(snapshot.source).toMatchObject({ kind: 'generated', isStale: false });
  });

  it('示例来源文案与其它游戏一致', () => {
    const snapshot = maxedMuseDashPlayerSnapshot(parsedAlbums, parsedDiffdiff);
    expect(snapshot.source).toMatchObject({
      kind: 'generated',
      label: '示例查分器（全曲全谱面满成绩）',
      isStale: false,
    });
  });

  it('实现 CatalogDrivenScoreProvider，统一成绩覆盖全部启用难度档', async () => {
    const provider = new MaxedMuseDashTestProvider();
    expect(isCatalogDrivenScoreProvider(provider)).toBe(true);
    const records = await provider.getRecordsFromCatalog({
      albums: parsedAlbums,
      constants: museDashDiffdiffMap(parsedDiffdiff),
    });
    const enabledSlots = museDashSongsFromAlbums(parsedAlbums)
      .flatMap(({ song }) => song.difficulty)
      .filter((level) => level !== '0');
    expect(records).toHaveLength(enabledSlots.length);
    expect(records.every((record) => record.achievements === 100)).toBe(true);
  });
});
