import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function buildPolicy({ eventName, event, repository, ref, sha }) {
  const official = repository === 'kckc7887/rRanker';
  if (eventName === 'pull_request') {
    const pr = event.pull_request;
    return {
      build: official && pr.head.repo.full_name !== repository && pr.base.ref === 'master',
      production: false,
      sha: pr.head.sha,
    };
  }
  const branchBuild = (eventName === 'push' || eventName === 'workflow_dispatch') &&
    ref.startsWith('refs/heads/') && !event.deleted;
  return { build: official && branchBuild, production: official && branchBuild, sha };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const policy = buildPolicy({
      eventName: process.env.GITHUB_EVENT_NAME,
      event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
    });
    appendFileSync(process.env.GITHUB_OUTPUT,
      `build=${policy.build}\nproduction=${policy.production}\nsha=${policy.sha}\n`);
  } catch (error) {
    process.stderr.write(`Build policy failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
