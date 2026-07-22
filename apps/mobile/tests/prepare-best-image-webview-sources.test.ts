import { beforeEach, describe, expect, it, vi } from 'vitest';

const storedFiles = new Map<string, { content: string; exists: boolean }>();

vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class MockFile {
    readonly uri: string;

    constructor(base: string | { uri: string }, name: string) {
      this.uri = `${typeof base === 'string' ? base : base.uri}/${name}`;
    }

    get exists() {
      return storedFiles.get(this.uri)?.exists ?? false;
    }

    create() {
      storedFiles.set(this.uri, { content: '', exists: true });
    }

    write(content: string) {
      storedFiles.set(this.uri, { content, exists: true });
    }

    delete() {
      const file = storedFiles.get(this.uri);
      if (file) file.exists = false;
    }
  },
}));

import {
  inlineBestImageWebViewSources,
  prepareBestImageWebViewSources,
} from '@/features/best-image/prepare-best-image-webview-sources';

describe('best image WebView sources', () => {
  beforeEach(() => storedFiles.clear());

  it('keeps inline HTML sources outside the Android file workaround', () => {
    expect(inlineBestImageWebViewSources(['<p>preview</p>'])).toEqual([
      { html: '<p>preview</p>', baseUrl: 'https://assets2.lxns.net/' },
    ]);
  });

  it('writes cross-platform HTML pages to cache files and removes them after use', () => {
    const prepared = prepareBestImageWebViewSources(['<p>one</p>', '<p>two</p>']);
    expect(prepared.sources).toHaveLength(2);
    expect(prepared.sources.every((source) => 'uri' in source && source.uri.startsWith('file:///cache/'))).toBe(true);
    expect([...storedFiles.values()].map((file) => file.content)).toEqual(['<p>one</p>', '<p>two</p>']);

    prepared.dispose();
    expect([...storedFiles.values()].every((file) => !file.exists)).toBe(true);
  });

  it('can place HTML beside persistent Phigros fonts for WebView read access', () => {
    const directory = { uri: 'file:///document/rranker/phigros-fonts/v1' };
    const prepared = prepareBestImageWebViewSources(['<p>font preview</p>'], directory as never);
    expect(prepared.sources[0]).toEqual(expect.objectContaining({
      uri: expect.stringMatching(/^file:\/\/\/document\/rranker\/phigros-fonts\/v1\/rranker-best-image-/u),
    }));
    prepared.dispose();
  });
});
