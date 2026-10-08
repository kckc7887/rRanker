import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAndroidDevice, parseSnapshot } from './lib/android-device.mjs';
import { runAndroidSmoke } from './lib/android-smoke-flow.mjs';

function fixture(options = {}) {
  let clock = 0, frame = 0, dumps = 0, selected = 0, logging = false, recorded = false, running = false, chooser = false;
  let route = '', snapshot = '', current = [], chooserFrames = 0, failed = false;
  const launches = [], paths = [], trace = [];
  const node = (label, extra = {}) => ({ package: 'com.rranker.app', text: '', 'content-desc': label, enabled: 'true', bounds: `[0,${current.length * 100}][80,${current.length * 100 + 80}]`, ...extra });
  const add = (label, extra) => current.push(node(label, extra));
  const xml = () => {
    current = [];
    if (chooser) {
      chooserFrames += 1;
      add('', { package: 'com.android.intentresolver', enabled: String(chooserFrames >= 2) });
    } else if (frame < 2 || !route) add('', { text: '首页' });
    else if (route === 'personalization') ['蓝','紫','绿'].forEach((label, i) => add(`主题色 ${label}`, { selected: String(selected === i) }));
    else if (route === 'diagnostics') {
      add('记录日志', { checked: String(logging) }); add('分享诊断信息');
      add('保留 1000 条'); add('', { text: logging ? '正在记录' : '未开启' });
      if (recorded && !logging) add('分享日志，最新记录，测试');
      if (options.storageFailure && logging) add('', { text: '保存失败' });
    } else if (route === 'game-management') add('', { text: '游戏管理' });
    else if (route === 'tools/arcade-finder' && !options.missingArcade) add('', { text: '当前使用机厅列表' });
    return '<hierarchy>' + current.map(n => '<node ' + Object.entries(n).map(([k,v]) => `${k}="${v}"`).join(' ') + ' />').join('') + '</hierarchy>';
  };
  const execute = (binary, args) => {
    assert.equal(binary, 'adb'); assert.deepEqual(args.slice(0,2), ['-s','test-device']);
    args = args.slice(2);
    if (failed && options.diagnosticsFailure) throw new Error('diagnostic transport failed');
    if (args[0] === 'install') return 'Success';
    if (args[0] === 'logcat') return options.crash && args[1] === '-d' ? 'FATAL EXCEPTION' : '';
    assert.equal(args.shift(), 'shell');
    if (args[0] === 'getprop') return 'x86_64';
    if (args[0] === 'pm' && args[1] === 'grant') return '';
    if (args[0] === 'rm') return '';
    if (args[0] === 'am' && args[1] === 'force-stop') {
      running = false; frame = 0;
      if (options.loseSavedTheme) selected = 0;
    } else if (args[0] === 'am' && args[1] === 'start') {
      const next = args.includes('-d') ? args[args.indexOf('-d') + 1].replace('rranker:///', '') : '';
      if (!running || frame >= 2) route = options.lostLaunchRoute ? '' : next;
      if (!running) launches.push(next);
      running = true;
    } else if (args[0] === 'uiautomator') {
      dumps++; frame++; paths.push(args[2]);
      if (options.adbFailure) { failed = true; throw new Error('device offline'); }
      if (options.nullRoot && dumps === 1) return 'ERROR: null root node returned by UiTestAutomationBridge.';
      if (options.throwNullRoot && dumps === 1) throw Object.assign(new Error('dump failed'), { stderr: 'ERROR: null root node returned by UiTestAutomationBridge.' });
      snapshot = options.empty || options.stale || (options.missing && dumps === 1) ? '' : xml();
      return 'UI hierarchy dumped';
    } else if (args[0].startsWith('if [ -s ')) {
      assert.equal(args.length, 1, 'ADB must receive the complete remote shell expression');
      return snapshot;
    }
    else if (args[0] === 'dumpsys') return `topResumedActivity=ActivityRecord{a u0 ${chooser ? 'com.android.intentresolver/.ChooserActivityLauncher' : 'com.rranker.app/.MainActivity'} t1}`;
    else if (args[0] === 'input' && args[1] === 'tap') {
      const tapped = current[Math.floor(Number(args[3]) / 100)]; assert(tapped);
      if (route === 'personalization') selected = ['主题色 蓝','主题色 紫','主题色 绿'].indexOf(tapped['content-desc']);
      else if (tapped['content-desc'] === '记录日志') { logging = !logging; recorded = true; }
      else { chooser = true; chooserFrames = 0; trace.push('share'); }
    } else if (args[0] === 'input' && args[1] === 'keyevent') {
      assert(chooser && chooserFrames >= 2, 'BACK must await interactive chooser'); chooser = false; trace.push('back');
    } else assert.fail(`Unexpected operation: ${args}`);
    return '';
  };
  return { launches, paths, trace, run: () => runAndroidSmoke({ mode: 'production', apk: 'test.apk', sourceSha: 'a'.repeat(40), device: createAndroidDevice('test-device', execute), now: () => clock, pause: async ms => { clock += ms; } }) };
}

for (const options of [{}, { nullRoot: true }, { throwNullRoot: true }, { missing: true }]) {
  test(`production routes recover transient snapshots: ${JSON.stringify(options)}`, async () => {
    const device = fixture(options), result = await device.run();
    assert.equal(result.status, 'pass', JSON.stringify(result));
    assert.deepEqual(device.launches, ['personalization','personalization','diagnostics']);
    assert.deepEqual(device.trace, ['share','back','share','back']);
    assert(result.checks.some(check => check.name === 'account-startup-restoration'));
    assert(result.checks.some(check => check.name === 'arcade-map-list-fallback'));
  });
}
for (const options of [{ empty: true }, { stale: true }, { lostLaunchRoute: true }, { loseSavedTheme: true }, { missingArcade: true }]) {
  test(`production smoke rejects missing UI or persistence: ${JSON.stringify(options)}`, async () => {
    const result = await fixture(options).run();
    assert.equal(result.status, 'fail'); assert.equal(result.failureCategory, 'timeout');
    if (options.loseSavedTheme) assert.match(result.failure, /theme persists after restart/);
  });
}
for (const [options, category] of [[{ adbFailure: true }, 'device-command'], [{ adbFailure: true, diagnosticsFailure: true }, 'device-command'], [{ crash: true }, 'application-crash'], [{ storageFailure: true }, 'log-status']]) {
  test(`hard failures retain their category: ${JSON.stringify(options)}`, async () => {
    const result = await fixture(options).run();
    assert.equal(result.status, 'fail'); assert.equal(result.failureCategory, category);
    assert(!result.failure.includes('diagnostic transport'), 'diagnostics cannot replace the first failure');
  });
}
test('snapshot parser rejects incomplete or empty XML and supplies safe optional labels', () => {
  for (const text of ['', '<hierarchy>', '<hierarchy/>', '<hierarchy></hierarchy>', '<node text="old"/>']) assert.deepEqual(parseSnapshot(text), []);
  assert.deepEqual(parseSnapshot('<hierarchy><node text="a &amp; b" /></hierarchy>'), [{ text: 'a & b', 'content-desc': '' }]);
});
