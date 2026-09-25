#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 生产依赖审计门槛：critical 一律失败，high 只允许基线内已定性的公告。
 *
 * 门禁分四层，任何一层不通过都必须显式报告并以非零退出码结束，不允许静默通过：
 *   1. 执行层 runAuditCommand / describeExecutionFailure：确认 `npm audit --omit=dev --json` 真的跑完；
 *   2. 校验层 parseAuditReport：确认拿到可解析且结构自洽的审计报告（缺字段、被截断、错误 JSON 都算失败）；
 *   3. 完整性层 assertPolicyReadiness：确认报告足以执行风险政策，每条漏洞都能追溯到公告根因；
 *   4. 政策层 evaluatePolicy：按严重级别与基线判定阻断，无法定性的 high/critical 公告同样阻断。
 *
 * 退出码：0 通过；1 政策失败（含基线需要复核）；2 执行失败；3 报告不合法或锁文件不可用；
 *         4 报告能解析、metadata 也自洽，但条目不足以判断风险（空 via、悬空引用、成环且无根因）。
 * `npm run audit:prod` 的调用方只关心非零；分开退出码是为了区分「报告坏了 / 报告不够用 / 政策不通过」，
 * 便于照着日志判断该修报告、改基线还是修依赖。
 *
 * 基线记录字段（见 ACCEPTED_HIGH）：
 *   id       公告编号（GHSA）
 *   packages 定性时该公告命中的包，必须与当前报告一致，否则要求重新定性
 *   versions 定性时锁文件里这些包的实际安装版本，任一变化都要求重新定性（接受范围）
 *   importer 引入路径，人工记录的复核依据
 *   reason   接受理由代码，取值见 ACCEPT_REASONS
 *   review   复核条件
 * 结构缺字段、理由代码未知、命中包或版本与锁文件不符，都会让门禁失败，提示重新定性。
 */

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCKFILE_PATH = resolve(PACKAGE_ROOT, 'package-lock.json');

export const SEVERITIES = Object.freeze(['info', 'low', 'moderate', 'high', 'critical']);

export const ACCEPT_REASONS = new Map([
  ['build', '构建期依赖：只参与生成或打包过程，打包产物里不可达'],
  ['runtime-accepted', '随包发布：运行时可加载，但不满足公告所需的利用前置'],
]);

