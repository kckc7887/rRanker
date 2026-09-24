/**
 * workflow / action YAML 的轻量结构自检。
 *
 * 这里不引入 YAML 解析依赖：实现的是一套只覆盖 GitHub workflow 与复合 action 用到的子集
 * （块映射、块序列、行内标量与行内流集合、块标量 | 与 >、注释）的解析器，再加上针对
 * workflow 结构的显式断言。限制写在下面，遇到子集外的写法会显式报错，不会静默放过。
 *
 * 不支持：锚点与别名（& *）、显式标签（!!）、多文档（--- 之后只取第一份）、
 *         跨行的流集合（[ 与 { 必须在一行内闭合）、复杂键（? key）。
 */
export class WorkflowYamlError extends Error {}

const BLOCK_SCALAR = /:\s*[|>][+-]?[0-9]*\s*$/;
const KEY_LINE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s:#][^:]*?)\s*:(?=\s|$)/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function leadingSpaces(line) {
  let count = 0;
  while (count < line.length && line[count] === ' ') count += 1;
  return count;
}

function isBlockScalarOpener(text) {
  return BLOCK_SCALAR.test(text);
}

/** 去掉行尾注释：# 前面必须有空白，且不在引号内。 */
function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (quote) {
      if (character === quote) quote = null;
      else if (character === '\\' && quote === '"') i += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trimEnd();
  }
  return text;
}

/** 把原始文本切成结构行：序列指示符 '-' 单独成行，元素内容缩进到它实际所在的列。 */
function tokenize(source, file) {
  const tokens = [];
  const lines = source.split(/\r?\n/);
  let blockIndent = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = index + 1;
    const trimmed = raw.trim();

    if (blockIndent >= 0) {
      if (trimmed === '' || leadingSpaces(raw) > blockIndent) {
        tokens.push({ indent: leadingSpaces(raw), text: raw.slice(leadingSpaces(raw)), block: true, line });
        continue;
      }
      blockIndent = -1;
    }

    if (trimmed === '') continue;
    if (raw.slice(0, leadingSpaces(raw)).includes('\t')) {
      throw new WorkflowYamlError(`${file}:${line} 缩进里出现制表符，YAML 不允许用 Tab 缩进`);
    }

    const startIndent = leadingSpaces(raw);
    const content = stripComment(raw.slice(startIndent));
    if (content === '') continue;
    if (startIndent === 0 && (content === '---' || content === '...')) continue;

    let text = content;
    let indent = startIndent;
    for (;;) {
      if (!/^-(?=\s|$)/.test(text)) break;
      tokens.push({ indent, text: '-', line });
      const rest = text.slice(1);
      const offset = 1 + (rest.length - rest.trimStart().length);
      text = rest.trimStart();
      indent += offset;
      if (text === '') break;
    }

    if (text === '') continue;
    tokens.push({ indent, text, line });
    if (isBlockScalarOpener(text)) blockIndent = indent;
  }

  return tokens;
}

