import type { PlayerEventScope } from './event-scope';

/** 端点沿用调用方的时间单位。 */
export class PlaybackLoop {
  a: number | null = null;
  b: number | null = null;

  toggle(endpoint: 'a' | 'b', position: number): void {
    this[endpoint] = this[endpoint] === null ? position : null;
    if (this.a !== null && this.b !== null && this.a > this.b) [this.a, this.b] = [this.b, this.a];
  }

  target(position: number): number | null {
    return this.a !== null && this.b !== null && this.a < this.b && position >= this.b ? this.a : null;
  }
}

export function bindPlaybackLoop(events: PlayerEventScope, options: {
  loop: PlaybackLoop;
  position(): number;
  percent(position: number): number;
  format(position: number): string;
  update(a: number | null, b: number | null): void;
}): void {
  const buttons = (endpoint: string) => document.querySelectorAll<HTMLButtonElement>(`#btn-loop-${endpoint},#fs-loop-${endpoint}`);
  const sync = () => {
    for (const endpoint of ['a', 'b'] as const) {
      const value = options.loop[endpoint];
      for (const button of buttons(endpoint)) {
        button.textContent = `${endpoint.toUpperCase()} ${value === null ? '—' : options.format(value)}`;
        button.classList.toggle('on', value !== null);
        button.setAttribute('aria-pressed', String(value !== null));
        button.setAttribute('aria-label', `${value === null ? '设置' : '清除'}循环点 ${endpoint.toUpperCase()}${value === null ? '' : ` ${options.format(value)}`}`);
      }
    }
    options.update(options.loop.a === null ? null : options.percent(options.loop.a), options.loop.b === null ? null : options.percent(options.loop.b));
  };
  for (const endpoint of ['a', 'b'] as const) {
    for (const button of buttons(endpoint)) events.listen(button, 'click', () => {
      options.loop.toggle(endpoint, options.position());
      sync();
    });
  }
  sync();
}
