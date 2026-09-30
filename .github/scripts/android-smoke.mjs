import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [mode, apk, serial, output] = process.argv.slice(2);
assert(['native', 'production'].includes(mode) && apk && serial && output, 'Expected mode, APK, explicit device serial and output directory');
mkdirSync(output, { recursive: true });
const command = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 20_000 });
const shell = (...args) => command('shell', ...args);
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const evidence = { mode, sourceSha: process.env.BUILD_SOURCE_COMMIT, status: 'running', checks: [] };
const applicationPackage = 'com.rranker.app';
let phase = 'installation';
let lastNodes = [];
class DeviceCheckError extends Error {
  constructor(category, message) { super(message); this.category = category; }
}
const logFailureCopy = new Set([
  '读取失败', '保存失败', '日志保存遇到问题，请重试。', '暂时无法读取日志，请重试。',
  '暂时无法更改记录状态，请重试。', '暂时无法分享这份日志，请重试。',
  '暂时无法准备日志，请稍后重试。', '暂时无法分享诊断信息，请稍后重试。', '操作失败',
]);
const ownNodes = (current) => current.filter((node) => node.package === applicationPackage);
const resumedActivities = () => {
  const current = shell('dumpsys', 'activity', 'activities').split('\n')
    .filter((line) => /^\s*(?:mResumedActivity|topResumedActivity|ResumedActivity)\s*[:=]/.test(line));
  const top = current.filter((line) => /^\s*topResumedActivity\s*[:=]/.test(line));
  return top.length > 0 ? top : current;
};
const isMainActivity = (line) => /\bcom\.rranker\.app\/(?:\.MainActivity|com\.rranker\.app\.MainActivity)\b/.test(line);
const isChooserActivity = (line) => /(?:^|[\s{])(?:android\/com\.android\.internal\.app\.ChooserActivity|com\.android\.intentresolver\/(?:\.|com\.android\.intentresolver\.)ChooserActivity(?:Launcher)?)(?=$|[\s}])/.test(line);
function assertApplicationForeground() {
  if (!resumedActivities().some(isMainActivity)) throw new DeviceCheckError('foreground', 'Application must be foreground before device input');
}
function rejectLogFailures(current) {
  if (ownNodes(current).some((node) => logFailureCopy.has(node.text))) {
    throw new DeviceCheckError('log-status', 'Log status reports a storage, recording or sharing failure');
  }
}
const decode = (value) => value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const nodes = () => {
  shell('uiautomator', 'dump', '/sdcard/rranker-smoke.xml');
  const xml = shell('cat', '/sdcard/rranker-smoke.xml');
  lastNodes = [...xml.matchAll(/<node\s+([^>]+)>?/g)].map((match) =>
    Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((attribute) => [attribute[1], decode(attribute[2])])));
  return lastNodes;
};
async function waitFor(predicate, label, reject) {
  const deadline = Date.now() + 60_000;
  do {
    const current = nodes();
    reject?.(current);
    if (predicate(current)) return current;
    await pause(500);
  } while (Date.now() < deadline);
  throw new DeviceCheckError('timeout', `Device check timed out: ${label}`);
}
async function waitForActivity(predicate, label) {
  const deadline = Date.now() + 60_000;
  do {
    const resumed = resumedActivities();
    if (resumed.some(predicate)) return;
    await pause(500);
  } while (Date.now() < deadline);
  throw new DeviceCheckError('timeout', `Device activity check timed out: ${label}`);
}
const find = (current, label) => ownNodes(current).find((node) => node['content-desc'] === label);
const controlBounds = (node) => {
  const match = node?.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  return match ? match.slice(1).map(Number) : null;
};
const hasInteractiveChooser = (current) => current.some((node) => {
  if (!['android', 'com.android.intentresolver'].includes(node.package) || node.enabled !== 'true') return false;
  const bounds = controlBounds(node);
  return bounds && bounds[2] > bounds[0] && bounds[3] > bounds[1];
});
async function returnFromChooser(label) {
  await waitForActivity(isChooserActivity, `${label} system share chooser`);
  await waitFor(hasInteractiveChooser, `${label} chooser interactive`);
  shell('input', 'keyevent', 'KEYCODE_BACK');
  await waitForActivity(isMainActivity, `${label} returns to MainActivity`);
}
function tap(node) {
  assert(node?.enabled === 'true' && node.package === applicationPackage, 'Expected enabled application control');
  const bounds = controlBounds(node);
  assert(bounds && bounds[2] > bounds[0] && bounds[3] > bounds[1], 'Missing visible control bounds');
  assertApplicationForeground();
  shell('input', 'tap', String(Math.floor((bounds[0] + bounds[2]) / 2)), String(Math.floor((bounds[1] + bounds[3]) / 2)));
}
const latestLogShare = (current) => ownNodes(current).find((node) => node['content-desc'].startsWith('分享日志，最新记录，'));
function scrollApplication(current) {
  const regions = ownNodes(current).filter((node) => node.scrollable === 'true' && node.enabled === 'true')
    .map((node) => controlBounds(node)).filter((bounds) => bounds && bounds[2] - bounds[0] >= 48 && bounds[3] - bounds[1] >= 96)
    .sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
  const bounds = regions[0];
  if (!bounds) throw new DeviceCheckError('layout', 'No visible application scroll region for recorded history');
  assertApplicationForeground();
  const x = Math.floor((bounds[0] + bounds[2]) / 2);
  const height = bounds[3] - bounds[1];
  shell('input', 'swipe', String(x), String(Math.floor(bounds[1] + height * 0.82)), String(x), String(Math.floor(bounds[1] + height * 0.22)), '350');
}
async function waitForLatestLogShare() {
  const deadline = Date.now() + 60_000;
  let scrolls = 0;
  do {
    const current = nodes();
    rejectLogFailures(current);
    const share = latestLogShare(current);
    if (share?.enabled === 'true') return share;
    if (ownNodes(current).some((node) => node.text === '还没有日志')) {
      throw new DeviceCheckError('history-empty', 'No recorded history after successful recording');
    }
    if (!share && !find(current, '读取历史日志') && scrolls < 8) {
      scrollApplication(current); scrolls += 1;
    }
    await pause(500);
  } while (Date.now() < deadline);
  throw new DeviceCheckError('timeout', 'Device check timed out: enabled latest recorded log share');
}
function failureSnapshot(current) {
  const fixedLabels = new Set(['记录日志', '分享诊断信息', '读取历史日志', '重试', '重试读取账号']);
  const fixedText = new Set(['准备中', '正在记录', '等待记录', '未开启', '最近日志', '最新记录', '上次记录', '已结束', '已中断', '还没有日志', ...logFailureCopy]);
  const controls = [];
  for (const node of ownNodes(current)) {
    const label = node['content-desc'];
    const control = fixedLabels.has(label) ? label : label.startsWith('分享日志，最新记录，') ? '最新记录分享'
      : label.startsWith('分享日志，上次记录，') ? '上次记录分享' : /^保留 (?:1000|2000|5000) 条$/.test(label) ? '日志容量' : null;
    const text = fixedText.has(node.text) ? node.text : null;
    if (control || text || node.scrollable === 'true') controls.push({
      ...(control ? { control } : {}), ...(text ? { text } : {}),
      ...Object.fromEntries(['enabled', 'checked', 'selected', 'scrollable'].filter((key) => /^(?:true|false)$/.test(node[key])).map((key) => [key, node[key]])),
      bounds: controlBounds(node),
    });
  }
  return { phase, applicationNodeCount: ownNodes(current).length, controls: controls.slice(0, 80) };
}
const route = (path) => shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `rranker:///${path}`, '-p', 'com.rranker.app');
const restart = () => {
  shell('am', 'force-stop', 'com.rranker.app');
  shell('am', 'start', '-W', '-n', 'com.rranker.app/.MainActivity');
};

