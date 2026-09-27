import ts from 'typescript';
import { resolve, relative, dirname } from 'node:path';
import {
  GAME_ID_LITERALS,
  GAME_MODULES,
  SHARED_DISPATCH_ALLOWED,
  SHARED_RENDER_ROOTS,
  resolveModuleOwner,
} from './architecture-modules.mjs';

export const TRANSITION_EXCEPTIONS = Object.freeze([]);

export function inspectArchitectureSources(entries, options = {}) {
  const modules = options.modules ?? GAME_MODULES;
  const exceptions = options.exceptions ?? (options.modules ? [] : TRANSITION_EXCEPTIONS);
  const root = resolve(options.root ?? 'src');
  const violations = [];
  const exceptionHits = new Set();
  for (const { path, source: text } of entries) {
    const file = resolve(root, path);
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const owner = resolveModuleOwner(path, modules);
    const layer = path.split('/')[0];
    const fail = (node, reason, target = '') => {
      const exception = exceptions.find((entry) => entry.path === path && entry.target === target && target !== '' && (reason === entry.rule || reason.startsWith(`${entry.rule} `)));
      if (exception) {
        exceptionHits.add(`${exception.path}|${exception.rule}`);
        return;
      }
      violations.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${reason}`);
    };

    if (owner.kind === 'unknown') {
      fail(source, owner.reason);
    }

    function inspect(node) {
      let specifier;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
      else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')) specifier = node.arguments[0];

      if (specifier && ts.isStringLiteralLike(specifier)) {
        const name = specifier.text;
        const target = name.startsWith('@/') ? name.slice(2)
          : name.startsWith('.') ? relative(root, resolve(dirname(file), name)).replaceAll('\\', '/')
            : '';
        // 路由层不在 src 下：显式识别 src 反向依赖 app。
        const appTarget = name.startsWith('../app/') || name.startsWith('@/app/') || name.includes('/app/');
        const targetOwner = target ? resolveModuleOwner(target, modules) : { kind: 'external' };
        const typeOnly = isTypeOnlyImport(node);

        if (owner.kind !== 'app') {
          if (appTarget) fail(node, `src 反向依赖路由层 ${name}`);
          if (targetOwner.kind === 'unknown') fail(node, `未登记的模块归属 ${target}`);
          if (owner.kind === 'game' && targetOwner.kind === 'game' && owner.module !== targetOwner.module
            && (owner.gameUi || targetOwner.gameUi)) {
            fail(node, `跨游戏模块依赖 ${target}`, target);
          }
          if (owner.sharedUi && targetOwner.kind === 'game' && targetOwner.gameUi) {
            fail(node, `公共核心反向依赖游戏模块 ${target}`, target);
          }
        }

        if (path.startsWith('domain/') && ['components', 'features', 'hooks', 'screens', 'theme'].includes(target.split('/')[0])) {
          fail(node, `领域层反向依赖 ${target}`);
        }
        if (!typeOnly) {
          if (layer === 'services' && target.startsWith('hooks/')) {
            fail(node, `服务层反向依赖 Hook ${target}`);
          }
          if (path.startsWith('domain/')
            && ['state', 'storage', 'services', 'providers'].includes(target.split('/')[0])) {
            fail(node, `领域层运行时依赖 ${target}`, target);
          }
          if (path.startsWith('state/') && ['components', 'screens'].includes(target.split('/')[0])) {
            fail(node, `状态层反向依赖 ${target}`);
          }
          if ((path.startsWith('storage/') || path.startsWith('features/storage-management/'))
            && ['components', 'hooks', 'screens'].includes(target.split('/')[0])) {
            fail(node, `存储执行核心反向依赖 ${target}`);
          }
          if (path.startsWith('providers/') && ['components', 'features', 'hooks', 'screens', 'state'].includes(target.split('/')[0])) {
            fail(node, `Provider 层反向依赖 ${target}`);
          }
        }
      }

      if (isSharedDispatchSite(path) && isGameDispatch(node, source)) {
        fail(node, '共享渲染按具体游戏分支');
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
  return {
    violations,
    exceptionHits: [...exceptionHits],
    unusedExceptions: exceptions.filter((entry) => !exceptionHits.has(`${entry.path}|${entry.rule}`)),
  };
}

/** 类型导入：`import type ...` 或所有具名说明符都带 `type` 修饰符。 */
function isTypeOnlyImport(node) {
  if (ts.isImportDeclaration(node)) {
    if (node.importClause?.isTypeOnly) return true;
    if (node.importClause?.name) return false;
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0) {
      return bindings.elements.every((element) => element.isTypeOnly);
    }
    return false;
  }
  if (!ts.isExportDeclaration(node)) return false;
  if (node.isTypeOnly) return true;
  return Boolean(node.exportClause && ts.isNamedExports(node.exportClause)
    && node.exportClause.elements.length > 0
    && node.exportClause.elements.every(element => element.isTypeOnly));
}

function isSharedDispatchSite(path) {
  if (!SHARED_RENDER_ROOTS.some((prefix) => path.startsWith(prefix))) return false;
  return !SHARED_DISPATCH_ALLOWED.some((allowed) => path.startsWith(allowed));
}

/** 共享渲染核心按具体游戏分支：比较或枚举「游戏身份」选择器。 */
function isGameDispatch(node, source) {
  const selectorPattern = /(?:^|\.)(game|gameId|kind)$/u;
  const gameLiteral = (value) => GAME_ID_LITERALS.includes(value)
    || GAME_MODULES.some((entry) => (entry.aliases ?? []).includes(value));
  if (ts.isBinaryExpression(node) && ['==', '===', '!=', '!=='].includes(node.operatorToken.getText(source))) {
    const sides = [node.left, node.right];
    const selector = sides.find((side) => selectorPattern.test(side.getText(source)));
    const literal = sides.find(ts.isStringLiteralLike);
    if (selector && literal && gameLiteral(literal.text)) return true;
  }
  if (ts.isSwitchStatement(node) && selectorPattern.test(node.expression.getText(source))) {
    return node.caseBlock.clauses.some((clause) => (
      ts.isCaseClause(clause) && ts.isStringLiteralLike(clause.expression) && gameLiteral(clause.expression.text)
    ));
  }
  return false;
}
