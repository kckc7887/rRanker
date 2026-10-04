import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function nextIosBuildNumber(latestBuild, reservedBuilds = []) {
  const greatest = Math.max(Number(latestBuild), ...reservedBuilds);
  if (!Number.isSafeInteger(greatest) || greatest < 0 || greatest === Number.MAX_SAFE_INTEGER) {
    throw new Error('Invalid iOS build number');
  }
  return greatest + 1;
}

/** 全局发布锁覆盖占号和上传；失败或取消的任务也可能已向 Apple 提交。 */
export async function queryReservedIosBuildNumbers({ appVersion, repository, token, fetchImpl = globalThis.fetch }) {
  const root = `https://api.github.com/repos/${repository}`;
  async function readApi(path) {
    const response = await fetchImpl(`${root}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2026-03-10',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub reservation request failed: ${response.status}`);
    return response.json();
  }
  const prefix = `ios-build-number-${appVersion}-`;
  const reserved = [];
  const runs = new Map();
  for (let page = 1; ; page += 1) {
    const { artifacts } = await readApi(`/actions/artifacts?per_page=100&page=${page}`);
    for (const artifact of artifacts) {
      if (!artifact.name.startsWith(prefix)) continue;
      const number = Number(artifact.name.slice(prefix.length));
      if (!Number.isSafeInteger(number) || number <= 0) continue;
      const id = artifact.workflow_run.id;
      if (!runs.has(id)) runs.set(id, await readApi(`/actions/runs/${id}`));
      const run = runs.get(id);
      if (run.path === '.github/workflows/quality.yml' &&
          ['push', 'workflow_dispatch'].includes(run.event) && run.head_repository.full_name === repository) {
        reserved.push(number);
      }
    }
    if (artifacts.length < 100) return reserved;
  }
}

export async function reserveIosBuildNumber(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
  const reserved = await queryReservedIosBuildNumbers({
    appVersion: env.APP_VERSION,
    repository: env.GITHUB_REPOSITORY,
    token: env.GITHUB_TOKEN,
    fetchImpl,
  });
  const buildNumber = nextIosBuildNumber(env.LATEST_IOS_BUILD, reserved);
  const artifactName = `ios-build-number-${env.APP_VERSION}-${buildNumber}`;
  const reservationPath = join(env.RUNNER_TEMP, 'ios-build-number.json');
  writeFileSync(reservationPath, `${JSON.stringify({
    appVersion: env.APP_VERSION,
    buildNumber: String(buildNumber),
    sourceCommit: env.BUILD_SOURCE_COMMIT,
    runId: env.GITHUB_RUN_ID,
    artifactName,
  }, null, 2)}\n`);
  appendFileSync(env.GITHUB_OUTPUT,
    `build_number=${buildNumber}\nartifact_name=${artifactName}\nreservation_path=${reservationPath}\n`);
  return { buildNumber, artifactName, reservationPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await reserveIosBuildNumber();
  } catch (error) {
    process.stderr.write(`iOS build number reservation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
