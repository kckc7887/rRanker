import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { findBash } from './lib/bash.mjs';
import { parseWorkflowYaml } from './lib/workflow-yaml.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readYaml = path => parseWorkflowYaml(readFileSync(join(root, path), 'utf8'), path).document;
const pipeline = readYaml('.github/workflows/quality.yml');
const android = readYaml('.github/actions/android-build/action.yml');
const ios = readYaml('.github/actions/ios-build/action.yml');
const buildJobs = ['android-release', 'ios-release', 'android-fork-test', 'ios-fork-test'];
const releaseJobs = buildJobs.filter(name => name.endsWith('-release'));
const testJobs = buildJobs.filter(name => name.endsWith('-fork-test'));

function assertDependencies(workflow) {
  const needs = id => [workflow.jobs[id]?.needs ?? []].flat();
  assert.deepEqual(new Set(needs('quality')), new Set(['changed-scope', 'light-check']));
  assert.deepEqual(new Set(needs('quality-gate')), new Set(['changed-scope', 'light-check', 'quality']));
  assert.equal(workflow.jobs['quality-gate'].if, 'always()');
  for (const id of buildJobs) {
    assert(needs(id).includes('quality-gate'), `${id} bypasses complete quality gate`);
    assert(needs(id).includes('changed-scope'), `${id} loses immutable source`);
    assert.match(workflow.jobs[id].if, /functional == 'true'/);
    assert(!workflow.jobs[id].if.includes('always()'), `${id} bypasses failed prerequisites`);
  }
}

function selectedJobs({ repository = 'kckc7887/rRanker', eventName = 'push', ref = 'refs/heads/topic',
  build = 'true', production = 'true', functional = 'true', base = 'master', head = 'someone/rRanker', deleted = false,
  sourceSha = 'a'.repeat(40), eventSha = 'a'.repeat(40) } = {}) {
  const github = { repository, event_name: eventName, ref, sha: eventSha,
    event: { deleted, pull_request: { base: { ref: base }, head: {
      sha: eventName === 'pull_request' ? eventSha : undefined, repo: { full_name: head } } } } };
  const needs = { 'changed-scope': { outputs: { build, production, functional, sha: sourceSha } } };
  return buildJobs.filter(name => {
    // Evaluate only these trusted boolean guards; event contents remain values, never source text.
    const guard = pipeline.jobs[name].if.replaceAll('needs.changed-scope', "needs['changed-scope']");
    const evaluate = new Function('github', 'needs', 'startsWith', `return (${guard});`);
    return evaluate(github, needs, (value, prefix) => value.startsWith(prefix));
  });
}

test('one branch/PR entry owns all complete checks and platform dependencies', () => {
  assertDependencies(pipeline);
  assert.deepEqual(pipeline.on.push.branches, ['**']);
  assert('pull_request' in pipeline.on);
  assert(pipeline.on.pull_request.types.includes('edited'), 'retargeted PRs must be reclassified');
  assert('workflow_dispatch' in pipeline.on);
  for (const filename of readdirSync(join(root, '.github/workflows'))) {
    const workflow = readYaml(`.github/workflows/${filename}`);
    assert(!('workflow_run' in workflow.on));
    assert(!('pull_request_target' in workflow.on));
    if (filename !== 'quality.yml') {
      assert(!('push' in workflow.on));
      assert(!('pull_request' in workflow.on));
    }
  }
  const runs = pipeline.jobs.quality.steps.map(step => step.run).filter(Boolean);
  for (const required of ['npm ci', 'npm run lint', 'npm run typecheck', 'npm test',
    'npm run check:architecture', 'npm run check:generated', 'npm audit', 'npm run audit:prod']) {
    assert.equal(runs.filter(run => run === required).length, 1, required);
  }
});

test('dependency contract rejects removal of light check or complete gate', () => {
  for (const mutate of [
    workflow => { workflow.jobs.quality.needs = ['changed-scope']; },
    workflow => { workflow.jobs['ios-release'].needs = ['changed-scope']; },
    workflow => { workflow.jobs['android-release'].if = 'always()'; },
  ]) {
    const broken = structuredClone(pipeline);
    mutate(broken);
    assert.throws(() => assertDependencies(broken));
  }
});

