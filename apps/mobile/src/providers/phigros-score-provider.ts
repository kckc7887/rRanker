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
} from '@/domain/phigros';

export type { DeviceCodeResult };

type LoadedSave = {
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>;
  diffTable: PhigrosDifficultyTable;
  gameVersion: number;
};

export class PhigrosScoreProvider implements ScoreProvider {
  private sessionToken: string;
  private playerId: string;
  private saveCache: LoadedSave | null = null;
  private b30Cache: PhigrosB30 | null = null;
  private summaryCache: PhigrosSummary | null = null;

  private async ensureSaveMeta(): Promise<{
    summaryBase64: string;
    saveUrl: string;
    updatedAt: string;
  }> {
    const meta = await getGameSave(this.sessionToken);
    if (!this.summaryCache) {
      this.summaryCache = parseSummary(meta.summaryBase64);
    }
    return meta;
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
      label: 'Phigros 云存档',
      updatedAt: new Date().toISOString(),
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

  private async loadDifficultyTable(gameVersion: number): Promise<string> {
    const primary = `https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/${gameVersion}/metadata/difficulty.tsv`;
    let res = await fetch(primary);
    if (!res.ok) {
      const current = await fetch(
        'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/current.json',
      ).then((r) => r.json()) as { gameVersion: number };
      res = await fetch(
        `https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/${current.gameVersion}/metadata/difficulty.tsv`,
      );
    }
    if (!res.ok) throw new ProviderError('network', '无法加载定数表', true);
    return await res.text();
  }

  private async loadSave(): Promise<LoadedSave> {
    if (this.saveCache) return this.saveCache;

    const { saveUrl } = await this.ensureSaveMeta();
    const zipBuf = await downloadSave(saveUrl);
    const { gameRecord } = await decodeSaveZip(zipBuf);

    const gameVersion = this.summaryCache?.gameVersion ?? 0;
    const diffRaw = await this.loadDifficultyTable(gameVersion);
    const diffTable = loadDifficultyTable(diffRaw);

    this.saveCache = { gameRecord, diffTable, gameVersion };
    return this.saveCache;
  }

  async getRecords(): Promise<ScoreRecord[]> {
    const { gameRecord, diffTable } = await this.loadSave();
    return gameRecordToScoreRecords(gameRecord, diffTable);
  }

  getB30(): Promise<PhigrosB30> {
    if (this.b30Cache) return Promise.resolve(this.b30Cache);
    return this.loadSave().then(({ gameRecord, diffTable }) => {
      this.b30Cache = computeB30(gameRecord, diffTable);
      return this.b30Cache;
    });
  }

  /** 丢弃内存缓存，下次拉取会重新请求云存档 */
  invalidateCache(): void {
    this.saveCache = null;
    this.b30Cache = null;
    this.summaryCache = null;
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
