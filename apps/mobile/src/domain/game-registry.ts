import {
  GAME_IDS,
  GAME_OPTIONS,
  INTERNAL_PROVIDER_IDS,
  PROVIDER_IDS,
  RESERVED_GAME_IDS,
  type GameId,
  type ProviderBindingKind,
  type ProviderId,
} from './game-bind-options';
import { GAME_PROFILES } from './game-profile';
import { GAME_TOOLBOXES } from './game-toolbox';
import { GAME_MODE_FAMILIES } from './game-mode-family';

/** 一次登记校验使用的注册表快照；缺省取当前真实注册表，测试可注入缺失项。 */
export type GameRegistrationSnapshot = {
  /** 游戏 id 全集（`GAME_IDS`）。 */
  gameIds: readonly GameId[];
  /** 添加入口登记的游戏（`GAME_OPTIONS`）。 */
  pickerGameIds: readonly GameId[];
  /** 游戏展示资料登记（`GAME_PROFILES` 的键）。 */
  profileGameIds: readonly string[];
  /** 工具箱登记（`GAME_TOOLBOXES` 的键）。 */
  toolboxGameIds: readonly string[];
  /** 查分器 id 全集（`PROVIDER_IDS`）。 */
  providerIds: readonly ProviderId[];
  /** 添加入口引用的查分器及绑定方式。 */
  referencedProviders: readonly {
    gameId: GameId;
    providerId: ProviderId;
    bindingKind: ProviderBindingKind;
  }[];
  /** 多模式家族登记的模式游戏 id。 */
  familyModeIds: readonly GameId[];
};

export function gameRegistrationSnapshot(): GameRegistrationSnapshot {
  return {
    gameIds: GAME_IDS,
    pickerGameIds: GAME_OPTIONS.map((game) => game.id),
    profileGameIds: Object.keys(GAME_PROFILES),
    toolboxGameIds: Object.keys(GAME_TOOLBOXES),
    providerIds: PROVIDER_IDS,
    referencedProviders: GAME_OPTIONS.flatMap((game) => game.providers.map((provider) => ({
      gameId: game.id,
      providerId: provider.id,
      bindingKind: provider.bindingKind,
    }))),
    familyModeIds: GAME_MODE_FAMILIES.flatMap((family) => family.modeGameIds),
  };
}

function bindingIssues(
  referencedProviders: GameRegistrationSnapshot['referencedProviders'],
): string[] {
  const bindingsByProvider = new Map<ProviderId, Map<ProviderBindingKind, GameId[]>>();
  for (const entry of referencedProviders) {
    const bindings = bindingsByProvider.get(entry.providerId) ?? new Map<ProviderBindingKind, GameId[]>();
    bindings.set(entry.bindingKind, [...(bindings.get(entry.bindingKind) ?? []), entry.gameId]);
    bindingsByProvider.set(entry.providerId, bindings);
  }
  return [...bindingsByProvider]
    .filter(([, bindings]) => bindings.size > 1)
    .map(([providerId, bindings]) => (
      `查分器 ${providerId} 在不同游戏登记了不同绑定方式（${[...bindings.keys()].join(' / ')}）`
    ));
}

/**
 * 游戏登记校验：正式支持的每个游戏都必须有添加入口、展示资料与工具箱登记，
 * 保留测试 id 不得进入添加入口，添加入口也不得引用未登记的查分器或未定义的游戏 id。
 *
 * 数据加载器的穷尽性由 `hooks/game-data-loaders.ts` 的 `Record<GameId, GameDataLoader>` 在编译期保证。
 */
export function gameRegistrationIssues(
  overrides: Partial<GameRegistrationSnapshot> = {},
): string[] {
  const snapshot = { ...gameRegistrationSnapshot(), ...overrides };
  const reserved = new Set<GameId>(RESERVED_GAME_IDS);
  const internalProviders = new Set<ProviderId>(INTERNAL_PROVIDER_IDS);
  const gameIds = new Set<GameId>(snapshot.gameIds);
  const pickerGameIds = new Set<GameId>(snapshot.pickerGameIds);
  const registeredProviders = new Set(snapshot.providerIds);
  const usedProviders = new Set(snapshot.referencedProviders.map((entry) => entry.providerId));
  const issues: string[] = [];

  for (const gameId of snapshot.gameIds) {
    if (reserved.has(gameId)) continue;
    if (!pickerGameIds.has(gameId)) issues.push(`${gameId}: 缺少添加游戏入口登记`);
  }
  for (const gameId of snapshot.pickerGameIds) {
    if (!gameIds.has(gameId)) issues.push(`${gameId}: 添加入口登记了未定义的游戏 id`);
    else if (reserved.has(gameId)) issues.push(`${gameId}: 保留测试 id 不得进入添加游戏入口`);
  }
  for (const gameId of snapshot.gameIds) {
    if (!snapshot.profileGameIds.includes(gameId)) issues.push(`${gameId}: 缺少游戏展示资料登记`);
    if (!snapshot.toolboxGameIds.includes(gameId)) issues.push(`${gameId}: 缺少工具箱登记`);
  }
  for (const entry of snapshot.referencedProviders) {
    if (!gameIds.has(entry.gameId)) issues.push(`${entry.providerId}: 添加入口引用了未定义的游戏 id ${entry.gameId}`);
    if (!registeredProviders.has(entry.providerId)) issues.push(`${entry.providerId}: 添加入口引用了未登记的查分器 id`);
  }
  for (const providerId of snapshot.providerIds) {
    if (!usedProviders.has(providerId) && !internalProviders.has(providerId)) {
      issues.push(`${providerId}: 查分器 id 既未登记在任何游戏，也未声明为内部查分器`);
    }
  }
  for (const gameId of snapshot.familyModeIds) {
    if (!gameIds.has(gameId)) issues.push(`${gameId}: 家族模式 id 未登记为游戏`);
    else if (!pickerGameIds.has(gameId)) issues.push(`${gameId}: 家族模式缺少添加入口登记`);
  }
  return [...issues, ...bindingIssues(snapshot.referencedProviders)];
}

export function assertGameRegistryComplete(
  overrides: Partial<GameRegistrationSnapshot> = {},
): void {
  const issues = gameRegistrationIssues(overrides);
  if (issues.length > 0) throw new Error(`游戏登记不完整：${issues.join('；')}`);
}
