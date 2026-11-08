import type { PlayerEventScope } from './event-scope';

export type LatestFrameScheduler<T> = {
  schedule: (value: T) => void;
  flush: () => void;
  cancel: () => void;
};

export function createLatestFrameScheduler<T>(run: (value: T) => void): LatestFrameScheduler<T> {
  let frame = 0;
  let latest: T | undefined;
  let hasLatest = false;

  const invoke = () => {
    frame = 0;
    if (!hasLatest) return;
    const value = latest as T;
    latest = undefined;
    hasLatest = false;
    run(value);
  };

  return {
    schedule(value) {
      latest = value;
      hasLatest = true;
      if (frame === 0) frame = requestAnimationFrame(invoke);
    },
    flush() {
      if (frame !== 0) cancelAnimationFrame(frame);
      invoke();
    },
    cancel() {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      latest = undefined;
      hasLatest = false;
    },
  };
}

export function bindTimelineDrag(events: PlayerEventScope, hosts: readonly HTMLElement[], options: {
  enabled(): boolean;
  playing(): boolean;
  pause(): void;
  preview(fraction: number): void;
  resume(): void;
}): () => void {
  const frames = createLatestFrameScheduler(options.preview);
  let pointer: number | null = null;
  let bounds: DOMRect;
  let resume = false;
  let latest = NaN;
  const update = (event: PointerEvent) => {
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
    if (fraction !== latest) frames.schedule(fraction);
    latest = fraction;
  };
  const cancel = () => { pointer = null; frames.cancel(); };
  for (const host of hosts) events.listen(host, 'pointerdown', event => {
    if (pointer !== null || !options.enabled()) return;
    event.preventDefault();
    event.stopPropagation();
    pointer = event.pointerId;
    bounds = host.getBoundingClientRect();
    latest = NaN;
    resume = options.playing();
    options.pause();
    update(event);
  });
  events.listen(document, 'pointermove', event => { if (event.pointerId === pointer) update(event); });
  events.listen(document, 'pointerup', event => {
    if (pointer !== event.pointerId) return;
    update(event);
    frames.flush();
    pointer = null;
    if (resume) options.resume();
  });
  events.listen(document, 'pointercancel', event => {
    if (pointer !== event.pointerId) return;
    frames.flush();
    cancel();
  });
  events.own(cancel);
  return cancel;
}
