/**
 * workflow / action YAML 的轻检查。
 *
 * 语法与解码交给真正的 YAML 解析器（`.github/scripts/package.json` 固定的 `yaml` 2.9.0），
 * 本文件不再维护自制子集解析器：引号、流集合、块标量（`|` 字面量 / `>` 折叠）、注释、
 * 重复键、Tab 缩进这些都由解析器按 YAML 语义处理，解析失败即失败，不静默放过。
 * 本文件只做 GitHub Actions 结构断言，并把 `run:` 的解码结果交给 bash -n，
 * 因此 `run: "..."`、`|`、`>` 三种形态都按真正执行的文本检查。
 *
 * 依赖缺失时不降级、不跳过：抛 WorkflowYamlError 并在消息里给出安装命令。
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export class WorkflowYamlError extends Error {}

/** yaml 包固定在 .github/scripts/node_modules 下，不从仓库外或移动端依赖树里解析。 */
const YAML_MODULE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'yaml');
const DUPLICATE_KEY_CODE = 'DUPLICATE_KEY';

let yamlModule = null;

function firstLine(text) {
  return String(text ?? '').split('\n')[0];
}

function loadYaml() {
  if (yamlModule) return yamlModule;
  try {
    yamlModule = createRequire(import.meta.url)(YAML_MODULE_PATH);
  } catch (error) {
    throw new WorkflowYamlError(
      `读不到 YAML 解析器 ${YAML_MODULE_PATH}：${firstLine(error?.message ?? error)}；轻检查需要它，请先安装轻检查依赖（cd .github/scripts && npm ci）`,
    );
  }
  return yamlModule;
}

function describeYamlError(error) {
  const detail = firstLine(error?.message ?? error);
  if (error?.code === DUPLICATE_KEY_CODE) return `重复键：${detail}`;
  return error?.code ? `${error.code}：${detail}` : detail;
}

function parseDocument(source, file) {
  if (!String(source ?? '').trim()) throw new WorkflowYamlError(`${file} 是空文件`);
  // 先取依赖：缺依赖时保留 loadYaml 的安装提示，不被下面的解析失败包装掉
  const YAML = loadYaml();
  try {
    return YAML.parse(source, { uniqueKeys: true, merge: false, maxAliasCount: 100 });
  } catch (error) {
    throw new WorkflowYamlError(`${file}: YAML 解析失败：${describeYamlError(error)}`);
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 收集文档里所有字符串（含键），用于表达式括号配平检查。 */
function collectStrings(value, collected = []) {
  if (typeof value === 'string') {
    collected.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, collected);
  } else if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      collected.push(key);
      collectStrings(item, collected);
    }
  }
  return collected;
}

function checkBalancedExpressions(document, file) {
  const problems = [];
  const openToken = `$${'{{'}`;
  let open = 0;
  let close = 0;
  for (const text of collectStrings(document)) {
    open += text.split(openToken).length - 1;
    close += text.split('}}').length - 1;
  }
  if (open !== close) problems.push(`${file}: ${openToken} 与 }} 数量不匹配（${openToken} 出现 ${open} 次，}} 出现 ${close} 次）`);
  return problems;
}

/** 解析成嵌套结构；YAML 语法错误与仓库外的写法都由解析器报错，转成 WorkflowYamlError。 */
export function parseWorkflowYaml(source, file = 'workflow.yml') {
  const document = parseDocument(source, file);
  return { document, problems: checkBalancedExpressions(document, file) };
}

