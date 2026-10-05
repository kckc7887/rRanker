import { beforeEach, expect, it, vi } from 'vitest';
import { createMaimaiBoundAccount } from '@/domain/bound-account';
import { switchBoundAccount } from '@/services/switch-bound-account';
import { SecureSessionStore } from '@/storage/secure-session-store';

const mocks = vi.hoisted(() => {
  const index = new Map<string, string>();
  return { index, secrets: new Map<string, string>(), failNextWrite: false,
    state: { activeAccountId: '', boundAccounts: [] as { id: string }[], selectBoundAccount: vi.fn() },
    storage: {
      getItem: async (key: string) => index.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (mocks.failNextWrite) { mocks.failNextWrite = false; throw new Error('write failed'); }
        index.set(key, value);
      },
      removeItem: async (key: string) => { index.delete(key); },
    },
  };
});
vi.mock('@/storage/key-value-storage', () => ({ default: mocks.storage }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mocks.secrets.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mocks.secrets.set(key, value); },
  deleteItemAsync: async (key: string) => { mocks.secrets.delete(key); },
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));
vi.mock('expo-router', () => ({ router: { canDismiss: () => false, navigate: vi.fn() } }));
vi.mock('@/state/session-store', () => ({ useSession: { getState: () => mocks.state } }));
vi.mock('@/services/runtime-diagnostics-recorder', () => ({ recordRuntimeError: vi.fn() }));

beforeEach(() => {
  mocks.index.clear(); mocks.secrets.clear(); mocks.failNextWrite = false;
  mocks.state.selectBoundAccount.mockImplementation(id => { mocks.state.activeAccountId = id; });
});

it('a failed A to B choice retries B and restores B from the actual credential store', async () => {
  const a = createMaimaiBoundAccount({ providerId: 'diving-fish', displayName: 'A', rating: 0, playerId: 'a' });
  const b = createMaimaiBoundAccount({ providerId: 'diving-fish', displayName: 'B', rating: 0, playerId: 'b' });
  const sessions = new SecureSessionStore(mocks.storage);
  for (const account of [a, b]) await sessions.upsertAccount({
    ...account, providerId: 'diving-fish', session: { mode: 'import-token', value: `token-${account.id}`, persistable: true },
  });
  await sessions.setActiveAccountId(a.id);
  mocks.state.boundAccounts = [a, b]; mocks.state.activeAccountId = a.id;
  mocks.failNextWrite = true;
  await expect(switchBoundAccount(b.id, { navigateToOverview: false })).rejects.toThrow();
  expect(mocks.state.activeAccountId).toBe(b.id);
  expect((await new SecureSessionStore(mocks.storage).loadVault()).activeAccountId).toBe(a.id);
  await expect(switchBoundAccount(b.id, { navigateToOverview: false })).resolves.toBe(true);
  const restored = await new SecureSessionStore(mocks.storage).loadVault();
  expect(restored.activeAccountId).toBe(b.id);
  expect(restored.accounts).toHaveLength(2); expect(restored.credentials).toHaveLength(2);
});
