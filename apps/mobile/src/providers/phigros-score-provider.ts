import { phigrosResources } from '@/services/phigros-resources';
import type { DataSource, Player, ScoreRecord } from '@/domain/models';
import type { ProviderSession, ScoreProvider } from './contracts';
import { ProviderError } from './errors';
import {
  requestDeviceCode,
  pollForToken,
  exchangeSessionToken,
  getGameSave,
  getPlayerId as getCloudPlayerId,
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
  phigrosEntryToScoreRecord,
  roundRks,
  type PhigrosB30,
  type PhigrosDifficultyTable,
  type PhigrosScoreEntry,
  type PhigrosSummary,
  type PhigrosGameProgress,
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
  resourceRevision: string;
  gameVersion: number;
  songCount: number;
  chartCount: number;
  user: PhigrosUserProfile | null;
  gameProgress: PhigrosGameProgress | null;
};

export class PhigrosScoreProvider implements ScoreProvider {
  private cacheGeneration = 0;
  private sessionToken: string;
  private playerId: string;
  private saveCache: LoadedSave | null = null;
  private b30Cache: PhigrosB30 | null = null;
  private summaryCache: PhigrosSummary | null = null;
  private saveMeta: GameSaveMeta | null = null;
  private saveLoadPromise: Promise<LoadedSave> | null = null;
  private playerNameCache: string | null = null;
  private playerNamePromise: Promise<string> | null = null;

  private async ensureSaveMeta(signal?: AbortSignal): Promise<GameSaveMeta> {
    if (this.saveMeta) return this.saveMeta;
    const generation = this.cacheGeneration;
    const meta = await getGameSave(this.sessionToken, signal);
    if (signal?.aborted) throw signal.reason;
    if (generation !== this.cacheGeneration) throw new Error('Phigros save request replaced');
    this.saveMeta = meta;
    this.summaryCache = parseSummary(meta.summaryBase64);
    return meta;
  }

  /** 云存档在 LeanCloud 上的更新时间（UI 与下载缓存穿透共用） */
  getSaveUpdatedAt(): string | null {
    return this.saveMeta?.updatedAt ?? null;
  }

  constructor(session: ProviderSession) {
    if (session.mode !== 'phi-session') {
      throw new ProviderError('authentication', 'Phigros 需要 phi-session 凭据', false);
    }
    this.sessionToken = session.sessionToken;
    this.playerId = session.playerId;
  }

  static async beginLogin(signal?: AbortSignal): Promise<DeviceCodeResult> {
    return await requestDeviceCode(signal);
  }

  static async pollLogin(
    device: DeviceCodeResult,
    signal?: AbortSignal,
  ): Promise<ProviderSession | 'pending' | 'waiting' | 'slowdown'> {
    const result = await pollForToken(device.deviceCode, device.deviceId, signal);
    if (result === 'pending' || result === 'waiting' || result === 'slowdown') return result;
    const session = await exchangeSessionToken(result, signal);
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
      if (result === 'pending' || result === 'waiting' || result === 'slowdown') continue;
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
      updatedAt: this.saveMeta?.updatedAt ?? new Date().toISOString(),
      isStale: false,
    };
  }

  async getPlayer(signal?: AbortSignal): Promise<Player> {
    const [, displayName] = await Promise.all([this.ensureSaveMeta(signal), this.getCloudPlayerName(signal)]);
    return {
      id: this.playerId,
      displayName,
      rating: roundRks(this.summaryCache!.rankingScore),
      source: this.source(),
    };
  }

  private async getCloudPlayerName(signal?: AbortSignal): Promise<string> {
    if (this.playerNameCache) return this.playerNameCache;
    if (!this.playerNamePromise) {
      this.playerNamePromise = getCloudPlayerId(this.sessionToken, signal)
        .catch(() => this.playerId)
        .finally(() => { this.playerNamePromise = null; });
    }
    this.playerNameCache = await this.playerNamePromise;
    return this.playerNameCache;
  }

  getSummary(signal?: AbortSignal): Promise<PhigrosSummary> {
    if (this.summaryCache) return Promise.resolve(this.summaryCache);
    return this.ensureSaveMeta(signal).then(() => this.summaryCache!);
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

  private async loadSaveInternal(signal?: AbortSignal): Promise<LoadedSave> {
    const { saveUrl, updatedAt } = await this.ensureSaveMeta(signal);
    const zipBuf = await downloadSave(saveUrl, updatedAt, signal);
    const { gameRecord, user, gameProgress } = await decodeSaveZip(zipBuf);

    const gameVersion = this.summaryCache?.gameVersion ?? 0;
    const release = await phigrosResources.load(signal);
    const diffTable = loadDifficultyTable(release.difficulty);
    if (signal?.aborted) throw signal.reason;
    const { songCount, chartCount } = this.countGameRecord(gameRecord);

    return { gameRecord, diffTable, resourceRevision: release.revision, gameVersion, songCount, chartCount, user, gameProgress };
  }

  private async loadSave(signal?: AbortSignal): Promise<LoadedSave> {
    if (signal?.aborted) throw signal.reason;
    if (this.saveCache) {
      const release = phigrosResources.peek();
      if (release && this.saveCache.resourceRevision !== release.revision) {
        this.saveCache = { ...this.saveCache, diffTable: loadDifficultyTable(release.difficulty), resourceRevision: release.revision };
        this.b30Cache = null;
      }
      return this.saveCache;
    }
    const generation = this.cacheGeneration;
    if (!this.saveLoadPromise) {
      const pending = this.loadSaveInternal(signal);
      this.saveLoadPromise = pending;
      void pending.finally(() => { if (this.saveLoadPromise === pending) this.saveLoadPromise = null; }).catch(() => undefined);
    }
    const loaded = await this.saveLoadPromise;
    if (signal?.aborted) throw signal.reason;
    if (generation !== this.cacheGeneration) throw new Error('Phigros save request replaced');
    this.saveCache = loaded;
    return loaded;
  }

  async getRecords(signal?: AbortSignal): Promise<ScoreRecord[]> {
    const { gameRecord, diffTable } = await this.loadSave(signal);
    return gameRecordToScoreRecords(gameRecord, diffTable);
  }

  async getUserProfile(signal?: AbortSignal): Promise<PhigrosUserProfile | null> {
    return (await this.loadSave(signal)).user;
  }

  async getGameProgress(signal?: AbortSignal): Promise<PhigrosGameProgress | null> {
    return (await this.loadSave(signal)).gameProgress;
  }

  getB30(signal?: AbortSignal): Promise<PhigrosB30> {
    const generation = this.cacheGeneration;
    return this.loadSave(signal).then(({ gameRecord, diffTable }) => {
      if (signal?.aborted) throw signal.reason;
      if (generation !== this.cacheGeneration) throw new Error('Phigros save request replaced');
      if (this.b30Cache) return this.b30Cache;
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
    this.cacheGeneration += 1;
    this.saveCache = null;
    this.b30Cache = null;
    this.summaryCache = null;
    this.saveMeta = null;
    this.saveLoadPromise = null;
  }

  /** Best30 分区：Phi3 + Best27，与 RKS 计算口径一致 */
  async getBestSections(signal?: AbortSignal): Promise<{ id: string; title: string; records: ScoreRecord[] }[]> {
    const b30 = await this.getB30(signal);
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
