import type { DataSource, Player, ScoreRecord } from '@/domain/models';
import type { ProviderSession, ScoreProvider } from './contracts';
import { ProviderError } from './errors';
import {
  requestDeviceCode,
  pollForToken,
  exchangeSessionToken,
  getGameSave,
  downloadSave,
  type DeviceCodeResult,
  type GameSaveMeta,
} from './phigros-auth';
import {
  parseSummary,
  decodeSaveZip,
  computeB30,
  gameRecordToScoreRecords,
  loadDifficultyTable,
  mergeDifficultyTables,
  phigrosEntryToScoreRecord,
  roundRks,
  type PhigrosB30,
  type PhigrosDifficultyTable,
  type PhigrosScoreEntry,
  type PhigrosSummary,
  type PhigrosUserProfile,
} from '@/domain/phigros';
import {
  findPushRecommendations,
  type PushRecommendationsResult,
} from '@/domain/phigros-push';

export type { DeviceCodeResult };

type LoadedSave = {
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>;
  diffTable: PhigrosDifficultyTable;
  gameVersion: number;
  songCount: number;
  chartCount: number;
  user: PhigrosUserProfile | null;
};

export class PhigrosScoreProvider implements ScoreProvider {
  private sessionToken: string;
  private playerId: string;
  private saveCache: LoadedSave | null = null;
  private b30Cache: PhigrosB30 | null = null;
  private summaryCache: PhigrosSummary | null = null;
  private saveMeta: GameSaveMeta | null = null;
  private saveLoadPromise: Promise<LoadedSave> | null = null;
  /** App 最近一次成功从 LeanCloud 拉取云存档元数据的本地时间（用于 UI） */
  private lastFetchedAt: string | null = null;

  private async ensureSaveMeta(): Promise<GameSaveMeta> {
    if (this.saveMeta) return this.saveMeta;
    const meta = await getGameSave(this.sessionToken);
    this.saveMeta = meta;
    this.summaryCache = parseSummary(meta.summaryBase64);
    this.lastFetchedAt = new Date().toISOString();
    return meta;
  }

  /** 云存档在 LeanCloud 上的更新时间（下载缓存穿透用，非 UI 同步时间） */
  getSaveUpdatedAt(): string | null {
    return this.saveMeta?.updatedAt ?? null;
  }

  /** App 最近一次成功拉取云存档的本地时间；未拉取过为 null */
  getSyncedAt(): string | null {
    return this.lastFetchedAt;
  }

  constructor(session: ProviderSession) {
    if (session.mode !== 'phi-session') {
      throw new ProviderError('authentication', 'Phigros 需要 phi-session 凭据', false);
    }
    this.sessionToken = session.sessionToken;
    this.playerId = session.playerId;
  }

  static async beginLogin(): Promise<DeviceCodeResult> {
    return await requestDeviceCode();
  }

  static async pollLogin(
    device: DeviceCodeResult,
  ): Promise<ProviderSession | 'pending' | 'waiting'> {
    const result = await pollForToken(device.deviceCode, device.deviceId);
    if (result === 'pending' || result === 'waiting') return result;
    const session = await exchangeSessionToken(result);
    return {
      mode: 'phi-session',
      sessionToken: session.sessionToken,
      playerId: session.playerId,
      persistable: true,
    };
  }

  static async login(): Promise<ProviderSession> {
    const device = await requestDeviceCode();
    const start = Date.now();
    while (Date.now() - start < device.expiresIn * 1000) {
      await new Promise((r) => setTimeout(r, device.interval * 1000));
      const result = await pollForToken(device.deviceCode, device.deviceId);
      if (result === 'pending' || result === 'waiting') continue;
      const session = await exchangeSessionToken(result);
      return {
        mode: 'phi-session',
        sessionToken: session.sessionToken,
        playerId: session.playerId,
        persistable: true,
      };
    }
    throw new ProviderError('authentication', '授权已超时，请重新登录', false);
  }

  private source(): DataSource {
    return {
      kind: 'generated',
      label: 'TapTap云存档',
      updatedAt: this.lastFetchedAt ?? new Date().toISOString(),
      isStale: false,
    };
  }

  async getPlayer(): Promise<Player> {
    await this.ensureSaveMeta();
    return {
      id: this.playerId,
      displayName: this.playerId,
      rating: roundRks(this.summaryCache!.rankingScore),
      source: this.source(),
    };
  }

