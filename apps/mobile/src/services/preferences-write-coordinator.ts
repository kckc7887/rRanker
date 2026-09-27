/** Owns one preference document: user changes stay in memory until storage recovers. */
export function createPreferencesWriteCoordinator<P extends object>(ports: {
  load(): Promise<P>;
  save(value: P): Promise<void>;
  loaded(value: P): void;
  failed?(phase: 'read' | 'write', error: unknown, attempts: number): void;
  recovered?(): void;
}) {
  let baseline: P | null = null;
  let dirty: Partial<P> = {};
  let generation = 0;
  let foreground = true;
  let failures = 0;
  let running: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const delays = [500, 2_000, 10_000, 30_000];
  const cancelTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const schedule = () => {
    if (!foreground || timer !== null) return;
    timer = setTimeout(() => { timer = null; void flush(); }, delays[Math.min(failures - 1, delays.length - 1)]);
    (timer as unknown as { unref?: () => void }).unref?.();
  };
  const flush = (): Promise<void> => {
    if (running) return running;
    if (!foreground) return Promise.resolve();
    cancelTimer();
    running = (async () => {
      let phase: 'read' | 'write' = 'read';
      try {
        if (baseline === null) {
          baseline = await ports.load();
          ports.loaded({ ...baseline, ...dirty });
        }
        while (foreground && Object.keys(dirty).length > 0) {
          phase = 'write';
          const writingGeneration = generation;
          const value: P = { ...baseline, ...dirty };
          await ports.save(value);
          baseline = value;
          if (writingGeneration === generation) dirty = {};
        }
        if (failures > 0) ports.recovered?.();
        failures = 0;
      } catch (error) {
        failures += 1;
        ports.failed?.(phase, error, failures);
      }
    })().finally(() => {
      running = null;
      if (failures > 0) schedule();
    });
    return running;
  };
  return {
    flush,
    change(patch: Partial<P>): void {
      dirty = { ...dirty, ...patch };
      generation += 1;
      cancelTimer();
      void flush();
    },
    setForeground(value: boolean): void {
      foreground = value;
      cancelTimer();
      if (value) void flush();
    },
    dispose(): void { foreground = false; cancelTimer(); },
  };
}
