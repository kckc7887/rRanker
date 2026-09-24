import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ACCEPTED_HIGH,
  AuditReportError,
  describeExecutionFailure,
  evaluatePolicy,
  parseAuditReport,
  parseLockfile,
  runAuditCommand,
} from '../scripts/check-production-audit.mjs';

const mobileRoot = resolve(__dirname, '..');
const gateScript = resolve(mobileRoot, 'scripts/check-production-audit.mjs');

type AcceptedRecord = (typeof ACCEPTED_HIGH)[number];

function report(entries: Record<string, unknown>, metadata?: Record<string, number>) {
  const advisories = Object.values(entries) as { severity: string }[];
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const entry of advisories) counts[entry.severity as keyof typeof counts] += 1;
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: entries,
    metadata: {
      vulnerabilities: metadata ?? { ...counts, total: advisories.length },
      dependencies: { prod: 1, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 1 },
    },
  });
}

function packageEntry(name: string, severity: string, advisories: { id?: string; severity?: string }[], nodes = [`node_modules/${name}`]) {
  return {
    name,
    severity,
    isDirect: false,
    via: advisories.map((advisory) => ({
      source: 1,
      name,
      dependency: name,
      title: `${name} advisory`,
      ...(advisory.id ? { url: `https://github.com/advisories/${advisory.id}` } : {}),
      severity: advisory.severity ?? 'high',
      range: '<=1.0.0',
    })),
    effects: [],
    range: '<=1.0.0',
    nodes,
    fixAvailable: true,
  };
}

