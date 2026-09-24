import { execSync } from 'node:child_process';

/**
 * 生产依赖审计门槛。critical 直接失败；high 仅允许基线内已定性的公告。
 * 基线值：build = 构建期依赖，打包产物不可达；runtime-accepted = 随包但不满足利用前置。
 * 新增 high/critical 必须先定性（版本、引入路径、打包可达性）再决定接受或修复，不得直接放宽。
 */
const ACCEPTED_HIGH = new Map(Object.entries({
  'GHSA-6gmq-8vp8-gcm6': 'build',
  'GHSA-6mj3-qw4j-hgrw': 'build',
  'GHSA-g53g-w8rj-fmg7': 'build',
  'GHSA-w2rr-34g9-rvrj': 'build',
  'GHSA-4w3w-2rp5-g8jm': 'build',
  'GHSA-c7q8-3ch8-vqpv': 'build',
  'GHSA-27p8-2357-5qqv': 'build',
  'GHSA-3px3-54cx-rmw9': 'build',
  'GHSA-vr34-hp96-76pp': 'build',
  'GHSA-6h8r-xr42-gp59': 'build',
  'GHSA-8344-3jmq-59r6': 'build',
  'GHSA-x4fp-j954-r2f4': 'build',
  'GHSA-965w-775f-mr7g': 'build',
  'GHSA-93r5-fhx6-vmg9': 'build',
  'GHSA-mh99-v99m-4gvg': 'build',
  'GHSA-rgw5-rvv9-x895': 'build',
  'GHSA-w3rx-r6r6-pgpr': 'build',
  'GHSA-5p2g-fcmc-qvqq': 'build',
  'GHSA-5p4m-2wfm-xmqj': 'build',
  'GHSA-2883-xcg3-v3hh': 'build',
  'GHSA-28wg-ghj8-5hjv': 'runtime-accepted',
  'GHSA-2v37-7h3g-55p8': 'runtime-accepted',
  'GHSA-qx2v-qp2m-jg93': 'build',
  'GHSA-6g55-p6wh-862q': 'build',
  'GHSA-fxqj-rqcc-2cmp': 'build',
  'GHSA-r28c-9q8g-f849': 'build',
}));

function readAuditJson() {
  try {
    return execSync('npm audit --omit=dev --json', {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const stdout = error.stdout?.toString('utf8') ?? (typeof error.stdout === 'string' ? error.stdout : '');
    if (stdout) return stdout;
    throw error;
  }
}

const audit = JSON.parse(readAuditJson());
const vulnerabilities = audit.vulnerabilities ?? {};
const advisories = new Map();
for (const [name, info] of Object.entries(vulnerabilities)) {
  for (const via of info.via ?? []) {
    if (typeof via === 'string') continue;
    const id = String(via.url ?? '').split('/').pop();
    if (!id || !id.startsWith('GHSA-')) continue;
    const current = advisories.get(id) ?? { severity: info.severity, packages: new Set() };
    current.packages.add(name);
    advisories.set(id, current);
  }
}

const criticals = [...advisories.entries()].filter(([, advisory]) => advisory.severity === 'critical');
const unacceptedHigh = [...advisories.entries()]
  .filter(([id, advisory]) => advisory.severity === 'high' && !ACCEPTED_HIGH.has(id));
const stale = [...ACCEPTED_HIGH.keys()].filter((id) => !advisories.has(id));
const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
for (const advisory of advisories.values()) {
  if (counts[advisory.severity] !== undefined) counts[advisory.severity] += 1;
}
console.log(`production advisories: critical=${counts.critical} high=${counts.high} moderate=${counts.moderate} low=${counts.low}`);
for (const id of stale) console.log(`stale baseline entry (verify and prune): ${id}`);

let failed = false;
for (const [id, advisory] of criticals) {
  failed = true;
  console.log(`unexpected critical: ${id} (${[...advisory.packages].join(', ')})`);
}
for (const [id, advisory] of unacceptedHigh) {
  failed = true;
  console.log(`unaccepted high: ${id} (${[...advisory.packages].join(', ')})`);
}
if (failed) {
  console.log('定性后再决定接受或修复，不得直接放宽基线。');
  process.exit(1);
}
console.log('production audit gate passed.');
