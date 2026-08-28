import { z } from 'zod';
import { buildPhigrosAvatarUrl, PHIGROS_OSS_BASE } from '@/domain/account-avatar';
import type { DataSource, Song, Chart, ChartType, CatalogSnapshot, PhigrosChartNotes } from '@/domain/models';
import { loadChaptersTable, loadNoteCountsTable, type PhigrosChaptersTable } from '@/domain/phigros';
import type { CatalogProvider } from './contracts';
import { ProviderError } from './errors';

const OSS_BASE = PHIGROS_OSS_BASE;

/** 章节映射表（手动维护，独立于游戏版本发布） */
const CHAPTERS_PATH = `${OSS_BASE}/phigros/chapters.csv`;

const CurrentSchema = z.object({
  schemaVersion: z.number(),
  gameVersion: z.string(),
  catalog: z.string(),
  manifest: z.string(),
  noteCounts: z.string().optional(),
});

const CatalogSongSchema = z.object({
  id: z.string(),
  title: z.string(),
  composer: z.string(),
  illustrator: z.string(),
  charters: z.array(z.string()),
  difficulties: z.array(z.number()),
});

const CatalogSchema = z.object({
  schemaVersion: z.number(),
  songCount: z.number(),
  songs: z.array(CatalogSongSchema),
});

const LEVEL_INDEX_MAP: Record<number, Chart['difficulty']> = {
  0: 'basic',
  1: 'advanced',
  2: 'expert',
  3: 'master',
};

const LEVEL_LABEL_MAP: Record<number, string> = {
  0: 'EZ',
  1: 'HD',
  2: 'IN',
  3: 'AT',
};

const CHART_TYPE: ChartType = 'SD';

export class PhigrosCatalogProvider implements CatalogProvider {
  private catalogPromise: Promise<CatalogSnapshot> | null = null;
  private gameVersion: string | null = null;
  /** 最近一次成功从 OSS 拉取游戏资源的本地时间；未拉取过为 null */
  private resourceFetchedAt: string | null = null;

  private markResourceFetched(): void {
    this.resourceFetchedAt = new Date().toISOString();
  }

  /** 最近一次成功拉取 OSS 游戏资源的时间；未拉取过则为 null */
  getResourceUpdatedAt(): string | null {
    return this.resourceFetchedAt;
  }

  private source(): DataSource {
    const version = this.gameVersion;
    return {
      kind: 'generated',
      label: version ? `Phigros${version}` : 'Phigros',
      updatedAt: this.resourceFetchedAt ?? new Date().toISOString(),
      isStale: false,
    };
  }

