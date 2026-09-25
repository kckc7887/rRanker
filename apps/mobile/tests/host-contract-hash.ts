/**
 * 宿主结构合同的公共辅助：规范序列化、哈希门禁与按路径定位的失败诊断。
 *
 * 门禁与诊断分离，两者职责不得互换：
 * - 哈希（规范序列化后的 sha256）是**唯一**的通过/失败依据，基线与它不一致不会改变结论；
 * - `tests/host-contract-baselines/<name>.json` 只在哈希失败时提供「按路径定位的差异」，
 *   让失败信息指出结构哪里变了，而不是只报两串十六进制；
 * - 基线只在显式设置 `HOST_CONTRACT_UPDATE_BASELINE=1` 时改写（见
 *   `HOST_CONTRACT_UPDATE_ENV`），测试不会静默写入仓库文件。
 *
 * `<name>` 的第一段用校验文件去掉扩展名的名字（例如 `p3-host-contract-visuals`），
 * 第二段起是本文件内唯一的用例域名，因此基线路径与生成命令都能由 name 直接推出。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 显式改写结构基线的开关：只有它的值恰好是 `1` 时才写文件。 */
export const HOST_CONTRACT_UPDATE_ENV = 'HOST_CONTRACT_UPDATE_BASELINE';

/** 结构基线目录：相对 `apps/mobile/tests`。 */
export const HOST_CONTRACT_BASELINE_DIRNAME = 'host-contract-baselines';

/** 基线文件结构版本：字段语义变化时提升，读取时校验。 */
export const HOST_CONTRACT_BASELINE_FORMAT_VERSION = 1;

const DEFAULT_DIFF_LIMIT = 25;
const VALUE_PREVIEW_LIMIT = 120;

export type HostContractSerializeOptions = {
  /**
   * 剥离 React element 泄漏的下划线私有键（`_owner` / `_source`）。
   * 只在被测树确实会泄漏这些键时开启；开启即代表哈希口径包含该剥离规则。
   */
  stripInternalKeys?: boolean;
};

export type HostContractBaseline = {
  name: string;
  formatVersion: number;
  hash: string;
  /** 规范序列化后的结构（已按 JSON 往返投影，函数值不参与比较）。 */
  tree: unknown;
};

export type HostContractBaselineRead =
  | { status: 'present'; path: string; baseline: HostContractBaseline }
  | { status: 'missing'; path: string }
  | { status: 'invalid'; path: string; reason: string };

export type HostContractDiffEntry = {
  kind: 'changed' | 'added' | 'removed';
  /** 按路径定位的差异位置，例如 `children[2].props.style.color`。 */
  path: string;
  before?: string;
  after?: string;
};

/** 键名可直接用点号连接时用 `.key`，否则退化成 `["key"]`。 */
const KEY_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 规范序列化的中间结果：对象键按下划线剥离规则过滤后排序，数组保序。 */
export function canonicalizeContractTree(
  value: unknown,
  options: HostContractSerializeOptions = {},
): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalizeContractTree(item, options));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !(options.stripInternalKeys && key.startsWith('_')))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalizeContractTree(item, options)]),
  );
}

/**
 * JSON 往返投影：函数值、`undefined`、`symbol` 在 `JSON.stringify` 下都有确定结果，
 * 哈希与差异比较都必须建立在这份投影上，否则「哈希一致但差异非空」会出现假报。
 */
export function projectContractTree(value: unknown): unknown {
  const text = JSON.stringify(value);
  return text === undefined ? null : JSON.parse(text) as unknown;
}

/** 规范序列化后的 JSON 文本；哈希与基线正文都用它，保证两者同口径。 */
export function serializeContractTree(
  value: unknown,
  options: HostContractSerializeOptions = {},
): string {
  return JSON.stringify(canonicalizeContractTree(value, options));
}

/** 结构哈希：规范序列化文本的 sha256（十六进制）。 */
export function contractTreeHash(
  value: unknown,
  options: HostContractSerializeOptions = {},
): string {
  return createHash('sha256').update(serializeContractTree(value, options)).digest('hex');
}

/** 从 name 推出校验文件名（第一段），用于失败信息里的基线生成命令。 */
export function hostContractSourceFileName(name: string): string {
  const [scope] = name.split('/');
  return `${scope}.test.tsx`;
}

function testsDirectory(): string {
  // jest 经 babel 转成 CJS，`__dirname` 指 tests 目录；vitest（ESM）下没有它，回退到进程工作目录。
  if (typeof __dirname === 'string' && __dirname.length > 0) return __dirname;
  return join(process.cwd(), 'tests');
}

/** 结构基线的绝对路径：`tests/host-contract-baselines/<name>.json`。 */
export function hostContractBaselinePath(name: string): string {
  return join(testsDirectory(), HOST_CONTRACT_BASELINE_DIRNAME, `${name}.json`);
}