for (const [name, context, expected] of [
  ['master push', { ref: 'refs/heads/master' }, releaseJobs],
  ['nested branch push', { ref: 'refs/heads/origin/android-recovery' }, releaseJobs],
  ['manual branch run', { eventName: 'workflow_dispatch' }, releaseJobs],
  ['same repository PR', { eventName: 'pull_request', ref: 'refs/pull/1/merge', production: 'false', head: 'kckc7887/rRanker', build: 'false' }, []],
  ['fork push', { repository: 'someone/rRanker', production: 'false', build: 'false' }, []],
  ['fork PR to master', { eventName: 'pull_request', ref: 'refs/pull/1/merge', production: 'false' }, testJobs],
  ['fork PR to topic', { eventName: 'pull_request', ref: 'refs/pull/1/merge', production: 'false', base: 'topic', build: 'false' }, []],
  ['docs-only push', { functional: 'false' }, []],
  ['deleted branch', { deleted: true }, []],
  ['tag cannot publish even with forged flags', { ref: 'refs/tags/v1' }, []],
  ['fork cannot publish even with forged flags', { repository: 'someone/rRanker' }, []],
  ['PR cannot publish even with forged flags', { eventName: 'pull_request', ref: 'refs/pull/1/merge' }, []],
  ['privileged event cannot publish', { eventName: 'workflow_run' }, []],
  ['policy cannot substitute another push source', { sourceSha: 'b'.repeat(40) }, []],
  ['policy cannot substitute another PR source', { eventName: 'pull_request', ref: 'refs/pull/1/merge', production: 'false', sourceSha: 'b'.repeat(40) }, []],
]) test(`actual job guards: ${name}`, () => assert.deepEqual(selectedJobs(context), expected));

test('fork jobs cannot enter a secret environment or receive production variables', () => {
  for (const id of testJobs) {
    const job = pipeline.jobs[id];
    assert.equal(job.environment, undefined);
    assert.deepEqual(Object.keys(job.env).sort(), ['BUILD_SOURCE_COMMIT', 'NODE_ENV']);
    assert(!JSON.stringify(job).includes('secrets.'));
    assert.equal(job.permissions, undefined);
    assert.equal(job.steps.at(-1).with.production, 'false');
  }
  for (const id of releaseJobs) {
    assert.equal(pipeline.jobs[id].environment, 'production-release');
    assert.equal(pipeline.jobs[id].steps.at(-1).with.production, 'true');
  }
  for (const id of buildJobs) {
    const job = pipeline.jobs[id];
    assert.equal(job.steps[0].with.ref, '${{ needs.changed-scope.outputs.sha }}');
    assert.equal(job.steps[0].with['persist-credentials'], false);
    assert.equal(job.steps.at(-1).with['source-sha'], job.steps[0].with.ref);
    assert.equal(job.env.BUILD_SOURCE_COMMIT, job.steps[0].with.ref);
  }
});

