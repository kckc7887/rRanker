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
const decode = (value) => value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const nodes = () => {
  shell('uiautomator', 'dump', '/sdcard/rranker-smoke.xml');
  const xml = shell('cat', '/sdcard/rranker-smoke.xml');
  return [...xml.matchAll(/<node\s+([^>]+)>?/g)].map((match) =>
    Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((attribute) => [attribute[1], decode(attribute[2])])));
};
async function waitFor(predicate, label) {
  const deadline = Date.now() + 60_000;
  do {
    const current = nodes();
    if (predicate(current)) return current;
    await pause(500);
  } while (Date.now() < deadline);
  throw new Error(`Device check timed out: ${label}`);
}
const find = (current, label) => current.find((node) => node['content-desc'] === label);
function tap(node) {
  assert(node?.enabled === 'true' && node.package === 'com.rranker.app', 'Expected enabled application control');
  const bounds = node.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  assert(bounds, 'Missing control bounds');
  shell('input', 'tap', String(Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2)), String(Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2)));
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
    const deadline = Date.now() + 60_000;
    let results = [];
    do {
      const logs = command('logcat', '-d', '-s', 'ReactNativeJS:I', 'AndroidRuntime:E');
      results = logs.split('\n').filter((line) => line.includes('RRANKER_NATIVE_PROBE '))
        .map((line) => JSON.parse(line.slice(line.indexOf('RRANKER_NATIVE_PROBE ') + 21)));
      if (results.length >= 6) break;
      await pause(500);
    } while (Date.now() < deadline);
    assert.equal(results.length, 6, 'All six native probes must complete');
    evidence.checks.push(...results);
    assert(results.every((result) => result.status === 'pass'), 'A native bridge round-trip failed');
  } else {
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
    route('diagnostics');
    current = await waitFor((list) => find(list, '记录日志')?.enabled === 'true', 'diagnostics ready');
    assert.equal(find(current, '记录日志').checked, 'false', 'Logging defaults off');
    assert(find(current, '分享诊断信息')?.enabled === 'true', 'Emergency export is available');
    assert(!current.some((node) => /保存失败|暂时无法读取/.test(node.text)), 'Disabled logging has no storage failure');
    tap(find(current, '记录日志'));
    await waitFor((list) => find(list, '记录日志')?.checked === 'true' && list.some((node) => node.text === '正在记录'), 'recording starts');
    restart();
    route('diagnostics');
    current = await waitFor((list) => find(list, '记录日志')?.checked === 'true' && list.some((node) => node.text === '正在记录'), 'logging restores');
    tap(find(current, '记录日志'));
    current = await waitFor((list) => find(list, '记录日志')?.checked === 'false' && list.some((node) => node.text === '未开启'), 'recording stops');
    assert(current.some((node) => node['content-desc'].startsWith('分享日志，')), 'Recorded history remains readable');
    evidence.checks.push({ name: 'logging-default-start-restore-stop-history', status: 'pass' });
    route('game-management');
    current = await waitFor((list) => list.some((node) => node.text === '游戏管理'), 'account screen');
    assert(!current.some((node) => /无法读取本机登录状态|恢复失败/.test(node.text)), 'Account restoration succeeds');
    evidence.checks.push({ name: 'account-startup-restoration', status: 'pass' });
  }
  const crashes = command('logcat', '-d', '-s', 'AndroidRuntime:E');
  assert(!crashes.includes('FATAL EXCEPTION'), 'No native crash');
  evidence.status = 'pass';
  console.log(JSON.stringify(evidence));
} catch (error) {
  evidence.status = 'fail';
  evidence.failure = error instanceof Error ? error.message : 'Device verification failed';
  throw error;
} finally {
  writeFileSync(join(output, 'smoke-result.json'), JSON.stringify(evidence, null, 2) + '\n');
  try { shell('rm', '-f', '/sdcard/rranker-smoke.xml'); } catch { /* Preserve the device check failure. */ }
}
