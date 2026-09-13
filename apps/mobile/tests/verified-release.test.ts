import { describe, expect, it, vi } from 'vitest';
import { VerifiedReleaseSession } from '@/services/verified-release';

describe('verified release lifecycle', () => {
  it('does not turn cache clearing into a recovery request that restores cleared memory', async () => {
    let resolve!: (data: string) => void;
    const prepare = vi.fn(() => new Promise<string>(done => { resolve = done; }));
    const session = new VerifiedReleaseSession(prepare);
    const old = session.load();
    session.clear(); resolve('old');
    await expect(old).rejects.toThrow('Resource generation changed');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(session.peek()).toBeUndefined();
    prepare.mockResolvedValueOnce('new');
    await expect(session.load()).resolves.toBe('new');
  });

  it('does not retry a resource action when its release has been cleared', async () => {
    let reject!: (error: Error) => void;
    const action = vi.fn(() => new Promise<string>((_done, fail) => { reject = fail; }));
    const prepare = vi.fn(async () => 'release');
    const session = new VerifiedReleaseSession(prepare);
    const old = session.withRelease(action);
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    session.clear(); reject(new Error('old asset failed'));
    await expect(old).rejects.toThrow('Resource generation changed');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(session.peek()).toBeUndefined();
  });
});
