const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

// Metro 0.83.3 的文件路径调用需适配 image-size 2 官方异步文件入口；字节入口保持不变。
const metroPackagePath = require.resolve('metro/package.json');
const metroDirectory = dirname(metroPackagePath);
const metroMetadata = JSON.parse(readFileSync(metroPackagePath, 'utf8'));
const imageSizeEntry = require.resolve('image-size', { paths: [metroDirectory] });
const imageSizeMetadata = JSON.parse(readFileSync(join(dirname(imageSizeEntry), '../../package.json'), 'utf8'));
const assetPath = join(metroDirectory, 'src/Assets.js');
const source = readFileSync(assetPath, 'utf8');
const sourceHash = createHash('sha256').update(source).digest('hex');
const originalHash = 'bb3f83881e8f3d765c8b9c1bf1de0e4f6ae5143e7eebf6f58a1df52fa6e793ec';
const patchedHash = 'e7e64fdb972119af9111a126342f562e06a0c57c2b56ade07b75c614d0db8a49';

if (metroMetadata.version !== '0.83.3' || imageSizeMetadata.version !== '2.0.4'
  || (sourceHash !== originalHash && sourceHash !== patchedHash)) {
  throw new Error('Metro image-size 补丁版本或源码不符合已验证契约');
}

if (sourceHash === originalHash) {
  const imageSizeImport = 'var _imageSize = _interopRequireDefault(require("image-size"));';
  const dimensions = '  const dimensions = isImage ? (0, _imageSize.default)(isImageInput) : null;';
  if (source.split(imageSizeImport).length !== 2 || source.split(dimensions).length !== 2) {
    throw new Error('Metro image-size 调用不符合已验证契约');
  }
  const patched = source
    .replace(imageSizeImport, `${imageSizeImport}\nvar _imageSizeFromFile = require("image-size/fromFile");`)
    .replace(dimensions, [
      '  const dimensions = isImage',
      '    ? typeof isImageInput === "string"',
      '      ? await (0, _imageSizeFromFile.imageSizeFromFile)(isImageInput)',
      '      : (0, _imageSize.default)(isImageInput)',
      '    : null;',
    ].join('\n'));
  if (createHash('sha256').update(patched).digest('hex') !== patchedHash) {
    throw new Error('Metro image-size 适配结果不符合已验证摘要');
  }
  writeFileSync(assetPath, patched, 'utf8');
}

console.log('Metro image-size file and buffer compatibility verified');
