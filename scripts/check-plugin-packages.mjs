import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const mobile = JSON.parse(await readFile(path.join(root, 'apps/mobile/package.json'), 'utf8'));
const temporary = await mkdtemp(path.join(tmpdir(), 'rranker-consumer-'));
const artifacts = path.join(temporary, 'artifacts');
const consumer = path.join(temporary, 'consumer');
const npmCli = process.env.npm_execpath;

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' && command.endsWith('.cmd') });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const npm = (args, cwd) => npmCli
  ? run(process.execPath, [npmCli, ...args], cwd)
  : run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd);
const json = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

try {
  await mkdir(artifacts);
  await mkdir(consumer);
  const dependencies = {};
  const names = [];
  const entries = [];
  for (const workspace of manifest.workspaces.filter(value => !value.startsWith('apps/'))) {
    const directory = workspace.slice(0, -1);
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true }).filter(value => value.isDirectory())) {
      const source = path.join(root, directory, entry.name);
      const pkg = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
      const [packed] = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts], source));
      dependencies[pkg.name] = pathToFileURL(path.join(artifacts, packed.filename)).href;
      names.push(pkg.name);
      if (pkg.exports?.['.'] || typeof pkg.exports === 'string' || pkg.main) entries.push(pkg.name);
    }
  }

  for (const name of ['game', 'provider', 'tool']) {
    const directory = path.join(consumer, name);
    await mkdir(directory);
    await json(path.join(directory, 'package.json'), {
      name: `@consumer/${name}`, version: '1.0.0', type: 'module', exports: './index.ts',
    });
    dependencies[`@consumer/${name}`] = `file:./${name}`;
  }
  await writeFile(path.join(consumer, 'game/index.ts'), `
import { createElement } from 'react';
import { Text, View } from 'react-native';
import { type DataSource, type GameAdapter, type GameDataLoaderContext, type SongLibraryTarget } from '@rranker/sdk';
import { ToolDetailActions } from '@rranker/sdk/components/game-content/GameChartResultCard';
export const gameIds = ['consumer-game'] as const;
export type Payload = { kind: 'consumer-game'; score: number; source: DataSource };
export type Client = { load(signal: AbortSignal): Promise<Payload> };
export const songTarget = (songId: string): SongLibraryTarget => ({ gameId: gameIds[0], kind: 'song', id: songId, target: { songId } });
declare module '@rranker/sdk/data' { interface GamePayloads { 'consumer-game': Payload } }
export const adapter = {
  kind: 'game', id: 'consumer.game', title: 'External game',
  games: [{ id: gameIds[0], title: 'External game', icon: { uri: 'https://example.com/icon.png' },
    profile: { ratingLabel: 'Score', ratingDigits: 0, bestSections: [] } }],
  parseDetailParams: (_gameId, params) => params.songId ? params : null,
  parseLibraryTarget: target => target.gameId === gameIds[0] && target.kind === 'song' && target.target.songId === target.id
    ? songTarget(target.id) : null,
  pages: { detail: ({ params }) => createElement(View, null,
    createElement(Text, null, params.songId), createElement(ToolDetailActions, { target: songTarget(params.songId) })) },
  loadData: async (context: GameDataLoaderContext) => ({ bundle: {
    gameId: gameIds[0], providerId: context.activeProviderId, profile: context.profile,
    payload: await (context.client as Client).load(context.signal),
  } }),
  summarizeData: bundle => bundle.payload.kind === 'consumer-game' ? { scoreDisplay: String(bundle.payload.score) } : null,
} satisfies GameAdapter;
`);
  await writeFile(path.join(consumer, 'provider/index.ts'), `
import type { DataSourcePlugin } from '@rranker/sdk';
import { gameIds, type Client } from '@consumer/game';
export const provider = {
  kind: 'provider', id: 'consumer.provider', title: 'External source', providerId: 'consumer-source',
  gameIds, detail: 'Public source', icon: { uri: 'https://example.com/source.png' }, bindingKind: 'local',
  createClient: (): Client => ({ load: async signal => { signal.throwIfAborted(); return { kind: 'consumer-game', score: 42,
    source: { kind: 'consumer-source', label: 'Public source', updatedAt: new Date().toISOString(), isStale: false } }; } }),
} satisfies DataSourcePlugin;
`);
  await writeFile(path.join(consumer, 'tool/index.ts'), `
import { createElement } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { gameToolHref, type ToolPlugin } from '@rranker/sdk';
import { ChartAction } from '@rranker/sdk/components/game-content/GameChartResultCard';
import { gameIds, type Payload } from '@consumer/game';
const scoreText = (payload: Payload) => String(payload.score);
export const tool = {
  kind: 'tool', id: 'consumer.tool', title: 'External tool', gameIds,
  tools: [{ id: 'inspect', gameId: gameIds[0], pageId: 'inspect', title: 'Target', detail: '', summaryLabel: 'Target', order: 0 }],
  pages: { inspect: ({ params }) => createElement(Text, null, params.songId ?? 'No song selected') },
  detailActions: ({ target }) => {
    const href = gameToolHref(target.gameId, 'inspect', target.target);
    return href ? createElement(ChartAction, { label: 'Inspect target', onPress: () => router.push(href) }) : null;
  },
  overviewCards: ({ bundle }) => bundle.payload.kind === 'consumer-game' ? createElement(Text, null, scoreText(bundle.payload)) : null,
} satisfies ToolPlugin;
`);
  await writeFile(path.join(consumer, 'index.ts'), `
import { createElement } from 'react';
import { initializePlugins, gameToolHref, getDataSource } from '@rranker/sdk';
import { adapter } from '@consumer/game';
import { provider } from '@consumer/provider';
import { tool } from '@consumer/tool';
${entries.map((name, index) => `import * as installed${index} from '${name}';`).join('\n')}
initializePlugins([adapter, provider, tool]);
gameToolHref('consumer-game', 'inspect', { songId: 'sample' });
getDataSource('consumer-source');
export const detail = createElement(adapter.pages.detail, { gameId: 'consumer-game', params: { songId: 'sample' } });
export const installed = [${entries.map((_, index) => `installed${index}`).join(', ')}];
`);
  await json(path.join(consumer, 'package.json'), {
    name: 'plugin-consumer', version: '1.0.0', private: true, type: 'module', dependencies,
    devDependencies: {
      typescript: mobile.devDependencies.typescript,
      '@types/react': mobile.devDependencies['@types/react'],
      '@types/node': mobile.devDependencies['@types/node'],
    },
  });
  await json(path.join(consumer, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx',
      strict: true, noEmit: true, skipLibCheck: true, resolveJsonModule: true,
      allowSyntheticDefaultImports: true, lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: ['node'],
    },
    include: ['index.ts'],
  });
  npm(['install', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund'], consumer);
  const require = createRequire(path.join(consumer, 'package.json'));
  run(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', path.join(consumer, 'tsconfig.json')], consumer);
  console.log(`Compiled external game, source and tool against ${names.length} packed packages.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
