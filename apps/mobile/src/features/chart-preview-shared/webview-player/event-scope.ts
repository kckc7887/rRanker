/** 一次播放器实例拥有的 DOM 监听与清理；释放后的排队事件不再执行。 */
export class PlayerEventScope {
  private cleanups: (() => void)[] = [];
  private closed = false;

  constructor(private readonly isDisposed: () => boolean) {}

  listen<K extends keyof WindowEventMap>(target: Window, type: K, listener: (event: WindowEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
  listen<K extends keyof DocumentEventMap>(target: Document, type: K, listener: (event: DocumentEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
  listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, listener: (event: HTMLElementEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, callback: unknown, options?: boolean | AddEventListenerOptions): void {
    if (this.closed) return;
    const listener = callback as EventListenerOrEventListenerObject;
    const guarded: EventListener = event => {
      if (this.closed || this.isDisposed()) return;
      if (typeof listener === 'function') listener.call(target, event);
      else listener.handleEvent(event);
    };
    target.addEventListener(type, guarded, options);
    this.own(() => target.removeEventListener(type, guarded, options));
  }

  own(cleanup: () => void): void {
    if (this.closed) cleanup();
    else this.cleanups.push(cleanup);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      try { cleanup(); } catch { /* 一个资源释放失败不能阻止其它监听与媒体释放。 */ }
    }
  }
}
