import { z } from 'zod';
import type { DataSource, Song, Chart, ChartType, CatalogSnapshot } from '@/domain/models';
import type { CatalogProvider } from './contracts';
import { ProviderError } from './errors';

const OSS_BASE = 'https://rranker-phigros-data.cn-nb1.rains3.com';

const CurrentSchema = z.object({
  schemaVersion: z.number(),
  gameVersion: z.string(),
  catalog: z.string(),
  manifest: z.string(),
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
    return {
      kind: 'generated',
      label: 'Phigros OSS',
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
    const catalog = await this.fetchJson(`${OSS_BASE}/${current.catalog}`, CatalogSchema);
    const version = current.gameVersion;

    const songs: Song[] = catalog.songs.map((raw) => {
      const charts: Chart[] = raw.difficulties.map((dc, i) => ({
        songId: raw.id,
        type: CHART_TYPE,
        levelIndex: i,
        level: LEVEL_LABEL_MAP[i] ?? `LV${i}`,
        difficulty: LEVEL_INDEX_MAP[i] ?? 'unknown',
        difficultyConstant: dc,
        charter: raw.charters[i],
      }));

      return {
        id: raw.id,
        title: raw.title,
        artist: raw.composer,
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
    if (!this.gameVersion) return null;
    const safe = encodeURIComponent(avatarName);
    return `${OSS_BASE}/phigros/releases/${this.gameVersion}/avatars/${safe}.png`;
  }
}
