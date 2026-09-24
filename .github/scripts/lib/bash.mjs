import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * 找到可用的 bash。CI 的 ubuntu runner 直接用 PATH 上的 bash；
 * Windows 本地开发机上 bash 通常不在 PATH，回退到 Git for Windows 的安装位置。
 * 找不到时返回 null，由调用方显式失败，不做静默跳过。
 */
const WINDOWS_FALLBACKS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
];

function usable(candidate) {
  const probe = spawnSync(candidate, ['-c', 'exit 0'], { stdio: 'ignore' });
  return probe.status === 0;
}

export function findBash() {
  if (usable('bash')) return 'bash';
  if (process.platform === 'win32') {
    for (const candidate of WINDOWS_FALLBACKS) {
      if (existsSync(candidate) && usable(candidate)) return candidate;
    }
  }
  return null;
}
