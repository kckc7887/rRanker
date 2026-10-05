import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { museDashProvider } from '@/providers/muse-dash-provider';
import { loadMuseDashPlayerFresh } from '@/services/muse-dash-cache';
const player = { rl: 3.45, plays: [], user: { user_id: 'a', nickname: '公开玩家' } };

describe('muse dash player inflight dedupe', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(museDashProvider, 'getPlayer').mockImplementation(
      async (userId) => ({ ...player, user: { ...player.user, user_id: userId } }),
    );
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('shares one network request across concurrent loads', async () => {
    const [first, second] = await Promise.all([
      loadMuseDashPlayerFresh('a'),
      loadMuseDashPlayerFresh('a'),
    ]);
    expect(first.user.user_id).toBe('a');
    expect(second.user.user_id).toBe('a');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh request after the previous settled', async () => {
    await loadMuseDashPlayerFresh('a');
    await loadMuseDashPlayerFresh('a');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
