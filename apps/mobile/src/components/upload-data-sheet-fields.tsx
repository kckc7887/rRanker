import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { BoundAccount } from '@/domain/bound-account';
import { findGame, findProvider } from '@/domain/game-bind-options';
import type { ScoreHubAccountEntry } from '@/storage/score-hub-account-store';
import {
  FRIEND_REQUEST_REFRESH_HINT,
  type UploadPhase,
  type UploadResult,
  type UploadTarget,
} from '@/services/upload-maimai-from-friend-code';
import type { AppThemeTokens } from '@/theme/app-theme';
import { uploadDataSheetStyles as styles } from '@/components/upload-data-sheet-styles';

function accountIcon(account: BoundAccount) {
  if (account.providerId) {
    return findProvider(account.providerId)?.icon ?? findGame(account.gameId)?.icon;
  }
  return findGame(account.gameId)?.icon;
}

export function UploadFriendCodeFields({
  theme,
  friendCode,
  onFriendCodeChange,
  historyVisible,
  storedAccounts,
  busy,
  prefsReady,
  onToggleHistory,
  onSelectStoredFriendCode,
  onRemoveStoredFriendCode,
  bindingLookup,
  hasCabinetBound,
  hasStoredToken,
  statsStatus,
  statsSummary,
  statsHint,
}: {
  theme: AppThemeTokens;
  friendCode: string;
  onFriendCodeChange: (value: string) => void;
  historyVisible: boolean;
  storedAccounts: readonly ScoreHubAccountEntry[];
  busy: boolean;
  prefsReady: boolean;
  onToggleHistory: () => void;
  onSelectStoredFriendCode: (friendCode: string) => void;
  onRemoveStoredFriendCode: (friendCode: string) => void;
  bindingLookup: boolean;
  hasCabinetBound: boolean;
  hasStoredToken: boolean;
  statsStatus: 'idle' | 'loading' | 'ready' | 'error';
  statsSummary: string;
  statsHint: string | null;
}) {
  return (
    <>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>好友码</Text>
          <View style={styles.friendCodeBlock}>
            <View style={styles.friendCodeRow}>
              <TextInput
                accessibilityLabel="舞萌好友码"
                value={friendCode}
                onChangeText={onFriendCodeChange}
                keyboardType="number-pad"
                maxLength={15}
                placeholder="15 位数字"
                placeholderTextColor={theme.textMuted}
                editable={!busy && prefsReady}
                style={[
                  styles.input,
                  styles.friendCodeInput,
                  { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, borderWidth: 1 },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="选择已保存的 ScoreHub 好友码"
                accessibilityState={{ expanded: historyVisible }}
                disabled={busy || !prefsReady || storedAccounts.length === 0}
                onPress={onToggleHistory}
                style={({ pressed }) => [
                  styles.historyButton,
                  { borderColor: theme.border, backgroundColor: theme.surface },
                  historyVisible && { borderColor: theme.accent },
                  (busy || !prefsReady || storedAccounts.length === 0) && styles.primaryDisabled,
                  pressed && !busy && styles.softPressed,
                ]}
              >
                <Text style={[styles.secondaryText, { color: theme.accent }]}>
                  {historyVisible ? '收起' : '历史'}
                </Text>
              </Pressable>
            </View>
            {historyVisible && storedAccounts.length > 0 ? (
              <View
                accessibilityLabel="ScoreHub 好友码历史列表"
                style={[styles.historyDropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                {storedAccounts.map((entry, index) => (
                  <View
                    key={entry.friendCode}
                    style={[
                      styles.historyRow,
                      index > 0 && [styles.historyRowBorder, { borderTopColor: theme.border }],
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`选择好友码 ${entry.friendCode}`}
                      disabled={busy}
                      onPress={() => void onSelectStoredFriendCode(entry.friendCode)}
                      style={({ pressed }) => [styles.historySelect, pressed && !busy && styles.softPressed]}
                    >
                      <Text style={[styles.historyCode, { color: theme.text }]}>{entry.friendCode}</Text>
                      <Text style={[styles.historyMeta, { color: theme.textMuted }]}>
                        {entry.hasCabinetBound ? '可直接获取成绩' : '需要确认好友码'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`删除好友码 ${entry.friendCode}`}
                      disabled={busy}
                      hitSlop={8}
                      onPress={() => void onRemoveStoredFriendCode(entry.friendCode)}
                      style={({ pressed }) => [
                        styles.historyDelete,
                        pressed && !busy && styles.softPressed,
                      ]}
                    >
                      <Text style={[styles.historyDeleteText, { color: theme.danger }]}>删除</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            经 Score Hub 相关服务取成绩后，上传到下方勾选的查分器。
          </Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>{FRIEND_REQUEST_REFRESH_HINT}</Text>
          {bindingLookup ? (
            <Text style={[styles.hint, { color: theme.textMuted }]}>正在检查账号信息…</Text>
          ) : hasCabinetBound ? (
            <Text accessibilityLabel="已保存舞萌账号" style={[styles.hint, { color: theme.success }]}>
              已保存此账号。好友码上传会优先直接获取成绩，登录失效时再重新确认好友码。
            </Text>
          ) : hasStoredToken ? (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              已保存此账号。开始上传时会继续确认好友码。
            </Text>
          ) : (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              完成一次上传后会保存此好友码，之后可以更快获取成绩。
            </Text>
          )}

          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>服务状态</Text>
          <View style={[styles.statusBox, { backgroundColor: theme.surface, marginTop: 0 }]}>
            {statsStatus === 'loading' ? (
              <ActivityIndicator color={theme.accent} style={styles.statusSpinner} />
            ) : null}
            <Text accessibilityLabel="score-hub 近一小时统计" style={[styles.statusText, { color: theme.textSecondary }]}>
              {statsSummary}
            </Text>
            {statsHint ? (
              <Text accessibilityLabel="score-hub 成功率提示" style={[styles.statusBot, { color: theme.textMuted }]}>
                {statsHint}
              </Text>
            ) : null}
          </View>
    </>
  );
}

export function UploadQrFields({
  theme,
  bindQrText,
  onBindQrTextChange,
  busy,
  prefsReady,
  decodingQr,
  onPasteQrText,
  onPickQrImage,
}: {
  theme: AppThemeTokens;
  bindQrText: string;
  onBindQrTextChange: (value: string) => void;
  busy: boolean;
  prefsReady: boolean;
  decodingQr: boolean;
  onPasteQrText: () => void;
  onPickQrImage: () => void;
}) {
  return (
    <>
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>玩家二维码</Text>
              <Text style={[styles.hint, { color: theme.textMuted }]}>舞萌-中二公众号 → 玩家二维码</Text>
              <Text style={[styles.hint, { color: theme.textMuted }]}>粘贴二维码内容或从相册选择二维码图片，即可同步最新成绩。</Text>
              <TextInput
                accessibilityLabel="玩家二维码字符串"
                value={bindQrText}
                onChangeText={onBindQrTextChange}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                contextMenuHidden={false}
                multiline
                placeholder="粘贴 SGWCMAID… 字符串"
                placeholderTextColor={theme.textMuted}
                editable={!busy && prefsReady}
                style={[
                  styles.input,
                  styles.qrInput,
                  {
                    backgroundColor: theme.input,
                    borderColor: theme.border,
                    color: theme.text,
                    borderWidth: 1,
                  },
                ]}
              />
              <View style={styles.qrActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="粘贴玩家二维码字符串"
                  disabled={busy || !prefsReady}
                  onPress={() => void onPasteQrText()}
                  style={({ pressed }) => [
                    styles.secondary,
                    { borderColor: theme.border, backgroundColor: theme.surface },
                    (busy || !prefsReady) && styles.primaryDisabled,
                    pressed && !busy && styles.softPressed,
                  ]}
                >
                  <Text style={[styles.secondaryText, { color: theme.accent }]}>粘贴</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="从相册选择玩家二维码图片"
                  disabled={busy || !prefsReady}
                  onPress={() => void onPickQrImage()}
                  style={({ pressed }) => [
                    styles.secondary,
                    { borderColor: theme.border, backgroundColor: theme.surface },
                    (busy || !prefsReady) && styles.primaryDisabled,
                    pressed && !busy && styles.softPressed,
                  ]}
                >
                  {decodingQr ? (
                    <ActivityIndicator color={theme.accent} />
                  ) : (
                    <Text style={[styles.secondaryText, { color: theme.accent }]}>从相册选择</Text>
                  )}
                </Pressable>
              </View>
    </>
  );
}

export function UploadTargetList({
  theme,
  targets,
  selectedIds,
  busy,
  onToggleAccount,
}: {
  theme: AppThemeTokens;
  targets: readonly UploadTarget[];
  selectedIds: readonly string[];
  busy: boolean;
  onToggleAccount: (accountId: string, writable: boolean) => void;
}) {
  return (
    <>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>上传到</Text>
          <View style={[styles.listCard, { backgroundColor: theme.surface }]}>
            {targets.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>当前游戏没有已绑定查分器</Text>
            ) : (
              targets.map((target, index) => {
                const checked = selectedIds.includes(target.account.id);
                const icon = accountIcon(target.account);
                return (
                  <Pressable
                    key={target.account.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`上传到 ${target.account.displayName}（${target.account.providerTitle}）`}
                    accessibilityState={{ checked, disabled: !target.writable || busy }}
                    disabled={!target.writable || busy}
                    onPress={() => onToggleAccount(target.account.id, target.writable)}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && [styles.rowBorder, { borderTopColor: theme.border }],
                      pressed && target.writable && styles.softPressed,
                      !target.writable && styles.rowDisabled,
                    ]}
                  >
                    <View style={[
                      styles.box,
                      { borderColor: theme.border, backgroundColor: theme.input },
                      checked && target.writable && { backgroundColor: theme.accent, borderColor: theme.accent },
                    ]}
                    >
                      {checked && target.writable ? <Text style={styles.boxMark}>✓</Text> : null}
                    </View>
                    {icon ? <Image source={icon} style={styles.icon} /> : (
                      <View style={[styles.iconPlaceholder, { backgroundColor: theme.surfaceMuted }]} />
                    )}
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: theme.text }]}>{target.account.displayName}</Text>
                      <Text style={[styles.rowSub, { color: theme.textMuted }]}>{target.account.providerTitle}</Text>
                      {target.disableReason ? (
                        <Text style={[styles.rowWarn, { color: theme.warning }]}>{target.disableReason}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
    </>
  );
}

export function UploadProgressStatus({
  theme,
  running,
  phase,
  statusText,
  botHint,
}: {
  theme: AppThemeTokens;
  running: boolean;
  phase: UploadPhase;
  statusText: string;
  botHint: string | null;
}) {
  if (!statusText) return null;
  return (
            <View style={[styles.statusBox, { backgroundColor: theme.surface }]}>
              {running && phase.kind !== 'awaiting_catalog' ? (
                <ActivityIndicator color={theme.accent} style={styles.statusSpinner} />
              ) : null}
              <Text style={[
                styles.statusText,
                { color: theme.textSecondary },
                phase.kind === 'error' && { color: theme.danger },
                phase.kind === 'done' && { color: theme.success },
              ]}
              >
                {statusText}
              </Text>
              {botHint ? <Text style={[styles.statusBot, { color: theme.textMuted }]}>{botHint}</Text> : null}
              {phase.kind === 'awaiting_friend' ? (
                <>
                  <Text style={[styles.statusBot, { color: theme.textMuted }]}>打开“舞萌-中二公众号-我的记录-舞萌DX”接受好友申请后将自动继续</Text>
                  <Text style={[styles.statusBot, { color: theme.textMuted }]}>{FRIEND_REQUEST_REFRESH_HINT}</Text>
                </>
              ) : null}
            </View>
  );
}

export function UploadResultList({
  theme,
  lastResult,
}: {
  theme: AppThemeTokens;
  lastResult: UploadResult | null;
}) {
  if (!lastResult) return null;
  return (
            <View style={[styles.resultList, { backgroundColor: theme.surface }]}>
              {lastResult.targetResults.map((result) => (
                <View key={result.account.id} style={styles.resultRow}>
                  <Text style={result.status === 'success'
                    ? [styles.resultSuccess, { color: theme.success }]
                    : [styles.resultFailure, { color: theme.danger }]}
                  >
                    {result.status === 'success' ? '✓' : '×'} {result.account.providerTitle}
                  </Text>
                  <Text style={[styles.resultDetail, { color: theme.textMuted }]}>
                    {result.status === 'success'
                      ? `写入 ${result.written} 条${result.skipped ? `，跳过 ${result.skipped} 条` : ''}${result.refreshFailed ? '，页面未能更新' : ''}`
                      : '写入失败，请重试。'}
                  </Text>
                </View>
              ))}
            </View>
  );
}
