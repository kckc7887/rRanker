import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPolicy } from './build-policy.mjs';

export function checkGate(needs, context, phase = 'final') {
  assert(['admission', 'final'].includes(phase), 'Invalid gate phase');
  const policy = buildPolicy(context);
  const scope = needs['changed-scope']?.outputs ?? {};
  assert(/^[a-f0-9]{40}$/.test(policy.sha), 'Invalid event source');
  assert.equal(scope.sha, policy.sha, 'Source identity changed');
  for (const key of ['build', 'production']) assert.equal(scope[key], String(policy[key]), `Invalid ${key} authorization`);
  for (const key of ['functional', 'account']) assert(['true', 'false'].includes(scope[key]), `Missing ${key} scope`);
  const functional = scope.functional === 'true';
  const account = scope.account === 'true';
  assert(functional || !account, 'Account checks require complete quality checks');
  if (context.eventName === 'workflow_dispatch' && context.event?.inputs?.['account-checks'] === 'all') {
    assert(functional && account, 'Manual all must run account checks');
  }
  const expected = {
    'changed-scope': true, 'light-check': true, quality: functional, 'android-account-recovery': account,
  };
  if (phase === 'final') Object.assign(expected, {
    'build-admission': functional,
    'android-release': functional && policy.build && policy.production,
    'ios-release': functional && policy.build && policy.production,
    'android-fork-test': functional && policy.build && !policy.production,
    'ios-fork-test': functional && policy.build && !policy.production,
    'android-smoke': functional && policy.build,
    'android-delivery': functional && policy.build,
  });
  const failures = Object.entries(expected).filter(([job, required]) => needs[job]?.result !== (required ? 'success' : 'skipped'));
  assert.equal(failures.length, 0, failures.map(([job, required]) => `${job}: expected ${required ? 'success' : 'skipped'}, received ${needs[job]?.result ?? 'missing'}`).join('\n'));
  return expected;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const expected = checkGate(JSON.parse(process.env.NEEDS_JSON), {
      eventName: process.env.GITHUB_EVENT_NAME, event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
      repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, sha: process.env.GITHUB_SHA,
    }, process.argv[2]);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, Object.entries(expected).map(([job, run]) => `- ${job}: ${run ? 'passed' : 'expected skip'}`).join('\n') + '\n');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
