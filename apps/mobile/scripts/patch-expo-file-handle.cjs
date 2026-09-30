const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

// Expo 19.0.24 的 Android 文件句柄须保留 64 位剩余长度并完成短读、短写。
const packagePath = require.resolve('expo-file-system/package.json');
const metadata = JSON.parse(readFileSync(packagePath, 'utf8'));
const handlePath = join(dirname(packagePath), 'android/src/main/java/expo/modules/filesystem/FileSystemFileHandle.kt');
const source = readFileSync(handlePath, 'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
const originalHash = '13446c78e75f4fee5bbf4eca88236d505e356a1ae139e2452de981cb0239ca09';
const patchedHash = '0ff23e6c358721d9d1c8399960c7bb544a32759e8f0bc4ecc549bc714f9f2c1b';
const sourceHash = digest(source);
if (metadata.version !== '19.0.24' || (sourceHash !== originalHash && sourceHash !== patchedHash)) {
  throw new Error('Expo 文件句柄补丁版本或源码不符合已验证契约');
}
if (sourceHash === originalHash) {
  const patched = source.replace(
    'val buffer = ByteBuffer.allocate(length.coerceAtMost((fileChannel.size() - fileChannel.position()).toInt()))\n      fileChannel.read(buffer)\n      return buffer.array()',
    [
      'val remaining = (fileChannel.size() - fileChannel.position()).coerceAtLeast(0L)',
      '      val buffer = ByteBuffer.allocate(length.toLong().coerceAtMost(remaining).toInt())',
      '      while (buffer.hasRemaining()) {',
      '        val count = fileChannel.read(buffer)',
      '        if (count < 0) break',
      '        check(count > 0) { "file read made no progress" }',
      '      }',
      '      return buffer.array().copyOf(buffer.position())',
    ].join('\n'),
  ).replace('      fileChannel.write(buffer)', [
    '      while (buffer.hasRemaining()) {',
    '        check(fileChannel.write(buffer) > 0) { "file write made no progress" }',
    '      }',
  ].join('\n'));
  if (digest(patched) !== patchedHash) throw new Error('Expo 文件句柄适配结果不符合已验证摘要');
  writeFileSync(handlePath, patched, 'utf8');
}
console.log('Expo Android file handle long offsets and complete I/O verified');