export const ACCEPTED_HIGH = [
  {
    id: 'GHSA-27p8-2357-5qqv',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-3px3-54cx-rmw9',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-4w3w-2rp5-g8jm',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-6gmq-8vp8-gcm6',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-6h8r-xr42-gp59',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-6mj3-qw4j-hgrw',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-8344-3jmq-59r6',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-93r5-fhx6-vmg9',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-965w-775f-mr7g',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-c7q8-3ch8-vqpv',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-g53g-w8rj-fmg7',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-vr34-hp96-76pp',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-w2rr-34g9-rvrj',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-x4fp-j954-r2f4',
    packages: ['@xmldom/xmldom'],
    versions: ['0.8.13', '0.9.10'],
    importer: 'expo → @expo/cli → @expo/plist（0.8.13）；expo → @expo/config-plugins → xcode → simple-plist → plist（0.9.10）',
    reason: 'build',
    review: '锁文件里 @xmldom/xmldom 不再停在 0.8.13、0.9.10，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-mh99-v99m-4gvg',
    packages: ['brace-expansion'],
    versions: ['1.1.16', '5.0.7'],
    importer: 'expo → @expo/fingerprint → minimatch、expo-constants → @expo/config → glob → minimatch（5.0.7）；react-native → glob → minimatch（1.1.16）',
    reason: 'build',
    review: '锁文件里 brace-expansion 不再停在 1.1.16、5.0.7，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-rgw5-rvv9-x895',
    packages: ['brace-expansion'],
    versions: ['1.1.16', '5.0.7'],
    importer: 'expo → @expo/fingerprint → minimatch、expo-constants → @expo/config → glob → minimatch（5.0.7）；react-native → glob → minimatch（1.1.16）',
    reason: 'build',
    review: '锁文件里 brace-expansion 不再停在 1.1.16、5.0.7，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-5p2g-fcmc-qvqq',
    packages: ['image-size'],
    versions: ['1.2.1'],
    importer: 'expo → @expo/metro → metro（1.2.1）',
    reason: 'build',
    review: '锁文件里 image-size 不再停在 1.2.1，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-w3rx-r6r6-pgpr',
    packages: ['image-size'],
    versions: ['1.2.1'],
    importer: 'expo → @expo/metro → metro（1.2.1）',
    reason: 'build',
    review: '锁文件里 image-size 不再停在 1.2.1，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-2883-xcg3-v3hh',
    packages: ['js-yaml'],
    versions: ['3.15.0', '4.3.0'],
    importer: 'expo → @expo/cli → @expo/xcpretty（4.3.0）；react-native → babel-jest → babel-plugin-istanbul → @istanbuljs/load-nyc-config（3.15.0）',
    reason: 'build',
    review: '锁文件里 js-yaml 不再停在 3.15.0、4.3.0，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-5p4m-2wfm-xmqj',
    packages: ['js-yaml'],
    versions: ['3.15.0', '4.3.0'],
    importer: 'expo → @expo/cli → @expo/xcpretty（4.3.0）；react-native → babel-jest → babel-plugin-istanbul → @istanbuljs/load-nyc-config（3.15.0）',
    reason: 'build',
    review: '锁文件里 js-yaml 不再停在 3.15.0、4.3.0，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-28wg-ghj8-5hjv',
    packages: ['nanoid'],
    versions: ['3.3.15'],
    importer: '@react-navigation/native → @react-navigation/core → @react-navigation/routers、expo-router、expo → @expo/metro-config → postcss（3.3.15）',
    reason: 'runtime-accepted',
    review: '锁文件里 nanoid 不再停在 3.3.15，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-2v37-7h3g-55p8',
    packages: ['nanoid'],
    versions: ['3.3.15'],
    importer: '@react-navigation/native → @react-navigation/core → @react-navigation/routers、expo-router、expo → @expo/metro-config → postcss（3.3.15）',
    reason: 'runtime-accepted',
    review: '锁文件里 nanoid 不再停在 3.3.15，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-6g55-p6wh-862q',
    packages: ['postcss'],
    versions: ['8.4.49'],
    importer: 'expo → @expo/metro-config（8.4.49）',
    reason: 'build',
    review: '锁文件里 postcss 不再停在 8.4.49，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-fxqj-rqcc-2cmp',
    packages: ['postcss'],
    versions: ['8.4.49'],
    importer: 'expo → @expo/metro-config（8.4.49）',
    reason: 'build',
    review: '锁文件里 postcss 不再停在 8.4.49，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-qx2v-qp2m-jg93',
    packages: ['postcss'],
    versions: ['8.4.49'],
    importer: 'expo → @expo/metro-config（8.4.49）',
    reason: 'build',
    review: '锁文件里 postcss 不再停在 8.4.49，或公告命中包变化时重新定性',
  },
  {
    id: 'GHSA-r28c-9q8g-f849',
    packages: ['postcss'],
    versions: ['8.4.49'],
    importer: 'expo → @expo/metro-config（8.4.49）',
    reason: 'build',
    review: '锁文件里 postcss 不再停在 8.4.49，或公告命中包变化时重新定性',
  },
];

export const EXIT_CODES = Object.freeze({
  passed: 0,
  policy: 1,
  execution: 2,
  report: 3,
  /** 报告能解析、metadata 也自洽，但条目无法支撑风险判定：空 via、悬空引用、成环且没有可解析根因。 */
  integrity: 4,
});

export const AUDIT_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
export const AUDIT_ARGS = Object.freeze(['audit', '--omit=dev', '--json']);

export class AuditReportError extends Error {}

/** 报告结构合法但不足以执行风险政策；与 AuditReportError 分开，让调用方能区分退出码 3 与 4。 */
export class AuditIntegrityError extends Error {}

