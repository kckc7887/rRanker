/**
 * 类型层合同（只由 `npx tsc --noEmit` 校验，不被 vitest / jest 运行）。
 *
 * 每个负例都表达一条必须被类型系统拒绝的写法：`@ts-expect-error` 未命中时报「未使用」，
 * 说明这条错配被类型放过了。
 */
import {
  GAME_PAYLOAD_KIND_BY_GAME_ID,
  gameAccountMetadata,
  gameDataBundle,
  maimaiPayloadFromSnapshot,
  type GamePayloadKind,
} from '@/domain/game-data';
import type { GameId } from '@/domain/game-bind-options';
import { getGameProfile } from '@/domain/game-profile';
import type { CatalogProvider, DetailedCatalogProvider } from '@/providers/contracts';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { GAME_DATA_LOADERS } from '@/hooks/game-data-loaders';
import type { GameDataLoader } from '@/hooks/game-data-loaders';
import { fixtureCatalog, fixturePlayer, fixtureRecords, fixtureSource } from '@/fixtures/sanitized';

const maimaiPayload = maimaiPayloadFromSnapshot({
  player: fixturePlayer,
  records: fixtureRecords,
  source: fixtureSource,
  catalogSource: fixtureSource,
  best50: {
    player: fixturePlayer,
    currentVersion: fixtureCatalog.currentVersion,
    b35: [],
    b15: [],
    unmatchedRecordCount: 0,
    rating: 0,
    generatedAt: fixtureSource.updatedAt,
    source: fixtureSource,
  },
}, getGameProfile('maimai'));

const phigrosProfile = getGameProfile('phigros');

/** 每个游戏 id 都必须登记载荷 kind；新增游戏漏登记时 `satisfies` 与本行同时编译失败。 */
export const payloadKindsCoverEveryGame: Record<GameId, GamePayloadKind | null> = GAME_PAYLOAD_KIND_BY_GAME_ID;

/** 正例：身份与载荷对应时按游戏构造通过。 */
export const matchingBundle = gameDataBundle({
  gameId: 'phigros',
  providerId: null,
  profile: phigrosProfile,
  payload: { kind: 'empty', gameId: 'phigros', displayName: 'Phigros', source: fixtureSource },
});

const phigrosIdentityWithMaimaiPayload = {
  gameId: 'phigros' as const,
  providerId: null,
  profile: phigrosProfile,
  payload: maimaiPayload,
};

/**
 * 负例 1：身份与载荷必须对应。
 * `GameDataBundle.payload` 只按 `kind` 收窄时下面的错配会被放过，因此这里用按游戏校验的入口。
 */
// @ts-expect-error Phigros 身份不能配舞萌载荷
export const mismatchedMetadata = gameAccountMetadata(phigrosIdentityWithMaimaiPayload);

/** 负例 2：按游戏构造数据包时同样拒绝错配身份。 */
// @ts-expect-error Phigros 身份不能配舞萌载荷
export const mismatchedBundle = gameDataBundle(phigrosIdentityWithMaimaiPayload);

const maimaiEmptyPayload = { kind: 'empty' as const, gameId: 'maimai' as const, displayName: '未绑定账号', source: fixtureSource };
const phigrosIdentityWithMaimaiEmpty = {
  gameId: 'phigros' as const,
  providerId: null,
  profile: phigrosProfile,
  payload: maimaiEmptyPayload,
};

/** 负例 3：空载荷的身份必须与数据包身份一致。 */
// @ts-expect-error Phigros 数据包不能携带舞萌身份的空载荷
export const mismatchedEmptyBundle = gameDataBundle(phigrosIdentityWithMaimaiEmpty);

/** 负例 4：Phigros 曲库只实现普通曲库能力，不得当作舞萌详细曲库（旧装配用双重断言绕过这一点）。 */
// @ts-expect-error PhigrosCatalogProvider 没有歌曲详情、别名、姓名框与收藏品能力
export const phigrosAsDetailedCatalog: DetailedCatalogProvider = new PhigrosCatalogProvider();

/** 正例：Phigros 曲库只需实现普通曲库能力。 */
export const phigrosAsCatalog: CatalogProvider = new PhigrosCatalogProvider();

/** 加载器注册表是穷尽映射：任一游戏缺项都会让下面两行编译失败（缺项即静默回退舞萌）。 */
export const loaderRegistryIsExhaustive: Record<GameId, GameDataLoader> = GAME_DATA_LOADERS;

export const phigrosLoader: GameDataLoader = GAME_DATA_LOADERS.phigros;
