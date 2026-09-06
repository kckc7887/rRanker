type ErrorHandler = (error: unknown, fatal?: boolean) => void;
export type RuntimeExceptionHost = {
  RN$useAlwaysAvailableJSErrorHandling?: boolean;
  RN$registerExceptionListener?: (listener: (data: unknown) => void) => void;
  ErrorUtils?: { getGlobalHandler: () => ErrorHandler; setGlobalHandler: (handler: ErrorHandler) => void };
};

const installed = new WeakSet<RuntimeExceptionHost>();

export function installRuntimeLogErrors(host: RuntimeExceptionHost, record: ErrorHandler): void {
  if (installed.has(host)) return;
  const capture: ErrorHandler = (error, fatal) => {
    try { record(error, fatal); } catch { /* 必须继续执行平台原有异常处理。 */ }
  };
  if (host.RN$useAlwaysAvailableJSErrorHandling !== false && typeof host.RN$registerExceptionListener === 'function') {
    try {
      host.RN$registerExceptionListener((data) => {
        const fatal = data !== null && typeof data === 'object' && 'isFatal' in data && data.isFatal === true;
        capture(data, fatal);
      });
      installed.add(host);
      return;
    } catch { /* 原生监听不可用时尝试现有全局处理器。 */ }
  }
  if (host.ErrorUtils) {
    try {
      const original = host.ErrorUtils.getGlobalHandler();
      host.ErrorUtils.setGlobalHandler((error, fatal) => {
        capture(error, fatal);
        original(error, fatal);
      });
      installed.add(host);
    } catch { /* 日志初始化失败不得阻止应用启动。 */ }
  }
}
