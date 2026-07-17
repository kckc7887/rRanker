import type { ProviderId } from './game-bind-options';

export function shouldPersistScoreSnapshot(providerId: ProviderId | null): boolean {
  return providerId !== null && providerId !== 'maimai-test';
}

export function shouldPersistMaimaiCatalog(providerId: ProviderId | null): boolean {
  return providerId !== null;
}
