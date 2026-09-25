import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCAL_MAIMAI_ACCOUNT_ID,
  MAIMAI_TEST_ACCOUNT_ID,
  createLocalMaimaiAccount,
  createMaxedMaimaiTestAccount,
} from '@/domain/bound-account';
import type { AnyScoreProvider, DetailedCatalogProvider, ProviderSession } from '@/providers/contracts';
import { EmptyCatalogProvider, EmptyScoreProvider } from '@/providers/empty-provider';
import type { CredentialSessionWriteResult } from '@/storage/secure-session-store';
import * as sessionRuntime from '@/state/session-runtime';
import type { SessionRuntime } from '@/state/session-runtime';
import {
  applyLxnsTokenRotation,
  applyRizlineSessionRotation,
  pendingRotationWritesSnapshot,
  resetPendingRotationWritesForTests,
  restoreSession,
  retryPendingRotationWrites,
  UNBOUND_ACCOUNT_ID,
  useSession,
} from '@/state/session-store';

/** 会话 Store 的所有权边界：Provider 实例与安全存储都必须来自注入的端口。 */
const storeSource = () => readFileSync(resolve(process.cwd(), 'src/state/session-store.ts'), 'utf8');

/** 具体 Provider 构造路径：Store 的 import 里一个都不能出现。 */
const CONCRETE_PROVIDER_MODULES = [
  'session-providers',
  'local-score-provider',
  'maxed-maimai-test-provider',
  'maxed-phigros-test-provider',
  'phigros-score-provider',
  'lxns-score-provider',
  'lxns-catalog-provider',
  'diving-fish-provider',
  'empty-provider',
  'sqlite-snapshot-repository',
];

const SECURE_STORE_MODULES = [
  'expo-secure-store',
  'expo-sqlite/kv-store',
  'secure-session-store',
  'large-secure-value-store',
];

const staticImportSpecifiers = (source: string): string[] => {
  const specifiers: string[] = [];
  const pattern = /^\s*(?:import|export)\b[^'"\n]*?from\s*['"]([^'"]+)['"]/gmu;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]!);
  const bare = /^\s*import\s*['"]([^'"]+)['"]/gmu;
  for (const match of source.matchAll(bare)) specifiers.push(match[1]!);
  return specifiers;
};

const dynamicImportSpecifiers = (source: string): string[] => (
  [...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu)].map((match) => match[1]!)
);

describe('会话 Store 的所有权边界', () => {
  it('不静态构造任何具体 Provider，也不引用装配模块', () => {
    const imported = [...staticImportSpecifiers(storeSource()), ...dynamicImportSpecifiers(storeSource())];
    expect(imported.filter((specifier) => CONCRETE_PROVIDER_MODULES.some((name) => specifier.includes(name))))
      .toEqual([]);
  });

  it('不直接访问 SecureStore 或凭据索引存储', () => {
    const touched = [...staticImportSpecifiers(storeSource()), ...dynamicImportSpecifiers(storeSource())];
    expect(touched.filter((specifier) => SECURE_STORE_MODULES.some((name) => specifier.includes(name)))).toEqual([]);
    expect(storeSource()).not.toMatch(/new\s+SecureSessionStore\b/u);
    expect(storeSource()).not.toMatch(/SecureStore\s*\./u);
  });
});

const updateAccountSession = vi.hoisted(() => vi.fn(async () => undefined));
const updateCredentialSession = vi.hoisted(() => (
  vi.fn(async (): Promise<CredentialSessionWriteResult> => 'applied')
));

vi.mock('@/storage/secure-session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/storage/secure-session-store')>();
  return {
    ...actual,
    SecureSessionStore: class {
      updateAccountSession = updateAccountSession;
      updateCredentialSession = updateCredentialSession;
    },
  };
});

const scoreProvider: AnyScoreProvider = {
  getPlayer: vi.fn(async () => ({
    id: 'probe',
    displayName: '探针',
    rating: 0,
    source: { kind: 'fixture' as const, label: '探针', updatedAt: '', isStale: false },
  })),
  getRecords: vi.fn(async () => []),
};
const catalogProvider: DetailedCatalogProvider = new EmptyCatalogProvider();

