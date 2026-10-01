import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { sealCandidate, verifyCandidate } from './android-artifact.mjs';

test('candidate digest pins all ABI bytes, evidence, source and directory membership', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rranker-candidate-'));
  const sha = 'a'.repeat(40);
  try {
    const apks = ['arm64-v8a','armeabi-v7a','x86','x86_64'].map(abi => {
      const file = `${abi}.apk`, bytes = `verified ${abi}`; writeFileSync(join(dir,file), bytes);
      return { abi, file, sha256: createHash('sha256').update(bytes).digest('hex') };
    });
    writeFileSync(join(dir, 'verification.json'), JSON.stringify({ sourceSha: sha, apks }));
    const digest = sealCandidate(dir, sha);
    assert.doesNotThrow(() => verifyCandidate(dir, sha, digest));
    assert.throws(() => verifyCandidate(dir, 'b'.repeat(40), digest), /source mismatch/);
    assert.throws(() => verifyCandidate(dir, sha, ''), /Missing candidate digest/);
    for (const file of ['arm64-v8a.apk','verification.json','candidate.json']) {
      const before = readFileSync(join(dir,file)); writeFileSync(join(dir,file), 'tampered');
      assert.throws(() => verifyCandidate(dir, sha, digest)); writeFileSync(join(dir,file), before);
    }
    writeFileSync(join(dir, 'unverified.apk'), 'extra');
    assert.throws(() => verifyCandidate(dir, sha, digest), /contents changed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
