import { buildPhigrosAvatarUrl, PHIGROS_OSS_BASE } from '@/domain/account-avatar';
import type { DataSource, Song, Chart, ChartType, CatalogSnapshot } from '@/domain/models';
import { loadChaptersTable, loadNoteCountsTable, type PhigrosChaptersTable } from '@/domain/phigros';
import type { CatalogProvider } from './contracts';
import { phigrosResources, type PhigrosRelease } from '@/services/phigros-resources';

const OSS_BASE = PHIGROS_OSS_BASE;

/** 章节映射表（手动维护，独立于游戏版本发布） */
const CHAPTERS_PATH = `${OSS_BASE}/phigros/chapters.csv`;

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
  constructor(private readonly resources = phigrosResources) {}
  private catalog: CatalogSnapshot | null = null;
  private catalogRelease: PhigrosRelease | undefined;
  private release: PhigrosRelease | undefined;
  private chaptersRaw: string | undefined;
  private chaptersTable: PhigrosChaptersTable | null = null;
  private chaptersAttempted = false;
  private chaptersSequence = 0;

  getResourceUpdatedAt(): string | null { return this.release?.fetchedAt ?? null; }

  private source(): DataSource {
    return { kind: 'generated', label: `Phigros${this.release?.current.gameVersion ?? ''}`,
      updatedAt: this.release?.fetchedAt ?? new Date().toISOString(), isStale: false };
  }

  resetCatalogCache(): void { this.catalog = null; }

  private async fetchText(url: string, signal?: AbortSignal): Promise<string> {
    return new TextDecoder().decode(await this.resources.bytes(url, signal, 12_000, 'catalog'));
  }

  /**
   * 拉取章节映射表。`check` 时带缓存绕过参数。
   * 重拉或解析失败且已有会话副本时保留上次结果；首次失败回退无章节。
   * @returns 会话中的章节表是否因此次调用而改变
   */
  private async refreshChapters(signal: AbortSignal | undefined, check: boolean): Promise<boolean> {
    const url = check
      ? `${CHAPTERS_PATH}?_check=${Date.now()}-${++this.chaptersSequence}`
      : CHAPTERS_PATH;
    let raw: string | null = null;
    try {
      raw = await this.fetchText(url, signal);
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      raw = null;
    }
    if (signal?.aborted) throw signal.reason ?? new Error('catalog load aborted');
    if (raw === null) {
      if (this.chaptersAttempted) return false;
      this.chaptersAttempted = true;
      this.chaptersRaw = undefined;
      this.chaptersTable = null;
      return true;
    }
    const table = loadChaptersTable(raw);
    if (!table) {
      if (this.chaptersAttempted) return false;
      this.chaptersAttempted = true;
      this.chaptersRaw = undefined;
      this.chaptersTable = null;
      return true;
    }
    if (this.chaptersAttempted && this.chaptersRaw === raw) return false;
    this.chaptersAttempted = true;
    this.chaptersRaw = raw;
    this.chaptersTable = table;
    return true;
  }

  async getGameVersion(signal?: AbortSignal): Promise<string> {
    this.release = await this.resources.load(signal);
    return this.release.current.gameVersion;
  }

  async getCatalog(signal?: AbortSignal, checkChapters = false): Promise<CatalogSnapshot> {
    const release = await this.resources.load(signal);
    if (!checkChapters && this.catalog && this.catalogRelease === release) return this.catalog;
    const chaptersChanged = checkChapters || !this.chaptersAttempted
      ? await this.refreshChapters(signal, checkChapters)
      : false;
    if (signal?.aborted) throw signal.reason;
    if (this.resources.peek() && this.resources.peek() !== release) return this.getCatalog(signal);
    if (this.catalog && this.catalogRelease === release && !chaptersChanged) return this.catalog;
    return this.buildCatalog(release);
  }

  private buildCatalog(release: PhigrosRelease): CatalogSnapshot {
    this.release = release;
    const chapters = this.chaptersTable;
    const catalog = release.catalog;
    const noteCounts = loadNoteCountsTable(release.noteCounts);
    const version = release.current.gameVersion;

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

    this.catalogRelease = release;
    this.catalog = {
      currentVersion: versions[0]!,
      versions,
      songs,
      chartVersionIndex,
      source: this.source(),
    };
    return this.catalog;
  }

  private illustrationBase(): string | null {
    if (!this.release?.current.gameVersion) return null;
    return `${OSS_BASE}/phigros/releases/${this.release?.current.gameVersion}/illustrations`;
  }

  getIllustrationUrl(songId: string): string | null {
    const base = this.illustrationBase();
    if (!base) return null;
    return `${base}/${encodeURIComponent(songId)}.png?v=${encodeURIComponent(this.release!.current.resourceVersion)}`;
  }

  getIllustrationBlurUrl(songId: string): string | null {
    const base = this.illustrationBase();
    if (!base) return null;
    return `${base}-blur/${encodeURIComponent(songId)}.png?v=${encodeURIComponent(this.release!.current.resourceVersion)}`;
  }

  getIllustrationLowresUrl(songId: string): string | null {
    const base = this.illustrationBase();
    if (!base) return null;
    return `${base}-lowres/${encodeURIComponent(songId)}.png?v=${encodeURIComponent(this.release!.current.resourceVersion)}`;
  }

  getAvatarUrl(avatarName: string): string | null {
    return buildPhigrosAvatarUrl(this.release?.current.gameVersion, avatarName, this.release?.current.resourceVersion);
  }
}
