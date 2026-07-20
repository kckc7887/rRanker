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
  loadDifficultyTable,
  LEVEL_NAMES,
  type PhigrosB30,
} from '@/domain/phigros';

export type { DeviceCodeResult };

export class PhigrosScoreProvider implements ScoreProvider {
  private sessionToken: string;
  private playerId: string;
  private b30Cache: PhigrosB30 | null = null;
  private summaryCache: { avatar: string; rankingScore: number } | null = null;

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
    if (!this.summaryCache) {
      const { summaryBase64 } = await getGameSave(this.sessionToken);
      const summary = parseSummary(summaryBase64);
      this.summaryCache = {
        avatar: summary.avatar,
        rankingScore: summary.rankingScore,
      };
    }
    return {
      id: this.playerId,
      displayName: this.playerId,
      rating: Math.round(this.summaryCache.rankingScore * 100) / 100,
      source: this.source(),
    };
  }

  private async loadB30(): Promise<PhigrosB30> {
    if (this.b30Cache) return this.b30Cache;

    const { saveUrl } = await getGameSave(this.sessionToken);
    const zipBuf = await downloadSave(saveUrl);
    const { gameRecord } = await decodeSaveZip(zipBuf);

    const diffRaw = await this.loadDifficultyTable();
    const diffTable = loadDifficultyTable(diffRaw);

    this.b30Cache = computeB30(gameRecord, diffTable);
    return this.b30Cache;
  }

  private async loadDifficultyTable(): Promise<string> {
    const res = await fetch(
      'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/3.19.4/metadata/difficulty.tsv',
    );
    if (!res.ok) throw new ProviderError('network', '无法加载定数表', true);
    return await res.text();
  }

  async getRecords(): Promise<ScoreRecord[]> {
    const b30 = await this.loadB30();
    return b30.best27.map((entry) => ({
      songId: entry.songId,
      title: entry.songId,
      type: 'SD' as const,
      levelIndex: entry.level,
      level: LEVEL_NAMES[entry.level],
      difficulty: 'expert' as const,
      difficultyConstant: entry.difficulty,
      achievements: entry.acc * 100,
      dxScore: entry.score,
      rating: entry.rks,
      fc: entry.fc ? 'ap' : null,
      fs: null,
      rate: entry.score === 1000000 ? 'phi' : entry.fc ? 'fc' : entry.acc >= 96 ? 'v' : entry.acc >= 92 ? 's' : 'a',
      version: 'current',
    }));
  }

  getB30(): Promise<PhigrosB30> {
    return this.loadB30();
  }

  getSummaryCache() {
    return this.summaryCache;
  }

  getPlayerId(): string {
    return this.playerId;
  }
}
