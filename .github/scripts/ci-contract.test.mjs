import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { checkGate } from './ci-gate.mjs';
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
  assert.deepEqual(new Set(needs('android-account-recovery')), new Set(['changed-scope', 'quality']));
  assert.deepEqual(new Set(needs('build-admission')), new Set(['changed-scope', 'light-check', 'quality', 'android-account-recovery']));
  assert.deepEqual(new Set(needs('quality-gate')), new Set(Object.keys(workflow.jobs).filter(id => id !== 'quality-gate')));
  assert.equal(workflow.jobs['quality-gate'].if, 'always()');
  for (const id of buildJobs) {
    assert(needs(id).includes('build-admission'), `${id} bypasses complete quality gate`);
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
  const needs = { 'changed-scope': { outputs: { build, production, functional, sha: sourceSha } }, 'build-admission': { result: 'success' } };
  return buildJobs.filter(name => {
    // Evaluate only these trusted boolean guards; event contents remain values, never source text.
    const guard = pipeline.jobs[name].if.replaceAll('needs.changed-scope', "needs['changed-scope']").replaceAll('needs.build-admission', "needs['build-admission']");
    const evaluate = new Function('github', 'needs', 'startsWith', 'cancelled', `return (${guard});`);
    return evaluate(github, needs, (value, prefix) => value.startsWith(prefix), () => false);
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

test('complete gate enforces every expected result and rejects accidental skips or executions', () => {
  const sha = 'a'.repeat(40);
  const context = { eventName: 'push', repository: 'kckc7887/rRanker', ref: 'refs/heads/topic', sha,
    event: { repository: { full_name: 'kckc7887/rRanker', fork: false }, ref: 'refs/heads/topic', after: sha, deleted: false } };
  for (const functional of [false, true]) for (const account of functional ? [false, true] : [false]) {
    const needs = Object.fromEntries(Object.keys(pipeline.jobs).filter(id => id !== 'quality-gate').map(id => [id, { result: 'skipped' }]));
    needs['changed-scope'] = { result: 'success', outputs: { sha, functional: String(functional), account: String(account), build: 'true', production: 'true' } };
    needs['light-check'].result = 'success';
    for (const id of ['quality','build-admission','android-release','ios-release','android-smoke','android-delivery']) needs[id].result = functional ? 'success' : 'skipped';
    needs['android-account-recovery'].result = account ? 'success' : 'skipped';
    assert.doesNotThrow(() => checkGate(needs, context));
    for (const id of Object.keys(needs)) for (const verdict of ['failure','cancelled','skipped','success',undefined]) {
      if (verdict === needs[id].result) continue;
      const broken = structuredClone(needs); broken[id].result = verdict;
      assert.throws(() => checkGate(broken, context), undefined, `${id}: ${verdict}`);
    }
    for (const key of ['sha','functional','account','build','production']) {
      const broken = structuredClone(needs); broken['changed-scope'].outputs[key] = '';
      assert.throws(() => checkGate(broken, context), undefined, key);
    }
  }
});

test('account recovery is required by the complete gate and cannot receive production secrets', () => {
  const job = pipeline.jobs['android-account-recovery'];
  assert.match(job.if, /functional == 'true'/);
  assert.equal(job.env.BUILD_SOURCE_COMMIT, job.steps[0].with.ref);
  assert.equal(job.steps[0].with['persist-credentials'], false);
  assert.equal(job.environment, undefined);
  assert(!JSON.stringify(job).includes('secrets.'));
  assert(job.steps.some(step => step.with?.script?.includes('android-account-recovery.mjs')));
  const key = job.steps.findIndex(step => step.name === 'Generate independent test signing key');
  const compile = job.steps.findIndex(step => step.name === 'Compile account recovery APK');
  const verify = job.steps.findIndex(step => step.name === 'Verify isolated package and test signature');
  const recover = job.steps.findIndex(step => step.with?.script?.includes('android-account-recovery.mjs'));
  assert(key >= 0 && key < compile && compile < verify && verify < recover);
  assert.match(job.steps[key].run, /keytool -genkeypair/);
  assert.match(job.steps[compile].run, /android\.injected\.signing\.store\.file=\$RUNNER_TEMP\/account-probe\.keystore/);
  assert.match(job.steps[verify].run, /from android_signing import verify_android_signing/);
  assert.match(job.steps[verify].run, /'test-debug', hashlib\.sha256\(certificate\)\.hexdigest\(\)/);
  assert.match(job.steps[verify].run, /com\.rranker\.app\.nativeprobe/);
  assert.equal(job.steps.at(-1).if, 'always()');
  assert.match(job.steps.at(-1).run, /account-probe\.keystore/);
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

test('CocoaPods downloads retry interrupted transfers and clean their scoped curl policy on success and failure', async () => {
  const bash = findBash();
  assert(bash, 'bash is required');
  const step = ios.runs.steps.find(step => step.name === 'Install CocoaPods');
  assert.equal(step.env.ENTERPRISE_REPOSITORY, 'https://repo.maven.apache.org/maven2');
  const directory = mkdtempSync(join(tmpdir(), 'rranker-pods-download-'));
  let requests = 0;
  let fail = false;
  const server = createServer((request, response) => {
    assert.equal(request.httpVersion, '1.1');
    requests += 1;
    if (fail) { response.writeHead(503).end(); return; }
    if (requests === 1) {
      response.writeHead(200, { 'Content-Length': 100, Connection: 'close' });
      response.flushHeaders();
      response.end('partial');
      return;
    }
    response.end('complete artifact');
  });
  try {
    mkdirSync(join(directory, 'ios'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    // Run the decoded action verbatim; only pod itself is replaced by a real curl download.
    const pod = `pod() {
      test "$1" = install
      test "$(basename "$PWD")" = ios
      test "$ENTERPRISE_REPOSITORY" = https://repo.maven.apache.org/maven2
      cp "$CURL_HOME/.curlrc" "$CI_DOWNLOAD_REPORT"
      curl --retry-max-time 8 --max-time 2 --speed-time 1 -o "$CI_DOWNLOAD_OUTPUT" "$CI_DOWNLOAD_URL"
    }
`;
    const env = { ...process.env, ...step.env, RUNNER_TEMP: directory.replaceAll('\\', '/'),
      CI_DOWNLOAD_REPORT: join(directory, 'policy').replaceAll('\\', '/'),
      CI_DOWNLOAD_OUTPUT: join(directory, 'artifact').replaceAll('\\', '/'),
      CI_DOWNLOAD_URL: `http://127.0.0.1:${server.address().port}/artifact`,
    };
    const run = () => promisify(execFile)(bash, ['-e', '-o', 'pipefail', '-c', pod + step.run],
      { cwd: directory, env, timeout: 20_000 });
    const recovered = await run();
    assert.match(recovered.stderr, /curl: \(18\)/, 'fixture must exercise a truncated transfer, not just a timeout');
    assert.equal(requests, 2, 'partial response must be retried');
    assert.equal(readFileSync(join(directory, 'artifact'), 'utf8'), 'complete artifact', 'retry replaces partial bytes');
    const policy = readFileSync(join(directory, 'policy'), 'utf8');
    for (const setting of ['http1.1', 'fail', 'connect-timeout = 20', 'max-time = 300', 'speed-limit = 1024',
      'speed-time = 60', 'retry = 3', 'retry-all-errors', 'retry-delay = 2', 'retry-max-time = 900']) assert(policy.includes(setting), setting);
    assert(!readdirSync(directory).some(name => name.startsWith('rranker-pods-curl.')));
    fail = true;
    requests = 0;
    await assert.rejects(run(), error => error.code === 22);
    assert.equal(requests, 4, 'persistent failures must stop after the configured retries');
    assert(!readdirSync(directory).some(name => name.startsWith('rranker-pods-curl.')), 'failed installation also removes curl policy');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Android candidate, smoke and delivery retain an immutable artifact identity across reruns', () => {
  const steps = android.runs.steps;
  const index = name => steps.findIndex(step => step.name === name);
  assert(index('Verify and name APKs') < index('Seal candidate contents'));
  assert(index('Seal candidate contents') < index('Preserve verified candidate APKs'));
  assert(!steps.some(step => step.uses?.includes('emulator-runner')));
  assert.equal(steps[index('Remove temporary release keystore')].if, 'always()');
  for (const id of ['android-smoke','android-delivery']) {
    const downstream = pipeline.jobs[id];
    assert(downstream.needs.includes('android-release') && downstream.needs.includes('android-fork-test'));
    const download = downstream.steps.find(step => step.uses === 'actions/download-artifact@v4');
    assert.equal(download.with.name, '${{ needs.android-release.outputs.artifact-name || needs.android-fork-test.outputs.artifact-name }}');
    assert(!download.with.name.includes('run_attempt'), 'rerun must consume the actual earlier artifact');
    assert.equal(downstream.steps.find(step => step.name === 'Verify candidate identity and every file').env.EXPECTED_DIGEST,
      '${{ needs.android-release.outputs.manifest-digest || needs.android-fork-test.outputs.manifest-digest }}');
  }
  assert.match(pipeline.jobs['android-delivery'].if, /needs.android-smoke.result == 'success'/);
  assert(!pipeline.jobs['ios-release'].needs.includes('android-smoke'), 'platforms deliver independently');
});

test('Android share chooser accepts exact framework and IntentResolver activities', () => {
  const source = readFileSync(join(root, '.github/scripts/lib/android-smoke-flow.mjs'), 'utf8');
  const predicate = source.match(/^const isChooserActivity = \(line\) => (.+);$/m);
  assert(predicate, 'production smoke chooser predicate must exist');
  const isChooserActivity = new Function('line', `return (${predicate[1]});`);
  for (const component of [
    'android/com.android.internal.app.ChooserActivity',
    'com.android.intentresolver/.ChooserActivity',
    'com.android.intentresolver/.ChooserActivityLauncher',
    'com.android.intentresolver/com.android.intentresolver.ChooserActivity',
    'com.android.intentresolver/com.android.intentresolver.ChooserActivityLauncher',
  ]) {
    assert.equal(isChooserActivity(component), true, component);
    assert.equal(isChooserActivity(`  topResumedActivity=ActivityRecord{a u0 ${component} t1}`), true, component);
  }
});

test('Android share chooser rejects application aliases and arbitrary resolver activities', () => {
  const source = readFileSync(join(root, '.github/scripts/lib/android-smoke-flow.mjs'), 'utf8');
  const predicate = source.match(/^const isChooserActivity = \(line\) => (.+);$/m);
  assert(predicate, 'production smoke chooser predicate must exist');
  const isChooserActivity = new Function('line', `return (${predicate[1]});`);
  for (const component of [
    'com.rranker.app/.ChooserActivity',
    'com.rranker.app/com.android.intentresolver.ChooserActivityLauncher',
    'com.rranker.app/com.android.internal.app.ChooserActivity',
    'fake.android/com.android.internal.app.ChooserActivity',
    'fake.com.android.intentresolver/.ChooserActivityLauncher',
    'com.android.intentresolver.fake/.ChooserActivityLauncher',
    'com.android.intentresolver/.MainActivity',
    'com.android.intentresolver/.ResolverActivity',
    'com.android.intentresolver/com.example.ChooserActivity',
    'com.android.intentresolver/.ChooserActivityOther',
    'com.android.intentresolver/.ChooserActivityLauncherOther',
    'com.android.intentresolver/.ChooserActivity$Nested',
    'com.android.intentresolver/.ChooserActivity.Helper',
    'android/com.android.internal.app.ChooserActivityOther',
    'android/com.android.internal.app.ChooserActivity.Helper',
  ]) {
    assert.equal(isChooserActivity(component), false, component);
    assert.equal(isChooserActivity(`  topResumedActivity=ActivityRecord{a u0 ${component} t1}`), false, component);
  }
});

test('Android share chooser UI requires exact system package and enabled visible bounds', () => {
  const source = readFileSync(join(root, '.github/scripts/lib/android-smoke-flow.mjs'), 'utf8');
  const bounds = source.match(/const controlBounds = \(node\) => \{([\s\S]*?)^\};/m);
  const predicate = source.match(/const hasInteractiveChooser = \(current\) => ([\s\S]*?);\nasync function returnFromChooser/m);
  assert(bounds && predicate, 'production chooser UI predicates must exist');
  const hasInteractiveChooser = new Function(`const controlBounds = (node) => {${bounds[1]}}; return (current) => ${predicate[1]};`)();
  const enabled = { package: 'com.android.intentresolver', enabled: 'true', bounds: '[0,0][100,100]' };
  assert.equal(hasInteractiveChooser([enabled]), true);
  assert.equal(hasInteractiveChooser([{ ...enabled, package: 'android' }]), true);
  for (const invalid of [
    { ...enabled, package: 'com.rranker.app' },
    { ...enabled, package: 'com.android.intentresolver.fake' },
    { ...enabled, package: 'fake.android' },
    { ...enabled, enabled: 'false' },
    { ...enabled, enabled: true },
    { ...enabled, bounds: '' },
    { ...enabled, bounds: '[0,0][0,100]' },
    { ...enabled, bounds: '[0,0][100,0]' },
    { ...enabled, bounds: '[100,100][0,0]' },
  ]) assert.equal(hasInteractiveChooser([invalid]), false, JSON.stringify(invalid));
  assert.equal(hasInteractiveChooser([]), false);
});

test('Android share chooser waits for interactive UI before BACK and then requires MainActivity', async () => {
  const source = readFileSync(join(root, '.github/scripts/lib/android-smoke-flow.mjs'), 'utf8');
  const helper = source.match(/^async function returnFromChooser\(label\) \{([\s\S]*?)^\}/m);
  assert(helper, 'both share entries must use the production chooser return helper');
  assert(source.includes("await returnFromChooser('diagnostics');"));
  assert(source.includes("await returnFromChooser('recorded log');"));
  const ready = Promise.withResolvers();
  const waiting = Promise.withResolvers();
  const trace = [];
  const chooser = () => undefined;
  const main = () => undefined;
  const interactive = () => undefined;
  const returnFromChooser = new Function('waitForActivity', 'waitFor', 'shell', 'isChooserActivity', 'isMainActivity', 'hasInteractiveChooser',
    `return async function returnFromChooser(label) {${helper[1]}};`)(
    async (predicate) => { trace.push(predicate === chooser ? 'chooser' : predicate === main ? 'main' : 'unexpected'); },
    async (predicate) => { assert.equal(predicate, interactive); trace.push('wait-ui'); waiting.resolve(); await ready.promise; },
    (...args) => { assert.deepEqual(args, ['input', 'keyevent', 'KEYCODE_BACK']); trace.push('back'); },
    chooser, main, interactive,
  );
  const pending = returnFromChooser('diagnostics');
  await waiting.promise;
  assert.deepEqual(trace, ['chooser', 'wait-ui']);
  ready.resolve();
  await pending;
  assert.deepEqual(trace, ['chooser', 'wait-ui', 'back', 'main']);
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
