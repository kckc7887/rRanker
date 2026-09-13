import { jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useGameResourceSync } from '@/hooks/use-game-resource-sync';

let mockGame = 'phigros';
let mockReady = true;
let mockRestore = 'ready';
const mockRizlineRefresh = jest.fn(async () => undefined);
const mockRefresh = jest.fn(async () => undefined);
jest.mock('@/state/session-store', () => ({
  useSession: (select: (value: unknown) => unknown) => select({ activeGameId: mockGame, restoreStatus: mockRestore }),
}));
jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => ({ foregroundReady: mockReady }) }));
jest.mock('@/hooks/use-phigros-catalog', () => ({ refreshPhigrosCatalog: () => mockRefresh() }));

jest.mock('@/hooks/use-rizline-catalog', () => ({ refreshRizlineCatalog: () => mockRizlineRefresh() }));

beforeEach(() => {
  mockGame = 'phigros'; mockReady = true; mockRestore = 'ready'; mockRefresh.mockClear(); mockRizlineRefresh.mockClear();
});

it('checks once on Phigros startup and again on entering the game, without polling or tab refetches', async () => {
  const hook = await renderHook(() => useGameResourceSync());
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
  const hook = await renderHook(() => useGameResourceSync());
  expect(mockRefresh).not.toHaveBeenCalled();
  mockRestore = 'ready';
  await hook.rerender(undefined);
  expect(mockRefresh).not.toHaveBeenCalled();
  mockReady = true;
  await hook.rerender(undefined);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

it('refreshes the registered Rizline catalog once per game entry', async () => {
  mockGame = 'rizline';
  const hook = await renderHook(() => useGameResourceSync());
  expect(mockRizlineRefresh).toHaveBeenCalledTimes(1);
  mockReady = false; await hook.rerender(undefined);
  mockReady = true; await hook.rerender(undefined);
  expect(mockRizlineRefresh).toHaveBeenCalledTimes(1);
  mockGame = 'phigros'; await hook.rerender(undefined);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  mockGame = 'rizline'; await hook.rerender(undefined);
  expect(mockRizlineRefresh).toHaveBeenCalledTimes(2);
  await hook.unmount();
});
