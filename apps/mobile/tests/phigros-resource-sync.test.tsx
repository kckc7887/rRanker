import { jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { usePhigrosResourceSync } from '@/hooks/use-phigros-resource-sync';

let mockGame = 'phigros';
let mockReady = true;
let mockRestore = 'ready';
const mockRefresh = jest.fn(async () => undefined);
jest.mock('@/state/session-store', () => ({
  useSession: (select: (value: unknown) => unknown) => select({ activeGameId: mockGame, restoreStatus: mockRestore }),
}));
jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => ({ foregroundReady: mockReady }) }));
jest.mock('@/hooks/use-phigros-catalog', () => ({ refreshPhigrosCatalog: () => mockRefresh() }));

beforeEach(() => {
  mockGame = 'phigros'; mockReady = true; mockRestore = 'ready'; mockRefresh.mockClear();
});

it('checks once on Phigros startup and again on entering the game, without polling or tab refetches', async () => {
  const hook = await renderHook(() => usePhigrosResourceSync());
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  await hook.rerender(undefined);
  mockReady = false;
  await hook.rerender(undefined);
  mockReady = true;
  await hook.rerender(undefined);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  mockGame = 'maimai';
  await hook.rerender(undefined);
  mockGame = 'phigros';
  await hook.rerender(undefined);
  expect(mockRefresh).toHaveBeenCalledTimes(2);
  await hook.unmount();
});

it('waits for restored selection and foreground readiness', async () => {
  mockRestore = 'restoring'; mockReady = false;
  const hook = await renderHook(() => usePhigrosResourceSync());
  expect(mockRefresh).not.toHaveBeenCalled();
  mockRestore = 'ready';
  await hook.rerender(undefined);
  expect(mockRefresh).not.toHaveBeenCalled();
  mockReady = true;
  await hook.rerender(undefined);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  await hook.unmount();
});