function toText(value) {
  if (value === undefined || value === null) return '';
  // 子进程返回的可能是字符串也可能是 Buffer，String() 对两者都能得到 utf8 文本
  return typeof value === 'string' ? value : String(value);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortedUnique(list) {
  return [...new Set(list)].sort();
}

function defaultExec(command, args, options) {
  // 走 shell 才能在各平台上解析到 npm（Windows 上是 npm.cmd）；命令与参数都是本文件里的常量。
  return execSync([command, ...args].join(' '), options);
}

/** 执行层：只负责把命令跑完并原样带回退出码与输出，不做任何判定。 */
export function runAuditCommand({
  command = AUDIT_COMMAND,
  args = AUDIT_ARGS,
  cwd = PACKAGE_ROOT,
  exec = defaultExec,
} = {}) {
  try {
    return {
      status: 0,
      stdout: toText(exec(command, args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      })),
      stderr: '',
    };
  } catch (error) {
    return {
      status: typeof error.status === 'number' ? error.status : null,
      stdout: toText(error.stdout),
      stderr: toText(error.stderr),
    };
  }
}

/** 执行层判定：返回失败原因，通过时返回 null。退出码 0/1 是 npm audit 的正常结局。 */
export function describeExecutionFailure(result) {
  if (!result) return '审计命令没有返回任何结果';
  if (result.status === null) return '审计命令没有退出码，视为执行失败（未能启动或被杀掉）';
  if (result.status !== 0 && result.status !== 1) {
    return `审计命令异常退出（exit=${result.status}），不作为零漏洞处理`;
  }
  if (!result.stdout || !result.stdout.trim()) return '审计命令没有输出任何内容，不作为零漏洞处理';
  return null;
}

function advisoryId(url) {
  const match = String(url ?? '').match(/GHSA-[A-Za-z0-9-]+/);
  return match ? match[0] : null;
}

/**
 * 校验层：把 stdout 变成规范化模型，任何结构问题都抛 AuditReportError。
 * 这一层只回答「报告能不能解析、结构自不自洽」，不回答「报告够不够判断风险」——
 * 后者是完整性层 assertPolicyReadiness 的职责，退出码也不同。
 * 明确的失败形态：非 JSON、缺少 auditReportVersion（npm 报错时输出的错误 JSON）、
 * 缺少 vulnerabilities/metadata、条目缺 severity/via/nodes、metadata 与条目数不自洽。
 */
export function parseAuditReport(stdout) {
  const raw = parseJsonObject(stdout, '审计报告');
  if (typeof raw.auditReportVersion !== 'number') {
    throw new AuditReportError('审计报告缺少 auditReportVersion 字段，不是可用的 npm audit 报告（npm 出错时也会输出 JSON，但结构不同）');
  }
  if (!isPlainObject(raw.vulnerabilities)) {
    throw new AuditReportError('审计报告缺少 vulnerabilities 字段，不能当作零漏洞处理');
  }
  if (!isPlainObject(raw.metadata) || !isPlainObject(raw.metadata.vulnerabilities)) {
    throw new AuditReportError('审计报告缺少 metadata.vulnerabilities 字段，无法与漏洞条目互相印证');
  }

  const { packages, advisories, unidentified, counts } = collectVulnerabilities(raw.vulnerabilities);
  const total = Object.keys(raw.vulnerabilities).length;
  assertMetadataConsistency(raw.metadata.vulnerabilities, counts, total);
  return { advisories, packages, unidentified, counts, total };
}

function parseJsonObject(text, label) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new AuditReportError(`${label}不是合法 JSON：${error.message}`);
  }
  if (!isPlainObject(parsed)) throw new AuditReportError(`${label}顶层不是 JSON 对象`);
  return parsed;
}

function collectVulnerabilities(vulnerabilities) {
  const packages = new Map();
  const advisories = new Map();
  const unidentified = [];
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const [name, info] of Object.entries(vulnerabilities)) {
    readVulnerabilityEntry(name, info, { packages, advisories, unidentified, counts });
  }
  return { packages, advisories, unidentified, counts };
}

