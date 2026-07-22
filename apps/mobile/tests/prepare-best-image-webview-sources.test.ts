import { beforeEach, describe, expect, it, vi } from 'vitest';

const storedFiles = new Map<string, { content: string; exists: boolean }>();

vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class MockFile {
    readonly uri: string;

    constructor(base: string, name: string) {
      this.uri = `${base}/${name}`;
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
  prepareAndroidBestImageWebViewSources,
} from '@/features/best-image/prepare-best-image-webview-sources';

describe('best image WebView sources', () => {
  beforeEach(() => storedFiles.clear());

  it('keeps inline HTML sources outside the Android file workaround', () => {
    expect(inlineBestImageWebViewSources(['<p>preview</p>'])).toEqual([
      { html: '<p>preview</p>', baseUrl: 'https://assets2.lxns.net/' },
    ]);
    expect(inlineBestImageWebViewSources(['<p>preview</p>'], 'file:///cache/')).toEqual([
      { html: '<p>preview</p>', baseUrl: 'file:///cache/' },
    ]);
  });

  it('writes Android HTML pages to cache files and removes them after use', () => {
    const prepared = prepareAndroidBestImageWebViewSources(['<p>one</p>', '<p>two</p>']);
    expect(prepared.sources).toHaveLength(2);
    expect(prepared.sources.every((source) => 'uri' in source && source.uri.startsWith('file:///cache/'))).toBe(true);
    expect([...storedFiles.values()].map((file) => file.content)).toEqual(['<p>one</p>', '<p>two</p>']);

    prepared.dispose();
    expect([...storedFiles.values()].every((file) => !file.exists)).toBe(true);
  });
});
