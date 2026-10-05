import { describe, expect, it, vi } from 'vitest';
import { createLocalMaimaiAccount, createMaxedPhigrosTestAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';
import { LocalMaimaiScoreProvider } from '@/providers/local-score-provider';
import { MaxedPhigrosTestProvider } from '@/providers/maxed-phigros-test-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { createSessionProviders } from '@/services/session-providers';

vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {} }));
vi.mock('@/storage/secure-session-store', () => ({ SecureSessionStore: class {} }));

const phiSession: ProviderSession = {
  mode: 'phi-session',
  sessionToken: 'session-token',
  playerId: 'player-id',
  persistable: true,
};

describe('会话 Provider 装配的曲库能力', () => {
  it('Phigros 示例账号不把普通曲库伪造成舞萌详细曲库', () => {
    const providers = createSessionProviders(createMaxedPhigrosTestAccount(), null);

    expect(providers.scoreProvider).toBeInstanceOf(MaxedPhigrosTestProvider);
    expect(providers.catalogProvider).toBeNull();
  });

  it('Phigros 云存档会话同样只登记普通曲库能力', () => {
    const providers = createSessionProviders(
      { ...createMaxedPhigrosTestAccount(), id: 'phigros:phi-taptap:player', providerId: 'phi-taptap' },
      phiSession,
    );

    expect(providers.scoreProvider).toBeInstanceOf(PhigrosScoreProvider);
    expect(providers.catalogProvider).toBeNull();
  });

  it('舞萌本地账号提供查分和曲库', () => {
    const maimai = createSessionProviders(createLocalMaimaiAccount('本地玩家', 0), null);
    expect(maimai.scoreProvider).toBeInstanceOf(LocalMaimaiScoreProvider);
    expect(maimai.catalogProvider).toBeInstanceOf(LxnsCatalogProvider);
  });
});
