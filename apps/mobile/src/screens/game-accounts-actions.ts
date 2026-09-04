import { InteractionManager } from 'react-native';
import type { ActionNotificationInput, NotificationInput } from '@/components/AppNotification';
import type { BoundAccount } from '@/domain/bound-account';
import { providerErrorToUserMessage } from '@/providers/errors';
import { switchBoundAccount } from '@/services/switch-bound-account';

export async function attemptLabeled(
  failures: string[],
  label: string,
  action: () => Promise<unknown>,
): Promise<void> {
  try { await action(); } catch { failures.push(label); }
}

export type AccountRemovalPromptCopy = {
  lastTitle: string;
  lastMessage: (displayName: string) => string;
  lastKeepLabel: string;
  lastClearLabel: string;
  otherTitle: string;
  otherMessage: (displayName: string) => string;
  otherConfirmLabel: string;
};

export const REMOTE_UNBIND_COPY: AccountRemovalPromptCopy = {
  lastTitle: '解除最后一个账号',
  lastMessage: (displayName) => `「${displayName}」是该游戏最后一个账号。是否同时清除该游戏的收藏、练习清单和本地标签？`,
  lastKeepLabel: '确认解绑并保留个人数据',
  lastClearLabel: '解绑并清除个人数据',
  otherTitle: '解除绑定',
  otherMessage: (displayName) => `将清除「${displayName}」的本机凭据和成绩缓存。`,
  otherConfirmLabel: '确认解绑',
};

export const PHIRA_UNBIND_COPY: AccountRemovalPromptCopy = {
  lastTitle: '解除最后一个账号',
  lastMessage: (displayName) => `「${displayName}」是该游戏最后一个账号。是否同时清除该游戏的收藏和本地标签？`,
  lastKeepLabel: '确认解绑并保留个人数据',
  lastClearLabel: '解绑并清除个人数据',
  otherTitle: '解除玩家绑定',
  otherMessage: (displayName) => `将清除「${displayName}」的本机资料和成绩缓存。`,
  otherConfirmLabel: '确认解绑',
};

export const LOCAL_REMOVE_COPY: AccountRemovalPromptCopy = {
  lastTitle: '删除最后一个本地玩家',
  lastMessage: (displayName) => `「${displayName}」是该游戏最后一个账号。是否同时清除该游戏的收藏、练习清单和本地标签？`,
  lastKeepLabel: '确认删除并保留个人数据',
  lastClearLabel: '删除并清除个人数据',
  otherTitle: '删除本地玩家',
  otherMessage: (displayName) => `将删除「${displayName}」及其本机成绩，且无法恢复。`,
  otherConfirmLabel: '确认删除',
};

export const DEMO_REMOVE_COPY: AccountRemovalPromptCopy = {
  lastTitle: '删除最后一个示例账号',
  lastMessage: (displayName) => `「${displayName}」是该游戏最后一个账号。是否同时清除该游戏的收藏、练习清单和本地标签？`,
  lastKeepLabel: '确认删除并保留个人数据',
  lastClearLabel: '删除并清除个人数据',
  otherTitle: '删除示例账号',
  otherMessage: (displayName) => `将移除「${displayName}」。之后可在添加菜单中重新加入示例查分器。`,
  otherConfirmLabel: '确认删除',
};

export function promptAccountRemoval(input: {
  isLast: boolean;
  displayName: string;
  copy: AccountRemovalPromptCopy;
  onKeepPersonal: () => void;
  onClearPersonal: () => void;
  showActionNotification: (notification: ActionNotificationInput) => unknown;
}): void {
  const { copy, displayName } = input;
  if (input.isLast) {
    input.showActionNotification({
      title: copy.lastTitle,
      message: copy.lastMessage(displayName),
      variant: 'warning',
      actions: [
        { label: '取消', tone: 'cancel' },
        { label: copy.lastKeepLabel, tone: 'destructive', onPress: input.onKeepPersonal },
        { label: copy.lastClearLabel, tone: 'destructive', onPress: input.onClearPersonal },
      ],
    });
    return;
  }
  input.showActionNotification({
    title: copy.otherTitle,
    message: copy.otherMessage(displayName),
    variant: 'warning',
    actions: [
      { label: '取消', tone: 'cancel' },
      { label: copy.otherConfirmLabel, tone: 'destructive', onPress: input.onKeepPersonal },
    ],
  });
}

