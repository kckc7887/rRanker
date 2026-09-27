import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { nextIosBuildNumber, queryReservedIosBuildNumbers, reserveIosBuildNumber } from './ios-build-number.mjs';

const repository = 'kckc7887/rRanker';
const repositoryId = 42;
const sourceCommit = 'a'.repeat(40);
const earlierCommit = 'b'.repeat(40);
const currentRunId = 100;
const repo = { id: repositoryId, full_name: repository, fork: false };
const queryOptions = {
  appVersion: '0.4.0', sourceCommit, repository, runId: String(currentRunId), token: 'fixture-token',
};

function run(id, overrides = {}) {
  return {
    id,
    path: '.github/workflows/quality.yml',
    event: 'push',
    head_sha: id === currentRunId ? sourceCommit : earlierCommit,
    repository: { ...repo },
    head_repository: { ...repo },
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  };
}

function artifact(number, overrides = {}) {
  return {
    id: number,
    name: `ios-build-number-0.4.0-${number}`,
    expired: false,
    workflow_run: {
      id: 200,
      repository_id: repositoryId,
      head_repository_id: repositoryId,
      head_sha: earlierCommit,
    },
    ...overrides,
  };
}

function api({ artifacts = [], pages, runs = {}, handlers = {}, repositoryBody = repo } = {}) {
  const calls = [];
  const requests = [];
  const runBodies = new Map([[currentRunId, run(currentRunId)], [200, run(200)]]);
  for (const [id, body] of Object.entries(runs)) runBodies.set(Number(id), body);
  const fetchImpl = async (url, init) => {
    calls.push(url);
    requests.push(init);
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.github.com');
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Authorization, 'Bearer fixture-token');
    assert.ok(init.signal instanceof AbortSignal);
    const route = `${parsed.pathname}${parsed.search}`;
    if (handlers[route]) return handlers[route](url, init);
    let body;
    if (route === `/repos/${repository}`) body = repositoryBody;
    else if (parsed.pathname === `/repos/${repository}/actions/artifacts`) {
      assert.equal(parsed.searchParams.get('per_page'), '100');
      const page = Number(parsed.searchParams.get('page'));
      body = pages?.[page - 1] ?? {
        total_count: artifacts.length,
        artifacts: artifacts.slice((page - 1) * 100, page * 100),
      };
    } else {
      const match = /^\/repos\/kckc7887\/rRanker\/actions\/runs\/([1-9]\d*)$/.exec(parsed.pathname);
      assert.ok(match, 'Only repository metadata, artifact metadata and run metadata are requested');
      body = runBodies.get(Number(match[1]));
      assert.ok(body, 'Every requested workflow run has a fixture');
    }
    return { status: 200, url, redirected: false, json: async () => structuredClone(body) };
  };
  return { fetchImpl, calls, requests };
}

test('chooses the next integer after Apple and all adjacent reservations', () => {
  assert.equal(nextIosBuildNumber('0', []), 1);
  assert.equal(nextIosBuildNumber('8', ['9', 10]), 11);
  assert.equal(nextIosBuildNumber('15', [9, 10]), 16);
});

test('rejects invalid numeric inputs and overflow instead of reusing a number', () => {
  for (const value of ['', '01', '-1', '1.1', '1e2', ' 1', '1\n', NaN, Infinity, -1, 1.5, null, undefined]) {
    assert.throws(() => nextIosBuildNumber(value, []));
  }
  for (const value of [0, '0', '02', 'bad', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => nextIosBuildNumber(0, [value]));
  }
  assert.throws(() => nextIosBuildNumber(Number.MAX_SAFE_INTEGER, []));
  assert.throws(() => nextIosBuildNumber(0, [Number.MAX_SAFE_INTEGER]));
  assert.throws(() => nextIosBuildNumber(0, null));
});