  private async fetchJson<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) controller.abort(signal.reason);
    else signal?.addEventListener('abort', onExternalAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) {
        throw new ProviderError('network', `OSS 请求失败 HTTP ${res.status}`, true);
      }
      const json = await res.json();
      return schema.parse(json);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof z.ZodError) {
        throw new ProviderError('upstream_schema', 'OSS 目录格式与预期不符', true, { cause: error });
      }
      throw new ProviderError('network', '无法连接 Phigros 资源服务', true, { cause: error });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private async fetchText(url: string, signal?: AbortSignal): Promise<string> {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) controller.abort(signal.reason);
    else signal?.addEventListener('abort', onExternalAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'text/plain, text/tab-separated-values, */*' },
      });
      if (!res.ok) {
        throw new ProviderError('network', `OSS 请求失败 HTTP ${res.status}`, true);
      }
      return await res.text();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('network', '无法连接 Phigros 资源服务', true, { cause: error });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private async tryLoadNoteCountsFromPath(
    path: string | undefined,
    tried: Set<string>,
    signal?: AbortSignal,
  ): Promise<Record<string, PhigrosChartNotes[]> | null> {
    if (!path || tried.has(path)) return null;
    tried.add(path);
    try {
      const raw = await this.fetchText(`${OSS_BASE}/${path}`, signal);
      const table = loadNoteCountsTable(raw);
      return Object.keys(table).length > 0 ? table : null;
    } catch {
      if (signal?.aborted) throw signal.reason ?? new Error('catalog load aborted');
      return null;
    }
  }

  /**
   * 拉取物量表：优先 current.noteCounts，其次当前版本约定路径；
   * 仍无数据时再拉一次最新 current.json 并重试。
   */
  private async loadNoteCounts(
    noteCountsPath: string | undefined,
    gameVersion: string,
    signal?: AbortSignal,
  ): Promise<Record<string, PhigrosChartNotes[]>> {
    const tried = new Set<string>();
    const versionPath = (version: string) =>
      `phigros/releases/${version}/metadata/note_counts.tsv`;

    const fromPointer = await this.tryLoadNoteCountsFromPath(noteCountsPath, tried, signal);
    if (fromPointer) return fromPointer;

    const fromVersion = await this.tryLoadNoteCountsFromPath(versionPath(gameVersion), tried, signal);
    if (fromVersion) return fromVersion;

    try {
      const fresh = await this.fetchJson(`${OSS_BASE}/phigros/current.json`, CurrentSchema, signal);
      const fromFreshPointer = await this.tryLoadNoteCountsFromPath(fresh.noteCounts, tried, signal);
      if (fromFreshPointer) return fromFreshPointer;
      const fromFreshVersion = await this.tryLoadNoteCountsFromPath(
        versionPath(fresh.gameVersion),
        tried,
        signal,
      );
      if (fromFreshVersion) return fromFreshVersion;
    } catch {
      if (signal?.aborted) throw signal.reason ?? new Error('catalog load aborted');
      // 最新 pointer 不可用时保持空表
    }

    return {};
  }

  /** 使下次 getCatalog 重新请求 OSS（React Query refetch 时调用） */
  resetCatalogCache(): void {
    this.catalogPromise = null;
  }

  /** 拉取章节映射表；失败（未发布/网络）时返回 null，调用方回退现状 */
  private async loadChapters(signal?: AbortSignal): Promise<PhigrosChaptersTable | null> {
    try {
      const raw = await this.fetchText(CHAPTERS_PATH, signal);
      return loadChaptersTable(raw);
    } catch {
      if (signal?.aborted) throw signal.reason ?? new Error('catalog load aborted');
      return null;
    }
  }

  async getGameVersion(signal?: AbortSignal): Promise<string> {
    if (this.gameVersion) return this.gameVersion;
    const current = await this.fetchJson(`${OSS_BASE}/phigros/current.json`, CurrentSchema, signal);
    if (signal?.aborted) throw signal.reason ?? new Error('catalog load aborted');
    this.gameVersion = current.gameVersion;
    this.markResourceFetched();
    return this.gameVersion;
  }

  async getCatalog(signal?: AbortSignal): Promise<CatalogSnapshot> {
    if (!this.catalogPromise) {
      this.catalogPromise = this.doGetCatalog(signal);
      void this.catalogPromise.catch(() => { this.catalogPromise = null; });
    }
    return this.catalogPromise;
  }

  private async doGetCatalog(signal?: AbortSignal): Promise<CatalogSnapshot> {
    const current = await this.fetchJson(`${OSS_BASE}/phigros/current.json`, CurrentSchema, signal);
    this.gameVersion = current.gameVersion;
    const [catalog, noteCounts, chapters] = await Promise.all([
      this.fetchJson(`${OSS_BASE}/${current.catalog}`, CatalogSchema, signal),
      this.loadNoteCounts(current.noteCounts, current.gameVersion, signal),
      this.loadChapters(signal),
    ]);
    if (signal?.aborted) throw signal.reason ?? new Error('catalog load aborted');
    this.markResourceFetched();
    const version = this.gameVersion;

    const chapterIdBySong = new Map<string, number>();
    if (chapters) {
      chapters.definitions.forEach((definition, index) => {
        chapterIdBySong.set(definition.key, index);
      });
    }

    const songs: Song[] = catalog.songs.map((raw) => {
      const songNotes = noteCounts[raw.id];
      const chapterId = chapters
        ? chapterIdBySong.get(chapters.songChapter[raw.id] ?? '')
        : undefined;
      const charts: Chart[] = raw.difficulties.map((dc, i) => ({
        songId: raw.id,
        type: CHART_TYPE,
        levelIndex: i,
        level: LEVEL_LABEL_MAP[i] ?? `LV${i}`,
        difficulty: LEVEL_INDEX_MAP[i] ?? 'unknown',
        difficultyConstant: dc,
        charter: raw.charters[i],
        notes: songNotes?.[i],
        ...(chapterId === undefined ? {} : { versionId: chapterId }),
      }));

      return {
        id: raw.id,
        title: raw.title,
        artist: raw.composer,
        illustrator: raw.illustrator,
        version: chapters
          ? (chapterId === undefined ? '' : chapters.definitions[chapterId]!.title)
          : version,
        ...(chapterId === undefined ? {} : { versionId: chapterId }),
        charts,
      };
    });

    const chartVersionIndex: Record<string, number> = {};
    if (chapters) {
      for (const song of songs) {
        const chapterId = song.versionId;
        if (chapterId !== undefined) chartVersionIndex[song.id] = chapterId;
      }
    } else {
      for (const song of songs) {
        chartVersionIndex[song.id] = 0;
      }
    }

    const versions = chapters
      ? chapters.definitions.map((definition, index) => ({ id: index, title: definition.title }))
      : [{ id: 0, title: version }];

    return {
      currentVersion: versions[0]!,
      versions,
      songs,
      chartVersionIndex,
      source: this.source(),
    };
  }

  private illustrationBase(): string | null {
    if (!this.gameVersion) return null;
    return `${OSS_BASE}/phigros/releases/${this.gameVersion}/illustrations`;
  }

  getIllustrationUrl(songId: string): string | null {
    const base = this.illustrationBase();
    if (!base) return null;
    return `${base}/${encodeURIComponent(songId)}.png`;
  }

  getIllustrationBlurUrl(songId: string): string | null {
    const base = this.illustrationBase();
    if (!base) return null;
    return `${base}-blur/${encodeURIComponent(songId)}.png`;
  }

  getIllustrationLowresUrl(songId: string): string | null {
    const base = this.illustrationBase();
    if (!base) return null;
    return `${base}-lowres/${encodeURIComponent(songId)}.png`;
  }

  getAvatarUrl(avatarName: string): string | null {
    return buildPhigrosAvatarUrl(this.gameVersion, avatarName);
  }
}
