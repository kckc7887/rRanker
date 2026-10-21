import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const mobileRoot = resolve(__dirname, '..');
const requirePackage = createRequire(join(mobileRoot, 'package.json'));

describe('依赖适配的实际消费者', () => {
  it('CJS 和 ESM 入口都能解码 Unicode', async () => {
    expect(requirePackage('decode-uri-component')('%E4%B8%AD')).toBe('中');
    const esm = await import('decode-uri-component');
    expect(esm.default('%E4%B8%AD')).toBe('中');
  });

  it('query-string 处理 Unicode、重复 state 和畸形编码', () => {
    const query = requirePackage('query-string');
    expect(query.parse('name=%E4%B8%AD&state=a&state=b')).toEqual({ name: '中', state: ['a', 'b'] });
    expect(query.stringify({ state: 'a', name: '中' }, { sort: false })).toBe('state=a&name=%E4%B8%AD');
    expect(query.parse('state=%FF').state).toBe('%FF');
  });

  it('Expo Router 拼接回调查询参数和 hash', () => {
    const path = join(dirname(requirePackage.resolve('expo-router/package.json')), 'build/fork/getPathFromState-forks.js');
    const exports: { appendQueryAndHash?: (path: string, params: Record<string, string>) => string } = {};
    runInNewContext(readFileSync(path, 'utf8'), {
      exports, process,
      require(id: string) {
        if (id === 'query-string') return requirePackage(id);
        if (id === '../react-navigation/native' || id === '../matchers') return {};
        throw new Error(`未模拟的路由依赖：${id}`);
      },
    });
    expect(exports.appendQueryAndHash?.('/oauth/lxns', { state: 'safe state', '#': 'done' })).toBe('/oauth/lxns?state=safe%20state#done');
  });

});
