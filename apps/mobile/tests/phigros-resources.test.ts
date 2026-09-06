import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhigrosResourceService, phigrosResources } from '@/services/phigros-resources';
import { loadPhigrosChartPreviewResources, loadPhigrosChartPreviewVariants } from '@/domain/phigros-chart-preview';
import { releaseFixture } from './fixtures/phigros-release';

afterEach(() => { phigrosResources.clear(); vi.unstubAllGlobals(); });

describe('Phigros release transactions', () => {
  it.each([1, 2, 3, 4, 5, 6])('loads variant %i with shared song music when no dedicated music is published', async (variantIndex) => {
    const id = 'Random.SobremSilentroom';
    const fixture = releaseFixture('r1', [id], { variants: [1, 2, 3, 4, 5, 6], variantMusic: false });
    const fetcher = vi.fn(async (input) => fixture.respond(input));
    vi.stubGlobal('fetch', fetcher);
    const result = await loadPhigrosChartPreviewResources({ songId: id, difficulty: 'EZ', variantIndex },
      new AbortController().signal);
    expect(result.bundle.chart.path).toBe(`charts/${id}.${variantIndex}/EZ.json`);
    expect(result.chart).toEqual(fixture.files[`charts/${id}.${variantIndex}/EZ.json`]);
    expect(result.bundle.music.path).toBe(`music/${id}.ogg`);
    expect(result.music).toEqual(fixture.files[`music/${id}.ogg`]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('current.json'))).toHaveLength(1);
  });

  it('still rejects a variant when neither dedicated nor shared music is published', async () => {
    const fixture = releaseFixture('r1', ['Song.A'], { variants: [1], variantMusic: false, music: false });
    vi.stubGlobal('fetch', vi.fn(async (input) => fixture.respond(input)));
    await expect(loadPhigrosChartPreviewResources({ songId: 'Song.A', difficulty: 'EZ', variantIndex: 1 },
      new AbortController().signal)).rejects.toThrow(/音乐.*0/);
  });

  it('lists numeric variants in order and loads the selected chart with its matching music', async () => {
    const fixture = releaseFixture('r1', ['Random.SobremSilentroom'], { variants: [6, 1, 3, 2, 5, 4] });
    vi.stubGlobal('fetch', vi.fn(async (input) => fixture.respond(input)));
    const target = { songId: 'Random.SobremSilentroom', difficulty: 'EZ' };
    const signal = new AbortController().signal;
    expect(await loadPhigrosChartPreviewVariants(target, signal)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const result = await loadPhigrosChartPreviewResources({ ...target, variantIndex: 6 }, signal);
    expect(result.bundle.chart.path).toBe('charts/Random.SobremSilentroom.6/EZ.json');
    expect(new TextDecoder().decode(result.music)).toBe('OggSvariant6');
    delete fixture.files['music/Random.SobremSilentroom.6.ogg'];
    await expect(loadPhigrosChartPreviewResources({ ...target, variantIndex: 6 }, signal)).rejects.toThrow();
  });

  it('rejects corrupt dedicated music even when shared music is available', async () => {
    const fixture = releaseFixture('r1', ['Song.A'], { variants: [1] });
    fixture.files['music/Song.A.1.ogg'][4] = 0;
    const fetcher = vi.fn(async (input) => fixture.respond(input));
    vi.stubGlobal('fetch', fetcher);
    await expect(loadPhigrosChartPreviewResources({ songId: 'Song.A', difficulty: 'EZ', variantIndex: 1 },
      new AbortController().signal)).rejects.toThrow('校验失败');
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/music/Song.A.ogg'))).toBe(false);
  });

  it('rechecks the pointer but reuses verified metadata for an unchanged release', async () => {
    const fixture = releaseFixture();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => fixture.respond(input));
    vi.stubGlobal('fetch', fetcher);
    const service = new PhigrosResourceService('https://example.com');
    const first = await service.load();
    fetcher.mockClear();
    expect(await service.load(undefined, true)).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toContain('_check=');
  });

  it('replaces metadata and new songs on same-game-version republication', async () => {
    let fixture = releaseFixture();
    vi.stubGlobal('fetch', vi.fn(async (input) => fixture.respond(input)));
    const service = new PhigrosResourceService('https://example.com');
    const first = await service.load();
    fixture = releaseFixture('r2', ['Song.A', 'Song.New']);
    const second = await service.load(undefined, true);
    expect(second).not.toBe(first);
    expect(second.catalog.songs).toHaveLength(2);
    expect(second.current.resourceVersion).toBe('r2');
  });

  it('rejects same-size corruption, bypasses caches once and retains the last valid release', async () => {
    let fixture = releaseFixture();
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input) => { calls.push(String(input)); return fixture.respond(input); }));
    const service = new PhigrosResourceService('https://example.com');
    const first = await service.load();
    fixture = releaseFixture('r2');
    fixture.files['catalog.json'][0] = 32;
    calls.length = 0;
    await expect(service.load(undefined, true)).rejects.toThrow('校验失败');
    expect(service.peek()).toBe(first);
    expect(calls.filter((url) => url.includes('current.json'))).toHaveLength(2);
    expect(calls.some((url) => url.includes('_retry='))).toBe(true);
  });

  it('recovers when stale asset data is replaced on the forced retry', async () => {
    const fixture = releaseFixture();
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      if (String(input).includes('catalog.json') && !String(input).includes('_retry=')) return new Response('old data');
      return fixture.respond(input);
    }));
    expect((await new PhigrosResourceService('https://example.com').load()).catalog.songs).toHaveLength(1);
  });

  it('accepts legacy pointers without a manifest hash and rejects a wrong supplied hash', async () => {
    const fixture = releaseFixture();
    delete (fixture.current as Partial<typeof fixture.current>).manifestSha256;
    vi.stubGlobal('fetch', vi.fn(async (input) => fixture.respond(input)));
    await expect(new PhigrosResourceService('https://example.com').load()).resolves.toBeDefined();
    fixture.current.manifestSha256 = '0'.repeat(64);
    await expect(new PhigrosResourceService('https://example.com').load()).rejects.toThrow('清单校验失败');
  });

  it('a cancelled waiter does not cancel another consumer of the same request', async () => {
    const fixture = releaseFixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetcher = vi.fn(async (input) => { await gate; return fixture.respond(input); });
    vi.stubGlobal('fetch', fetcher);
    const service = new PhigrosResourceService('https://example.com');
    const controller = new AbortController();
    const first = service.load(controller.signal);
    const rejection = expect(first).rejects.toThrow('cancelled');
    const second = service.load();
    controller.abort(new Error('cancelled'));
    release();
    await rejection;
    await expect(second).resolves.toBeDefined();
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('current.json'))).toHaveLength(1);
  });

  it('fully cancelled old requests cannot overwrite a newer successful release', async () => {
    const old = releaseFixture();
    const fresh = releaseFixture('r2');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let count = 0;
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      if (++count === 1) { await gate; return old.respond(input); }
      return fresh.respond(input);
    }));
    const service = new PhigrosResourceService('https://example.com');
    const controller = new AbortController();
    const cancelled = expect(service.load(controller.signal)).rejects.toThrow();
    controller.abort();
    await service.load();
    release();
    await cancelled;
    await Promise.resolve();
    expect(service.peek()?.current.resourceVersion).toBe('r2');
  });

  it('missing assets refresh once and report failure without looping', async () => {
    const fixture = releaseFixture();
    const fetcher = vi.fn(async (input) => fixture.respond(input));
    vi.stubGlobal('fetch', fetcher);
    const service = new PhigrosResourceService('https://example.com');
    await expect(service.withRelease(async (release) => service.asset(release, 'music/Missing.ogg'))).rejects.toThrow('缺失');
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('current.json'))).toHaveLength(2);
  });

  it('forces metadata recovery even when a concurrent unchanged-pointer check is in flight', async () => {
    const fixture = releaseFixture();
    const service = new PhigrosResourceService('https://example.com');
    vi.stubGlobal('fetch', vi.fn(async (input) => fixture.respond(input)));
    await service.load();
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      requests.push(String(input));
      if (requests.length === 1) await gate;
      return fixture.respond(input);
    }));
    const checking = service.load(undefined, true);
    let attempts = 0;
    const recovering = service.withRelease(async (release) => {
      if (++attempts === 1) throw new Error('corrupt bytes');
      expect(release.bypass).toBeDefined();
    });
    await Promise.resolve();
    await Promise.resolve();
    resume();
    await Promise.all([checking, recovering]);
    expect(requests.filter((url) => url.includes('current.json'))).toHaveLength(2);
    expect(requests.some((url) => url.includes('manifest.json') && url.includes('_retry='))).toBe(true);
  });

  it('preview and package readers retry a corrupt asset and return only verified bytes', async () => {
    const fixture = releaseFixture();
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input) => { requests.push(String(input)); return fixture.respond(input); }));
    let corrupt = true;
    const result = await loadPhigrosChartPreviewResources({ songId: 'Song.A', difficulty: 'EZ' },
      new AbortController().signal, async (asset) => {
        const bytes = fixture.files[asset.path];
        if (corrupt) { corrupt = false; return new Uint8Array(bytes.length); }
        return bytes;
      });
    expect(result.chart).toEqual(fixture.files['charts/Song.A.0/EZ.json']);
    expect(result.music).toEqual(fixture.files['music/Song.A.ogg']);
    expect(requests.filter((url) => url.includes('current.json'))).toHaveLength(2);
    expect(result.bundle.chart.url).toContain('_retry=');
  });

  it.each(['missing manifest entry', '404'])('keeps a usable catalog when music is unavailable: %s', async (failure) => {
    const fixture = releaseFixture('r1', ['Song.A'], { music: failure !== 'missing manifest entry' });
    if (failure === '404') delete fixture.files['music/Song.A.ogg'];
    const fetcher = vi.fn(async (input) => fixture.respond(input));
    vi.stubGlobal('fetch', fetcher);
    await expect(loadPhigrosChartPreviewResources({ songId: 'Song.A', difficulty: 'EZ' },
      new AbortController().signal)).rejects.toThrow();
    expect(phigrosResources.peek()?.catalog.songs).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('current.json'))).toHaveLength(2);
  });

  it('encodes special song IDs as object keys rather than URL queries or regex syntax', async () => {
    const id = 'A+B.[x]#?%';
    const fixture = releaseFixture('r1', [id]);
    vi.stubGlobal('fetch', vi.fn(async (input) => fixture.respond(input)));
    const result = await loadPhigrosChartPreviewResources({ songId: id, difficulty: 'EZ' }, new AbortController().signal);
    expect(new URL(result.bundle.chart.url).hash).toBe('');
    expect(decodeURIComponent(new URL(result.bundle.chart.url).pathname)).toContain(id);
    expect(result.chart).toEqual(fixture.files[`charts/${id}.0/EZ.json`]);
  });
});
