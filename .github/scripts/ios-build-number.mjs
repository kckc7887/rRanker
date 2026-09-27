import { appendFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const trustedRepository = 'kckc7887/rRanker';
const trustedWorkflow = '.github/workflows/quality.yml';
const apiOrigin = 'https://api.github.com';
const pageSize = 100;

function validSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0{40}$/.test(value);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positiveId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function integer(value, allowZero = false) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1)) return value;
  } else if (typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= (allowZero ? 0 : 1)) return parsed;
  }
  throw new Error('Invalid iOS build number.');
}

function validVersion(value) {
  return typeof value === 'string' && value.length <= 64 &&
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value);
}

export function nextIosBuildNumber(latestBuild, reservedBuilds = []) {
  if (!Array.isArray(reservedBuilds)) throw new Error('Invalid iOS reservations.');
  let greatest = integer(latestBuild, true);
  for (const reserved of reservedBuilds) greatest = Math.max(greatest, integer(reserved));
  if (greatest === Number.MAX_SAFE_INTEGER) throw new Error('iOS build number exhausted.');
  return greatest + 1;
}

function trustedRun(run, repositoryId, runId) {
  return object(run) && run.id === runId && run.path === trustedWorkflow &&
    ['push', 'workflow_dispatch'].includes(run.event) && validSha(run.head_sha) &&
    object(run.repository) && object(run.head_repository) &&
    run.repository.id === repositoryId && run.head_repository.id === repositoryId &&
    run.repository.full_name === trustedRepository &&
    run.head_repository.full_name === trustedRepository &&
    run.repository.fork === false && run.head_repository.fork === false;
}

// Hold the global iOS publishing lock through reservation upload and Apple submission.
export async function queryReservedIosBuildNumbers({
  appVersion,
  sourceCommit,
  repository,
  runId,
  token,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = 15_000,
  queryTimeoutMs = 120_000,
  maxPages = 1_000,
} = {}) {
  if (repository !== trustedRepository || !validVersion(appVersion) || !validSha(sourceCommit) ||
      typeof token !== 'string' || token.length === 0 || /[\r\n]/.test(token) ||
      typeof fetchImpl !== 'function' || !positiveId(requestTimeoutMs) ||
      !positiveId(queryTimeoutMs) || !positiveId(maxPages)) {
    throw new Error('Invalid iOS reservation query configuration.');
  }
  const currentRunId = integer(runId);
  const deadline = Date.now() + queryTimeoutMs;

  async function readApi(path) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('GitHub reservation query timed out.');
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('GitHub reservation request timed out.'));
      }, Math.min(requestTimeoutMs, remaining));
    });
    try {
      const request = (async () => {
        const response = await fetchImpl(`${apiOrigin}${path}`, {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2026-03-10',
          },
          redirect: 'error',
          credentials: 'omit',
          signal: controller.signal,
        });
        if (!response || response.status !== 200 || response.redirected === true ||
            (response.url && response.url !== `${apiOrigin}${path}`)) {
          throw new Error('GitHub reservation response rejected.');
        }
        return await response.json();
      })();
      return await Promise.race([request, timeout]);
    } catch {
      throw new Error('GitHub reservation request could not be verified.');
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  const repo = await readApi(`/repos/${trustedRepository}`);
  if (!object(repo) || !positiveId(repo.id) || repo.full_name !== trustedRepository || repo.fork !== false) {
    throw new Error('GitHub repository identity rejected.');
  }
  const runs = new Map();
  async function readRun(id) {
    if (!runs.has(id)) runs.set(id, await readApi(`/repos/${trustedRepository}/actions/runs/${id}`));
    return runs.get(id);
  }
  const currentRun = await readRun(currentRunId);
  if (!trustedRun(currentRun, repo.id, currentRunId) || currentRun.head_sha !== sourceCommit) {
    throw new Error('Current iOS workflow identity rejected.');
  }

  const prefix = `ios-build-number-${appVersion}-`;
  const reserved = [];
  const seen = new Set();
  let totalCount;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await readApi(`/repos/${trustedRepository}/actions/artifacts?per_page=${pageSize}&page=${page}`);
    if (!object(result) || !Number.isSafeInteger(result.total_count) || result.total_count < 0 ||
        !Array.isArray(result.artifacts) || result.artifacts.length > pageSize ||
        (totalCount !== undefined && result.total_count !== totalCount)) {
      throw new Error('GitHub reservation pagination rejected.');
    }
    totalCount = result.total_count;
    for (const artifact of result.artifacts) {
      if (!object(artifact) || !positiveId(artifact.id) || typeof artifact.name !== 'string' || seen.has(artifact.id)) {
        throw new Error('GitHub reservation metadata rejected.');
      }
      seen.add(artifact.id);
      if (!artifact.name.startsWith(prefix)) continue;
      const suffix = artifact.name.slice(prefix.length);
      if (!/^[1-9]\d*$/.test(suffix)) continue;
      const metadata = artifact.workflow_run;
      if (!object(metadata) || !positiveId(metadata.id) || !validSha(metadata.head_sha) ||
          metadata.repository_id !== repo.id || metadata.head_repository_id !== repo.id) continue;
      const run = await readRun(metadata.id);
      if (!trustedRun(run, repo.id, metadata.id) || run.head_sha !== metadata.head_sha) continue;
      // Failed or cancelled runs can already have submitted this number to Apple.
      reserved.push(integer(suffix));
    }
    if (seen.size > totalCount || (seen.size < totalCount && result.artifacts.length < pageSize)) {
      throw new Error('GitHub reservation enumeration incomplete.');
    }
    if (seen.size === totalCount) return reserved;
  }
  throw new Error('GitHub reservation pagination limit exceeded.');
}

