import { act, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { createLocalMaimaiAccount, type BoundAccount } from '@/domain/bound-account';
import { useManagedAccountOperations } from '@/hooks/use-managed-account-operations';
import type { useAccountBindingFlow } from '@/hooks/use-account-binding-flow';
import { addOrSwitchDemoAccount, bindOrSwitchPublicPlayer } from '@/screens/game-accounts-actions';
import { switchBoundAccount } from '@/services/switch-bound-account';

const mockA = createLocalMaimaiAccount('A', 0, 'maimai:local:a');
const mockB = createLocalMaimaiAccount('B', 0, 'maimai:local:b');
const mockC = createLocalMaimaiAccount('C', 0, 'maimai:local:c');
let mockActiveId = mockA.id;
let mockAccounts = [mockA, mockB, mockC];
const mockSetActive = jest.fn(async (_id: string): Promise<void> => undefined);
const mockNotify = jest.fn((..._args: unknown[]) => undefined);
const mockUpsert = jest.fn((account: BoundAccount) => { mockAccounts.push(account); });
jest.mock('expo-router', () => ({ router: { canDismiss: () => false, navigate: jest.fn() } }));
jest.mock('@/storage/secure-session-store', () => ({ SecureSessionStore: jest.fn(() => ({
  setActiveAccountId: (id: string) => mockSetActive(id),
})) }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({
  showNotification: mockNotify, showActionNotification: jest.fn(),
}) }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({ clearGameUserData: jest.fn() }) }));
jest.mock('@/services/account-management', () => ({}));
jest.mock('@/state/query-client', () => ({ queryClient: {} }));
jest.mock('@/state/session-store', () => {
  const state = () => ({ activeAccountId: mockActiveId, boundAccounts: mockAccounts, upsertBoundAccount: mockUpsert,
    selectBoundAccount: (id: string) => { mockActiveId = id; } });
  return { useSession: Object.assign((selector: (value: unknown) => unknown) => selector(state()), { getState: state }) };
});

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function publicInput(existing?: BoundAccount) {
  return { existing, create: () => mockB, persist: jest.fn(async () => undefined),
    existingMessage: () => '选择完成', successMessage: () => '绑定完成',
    onExistingBound: jest.fn(), onCreated: jest.fn(), upsertBoundAccount: mockUpsert,
    setMessage: jest.fn(), showNotification: mockNotify };
}
beforeEach(() => {
  mockActiveId = mockA.id; mockAccounts = [mockA, mockB, mockC];
  mockSetActive.mockReset(); mockSetActive.mockResolvedValue(undefined);
  mockNotify.mockClear(); mockUpsert.mockClear();
});

it('managed selection handles a failed write with a retry notification and resolves', async () => {
  mockSetActive.mockRejectedValueOnce(new Error('private detail'));
  const { result } = await renderHook(() => useManagedAccountOperations({} as ReturnType<typeof useAccountBindingFlow>));
  await expect(result.current.onSelectAccount(mockB)).resolves.toBe(false);
  expect(mockActiveId).toBe(mockB.id);
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: '当前账号未保存', variant: 'error' }));
});

it('public existing selection rejects no caller promise and announces no premature success', async () => {
  const pending = deferred<void>(); mockSetActive.mockReturnValueOnce(pending.promise);
  const input = publicInput(mockB); const operation = bindOrSwitchPublicPlayer(input);
  expect(input.setMessage).not.toHaveBeenCalled(); expect(input.onExistingBound).not.toHaveBeenCalled();
  pending.reject(new Error('write failed')); await expect(operation).resolves.toBeUndefined();
  expect(input.setMessage).not.toHaveBeenCalled(); expect(input.onExistingBound).not.toHaveBeenCalled();
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: '当前账号未保存' }));
});

it('a newly persisted binding survives a failed active choice and reports that separate stage', async () => {
  mockAccounts = [mockA, mockC]; mockSetActive.mockRejectedValueOnce(new Error('write failed'));
  const input = publicInput(); await bindOrSwitchPublicPlayer(input);
  expect(input.persist).toHaveBeenCalledWith(mockB); expect(mockUpsert).toHaveBeenCalledWith(mockB);
  expect(mockAccounts).toContain(mockB); expect(input.setMessage).not.toHaveBeenCalled();
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: '当前账号未保存' }));
});

it('public binding failures are caught before selecting or publishing the account', async () => {
  const input = publicInput(); input.persist.mockRejectedValueOnce(new Error('write failed'));
  await expect(bindOrSwitchPublicPlayer(input)).resolves.toBeUndefined();
  expect(mockUpsert).not.toHaveBeenCalled(); expect(mockSetActive).not.toHaveBeenCalled();
  expect(mockNotify).toHaveBeenCalledWith({ title: '绑定失败', message: '无法绑定玩家，请重试。', variant: 'error' });
});

it('public and managed callers share generation guards for a late B failure after C then B', async () => {
  const pending = deferred<void>(); mockSetActive.mockReturnValueOnce(pending.promise);
  const input = publicInput(mockB); const old = bindOrSwitchPublicPlayer(input);
  const { result } = await renderHook(() => useManagedAccountOperations({} as ReturnType<typeof useAccountBindingFlow>));
  await result.current.onSelectAccount(mockC); await result.current.onSelectAccount(mockB);
  pending.reject(new Error('late failure')); await old;
  expect(mockActiveId).toBe(mockB.id); expect(mockNotify).not.toHaveBeenCalled();
  expect(input.setMessage).not.toHaveBeenCalled();
});

it.each([true, false])('demo selection waits for saving and catches failure (existing=%s)', async existing => {
  const pending = deferred<void>(); mockSetActive.mockReturnValueOnce(pending.promise);
  const setMessage = jest.fn();
  await addOrSwitchDemoAccount({ existing: existing ? mockB : undefined, create: () => mockB,
    persist: jest.fn(async () => undefined), existingMessage: () => '选择完成', successMessage: () => '添加完成',
    errorFallback: '添加失败', setBusy: jest.fn(), setPickerVisible: jest.fn(), setMessage,
    onSelectExisting: account => switchBoundAccount(account.id, { navigateToOverview: false }),
    upsertBoundAccount: mockUpsert, showNotification: mockNotify });
  await waitFor(() => expect(mockSetActive).toHaveBeenCalledTimes(1));
  expect(setMessage).not.toHaveBeenCalled();
  await act(async () => pending.reject(new Error('write failed')));
  expect(setMessage).not.toHaveBeenCalled();
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: '当前账号未保存' }));
});
