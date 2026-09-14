import { ProviderError } from '@/providers/errors';
import { sha256 } from '@/utils/resource-integrity';

export async function verifyResourceBytes(bytes: Uint8Array, asset: { size?: number; sha256: string }, message: string): Promise<void> {
  if ((asset.size !== undefined && bytes.byteLength !== asset.size) || await sha256(bytes) !== asset.sha256.toLowerCase()) {
    throw new ProviderError('upstream_schema', message, true);
  }
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new Error('Resource request cancelled');
}

/** Publishes only completed releases; cancellation belongs to individual consumers. */
export class VerifiedReleaseSession<T> {
  private value: T | undefined;
  private generation = 0;
  private pending: { promise: Promise<T>; controller: AbortController; users: number; force: boolean } | undefined;

  constructor(private readonly prepare: (signal: AbortSignal, force: boolean) => Promise<T>) {}

  peek(): T | undefined { return this.value; }
  clear(): void {
    this.generation += 1;
    this.pending?.controller.abort();
    this.pending = undefined;
    this.value = undefined;
  }

  private acquire(signal: AbortSignal | undefined, check: boolean, force: boolean): Promise<T> {
    assertActive(signal);
    if (!check && this.value) return Promise.resolve(this.value);
    if (force && this.pending && !this.pending.force) {
      return this.acquire(signal, true, false).catch(() => { assertActive(signal); })
        .then(() => this.acquire(signal, true, true));
    }
    if (!this.pending) {
      const controller = new AbortController();
      const generation = this.generation;
      const entry = { controller, users: 0, force, promise: this.prepare(controller.signal, force).then(value => {
        assertActive(controller.signal);
        if (generation !== this.generation) throw new Error('Resource generation changed');
        this.value = value;
        return value;
      }) };
      this.pending = entry;
      void entry.promise.finally(() => { if (this.pending === entry) this.pending = undefined; }).catch(() => undefined);
    }
    const entry = this.pending;
    entry.users += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener('abort', cancel);
        entry.users -= 1;
        if (entry.users === 0 && this.pending === entry) {
          this.pending = undefined;
          entry.controller.abort();
        }
        return true;
      };
      const cancel = () => { if (finish()) reject(signal?.reason ?? new Error('Resource request cancelled')); };
      signal?.addEventListener('abort', cancel, { once: true });
      entry.promise.then(value => { if (finish()) resolve(value); }, error => { if (finish()) reject(error); });
    });
  }

  async withRelease<R>(action: (release: T) => Promise<R>, signal?: AbortSignal, check = false): Promise<R> {
    const generation = this.generation;
    const assertCurrent = () => {
      assertActive(signal);
      if (generation !== this.generation) throw new Error('Resource generation changed');
    };
    for (let attempt = 0; ; attempt += 1) {
      assertCurrent();
      try {
        const release = await this.acquire(signal, check || attempt > 0, attempt > 0);
        const result = await action(release);
        assertCurrent();
        return result;
      } catch (error) {
        assertCurrent();
        if (attempt > 0) throw error;
      }
    }
  }

  load(signal?: AbortSignal, check = false): Promise<T> {
    return this.withRelease(async release => release, signal, check);
  }
}