test('Apple invisibility and failed or cancelled reruns do not release reservations', async () => {
  const fixture = api({
    artifacts: [artifact(9), artifact(10, { id: 20, workflow_run: { ...artifact(10).workflow_run, id: 201 } })],
    runs: { 200: run(200, { conclusion: 'failure' }), 201: run(201, { conclusion: 'cancelled', event: 'workflow_dispatch' }) },
  });
  const numbers = await queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl });
  assert.deepEqual(numbers, [9, 10]);
  assert.equal(nextIosBuildNumber('8', numbers), 11);
  assert.equal(fixture.calls.filter((url) => url.endsWith('/runs/200')).length, 1);
});

test('a retry in the same run and source SHA consumes an earlier reservation', async () => {
  const fixture = api({
    artifacts: [artifact(7, { workflow_run: { ...artifact(7).workflow_run, id: currentRunId, head_sha: sourceCommit } })],
    runs: { [currentRunId]: run(currentRunId, { status: 'in_progress', conclusion: null }) },
  });
  assert.deepEqual(await queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl }), [7]);
  assert.equal(fixture.calls.filter((url) => url.endsWith(`/runs/${currentRunId}`)).length, 1);
});

test('expired metadata remains reserved and a different version is ignored', async () => {
  const fixture = api({ artifacts: [artifact(12, { expired: true }), artifact(99, { name: 'ios-build-number-0.5.0-99' })] });
  assert.deepEqual(await queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl }), [12]);
});

test('enumerates every page and verifies a workflow run only once', async () => {
  const artifacts = Array.from({ length: 102 }, (_, index) => artifact(index + 1));
  const fixture = api({ artifacts });
  const numbers = await queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl });
  assert.equal(numbers.length, 102);
  assert.equal(nextIosBuildNumber('0', numbers), 103);
  assert.equal(fixture.calls.filter((url) => url.includes('/actions/artifacts?')).length, 2);
  assert.equal(fixture.calls.filter((url) => url.endsWith('/runs/200')).length, 1);
});

test('rejects incomplete, duplicate, changing and unbounded pagination', async (t) => {
  const firstPage = Array.from({ length: 100 }, (_, index) => artifact(index + 1, { name: 'unrelated' }));
  const cases = [
    ['short', [{ total_count: 2, artifacts: [artifact(1)] }]],
    ['empty', [{ total_count: 1, artifacts: [] }]],
    ['duplicate', [{ total_count: 2, artifacts: [artifact(1), artifact(1)] }]],
    ['extra', [{ total_count: 0, artifacts: [artifact(1)] }]],
    ['invalid count', [{ total_count: '1', artifacts: [artifact(1)] }]],
    ['changed count', [{ total_count: 101, artifacts: firstPage }, { total_count: 102, artifacts: [artifact(101)] }]],
  ];
  for (const [label, pages] of cases) {
    await t.test(label, async () => {
      const fixture = api({ pages });
      await assert.rejects(queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl }));
    });
  }
  const fixture = api({ pages: [{ total_count: 101, artifacts: firstPage }] });
  await assert.rejects(queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl, maxPages: 1 }));
});

test('forged artifact repository IDs are ignored before trusting run metadata', async () => {
  const candidates = [
    artifact(1, { workflow_run: { ...artifact(1).workflow_run, repository_id: 43 } }),
    artifact(2, { workflow_run: { ...artifact(2).workflow_run, head_repository_id: 43 } }),
    artifact(3, { workflow_run: null }),
    artifact(4, { workflow_run: { ...artifact(4).workflow_run, head_sha: 'invalid' } }),
    artifact(5, { name: 'ios-build-number-0.4.0-05' }),
    artifact(6, { name: 'ios-build-number-0.4.0-6\n' }),
  ];
  const fixture = api({ artifacts: candidates });
  assert.deepEqual(await queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl }), []);
  assert.equal(fixture.calls.filter((url) => url.endsWith('/runs/200')).length, 0);
});