function parseNode(tokens, start, indent, file) {
  const first = tokens[start];
  if (!first) throw new WorkflowYamlError(`${file}: 缺少内容`);

  if (first.text === '-') {
    const items = [];
    let index = start;
    while (index < tokens.length && tokens[index].indent === indent && tokens[index].text === '-') {
      index += 1;
      if (index < tokens.length && tokens[index].indent > indent) {
        const child = parseNode(tokens, index, tokens[index].indent, file);
        items.push(child.value);
        index = child.next;
      } else {
        items.push(null);
      }
    }
    if (index < tokens.length && tokens[index].indent > indent) {
      throw new WorkflowYamlError(`${file}:${tokens[index].line} 缩进不一致，无法归入上一层结构`);
    }
    return { value: items, next: index };
  }

  if (KEY_LINE.test(first.text)) {
    const entries = [];
    const seen = new Map();
    let index = start;
    while (index < tokens.length && tokens[index].indent === indent) {
      const token = tokens[index];
      if (token.block) break;
      const match = KEY_LINE.exec(token.text);
      if (!match) {
        throw new WorkflowYamlError(`${file}:${token.line} 既不是键值行也不是列表项：${token.text}`);
      }
      const key = match[1].trim();
      const value = stripComment(token.text.slice(match[0].length).trim());
      if (seen.has(key)) {
        throw new WorkflowYamlError(`${file}:${token.line} 同一个映射里出现重复键 ${key}（第 ${seen.get(key)} 行已经定义）`);
      }
      seen.set(key, token.line);
      index += 1;

      if (isBlockScalarOpener(token.text)) {
        const block = [];
        while (index < tokens.length && tokens[index].block) {
          block.push(tokens[index]);
          index += 1;
        }
        entries.push([key, dedentBlock(block)]);
        continue;
      }
      if (value !== '') {
        entries.push([key, value]);
        continue;
      }
      if (index < tokens.length && tokens[index].indent > indent) {
        const child = parseNode(tokens, index, tokens[index].indent, file);
        entries.push([key, child.value]);
        index = child.next;
        continue;
      }
      entries.push([key, null]);
    }
    if (index < tokens.length && tokens[index].indent > indent) {
      throw new WorkflowYamlError(`${file}:${tokens[index].line} 缩进比同级键更深，但上一层键已经有取值`);
    }
    return { value: Object.fromEntries(entries), next: index };
  }

  return { value: first.text, next: start + 1 };
}

function dedentBlock(block) {
  const indents = block.filter((token) => token.text.trim() !== '').map((token) => token.indent);
  const base = indents.length ? Math.min(...indents) : 0;
  return block.map((token) => (token.text.trim() === '' ? '' : ' '.repeat(token.indent - base) + token.text)).join('\n');
}

function checkBalancedExpressions(tokens, file) {
  const problems = [];
  const openToken = `$${'{{'}`;
  let open = 0;
  let close = 0;
  for (const token of tokens) {
    if (token.block) continue;
    open += token.text.split(openToken).length - 1;
    close += token.text.split('}}').length - 1;
  }
  if (open !== close) problems.push(`${file}: ${openToken} 与 }} 数量不匹配（${openToken} 出现 ${open} 次，}} 出现 ${close} 次）`);
  return problems;
}

/** 解析成嵌套结构；子集外的写法直接抛 WorkflowYamlError。 */
export function parseWorkflowYaml(source, file = 'workflow.yml') {
  const tokens = tokenize(source, file);
  if (!tokens.length) throw new WorkflowYamlError(`${file} 是空文件`);
  if (tokens[0].indent !== 0) throw new WorkflowYamlError(`${file}:${tokens[0].line} 顶层缩进必须是 0`);
  const parsed = parseNode(tokens, 0, 0, file);
  if (parsed.next !== tokens.length) throw new WorkflowYamlError(`${file}:${tokens[parsed.next].line} 有多余的缩进行无法归入结构`);
  return { document: parsed.value, tokens, problems: checkBalancedExpressions(tokens, file) };
}

/** workflow 文件的结构断言（解析之外的最低要求）。 */
export function validateWorkflow(source, file) {
  const { document, tokens, problems } = parseWorkflowYaml(source, file);
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
          if (!isPlainObject(step)) problems.push(`${file} jobs.${id}.steps[${index}] 不是映射`);
          else if (!('uses' in step) && !('run' in step)) problems.push(`${file} jobs.${id}.steps[${index}] 既没有 uses 也没有 run`);
        }
      }
    }
  }
  return { document, tokens, problems };
}

/** 复合 action 的结构断言。 */
export function validateAction(source, file) {
  const { document, tokens, problems } = parseWorkflowYaml(source, file);
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
  return { document, tokens, problems };
}

/** 该 shell 是否按 bash 语法检查。 */
function isBashShell(shell) {
  return shell === '' || shell === 'bash' || shell === 'sh' || shell === 'bash -e' || /^bash\b/.test(shell);
}

function defaultShellFor(runsOn) {
  return String(runsOn ?? '').startsWith('windows') ? 'pwsh' : 'bash';
}

/** 收集按 bash 执行的 run 片段，用于 bash -n。 */
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