function readVulnerabilityEntry(name, info, collected) {
  if (!isPlainObject(info)) throw new AuditReportError(`vulnerabilities.${name} 不是对象`);
  if (!SEVERITIES.includes(info.severity)) {
    throw new AuditReportError(`vulnerabilities.${name}.severity 是未知严重级别 ${JSON.stringify(info.severity)}，门禁无法判断严重程度`);
  }
  if (!Array.isArray(info.via)) throw new AuditReportError(`vulnerabilities.${name}.via 不是数组`);
  if (!Array.isArray(info.nodes) || info.nodes.length === 0 || info.nodes.some((node) => typeof node !== 'string')) {
    throw new AuditReportError(`vulnerabilities.${name}.nodes 不是非空字符串数组，无法核对锁文件里的实际版本`);
  }
  collected.counts[info.severity] += 1;
  collected.packages.set(name, { severity: info.severity, nodes: [...info.nodes], via: [...info.via] });
  for (const via of info.via) {
    readAdvisoryReference(name, via, collected);
  }
}

function readAdvisoryReference(name, via, collected) {
  if (typeof via === 'string') return;
  if (!isPlainObject(via)) {
    throw new AuditReportError(`vulnerabilities.${name}.via 含有既不是字符串也不是对象的条目`);
  }
  if (!SEVERITIES.includes(via.severity)) {
    throw new AuditReportError(`vulnerabilities.${name} 的公告严重级别 ${JSON.stringify(via.severity)} 未知，门禁无法判断严重程度`);
  }
  const id = advisoryId(via.url);
  if (!id) {
    collected.unidentified.push({
      package: name,
      severity: via.severity,
      title: typeof via.title === 'string' ? via.title : '(无标题)',
      url: typeof via.url === 'string' ? via.url : '(无链接)',
    });
    return;
  }
  const advisory = collected.advisories.get(id) ?? { id, packages: new Set(), severities: new Set() };
  advisory.packages.add(name);
  advisory.severities.add(via.severity);
  collected.advisories.set(id, advisory);
}

function assertMetadataConsistency(metadata, counts, total) {
  for (const severity of [...SEVERITIES, 'total']) {
    if (typeof metadata[severity] !== 'number') {
      throw new AuditReportError(`审计报告 metadata.vulnerabilities.${severity} 不是数字`);
    }
  }
  if (metadata.total !== total) {
    throw new AuditReportError(`审计报告不自洽：metadata.vulnerabilities.total=${metadata.total}，漏洞条目数=${total}（报告可能被截断或被伪造）`);
  }
  for (const severity of SEVERITIES) {
    if (metadata[severity] !== counts[severity]) {
      throw new AuditReportError(`审计报告不自洽：metadata.vulnerabilities.${severity}=${metadata[severity]}，漏洞条目数=${counts[severity]}（报告可能被截断或被伪造）`);
    }
  }
}

/** 从某个条目出发顺着 via 里的包名引用走一遍：返回走过的包名，以及链上有没有公告对象（根因）。 */
function traceVia(report, start) {
  const visited = new Set([start]);
  const queue = [start];
  let hasRoot = false;
  while (queue.length) {
    const name = queue.pop();
    for (const via of report.packages.get(name)?.via ?? []) {
      if (typeof via !== 'string') {
        hasRoot = true;
        continue;
      }
      if (!visited.has(via)) {
        visited.add(via);
        queue.push(via);
      }
    }
  }
  return { names: [...visited], hasRoot };
}

/**
 * 完整性层：报告能解析、metadata 也自洽，但条目不足以支撑风险判定。
 *
 * npm audit 的 via 有两种形态：公告对象（风险根因），或「因为依赖了包 X 才受影响」的包名引用。
 * 空 via、引用报告里不存在的包、以及引用成环却没有任何公告对象，都无法回答「到底中了什么公告」，
 * 属于报告不足以判断，按结构/完整性失败处理（退出码 4），不当作零漏洞，也不进政策层。
 */