export async function reserveIosBuildNumber(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
  const latest = integer(env.LATEST_IOS_BUILD, true);
  if (!validVersion(env.APP_VERSION) || !validSha(env.BUILD_SOURCE_COMMIT) ||
      typeof env.RUNNER_TEMP !== 'string' || !isAbsolute(env.RUNNER_TEMP) || /[\r\n]/.test(env.RUNNER_TEMP) ||
      typeof env.GITHUB_OUTPUT !== 'string' || !isAbsolute(env.GITHUB_OUTPUT) || /[\r\n]/.test(env.GITHUB_OUTPUT)) {
    throw new Error('Invalid iOS reservation output configuration.');
  }
  const runId = integer(env.GITHUB_RUN_ID);
  const reserved = await queryReservedIosBuildNumbers({
    appVersion: env.APP_VERSION,
    sourceCommit: env.BUILD_SOURCE_COMMIT,
    repository: env.GITHUB_REPOSITORY,
    runId,
    token: env.GITHUB_TOKEN,
    fetchImpl,
  });
  const buildNumber = nextIosBuildNumber(latest, reserved);
  const artifactName = `ios-build-number-${env.APP_VERSION}-${buildNumber}`;
  const reservationPath = join(env.RUNNER_TEMP, 'ios-build-number.json');
  writeFileSync(reservationPath, `${JSON.stringify({
    schemaVersion: 1,
    repository: trustedRepository,
    appVersion: env.APP_VERSION,
    buildNumber: String(buildNumber),
    sourceCommit: env.BUILD_SOURCE_COMMIT,
    runId: String(runId),
    artifactName,
  }, null, 2)}\n`, { mode: 0o600 });
  appendFileSync(env.GITHUB_OUTPUT,
    `build_number=${buildNumber}\nartifact_name=${artifactName}\nreservation_path=${reservationPath}\n`);
  return { buildNumber, artifactName, reservationPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await reserveIosBuildNumber();
  } catch {
    process.stderr.write('iOS build number reservation could not be verified.\n');
    process.exitCode = 1;
  }
}
