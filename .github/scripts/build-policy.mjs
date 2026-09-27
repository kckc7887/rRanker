import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function buildPolicy({ eventName, event, repository, ref, sha }) {
  const skipped = { build: false, production: false, sha: '' };
  let source;
  let production = false;
  if (eventName === 'workflow_run') {
    const run = event.workflow_run;
    if (!run || run.conclusion !== 'success' || run.head_repository?.full_name !== repository ||
        !['push', 'pull_request'].includes(run.event)) return skipped;
    source = run.head_sha;
    production = run.event === 'push' && run.head_branch === 'master';
  } else if (eventName === 'workflow_dispatch' && ref?.startsWith('refs/heads/')) {
    source = sha;
    production = ref === 'refs/heads/master';
  } else return skipped;
  if (!/^[a-f0-9]{40}$/.test(source ?? '')) throw new Error('Invalid build source SHA');
  return { build: true, production, sha: source };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const policy = buildPolicy({
    eventName: process.env.GITHUB_EVENT_NAME,
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
  });
  appendFileSync(process.env.GITHUB_OUTPUT,
    `build=${policy.build}\nproduction=${policy.production}\nsha=${policy.sha}\n`);
}
