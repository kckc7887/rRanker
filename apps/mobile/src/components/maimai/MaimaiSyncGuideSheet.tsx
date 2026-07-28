import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BoundAccountAvatar } from '@/components/BoundAccountAvatar';
import {
  LXNS_PROXY_ADDRESS,
  LXNS_PROXY_PORT,
  LXNS_PROXY_SERVER,
  LxnsSyncGuideContent,
  LxnsSyncGuideSheet,
} from '@/components/LxnsSyncGuideSheet';
import {
  isMaimaiMaintenanceWindow,
  MAIMAI_MAINTENANCE_MESSAGE,
} from '@/domain/maimai-maintenance';
import type { BoundAccount } from '@/domain/bound-account';
import type { UploadTarget } from '@/services/upload-maimai-from-friend-code';
import { useAppTheme } from '@/theme/app-theme';

export const MAIMAI_PROXY_SERVER = LXNS_PROXY_SERVER;
export const MAIMAI_PROXY_PORT = LXNS_PROXY_PORT;
export const MAIMAI_PROXY_ADDRESS = LXNS_PROXY_ADDRESS;
export const MAIMAI_OFFLINE_SYNC_URL = 'https://maimai.lxns.net/api/v0/maimai/wechat/auth';

export function MaimaiSyncGuideSheet({
  visible,
  syncing,
  onClose,
  onSync,
}: {
  visible: boolean;
  syncing: boolean;
  onClose: () => void;
  onSync: () => Promise<boolean>;
}) {
  return (
    <LxnsSyncGuideSheet
      visible={visible}
      syncing={syncing}
      gameName="舞萌"
      shortGameName="舞萌"
      offlineSyncUrl={MAIMAI_OFFLINE_SYNC_URL}
      testID="maimai-sync-guide-root"
      isMaintenanceWindow={isMaimaiMaintenanceWindow}
      maintenanceMessage={MAIMAI_MAINTENANCE_MESSAGE}
      onClose={onClose}
      onSync={onSync}
    />
  );
}

export function MaimaiSyncGuideContent({
  syncing,
  sourceAccounts,
  targets,
  selectedSourceAccountId,
  selectedTargetAccountIds,
  onSelectSource,
  onToggleTarget,
  onClose,
  onSync,
}: {
  syncing: boolean;
  sourceAccounts?: readonly BoundAccount[];
  targets?: readonly UploadTarget[];
  selectedSourceAccountId?: string | null;
  selectedTargetAccountIds?: readonly string[];
  onSelectSource?: (accountId: string) => void;
  onToggleTarget?: (accountId: string) => void;
  onClose: () => void;
  onSync: () => Promise<boolean>;
}) {
  const hasTransferPicker = sourceAccounts !== undefined
    && targets !== undefined
    && selectedTargetAccountIds !== undefined
    && onSelectSource !== undefined
    && onToggleTarget !== undefined;
  const selectableTargets = hasTransferPicker
    ? targets.filter((target) => target.account.id !== selectedSourceAccountId)
    : [];
  const selectionReady = Boolean(
    selectedSourceAccountId
    && selectedTargetAccountIds?.some((id) => (
      selectableTargets.some((target) => target.account.id === id && target.writable)
    )),
  );

  return (
    <LxnsSyncGuideContent
      syncing={syncing}
      shortGameName="舞萌"
      offlineSyncUrl={MAIMAI_OFFLINE_SYNC_URL}
      isMaintenanceWindow={isMaimaiMaintenanceWindow}
      maintenanceMessage={MAIMAI_MAINTENANCE_MESSAGE}
      beforeSteps={hasTransferPicker ? (
        <MaimaiTransferPicker
          syncing={syncing}
          sourceAccounts={sourceAccounts}
          targets={selectableTargets}
          selectedSourceAccountId={selectedSourceAccountId ?? null}
          selectedTargetAccountIds={selectedTargetAccountIds}
          onSelectSource={onSelectSource}
          onToggleTarget={onToggleTarget}
        />
      ) : undefined}
      syncDisabled={hasTransferPicker && !selectionReady}
      syncButtonLabel={hasTransferPicker ? '同步并上传' : '同步数据'}
      syncBusyLabel={hasTransferPicker ? '传输中…' : '同步中…'}
      syncHint={hasTransferPicker
        ? (selectionReady ? '读取所选落雪账号并写入目标' : '请选择数据来源和上传目标')
        : '落雪咖啡屋'}
      onClose={onClose}
      onSync={onSync}
    />
  );
}