test('PRs, forks, other workflows and mismatched source metadata cannot reserve numbers', async (t) => {
  const cases = [
    ['PR', { event: 'pull_request' }],
    ['PR target', { event: 'pull_request_target' }],
    ['other workflow', { path: '.github/workflows/build-ios.yml' }],
    ['fork repository', { repository: { ...repo, fork: true } }],
    ['fork head', { head_repository: { id: 43, full_name: 'other/rRanker', fork: true } }],
    ['same name different id', { head_repository: { ...repo, id: 43 } }],
    ['forged name', { repository: { ...repo, full_name: 'other/rRanker' } }],
    ['wrong run id', { id: 201 }],
    ['invalid SHA', { head_sha: '0'.repeat(40) }],
    ['mismatched SHA', { head_sha: sourceCommit }],
  ];
  for (const [label, override] of cases) {
    await t.test(label, async () => {
      const fixture = api({ artifacts: [artifact(20)], runs: { 200: run(200, override) } });
      assert.deepEqual(await queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl }), []);
    });
  }
});

test('rejects an untrusted current run or repository before assigning a number', async (t) => {
  for (const [label, override] of [
    ['wrong source', { head_sha: earlierCommit }],
    ['PR', { event: 'pull_request' }],
    ['fork', { head_repository: { ...repo, fork: true } }],
    ['different workflow', { path: '.github/workflows/build-ios.yml' }],
  ]) {
    await t.test(label, async () => {
      const fixture = api({ runs: { [currentRunId]: run(currentRunId, override) } });
      await assert.rejects(queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl }));
      assert.equal(fixture.calls.filter((url) => url.includes('/actions/artifacts?')).length, 0);
    });
  }
  const fixture = api({ repositoryBody: { ...repo, full_name: 'other/rRanker' } });
  await assert.rejects(queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl }));
});

test('trusted numeric reservations cannot overflow the integer range', async () => {
  const fixture = api({ artifacts: [artifact(1, { name: `ios-build-number-0.4.0-${BigInt(Number.MAX_SAFE_INTEGER) + 1n}` })] });
  await assert.rejects(queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl }));
});

test('request, HTTP, redirect, JSON and later-page failures stop enumeration without revealing data', async (t) => {
  const sensitive = 'fixture-response-body-or-token';
  const route = `/repos/${repository}/actions/runs/200`;
  const cases = [
    ['request rejection', async () => { throw new Error(sensitive); }],
    ['HTTP rejection', async () => ({ status: 403, json: async () => { throw new Error(sensitive); } })],
    ['redirect', async () => ({ status: 200, redirected: true, json: async () => ({ sensitive }) })],
    ['foreign response', async () => ({ status: 200, url: 'https://other.invalid', json: async () => ({ sensitive }) })],
    ['JSON rejection', async () => ({ status: 200, json: async () => { throw new Error(sensitive); } })],
  ];
  for (const [label, handler] of cases) {
    await t.test(label, async () => {
      const fixture = api({ artifacts: [artifact(1)], handlers: { [route]: handler } });
      await assert.rejects(queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl }), (error) => {
        assert.equal(error.message.includes(sensitive), false);
        assert.equal(error.cause, undefined);
        return true;
      });
    });
  }
  const firstPage = Array.from({ length: 100 }, (_, index) => artifact(index + 1, { name: 'unrelated' }));
  const fixture = api({
    pages: [{ total_count: 101, artifacts: firstPage }],
    handlers: { [`/repos/${repository}/actions/artifacts?per_page=100&page=2`]: async () => ({ status: 500 }) },
  });
  await assert.rejects(queryReservedIosBuildNumbers({ ...queryOptions, fetchImpl: fixture.fetchImpl }));
});

test('fetch and response-body timeouts do not depend on transport cancellation', async (t) => {
  for (const [label, handler] of [
    ['fetch', async () => new Promise(() => {})],
    ['body', async () => ({ status: 200, json: async () => new Promise(() => {}) })],
  ]) {
    await t.test(label, async () => {
      const fixture = api({ handlers: { [`/repos/${repository}`]: handler } });
      await assert.rejects(queryReservedIosBuildNumbers({
        ...queryOptions, fetchImpl: fixture.fetchImpl, requestTimeoutMs: 10, queryTimeoutMs: 50,
      }));
      assert.equal(fixture.requests[0].signal.aborted, true);
    });
  }
});