try {
  assert(command('install', '-r', apk).includes('Success'), 'APK installation failed');
  command('logcat', '-c');
  restart();
  if (mode === 'native') {
    phase = 'native-probes';
    const deadline = Date.now() + 110_000;
    let results = [];
    do {
      const logs = command('logcat', '-d', '-s', 'ReactNativeJS:I', 'AndroidRuntime:E');
      results = logs.split('\n').filter((line) => line.includes('RRANKER_NATIVE_PROBE '))
        .map((line) => JSON.parse(line.slice(line.indexOf('RRANKER_NATIVE_PROBE ') + 21)));
      if (results.length >= 6) break;
      await pause(500);
    } while (Date.now() < deadline);
    evidence.checks.push(...results);
    assert.equal(results.length, 6, 'All six native probes must complete');
    assert(results.every((result) => result.status === 'pass'), 'A native bridge round-trip failed');
  } else {
    phase = 'theme-apply-persist';
    route('personalization');
    let current = await waitFor((list) => list.some((node) => node['content-desc'].startsWith('主题色 ')), 'personalization');
    const labels = current.filter((node) => node['content-desc'].startsWith('主题色 ') && !node['content-desc'].includes('自定义')).map((node) => node['content-desc']).slice(0, 3);
    assert.equal(labels.length, 3, 'Expected theme presets');
    for (const label of labels) {
      tap(find(current, label));
      current = await waitFor((list) => find(list, label)?.selected === 'true', 'theme applies');
    }
    await pause(2_000);
    assert.equal(find(nodes(), labels.at(-1))?.selected, 'true', 'Theme must not rebound');
    restart();
    route('personalization');
    await waitFor((list) => find(list, labels.at(-1))?.selected === 'true', 'theme persists after restart');
    evidence.checks.push({ name: 'theme-apply-persist', status: 'pass' });
    phase = 'logging-default-off';
    route('diagnostics');
    current = await waitFor((list) => find(list, '记录日志')?.enabled === 'true', 'diagnostics ready');
    assert.equal(find(current, '记录日志').checked, 'false', 'Logging defaults off');
    assert(find(current, '分享诊断信息')?.enabled === 'true', 'Emergency export is available');
    assert(!current.some((node) => /保存失败|暂时无法读取/.test(node.text)), 'Disabled logging has no storage failure');
    evidence.checks.push({ name: 'logging-default-off', status: 'pass' });
    phase = 'diagnostic-share-system-chooser';
    tap(find(current, '分享诊断信息'));
    await returnFromChooser('diagnostics');
    current = await waitFor((list) => find(list, '分享诊断信息')?.enabled === 'true' && find(list, '记录日志')?.enabled === 'true', 'diagnostic sharing completes');
    evidence.checks.push({ name: 'diagnostic-share-system-chooser', status: 'pass' });
    phase = 'logging-start';
    tap(find(current, '记录日志'));
    await waitFor((list) => find(list, '记录日志')?.checked === 'true' && find(list, '记录日志')?.enabled === 'true'
      && ownNodes(list).some((node) => node.text === '正在记录'), 'recording starts', rejectLogFailures);
    evidence.checks.push({ name: 'logging-start', status: 'pass' });
    phase = 'logging-restore';
    restart();
    route('diagnostics');
    current = await waitFor((list) => find(list, '记录日志')?.checked === 'true' && find(list, '记录日志')?.enabled === 'true'
      && ownNodes(list).some((node) => node.text === '正在记录'), 'logging restores', rejectLogFailures);
    evidence.checks.push({ name: 'logging-restores-after-restart', status: 'pass' });
    phase = 'logging-stop';
    tap(find(current, '记录日志'));
    await waitFor((list) => find(list, '记录日志')?.checked === 'false' && find(list, '记录日志')?.enabled === 'true'
      && ownNodes(list).some((node) => node.text === '未开启') && !find(list, '读取历史日志')
      && ownNodes(list).some((node) => /^保留 \d+ 条$/.test(node['content-desc']) && node.enabled === 'true'),
    'recording stops and controls settle', rejectLogFailures);
    evidence.checks.push({ name: 'logging-stop-settled', status: 'pass' });
    phase = 'recorded-history-share';
    tap(await waitForLatestLogShare());
    await returnFromChooser('recorded log');
    await waitFor((list) => latestLogShare(list)?.enabled === 'true' && !find(list, '读取历史日志'),
      'recorded log sharing completes', rejectLogFailures);
    evidence.checks.push({ name: 'recorded-history-share-system-chooser', status: 'pass' });
    evidence.checks.push({ name: 'logging-default-start-restore-stop-history', status: 'pass' });
    phase = 'account-startup-restoration';
    route('game-management');
    current = await waitFor((list) => list.some((node) => node.text === '游戏管理'), 'account screen');
    assert(!current.some((node) => /无法读取本机登录状态|恢复失败|部分本机账号暂时无法读取/.test(node.text)), 'Account restoration succeeds');
    assert(!find(current, '重试读取账号'), 'All optional account sources restore successfully');
    evidence.checks.push({ name: 'account-startup-restoration', status: 'pass', scope: 'storage-read-only; authenticated accounts require separate verification' });
  }
  phase = 'native-crash-check';
  const crashes = command('logcat', '-d', '-s', 'AndroidRuntime:E');
  assert(!crashes.includes('FATAL EXCEPTION'), 'No native crash');
  evidence.status = 'pass';
  console.log(JSON.stringify(evidence));
} catch (error) {
  evidence.status = 'fail';
  evidence.failureCategory = error instanceof DeviceCheckError ? error.category : error instanceof assert.AssertionError ? 'assertion' : 'command-or-unexpected';
  evidence.failure = error instanceof DeviceCheckError ? error.message : `Device verification failed during ${phase}`;
  try { evidence.failureSnapshot = failureSnapshot(nodes()); }
  catch { evidence.failureSnapshot = failureSnapshot(lastNodes); }
  // 只输出受控检查文案；原始命令异常可能包含不应交付的设备输出。
  throw new Error(evidence.failure);
} finally {
  writeFileSync(join(output, 'smoke-result.json'), JSON.stringify(evidence, null, 2) + '\n');
  try { shell('rm', '-f', '/sdcard/rranker-smoke.xml'); } catch { /* Preserve the device check failure. */ }
}
