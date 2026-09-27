import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const productionRepository = 'kckc7887/rRanker';

function validSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0{40}$/.test(value);
}

function validBranchRef(value) {
  if (typeof value !== 'string' || !value.startsWith('refs/heads/')) return false;
  const branch = value.slice('refs/heads/'.length);
  return branch.length > 0 && !branch.endsWith('.') && !branch.includes('..') &&
    !branch.includes('@{') && !/[\x00-\x20\x7f~^:?*\[\\]/.test(branch) &&
    branch.split('/').every((part) => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock'));
}

function repositoryIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.full_name !== 'string' || typeof value.fork !== 'boolean' ||
      !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(value.full_name) ||
      (value.id !== undefined && (!Number.isSafeInteger(value.id) || value.id <= 0))) return null;
  const [owner, name] = value.full_name.split('/');
  if ((value.name !== undefined && value.name !== name) ||
      (value.owner !== undefined && value.owner?.login !== owner)) return null;
  return value;
}

function sameRepository(left, right) {
  return left.full_name === right.full_name && left.fork === right.fork &&
    (left.id === undefined || right.id === undefined || left.id === right.id);
}

export function buildPolicy({ eventName, event, repository, ref, sha } = {}) {
  const skipped = { build: false, production: false, sha: '' };
  const eventRepository = repositoryIdentity(event?.repository);
  if (!eventRepository || eventRepository.full_name !== repository || !validSha(sha) ||
      (repository === productionRepository && eventRepository.fork)) return skipped;
  const official = repository === productionRepository;

  if (eventName === 'push' || eventName === 'workflow_dispatch') {
    if (!validBranchRef(ref) || event?.deleted === true) return skipped;
    if (eventName === 'push' &&
        (event?.deleted !== false || event.ref !== ref || event.after !== sha)) return skipped;
    if (eventName === 'workflow_dispatch' && event.ref !== undefined &&
        event.ref !== ref && event.ref !== ref.slice('refs/heads/'.length)) return skipped;
    return { build: official, production: official, sha };
  }

  if (eventName !== 'pull_request') return skipped;
  const pullRequest = event?.pull_request;
  const baseRepository = repositoryIdentity(pullRequest?.base?.repo);
  const headRepository = repositoryIdentity(pullRequest?.head?.repo);
  const pullRef = typeof ref === 'string' && /^refs\/pull\/([1-9]\d*)\/merge$/.exec(ref);
  if (!baseRepository || !headRepository || !sameRepository(baseRepository, eventRepository) ||
      !pullRef || !Number.isSafeInteger(event?.number) || event.number !== Number(pullRef[1]) ||
      (pullRequest.number !== undefined && pullRequest.number !== event.number) ||
      typeof pullRequest.base.ref !== 'string' || typeof pullRequest.head.ref !== 'string' ||
      !validBranchRef(`refs/heads/${pullRequest.base.ref}`) ||
      !validBranchRef(`refs/heads/${pullRequest.head.ref}`) ||
      !validSha(pullRequest.base.sha) || !validSha(pullRequest.head.sha)) return skipped;
  const sameHead = sameRepository(headRepository, eventRepository);
  if ((headRepository.full_name === repository && !sameHead) ||
      (headRepository.id !== undefined && headRepository.id === eventRepository.id && !sameHead) ||
      (official && !sameHead && !headRepository.fork)) return skipped;
  return {
    build: official && !sameHead && pullRequest.base.ref === 'master',
    production: false,
    sha: pullRequest.head.sha,
  };
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
    if (!validSha(policy.sha)) throw new Error('Invalid policy source');
    appendFileSync(process.env.GITHUB_OUTPUT,
      `build=${policy.build}\nproduction=${policy.production}\nsha=${policy.sha}\n`);
  } catch {
    process.stderr.write('Build policy event could not be validated.\n');
    process.exitCode = 1;
  }
}
