const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

// query-string 7 的 require 合同需要直接返回函数；保留官方补丁的算法和 ESM 导出。
const entry = require.resolve('decode-uri-component');
const directory = dirname(entry);
const packagePath = join(directory, 'package.json');
const metadata = JSON.parse(readFileSync(packagePath, 'utf8'));
const source = readFileSync(join(directory, 'index.js'), 'utf8');
const expected = '9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa';
if (metadata.version !== '0.5.0' || createHash('sha256').update(source).digest('hex') !== expected) {
  throw new Error('decode-uri-component 补丁版本或源码不符合已验证契约');
}
const exported = 'export default function decodeUriComponent(';
if (source.split(exported).length !== 2 || /^import\s/m.test(source)) {
  throw new Error('decode-uri-component 模块格式不符合已验证契约');
}
writeFileSync(join(directory, 'index.cjs'), `${source.replace(exported, 'module.exports = function decodeUriComponent(')}`, 'utf8');
metadata.main = './index.cjs';
metadata.exports = { types: './index.d.ts', require: './index.cjs', default: './index.js' };
writeFileSync(packagePath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log('decode-uri-component CJS compatibility verified');
