import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { publishRelease } from './publish-release.mjs';

const originalFetch = globalThis.fetch;
const originalToken = process.env.RESOURCE_PUBLISHER_TOKEN;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.RESOURCE_PUBLISHER_TOKEN;
  else process.env.RESOURCE_PUBLISHER_TOKEN = originalToken;
});
const event = { action: 'published', repository: { full_name: 'kckc7887/rRanker' }, release: { id: 123, draft: false, prerelease: false } };

test('dispatches only the Release ID and follows the returned run', async () => {
  process.env.RESOURCE_PUBLISHER_TOKEN = 'fixture';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json(calls.length === 1 ? { workflow_run_id: 456 } : { status: 'completed', conclusion: 'success' });
  };
  assert.equal(await publishRelease(event), 456);
  assert.deepEqual(JSON.parse(calls[0].options.body), { ref: 'master', inputs: { release_id: '123' } });
  assert.match(calls[1].url, /actions\/runs\/456$/);
});

test('rejects drafts, prereleases, other repositories and branch events before dispatch', async () => {
  globalThis.fetch = async () => { throw new Error('must not dispatch'); };
  for (const input of [{}, { ...event, action: 'created' }, { ...event, repository: { full_name: 'other/repo' } },
    { ...event, release: { ...event.release, draft: true } }, { ...event, release: { ...event.release, prerelease: true } }]) {
    await assert.rejects(publishRelease(input), /Only a published/);
  }
});

test('propagates a failed child run', async () => {
  process.env.RESOURCE_PUBLISHER_TOKEN = 'fixture';
  globalThis.fetch = async url => Response.json(url.endsWith('/dispatches') ? { workflow_run_id: 456 }
    : { status: 'completed', conclusion: 'failure' });
  await assert.rejects(publishRelease(event), /publication failure/);
});