  getSummary(): Promise<PhigrosSummary> {
    if (this.summaryCache) return Promise.resolve(this.summaryCache);
    return this.ensureSaveMeta().then(() => this.summaryCache!);
  }

  private async fetchDifficultyTable(gameVersion: number): Promise<string> {
    const res = await fetch(
      `https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/${gameVersion}/metadata/difficulty.tsv`,
    );
    if (!res.ok) throw new ProviderError('network', `无法加载定数表（版本 ${gameVersion}）`, true);
    return await res.text();
  }

  private async loadMergedDifficultyTable(gameVersion: number): Promise<PhigrosDifficultyTable> {
    const current = await fetch(
      'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/current.json',
    ).then((r) => r.json()) as { gameVersion: number };

    const [saveVerRaw, currentRaw] = await Promise.all([
      this.fetchDifficultyTable(gameVersion).catch(() => null),
      this.fetchDifficultyTable(current.gameVersion).catch(() => null),
    ]);

    const tables = [saveVerRaw, currentRaw]
      .filter((raw): raw is string => !!raw)
      .map(loadDifficultyTable);

    if (!tables.length) {
      throw new ProviderError('network', '无法加载定数表', true);
    }

    const [primary, ...fallbacks] = tables;
    return mergeDifficultyTables(primary!, ...fallbacks);
  }

  private countGameRecord(
    gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  ): { songCount: number; chartCount: number } {
    let chartCount = 0;
    for (const levels of Object.values(gameRecord)) {
      chartCount += levels.filter(Boolean).length;
    }
    return { songCount: Object.keys(gameRecord).length, chartCount };
  }

  private async loadSaveInternal(): Promise<LoadedSave> {
    const { saveUrl, updatedAt } = await this.ensureSaveMeta();
    const zipBuf = await downloadSave(saveUrl, updatedAt);
    const { gameRecord, user } = await decodeSaveZip(zipBuf);

    const gameVersion = this.summaryCache?.gameVersion ?? 0;
    const diffTable = await this.loadMergedDifficultyTable(gameVersion);
    const { songCount, chartCount } = this.countGameRecord(gameRecord);

    return { gameRecord, diffTable, gameVersion, songCount, chartCount, user };
  }

  private async loadSave(): Promise<LoadedSave> {
    if (this.saveCache) return this.saveCache;
    if (!this.saveLoadPromise) {
      this.saveLoadPromise = this.loadSaveInternal().finally(() => {
        this.saveLoadPromise = null;
      });
    }
    this.saveCache = await this.saveLoadPromise;
    return this.saveCache;
  }

  async getRecords(): Promise<ScoreRecord[]> {
    const { gameRecord, diffTable } = await this.loadSave();
    return gameRecordToScoreRecords(gameRecord, diffTable);
  }

  async getUserProfile(): Promise<PhigrosUserProfile | null> {
    return (await this.loadSave()).user;
  }

  getB30(): Promise<PhigrosB30> {
    if (this.b30Cache) return Promise.resolve(this.b30Cache);
    return this.loadSave().then(({ gameRecord, diffTable }) => {
      this.b30Cache = computeB30(gameRecord, diffTable);
      return this.b30Cache;
    });
  }

  /** 推分推荐：按加值与成本歌数均摊份额，返回可达谱面列表 */
  async getPushRecommendations(
    delta: number,
    songCost: number,
    includePhi = true,
  ): Promise<PushRecommendationsResult> {
    const { gameRecord, diffTable } = await this.loadSave();
    return findPushRecommendations(gameRecord, diffTable, { delta, songCost, includePhi });
  }

  /** 丢弃内存缓存，下次拉取会重新请求云存档 */
  invalidateCache(): void {
    this.saveCache = null;
    this.b30Cache = null;
    this.summaryCache = null;
    this.saveMeta = null;
    this.saveLoadPromise = null;
  }

  /** Best30 分区：Phi3 + Best27，与 RKS 计算口径一致 */
  async getBestSections(): Promise<{ id: string; title: string; records: ScoreRecord[] }[]> {
    const b30 = await this.getB30();
    return [
      { id: 'phi3', title: 'Phi3', records: b30.phi3.map(phigrosEntryToScoreRecord) },
      { id: 'b27', title: 'Best27', records: b30.best27.map(phigrosEntryToScoreRecord) },
    ];
  }

  getSummaryCache() {
    return this.summaryCache;
  }

  getPlayerId(): string {
    return this.playerId;
  }
}