export function formatPublicPlayerRemovalMessage(input: {
  failures: readonly string[];
  includePersonalData: boolean;
  displayName: string;
  gameLabel: string;
}): string {
  if (input.failures.length > 0) {
    return `部分清除失败（${input.failures.join('、')}），其余项目已清除，请重试`;
  }
  return input.includePersonalData
    ? `已解除 ${input.gameLabel} 玩家「${input.displayName}」的绑定并清除个人数据`
    : `已解除 ${input.gameLabel} 玩家「${input.displayName}」的绑定；个人数据已保留`;
}

export function formatPhiraRemovalMessage(failures: readonly string[], displayName: string): string {
  return failures.length
    ? `部分清除失败（${failures.join('、')}）`
    : `已解除 Phira 玩家「${displayName}」的绑定`;
}

export async function addOrSwitchDemoAccount(input: {
  existing: BoundAccount | undefined;
  create: () => BoundAccount;
  persist: (account: BoundAccount) => Promise<void>;
  existingMessage: (account: BoundAccount) => string;
  successMessage: (account: BoundAccount) => string;
  errorFallback: string;
  afterFinally?: () => void;
  setBusy: (busy: boolean) => void;
  setPickerVisible: (visible: boolean) => void;
  setMessage: (message: string) => void;
  onSelectExisting: (account: BoundAccount) => void;
  upsertBoundAccount: (account: BoundAccount) => void;
  showNotification: (notification: NotificationInput) => unknown;
}): Promise<void> {
  input.setBusy(true);
  try {
    const existing = input.existing;
    if (existing) {
      input.setPickerVisible(false);
      InteractionManager.runAfterInteractions(() => {
        input.onSelectExisting(existing);
        input.setMessage(input.existingMessage(existing));
      });
      return;
    }
    const account = input.create();
    await input.persist(account);
    input.upsertBoundAccount(account);
    input.setPickerVisible(false);
    InteractionManager.runAfterInteractions(() => {
      void Promise.resolve(switchBoundAccount(account.id, { navigateToOverview: false }))
        .catch(() => undefined);
      input.setMessage(input.successMessage(account));
    });
  } catch (error) {
    input.showNotification({
      title: '添加失败',
      message: providerErrorToUserMessage(error, input.errorFallback),
      variant: 'error',
    });
  } finally {
    input.setBusy(false);
  }
  input.afterFinally?.();
}

export type LabeledAttempt = (label: string, action: () => Promise<unknown>) => Promise<void>;

export async function removeBoundPlayerAccount(input: {
  includePersonalData: boolean;
  displayName: string;
  clearPlayer: (attempt: LabeledAttempt) => Promise<void>;
  clearPersonalData: () => Promise<unknown>;
  removeBoundAccount: () => void;
  persistActive: () => Promise<unknown>;
  afterRemove: () => void;
  formatMessage: (failures: string[]) => string;
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
}): Promise<void> {
  input.setBusy(true);
  const failures: string[] = [];
  const attempt = (label: string, action: () => Promise<unknown>) => attemptLabeled(failures, label, action);
  await input.clearPlayer(attempt);
  if (input.includePersonalData) await attempt('个人数据', input.clearPersonalData);
  input.removeBoundAccount();
  await attempt('当前账号', input.persistActive);
  input.afterRemove();
  input.setMessage(input.formatMessage(failures));
  input.setBusy(false);
}

export async function bindOrSwitchPublicPlayer(input: {
  existing: BoundAccount | undefined;
  existingMessage: (account: BoundAccount) => string;
  onExistingBound: () => void;
  create: () => BoundAccount;
  persist: (account: BoundAccount) => Promise<void>;
  successMessage: (account: BoundAccount) => string;
  onCreated: () => void;
  upsertBoundAccount: (account: BoundAccount) => void;
  setMessage: (message: string) => void;
}): Promise<void> {
  const existing = input.existing;
  if (existing) {
    await switchBoundAccount(existing.id, { navigateToOverview: false });
    input.setMessage(input.existingMessage(existing));
    input.onExistingBound();
    return;
  }
  const account = input.create();
  await input.persist(account);
  input.upsertBoundAccount(account);
  await switchBoundAccount(account.id, { navigateToOverview: false });
  input.setMessage(input.successMessage(account));
  input.onCreated();
}
