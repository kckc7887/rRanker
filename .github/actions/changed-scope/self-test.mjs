#!/usr/bin/env node
/**
 * 分类器独立检查入口：node .github/actions/changed-scope/self-test.mjs
 *
 * 在系统临时目录里建隔离 Git 仓库，逐条验证 classify.sh 的分类结果与输出不可注入性：
 * 普通代码改动、纯文档改动、改名、无基准、取不到基准、无改动、比较失败、含换行的文件名。
 * 已被忽略或无关的仓库状态不会被读取或改写。
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBash } from '../../scripts/lib/bash.mjs';

const classifyScript = join(dirname(fileURLToPath(import.meta.url)), 'classify.sh');
const bash = findBash();
if (!bash) {
  console.error('分类器自检需要 bash：CI 的 ubuntu runner 自带，Windows 本地可用 Git for Windows 的 bash。');
  process.exit(1);
}

const failures = [];
function expectEqual(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures.push(`${label}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  console.error(`  ✗ ${label}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

function expectTrue(label, condition, detail = '') {
  expectEqual(label, condition ? true : `false${detail ? `（${detail}）` : ''}`, true);
}

const scenarioRoot = mkdtempSync(join(tmpdir(), 'rranker-changed-scope-selftest-'));
process.on('exit', () => rmSync(scenarioRoot, { recursive: true, force: true }));

let scenarioIndex = 0;
function git(repo, args, input) {
  const result = spawnSync('git', ['-C', repo, ...args], { input, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} 失败：${result.stderr.trim()}`);
  }
  return result.stdout;
}

function writeFiles(repo, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(repo, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function commitAll(repo, message) {
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=ci@example.invalid', '-c', 'user.name=changed-scope-self-test', 'commit', '-q', '-m', message]);
}

function createRepo(files) {
  const repo = join(scenarioRoot, `repo-${scenarioIndex++}`);
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-q', '-b', 'main']);
  writeFiles(repo, files);
  commitAll(repo, 'base');
  return repo;
}

/** 把含换行、尖括号等路径直接写进索引：绕开文件系统限制，验证的仍是 git 写进提交里的真实路径。 */
function commitRawPaths(repo, entries, message) {
  for (const [name, content] of entries) {
    const blob = git(repo, ['hash-object', '-w', '--stdin'], content).trim();
    git(repo, ['-c', 'core.protectNTFS=false', 'update-index', '--add', '--cacheinfo', `100644,${blob},${name}`]);
  }
  git(repo, ['-c', 'user.email=ci@example.invalid', '-c', 'user.name=changed-scope-self-test', 'commit', '-q', '-m', message]);
}

function parseOutputs(text) {
  const outputs = {};
  for (const line of text.split('\n')) {
    if (!line) continue;
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    outputs[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return outputs;
}

function classify(repo, { base = '', headSha = '' } = {}) {
  const outputDirectory = mkdtempSync(join(scenarioRoot, 'out-'));
  const outputPath = join(outputDirectory, 'output.txt');
  const summaryPath = join(outputDirectory, 'summary.md');
  writeFileSync(outputPath, '');
  writeFileSync(summaryPath, '');
  const result = spawnSync(bash, [classifyScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_WORKSPACE: repo,
      GITHUB_OUTPUT: outputPath,
      GITHUB_STEP_SUMMARY: summaryPath,
      SCOPE_EVENT_NAME: 'push',
      SCOPE_PUSH_BEFORE: '',
      SCOPE_PR_BASE: '',
      SCOPE_INPUT_BASE: base,
      SCOPE_INPUT_HEAD: headSha,
    },
  });
  const outputText = readFileSync(outputPath, 'utf8');
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    outputText,
    outputs: parseOutputs(outputText),
    lines: outputText.split('\n').filter((line) => line !== ''),
    summary: readFileSync(summaryPath, 'utf8'),
  };
}

function expectVerdict(label, run, expected) {
  expectEqual(`${label}：退出码`, run.status, 0);
  expectEqual(`${label}：functional`, run.outputs.functional, expected.functional);
  expectEqual(`${label}：reason`, run.outputs.reason, expected.reason);
  expectEqual(`${label}：changed-count`, run.outputs['changed-count'], expected.count);
  expectEqual(`${label}：输出键`, Object.keys(run.outputs).join(','), 'functional,reason,changed-count');
}

console.log('changed-scope 分类器自检');

{
  const repo = createRepo({ 'README.md': '# base\n' });
  const base = git(repo, ['rev-parse', 'HEAD']).trim();
  writeFiles(repo, { 'docs/guide.md': '# guide\n' });
  commitAll(repo, 'docs');
  expectVerdict('纯文档改动', classify(repo, { base, headSha: git(repo, ['rev-parse', 'HEAD']).trim() }), {
    functional: 'false', reason: 'docs-only', count: '1',
  });
}

