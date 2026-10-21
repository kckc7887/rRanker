import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareBestImageWebViewSources } from '@/features/best-image/prepare-best-image-webview-sources';

const files = vi.hoisted(() => new Map<string, string>());
const write = vi.hoisted(() => vi.fn(async (uri: string, content: string) => { files.set(uri, content); }));
vi.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(directory: { uri: string }, name: string) { this.uri = `${directory.uri}/${name}`; }
  },
}));
vi.mock('expo-file-system/legacy', () => ({
  makeDirectoryAsync: async () => undefined,
  writeAsStringAsync: write,
  deleteAsync: async (uri: string) => { files.delete(uri); },
}));
const directory = { uri: 'file:///document/rranker/phigros-illustration-stage/session' } as never;

describe('best image WebView source files', () => {
  beforeEach(() => { files.clear(); write.mockClear(); });

  it('writes session HTML and removes only the owned generation', async () => {
    const first = await prepareBestImageWebViewSources(['<p>one</p>', '<p>two</p>'], directory);
    const next = await prepareBestImageWebViewSources(['<p>next</p>'], directory);
    expect(first.sources.map((source) => files.get(source.uri))).toEqual(['<p>one</p>', '<p>two</p>']);
    expect(first.sources[0]!.uri.startsWith('file:///document/rranker/phigros-illustration-stage/session/')).toBe(true);
    await first.dispose();
    expect(files.size).toBe(1);
    expect(files.get(next.sources[0]!.uri)).toBe('<p>next</p>');
    await next.dispose();
    expect(files.size).toBe(0);
  });

  it('removes a partially written batch if file preparation fails', async () => {
    write.mockRejectedValueOnce(new Error('disk full'));
    await expect(prepareBestImageWebViewSources(['<p>page</p>'], directory)).rejects.toThrow('disk full');
    expect(files.size).toBe(0);
  });
});