export function assertPolicyReadiness(report) {
  const problems = [];
  for (const [name, info] of report.packages) {
    if (!Array.isArray(info.via) || info.via.length === 0) {
      problems.push(`${name} 的 via 是空数组，报告没有给出任何风险来源`);
      continue;
    }
    const dangling = sortedUnique(info.via.filter((via) => typeof via === 'string' && !report.packages.has(via)));
    if (dangling.length) {
      problems.push(`${name} 的 via 引用了报告里不存在的包 ${dangling.join('、')}`);
      continue;
    }
    const trace = traceVia(report, name);
    if (!trace.hasRoot) {
      problems.push(`${name} 的 via 只在包之间成环（${trace.names.join(' → ')}），没有任何可解析的公告根因`);
    }
  }
  if (problems.length) {
    const detail = problems.slice(0, 10).join('；');
    const rest = problems.length > 10 ? `；另有 ${problems.length - 10} 个条目同类问题` : '';
    throw new AuditIntegrityError(`审计报告不足以判断风险：${detail}${rest}`);
  }
  return report;
}

/** 锁文件读取：解析失败同样按报告不合法处理，不静默降级。 */
export function parseLockfile(text) {
  let lockfile;
  try {
    lockfile = JSON.parse(text);
  } catch (error) {
    throw new AuditReportError(`package-lock.json 不是合法 JSON：${error.message}`);
  }
  if (!isPlainObject(lockfile) || !isPlainObject(lockfile.packages)) {
    throw new AuditReportError('package-lock.json 缺少 packages 字段，无法核对已安装版本');
  }
  return lockfile;
}

export function readLockfile(path = LOCKFILE_PATH) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new AuditReportError(`读不到锁文件 ${path}：${error.message}`);
  }
  return parseLockfile(text);
}

/** 从报告的安装路径推出锁文件里的实际版本，作为“接受范围”的核对依据。 */
export function installedVersions(lockfile, name, nodes) {
  const versions = [];
  const missing = [];
  for (const node of nodes) {
    const version = lockfile.packages?.[node]?.version;
    if (typeof version === 'string' && version) versions.push(version);
    else missing.push(node);
  }
  return { versions: sortedUnique(versions), missing };
}

function highestSeverity(severities) {
  const known = severities.filter((severity) => SEVERITIES.includes(severity));
  if (known.length !== severities.length) return 'unknown';
  return known.reduce((highest, severity) => (
    SEVERITIES.indexOf(severity) > SEVERITIES.indexOf(highest) ? severity : highest
  ), 'info');
}

function describePackages(lockfile, report, names) {
  return names.map((name) => {
    const info = report.packages.get(name);
    if (!info) return name;
    const { versions, missing } = installedVersions(lockfile, name, info.nodes);
    const details = [
      versions.length ? `锁文件版本 ${versions.join('、')}` : '锁文件里没有可核对的版本',
      `安装路径 ${info.nodes.join('、')}`,
      missing.length ? `锁文件缺少 ${missing.join('、')}` : '',
    ].filter(Boolean);
    return `${name}（${details.join('；')}）`;
  }).join('；');
}

function checkAcceptedRecord(record, report, packageNames, lockfile) {
  const failures = [];
  const reject = (detail) => failures.push({ code: 'baseline-entry', message: `基线记录 ${record?.id ?? '(缺少 id)'} ${detail}，需要重新定性` });

  if (!Array.isArray(record.packages) || record.packages.length === 0) {
    reject('缺少 packages（定性时该公告命中的包）');
    return failures;
  }
  if (!Array.isArray(record.versions) || record.versions.length === 0 || record.versions.some((version) => typeof version !== 'string')) {
    reject('缺少 versions（接受范围：锁文件里的实际安装版本）');
    return failures;
  }
  if (typeof record.reason !== 'string' || !ACCEPT_REASONS.has(record.reason)) {
    reject(`的 reason=${JSON.stringify(record.reason)} 不是已知理由代码（${[...ACCEPT_REASONS.keys()].join('、')}）`);
  }
  if (typeof record.importer !== 'string' || !record.importer.trim()) reject('缺少 importer（引入路径）');
  if (typeof record.review !== 'string' || !record.review.trim()) reject('缺少 review（复核条件）');
  if (failures.length) return failures;

  const recordedPackages = sortedUnique(record.packages);
  if (recordedPackages.join('\u0000') !== packageNames.join('\u0000')) {
    reject(`定性的命中包是 ${recordedPackages.join('、')}，当前报告命中 ${packageNames.join('、')}`);
    return failures;
  }

  const current = [];
  for (const name of packageNames) {
    const info = report.packages.get(name);
    const { versions, missing } = installedVersions(lockfile, name, info.nodes);
    if (missing.length) {
      failures.push({
        code: 'baseline-entry',
        message: `基线记录 ${record.id} 无法核对：锁文件里找不到报告给出的安装路径 ${missing.join('、')}`,
      });
      return failures;
    }
    current.push(...versions);
  }
  const currentVersions = sortedUnique(current);
  if (currentVersions.join('\u0000') !== sortedUnique(record.versions).join('\u0000')) {
    reject(`的接受范围是 ${sortedUnique(record.versions).join('、')}，锁文件当前是 ${currentVersions.join('、')}（${record.importer}）`);
  }
  return failures;
}

