import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPolicy } from './build-policy.mjs';

const repository = 'kckc7887/rRanker';
const sha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const branch = (eventName, ref = 'refs/heads/master', owner = repository) => ({
  eventName, ref, repository: owner, sha, event: {},
});
const pr = (base, owner = 'contributor/rRanker', repo = repository) => ({
  eventName: 'pull_request', repository: repo, sha, ref: 'refs/pull/7/merge',
  event: { pull_request: { base: { ref: base }, head: { sha: headSha, repo: { full_name: owner } } } },
});

for (const [name, context, build, production, source] of [
  ['official branch push', branch('push'), true, true, sha],
  ['official topic push', branch('push', 'refs/heads/topic'), true, true, sha],
  ['manual branch build', branch('workflow_dispatch'), true, true, sha],
  ['tag dispatch', branch('workflow_dispatch', 'refs/tags/v1'), false, false, sha],
  ['fork push', branch('push', 'refs/heads/master', 'contributor/rRanker'), false, false, sha],
  ['fork dispatch', branch('workflow_dispatch', 'refs/heads/master', 'contributor/rRanker'), false, false, sha],
  ['deleted branch', { ...branch('push'), event: { deleted: true } }, false, false, sha],
  ['same repository PR', pr('master', repository), false, false, headSha],
  ['fork PR to master', pr('master'), true, false, headSha],
  ['fork PR to topic', pr('topic'), false, false, headSha],
  ['PR in fork repository', pr('master', 'contributor/rRanker', 'contributor/rRanker'), false, false, headSha],
]) {
  test(name, () => assert.deepEqual(buildPolicy(context), { build, production, sha: source }));
}