/** workflow 文件的结构断言（解析之外的最低要求）。 */
export function validateWorkflow(source, file) {
  const { document, problems } = parseWorkflowYaml(source, file);
  if (!isPlainObject(document)) throw new WorkflowYamlError(`${file} 顶层不是映射`);
  if (!('on' in document)) problems.push(`${file} 缺少 on 触发条件`);
  if (!('jobs' in document) || !isPlainObject(document.jobs) || Object.keys(document.jobs).length === 0) {
    problems.push(`${file} 缺少非空的 jobs`);
  } else {
    for (const [id, job] of Object.entries(document.jobs)) {
      if (!isPlainObject(job)) {
        problems.push(`${file} jobs.${id} 不是映射`);
        continue;
      }
      if (!('runs-on' in job) && !('uses' in job)) problems.push(`${file} jobs.${id} 既没有 runs-on 也没有 uses`);
      if ('steps' in job && job.steps !== null && !Array.isArray(job.steps)) problems.push(`${file} jobs.${id}.steps 不是列表`);
      if ('steps' in job) {
        for (const [index, step] of (job.steps ?? []).entries()) {
          if (!isPlainObject(step)) {
            problems.push(`${file} jobs.${id}.steps[${index}] 不是映射`);
            continue;
          }
          if (!('uses' in step) && !('run' in step)) problems.push(`${file} jobs.${id}.steps[${index}] 既没有 uses 也没有 run`);
          if ('run' in step && typeof step.run !== 'string') {
            problems.push(`${file} jobs.${id}.steps[${index}].run 不是字符串，解码后没有可检查的 shell 文本`);
          }
        }
      }
    }
  }
  return { document, problems };
}

/** 复合 action 的结构断言。 */
export function validateAction(source, file) {
  const { document, problems } = parseWorkflowYaml(source, file);
  if (!isPlainObject(document)) throw new WorkflowYamlError(`${file} 顶层不是映射`);
  for (const key of ['name', 'description', 'runs']) {
    if (!(key in document)) problems.push(`${file} 缺少 ${key}`);
  }
  if (isPlainObject(document.runs)) {
    if (typeof document.runs.using !== 'string') problems.push(`${file} runs.using 不是字符串`);
    if (document.runs.using === 'composite' && !Array.isArray(document.runs.steps)) problems.push(`${file} 复合 action 缺少 runs.steps`);
  } else if ('runs' in document) {
    problems.push(`${file} runs 不是映射`);
  }
  if (Array.isArray(document.runs?.steps)) {
    for (const [index, step] of document.runs.steps.entries()) {
      if (isPlainObject(step) && 'run' in step && typeof step.run !== 'string') {
        problems.push(`${file} runs.steps[${index}].run 不是字符串，解码后没有可检查的 shell 文本`);
      }
    }
  }
  return { document, problems };
}

/** 该 shell 是否按 bash 语法检查。 */
function isBashShell(shell) {
  return shell === '' || shell === 'bash' || shell === 'sh' || shell === 'bash -e' || /^bash\b/.test(shell);
}

function defaultShellFor(runsOn) {
  return String(runsOn ?? '').startsWith('windows') ? 'pwsh' : 'bash';
}

/** 收集按 bash 执行的 run 片段，用于 bash -n。传入的是 YAML 解码后的文本，不是原始换行。 */
export function collectBashRuns(document, file) {
  const blocks = [];
  if (!isPlainObject(document)) return blocks;

  if (isPlainObject(document.jobs)) {
    for (const [jobId, job] of Object.entries(document.jobs)) {
      if (!isPlainObject(job) || !Array.isArray(job.steps)) continue;
      const jobShell = job.defaults?.run?.shell;
      const fallback = jobShell ?? defaultShellFor(job['runs-on']);
      for (const [index, step] of job.steps.entries()) {
        if (!isPlainObject(step) || typeof step.run !== 'string') continue;
        const shell = typeof step.shell === 'string' ? step.shell : fallback;
        if (!isBashShell(shell)) continue;
        blocks.push({ label: `${file} jobs.${jobId}.steps[${index}]`, script: `${step.run}\n` });
      }
    }
  }

  if (isPlainObject(document.runs) && Array.isArray(document.runs.steps)) {
    for (const [index, step] of document.runs.steps.entries()) {
      if (!isPlainObject(step) || typeof step.run !== 'string') continue;
      if (!isBashShell(typeof step.shell === 'string' ? step.shell : 'bash')) continue;
      blocks.push({ label: `${file} runs.steps[${index}]`, script: `${step.run}\n` });
    }
  }

  return blocks;
}