function MaimaiTransferPicker({
  syncing,
  sourceAccounts,
  targets,
  selectedSourceAccountId,
  selectedTargetAccountIds,
  onSelectSource,
  onToggleTarget,
}: {
  syncing: boolean;
  sourceAccounts: readonly BoundAccount[];
  targets: readonly UploadTarget[];
  selectedSourceAccountId: string | null;
  selectedTargetAccountIds: readonly string[];
  onSelectSource: (accountId: string) => void;
  onToggleTarget: (accountId: string) => void;
}) {
  const theme = useAppTheme();
  const [sourceListOpen, setSourceListOpen] = useState(false);
  const selectedSource = sourceAccounts.find((account) => account.id === selectedSourceAccountId);

  return (
    <View style={styles.picker}>
      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>数据来源</Text>
      {sourceAccounts.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>没有可用的舞萌落雪账号</Text>
          <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
            请先在游戏管理中绑定并授权一个落雪账号。
          </Text>
        </View>
      ) : (
        <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="展开数据来源列表"
            accessibilityState={{ expanded: sourceListOpen, disabled: syncing }}
            disabled={syncing}
            onPress={() => setSourceListOpen((open) => !open)}
            style={({ pressed }) => [styles.accountRow, pressed && styles.pressed]}
          >
            {selectedSource ? (
              <>
                <BoundAccountAvatar accountId={selectedSource.id} style={styles.avatar} />
                <AccountLabels account={selectedSource} />
              </>
            ) : (
              <Text style={[styles.placeholder, { color: theme.textMuted }]}>选择一个落雪账号</Text>
            )}
            <Text style={[styles.chevron, { color: theme.textMuted }]}>
              {sourceListOpen ? '收起' : '展开'}
            </Text>
          </Pressable>
          {sourceListOpen ? sourceAccounts.map((account) => {
            const selected = account.id === selectedSourceAccountId;
            return (
              <Pressable
                key={account.id}
                accessibilityRole="radio"
                accessibilityLabel={`数据来源 ${account.displayName}`}
                accessibilityState={{ selected, disabled: syncing }}
                disabled={syncing}
                onPress={() => {
                  onSelectSource(account.id);
                  setSourceListOpen(false);
                }}
                style={({ pressed }) => [
                  styles.accountRow,
                  styles.rowBorder,
                  { borderTopColor: theme.border },
                  selected && { backgroundColor: theme.surfaceMuted },
                  pressed && styles.pressed,
                ]}
              >
                <BoundAccountAvatar accountId={account.id} style={styles.avatar} />
                <AccountLabels account={account} />
                <View style={[
                  styles.radio,
                  { borderColor: selected ? theme.accent : theme.border },
                ]}>
                  {selected ? <View style={[styles.radioDot, { backgroundColor: theme.accent }]} /> : null}
                </View>
              </Pressable>
            );
          }) : null}
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>上传到</Text>
      <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {targets.length === 0 ? (
          <Text style={[styles.noTarget, { color: theme.textMuted }]}>
            暂无其它可选查分器账号
          </Text>
        ) : targets.map((target, index) => {
          const checked = selectedTargetAccountIds.includes(target.account.id);
          const disabled = syncing || !target.writable;
          return (
            <Pressable
              key={target.account.id}
              accessibilityRole="checkbox"
              accessibilityLabel={`上传到 ${target.account.displayName}（${target.account.providerTitle}）`}
              accessibilityState={{ checked, disabled }}
              disabled={disabled}
              onPress={() => onToggleTarget(target.account.id)}
              style={({ pressed }) => [
                styles.accountRow,
                index > 0 && styles.rowBorder,
                index > 0 && { borderTopColor: theme.border },
                !target.writable && styles.disabled,
                pressed && !disabled && styles.pressed,
              ]}
            >
              <View style={[
                styles.checkbox,
                { backgroundColor: theme.input, borderColor: theme.border },
                checked && target.writable && {
                  backgroundColor: theme.accent,
                  borderColor: theme.accent,
                },
              ]}>
                {checked ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <BoundAccountAvatar accountId={target.account.id} style={styles.avatar} />
              <AccountLabels account={target.account} detail={target.disableReason ?? undefined} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AccountLabels({
  account,
  detail,
}: {
  account: BoundAccount;
  detail?: string;
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.labels}>
      <Text numberOfLines={1} style={[styles.accountName, { color: theme.text }]}>
        {account.displayName}
      </Text>
      <Text numberOfLines={1} style={[styles.accountMeta, { color: theme.textMuted }]}>
        {detail ?? account.providerTitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 8 },
  sectionLabel: { marginTop: 2, fontSize: 12, fontWeight: '800' },
  listCard: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  accountRow: {
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  avatar: { width: 38, height: 38, borderRadius: 10 },
  labels: { flex: 1, minWidth: 0, gap: 2 },
  accountName: { fontSize: 14, fontWeight: '800' },
  accountMeta: { fontSize: 11, fontWeight: '600' },
  placeholder: { flex: 1, fontSize: 14, fontWeight: '700' },
  chevron: { fontSize: 12, fontWeight: '700' },
  radio: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#FFFFFF', fontSize: 14, lineHeight: 17, fontWeight: '900' },
  emptyCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  emptyTitle: { fontSize: 14, fontWeight: '800' },
  emptyHint: { fontSize: 12, lineHeight: 18 },
  noTarget: { padding: 14, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
});
