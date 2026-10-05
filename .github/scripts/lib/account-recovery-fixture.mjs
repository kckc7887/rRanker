import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const probeSteps = new Set(['command', 'source-identity', 'initial-main-store', 'initial-scorehub-store',
  'fixture-fetch', 'fixture-parse', 'lxns-bind', 'scorehub-write', 'main-readback', 'scorehub-readback',
  'restore', 'restore-check', 'scorehub-read', 'authenticate', 'clear', 'clear-readback']);
const probeFailureCodes = new Set(['authentication', 'permission', 'rate_limit', 'timeout', 'upstream_schema',
  'no_data', 'cache_corrupt', 'network', 'unknown', 'authorization_prepare', 'authorization_open',
  'authorization_callback', 'verification', 'configuration', 'credential_storage', 'local_commit',
  'invariant', 'command', 'source-identity', 'type', 'cancelled']);
const runnerFailureCodes = new Set(['device-failure', 'source-identity', 'stage-result', 'timeout', 'runner-operation']);
const runnerPhases = new Set(['setup', 'seed', 'process-stop', 'recover', 'cleanup']);

function safeProbeFailure(result) {
  return {
    step: probeSteps.has(result?.step) ? result.step : 'unknown',
    failureCode: probeFailureCodes.has(result?.failureCode) ? result.failureCode : 'unknown',
    ...(typeof result?.cleaned === 'boolean' ? { cleaned: result.cleaned } : {}),
  };
}

/** Retain fixed diagnostic fields only; device logs and native exception text are untrusted. */
export class AccountProbeStageError extends Error {
  constructor(failureCode, result) {
    super(failureCode === 'source-identity'
      ? 'Account recovery source identity mismatch' : 'Account recovery stage failed');
    this.name = 'AccountProbeStageError';
    this.failureCode = runnerFailureCodes.has(failureCode) ? failureCode : 'runner-operation';
    if (result) this.safeResult = safeProbeFailure(result);
  }
}

export function accountRecoveryObservedEvidence(observed) {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return { fixtureRequests: count(observed?.fixtureRequests), rejectedRequests: count(observed?.rejectedRequests),
    authenticated: { lxns: observed?.authenticated?.lxns === true, scorehub: observed?.authenticated?.scorehub === true } };
}

export function accountRecoveryFailureEvidence(phase, error) {
  return {
    failurePhase: runnerPhases.has(phase) ? phase : 'unknown',
    failureCode: error instanceof AccountProbeStageError && runnerFailureCodes.has(error.failureCode)
      ? error.failureCode : 'runner-operation',
    ...(error instanceof AccountProbeStageError && error.safeResult
      ? { deviceResult: safeProbeFailure(error.safeResult) } : {}),
  };
}

export function accountProbeDeepLink(stage, runId) {
  assert(['seed', 'recover'].includes(stage) && /^[a-f0-9]{32}$/.test(runId), 'Invalid account probe command');
  // adb shell rejoins arguments; quote again for the device shell's ampersand.
  return `'rranker-nativeprobe://account-recovery?stage=${stage}&run=${runId}'`;
}

export function accountProbeStageResult(logs, expected, publishStep) {
  const prefix = 'RRANKER_ACCOUNT_PROBE ';
  for (const line of logs.split('\n')) {
    const marker = line.indexOf(prefix);
    if (marker < 0) continue;
    let result;
    try { result = JSON.parse(line.slice(marker + prefix.length)); } catch { continue; }
    if (!result || typeof result !== 'object' || Array.isArray(result)) continue;
    if (result.runId !== expected.runId || result.stage !== expected.stage) continue;
    if (result.sourceSha !== expected.sourceSha) {
      throw new AccountProbeStageError('source-identity', result.status === 'fail' ? result : undefined);
    }
    if (['running', 'pass', 'fail'].includes(result.status)) {
      publishStep?.({ stage: expected.stage, step: probeSteps.has(result.step) ? result.step : 'unknown' });
    }
    if (result.status === 'running') continue;
    if (result.status !== 'pass') {
      throw new AccountProbeStageError(result.status === 'fail' ? 'device-failure' : 'stage-result', result);
    }
    return true;
  }
  return false;
}

export function assertAccountRecoveryEvidence(observed) {
  assert.equal(observed.fixtureRequests, 1, 'Fixture is issued once');
  assert.equal(observed.rejectedRequests, 0, 'No reseeding or invalid authenticated request');
  assert(observed.authenticated.lxns && observed.authenticated.scorehub, 'Both restored credentials must authenticate');
}

export function createAccountRecoveryFixture(runId) {
  if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid account probe run');
  const lxnsToken = randomBytes(32).toString('hex');
  const hubToken = randomBytes(32).toString('hex');
  let phase = 'seed';
  let fixtureRequests = 0;
  let rejectedRequests = 0;
  const authenticated = { lxns: false, scorehub: false };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const reply = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
    const reject = (status = 401) => { rejectedRequests++; reply(status, { error: 'Account probe request rejected' }); };
    if (request.method !== 'GET') { reject(405); return; }
    if (url.pathname === '/fixture') {
      if (phase !== 'seed' || fixtureRequests !== 0 || url.search !== `?run=${runId}`) { reject(409); return; }
      fixtureRequests++;
      reply(200, { runId, lxns: { mode: 'lxns-oauth', accessToken: lxnsToken,
        refreshToken: randomBytes(32).toString('hex'), expiresAt: Date.now() + 3_600_000, persistable: true }, hubToken });
      return;
    }
    if (url.search || !['/lxns/player', '/lxns/scores', '/scorehub/me'].includes(url.pathname)) { reject(404); return; }
    const family = url.pathname.startsWith('/lxns/') ? 'lxns' : 'scorehub';
    const expected = family === 'lxns' ? lxnsToken : hubToken;
    if (fixtureRequests !== 1 || request.headers.authorization !== `Bearer ${expected}`) { reject(); return; }
    if (phase === 'recover' && url.pathname !== '/lxns/scores') authenticated[family] = true;
    const player = { name: 'Native account probe', friend_code: '123456789012345', rating: 0 };
    reply(200, family === 'lxns' ? { success: true, code: 200, data: url.pathname === '/lxns/player' ? player : [] }
      : { friendCode: player.friend_code, hasCabinetUserId: true });
  });
  return { server,
    beginRecover() { if (phase !== 'seed' || fixtureRequests !== 1) throw new Error('Account probe seed incomplete'); phase = 'recover'; },
    evidence() { return { fixtureRequests, rejectedRequests, authenticated: { ...authenticated } }; },
  };
}
