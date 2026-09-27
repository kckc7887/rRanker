import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildPolicy } from './build-policy.mjs';

const repository = 'kckc7887/rRanker';
const sha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const baseSha = 'c'.repeat(40);
const official = { full_name: repository, fork: false, id: 1 };
const fork = { full_name: 'contributor/rRanker', fork: true, id: 2 };
const denied = { build: false, production: false, sha: '' };

function push(branch = 'master', repo = official) {
  const ref = `refs/heads/${branch}`;
  return { eventName: 'push', repository: repo.full_name, ref, sha,
    event: { repository: { ...repo }, ref, after: sha, deleted: false } };
}

function dispatch(branch = 'master', repo = official) {
  return { eventName: 'workflow_dispatch', repository: repo.full_name, ref: `refs/heads/${branch}`, sha,
    event: { repository: { ...repo }, ref: branch } };
}

function pullRequest(base = 'master', head = fork, repo = official) {
  return { eventName: 'pull_request', repository: repo.full_name, ref: 'refs/pull/7/merge', sha,
    event: { repository: { ...repo }, number: 7, pull_request: { number: 7,
      base: { repo: { ...repo }, ref: base, sha: baseSha },
      head: { repo: { ...head }, ref: 'topic', sha: headSha } } } };
}

for (const [name, context, expected] of [
  ['master push', push(), { build: true, production: true, sha }],
  ['topic push', push('topic'), { build: true, production: true, sha }],
  ['nested branch push', push('origin/feature/nested'), { build: true, production: true, sha }],
  ['master dispatch', dispatch(), { build: true, production: true, sha }],
  ['topic dispatch', dispatch('topic'), { build: true, production: true, sha }],
  ['fork push', push('master', fork), { build: false, production: false, sha }],
  ['fork dispatch', dispatch('master', fork), { build: false, production: false, sha }],
  ['another original repository push', push('master', { ...fork, fork: false }),
    { build: false, production: false, sha }],
  ['same repository PR to master', pullRequest('master', official),
    { build: false, production: false, sha: headSha }],
  ['same repository PR to topic', pullRequest('topic', official),
    { build: false, production: false, sha: headSha }],
  ['fork PR to master', pullRequest(), { build: true, production: false, sha: headSha }],
  ['fork PR to topic', pullRequest('topic'), { build: false, production: false, sha: headSha }],
  ['PR in a fork repository', pullRequest('master', fork, fork),
    { build: false, production: false, sha: headSha }],
]) {
  test(`event matrix: ${name}`, () => assert.deepEqual(buildPolicy(context), expected));
}

for (const eventName of ['workflow_run', 'pull_request_target', 'release', 'schedule', undefined]) {
  test(`unsupported event cannot authorize a build: ${eventName}`, () => {
    const context = push();
    context.eventName = eventName;
    context.event.workflow_run = { conclusion: 'success', event: 'push', head_branch: 'master',
      head_repository: official, head_sha: sha };
    assert.deepEqual(buildPolicy(context), denied);
  });
}

for (const [name, mutate] of [
  ['missing event', (context) => { context.event = undefined; }],
  ['null event', (context) => { context.event = null; }],
  ['missing repository', (context) => { delete context.event.repository; }],
  ['repository as array', (context) => { context.event.repository = []; }],
  ['repository context differs', (context) => { context.repository = fork.full_name; }],
  ['repository payload differs', (context) => { context.event.repository = fork; }],
  ['missing fork flag', (context) => { delete context.event.repository.fork; }],
  ['official repository marked fork', (context) => { context.event.repository.fork = true; }],
  ['repository name contradicts full name', (context) => { context.event.repository.name = 'different'; }],
  ['repository owner contradicts full name', (context) => { context.event.repository.owner = { login: 'different' }; }],
  ['deleted branch', (context) => { context.event.deleted = true; }],
  ['missing deletion state', (context) => { delete context.event.deleted; }],
  ['push ref differs', (context) => { context.event.ref = 'refs/heads/topic'; }],
  ['push SHA differs', (context) => { context.event.after = headSha; }],
  ['missing push SHA', (context) => { delete context.event.after; }],
]) {
  test(`push rejects malformed source: ${name}`, () => {
    const context = push();
    mutate(context);
    assert.deepEqual(buildPolicy(context), denied);
  });
}

for (const ref of ['refs/tags/v1', 'master', 'refs/heads/', 'refs/heads/a..b', 'refs/heads/a//b',
  'refs/heads/.hidden', 'refs/heads/a.lock', 'refs/heads/a.', 'refs/heads/a@{b', 'refs/heads/a b',
  'refs/heads/a\nb', 'refs/heads/a\\b', 'refs/heads/a[b', 'refs/heads/a*b', undefined, 7]) {
  test(`push and dispatch reject an invalid branch ref: ${String(ref)}`, () => {
    for (const context of [push(), dispatch()]) {
      context.ref = ref;
      context.event.ref = ref;
      assert.deepEqual(buildPolicy(context), denied);
    }
  });
}

for (const invalidSha of ['', 'master', 'a'.repeat(39), 'a'.repeat(41), 'A'.repeat(40),
  'g'.repeat(40), '0'.repeat(40), `${'a'.repeat(40)}\n`, undefined, 7]) {
  test(`all events reject an invalid context SHA: ${String(invalidSha)}`, () => {
    for (const context of [push(), dispatch(), pullRequest(), push('topic', fork)]) {
      context.sha = invalidSha;
      if (context.eventName === 'push') context.event.after = invalidSha;
      assert.deepEqual(buildPolicy(context), denied);
    }
  });
  test(`PR rejects an invalid base or head SHA: ${String(invalidSha)}`, () => {
    for (const field of ['base', 'head']) {
      const context = pullRequest();
      context.event.pull_request[field].sha = invalidSha;
      assert.deepEqual(buildPolicy(context), denied);
    }
  });
}

