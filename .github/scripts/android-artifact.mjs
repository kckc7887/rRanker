import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const manifestFile = 'candidate.json';
function contents(directory) {
  return readdirSync(directory).filter(name => name !== manifestFile).sort().map(file => {
    assert(lstatSync(join(directory, file)).isFile(), 'Candidate must contain only regular files');
    return { file, sha256: hash(readFileSync(join(directory, file))) };
  });
}
export function verifyCandidate(directory, sourceSha, digest) {
  assert(/^[a-f0-9]{40}$/.test(sourceSha), 'Missing candidate source SHA');
  assert(/^[a-f0-9]{64}$/.test(digest), 'Missing candidate digest');
  const bytes = readFileSync(join(directory, manifestFile));
  assert.equal(hash(bytes), digest, 'Candidate digest mismatch');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.sourceSha, sourceSha, 'Candidate source mismatch');
  assert.deepEqual(manifest.files, contents(directory), 'Candidate contents changed');
  const verification = JSON.parse(readFileSync(join(directory, 'verification.json'), 'utf8'));
  assert.equal(verification.sourceSha, sourceSha, 'APK verification source mismatch');
  assert.deepEqual(verification.apks.map(apk => apk.abi).sort(), ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']);
  const apks = manifest.files.filter(file => file.file.endsWith('.apk'));
  assert.equal(apks.length, 4, 'Expected exactly four verified APKs');
  for (const apk of verification.apks) assert(apks.some(file => file.file === apk.file && file.sha256 === apk.sha256), 'APK verification digest mismatch');
  return manifest;
}
export function sealCandidate(directory, sourceSha) {
  const bytes = JSON.stringify({ sourceSha, files: contents(directory) }, null, 2) + '\n';
  writeFileSync(join(directory, manifestFile), bytes);
  const digest = hash(bytes);
  verifyCandidate(directory, sourceSha, digest);
  return digest;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, directory] = process.argv.slice(2);
  if (mode === 'seal') appendFileSync(process.env.GITHUB_OUTPUT, `digest=${sealCandidate(directory, process.env.BUILD_SOURCE_COMMIT)}\n`);
  else if (mode === 'verify') verifyCandidate(directory, process.env.BUILD_SOURCE_COMMIT, process.env.EXPECTED_DIGEST);
  else throw new Error('Expected seal or verify and candidate directory');
}
