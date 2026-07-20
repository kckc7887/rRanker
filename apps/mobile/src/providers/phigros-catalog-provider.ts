import { z } from 'zod';
import { buildPhigrosAvatarUrl, PHIGROS_OSS_BASE } from '@/domain/account-avatar';
import type { DataSource, Song, Chart, ChartType, CatalogSnapshot, PhigrosChartNotes } from '@/domain/models';
import { loadNoteCountsTable } from '@/domain/phigros';
import type { CatalogProvider } from './contracts';
import { ProviderError } from './errors';

const OSS_BASE = PHIGROS_OSS_BASE;

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

  private source(): DataSource {
    const version = this.gameVersion;
    return {
      kind: 'generated',
      label: version ? `Phigros${version}` : 'Phigros',
      updatedAt: new Date().toISOString(),
      isStale: false,
    };
  }

  private async fetchJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    const controller = new AbortController();
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
    }
  }

  private async fetchText(url: string): Promise<string> {
    const controller = new AbortController();
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
    }
  }

  private async tryLoadNoteCountsFromPath(
    path: string | undefined,
    tried: Set<string>,
  ): Promise<Record<string, PhigrosChartNotes[]> | null> {
    if (!path || tried.has(path)) return null;
    tried.add(path);
    try {
      const raw = await this.fetchText(`${OSS_BASE}/${path}`);
      const table = loadNoteCountsTable(raw);
      return Object.keys(table).length > 0 ? table : null;
    } catch {
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
  ): Promise<Record<string, PhigrosChartNotes[]>> {
    const tried = new Set<string>();
    const versionPath = (version: string) =>
      `phigros/releases/${version}/metadata/note_counts.tsv`;

    const fromPointer = await this.tryLoadNoteCountsFromPath(noteCountsPath, tried);
    if (fromPointer) return fromPointer;

    const fromVersion = await this.tryLoadNoteCountsFromPath(versionPath(gameVersion), tried);
    if (fromVersion) return fromVersion;

    try {
      const fresh = await this.fetchJson(`${OSS_BASE}/phigros/current.json`, CurrentSchema);
      const fromFreshPointer = await this.tryLoadNoteCountsFromPath(fresh.noteCounts, tried);
      if (fromFreshPointer) return fromFreshPointer;
      const fromFreshVersion = await this.tryLoadNoteCountsFromPath(
        versionPath(fresh.gameVersion),
        tried,
      );
      if (fromFreshVersion) return fromFreshVersion;
    } catch {
      // 最新 pointer 不可用时保持空表
    }

    return {};
  }

  /** 使下次 getCatalog 重新请求 OSS（React Query refetch 时调用） */
  resetCatalogCache(): void {
    this.catalogPromise = null;
  }

  async getGameVersion(): Promise<string> {
    if (this.gameVersion) return this.gameVersion;
    const current = await this.fetchJson(`${OSS_BASE}/phigros/current.json`, CurrentSchema);
    this.gameVersion = current.gameVersion;
    return this.gameVersion;
  }

  async getCatalog(): Promise<CatalogSnapshot> {
    if (!this.catalogPromise) {
      this.catalogPromise = this.doGetCatalog();
      void this.catalogPromise.catch(() => { this.catalogPromise = null; });
    }
    return this.catalogPromise;
  }

  private async doGetCatalog(): Promise<CatalogSnapshot> {
    const current = await this.fetchJson(`${OSS_BASE}/phigros/current.json`, CurrentSchema);
    this.gameVersion = current.gameVersion;
    const [catalog, noteCounts] = await Promise.all([
      this.fetchJson(`${OSS_BASE}/${current.catalog}`, CatalogSchema),
      this.loadNoteCounts(current.noteCounts, current.gameVersion),
    ]);
    const version = this.gameVersion;

    const songs: Song[] = catalog.songs.map((raw) => {
      const songNotes = noteCounts[raw.id];
      const charts: Chart[] = raw.difficulties.map((dc, i) => ({
        songId: raw.id,
        type: CHART_TYPE,
        levelIndex: i,
        level: LEVEL_LABEL_MAP[i] ?? `LV${i}`,
        difficulty: LEVEL_INDEX_MAP[i] ?? 'unknown',
        difficultyConstant: dc,
        charter: raw.charters[i],
        notes: songNotes?.[i],
      }));

      return {
        id: raw.id,
        title: raw.title,
        artist: raw.composer,
        illustrator: raw.illustrator,
        version,
        charts,
      };
    });

    const chartVersionIndex: Record<string, number> = {};
    for (const song of songs) {
      chartVersionIndex[song.id] = 0;
    }

    return {
      currentVersion: { id: 0, title: version },
      versions: [{ id: 0, title: version }],
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
