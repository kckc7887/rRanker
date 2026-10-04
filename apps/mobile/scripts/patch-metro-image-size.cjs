const { readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

/** Metro 文件路径使用 image-size 的异步读取接口。 */
const metroPackagePath = require.resolve('metro/package.json');
const metroDirectory = dirname(metroPackagePath);
const assetPath = join(metroDirectory, 'src/Assets.js');
const source = readFileSync(assetPath, 'utf8');

const imageSizeImport = 'var _imageSize = _interopRequireDefault(require("image-size"));';
const fileImport = 'var _imageSizeFromFile = require("image-size/fromFile");';
const dimensions = '  const dimensions = isImage ? (0, _imageSize.default)(isImageInput) : null;';
const replacement = [
  '  const dimensions = isImage',
  '    ? typeof isImageInput === "string"',
  '      ? await (0, _imageSizeFromFile.imageSizeFromFile)(isImageInput)',
  '      : (0, _imageSize.default)(isImageInput)',
  '    : null;',
].join('\n');
if (!source.includes(replacement)) {
  if (source.split(imageSizeImport).length !== 2 || source.split(dimensions).length !== 2) {
    throw new Error('找不到 Metro 的 image-size 调用');
  }
  const patched = source
    .replace(imageSizeImport, `${imageSizeImport}\n${fileImport}`)
    .replace(dimensions, replacement);
  writeFileSync(assetPath, patched, 'utf8');
}

console.log('Metro image-size file support installed');
