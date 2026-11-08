import {
  getDataSource, getDataSources, getGameDefinition, getGameDefinitions,
  isGameAvailable, isPluginAvailable,
  type GameDefinition, type GameId, type PluginIcon, type ProviderBindingKind, type ProviderId,
} from '@rranker/sdk';

export type { GameId, ProviderId, ProviderBindingKind } from '@rranker/sdk';

export type ProviderOption = {
  id: ProviderId;
  title: string;
  detail: string;
  icon: PluginIcon;
  available: boolean;
  bindingKind: ProviderBindingKind;
};

export type GameOption = GameDefinition & {
  available: boolean;
  pendingDetail: string;
  providers: ProviderOption[];
};

export function getGameIds(): GameId[] {
  return getGameDefinitions().map(game => game.id);
}

function gameOption(game: GameDefinition): GameOption {
  const available = isGameAvailable(game.id);
  return {
    ...game,
    available,
    pendingDetail: available ? '' : '游戏适配器已停用',
    providers: getDataSources(game.id).filter(provider => !provider.hiddenInPicker).map(provider => ({
      id: provider.providerId, title: provider.title, detail: provider.detail, icon: provider.icon,
      bindingKind: provider.bindingKind, available: isPluginAvailable(provider.id, game.id),
    })),
  };
}

export function getGameOptions(): GameOption[] {
  return getGameDefinitions().map(gameOption);
}

export function isProviderForGame(gameId: GameId, providerId: ProviderId): boolean {
  return getDataSource(providerId)?.gameIds.includes(gameId) === true;
}

export function findGame(id: GameId): GameOption | undefined {
  const game = getGameDefinition(id);
  return game && gameOption(game);
}

export function canBindProvider(provider: ProviderOption, testAccountsEnabled: boolean): boolean {
  return provider.available && (provider.bindingKind !== 'fixture' || testAccountsEnabled);
}

export function findProvider(id: ProviderId): ProviderOption | undefined {
  const provider = getDataSource(id);
  return provider && {
    id, title: provider.title, detail: provider.detail, icon: provider.icon,
    bindingKind: provider.bindingKind, available: isPluginAvailable(provider.id),
  };
}

export function isCredentialProvider(id: ProviderId | null): boolean {
  const kind = id ? getDataSource(id)?.bindingKind : undefined;
  return kind === 'credentials' || kind === 'sms-code' || kind === 'oauth-code' || kind === 'device-code';
}

export function isTestProvider(id: ProviderId | null): boolean {
  return id !== null && getDataSource(id)?.bindingKind === 'fixture';
}
