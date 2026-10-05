const { readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

/** query-string 通过 require 获取解码函数。 */
const entry = require.resolve('decode-uri-component');
const directory = dirname(entry);
const packagePath = join(directory, 'package.json');
const metadata = JSON.parse(readFileSync(packagePath, 'utf8'));
const source = readFileSync(join(directory, 'index.js'), 'utf8');
const exported = 'export default function decodeUriComponent(';
if (source.split(exported).length !== 2 || /^import\s/m.test(source)) {
  throw new Error('找不到 decode-uri-component 的函数导出');
}
writeFileSync(join(directory, 'index.cjs'), `${source.replace(exported, 'module.exports = function decodeUriComponent(')}`, 'utf8');
metadata.main = './index.cjs';
metadata.exports = { types: './index.d.ts', require: './index.cjs', default: './index.js' };
writeFileSync(packagePath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log('decode-uri-component CJS entry installed');