{
  const repo = createRepo({ 'README.md': '# base\n' });
  const base = git(repo, ['rev-parse', 'HEAD']).trim();
  writeFiles(repo, { 'src/app.ts': 'export const app = 1;\n' });
  commitAll(repo, 'code');
  expectVerdict('普通代码改动', classify(repo, { base, headSha: git(repo, ['rev-parse', 'HEAD']).trim() }), {
    functional: 'true', reason: 'functional', count: '1',
  });
}

{
  const repo = createRepo({ 'README.md': '# base\n' });
  const base = git(repo, ['rev-parse', 'HEAD']).trim();
  writeFiles(repo, { 'src/app.ts': 'export const app = 1;\n', '.github/workflows/extra.yml': 'name: Extra\n' });
  commitAll(repo, 'mixed');
  expectVerdict('代码与 CI 混合改动', classify(repo, { base, headSha: git(repo, ['rev-parse', 'HEAD']).trim() }), {
    functional: 'true', reason: 'functional', count: '2',
  });
}

{
  const repo = createRepo({ 'src/app.ts': 'export const app = 1;\n' });
  const base = git(repo, ['rev-parse', 'HEAD']).trim();
  mkdirSync(join(repo, 'docs'), { recursive: true });
  git(repo, ['mv', 'src/app.ts', 'docs/app.md']);
  commitAll(repo, 'rename into docs');
  expectVerdict('功能文件改名进文档目录', classify(repo, { base, headSha: git(repo, ['rev-parse', 'HEAD']).trim() }), {
    functional: 'true', reason: 'functional', count: '2',
  });
}

{
  const repo = createRepo({ 'README.md': '# base\n' });
  expectVerdict('拿不到比较基准', classify(repo, { base: '', headSha: git(repo, ['rev-parse', 'HEAD']).trim() }), {
    functional: 'true', reason: 'no-base', count: '0',
  });
}

{
  const repo = createRepo({ 'README.md': '# base\n' });
  expectVerdict('基准提交不在本地且取不到', classify(repo, { base: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', headSha: git(repo, ['rev-parse', 'HEAD']).trim() }), {
    functional: 'true', reason: 'base-unavailable', count: '0',
  });
}

{
  const repo = createRepo({ 'README.md': '# base\n' });
  const head = git(repo, ['rev-parse', 'HEAD']).trim();
  expectVerdict('没有改动', classify(repo, { base: head, headSha: head }), {
    functional: 'false', reason: 'no-changes', count: '0',
  });
}

{
  const repo = createRepo({ 'README.md': '# base\n' });
  const base = git(repo, ['rev-parse', 'HEAD']).trim();
  expectVerdict('比较失败', classify(repo, { base, headSha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }), {
    functional: 'true', reason: 'diff-failed', count: '0',
  });
}

{
  const repo = createRepo({ 'README.md': '# base\n' });
  const base = git(repo, ['rev-parse', 'HEAD']).trim();
  commitRawPaths(repo, [['evil\nfunctional=false', 'payload']], 'newline path');
  const run = classify(repo, { base, headSha: git(repo, ['rev-parse', 'HEAD']).trim() });
  expectVerdict('含换行的功能路径', run, { functional: 'true', reason: 'functional', count: '1' });
  expectTrue('含换行的功能路径：没有注入 functional=false', !run.lines.includes('functional=false'), run.outputText);
}

{
  const repo = createRepo({ 'README.md': '# base\n' });
  const base = git(repo, ['rev-parse', 'HEAD']).trim();
  commitRawPaths(repo, [
    ['docs/a\n::error::injected.md', 'payload'],
    ['docs/a<b>&c.md', 'payload'],
  ], 'newline and markup docs paths');
  const run = classify(repo, { base, headSha: git(repo, ['rev-parse', 'HEAD']).trim() });
  expectVerdict('含换行与标记字符的文档路径', run, { functional: 'false', reason: 'docs-only', count: '2' });
  expectTrue('含换行与标记字符的文档路径：日志里没有伪造的注解行', !run.stdout.split('\n').some((line) => line.startsWith('::')), run.stdout);
  expectTrue('含换行与标记字符的文档路径：日志里保留转义后的路径', run.stdout.includes('docs/a\\n::error::injected.md'), run.stdout);
  expectTrue('含换行与标记字符的文档路径：summary 里没有伪造的注解行', !run.summary.split('\n').some((line) => line.startsWith('::')), run.summary);
  expectTrue('含换行与标记字符的文档路径：summary 里转义后仍可读', run.summary.includes('docs/a\\n::error::injected.md'), run.summary);
  expectTrue('含换行与标记字符的文档路径：summary 对尖括号与 & 做了 HTML 转义', run.summary.includes('docs/a&lt;b&gt;&amp;c.md'), run.summary);
  expectTrue('含换行与标记字符的文档路径：summary 里没有未转义的原文', !run.summary.includes('docs/a<b>&c.md'), run.summary);
}

if (failures.length) {
  console.error(`\n分类器自检失败 ${failures.length} 项：`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('\n分类器自检通过。');
