import { InteractionManager } from 'react-native';
import type { ActionNotificationInput, NotificationInput } from '@/components/AppNotification';
import type { BoundAccount } from '@/domain/bound-account';
import { providerErrorToUserMessage } from '@/providers/errors';
import { switchBoundAccount } from '@/services/switch-bound-account';
import type { QueryClient } from '@tanstack/react-query';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';

/** Cancel only the removed account's observers; shared public catalogs remain usable. */
export async function cancelBoundAccountQueries(account: BoundAccount, client: QueryClient): Promise<void> {
  invalidateResourceWrites('account:' + account.id);
  const externalId = account.id.slice(account.id.lastIndexOf(':') + 1);
  const owned = { predicate: ({ queryKey: key }: { queryKey: readonly unknown[] }) => {
    if (key.includes(account.id)) return true;
    if (account.gameId === 'adofai') return key[0] === 'tuf' && key[1] === 'player' && String(key[2]) === externalId;
    if (account.gameId === 'musedash') return key[0] === 'musedash'
      && (key[1] === 'player' || key[1] === 'play-detail') && key[2] === externalId;
    if (account.gameId === 'phira') return key[0] === 'phira'
      && ['player', 'bests', 'best'].includes(String(key[1])) && String(key[2]) === externalId;
    return false;
  } };
  await client.cancelQueries(owned);
  client.removeQueries(owned);
}

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

/**
 * 关键提交返回的附属清理失败项；提交本身失败必须抛出，不能用返回值表达。
 * 返回值不是这个形状（例如删除接口返回被删记录）时按无附属清理失败处理。
 */
export type AccountRemovalSubmission = { cleanupFailures?: readonly string[] };

function submissionCleanupFailures(result: unknown): readonly string[] {
  if (!result || typeof result !== 'object' || !('cleanupFailures' in result)) return [];
  const failures = (result as { cleanupFailures?: unknown }).cleanupFailures;
  return Array.isArray(failures) ? failures.filter((item): item is string => typeof item === 'string') : [];
}

export type AccountRemovalAttempts = {
  /** 关键解绑提交：抛出表示尚未提交（账号与凭据保持原样）。 */
  submit: LabeledAttempt;
  /** 分项清理：失败只记录。 */
  cleanup: LabeledAttempt;
};

export type AccountRemovalOutcome =
  | { status: 'unbound'; cleanupFailures: readonly string[] }
  /** 关键解绑提交失败：账号与凭据保持原样，界面保留该账号作为重试入口。 */
  | { status: 'blocked'; reason: string };

export async function removeBoundPlayerAccount(input: {
  includePersonalData: boolean;
  displayName: string;
  prepareRemoval?: () => Promise<void>;
  /** 关键解绑提交（submit 失败即中断）与分项清理（cleanup 失败只记录）。 */
  clearPlayer: (attempts: AccountRemovalAttempts) => Promise<void>;
  clearPersonalData: () => Promise<unknown>;
  removeBoundAccount: () => void;
  persistActive: () => Promise<unknown>;
  afterRemove?: () => void;
  formatMessage: (cleanupFailures: readonly string[]) => string;
  /** 关键解绑失败时的文案；缺省按通用错误处理。 */
  formatBlockedMessage?: (error: unknown) => string;
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
  showNotification?: (notification: NotificationInput) => unknown;
}): Promise<AccountRemovalOutcome> {
  input.setBusy(true);
  const cleanupFailures: string[] = [];
  const cleanup: LabeledAttempt = (label, action) => attemptLabeled(cleanupFailures, label, action);
  // 关键提交不吞错误：落盘失败必须让账号留在界面上，由用户重试。
  // 提交已经完成后的附属清理失败（例如密码引用删除）只记录，账号按已解绑处理。
  const submit: LabeledAttempt = async (_label, action) => {
    const result = await action();
    for (const failure of submissionCleanupFailures(result)) {
      if (!cleanupFailures.includes(failure)) cleanupFailures.push(failure);
    }
  };
  try {
    await input.prepareRemoval?.();
    await input.clearPlayer({ submit, cleanup });
    if (input.includePersonalData) await cleanup('个人数据', input.clearPersonalData);
    input.removeBoundAccount();
    await cleanup('当前账号', input.persistActive);
    input.afterRemove?.();
    input.setMessage(input.formatMessage(cleanupFailures));
    return { status: 'unbound', cleanupFailures: [...cleanupFailures] };
  } catch (error) {
    const message = input.formatBlockedMessage?.(error)
      ?? providerErrorToUserMessage(error, '暂时无法移除账号，请稍后重试。');
    input.setMessage(message);
    input.showNotification?.({ title: '移除失败', message, variant: 'error' });
    return { status: 'blocked', reason: message };
  } finally {
    input.setBusy(false);
  }
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
