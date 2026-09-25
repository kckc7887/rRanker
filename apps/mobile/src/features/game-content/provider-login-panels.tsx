import type { ComponentType } from 'react';
import { LxnsLoginPanel } from '@/components/LxnsLoginPanel';
import { DivingFishLoginPanel } from '@/components/maimai/DivingFishLoginPanel';
import { MajdataLoginPanel } from '@/components/majdata/MajdataLoginPanel';
import { OsuLoginPanel } from '@/components/osu/OsuLoginPanel';
import { PhigrosLoginPanel } from '@/components/phigros/PhigrosLoginPanel';
import { RizlineLoginPanel } from '@/components/rizline/RizlineLoginPanel';
import type { GameId, ProviderOption } from '@/domain/game-bind-options';

/**
 * Provider → 登录面板注册表（组合边界）。
 *
 * 共享登录弹层只负责外壳、状态与公共文案，面板按 Provider 在这里查表；
 * 新增查分器必须登记，未命中的 Provider 落到账密面板。共享组件不得重新直接引用游戏面板。
 */
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

/** 只吃弹层状态的游戏面板：包一层固定组件身份，弹层重渲染不会重挂面板。 */
function asLoginPanel(Panel: ComponentType<VisiblePanelProps>): ProviderLoginPanel {
  function RegisteredLoginPanel({ visible, onSuccess, onBusyChange }: ProviderLoginPanelProps) {
    return <Panel visible={visible} onSuccess={onSuccess} onBusyChange={onBusyChange} />;
  }
  return RegisteredLoginPanel;
}

/** 落雪面板需要游戏身份：舞萌与中二共用同一实现，游戏差异经 props 传入。 */
function LxnsPanel({ visible, gameId, gameTitle, onSuccess, onBusyChange }: ProviderLoginPanelProps) {
  return <LxnsLoginPanel visible={visible} gameId={gameId} gameTitle={gameTitle}
    onSuccess={onSuccess} onBusyChange={onBusyChange} />;
}

type ProviderLoginPanelEntry = {
  /** 登记标识：对应 Provider id、凭据能力或缺省面板。 */
  id: string;
  matches: (provider: ProviderOption) => boolean;
  panel: ProviderLoginPanel;
};

const FALLBACK_PROVIDER_LOGIN_PANEL: ProviderLoginPanelEntry = {
  id: 'credentials',
  matches: () => true,
  panel: asLoginPanel(DivingFishLoginPanel),
};

/** 按顺序命中：专属 Provider 优先于凭据能力，凭据能力优先于缺省面板。 */
export const PROVIDER_LOGIN_PANELS: readonly ProviderLoginPanelEntry[] = [
  { id: 'rizline-official', matches: (provider) => provider.id === 'rizline-official', panel: asLoginPanel(RizlineLoginPanel) },
  { id: 'majdata-net', matches: (provider) => provider.id === 'majdata-net', panel: asLoginPanel(MajdataLoginPanel) },
  { id: 'device-code', matches: (provider) => provider.bindingKind === 'device-code', panel: asLoginPanel(PhigrosLoginPanel) },
  { id: 'osu', matches: (provider) => provider.bindingKind === 'oauth-code' && provider.id === 'osu', panel: asLoginPanel(OsuLoginPanel) },
  { id: 'lxns', matches: (provider) => provider.bindingKind === 'oauth-code', panel: LxnsPanel },
  FALLBACK_PROVIDER_LOGIN_PANEL,
];

/** 登录弹层的面板解析入口。 */
export function resolveProviderLoginPanel(provider: ProviderOption): ProviderLoginPanel {
  const entry = PROVIDER_LOGIN_PANELS.find((candidate) => candidate.matches(provider));
  return (entry ?? FALLBACK_PROVIDER_LOGIN_PANEL).panel;
}
