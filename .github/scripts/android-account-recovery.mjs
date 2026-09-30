import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { accountProbeDeepLink, accountProbeStageResult, assertAccountRecoveryEvidence, createAccountRecoveryFixture } from './lib/account-recovery-fixture.mjs';

const [apk, serial, output] = process.argv.slice(2);
assert(apk && serial && output && /^[a-f0-9]{40}$/.test(process.env.BUILD_SOURCE_COMMIT ?? ''), 'Expected APK, serial, output and source SHA');
const packageName = 'com.rranker.app.nativeprobe';
const runId = randomBytes(16).toString('hex');
const fixture = createAccountRecoveryFixture(runId);
const execute = promisify(execFile);
const adb = async (...args) => (await execute('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 20_000 })).stdout;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evidence = { sourceSha: process.env.BUILD_SOURCE_COMMIT, runId, status: 'fail', checks: [], cleanup: {} };
let phase = 'setup';
let serverStarted = false;
let failure;

async function waitFor(operation, label) {
  const deadline = Date.now() + 60_000;
  do { const value = await operation(); if (value) return value; await pause(250); } while (Date.now() < deadline);
  throw new Error(`Account recovery timed out: ${label}`);
}
async function launch(stage) {
  await adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d',
    accountProbeDeepLink(stage, runId), '-p', packageName);
  return waitFor(async () => {
    try { return (await adb('shell', 'pidof', packageName)).trim() || false; }
    catch (error) { if (error.code === 1 && !String(error.stdout ?? '').trim()) return false; throw error; }
  }, 'process start');
}
async function waitStage(stage, pid) {
  await waitFor(async () => {
    const logs = await adb('logcat', '-d', `--pid=${pid}`, '-s', 'ReactNativeJS:I');
    return accountProbeStageResult(logs, { runId, stage, sourceSha: evidence.sourceSha });
  }, stage);
}

try {
  await mkdir(output, { recursive: true });
  evidence.apkSha256 = createHash('sha256').update(await readFile(apk)).digest('hex');
  fixture.server.listen(8766, '127.0.0.1');
  await once(fixture.server, 'listening'); serverStarted = true;
  await adb('reverse', 'tcp:8766', 'tcp:8766');
  await adb('uninstall', packageName).catch(() => undefined);
  assert((await adb('install', apk)).includes('Success'), 'Account recovery APK installation failed');
  phase = 'seed';
  const seedPid = await launch('seed'); evidence.seedPid = seedPid;
  await waitStage('seed', seedPid);
  phase = 'process-stop';
  await adb('shell', 'am', 'force-stop', packageName);
  const remaining = await adb('shell', 'pidof', packageName).catch(error => {
    if (error.code === 1 && !String(error.stdout ?? '').trim()) return '';
    throw error;
  });
  assert.equal(remaining.trim(), '', 'Seed process must exit before recovery');
  fixture.beginRecover();
  phase = 'recover';
  const recoverPid = await launch('recover'); evidence.recoverPid = recoverPid;
  assert.notEqual(recoverPid, seedPid, 'Recovery must use a new process');
  await waitStage('recover', recoverPid);
  const observed = fixture.evidence();
  assertAccountRecoveryEvidence(observed);
  evidence.checks = [{ name: 'native-write-kill-restore-auth', status: 'pass', ...observed }];
  evidence.status = 'pass';
} catch {
  failure = `Account recovery failed during ${phase}`;
  evidence.failurePhase = phase;
} finally {
  for (const [name, operation] of [
    ['test-package', () => adb('uninstall', packageName).then(result => assert(result.includes('Success')))],
    ['port-forward', () => adb('reverse', '--remove', 'tcp:8766')],
    ['fixture-server', async () => { if (serverStarted) await new Promise((resolve, reject) => fixture.server.close(error => error ? reject(error) : resolve())); }],
  ]) {
    try { await operation(); evidence.cleanup[name] = 'pass'; }
    catch { evidence.cleanup[name] = 'fail'; evidence.status = 'fail'; failure ??= `Account recovery cleanup failed: ${name}`; }
  }
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'account-recovery-result.json'), JSON.stringify(evidence, null, 2) + '\n');
}
if (failure) throw new Error(failure);
console.log(JSON.stringify(evidence));
