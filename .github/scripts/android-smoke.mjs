import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAndroidDevice } from './lib/android-device.mjs';
import { runAndroidSmoke } from './lib/android-smoke-flow.mjs';

const [mode, apk, serial, output] = process.argv.slice(2);
assert(['native', 'production'].includes(mode) && apk && serial && output, 'Expected mode, APK, explicit device serial and output directory');
mkdirSync(output, { recursive: true });
const apkSha256 = createHash('sha256').update(readFileSync(apk)).digest('hex');
const evidence = await runAndroidSmoke({ mode, apk, device: createAndroidDevice(serial), sourceSha: process.env.BUILD_SOURCE_COMMIT });
evidence.apkSha256 = apkSha256;
/** 保存证据失败时保留设备检查的原始错误。 */
try {
  writeFileSync(join(output, 'smoke-result.json'), JSON.stringify(evidence, null, 2) + '\n');
} catch {
  if (evidence.status === 'pass') throw new Error('Cannot save device verification evidence');
  console.error('Cannot save device verification evidence');
}
console.log(JSON.stringify(evidence));
if (evidence.status !== 'pass') process.exitCode = 1;
