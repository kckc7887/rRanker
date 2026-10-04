import type { ComponentType } from 'react';
import { LxnsLoginPanel } from '@/components/LxnsLoginPanel';
import { DivingFishLoginPanel } from '@/components/maimai/DivingFishLoginPanel';
import { MajdataLoginPanel } from '@/components/majdata/MajdataLoginPanel';
import { OsuLoginPanel } from '@/components/osu/OsuLoginPanel';
import { PhigrosLoginPanel } from '@/components/phigros/PhigrosLoginPanel';
import { RizlineLoginPanel } from '@/components/rizline/RizlineLoginPanel';
import type { GameId, ProviderOption } from '@/domain/game-bind-options';

export interface ProviderLoginPanelProps {
  visible: boolean;
  gameId: GameId;
  gameTitle: string;
  onSuccess: () => void;
  onBusyChange: (busy: boolean) => void;
}

export type ProviderLoginPanel = ComponentType<ProviderLoginPanelProps>;

type VisiblePanelProps = {
  visible: boolean;
  onSuccess: () => void;
  onBusyChange: (busy: boolean) => void;
};

/** 固定组件身份，避免登录面板因弹层重渲染而重挂。 */
function asLoginPanel(Panel: ComponentType<VisiblePanelProps>): ProviderLoginPanel {
  function RegisteredLoginPanel({ visible, onSuccess, onBusyChange }: ProviderLoginPanelProps) {
    return <Panel visible={visible} onSuccess={onSuccess} onBusyChange={onBusyChange} />;
  }
  return RegisteredLoginPanel;
}

function LxnsPanel({ visible, gameId, gameTitle, onSuccess, onBusyChange }: ProviderLoginPanelProps) {
  return <LxnsLoginPanel visible={visible} gameId={gameId} gameTitle={gameTitle}
    onSuccess={onSuccess} onBusyChange={onBusyChange} />;
}

type ProviderLoginPanelEntry = {

  id: string;
  matches: (provider: ProviderOption) => boolean;
  panel: ProviderLoginPanel;
};

const FALLBACK_PROVIDER_LOGIN_PANEL: ProviderLoginPanelEntry = {
  id: 'credentials',
  matches: () => true,
  panel: asLoginPanel(DivingFishLoginPanel),
};

export const PROVIDER_LOGIN_PANELS: readonly ProviderLoginPanelEntry[] = [
  { id: 'rizline-official', matches: (provider) => provider.id === 'rizline-official', panel: asLoginPanel(RizlineLoginPanel) },
  { id: 'majdata-net', matches: (provider) => provider.id === 'majdata-net', panel: asLoginPanel(MajdataLoginPanel) },
  { id: 'device-code', matches: (provider) => provider.bindingKind === 'device-code', panel: asLoginPanel(PhigrosLoginPanel) },
  { id: 'osu', matches: (provider) => provider.bindingKind === 'oauth-code' && provider.id === 'osu', panel: asLoginPanel(OsuLoginPanel) },
  { id: 'lxns', matches: (provider) => provider.bindingKind === 'oauth-code', panel: LxnsPanel },
  FALLBACK_PROVIDER_LOGIN_PANEL,
];

export function resolveProviderLoginPanel(provider: ProviderOption): ProviderLoginPanel {
  const entry = PROVIDER_LOGIN_PANELS.find((candidate) => candidate.matches(provider));
  return (entry ?? FALLBACK_PROVIDER_LOGIN_PANEL).panel;
}
