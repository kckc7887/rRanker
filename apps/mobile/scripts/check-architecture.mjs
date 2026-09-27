import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { inspectArchitectureSources, TRANSITION_EXCEPTIONS } from './lib/architecture-boundaries.mjs';

const srcRoot = resolve('src');
const appRoot = resolve('app');

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory()
    ? files(resolve(directory, entry.name))
    : /\.tsx?$/.test(entry.name) ? [resolve(directory, entry.name)] : []));
}

function entriesUnder(root, prefix = '') {
  return files(root).map((file) => ({
    path: `${prefix}${relative(root, file).replaceAll('\\', '/')}`,
    source: readFileSync(file, 'utf8'),
    root,
  }));
}

const srcEntries = entriesUnder(srcRoot);
const appEntries = entriesUnder(appRoot, 'app/');
const srcResult = inspectArchitectureSources(srcEntries, { root: srcRoot });
const appResult = inspectArchitectureSources(appEntries, { root: appRoot });
const violations = [...srcResult.violations, ...appResult.violations];
const total = srcEntries.length + appEntries.length;

if (violations.length) throw new Error(violations.join('\n'));
const hits = new Set([...srcResult.exceptionHits, ...appResult.exceptionHits]);
const exceptionCount = TRANSITION_EXCEPTIONS.filter((entry) => hits.has(`${entry.path}|${entry.rule}`)).length;
console.log(`Architecture boundaries passed (${total} TypeScript files, src + app): 模块归属登记、依赖矩阵、跨游戏隔离、共享渲染无游戏分支。`);
if (exceptionCount > 0) {
  console.log(`过渡例外生效 ${exceptionCount} 条（每条都带原因与删除条件，见 architecture-boundaries.mjs）。`);
}
for (const entry of TRANSITION_EXCEPTIONS) {
  if (hits.has(`${entry.path}|${entry.rule}`)) continue;
  console.log(`提示：例外已不再命中，可以删除：${entry.path}（${entry.rule}）`);
}
