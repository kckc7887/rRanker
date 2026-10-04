const { readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

/** 保留 64 位文件位置，并完成短读、短写。 */
const packagePath = require.resolve('expo-file-system/package.json');
const handlePath = join(dirname(packagePath), 'android/src/main/java/expo/modules/filesystem/FileSystemFileHandle.kt');
const source = readFileSync(handlePath, 'utf8');

const originalRead = 'val buffer = ByteBuffer.allocate(length.coerceAtMost((fileChannel.size() - fileChannel.position()).toInt()))\n      fileChannel.read(buffer)\n      return buffer.array()';
const originalWrite = '      fileChannel.write(buffer)';
const replacementRead = [
  'val remaining = (fileChannel.size() - fileChannel.position()).coerceAtLeast(0L)',
  '      val buffer = ByteBuffer.allocate(length.toLong().coerceAtMost(remaining).toInt())',
  '      while (buffer.hasRemaining()) {',
  '        val count = fileChannel.read(buffer)',
  '        if (count < 0) break',
  '        check(count > 0) { "file read made no progress" }',
  '      }',
  '      return buffer.array().copyOf(buffer.position())',
].join('\n');
const replacementWrite = [
  '      while (buffer.hasRemaining()) {',
  '        check(fileChannel.write(buffer) > 0) { "file write made no progress" }',
  '      }',
].join('\n');
if (!source.includes(replacementRead) || !source.includes(replacementWrite)) {
  if (!source.includes(originalRead) || !source.includes(originalWrite)) {
    throw new Error('找不到 Expo 文件句柄的读写调用');
  }
  const patched = source.replace(originalRead, replacementRead).replace(originalWrite, replacementWrite);
  writeFileSync(handlePath, patched, 'utf8');
}
console.log('Expo Android file handle patch installed');