for (const [name, mutate] of [
  ['missing PR', (context) => { delete context.event.pull_request; }],
  ['missing head repository', (context) => { context.event.pull_request.head.repo = null; }],
  ['missing base repository', (context) => { context.event.pull_request.base.repo = null; }],
  ['base repository differs from event', (context) => { context.event.pull_request.base.repo = { ...fork }; }],
  ['base repository id differs', (context) => { context.event.pull_request.base.repo.id = 3; }],
  ['head claims a non-fork external repository', (context) => { context.event.pull_request.head.repo.fork = false; }],
  ['head claims same full name with a different id', (context) => {
    context.event.pull_request.head.repo = { ...official, id: 3 };
  }],
  ['head claims same full name with a different fork flag', (context) => {
    context.event.pull_request.head.repo = { ...official, fork: true };
  }],
  ['head claims another repository with the base id', (context) => {
    context.event.pull_request.head.repo.id = official.id;
  }],
  ['PR ref is a tag', (context) => { context.ref = 'refs/tags/v1'; }],
  ['PR ref is a branch', (context) => { context.ref = 'refs/heads/master'; }],
  ['PR ref belongs to another PR', (context) => { context.ref = 'refs/pull/8/merge'; }],
  ['event PR number differs', (context) => { context.event.number = 8; }],
  ['payload PR number differs', (context) => { context.event.pull_request.number = 8; }],
  ['missing event PR number', (context) => { delete context.event.number; }],
  ['empty base branch', (context) => { context.event.pull_request.base.ref = ''; }],
  ['missing base branch', (context) => { delete context.event.pull_request.base.ref; }],
  ['missing head branch', (context) => { delete context.event.pull_request.head.ref; }],
  ['invalid head branch', (context) => { context.event.pull_request.head.ref = 'a..b'; }],
]) {
  test(`PR rejects malformed identity: ${name}`, () => {
    const context = pullRequest();
    mutate(context);
    assert.deepEqual(buildPolicy(context), denied);
  });
}

test('dispatch verifies its payload ref without accepting inputs as authorization', () => {
  for (const payloadRef of ['topic', 'refs/heads/topic', undefined]) {
    const context = dispatch('topic');
    context.event.ref = payloadRef;
    context.event.inputs = { production: false, source_sha: headSha };
    assert.deepEqual(buildPolicy(context), { build: true, production: true, sha });
  }
  for (const update of [{ ref: 'master' }, { ref: 'refs/tags/v1' }, { deleted: true }]) {
    const context = dispatch('topic');
    Object.assign(context.event, update);
    assert.deepEqual(buildPolicy(context), denied);
  }
});

test('an artifact or payload production claim does not change PR trust', () => {
  for (const context of [pullRequest(), pullRequest('topic'), pullRequest('master', official)]) {
    context.event.production = true;
    context.event.build_policy = { production: true, repository, sha };
    const result = buildPolicy(context);
    assert.equal(result.production, false);
    assert.equal(result.sha, headSha);
  }
});

test('a fork branch named master does not grant a build for another target branch', () => {
  const context = pullRequest('topic');
  context.event.pull_request.head.ref = 'master';
  assert.deepEqual(buildPolicy(context), { build: false, production: false, sha: headSha });
});

test('complete repository metadata agrees with source identity', () => {
  const context = push();
  context.event.repository.name = 'rRanker';
  context.event.repository.owner = { login: 'kckc7887' };
  assert.deepEqual(buildPolicy(context), { build: true, production: true, sha });
});

function runCli(context, eventText) {
  const directory = mkdtempSync(join(tmpdir(), 'rranker-build-policy-'));
  const eventPath = join(directory, 'event.json');
  const outputPath = join(directory, 'output.txt');
  try {
    writeFileSync(eventPath, eventText ?? JSON.stringify(context.event));
    writeFileSync(outputPath, '');
    const result = spawnSync(process.execPath,
      [fileURLToPath(new URL('./build-policy.mjs', import.meta.url))], {
        encoding: 'utf8', env: { ...process.env,
          GITHUB_EVENT_NAME: context.eventName, GITHUB_EVENT_PATH: eventPath,
          GITHUB_REPOSITORY: context.repository, GITHUB_REF: context.ref,
          GITHUB_SHA: context.sha, GITHUB_OUTPUT: outputPath },
      });
    return { ...result, output: readFileSync(outputPath, 'utf8') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('CLI writes only verified flags and the actual PR source SHA', () => {
  for (const context of [push(), push('topic', fork), pullRequest(), pullRequest('topic')]) {
    context.event.unrelated = 'event-field-that-must-not-be-logged';
    const expected = buildPolicy(context);
    const result = runCli(context);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(result.output, `build=${expected.build}\nproduction=${expected.production}\nsha=${expected.sha}\n`);
  }
});

test('CLI rejects invalid JSON and invalid source without logging the event', () => {
  for (const eventText of ['{"event-field-that-must-not-be-logged":', '{}']) {
    const result = runCli(push(), eventText);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Build policy event could not be validated.\n');
    assert.equal(result.output, '');
  }
});
