import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const repository = 'kckc7887/rRankerResourcePublisher';

export async function publishRelease(event) {
  if (event.action !== 'published' || event.repository?.full_name !== 'kckc7887/rRanker'
      || event.release?.draft !== false || event.release?.prerelease !== false
      || !Number.isSafeInteger(event.release.id) || event.release.id <= 0) {
    throw new Error('Only a published formal rRanker Release can be mirrored');
  }
  const token = process.env.RESOURCE_PUBLISHER_TOKEN;
  if (!token) throw new Error('Missing RESOURCE_PUBLISHER_TOKEN');
  const request = async (path, options = {}) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Resource publisher request failed: HTTP ${response.status}`);
    return response.json();
  };
  const run = await request('actions/workflows/apk.yml/dispatches', { method: 'POST',
    body: JSON.stringify({ ref: 'master', inputs: { release_id: String(event.release.id) } }) });
  if (!Number.isSafeInteger(run.workflow_run_id)) throw new Error('Dispatch did not return a workflow run ID');
  console.log(`Resource publisher: https://github.com/${repository}/actions/runs/${run.workflow_run_id}`);
  const deadline = Date.now() + 90 * 60_000;
  while (Date.now() < deadline) {
    const status = await request(`actions/runs/${run.workflow_run_id}`);
    if (status.status === 'completed') {
      if (status.conclusion !== 'success') throw new Error(`APK publication ${status.conclusion}`);
      return run.workflow_run_id;
    }
    await delay(60_000);
  }
  throw new Error('APK publication timed out; inspect the dispatched run');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await publishRelease(JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')));
}
