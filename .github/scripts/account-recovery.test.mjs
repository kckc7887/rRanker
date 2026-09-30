import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import {
  accountProbeDeepLink,
  accountProbeStageResult,
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
    for (const status of ['fail', undefined, 'running']) {
      assert.throws(() => accountProbeStageResult(stageLog({ ...passed, status }), expected), /failed/);
    }
  }
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
