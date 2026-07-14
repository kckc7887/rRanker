import type { ProviderSession, ScoreProvider } from '@/providers/contracts';
import { validateAndActivateSession, validateScoreProvider } from '@/services/session-validation';

const session: ProviderSession = { mode: 'import-token', value: 'fake-token', persistable: true };
const player = { id: 'u1', displayName: '尘言', rating: 15000, source: { kind: 'diving-fish', label: '水鱼', updatedAt: '', isStale: false } };

describe('validateScoreProvider', () => {
  it('requires both player and records reads to succeed', async () => {
    const provider: ScoreProvider = {
      getPlayer: vi.fn().mockResolvedValue(player),
      getRecords: vi.fn().mockResolvedValue([]),
    } as unknown as ScoreProvider;
    await expect(validateScoreProvider(provider)).resolves.toEqual(player);
    expect(provider.getPlayer).toHaveBeenCalledTimes(1);
    expect(provider.getRecords).toHaveBeenCalledTimes(1);
  });

  it('rejects when records access fails', async () => {
    const provider: ScoreProvider = {
      getPlayer: vi.fn().mockResolvedValue(player),
      getRecords: vi.fn().mockRejectedValue(new Error('401')),
    } as unknown as ScoreProvider;
    await expect(validateScoreProvider(provider)).rejects.toThrow('401');
  });

  it('persists and activates only after validation succeeds', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const activate = vi.fn();
    const provider = {
      getPlayer: vi.fn().mockResolvedValue(player),
      getRecords: vi.fn().mockResolvedValue([]),
    } as unknown as ScoreProvider;
    await validateAndActivateSession(session, { createProvider: () => provider, save, activate });
    expect(save).toHaveBeenCalledWith(session);
    expect(activate).toHaveBeenCalledWith(session, player);
  });

  it('does not persist or activate an invalid token', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const activate = vi.fn();
    const provider = {
      getPlayer: vi.fn().mockResolvedValue(player),
      getRecords: vi.fn().mockRejectedValue(new Error('401')),
    } as unknown as ScoreProvider;
    await expect(validateAndActivateSession(session, {
      createProvider: () => provider, save, activate,
    })).rejects.toThrow('401');
    expect(save).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });
});