function describeBaselinePath(name: string): string {
  return `${HOST_CONTRACT_BASELINE_DIRNAME}/${name}.json`;
}

/** 读取结构基线；缺失、无法解析或结构不合法都返回状态而不是抛错。 */
export function readHostContractBaseline(name: string): HostContractBaselineRead {
  const path = hostContractBaselinePath(name);
  if (!existsSync(path)) return { status: 'missing', path };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    return { status: 'invalid', path, reason: `JSON 解析失败：${String(error)}` };
  }
  if (!isPlainObject(parsed)) return { status: 'invalid', path, reason: '顶层不是对象' };
  if (parsed.formatVersion !== HOST_CONTRACT_BASELINE_FORMAT_VERSION) {
    return {
      status: 'invalid',
      path,
      reason: `formatVersion 是 ${String(parsed.formatVersion)}，期望 ${HOST_CONTRACT_BASELINE_FORMAT_VERSION}`,
    };
  }
  if (parsed.name !== name) return { status: 'invalid', path, reason: `name 是 ${String(parsed.name)}，期望 ${name}` };
  if (typeof parsed.hash !== 'string') return { status: 'invalid', path, reason: 'hash 不是字符串' };
  if (!('tree' in parsed)) return { status: 'invalid', path, reason: '缺少 tree 字段' };
  return {
    status: 'present',
    path,
    baseline: {
      name,
      formatVersion: HOST_CONTRACT_BASELINE_FORMAT_VERSION,
      hash: parsed.hash,
      tree: parsed.tree,
    },
  };
}

/**
 * 写入（或刷新）结构基线：调用方必须先显式设置 `HOST_CONTRACT_UPDATE_ENV=1`。
 * 未设置时抛错，避免「测试悄悄改写仓库文件」。
 */
export function writeHostContractBaseline(
  name: string,
  tree: unknown,
  options: HostContractSerializeOptions = {},
): string {
  if (process.env[HOST_CONTRACT_UPDATE_ENV] !== '1') {
    throw new Error(`写入结构基线需要显式设置 ${HOST_CONTRACT_UPDATE_ENV}=1`);
  }
  const path = hostContractBaselinePath(name);
  const serialized = serializeContractTree(tree, options);
  const hash = createHash('sha256').update(serialized).digest('hex');
  // 头部字段逐行可读，tree 保持单行紧凑：基线是「按需重建的诊断快照」，
  // 逐行缩进只增加仓库体积；人读的结构差异由失败信息里的路径 diff 提供。
  const text = [
    '{',
    `  "name": ${JSON.stringify(name)},`,
    `  "formatVersion": ${HOST_CONTRACT_BASELINE_FORMAT_VERSION},`,
    `  "hash": ${JSON.stringify(hash)},`,
    `  "tree": ${serialized}`,
    '}',
    '',
  ].join('\n');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
  return path;
}

function appendPath(path: string, key: string): string {
  return KEY_IDENTIFIER.test(key) ? `${path}.${key}` : `${path}["${key}"]`;
}

function appendIndex(path: string, index: number): string {
  return `${path}[${index}]`;
}

function formatDiffValue(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > VALUE_PREVIEW_LIMIT ? `${text.slice(0, VALUE_PREVIEW_LIMIT)}…` : text;
}

type DiffCollector = {
  entries: HostContractDiffEntry[];
  limit: number;
  truncated: boolean;
};

function pushDiff(collector: DiffCollector, entry: HostContractDiffEntry): void {
  if (collector.entries.length >= collector.limit) {
    collector.truncated = true;
    return;
  }
  collector.entries.push(entry);
}

function diffValues(before: unknown, after: unknown, path: string, collector: DiffCollector): void {
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      const at = appendIndex(path, index);
      if (index >= after.length) {
        pushDiff(collector, { kind: 'removed', path: at, before: formatDiffValue(before[index]) });
      } else if (index >= before.length) {
        pushDiff(collector, { kind: 'added', path: at, after: formatDiffValue(after[index]) });
      } else {
        diffValues(before[index], after[index], at, collector);
      }
    }
    return;
  }
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(
      (left, right) => left.localeCompare(right),
    );
    for (const key of keys) {
      const at = appendPath(path, key);
      const inBefore = Object.prototype.hasOwnProperty.call(before, key);
      const inAfter = Object.prototype.hasOwnProperty.call(after, key);
      if (!inAfter) {
        pushDiff(collector, { kind: 'removed', path: at, before: formatDiffValue(before[key]) });
      } else if (!inBefore) {
        pushDiff(collector, { kind: 'added', path: at, after: formatDiffValue(after[key]) });
      } else {
        diffValues(before[key], after[key], at, collector);
      }
    }
    return;
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    pushDiff(collector, {
      kind: 'changed',
      path,
      before: formatDiffValue(before),
      after: formatDiffValue(after),
    });
  }
}

/**
 * 比较两份结构（基线 vs 当前），逐条给出按路径定位的差异。
 * 传入值会先做 JSON 往返投影，比较口径与哈希完全一致。
 */