test('the complete enumeration has a deadline even when individual requests respond', async () => {
  const fixture = api();
  const fetchImpl = async (...args) => {
    await new Promise((resolve) => setTimeout(resolve, 12));
    return fixture.fetchImpl(...args);
  };
  await assert.rejects(queryReservedIosBuildNumbers({
    ...queryOptions, fetchImpl, requestTimeoutMs: 100, queryTimeoutMs: 20,
  }));
});

test('invalid query configuration never starts a request', async () => {
  let calls = 0;
  for (const override of [
    { repository: 'other/rRanker' }, { appVersion: '0.4.0\n' }, { appVersion: '../0.4.0' },
    { appVersion: '0.4' }, { appVersion: '00.4.0' }, { sourceCommit: 'bad' },
    { runId: '01' }, { token: '' }, { token: 'value\n' }, { maxPages: 0 }, { requestTimeoutMs: 0 },
  ]) {
    await assert.rejects(queryReservedIosBuildNumbers({
      ...queryOptions, ...override, fetchImpl: async () => { calls += 1; },
    }));
  }
  assert.equal(calls, 0);
});

test('CLI entry writes only verified, sanitized reservation JSON and action outputs', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ios-number-contract-'));
  try {
    const output = join(directory, 'outputs');
    writeFileSync(output, 'existing=value\n');
    const fixture = api({ artifacts: [artifact(9), artifact(10)] });
    const env = {
      LATEST_IOS_BUILD: '8', APP_VERSION: '0.4.0', BUILD_SOURCE_COMMIT: sourceCommit,
      GITHUB_TOKEN: 'fixture-token', GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: String(currentRunId),
      RUNNER_TEMP: directory, GITHUB_OUTPUT: output,
    };
    const result = await reserveIosBuildNumber(env, { fetchImpl: fixture.fetchImpl });
    assert.deepEqual(result, {
      buildNumber: 11, artifactName: 'ios-build-number-0.4.0-11', reservationPath: join(directory, 'ios-build-number.json'),
    });
    const json = readFileSync(result.reservationPath, 'utf8');
    assert.deepEqual(JSON.parse(json), {
      schemaVersion: 1, repository, appVersion: '0.4.0', buildNumber: '11',
      sourceCommit, runId: String(currentRunId), artifactName: result.artifactName,
    });
    assert.equal(json.includes(env.GITHUB_TOKEN), false);
    assert.equal(readFileSync(output, 'utf8'),
      `existing=value\nbuild_number=11\nartifact_name=${result.artifactName}\nreservation_path=${result.reservationPath}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI validation or remote failure publishes neither a number nor a reservation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ios-number-contract-'));
  try {
    const output = join(directory, 'outputs');
    writeFileSync(output, 'existing=value\n');
    const env = {
      LATEST_IOS_BUILD: '0', APP_VERSION: '0.4.0', BUILD_SOURCE_COMMIT: sourceCommit,
      GITHUB_TOKEN: 'fixture-token', GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: String(currentRunId),
      RUNNER_TEMP: directory, GITHUB_OUTPUT: output,
    };
    let calls = 0;
    for (const override of [{ LATEST_IOS_BUILD: '01' }, { RUNNER_TEMP: 'relative' }, { GITHUB_OUTPUT: `${output}\n` }]) {
      await assert.rejects(reserveIosBuildNumber({ ...env, ...override }, {
        fetchImpl: async () => { calls += 1; },
      }));
    }
    assert.equal(calls, 0);
    await assert.rejects(reserveIosBuildNumber(env, { fetchImpl: async () => { throw new Error('fixture-token'); } }));
    assert.equal(readFileSync(output, 'utf8'), 'existing=value\n');
    assert.throws(() => readFileSync(join(directory, 'ios-build-number.json')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
