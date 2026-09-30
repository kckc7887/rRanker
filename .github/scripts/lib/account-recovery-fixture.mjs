import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

export function accountProbeDeepLink(stage, runId) {
  assert(['seed', 'recover'].includes(stage) && /^[a-f0-9]{32}$/.test(runId), 'Invalid account probe command');
  // adb shell rejoins arguments; quote again for the device shell's ampersand.
  return `'rranker-nativeprobe://account-recovery?stage=${stage}&run=${runId}'`;
}

export function accountProbeStageResult(logs, expected) {
  const prefix = 'RRANKER_ACCOUNT_PROBE ';
  for (const line of logs.split('\n')) {
    const marker = line.indexOf(prefix);
    if (marker < 0) continue;
    let result;
    try { result = JSON.parse(line.slice(marker + prefix.length)); } catch { continue; }
    if (result.runId !== expected.runId || result.stage !== expected.stage) continue;
    assert.equal(result.status, 'pass', `Account recovery ${expected.stage} failed`);
    assert.equal(result.sourceSha, expected.sourceSha, 'Account recovery source identity mismatch');
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