test('complete gate fails on upstream failures, missing verdicts and false skip success', () => {
  const bash = findBash();
  assert(bash, 'bash is required');
  const directory = mkdtempSync(join(tmpdir(), 'rranker-ci-gate-'));
  try {
    for (const [scope, light, quality, functional, success] of [
      ['success', 'success', 'success', 'true', true],
      ['success', 'success', 'skipped', 'false', true],
      ['failure', 'success', 'skipped', 'false', false],
      ['success', 'failure', 'skipped', 'true', false],
      ['success', 'success', 'skipped', 'true', false],
      ['success', 'success', 'failure', 'true', false],
      ['success', 'success', 'cancelled', 'true', false],
      ['success', 'success', 'success', '', false],
    ]) {
      const result = spawnSync(bash, ['-e', '-c', pipeline.jobs['quality-gate'].steps[0].run], {
        encoding: 'utf8', env: { ...process.env, SCOPE_RESULT: scope, LIGHT_RESULT: light,
          QUALITY_RESULT: quality, FUNCTIONAL: functional,
          ACTUAL_SOURCE: 'a'.repeat(40), EXPECTED_SOURCE: 'a'.repeat(40),
          GITHUB_STEP_SUMMARY: join(directory, 'summary').replaceAll('\\', '/') },
      });
      assert.equal(result.status === 0, success, JSON.stringify([scope, light, quality, functional]));
    }
    const substituted = spawnSync(bash, ['-e', '-c', pipeline.jobs['quality-gate'].steps[0].run], {
      encoding: 'utf8', env: { ...process.env, ACTUAL_SOURCE: 'b'.repeat(40), EXPECTED_SOURCE: 'a'.repeat(40),
        SCOPE_RESULT: 'success', LIGHT_RESULT: 'success', QUALITY_RESULT: 'success', FUNCTIONAL: 'true' },
    });
    assert.notEqual(substituted.status, 0, 'another source must fail even when all checks claim success');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Apple cleanup removes a partially written key before its path was published', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rranker-signing-cleanup-'));
  try {
    const key = join(directory, '.appstoreconnect/private_keys/AuthKey_KEY1.p8');
    mkdirSync(dirname(key), { recursive: true });
    writeFileSync(key, 'incomplete test key');
    const cleanup = ios.runs.steps.find(step => step.name === 'Cleanup Apple signing files').run;
    const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      cleanup.replaceAll('$HOME', '$env:CI_TEST_HOME')], {
      encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: directory, CI_TEST_HOME: directory,
        ASC_KEY_ID: 'KEY1', ASC_KEY_PATH: '', INSTALLED_PROFILE_PATH: '' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert(!existsSync(key), 'partial private key must be removed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('iOS reservations gate archive and IPA artifacts precede TestFlight', () => {
  assert.deepEqual(pipeline.jobs['ios-release'].concurrency,
    { group: 'rranker-ios-testflight', 'cancel-in-progress': false, queue: 'max' });
  const steps = ios.runs.steps;
  const index = name => steps.findIndex(step => step.name === name);
  const reserve = index('Persist build number reservation before signing');
  assert(reserve >= 0 && reserve < index('Archive'));
  assert.equal(steps[reserve]['continue-on-error'], undefined);
  assert(index('Upload IPA artifact') < index('Upload to TestFlight'));
  for (const name of ['Prepare App Store Connect API key', 'Read latest TestFlight build number',
    'Reserve unique TestFlight build number', 'Install Apple signing credentials', 'Upload to TestFlight']) {
    assert.equal(steps[index(name)].if, "inputs.production == 'true'", name);
  }
  assert.equal(steps[index('Cleanup Apple signing files')].if, "always() && inputs.production == 'true'");
  const latest = steps[index('Read latest TestFlight build number')].run;
  assert(latest.includes('print(latest_build)'));
  assert(!latest.includes('print(latest_build + 1)'));
  const python = latest.match(/@'\n([\s\S]*?)\n'@/)[1];
  const compiled = spawnSync('python', ['-c', 'import sys; compile(sys.stdin.read(), "ASC query", "exec")'],
    { input: python, encoding: 'utf8' });
  assert.equal(compiled.status, 0, compiled.stderr);
});

test('Android artifacts require APK verification and production-route smoke', () => {
  const steps = android.runs.steps;
  const index = name => steps.findIndex(step => step.name === name);
  assert(index('Verify and name APKs') < index('Release smoke through production routes'));
  assert(index('Release smoke through production routes') < index('Upload verified APKs'));
  assert.equal(steps[index('Upload verified APKs')].if, undefined);
  assert.equal(steps[index('Remove temporary release keystore')].if, 'always()');
});

test('Android publication reuses the pinned legacy identity without new keystore secrets', () => {
  const job = pipeline.jobs['android-release'];
  const inputs = job.steps.at(-1).with;
  assert.equal(inputs['signing-mode'], 'legacy-debug');
  assert.match(inputs['expected-certificate-sha256'], /^[a-f0-9]{64}$/);
  assert(!JSON.stringify(job).includes('ANDROID_KEYSTORE_'));
  assert(!JSON.stringify(job).includes('ANDROID_KEY_ALIAS'));
  assert(!JSON.stringify(job).includes('ANDROID_KEY_PASSWORD'));
  const verification = android.runs.steps.find(step => step.name === 'Verify and name APKs');
  assert.equal(verification.env.EXPECTED_CERTIFICATE_SHA256, '${{ inputs.expected-certificate-sha256 }}');
});

test('Android source gate requires explicit signing mode and a legacy certificate pin', () => {
  const bash = findBash();
  assert(bash, 'bash is required');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  const script = android.runs.steps.find(step => step.name === 'Verify build source').run;
  for (const [production, mode, pin, success] of [
    ['true', 'legacy-debug', 'a'.repeat(64), true],
    ['true', 'legacy-debug', '', false],
    ['true', 'legacy-debug', 'not-a-certificate', false],
    ['true', 'release', '', false],
    ['true', 'test-debug', '', false],
    ['false', 'legacy-debug', 'a'.repeat(64), false],
    ['false', 'test-debug', '', true],
    ['false', 'unknown', '', false],
  ]) {
    const result = spawnSync(bash, ['-e', '-c', script], {cwd: root, encoding: 'utf8', env: {
      ...process.env, SOURCE_SHA: sha, GITHUB_SHA: sha, GITHUB_REPOSITORY: 'kckc7887/rRanker',
      GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/topic', PRODUCTION_SIGNING_READY: 'true',
      PRODUCTION_BUILD: production, SIGNING_MODE: mode, EXPECTED_CERTIFICATE_SHA256: pin,
      ANDROID_KEYSTORE_BASE64: '', ANDROID_KEYSTORE_PASSWORD: '', ANDROID_KEY_ALIAS: '', ANDROID_KEY_PASSWORD: '',
    }});
    assert.equal(result.status === 0, success, `${production}:${mode}:${pin}`);
  }
});
