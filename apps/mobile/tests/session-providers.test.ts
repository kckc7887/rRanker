import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLocalMaimaiAccount, createMaxedPhigrosTestAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { EmptyCatalogProvider, EmptyScoreProvider } from '@/providers/empty-provider';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';
import { LocalMaimaiScoreProvider } from '@/providers/local-score-provider';
import { MaxedPhigrosTestProvider } from '@/providers/maxed-phigros-test-provider';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { createSessionProviders } from '@/services/session-providers';

// 会话装配不依赖具体存储实现；舞萌本地查分器只在类型与实例上断言。
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {} }));

const phiSession: ProviderSession = {
  mode: 'phi-session',
  sessionToken: 'session-token',
  playerId: 'player-id',
  persistable: true,
};

const noRotation = () => undefined;

describe('会话 Provider 装配的曲库能力', () => {
  it('Phigros 示例账号不把普通曲库伪造成舞萌详细曲库', () => {
    const providers = createSessionProviders(createMaxedPhigrosTestAccount(), null, noRotation);

    expect(providers.scoreProvider).toBeInstanceOf(MaxedPhigrosTestProvider);
    expect(providers.catalogProvider).not.toBeInstanceOf(PhigrosCatalogProvider);
    expect(providers.catalogProvider).toBeInstanceOf(EmptyCatalogProvider);
  });

  it('Phigros 云存档会话同样只登记普通曲库能力', () => {
    const providers = createSessionProviders(
      { ...createMaxedPhigrosTestAccount(), id: 'phigros:phi-taptap:player', providerId: 'phi-taptap' },
      phiSession,
      noRotation,
    );

    expect(providers.scoreProvider).toBeInstanceOf(PhigrosScoreProvider);
    expect(providers.catalogProvider).not.toBeInstanceOf(PhigrosCatalogProvider);
    expect(providers.catalogProvider).toBeInstanceOf(EmptyCatalogProvider);
  });

  it('舞萌与未绑定账号的装配保持不变', () => {
    const maimai = createSessionProviders(createLocalMaimaiAccount('本地玩家', 0), null, noRotation);
    expect(maimai.scoreProvider).toBeInstanceOf(LocalMaimaiScoreProvider);
    expect(maimai.catalogProvider).toBeInstanceOf(LxnsCatalogProvider);

    const unbound = createSessionProviders(null, null, noRotation);
    expect(unbound.scoreProvider).toBeInstanceOf(EmptyScoreProvider);
    expect(unbound.catalogProvider).toBeInstanceOf(EmptyCatalogProvider);
  });

  it('装配源码不再用双重断言把曲库换成详细曲库', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/services/session-providers.ts'), 'utf8');
    expect(source).not.toMatch(/as\s+unknown\s+as/);
  });
});
