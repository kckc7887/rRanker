// Jest has no native idle scheduler; keep callbacks asynchronous and cancellable.
globalThis.requestIdleCallback = (callback) => setTimeout(() => {
  callback({ didTimeout: false, timeRemaining: () => 50 });
}, 0) as unknown as number;
globalThis.cancelIdleCallback = (handle) => clearTimeout(handle);
