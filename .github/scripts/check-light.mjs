#!/usr/bin/env node
/**
 * 仓库轻检查：只读仓库文件，不跑构建，也不安装 apps/mobile 的依赖树，
 * 因此可以在 quality 作业被跳过时（CI-only 改动、纯文档改动）照常运行。
 *
 * 唯一的外部依赖是 .github/scripts/package.json 固定的 YAML 解析器 yaml（零传递依赖）：
 *   cd .github/scripts && npm ci
 * 它只在 light-check 作业里安装，不涉及移动端依赖树；缺少它时轻检查直接失败，不降级、不跳过。
 *
 *   node .github/scripts/check-light.mjs                 检查当前仓库
 *   node .github/scripts/check-light.mjs --root <目录>    检查指定目录（自检用）
 *   node .github/scripts/check-light.mjs --self-test     先检查当前仓库，再用故意破坏的样例证明检查会失败
 *
 * 检查内容：
 *   1. .github/workflows 下的 workflow 文件与 .github/actions 下各 action.yml 的 YAML 语法与结构自检；
 *   2. 仓库内 .sh 脚本与 workflow/action 里内联 bash 片段的 bash -n 语法检查；
 *   3. .github 与 apps/mobile/scripts 下 .mjs / .cjs 文件的 node --check 语法检查；
 *   4. 分类器独立自检 .github/actions/changed-scope/self-test.mjs。
 *
 * 只检查扩展名明确的模块（.mjs / .cjs），不检查 .js：同一目录下的 .js 可能被当成 CommonJS 解析，
 * 会把 ESM 写法误判成语法错误。
 * 检查范围固定为仓库里的 .github 与 apps/mobile/scripts 两棵目录（CI 定义与脚本的唯一位置），
 * 不做整树遍历：本地被忽略的目录不属于仓库内容，不能影响门禁结果。
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBash } from './lib/bash.mjs';
import { WorkflowYamlError, collectBashRuns, validateAction, validateWorkflow } from './lib/workflow-yaml.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..', '..');
const CHECKED_TREES = ['.github', 'apps/mobile/scripts'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.expo', '.gradle', 'android', 'ios', 'build', 'dist', 'coverage']);

function walk(directory, prefix = '') {
  const files = [];
  for (const entry of readdirSync(prefix ? join(directory, prefix) : directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      files.push(...walk(directory, relative));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

function collectFiles(root) {
  const files = [];
  for (const tree of CHECKED_TREES) {
    const directory = join(root, tree);
    if (!existsSync(directory)) continue;
    files.push(...walk(directory).map((file) => `${tree}/${file}`));
  }
  return files;
}

function shortOutput(text) {
  return String(text ?? '').trim().split('\n').slice(0, 4).join(' / ');
}

function bashSyntaxProblem(bash, label, { file, script }) {
  const result = file
    ? spawnSync(bash, ['-n', file], { encoding: 'utf8' })
    : spawnSync(bash, ['-n'], { encoding: 'utf8', input: script });
  if (result.status === 0) return null;
  return `${label}: bash -n 报错：${shortOutput(result.stderr) || `退出码 ${result.status}`}`;
}

function nodeSyntaxProblem(label, file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status === 0) return null;
  return `${label}: node --check 报错：${shortOutput(result.stderr) || `退出码 ${result.status}`}`;
}

function runChecks(root) {
  const results = [];
  const bash = findBash();
  const files = collectFiles(root);

  const workflowFiles = files.filter((file) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file));
  const actionFiles = files.filter((file) => /^\.github\/actions\/[^/]+\/action\.ya?ml$/.test(file));
  const shellFiles = files.filter((file) => file.endsWith('.sh'));
  const nodeFiles = files
    .filter((file) => /^(\.github\/|apps\/mobile\/scripts\/)/.test(file) && /\.(mjs|cjs)$/.test(file));

  const yamlProblems = [];
  const inlineRuns = [];
  for (const file of [...workflowFiles, ...actionFiles]) {
    const source = readFileSync(join(root, file), 'utf8');
    const isWorkflow = workflowFiles.includes(file);
    try {
      const validated = isWorkflow ? validateWorkflow(source, file) : validateAction(source, file);
      yamlProblems.push(...validated.problems);
      inlineRuns.push(...collectBashRuns(validated.document, file));
    } catch (error) {
      if (!(error instanceof WorkflowYamlError)) throw error;
      yamlProblems.push(error.message);
    }
  }
  results.push({
    label: 'workflow / action YAML 结构自检',
    detail: `${workflowFiles.length} 个 workflow、${actionFiles.length} 个 action`,
    problems: yamlProblems,
  });

  const shellProblems = [];
  if (!bash) {
    shellProblems.push('找不到 bash：CI 的 ubuntu runner 自带，Windows 本地可用 Git for Windows 的 bash；不做静默跳过');
  } else {
    for (const file of shellFiles) {
      const problem = bashSyntaxProblem(bash, file, { file: join(root, file) });
      if (problem) shellProblems.push(problem);
    }
    for (const run of inlineRuns) {
      const problem = bashSyntaxProblem(bash, run.label, { script: run.script });
      if (problem) shellProblems.push(problem);
    }
  }
  results.push({
    label: 'shell 语法（bash -n）',
    detail: `${shellFiles.length} 个脚本、${inlineRuns.length} 个内联片段`,
    problems: shellProblems,
  });

  const nodeProblems = [];
  for (const file of nodeFiles) {
    const problem = nodeSyntaxProblem(file, join(root, file));
    if (problem) nodeProblems.push(problem);
  }
  results.push({ label: 'node 语法（node --check）', detail: `${nodeFiles.length} 个文件`, problems: nodeProblems });

  const selfTestProblems = [];
  if (!files.includes('.github/actions/changed-scope/self-test.mjs')) {
    selfTestProblems.push('缺少分类器独立检查入口 .github/actions/changed-scope/self-test.mjs');
  } else {
    const result = spawnSync(process.execPath, [join(root, '.github/actions/changed-scope/self-test.mjs')], { encoding: 'utf8' });
    if (result.status !== 0) {
      selfTestProblems.push(`分类器自检失败：${shortOutput(result.stderr) || shortOutput(result.stdout) || `退出码 ${result.status}`}`);
    }
  }
  results.push({
    label: '分类器独立自检',
    detail: '.github/actions/changed-scope/self-test.mjs',
    problems: selfTestProblems,
  });

  return results;
}

function report(label, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `：${detail}` : ''}`);
}

function runRepositoryCheck(root) {
  console.log(`仓库轻检查（只读仓库文件，不装 apps/mobile 依赖树、不跑构建）：${root}`);
  const results = runChecks(root);
  const problems = [];
  for (const result of results) {
    report(result.label, result.problems.length === 0, result.detail);
    problems.push(...result.problems);
  }
  if (problems.length) {
    console.error(`\n轻检查失败 ${problems.length} 项：`);
    for (const problem of problems) console.error(`- ${problem}`);
    report('仓库轻检查', false, `${problems.length} 项问题`);
    return false;
  }
  report('仓库轻检查', true, '全部通过');
  return true;
}

function copyFixture(temporaryRoot, name, mutate) {
  const directory = join(temporaryRoot, name);
  mkdirSync(directory, { recursive: true });
  cpSync(join(repositoryRoot, '.github'), join(directory, '.github'), {
    recursive: true,
    // 轻检查自己的依赖不是被检查内容，不复制进 fixture
    filter: (source) => basename(source) !== 'node_modules',
  });
  mutate(join(directory, '.github'));
  return directory;
}

function runFixtureCheck(fixtureRoot) {
  return spawnSync(process.execPath, [scriptPath, '--root', fixtureRoot], { encoding: 'utf8' });
}

const BROKEN_INLINE_WORKFLOW = `name: Broken inline shell

on:
  push:

jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - name: Broken inline script
        run: |
          if [ 1 = 2 ]; then
            echo oops
`;

const BROKEN_UNCLOSED_FLOW = `name: Unclosed flow sequence

on:
  push:

jobs:
  demo:
    runs-on: [ubuntu-latest
    steps:
      - run: echo ok
`;

const BROKEN_UNCLOSED_QUOTE = `name: "unterminated quote

on:
  push:

jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - run: echo ok
`;

const BROKEN_SAME_KEY_TWICE = `name: first definition
"name": second definition

on:
  push:

jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - run: echo ok
`;

const QUOTED_ON_WORKFLOW = `name: Quoted on key

"on": push

jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - run: echo ok
`;

const BROKEN_QUOTED_RUN = `name: Quoted run

on:
  push:

jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - run: "if true; then echo missing-fi"
`;

const BROKEN_FOLDED_RUN = `name: Folded run

on:
  push:

jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - name: Folded conditional
        run: >
          if [ 1 = 2 ]; then
          echo folded
          fi
`;

function runSelfTest() {
  console.log('\n轻检查自检：用故意破坏的样例证明检查会失败');
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'rranker-light-check-selftest-'));
  let failed = 0;

  const expectations = [
    {
      name: '未改动的 .github 副本必须通过',
      mutate: () => {},
      expectFailure: false,
      fragment: '',
    },
    {
      name: 'Tab 缩进的 workflow 必须失败',
      mutate: (github) => writeFileSync(join(github, 'workflows/zz-broken-tab.yml'), 'name: Broken tab\n\non:\n  push:\n\njobs:\n\tdemo:\n    runs-on: ubuntu-latest\n'),
      expectFailure: true,
      fragment: 'zz-broken-tab.yml',
    },
    {
      name: '重复键的 workflow 必须失败',
      mutate: (github) => writeFileSync(join(github, 'workflows/zz-broken-duplicate.yml'), 'name: Broken duplicate\nname: Broken duplicate again\n\non:\n  push:\n\njobs:\n  demo:\n    runs-on: ubuntu-latest\n'),
      expectFailure: true,
      fragment: '重复键',
    },
    {
      name: '未闭合的 flow sequence 必须失败',
      mutate: (github) => writeFileSync(join(github, 'workflows/zz-broken-flow.yml'), BROKEN_UNCLOSED_FLOW),
      expectFailure: true,
      fragment: 'zz-broken-flow.yml',
    },
    {
      name: '未闭合的引号必须失败',
      mutate: (github) => writeFileSync(join(github, 'workflows/zz-broken-quote.yml'), BROKEN_UNCLOSED_QUOTE),
      expectFailure: true,
      fragment: 'zz-broken-quote.yml',
    },
    {
      name: '同名键（引号形式与裸形式）重复出现必须失败',
      mutate: (github) => writeFileSync(join(github, 'workflows/zz-broken-same-key.yml'), BROKEN_SAME_KEY_TWICE),
      expectFailure: true,
      fragment: '重复键',
    },
    {
      name: '带引号的 on 键是合法写法，必须通过',
      mutate: (github) => writeFileSync(join(github, 'workflows/zz-quoted-on.yml'), QUOTED_ON_WORKFLOW),
      expectFailure: false,
      fragment: '',
    },
    {
      name: '双引号 run 标量必须按解码后文本检查',
      mutate: (github) => writeFileSync(join(github, 'workflows/zz-broken-quoted-run.yml'), BROKEN_QUOTED_RUN),
      expectFailure: true,
      fragment: 'bash -n',
    },
    {
      name: '折叠块标量 run 必须按解码后文本检查',
      mutate: (github) => writeFileSync(join(github, 'workflows/zz-broken-folded-run.yml'), BROKEN_FOLDED_RUN),
      expectFailure: true,
      fragment: 'bash -n',
    },
    {
      name: '没有 jobs 的 workflow 必须失败',
      mutate: (github) => writeFileSync(join(github, 'workflows/zz-broken-nojobs.yml'), 'name: Broken without jobs\n\non:\n  push:\n'),
      expectFailure: true,
      fragment: 'jobs',
    },
    {
      name: 'workflow 里内联 bash 语法错误必须失败',
      mutate: (github) => writeFileSync(join(github, 'workflows/zz-broken-inline.yml'), BROKEN_INLINE_WORKFLOW),
      expectFailure: true,
      fragment: 'bash -n',
    },
    {
      name: 'shell 脚本语法错误必须失败',
      mutate: (github) => writeFileSync(join(github, 'scripts/zz-broken.sh'), '#!/usr/bin/env bash\nif [ 1 = 2 ]; then\n  echo oops\n'),
      expectFailure: true,
      fragment: 'zz-broken.sh',
    },
    {
      name: 'node 脚本语法错误必须失败',
      mutate: (github) => writeFileSync(join(github, 'scripts/zz-broken.mjs'), 'export const broken = (\n'),
      expectFailure: true,
      fragment: 'node --check',
    },
    {
      name: '分类器逻辑出错必须失败',
      mutate: (github) => {
        const path = join(github, 'actions/changed-scope/classify.sh');
        const source = readFileSync(path, 'utf8');
        const mutated = source.replace('    docs/* | .github/* | assets/images/*) return 0 ;;', '    src/*) return 0 ;;\n    docs/* | .github/* | assets/images/*) return 0 ;;');
        if (mutated === source) throw new Error('分类器的非功能路径分支没有找到，无法构造负例');
        writeFileSync(path, mutated);
      },
      expectFailure: true,
      fragment: '分类器自检',
    },
  ];

  try {
    for (const [index, expectation] of expectations.entries()) {
      const fixtureRoot = copyFixture(temporaryRoot, `fixture-${index}`, expectation.mutate);
      const result = runFixtureCheck(fixtureRoot);
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      if (expectation.expectFailure) {
        const ok = result.status !== 0 && output.includes(expectation.fragment);
        report(`自检：${expectation.name}`, ok, ok ? '' : `退出码 ${result.status}，输出里${output.includes(expectation.fragment) ? '有' : '没有'}「${expectation.fragment}」`);
        if (!ok) failed += 1;
      } else {
        const ok = result.status === 0;
        report(`自检：${expectation.name}`, ok, ok ? '' : output.trim().split('\n').slice(-6).join(' / '));
        if (!ok) failed += 1;
      }
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  return failed === 0;
}

function parseArguments(argv) {
  const options = { root: repositoryRoot, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') {
      index += 1;
      if (!argv[index]) throw new Error('--root 需要目录参数');
      options.root = resolve(argv[index]);
    } else if (argv[index] === '--self-test') {
      options.selfTest = true;
    } else {
      throw new Error(`未知参数 ${argv[index]}`);
    }
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const repositoryOk = runRepositoryCheck(options.root);
const selfTestOk = options.selfTest ? runSelfTest() : true;
if (!repositoryOk || !selfTestOk) process.exit(1);
console.log('\n轻检查通过。');
