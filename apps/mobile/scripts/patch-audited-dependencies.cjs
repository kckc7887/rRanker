const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve, relative, isAbsolute } = require('node:path');

// These patches repair the exact advisory roots; package versions remain unchanged.
const patches = [
  {
    id: 'GHSA-vfj7-8cjw-p6xm', name: 'braces', version: '3.0.3',
    files: [
      { path: 'lib/parse.js', before: 'e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310', edits: [
        ['  while (index < length) {', '  while (index < length) {\n    if (stack.length > 256) throw new SyntaxError("Brace nesting exceeds safe depth");'],
      ] },
      { path: 'lib/compile.js', before: 'dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f', edits: [
        ['const walk = (node, parent = {}) => {', 'const walk = (node, parent = {}, depth = 0) => {\n    if (depth > 256) throw new SyntaxError("Brace nesting exceeds safe depth");'],
        ['walk(child, node)', 'walk(child, node, depth + 1)'],
      ] },
      { path: 'lib/expand.js', before: '41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7', edits: [
        ['const walk = (node, parent = {}) => {', 'const walk = (node, parent = {}, depth = 0) => {\n    if (depth > 256) throw new SyntaxError("Brace nesting exceeds safe depth");'],
        ['walk(child, node)', 'walk(child, node, depth + 1)'],
      ] },
      { path: 'lib/stringify.js', before: '379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a', edits: [
        ['const stringify = (node, parent = {}) => {', 'const stringify = (node, parent = {}, depth = 0) => {\n    if (depth > 256) throw new SyntaxError("Brace nesting exceeds safe depth");'],
        ['stringify(child)', 'stringify(child, {}, depth + 1)'],
      ] },
    ],
  },
  {
    id: 'GHSA-86w9-cpqp-85rv', name: 'node-forge', version: '1.4.0',
    files: [
      { path: 'lib/rsa.js', before: 'fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50', edits: [
        ['obj.value.length !== 2)', "obj.value.length !== 2 ||\n            obj.value[0].value.length !== ('parameters' in capture ? 2 : 1))"],
      ] },
    ],
  },
];

const hash = source => createHash('sha256').update(source).digest('hex');

function replaceOnce(source, from, to) {
  if (source.split(from).length !== 2) throw new Error('Dependency patch source does not match');
  return source.replace(from, to);
}

function patchSource(source, file, apply) {
  if (hash(source) === file.before) {
    if (!apply) throw new Error('Dependency security patch is missing');
    return file.edits.reduce((text, [from, to]) => replaceOnce(text, from, to), source);
  }
  // Reverse the exact edits and verify the complete original source, including unchanged bytes.
  const original = [...file.edits].reverse().reduce((text, [from, to]) => replaceOnce(text, to, from), source);
  if (hash(original) !== file.before) throw new Error('Dependency security patch integrity mismatch');
  return source;
}

function packageNodes(lockfile, patch) {
  const suffix = `node_modules/${patch.name}`;
  return Object.keys(lockfile.packages).filter(node => node === suffix || node.endsWith(`/${suffix}`));
}

function checkNode(root, node, lockfile, patch, apply) {
  const directory = resolve(root, node);
  const within = relative(root, directory);
  if (!within || within.startsWith('..') || isAbsolute(within) || node.includes('\\')) throw new Error('Invalid dependency location');
  const metadata = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  if (lockfile.packages[node]?.version !== patch.version || metadata.version !== patch.version || metadata.name !== patch.name) {
    throw new Error(`Unreviewed dependency version: ${patch.name}`);
  }
  // Validate every file before writing any file in this package.
  const files = patch.files.map(file => {
    const path = resolve(directory, file.path);
    const source = readFileSync(path, 'utf8');
    return { path, source, patched: patchSource(source, file, apply) };
  });
  for (const file of files) if (apply && file.source !== file.patched) writeFileSync(file.path, file.patched, 'utf8');
}

function applyPatches(root) {
  const lockfile = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  for (const patch of patches) {
    const nodes = packageNodes(lockfile, patch);
    if (!nodes.length) throw new Error(`Dependency patch target missing: ${patch.name}`);
    for (const node of nodes) checkNode(root, node, lockfile, patch, true);
  }
}

function verifyPatchedAdvisories(root, lockfile, report) {
  const verified = new Set();
  for (const patch of patches) {
    const advisory = report.advisories.get(patch.id);
    if (!advisory) continue;
    if (advisory.packages.size !== 1 || !advisory.packages.has(patch.name) ||
      advisory.severities.size !== 1 || !advisory.severities.has('high')) throw new Error('Patched advisory scope changed');
    const nodes = packageNodes(lockfile, patch);
    const reported = report.packages.get(patch.name).nodes;
    if (!nodes.length || reported.some(node => !nodes.includes(node))) throw new Error('Patched advisory locations changed');
    for (const node of nodes) checkNode(root, node, lockfile, patch, false);
    verified.add(patch.id);
  }
  return verified;
}

module.exports = { applyPatches, verifyPatchedAdvisories };
if (require.main === module) {
  applyPatches(resolve(__dirname, '..'));
  console.log('Audited dependency security patches verified');
}