const acceptedPostcss: AcceptedRecord = ACCEPTED_HIGH.find((entry: AcceptedRecord) => entry.id === 'GHSA-6g55-p6wh-862q')!;
const postcssReport = report({ postcss: packageEntry('postcss', 'high', [{ id: 'GHSA-6g55-p6wh-862q' }]) });
const postcssLockfile = parseLockfile(JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/postcss': { version: '8.4.49' } } }));

const emptyReport = report({});

const tempRoot = mkdtempSync(join(tmpdir(), 'rranker-audit-gate-'));
afterAll(() => rmSync(tempRoot, { recursive: true, force: true }));

let caseIndex = 0;
/** 用 PATH 前置的假 npm 跑真实脚本，验证退出码与错误路径。 */
function runGate(stdout: string, exitCode: number, lockfile?: string) {
  const directory = join(tempRoot, `case-${caseIndex++}`);
  mkdirSync(join(directory, 'pkg', 'scripts'), { recursive: true });
  copyFileSync(gateScript, join(directory, 'pkg', 'scripts', 'check-production-audit.mjs'));
  writeFileSync(join(directory, 'pkg', 'package-lock.json'), lockfile ?? JSON.stringify({ lockfileVersion: 3, packages: {} }));
  const payload = join(directory, 'payload.json');
  writeFileSync(payload, stdout);
  if (process.platform === 'win32') {
    writeFileSync(join(directory, 'npm.cmd'), `@echo off\r\ntype "${payload}"\r\nexit /b ${exitCode}\r\n`);
  } else {
    writeFileSync(join(directory, 'npm'), `#!/bin/sh\ncat "${payload}"\nexit ${exitCode}\n`);
    chmodSync(join(directory, 'npm'), 0o755);
  }
  const result = spawnSync(process.execPath, [join(directory, 'pkg', 'scripts', 'check-production-audit.mjs')], {
    cwd: join(directory, 'pkg'),
    encoding: 'utf8',
    env: { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH ?? ''}` },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('production audit gate: 执行层', () => {
  it('把没有退出码的执行当作失败', () => {
    expect(describeExecutionFailure({ status: null, stdout: '', stderr: '' })).toContain('没有退出码');
  });

  it('把 0/1 之外的退出码当作失败，即使 stdout 是合法报告', () => {
    expect(describeExecutionFailure({ status: 7, stdout: postcssReport, stderr: '' })).toContain('exit=7');
  });

  it('把空输出当作失败，不当作零漏洞', () => {
    expect(describeExecutionFailure({ status: 0, stdout: '   \n', stderr: '' })).toContain('没有输出');
  });

  it('接受 npm audit 的正常结局（0 与 1）', () => {
    expect(describeExecutionFailure({ status: 0, stdout: emptyReport, stderr: '' })).toBeNull();
    expect(describeExecutionFailure({ status: 1, stdout: postcssReport, stderr: '' })).toBeNull();
  });

  it('保留非零退出时的 stdout 与 stderr 供上报', () => {
    const failure = runAuditCommand({
      exec: () => {
        const error = new Error('boom') as Error & { status: number; stdout: string; stderr: string };
        error.status = 2;
        error.stdout = '{"partial":true}';
        error.stderr = 'npm ERR! network';
        throw error;
      },
    });
    expect(failure).toEqual({ status: 2, stdout: '{"partial":true}', stderr: 'npm ERR! network' });
    expect(describeExecutionFailure(failure)).toContain('exit=2');
  });

  it('命令启动失败时退出码为 null', () => {
    const failure = runAuditCommand({ exec: () => { throw new Error('spawn failed'); } });
    expect(failure.status).toBeNull();
    expect(describeExecutionFailure(failure)).toContain('没有退出码');
  });
});

describe('production audit gate: 校验层', () => {
  it('拒绝 npm 网络错误 JSON（原脚本会判为通过）', () => {
    expect(() => parseAuditReport(JSON.stringify({ error: { code: 'ENETWORK', summary: 'network error' } })))
      .toThrow(AuditReportError);
    expect(() => parseAuditReport('{"error":{"code":"ENETWORK"}}')).toThrow('auditReportVersion');
  });

  it('拒绝被截断的 JSON', () => {
    expect(() => parseAuditReport(postcssReport.slice(0, postcssReport.length - 20))).toThrow('不是合法 JSON');
  });

  it('拒绝缺少 vulnerabilities 字段的报告', () => {
    expect(() => parseAuditReport(JSON.stringify({ auditReportVersion: 2, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } })))
      .toThrow('vulnerabilities');
  });

  it('拒绝 metadata 与条目数不自洽的报告', () => {
    expect(() => parseAuditReport(report({ postcss: packageEntry('postcss', 'high', [{ id: 'GHSA-6g55-p6wh-862q' }]) }, { info: 0, low: 0, moderate: 0, high: 13, critical: 0, total: 13 })))
      .toThrow('不自洽');
  });

  it('拒绝未知严重级别', () => {
    expect(() => parseAuditReport(report({ postcss: packageEntry('postcss', 'severe', [{ id: 'GHSA-6g55-p6wh-862q' }]) })))
      .toThrow('未知严重级别');
    expect(() => parseAuditReport(report({ postcss: packageEntry('postcss', 'high', [{ id: 'GHSA-6g55-p6wh-862q', severity: 'severe' }]) })))
      .toThrow('公告严重级别 "severe" 未知');
  });

  it('拒绝缺少 nodes 的条目（无法核对锁文件版本）', () => {
    expect(() => parseAuditReport(report({ postcss: packageEntry('postcss', 'high', [{ id: 'GHSA-6g55-p6wh-862q' }], []) })))
      .toThrow('nodes');
  });

  it('接受有效空报告', () => {
    const parsed = parseAuditReport(emptyReport);
    expect(parsed.total).toBe(0);
    expect(parsed.advisories.size).toBe(0);
    expect(parsed.counts.high).toBe(0);
  });

  it('锁文件不是合法 JSON 或缺少 packages 时上报', () => {
    expect(() => parseLockfile('{oops')).toThrow('不是合法 JSON');
    expect(() => parseLockfile('{"lockfileVersion":3}')).toThrow('packages');
  });
});

describe('production audit gate: 政策层', () => {
  it('有效空报告通过，且只把基线里消失的条目当提示', () => {
    const verdict = evaluatePolicy({ report: parseAuditReport(emptyReport), lockfile: { packages: {} } });
    expect(verdict.failures).toEqual([]);
    expect(verdict.stale).toHaveLength(ACCEPTED_HIGH.length);
  });

  it('基线内的 high 在版本一致时通过', () => {
    const verdict = evaluatePolicy({ report: parseAuditReport(postcssReport), lockfile: postcssLockfile });
    expect(verdict.failures).toEqual([]);
    expect(verdict.stale).not.toContain('GHSA-6g55-p6wh-862q');
  });

  it('锁文件版本变化时要求重新定性（锁文件变化触发复核）', () => {
    const drifted = parseLockfile(JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/postcss': { version: '8.4.50' } } }));
    const verdict = evaluatePolicy({ report: parseAuditReport(postcssReport), lockfile: drifted });
    expect(verdict.failures).toHaveLength(1);
    expect(verdict.failures[0].message).toContain('需要重新定性');
    expect(verdict.failures[0].message).toContain('8.4.50');
    expect(verdict.failures[0].message).toContain(acceptedPostcss.importer);
  });

  it('公告命中包变化时要求重新定性', () => {
    const renamed = parseAuditReport(report({ 'postcss-x': packageEntry('postcss-x', 'high', [{ id: 'GHSA-6g55-p6wh-862q' }]) }));
    const verdict = evaluatePolicy({ report: renamed, lockfile: { packages: { 'node_modules/postcss-x': { version: '8.4.49' } } } });
    expect(verdict.failures[0].message).toContain('命中包');
  });

  it('报告里的安装路径不在锁文件时失败', () => {
    const verdict = evaluatePolicy({ report: parseAuditReport(postcssReport), lockfile: { packages: {} } });
    expect(verdict.failures[0].message).toContain('找不到报告给出的安装路径');
  });

  it('未知 high 公告直接失败', () => {
    const unknown = parseAuditReport(report({ fresh: packageEntry('fresh', 'high', [{ id: 'GHSA-aaaa-bbbb-cccc' }]) }));
    const verdict = evaluatePolicy({ report: unknown, lockfile: { packages: { 'node_modules/fresh': { version: '1.0.0' } } } });
    expect(verdict.failures).toHaveLength(1);
    expect(verdict.failures[0].code).toBe('unaccepted-high');
  });

  it('critical 公告即使已在基线里也失败', () => {
    const critical = parseAuditReport(report({ postcss: packageEntry('postcss', 'critical', [{ id: 'GHSA-6g55-p6wh-862q', severity: 'critical' }]) }));
    const verdict = evaluatePolicy({ report: critical, lockfile: postcssLockfile });
    expect(verdict.failures[0].code).toBe('critical');
  });

  it('无法定性的 high 公告失败（缺少 GHSA 编号不是静默过滤的理由）', () => {
    const unidentified = parseAuditReport(report({ mystery: packageEntry('mystery', 'high', [{}]) }));
    const verdict = evaluatePolicy({ report: unidentified, lockfile: { packages: { 'node_modules/mystery': { version: '1.0.0' } } } });
    expect(verdict.failures[0].code).toBe('unidentified');
  });

  it('无法定性的 moderate 公告只提示', () => {
    const unidentified = parseAuditReport(report({ mystery: packageEntry('mystery', 'moderate', [{ severity: 'moderate' }]) }));
    const verdict = evaluatePolicy({ report: unidentified, lockfile: { packages: { 'node_modules/mystery': { version: '1.0.0' } } } });
    expect(verdict.failures).toEqual([]);
    expect(verdict.notices.join('\n')).toContain('无法定性的');
  });

  it('基线记录缺字段或理由代码未知时失败', () => {
    const parsed = parseAuditReport(postcssReport);
    const cases: [AcceptedRecord, string][] = [
      [{ ...acceptedPostcss, reason: 'whatever' }, '理由代码'],
      [{ ...acceptedPostcss, importer: '' }, 'importer'],
      [{ ...acceptedPostcss, review: '' }, 'review'],
      [{ ...acceptedPostcss, versions: [] }, 'versions'],
      [{ id: 'GHSA-6g55-p6wh-862q' } as unknown as AcceptedRecord, 'packages'],
    ];
    for (const [record, expected] of cases) {
      const verdict = evaluatePolicy({ report: parsed, lockfile: postcssLockfile, accepted: [record] });
      expect(verdict.failures.map((failure: { message: string }) => failure.message).join('\n')).toContain(expected);
    }
  });
});

describe('production audit gate: 端到端退出码', () => {
  it('有效空报告通过（保留必须放行的路径）', () => {
    const result = runGate(emptyReport, 0);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('为 0 漏洞');
  });

  it('npm 网络错误 JSON 不再被判为通过', () => {
    const result = runGate(JSON.stringify({ error: { code: 'ENETWORK', summary: 'network error' } }), 1);
    expect(result.status).toBe(3);
    expect(result.stderr).toContain('[校验层]');
  });

  it('非零退出但 stdout 合法时按执行失败处理', () => {
    const result = runGate(postcssReport, 7);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('exit=7');
  });

  it('锁文件版本漂移时以政策失败退出并提示重新定性', () => {
    const lockfile = JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/postcss': { version: '8.4.50' } } });
    const result = runGate(postcssReport, 1, lockfile);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('需要重新定性');
  });
});
