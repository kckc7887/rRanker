import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import {
  AccountProbeStageError,
  accountProbeDeepLink,
  accountProbeStageResult,
  accountRecoveryFailureEvidence,
  accountRecoveryObservedEvidence,
  assertAccountRecoveryEvidence,
  createAccountRecoveryFixture,
} from './lib/account-recovery-fixture.mjs';
import { findBash } from './lib/bash.mjs';

const runId = 'a'.repeat(32);
const sourceSha = 'b'.repeat(40);
const stageLog = result => `09-30 ReactNativeJS: RRANKER_ACCOUNT_PROBE ${JSON.stringify(result)}`;

test('both deep links remain complete after the device shell parses the joined adb arguments', () => {
  const bash = findBash();
  assert(bash, 'bash is required to exercise remote shell quoting');
  for (const stage of ['seed', 'recover']) {
    const quoted = accountProbeDeepLink(stage, runId);
    const parsed = execFileSync(bash, ['-c', `printf '%s\\n' ${quoted}`], { encoding: 'utf8' });
    assert.equal(parsed.trim(), `rranker-nativeprobe://account-recovery?stage=${stage}&run=${runId}`);
  }
  for (const [stage, run] of [['unknown', runId], ['seed', `${runId}'`], ['recover', 'invalid']]) {
    assert.throws(() => accountProbeDeepLink(stage, run), /Invalid account probe command/);
  }
});

test('the actual stage parser requires matching source identity and pass status in both processes', () => {
  for (const stage of ['seed', 'recover']) {
    const expected = { stage, runId, sourceSha };
    const passed = { ...expected, status: 'pass' };
    assert.equal(accountProbeStageResult(stageLog(passed), expected), true);
    for (const candidate of [{ ...passed, sourceSha: 'c'.repeat(40) }, { ...passed, sourceSha: undefined }]) {
      assert.throws(() => accountProbeStageResult(stageLog(candidate), expected), /source identity mismatch/);
    }
    for (const status of ['fail', undefined, 'invalid']) {
      assert.throws(() => accountProbeStageResult(stageLog({ ...passed, status }), expected), /failed/);
    }
  }
});

test('running markers retain only the latest fixed substep and cannot satisfy the stage gate', () => {
  const expected = { stage: 'seed', runId, sourceSha };
  const progress = [];
  const running = ['initial-main-store', 'fixture-fetch', 'lxns-bind'].map(step => stageLog({
    ...expected, step, status: 'running', token: 'sensitive-token', message: 'native exception text',
  })).join('\n');
  assert.equal(accountProbeStageResult(running, expected, value => progress.push(value)), false);
  assert.deepEqual(progress, [
    { stage: 'seed', step: 'initial-main-store' }, { stage: 'seed', step: 'fixture-fetch' }, { stage: 'seed', step: 'lxns-bind' },
  ]);
  const last = {};
  assert.equal(accountProbeStageResult(`${running}\n${stageLog({ ...expected, step: 'scorehub-readback', status: 'pass' })}`,
    expected, value => { last[value.stage] = value.step; }), true);
  assert.deepEqual(last, { seed: 'scorehub-readback' });
});

test('device failures preserve fixed substeps and public error codes without arbitrary log payloads', () => {
  const expected = { stage: 'seed', runId, sourceSha };
  const secret = 'sensitive-probe-token';
  let failure;
  assert.throws(() => accountProbeStageResult(stageLog({ ...expected, status: 'fail', step: 'lxns-bind',
    failureCode: 'credential_storage', cleaned: false, token: secret, message: secret, cause: { accessToken: secret },
  }), expected), error => { failure = error; return error instanceof AccountProbeStageError; });
  const safe = accountRecoveryFailureEvidence('seed', failure);
  assert.deepEqual(safe, { failurePhase: 'seed', failureCode: 'device-failure',
    deviceResult: { step: 'lxns-bind', failureCode: 'credential_storage', cleaned: false } });
  assert(!JSON.stringify(safe).includes(secret));
  assert(!JSON.stringify(safe).includes('cause'));
});

