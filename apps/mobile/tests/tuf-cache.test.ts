import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TufPlayer } from '@/domain/tuf';
import { TufPlayerSchema } from '@/domain/tuf';
import { tufProvider } from '@/providers/tuf-provider';
import { loadTufPlayerFresh } from '@/services/tuf-cache';
const player = TufPlayerSchema.parse({ id: 25, name: '公开玩家', rankedScore: 100 });

describe('tuf player inflight dedupe', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(tufProvider, 'getPlayerProfile').mockImplementation(
      async (id) => ({ ...player, id }) as TufPlayer,
    );
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('shares one network request across concurrent loads', async () => {
    const [first, second] = await Promise.all([
      loadTufPlayerFresh(25),
      loadTufPlayerFresh(25),
    ]);
    expect(first.id).toBe(25);
    expect(second.id).toBe(25);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh request after the previous settled', async () => {
    await loadTufPlayerFresh(25);
    await loadTufPlayerFresh(25);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
