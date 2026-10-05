import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { nextIosBuildNumber, queryReservedIosBuildNumbers, reserveIosBuildNumber } from './ios-build-number.mjs';

const repository = 'kckc7887/rRanker';
const options = { appVersion: '0.4.0', repository, token: 'fixture-token' };
const artifact = (number, overrides = {}) => ({
  name: `ios-build-number-0.4.0-${number}`, workflow_run: { id: 200 }, ...overrides,
});
const run = overrides => ({
  path: '.github/workflows/quality.yml', event: 'push',
  head_repository: { full_name: repository }, ...overrides,
});
function api(artifacts = [], runs = { 200: run() }) {
  return async url => {
    const route = new URL(url);
    const body = route.pathname.endsWith('/artifacts')
      ? { artifacts: artifacts.slice((Number(route.searchParams.get('page')) - 1) * 100, Number(route.searchParams.get('page')) * 100) }
      : runs[Number(route.pathname.split('/').at(-1))];
    return { ok: true, json: async () => body };
  };
}

test('increments the greatest Apple build or reservation', () => {
  assert.equal(nextIosBuildNumber('0'), 1);
  assert.equal(nextIosBuildNumber('8', [9, 10]), 11);
  assert.equal(nextIosBuildNumber('15', [9, 10]), 16);
  assert.throws(() => nextIosBuildNumber('unknown'));
  assert.throws(() => nextIosBuildNumber(Number.MAX_SAFE_INTEGER));
});

test('failed, cancelled, expired and current-run reservations remain occupied', async () => {
  const fetchImpl = api([
    artifact(9), artifact(10, { workflow_run: { id: 201 } }),
    artifact(11, { expired: true }), artifact(12, { workflow_run: { id: 202 } }),
  ], {
    200: run({ conclusion: 'failure' }),
    201: run({ conclusion: 'cancelled', event: 'workflow_dispatch' }),
    202: run({ conclusion: null, status: 'in_progress' }),
  });
  assert.deepEqual(await queryReservedIosBuildNumbers({ ...options, fetchImpl }), [9, 10, 11, 12]);
});

test('reads later pages and ignores another app version', async () => {
  const artifacts = Array.from({ length: 102 }, (_, index) => artifact(index + 1));
  artifacts.push(artifact(999, { name: 'ios-build-number-0.5.0-999' }));
  const reserved = await queryReservedIosBuildNumbers({ ...options, fetchImpl: api(artifacts) });
  assert.equal(nextIosBuildNumber(0, reserved), 103);
});

test('PR, fork and unrelated workflow artifacts do not occupy production numbers', async () => {
  const fetchImpl = api([
    artifact(8, { workflow_run: { id: 201 } }),
    artifact(9, { workflow_run: { id: 202 } }),
    artifact(10, { workflow_run: { id: 203 } }), artifact(11),
  ], {
    200: run(), 201: run({ event: 'pull_request' }),
    202: run({ head_repository: { full_name: 'contributor/rRanker' } }),
    203: run({ path: '.github/workflows/another.yml' }),
  });
  assert.deepEqual(await queryReservedIosBuildNumbers({ ...options, fetchImpl }), [11]);
});

test('API failures prevent assigning a number', async () => {
  await assert.rejects(queryReservedIosBuildNumbers({ ...options, fetchImpl: async () => ({ ok: false, status: 403 }) }), /403/);
});

test('writes the reservation and workflow outputs', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'rranker-ios-build-'));
  try {
    const output = join(directory, 'output.txt');
    const result = await reserveIosBuildNumber({
      APP_VERSION: '0.4.0', LATEST_IOS_BUILD: '8', GITHUB_REPOSITORY: repository,
      GITHUB_TOKEN: 'fixture-token', RUNNER_TEMP: directory, GITHUB_OUTPUT: output,
      BUILD_SOURCE_COMMIT: 'a'.repeat(40), GITHUB_RUN_ID: '100',
    }, { fetchImpl: api([artifact(9)]) });
    assert.equal(result.buildNumber, 10);
    assert.equal(JSON.parse(readFileSync(result.reservationPath, 'utf8')).buildNumber, '10');
    assert.match(readFileSync(output, 'utf8'), /^build_number=10\nartifact_name=ios-build-number-0.4.0-10\n/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