test('unknown device fields and arbitrary runner errors are reduced to fixed classifications', () => {
  const expected = { stage: 'recover', runId, sourceSha };
  const secret = 'sensitive-native-exception';
  let failure;
  assert.throws(() => accountProbeStageResult(stageLog({ ...expected, status: 'fail', step: secret,
    failureCode: secret, cleaned: { token: secret }, rawLogs: secret,
  }), expected), error => { failure = error; return true; });
  assert.deepEqual(accountRecoveryFailureEvidence('recover', failure), { failurePhase: 'recover', failureCode: 'device-failure',
    deviceResult: { step: 'unknown', failureCode: 'unknown' } });
  const arbitrary = Object.assign(new Error(secret), { code: 'credential_storage', stdout: secret, stderr: secret });
  assert.deepEqual(accountRecoveryFailureEvidence('setup', arbitrary), { failurePhase: 'setup', failureCode: 'runner-operation' });
  assert.deepEqual(accountRecoveryFailureEvidence(secret, arbitrary), { failurePhase: 'unknown', failureCode: 'runner-operation' });
  assert.deepEqual(accountRecoveryFailureEvidence('seed', new AccountProbeStageError('timeout')),
    { failurePhase: 'seed', failureCode: 'timeout' });
});

test('source identity mismatches fail even when running or failed results contain otherwise valid diagnostics', () => {
  const expected = { stage: 'seed', runId, sourceSha };
  for (const status of ['running', 'fail', 'pass']) {
    const progress = [];
    assert.throws(() => accountProbeStageResult(stageLog({ ...expected, sourceSha: 'c'.repeat(40), status,
      step: 'fixture-fetch', failureCode: 'network', cleaned: true }), expected, value => progress.push(value)),
    error => accountRecoveryFailureEvidence('seed', error).failureCode === 'source-identity');
    assert.deepEqual(progress, []);
  }
});

test('unknown progress steps stay pending without leaking arbitrary device values', () => {
  const expected = { stage: 'recover', runId, sourceSha };
  const progress = [];
  assert.equal(accountProbeStageResult(stageLog({ ...expected, status: 'running', step: 'secret-token' }),
    expected, value => progress.push(value)), false);
  assert.deepEqual(progress, [{ stage: 'recover', step: 'unknown' }]);
  const malformed = [stageLog(null), stageLog(4), stageLog([])].join('\n');
  assert.equal(accountProbeStageResult(malformed, expected), false);
});

test('foreign run, wrong stage and malformed logs never satisfy the runner stage gate', () => {
  const expected = { stage: 'recover', runId, sourceSha };
  const passed = { ...expected, status: 'pass' };
  const unrelated = [stageLog({ ...passed, runId: 'd'.repeat(32) }), stageLog({ ...passed, stage: 'seed' }),
    'ReactNativeJS: RRANKER_ACCOUNT_PROBE {broken', 'unrelated output'].join('\n');
  assert.equal(accountProbeStageResult(unrelated, expected), false);
  assert.equal(accountProbeStageResult(`${unrelated}\n${stageLog(passed)}`, expected), true);
});

async function withFixture(run) {
  const fixture = createAccountRecoveryFixture('a'.repeat(32));
  fixture.server.listen(0, '127.0.0.1');
  await once(fixture.server, 'listening');
  try { await run(fixture, `http://127.0.0.1:${fixture.server.address().port}`); }
  finally { await new Promise(resolve => fixture.server.close(resolve)); }
}