type RuntimeProbe = { resolve: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

let runtimeProbe: RuntimeProbe;

beforeEach(() => {
  resetPendingRotationWritesForTests();
  updateAccountSession.mockClear();
  updateAccountSession.mockResolvedValue(undefined);
  updateCredentialSession.mockClear();
  updateCredentialSession.mockResolvedValue('applied');
  runtimeProbe = {
    resolve: vi.fn(() => ({ providers: { scoreProvider, catalogProvider }, cacheKey: 'probe' })),
    release: vi.fn(),
  };
  sessionRuntime.setSessionRuntime(runtimeProbe as unknown as SessionRuntime);
  seedStore();
});

afterEach(() => {
  sessionRuntime.resetSessionRuntimeForTests();
  resetPendingRotationWritesForTests();
});

const baseAccounts = () => [createLocalMaimaiAccount('本地玩家', 0), createMaxedMaimaiTestAccount()];

function seedStore(): void {
  useSession.setState({
    sessionsByAccountId: {},
    credentialIdsByAccountId: {},
    boundAccounts: baseAccounts(),
    activeAccountId: LOCAL_MAIMAI_ACCOUNT_ID,
    activeGameId: 'maimai',
    activeProviderId: 'local',
    scoreProvider: new EmptyScoreProvider(),
    catalogProvider: new EmptyCatalogProvider(),
    restoreStatus: 'ready',
    restoreError: null,
    session: null,
  });
}

describe('账号激活与派生视图的一次提交', () => {
  it('切换账号时用同一份状态解析 Provider，并只提交一次', () => {
    runtimeProbe.resolve.mockClear();
    const committed: { activeAccountId: string; session: ProviderSession | null }[] = [];
    const unsubscribe = useSession.subscribe((state) => {
      committed.push({ activeAccountId: state.activeAccountId, session: state.session });
    });
    useSession.getState().selectBoundAccount(MAIMAI_TEST_ACCOUNT_ID);
    unsubscribe();

    const state = useSession.getState();
    expect(state.activeAccountId).toBe(MAIMAI_TEST_ACCOUNT_ID);
    expect(state.activeGameId).toBe('maimai');
    expect(state.activeProviderId).toBe('maimai-test');
    expect(state.session).toBeNull();
    expect(state.scoreProvider).toBe(scoreProvider);
    expect(state.catalogProvider).toBe(catalogProvider);
    // 一次转换只提交一次：激活字段与派生内存视图同时可见，没有只看得到一半的中间态。
    expect(committed).toEqual([{ activeAccountId: MAIMAI_TEST_ACCOUNT_ID, session: null }]);
    // Provider 由注入的解析器按「账号 + 凭据版本」给出，Store 不自行构造。
    expect(runtimeProbe.resolve).toHaveBeenCalledTimes(1);
    expect(runtimeProbe.resolve.mock.calls[0]?.[0]).toMatchObject({
      account: expect.objectContaining({ id: MAIMAI_TEST_ACCOUNT_ID }),
      credentials: expect.objectContaining({ session: null }),
    });
  });

  it('恢复多账号时激活账号、会话与 Provider 一起提交', () => {
    const token: ProviderSession = { mode: 'import-token', value: 'token-a', persistable: true };
    runtimeProbe.resolve.mockClear();

    useSession.getState().finishRestore({
      version: 3,
      activeAccountId: 'maimai:diving-fish:a1',
      credentials: [{ id: 'credential:a1', providerId: 'diving-fish', session: token }],
      accounts: [{
        id: 'maimai:diving-fish:a1', gameId: 'maimai', providerId: 'diving-fish',
        credentialId: 'credential:a1', displayName: '账号甲', scoreDisplay: '14000',
      }],
    });

    const state = useSession.getState();
    expect(state.activeAccountId).toBe('maimai:diving-fish:a1');
    expect(state.session).toEqual(token);
    expect(state.sessionsByAccountId['maimai:diving-fish:a1']).toEqual(token);
    expect(state.scoreProvider).toBe(scoreProvider);
    const resolvedForActive = runtimeProbe.resolve.mock.calls
      .filter(([request]) => request.account?.id === 'maimai:diving-fish:a1');
    expect(resolvedForActive).toHaveLength(1);
    expect(resolvedForActive[0]?.[0]).toMatchObject({
      credentials: { id: 'credential:a1', session: token },
    });
  });

  it('解绑账号时释放该账号的 Provider 缓存并同时切换视图', () => {
    useSession.getState().selectBoundAccount(MAIMAI_TEST_ACCOUNT_ID);
    runtimeProbe.release.mockClear();

    useSession.getState().removeBoundAccount(MAIMAI_TEST_ACCOUNT_ID);

    expect(runtimeProbe.release).toHaveBeenCalledWith([MAIMAI_TEST_ACCOUNT_ID]);
    const state = useSession.getState();
    expect(state.boundAccounts.map((account) => account.id)).not.toContain(MAIMAI_TEST_ACCOUNT_ID);
    expect(state.activeAccountId).toBe(LOCAL_MAIMAI_ACCOUNT_ID);
    expect(state.session).toBeNull();
    expect(state.scoreProvider).toBe(scoreProvider);
  });

  it('本地账号改名后派生视图重解析，其它账号的展示元数据变更不重解析', () => {
    useSession.getState().selectBoundAccount(LOCAL_MAIMAI_ACCOUNT_ID);
    runtimeProbe.resolve.mockClear();

    useSession.getState().renameLocalAccount(MAIMAI_TEST_ACCOUNT_ID, '示例改名');
    expect(runtimeProbe.resolve).not.toHaveBeenCalled();

    useSession.getState().renameLocalAccount(LOCAL_MAIMAI_ACCOUNT_ID, '新名字');
    const account = useSession.getState().boundAccounts.find((item) => item.id === LOCAL_MAIMAI_ACCOUNT_ID);
    expect(account?.displayName).toBe('新名字');
    expect(useSession.getState().activeAccountId).toBe(LOCAL_MAIMAI_ACCOUNT_ID);
    expect(runtimeProbe.resolve).toHaveBeenCalledTimes(1);
    expect(runtimeProbe.resolve.mock.calls[0]?.[0]).toMatchObject({
      account: expect.objectContaining({ id: LOCAL_MAIMAI_ACCOUNT_ID, displayName: '新名字' }),
    });
  });
});

describe('凭据提交经注入端口落盘', () => {
  const lxnsSession: ProviderSession = {
    mode: 'lxns-oauth',
    accessToken: 'access-a',
    refreshToken: 'refresh-a',
    expiresAt: Date.now() + 600_000,
    persistable: true,
  };

  it('落雪轮换把新会话交给端口提交，并把落盘失败标成待持久化', async () => {
    useSession.getState().setSession(lxnsSession, {
      displayName: '落雪玩家', rating: 12000, playerId: '1', providerId: 'lxns',
    });
    const accountId = useSession.getState().activeAccountId;
    const rotated = { ...lxnsSession, accessToken: 'access-b', refreshToken: 'refresh-b' };
    updateCredentialSession.mockRejectedValueOnce(new Error('write failed'));

    await expect(applyLxnsTokenRotation(accountId, {
      previous: lxnsSession as Extract<ProviderSession, { mode: 'lxns-oauth' }>,
      next: rotated as Extract<ProviderSession, { mode: 'lxns-oauth' }>,
    })).resolves.toBe('pending-persist');

    expect(updateCredentialSession).toHaveBeenCalledWith(
      `credential:${accountId}`,
      rotated,
      { acceptedRefreshTokens: ['refresh-a'] },
    );
    expect(useSession.getState().sessionsByAccountId[accountId]).toEqual(rotated);
    expect(pendingRotationWritesSnapshot()).toEqual([
      expect.objectContaining({ accountId, attempts: 0 }),
    ]);

    updateCredentialSession.mockResolvedValue('applied');
    await expect(retryPendingRotationWrites()).resolves.toBe(1);
    expect(pendingRotationWritesSnapshot()).toEqual([]);
  });

  it('共享凭据轮换只更新关联账号，激活账号不受影响时不多提交一次', async () => {
    const shared = {
      mode: 'lxns-oauth', accessToken: 'access-a', refreshToken: 'refresh-a',
      expiresAt: Date.now() + 600_000, persistable: true,
    } as const;
    useSession.getState().finishRestore({
      version: 3,
      activeAccountId: 'maimai:lxns:1',
      credentials: [{ id: 'lxns:shared', providerId: 'lxns', session: shared }],
      accounts: [
        {
          id: 'maimai:lxns:1', gameId: 'maimai', providerId: 'lxns',
          credentialId: 'lxns:shared', displayName: '舞萌玩家', scoreDisplay: '15000',
        },
        {
          id: 'chunithm:lxns:2', gameId: 'chunithm', providerId: 'lxns',
          credentialId: 'lxns:shared', displayName: '中二玩家', scoreDisplay: '17.25',
        },
      ],
    }, [createLocalMaimaiAccount('本地玩家', 0)]);
    useSession.getState().selectBoundAccount(LOCAL_MAIMAI_ACCOUNT_ID);
    const rotated = { ...shared, accessToken: 'access-b', refreshToken: 'refresh-b' };
    runtimeProbe.resolve.mockClear();
    runtimeProbe.release.mockClear();
    const committed: string[] = [];
    const unsubscribe = useSession.subscribe((state) => committed.push(state.activeAccountId));
    await applyLxnsTokenRotation('maimai:lxns:1', { previous: shared, next: rotated });
    unsubscribe();

    expect(runtimeProbe.release).toHaveBeenCalledWith(['maimai:lxns:1', 'chunithm:lxns:2']);
    expect(useSession.getState().sessionsByAccountId).toMatchObject({
      'maimai:lxns:1': rotated,
      'chunithm:lxns:2': rotated,
    });
    // 激活账号是本地玩家，与共享凭据无关：本轮换只提交会话那一次。
    expect(committed).toEqual([LOCAL_MAIMAI_ACCOUNT_ID]);
    expect(runtimeProbe.resolve).not.toHaveBeenCalled();
  });

  it('激活账号自身轮换后，会话与派生视图落在同一批数据上', async () => {
    const shared = {
      mode: 'lxns-oauth', accessToken: 'access-a', refreshToken: 'refresh-a',
      expiresAt: Date.now() + 600_000, persistable: true,
    } as const;
    useSession.getState().finishRestore({
      version: 3,
      activeAccountId: 'maimai:lxns:1',
      credentials: [{ id: 'lxns:shared', providerId: 'lxns', session: shared }],
      accounts: [
        {
          id: 'maimai:lxns:1', gameId: 'maimai', providerId: 'lxns',
          credentialId: 'lxns:shared', displayName: '舞萌玩家', scoreDisplay: '15000',
        },
        {
          id: 'chunithm:lxns:2', gameId: 'chunithm', providerId: 'lxns',
          credentialId: 'lxns:shared', displayName: '中二玩家', scoreDisplay: '17.25',
        },
      ],
    });
    const rotated = { ...shared, accessToken: 'access-b', refreshToken: 'refresh-b' };
    runtimeProbe.resolve.mockClear();
    const committed: { activeAccountId: string; session: ProviderSession | null; sessionForActive: ProviderSession | null }[] = [];
    const unsubscribe = useSession.subscribe((state) => committed.push({
      activeAccountId: state.activeAccountId,
      session: state.session,
      sessionForActive: state.sessionsByAccountId[state.activeAccountId] ?? null,
    }));
    await applyLxnsTokenRotation('maimai:lxns:1', { previous: shared, next: rotated });
    unsubscribe();

    // 第一次提交发布新会话，第二次提交把同一批会话交给派生视图；两次里激活账号与内存会话都一致。
    expect(committed).toHaveLength(2);
    for (const snapshot of committed) {
      expect(snapshot.activeAccountId).toBe('maimai:lxns:1');
      expect(snapshot.session).toEqual(rotated);
      expect(snapshot.sessionForActive).toEqual(rotated);
    }
    expect(runtimeProbe.resolve).toHaveBeenCalledTimes(1);
    expect(runtimeProbe.resolve.mock.calls[0]?.[0]).toMatchObject({
      account: expect.objectContaining({ id: 'maimai:lxns:1' }),
      credentials: { id: 'lxns:shared', session: rotated },
    });
  });

  it('Rizline 轮换先用端口落盘，再广播到内存会话', async () => {
    const session = {
      mode: 'rizline', phone: '13800000000', token: 'private-token',
      deviceId: 'device-id', channelId: '1', persistable: true,
    } as const;
    useSession.getState().setSession(session, {
      gameId: 'rizline', providerId: 'rizline-official', playerId: '123',
      displayName: 'Rizline 玩家', rating: 135.4321, credentialId: 'rizline-credential',
    });
    const accountId = useSession.getState().activeAccountId;
    const next = { ...session, token: 'rotated' };
    const order: string[] = [];
    updateAccountSession.mockImplementationOnce(async () => { order.push('persist'); });
    const unsubscribe = useSession.subscribe(() => order.push('publish'));

    await applyRizlineSessionRotation(accountId, next, session);
    unsubscribe();

    expect(updateAccountSession).toHaveBeenCalledWith(
      accountId,
      next,
      { expected: session, signal: undefined },
    );
    expect(order[0]).toBe('persist');
    expect(order).toContain('publish');
    expect(useSession.getState().session).toBe(next);
  });

  it('恢复失败时保留可重试错误并回到未绑定状态', async () => {
    await restoreSession(async () => { throw new Error('secure store unavailable'); });
    expect(useSession.getState()).toMatchObject({
      session: null,
      restoreStatus: 'error',
      activeAccountId: UNBOUND_ACCOUNT_ID,
    });
  });
});
