import type { ProviderId } from './game-bind-options';

export function canReadChunithmScores(
  providerId: ProviderId | null,
  sessionMode: string | null | undefined,
): boolean {
  return providerId === 'chunithm-test'
    || (providerId === 'lxns' && sessionMode === 'lxns-oauth');
}

export function canReadPhigrosScores(
  providerId: ProviderId | null,
  sessionMode: string | null | undefined,
): boolean {
  return providerId === 'phigros-test'
    || (providerId === 'phi-taptap' && sessionMode === 'phi-session');
}

export function shouldPersistScoreSnapshot(providerId: ProviderId | null): boolean {
  return providerId !== null
    && providerId !== 'chunithm-test'
    && providerId !== 'phi-taptap';
}

export function shouldPersistMaimaiCatalog(providerId: ProviderId | null): boolean {
  return providerId !== null;
}
