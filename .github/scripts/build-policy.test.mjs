import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPolicy } from './build-policy.mjs';

const sha = 'a'.repeat(40);
const repository = 'owner/repo';
const context = { repository, sha, ref: 'refs/heads/master' };
const run = { conclusion: 'success', head_repository: { full_name: repository },
  head_sha: sha, event: 'push', head_branch: 'master' };

test('only a successful master push can publish after Quality', () => {
  assert.deepEqual(buildPolicy({ ...context, eventName: 'workflow_run', event: { workflow_run: run } }),
    { build: true, production: true, sha });
  for (const update of [{ head_branch: 'topic' }, { event: 'pull_request' }]) {
    assert.deepEqual(buildPolicy({ ...context, eventName: 'workflow_run', event: { workflow_run: { ...run, ...update } } }),
      { build: true, production: false, sha });
  }
});

test('failed, fork and unsupported runs cannot build', () => {
  for (const update of [{ conclusion: 'failure' }, { head_repository: { full_name: 'fork/repo' } },
    { event: 'pull_request_target' }]) {
    assert.deepEqual(buildPolicy({ ...context, eventName: 'workflow_run', event: { workflow_run: { ...run, ...update } } }),
      { build: false, production: false, sha: '' });
  }
});

test('manual builds use an immutable SHA and tags never publish', () => {
  assert.deepEqual(buildPolicy({ ...context, eventName: 'workflow_dispatch', event: {} }),
    { build: true, production: true, sha });
  assert.deepEqual(buildPolicy({ ...context, ref: 'refs/heads/topic', eventName: 'workflow_dispatch', event: {} }),
    { build: true, production: false, sha });
  assert.equal(buildPolicy({ ...context, ref: 'refs/tags/v1', eventName: 'workflow_dispatch', event: {} }).build, false);
  assert.throws(() => buildPolicy({ ...context, sha: 'master', eventName: 'workflow_dispatch', event: {} }), /SHA/);
});