export function diffHostContractTrees(
  before: unknown,
  after: unknown,
  options: { limit?: number } = {},
): { entries: HostContractDiffEntry[]; truncated: boolean } {
  const collector: DiffCollector = {
    entries: [],
    limit: options.limit ?? DEFAULT_DIFF_LIMIT,
    truncated: false,
  };
  diffValues(projectContractTree(before), projectContractTree(after), '', collector);
  return { entries: collector.entries, truncated: collector.truncated };
}

/** 把差异渲染成人类可读的多行文本；路径前无前缀，标记为 `~` 改 / `+` 增 / `-` 删。 */
export function formatHostContractDiff(
  entries: readonly HostContractDiffEntry[],
): string {
  return entries
    .map((entry) => {
      const path = entry.path.length > 0 ? entry.path : '(根)';
      if (entry.kind === 'changed') return `    ~ ${path}: ${entry.before} → ${entry.after}`;
      if (entry.kind === 'added') return `    + ${path}: ${entry.after}`;
      return `    - ${path}: ${entry.before}`;
    })
    .join('\n');
}

function baselineHint(name: string): string {
  return [
    `  基线文件：${describeBaselinePath(name)}`,
    `  生成/刷新（显式开关，测试不会自行写文件）：`,
    `    PowerShell: $env:${HOST_CONTRACT_UPDATE_ENV}='1'; npx jest tests/${hostContractSourceFileName(name)}`,
    `    POSIX:      ${HOST_CONTRACT_UPDATE_ENV}=1 npx jest tests/${hostContractSourceFileName(name)}`,
  ].join('\n');
}

function describeBaselineDiff(
  name: string,
  read: HostContractBaselineRead,
  serialized: string,
  diffLimit: number,
): string[] {
  if (read.status === 'missing') {
    return ['  结构基线缺失，本次只按哈希判定；补建后可看到按路径定位的差异：', baselineHint(name)];
  }
  if (read.status === 'invalid') {
    return [
      `  结构基线不可用（${read.reason}），本次只按哈希判定；重建后即可看到差异：`,
      baselineHint(name),
    ];
  }
  const { entries, truncated } = diffHostContractTrees(read.baseline.tree, JSON.parse(serialized) as unknown, {
    limit: diffLimit,
  });
  if (entries.length === 0) {
    return [
      '  结构与基线完全一致：这次不一致只来自测试里的哈希字面量，基线无需重建。',
      `  基线记录的哈希：${read.baseline.hash}`,
    ];
  }
  return [
    `  与结构基线的差异（共 ${entries.length}${truncated ? '+' : ''} 条${truncated ? `，仅显示前 ${diffLimit} 条` : ''}）：`,
    formatHostContractDiff(entries),
  ];
}

/**
 * 结构合同断言：哈希是唯一门禁，基线与差异只用于诊断。
 *
 * - 哈希一致即通过（基线缺失、过期都不影响结论）；
 * - 哈希不一致时抛错，错误信息给出按路径定位的差异（changed/added/removed）；
 * - `HOST_CONTRACT_UPDATE_ENV=1` 时先读旧基线算差异、再显式刷新基线，然后照常判定哈希。
 */
export function expectHostContract(input: {
  name: string;
  tree: unknown;
  expectedHash: string;
  serialize?: HostContractSerializeOptions;
  diffLimit?: number;
}): void {
  const { name, tree, expectedHash, serialize = {}, diffLimit = DEFAULT_DIFF_LIMIT } = input;
  const serialized = serializeContractTree(tree, serialize);
  const actualHash = createHash('sha256').update(serialized).digest('hex');
  const baseline = readHostContractBaseline(name);
  const updating = process.env[HOST_CONTRACT_UPDATE_ENV] === '1';
  if (actualHash === expectedHash) {
    if (updating) {
      const path = writeHostContractBaseline(name, tree, serialize);
      process.stderr.write(`[host-contract] 已刷新结构基线 ${path}\n`);
    }
    return;
  }
  const lines = [
    `结构哈希不一致：${name}`,
    `  期望哈希：${expectedHash}`,
    `  实际哈希：${actualHash}`,
    ...describeBaselineDiff(name, baseline, serialized, diffLimit),
  ];
  if (updating) {
    const path = writeHostContractBaseline(name, tree, serialize);
    lines.push(
      `  已按 ${HOST_CONTRACT_UPDATE_ENV}=1 刷新基线：${path}`,
      '  刷新基线只更新诊断用的结构快照；通过/失败仍由哈希决定，请同步核对测试里的哈希字面量。',
      '  若这次结构变化不是有意的，请回退改动，而不是更新哈希或基线。',
    );
  } else {
    lines.push(
      '  基线只用于诊断，不会改变本次判定；确有结构变化时先确认变化是有意的，再更新哈希与基线。',
    );
  }
  throw new Error(lines.join('\n'));
}
