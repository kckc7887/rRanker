import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { inspectArchitectureSources } from './lib/architecture-boundaries.mjs';

const root = resolve('src');
const games = readdirSync(resolve(root, 'components'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'game-content').map((entry) => entry.name);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? files(resolve(directory, entry.name)) : /\.tsx?$/.test(entry.name) ? [resolve(directory, entry.name)] : []);
}
const entries = files(root).map((file) => ({ path: relative(root, file).replaceAll('\\', '/'), source: readFileSync(file, 'utf8') }));
const violations = inspectArchitectureSources(entries, games);
if (violations.length) throw new Error(violations.join('\n'));
console.log(`Architecture boundaries passed (${entries.length} TypeScript files): game components/screens, shared core, domain/state/storage direction, game branches.`);
