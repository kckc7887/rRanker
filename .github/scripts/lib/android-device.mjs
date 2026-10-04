import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export class DeviceCheckError extends Error {
  constructor(category, message) { super(message); this.category = category; }
}

const decode = value => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export function parseSnapshot(xml) {
  if (!/<hierarchy\b/.test(xml) || !/<\/hierarchy>\s*$/.test(xml)) return [];
  return [...xml.matchAll(/<node\s+([^>]+)>?/g)].map(match => ({
    text: '', 'content-desc': '',
    ...Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1], decode(attribute[2])])),
  }));
}

export function createAndroidDevice(serial, execute = execFileSync) {
  const nonce = randomUUID();
  let sequence = 0;
  const command = (...args) => {
    try { return execute('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 20_000 }); }
    catch (error) {
      const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
      if (args[0] === 'shell' && args[1] === 'uiautomator' && /null root node|could not get idle state/i.test(output)) return output;
      throw new DeviceCheckError('device-command', 'ADB command failed during device verification');
    }
  };
  const shell = (...args) => command('shell', ...args);
  const snapshot = () => {
    /** 每次读取使用新路径，避免 dump 失败后读取旧帧。 */
    const path = `/sdcard/rranker-smoke-${nonce}-${++sequence}.xml`;
    try {
      shell('rm', '-f', path);
      const result = shell('uiautomator', 'dump', path);
      if (/null root node|could not get idle state/i.test(result)) return [];
      if (/ERROR:/i.test(result)) throw new DeviceCheckError('device-command', 'UI snapshot command failed');
      /** 文件尚未生成时重试，ADB 连接失败时报错。 */
      return parseSnapshot(shell(`if [ -s '${path}' ]; then cat '${path}'; fi`));
    } finally {
      try { shell('rm', '-f', path); } catch { /* Cleanup cannot replace the first verdict. */ }
    }
  };
  return { command, shell, snapshot };
}
