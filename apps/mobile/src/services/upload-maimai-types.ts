import type { BoundAccount } from '@/domain/bound-account';
import type { CatalogSnapshot, ScoreSnapshot } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import type { ScoreHubAbortSignal } from '@/services/score-hub-http';

export type UploadPhase =
  | { kind: 'idle'; }
  | { kind: 'logging_in'; message: string; authMode?: 'friend_code' | 'qr' | 'session'; }
  | { kind: 'sending_friend'; message: string; botFriendCode: string | null; }
  | { kind: 'awaiting_friend'; message: string; botFriendCode: string | null; }
  | { kind: 'fetching_scores'; message: string; }
  | { kind: 'syncing_catalog'; message: string; }
  | { kind: 'awaiting_catalog'; message: string; }
  | { kind: 'binding'; message: string; }
  | { kind: 'uploading'; message: string; providerTitle: string; }
  | { kind: 'syncing'; message: string; providerTitle: string; }
  | { kind: 'canceling'; message: string; }
  | { kind: 'done'; message: string; uploaded: number; skipped: number; }
  | { kind: 'error'; message: string; };

export type UploadResult = {
  uploaded: number;
  skipped: number;
  refreshedAccounts: { account: BoundAccount; snapshot: ScoreSnapshot; assertCurrent?: () => void; }[];
  failedAccountNames: string[];
  targetResults: UploadTargetResult[];
};

export type UploadTaskSnapshot = {
  taskId: string | null;
  status: 'idle' | 'running' | 'paused' | 'done' | 'canceled' | 'error';
  phase: UploadPhase;
  result: UploadResult | null;
};

export type BindCabinetResult = {
  friendCode: string;
  alreadyBound: boolean;
};

export type UploadTargetResult = {
  account: BoundAccount;
  status: 'success' | 'failed';
  written: number;
  skipped: number;
  errorMessage?: string;
  refreshFailed?: boolean;
};

export type UploadTarget = {
  account: BoundAccount;
  writable: boolean;
  disableReason: string | null;
};

export type UploadCommonInput = {
  selectedAccountIds: string[];
  targets: UploadTarget[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  resolveCatalog: () => Promise<CatalogSnapshot>;
  signal: ScoreHubAbortSignal;
  onPhase: (phase: UploadPhase) => void;
  onLxnsTokensRotated?: (accountId: string, update: LxnsTokenRotationUpdate) => void | Promise<unknown>;
};