/**
 * 政策层：critical 一律失败（公告级与包级都算）；high 只允许基线内的记录，且记录必须与当前报告
 * 和锁文件一致；无法定性的 high/critical 公告同样失败；有效空报告通过（只提示基线里已消失的条目）。
 */
export function evaluatePolicy({ report, lockfile, accepted = ACCEPTED_HIGH }) {
  const failures = [];
  const notices = [];
  const baseline = buildBaseline(accepted, failures);
  const advisories = [...report.advisories.values()].sort((a, b) => a.id.localeCompare(b.id));
  const rows = advisories.map((advisory) => evaluateAdvisory({ advisory, report, lockfile, baseline, failures, notices }));
  // 公告级 critical 已经点名过的包不再重复报一次包级 critical
  const criticalPackages = new Set(rows.filter((row) => row.severity === 'critical').flatMap((row) => row.packages));
  evaluateCriticalPackages({ report, lockfile, coveredPackages: criticalPackages, failures });
  evaluateUnidentifiedAdvisories(report, failures, notices);

  const stale = [...baseline.keys()].filter((id) => !report.advisories.has(id)).sort();
  for (const id of stale) {
    notices.push(`基线记录 ${id} 在本报告中没有命中，确认后从基线删除`);
  }

  return { failures, notices, rows, stale };
}

/**
 * 包级 critical 无条件阻断：只看 vulnerabilities.<name>.severity，
 * 不依赖 via 里能否解析出 GHSA 编号，也不依赖公告对象是否可定性。
 */
function evaluateCriticalPackages({ report, lockfile, coveredPackages, failures }) {
  for (const [name, info] of report.packages) {
    if (info.severity !== 'critical' || coveredPackages.has(name)) continue;
    failures.push({
      code: 'critical',
      message: `未预期的 critical 漏洞包：${name} —— ${describePackages(lockfile, report, [name])}（包级 severity 已经是 critical，不因公告编号无法解析而放过）`,
    });
  }
}

function buildBaseline(accepted, failures) {
  const baseline = new Map();
  for (const record of accepted) {
    if (!isPlainObject(record) || typeof record.id !== 'string' || !record.id) {
      failures.push({ code: 'baseline-entry', message: `基线记录缺少 id：${JSON.stringify(record)}` });
      continue;
    }
    if (baseline.has(record.id)) {
      failures.push({ code: 'baseline-entry', message: `基线里 ${record.id} 重复登记` });
      continue;
    }
    baseline.set(record.id, record);
  }
  return baseline;
}

function evaluateAdvisory({ advisory, report, lockfile, baseline, failures, notices }) {
  const packageNames = sortedUnique([...advisory.packages]);
  const severity = highestSeverity([
    ...advisory.severities,
    ...packageNames.map((name) => report.packages.get(name)?.severity),
  ]);
  const row = { id: advisory.id, severity, packages: packageNames };

  if (!SEVERITIES.includes(severity)) {
    failures.push({ code: 'unknown-severity', message: `公告 ${advisory.id} 的严重级别 ${JSON.stringify(severity)} 无法判定，门禁按失败处理` });
    return row;
  }
  if (severity !== 'high' && severity !== 'critical') {
    notices.push(`${severity} 公告不阻断：${advisory.id}（${packageNames.join('、')}）`);
    return row;
  }

  const record = baseline.get(advisory.id);
  if (severity === 'critical') {
    failures.push({
      code: 'critical',
      message: record
        ? `未预期的 critical 公告：${advisory.id} —— ${describePackages(lockfile, report, packageNames)}（基线只接受 high）`
        : `未预期的 critical 公告：${advisory.id} —— ${describePackages(lockfile, report, packageNames)}`,
    });
    return row;
  }
  if (!record) {
    failures.push({
      code: 'unaccepted-high',
      message: `未接受或未定性的 high 公告：${advisory.id} —— ${describePackages(lockfile, report, packageNames)}`,
    });
    return row;
  }
  failures.push(...checkAcceptedRecord(record, report, packageNames, lockfile));
  return row;
}

