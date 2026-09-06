export type RuntimeLogCapacity = 1000 | 2000 | 5000;
export type RuntimeLogPreferences = { capacity: RuntimeLogCapacity; enabled: boolean };
export type RuntimeLogStatus = 'recording' | 'stopped' | 'interrupted' | 'failed';
export type RuntimeLogSession = {
  id: number;
  startedAt: string;
  lastAt: string;
  status: RuntimeLogStatus;
  capacity: RuntimeLogCapacity;
  count: number;
};
export type RuntimeLogEntry = {
  at: string;
  type: string;
  fields: Record<string, string | number | boolean>;
  error?: { name: string; summary: string; stack: string[] };
};

export const RUNTIME_LOG_CAPACITIES = [1000, 2000, 5000] as const;
export const isRuntimeLogCapacity = (value: unknown): value is RuntimeLogCapacity =>
  value === 1000 || value === 2000 || value === 5000;

const words = /^[a-zA-Z0-9_.:-]{1,64}$/u;
const stringFields = new Set([
  'lifecyclePhase', 'gameType', 'providerType', 'taskPhase', 'webContentState',
  'source', 'result', 'errorCode', 'platform', 'appVersion', 'buildVersion',
]);
const numberFields = new Set(['accountCount', 'queryCount', 'durationMs', 'attempt', 'status', 'capacity']);
const errorNames = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'AbortError', 'ProviderError']);

function property(value: unknown, key: string): unknown {
  try {
    return value !== null && typeof value === 'object' ? Reflect.get(value, key) : undefined;
  } catch { return undefined; }
}

function frameLocation(file: unknown, line: unknown, column: unknown): string {
  // 地址只保留打包文件名和数值位置，避免路径、查询参数或账号数据进入日志。
  const name = typeof file === 'string'
    ? file.split(/[?#]/u)[0]!.split(/[/\\]/u).at(-1) ?? '' : '';
  const safeFile = /^(?:index\.(?:android|ios)\.bundle|index\.bundle|main\.jsbundle|[a-zA-Z_$][\w.$-]{0,80}\.[jt]sx?)$/u.test(name)
    ? name : '<source>';
  const coordinate = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return `${safeFile}:${coordinate(line)}:${coordinate(column)}`;
}

export function sanitizeRuntimeLogError(value: unknown): NonNullable<RuntimeLogEntry['error']> {
  const rawName = property(value, 'name');
  const name = typeof rawName === 'string' && errorNames.has(rawName) ? rawName : 'Error';
  const rawStack = property(value, 'stack');
  const stack: string[] = [];
  if (Array.isArray(rawStack)) {
    for (const frame of rawStack.slice(0, 30)) {
      stack.push(frameLocation(property(frame, 'file'), property(frame, 'lineNumber'), property(frame, 'column')));
    }
  } else if (typeof rawStack === 'string') {
    for (const line of rawStack.slice(0, 32_768).split('\n').slice(1, 31)) {
      const match = /(?:\(|@|\s)([^\s()]+):(\d+):(\d+)\)?\s*$/u.exec(line);
      if (match) stack.push(frameLocation(match[1], Number(match[2]), Number(match[3])));
    }
  }
  // 任意异常消息可能包含玩家资料或完整请求；摘要由错误类别生成，不依赖黑名单猜测隐私。
  const summaries: Record<string, string> = {
    TypeError: 'Invalid value or operation', RangeError: 'Value outside supported range',
    ReferenceError: 'Missing reference', SyntaxError: 'Invalid syntax or data',
    AbortError: 'Operation aborted', ProviderError: 'Data operation failed',
  };
  return { name, summary: summaries[name] ?? 'Application operation failed', stack };
}

export function sanitizeRuntimeLogEntry(type: string, input: Readonly<Record<string, unknown>>, at: string): RuntimeLogEntry {
  const fields: RuntimeLogEntry['fields'] = {};
  for (const key of stringFields) {
    const value = property(input, key);
    if (typeof value === 'string' && words.test(value)) fields[key] = value;
  }
  for (const key of numberFields) {
    const value = property(input, key);
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000) fields[key] = value;
  }
  for (const key of ['memoryWarning', 'fatal']) {
    const value = property(input, key);
    if (typeof value === 'boolean') fields[key] = value;
  }
  const route = property(input, 'route');
  if (typeof route === 'string' && route.length <= 256 && /^\/[a-zA-Z/()[\]_.-]*$/u.test(route)) fields.route = route;
  const error = property(input, 'error');
  const entry: RuntimeLogEntry = {
    at, type: words.test(type) ? type : 'event', fields,
    ...(error !== undefined ? { error: sanitizeRuntimeLogError(error) } : {}),
  };
  // 所有保留字段均为 ASCII；裁剪序列化长度同时限制 UTF-8 字节数。
  while (JSON.stringify(entry).length > 8192 && entry.error?.stack.length) entry.error.stack.pop();
  return entry;
}
