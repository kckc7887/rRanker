import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';

const nodeRequire = createRequire(import.meta.url);
const projectRoot = process.cwd();
const zodRoot = path.dirname(nodeRequire.resolve('zod/package.json'));
type Context = { originModulePath: string; resolveRequest: Resolve };
type Resolve = (context: Context, name: string, platform: string) => { type: 'sourceFile'; filePath: string };

const resolveFile: Resolve = (context, name) => ({
  type: 'sourceFile',
  filePath: path.isAbsolute(name) ? name : name.startsWith('.')
    ? path.resolve(path.dirname(context.originModulePath), name) : nodeRequire.resolve(name),
});

function metroResolver(previous?: Resolve): Resolve {
  const module = { exports: {} };
  runInNewContext(readFileSync('metro.config.js', 'utf8'), {
    module, __dirname: projectRoot,
    require: Object.assign((name: string) => name === 'expo/metro-config'
      ? { getDefaultConfig: () => ({ resolver: { assetExts: [], resolveRequest: previous } }) }
      : nodeRequire(name), { resolve: nodeRequire.resolve }),
  });
  return (module.exports as { resolver: { resolveRequest: Resolve } }).resolver.resolveRequest;
}

describe('Metro dependency subsets', () => {
  it.each(['android', 'ios'])('redirects only the actual Zod locale indexes on %s', platform => {
    const previous = vi.fn(resolveFile), resolver = metroResolver(previous);
    const context = { originModulePath: path.join(zodRoot, 'v4/classic/external.js'), resolveRequest: resolveFile };
    for (const extension of ['js', 'cjs']) {
      expect(resolver(context, `../locales/index.${extension}`, platform).filePath).toBe(path.resolve('src/utils/zod-locales.ts'));
    }
    expect(resolver(context, '../locales/en.js', platform).filePath).toBe(path.join(zodRoot, 'v4/locales/en.js'));
    expect(resolver(context, '../core/index.js', platform).filePath).toBe(path.join(zodRoot, 'v4/core/index.js'));
    expect(resolver(context, '../locales/index.js', 'web').filePath).toBe(path.join(zodRoot, 'v4/locales/index.js'));
    const appContext = { ...context, originModulePath: path.resolve('src/utils/example.ts') };
    expect(resolver(appContext, path.join(zodRoot, 'v4/locales/index.js'), platform).filePath).toBe(path.join(zodRoot, 'v4/locales/index.js'));
    expect(previous).toHaveBeenCalled();
  });

  it('preserves the font redirect and default resolver when no prior resolver exists', () => {
    const resolver = metroResolver();
    const context = {
      originModulePath: path.resolve('node_modules/@expo/vector-icons/build/Ionicons.js'),
      resolveRequest: resolveFile,
    };
    expect(resolver(context, './vendor/react-native-vector-icons/Fonts/Ionicons.ttf', 'android').filePath).toBe(path.resolve('assets/fonts/Ionicons.ttf'));
    expect(resolver(context, './other.js', 'android').filePath).toBe(path.resolve('node_modules/@expo/vector-icons/build/other.js'));
  });

  it('keeps validation, default messages and shared ZodError identity after bundling', async () => {
    const resolver = metroResolver();
    const contents = `
      import { z, ZodError } from 'zod';
      import { ZodError as V4Error } from 'zod/v4';
      const schema = z.object({ count: z.coerce.number().int().min(0), mode: z.enum(['normal', 'extra']), tags: z.array(z.string()).default([]) });
      const valid = schema.parse({ count: '3', mode: 'normal' });
      const result = schema.safeParse({ count: -1, mode: 'bad', tags: [2] });
      export const output = { valid, issues: result.error.issues, sameError: result.error instanceof ZodError && result.error instanceof V4Error };
    `;
    async function bundle(subset: boolean) {
      const result = await build({
        stdin: { contents, resolveDir: projectRoot }, bundle: true, write: false, format: 'cjs', platform: 'node', metafile: true,
        plugins: subset ? [{ name: 'actual-metro-locale-resolution', setup(builder) {
          builder.onResolve({ filter: /locales\/index\.(?:js|cjs)$/ }, args => ({
            path: resolver({ originModulePath: args.importer, resolveRequest: resolveFile }, args.path, 'android').filePath,
          }));
        } }] : [],
      });
      const module = { exports: {} };
      runInNewContext(result.outputFiles[0].text, { module, exports: module.exports });
      return { output: (module.exports as { output: unknown }).output, inputs: Object.keys(result.metafile.inputs) };
    }
    const [original, subset] = await Promise.all([bundle(false), bundle(true)]);
    expect(subset.output).toEqual(original.output);
    expect(subset.output).toMatchObject({ sameError: true, valid: { count: 3, mode: 'normal', tags: [] } });
    expect(subset.inputs.filter(file => /zod\/v4\/locales\//.test(file))).toEqual(['node_modules/zod/v4/locales/en.js']);
  });
});
