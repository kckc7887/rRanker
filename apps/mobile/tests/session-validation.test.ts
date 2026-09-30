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
    expect(save).toHaveBeenCalledWith(session, player);
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

  it('forwards cancellation to both reads and prevents a late validation from committing', async () => {
    const controller = new AbortController();
    let release!: () => void;
    const save = vi.fn(); const activate = vi.fn();
    const provider = { getPlayer: vi.fn(() => new Promise(resolve => { release = () => resolve(player); })),
      getRecords: vi.fn().mockResolvedValue([]) } as unknown as ScoreProvider;
    const result = validateAndActivateSession(session, { createProvider: () => provider, save, activate, signal: controller.signal });
    const reason = new Error('cancelled');
    const rejection = expect(result).rejects.toBe(reason);
    controller.abort(reason); release();
    await rejection;
    expect(provider.getPlayer).toHaveBeenCalledWith(controller.signal);
    expect(provider.getRecords).toHaveBeenCalledWith(controller.signal);
    expect(save).not.toHaveBeenCalled(); expect(activate).not.toHaveBeenCalled();
  });

  it('checks the generation after saving before activation', async () => {
    const provider = { getPlayer: vi.fn().mockResolvedValue(player), getRecords: vi.fn().mockResolvedValue([]) } as unknown as ScoreProvider;
    let current = true;
    const activate = vi.fn();
    await expect(validateAndActivateSession(session, { createProvider: () => provider,
      save: async () => { current = false; }, activate,
      assertCurrent: () => { if (!current) throw new Error('stale'); } })).rejects.toThrow('stale');
    expect(activate).not.toHaveBeenCalled();
  });
});