test('recovery authenticates only the exact once-issued credentials for both storage families', async () => {
  await withFixture(async (fixture, base) => {
    const issued = await (await fetch(`${base}/fixture?run=${'a'.repeat(32)}`)).json();
    fixture.beginRecover();
    assert.equal((await fetch(`${base}/lxns/player`, { headers: { Authorization: `Bearer ${issued.lxns.accessToken}` } })).status, 200);
    assert.equal((await fetch(`${base}/scorehub/me`, { headers: { Authorization: `Bearer ${issued.hubToken}` } })).status, 200);
    assert.deepEqual(fixture.evidence(), { fixtureRequests: 1, rejectedRequests: 0, authenticated: { lxns: true, scorehub: true } });
    assert.doesNotThrow(() => assertAccountRecoveryEvidence(fixture.evidence()));
    assert(!JSON.stringify(fixture.evidence()).includes(issued.hubToken));
    assert(!JSON.stringify(fixture.evidence()).includes(issued.lxns.accessToken));
  });
});
test('seed requests do not count as recovered authentication and a second issuance is refused', async () => {
  await withFixture(async (fixture, base) => {
    const issued = await (await fetch(`${base}/fixture?run=${'a'.repeat(32)}`)).json();
    await fetch(`${base}/lxns/player`, { headers: { Authorization: `Bearer ${issued.lxns.accessToken}` } });
    assert.equal(fixture.evidence().authenticated.lxns, false);
    assert.throws(() => assertAccountRecoveryEvidence(fixture.evidence()), /Both restored credentials/);
    fixture.beginRecover();
    await fetch(`${base}/lxns/player`, { headers: { Authorization: `Bearer ${issued.lxns.accessToken}` } });
    await fetch(`${base}/scorehub/me`, { headers: { Authorization: `Bearer ${issued.hubToken}` } });
    assert.equal((await fetch(`${base}/fixture?run=${'a'.repeat(32)}`)).status, 409);
    assert.equal(fixture.evidence().fixtureRequests, 1);
    assert.equal(fixture.evidence().rejectedRequests, 1);
    assert.deepEqual(fixture.evidence().authenticated, { lxns: true, scorehub: true });
    assert.throws(() => assertAccountRecoveryEvidence(fixture.evidence()), /No reseeding or invalid authenticated request/);
  });
});
test('missing, wrong and cross-family tokens cannot produce green authentication evidence', async () => {
  await withFixture(async (fixture, base) => {
    assert.throws(() => fixture.beginRecover(), /seed incomplete/);
    const issued = await (await fetch(`${base}/fixture?run=${'a'.repeat(32)}`)).json();
    fixture.beginRecover();
    for (const headers of [{}, { Authorization: 'Bearer wrong' }, { Authorization: `Bearer ${issued.hubToken}` }]) {
      assert.equal((await fetch(`${base}/lxns/player`, { headers })).status, 401);
    }
    assert.deepEqual(fixture.evidence().authenticated, { lxns: false, scorehub: false });
    assert.throws(() => assertAccountRecoveryEvidence(fixture.evidence()), /No reseeding or invalid authenticated request/);
    await fetch(`${base}/lxns/player`, { headers: { Authorization: `Bearer ${issued.lxns.accessToken}` } });
    await fetch(`${base}/scorehub/me`, { headers: { Authorization: `Bearer ${issued.hubToken}` } });
    assert.deepEqual(fixture.evidence().authenticated, { lxns: true, scorehub: true });
    assert.throws(() => assertAccountRecoveryEvidence(fixture.evidence()), /No reseeding or invalid authenticated request/);
  });
});

test('failed runs preserve sanitized fixture observations before cleanup', async () => {
  await withFixture(async (fixture, base) => {
    const issued = await (await fetch(`${base}/fixture?run=${runId}`)).json();
    assert.equal((await fetch(`${base}/lxns/player`, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    const failure = accountRecoveryFailureEvidence('seed', new AccountProbeStageError('device-failure', {
      step: 'lxns-bind', failureCode: 'authentication', cleaned: true, token: issued.lxns.accessToken,
    }));
    const artifact = { status: 'fail', ...failure, observed: accountRecoveryObservedEvidence(fixture.evidence()) };
    assert.deepEqual(artifact.observed, { fixtureRequests: 1, rejectedRequests: 1, authenticated: { lxns: false, scorehub: false } });
    assert.throws(() => assertAccountRecoveryEvidence(artifact.observed), /No reseeding or invalid authenticated request/);
    const encoded = JSON.stringify(artifact);
    assert(!encoded.includes(issued.lxns.accessToken));
    assert(!encoded.includes(issued.hubToken));
    assert(!encoded.includes(issued.lxns.refreshToken));
  });
});

test('observation serialization retains only counters and boolean authentication decisions', () => {
  const observed = accountRecoveryObservedEvidence({ fixtureRequests: 1, rejectedRequests: 2, token: 'secret',
    authenticated: { lxns: true, scorehub: false, Authorization: 'Bearer secret' }, rawLogs: 'secret' });
  assert.deepEqual(observed, { fixtureRequests: 1, rejectedRequests: 2, authenticated: { lxns: true, scorehub: false } });
  assert(!JSON.stringify(observed).includes('secret'));
});