function evaluateUnidentifiedAdvisories(report, failures, notices) {
  for (const item of report.unidentified) {
    const severity = highestSeverity([item.severity, report.packages.get(item.package)?.severity]);
    if (!SEVERITIES.includes(severity)) {
      failures.push({
        code: 'unknown-severity',
        message: `无法定性的公告 ${item.package} 严重级别 ${JSON.stringify(severity)} 不能判定，门禁按失败处理：${item.title} ${item.url}`,
      });
    } else if (severity === 'high' || severity === 'critical') {
      failures.push({
        code: 'unidentified',
        message: `无法定性的 ${severity} 公告（缺少 GHSA 编号，不能按基线接受）：${item.package} —— ${item.title} ${item.url}`,
      });
    } else {
      notices.push(`无法定性的 ${severity} 公告（不阻断）：${item.package} —— ${item.title}`);
    }
  }
}

function printReport(report) {
  const { counts } = report;
  console.log(`审计条目：critical=${counts.critical} high=${counts.high} moderate=${counts.moderate} low=${counts.low} info=${counts.info}，共 ${report.total} 个包`);
}

function main() {
  const execution = runAuditCommand();
  const executionFailure = describeExecutionFailure(execution);
  if (executionFailure) {
    console.error(`[执行层] ${executionFailure}`);
    if (execution.stderr?.trim()) console.error(`npm stderr：${execution.stderr.trim()}`);
    if (execution.stdout?.trim()) console.error(`npm stdout：${execution.stdout.trim().slice(0, 2000)}`);
    console.error('执行失败不能当作零漏洞，门禁按失败处理。');
    process.exitCode = EXIT_CODES.execution;
    return;
  }
  console.log(`[执行层] npm audit --omit=dev --json 完成（exit=${execution.status}，输出 ${execution.stdout.length} 字节）`);

  let report;
  let lockfile;
  try {
    report = parseAuditReport(execution.stdout);
    console.log(`[校验层] 报告结构合法：auditReportVersion=${JSON.parse(execution.stdout).auditReportVersion}，条目 ${report.total}`);
    lockfile = readLockfile();
    console.log('[校验层] 锁文件已读取');
  } catch (error) {
    if (!(error instanceof AuditReportError)) throw error;
    console.error(`[校验层] ${error.message}`);
    console.error('报告不合法不能当作零漏洞，门禁按失败处理。');
    process.exitCode = EXIT_CODES.report;
    return;
  }

  try {
    assertPolicyReadiness(report);
    console.log('[完整性层] 每个漏洞条目都能追溯到公告根因');
  } catch (error) {
    if (!(error instanceof AuditIntegrityError)) throw error;
    console.error(`[完整性层] ${error.message}`);
    console.error('报告不足以判断风险，不能当作零漏洞，门禁按失败处理。');
    process.exitCode = EXIT_CODES.integrity;
    return;
  }

  printReport(report);
  const verdict = evaluatePolicy({ report, lockfile });
  for (const notice of verdict.notices) console.log(`[提示] ${notice}`);

  if (report.total === 0) {
    console.log('[政策层] 报告有效且为 0 漏洞。');
  }
  if (verdict.failures.length) {
    for (const failure of verdict.failures) console.error(`[政策层] ${failure.message}`);
    console.error('定性后再决定接受或修复，不得直接放宽基线。');
    process.exitCode = EXIT_CODES.policy;
    return;
  }
  console.log('[政策层] 生产依赖审计门槛通过。');
}

const invokedDirectly = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (invokedDirectly) main();
