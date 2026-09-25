import { describe, expect, it } from 'vitest';
import {
  GAME_IDS,
  OSU_MODE_GAME_IDS,
  PROVIDER_IDS,
  RESERVED_GAME_IDS,
  SUPPORTED_GAME_IDS,
} from '@/domain/game-bind-options';
import {
  assertGameRegistryComplete,
  gameRegistrationIssues,
  gameRegistrationSnapshot,
} from '@/domain/game-registry';
import { GAME_PROFILES } from '@/domain/game-profile';
import { GAME_TOOLBOXES } from '@/domain/game-toolbox';

describe('游戏登记穷尽', () => {
  it('正式游戏、osu 模式与保留 id 合成唯一 id 表，且各自有资料与工具箱登记', () => {
    expect(GAME_IDS).toEqual([...SUPPORTED_GAME_IDS, ...OSU_MODE_GAME_IDS, ...RESERVED_GAME_IDS]);
    expect(new Set(GAME_IDS).size).toBe(GAME_IDS.length);
    expect(SUPPORTED_GAME_IDS).not.toContain('test');
    expect(OSU_MODE_GAME_IDS).toHaveLength(4);

    expect(Object.keys(GAME_PROFILES).sort()).toEqual([...GAME_IDS].sort());
    expect(Object.keys(GAME_TOOLBOXES).sort()).toEqual([...GAME_IDS].sort());
  });

  it('真实注册表不存在任何登记缺口', () => {
    expect(gameRegistrationIssues()).toEqual([]);
    expect(() => assertGameRegistryComplete()).not.toThrow();
  });

  it('遗漏正式游戏的添加入口时登记校验失败', () => {
    const issues = gameRegistrationIssues({
      pickerGameIds: GAME_IDS.filter((gameId) => gameId !== 'phigros'),
    });

    expect(issues).toContainEqual(expect.stringContaining('phigros'));
    expect(() => assertGameRegistryComplete({
      pickerGameIds: GAME_IDS.filter((gameId) => gameId !== 'phigros'),
    })).toThrow(/phigros/);
  });

  it('保留测试 id 进入添加入口时登记校验失败', () => {
    const issues = gameRegistrationIssues({ pickerGameIds: [...GAME_IDS] });

    expect(issues).toContainEqual(expect.stringContaining('test'));
  });

  it('未定义的游戏 id 出现在添加入口时登记校验失败', () => {
    const issues = gameRegistrationIssues({
      pickerGameIds: [...GAME_IDS, 'future-live' as (typeof GAME_IDS)[number]],
    });

    expect(issues).toContainEqual(expect.stringContaining('future-live'));
  });

  it('缺少展示资料或工具箱登记时登记校验失败', () => {
    const snapshot = gameRegistrationSnapshot();

    expect(gameRegistrationIssues({
      profileGameIds: snapshot.profileGameIds.filter((gameId) => gameId !== 'musedash'),
    })).toContainEqual(expect.stringContaining('musedash'));
    expect(gameRegistrationIssues({
      toolboxGameIds: snapshot.toolboxGameIds.filter((gameId) => gameId !== 'rizline'),
    })).toContainEqual(expect.stringContaining('rizline'));
  });

  it('引用未登记 Provider 或遗留未使用 Provider 时登记校验失败', () => {
    expect(gameRegistrationIssues({
      providerIds: PROVIDER_IDS.filter((providerId) => providerId !== 'lxns'),
    })).toContainEqual(expect.stringContaining('lxns'));

    expect(gameRegistrationIssues({
      providerIds: [...PROVIDER_IDS, 'future-provider' as (typeof PROVIDER_IDS)[number]],
    })).toContainEqual(expect.stringContaining('future-provider'));
  });

  it('同一 Provider 在不同游戏登记不同绑定方式时登记校验失败', () => {
    const snapshot = gameRegistrationSnapshot();
    const issues = gameRegistrationIssues({
      referencedProviders: [
        ...snapshot.referencedProviders,
        { gameId: 'chunithm', providerId: 'diving-fish', bindingKind: 'fixture' },
      ],
    });

    expect(issues).toContainEqual(expect.stringContaining('diving-fish'));
  });

  it('家族模式未登记为游戏 id 时登记校验失败', () => {
    const issues = gameRegistrationIssues({
      familyModeIds: [...OSU_MODE_GAME_IDS, 'osu-lazer' as (typeof GAME_IDS)[number]],
    });

    expect(issues).toContainEqual(expect.stringContaining('osu-lazer'));
  });
});
