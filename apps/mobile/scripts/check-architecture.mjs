import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';

const root = resolve('src');
const sharedRoots = ['components/game-content/', 'features/chart-preview-shared/', 'features/chart-download-shared/', 'features/best-image/'];
const gameComponents = new Set(readdirSync(resolve(root, 'components'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'game-content').map((entry) => entry.name));
const violations = [];
let inspected = 0;
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? files(resolve(directory, entry.name)) : /\.tsx?$/.test(entry.name) ? [resolve(directory, entry.name)] : []);
}
for (const file of files(root)) {
  const path = relative(root, file).replaceAll('\\', '/');
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const ownGame = path.split('/')[0] === 'components' && gameComponents.has(path.split('/')[1]) ? path.split('/')[1] : null;
  const shared = sharedRoots.some((prefix) => path.startsWith(prefix));
  const fail = (node, reason) => violations.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${reason}`);
  function inspect(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')) specifier = node.arguments[0];
    if (specifier && ts.isStringLiteralLike(specifier)) {
      const name = specifier.text;
      const target = name.startsWith('@/') ? name.slice(2) : name.startsWith('.') ? relative(root, resolve(dirname(file), name)).replaceAll('\\', '/') : '';
      const [layer, game] = target.split('/');
      if (layer === 'components' && gameComponents.has(game)) {
        if (ownGame && ownGame !== game) fail(node, `跨游戏组件依赖 ${target}`);
        if (shared) fail(node, `公共核心反向依赖游戏组件 ${target}`);
      }
      if (path.startsWith('domain/') && ['components', 'features', 'hooks', 'screens', 'theme'].includes(layer)) fail(node, `领域层反向依赖 ${target}`);
    }
    if (shared) {
      if (ts.isBinaryExpression(node) && ['==', '===', '!=', '!=='].includes(node.operatorToken.getText(source))) {
        const sides = [node.left, node.right];
        if (sides.some((side) => /(?:^|\.)gameId$/.test(side.getText(source))) && sides.some(ts.isStringLiteralLike)) fail(node, '共享渲染按具体 gameId 分支');
      }
      if (ts.isSwitchStatement(node) && /(?:^|\.)gameId$/.test(node.expression.getText(source))) fail(node, '共享渲染枚举 gameId');
    }
    ts.forEachChild(node, inspect);
  }
  inspect(source); inspected++;
}
if (violations.length) throw new Error(violations.join('\n'));
console.log(`Architecture boundaries passed (${inspected} TypeScript files): cross-game components, shared core, domain direction, game branches.`);
