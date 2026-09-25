import ts from 'typescript';
import { resolve, relative, dirname } from 'node:path';
import {
  GAME_ID_LITERALS,
  GAME_MODULES,
  SHARED_DISPATCH_ALLOWED,
  SHARED_RENDER_ROOTS,
  resolveModuleOwner,
} from './architecture-modules.mjs';

/**
 * 过渡例外：精确到文件与规则，必须写明原因与删除条件。
 *
 * 这些是「尚未迁出的既有跨游戏/公共反依赖」，不是允许长期存在的写法：
 * 每一条都要在做对应模块整理时删除，门禁会打印例外数量与不再命中的条目，避免静默累积。
 * 领域层运行时依赖（`domain/**` 引用 services/providers）由「把 I/O 移出纯领域」的迁移处理，
 * 迁移完成后这些例外同样必须删除。
 */
export const TRANSITION_EXCEPTIONS = Object.freeze([
  // 领域层运行时依赖：迁移到「纯领域 + 服务/功能准备」后删除。
  { path: 'domain/phira-chart-preview.ts', rule: '领域层运行时依赖', reason: '领域内引用谱面笔记服务。', removeWhen: '笔记读取移入服务层后删除。' },
  {
    path: 'components/phira/PhiraScoreVisuals.tsx',
    rule: '跨游戏模块依赖',
    reason: 'Phira 成绩视觉直接借用 Phigros 的等级/评价/星数主题；这些主题应提取为共享主题模块或各自实现。',
    removeWhen: '等级与评价主题按共享模块提取、或 Phira 改用自身主题时删除。',
  },
  {
    path: 'components/phira/PhiraFilterBar.tsx',
    rule: '跨游戏模块依赖',
    reason: 'Phira 筛选条借用 Phigros 的筛选语义与星数工具；筛选语义应按游戏归属。',
    removeWhen: 'Phira 筛选语义独立后删除。',
  },
  {
    path: 'features/phigros-best-image/phigros-best-image-custom.ts',
    rule: '跨游戏模块依赖',
    reason: 'Phigros 导出图定制借用了舞萌筛选类型；应改用本游戏类型或共享类型。',
    removeWhen: '定制选项改用本游戏/共享类型后删除。',
  },
  {
    path: 'components/phigros/PhigrosSongDetail.tsx',
    rule: '跨游戏模块依赖',
    reason: 'Phigros 详情直接引用 Phira 兼容谱面下载动作；应把该动作移到共享谱面下载能力并注入。',
    removeWhen: '兼容谱面下载改为共享能力注入后删除。',
  },
  {
    path: 'screens/PhiraScreens.tsx',
    rule: '跨游戏模块依赖',
    reason: 'Phira 页面引用 Phigros 预览的打开入口；谱面预览打开应作为共享能力提供。',
    removeWhen: '谱面预览打开入口移入共享能力后删除。',
  },
  {
    path: 'features/phira-compatible-chart-download/phira-compatible-chart-download.ts',
    rule: '跨游戏模块依赖',
    reason: 'Phira 兼容谱面下载复用 Phigros 预览的解析与准备；应下沉到共享预览能力。',
    removeWhen: '共享预览能力提取后删除。',
  },
  {
    path: 'features/phigros-chart-preview/chart-preview-input.ts',
    rule: '跨游戏模块依赖',
    reason: 'Phigros 预览输入支持 Phira 兼容谱面，直接引用 Phira 领域/服务/Provider；应改为共享预览准备 + 按游戏适配。',
    removeWhen: '共享预览准备能力提取后删除。',
  },
  {
    path: 'features/phigros-chart-preview/chart-preview-navigation.ts',
    rule: '跨游戏模块依赖',
    reason: '同上：Phigros 预览导航直接引用 Phira 领域模块。',
    removeWhen: '共享预览准备能力提取后删除。',
  },
  {
    path: 'features/phigros-chart-preview/webview-player/main.ts',
    rule: '跨游戏模块依赖',
    reason: '播放器入口直接引用 Phira 的 RPE 资源路径工具；应改为共享资源路径模块。',
    removeWhen: 'RPE 资源路径工具下沉为共享模块后删除。',
  },
  {
    path: 'features/phigros-chart-preview/webview-player/rpe-core.ts',
    rule: '跨游戏模块依赖',
    reason: '同上：RPE 核心直接引用 Phira 的资源路径工具。',
    removeWhen: 'RPE 资源路径工具下沉为共享模块后删除。',
  },
]);

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
    const fail = (node, reason) => {
      const exception = exceptions.find((entry) => entry.path === path && reason.includes(entry.rule));
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
            fail(node, `跨游戏模块依赖 ${target}`);
          }
          if (owner.sharedUi && targetOwner.kind === 'game' && targetOwner.gameUi) {
            fail(node, `公共核心反向依赖游戏模块 ${target}`);
          }
        }

        if (path.startsWith('domain/') && ['components', 'features', 'hooks', 'screens', 'theme'].includes(target.split('/')[0])) {
          fail(node, `领域层反向依赖 ${target}`);
        }
        if (!typeOnly) {
          if (path.startsWith('domain/')
            && ['state', 'storage', 'services', 'providers'].includes(target.split('/')[0])) {
            fail(node, `领域层运行时依赖 ${target}`);
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
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0) {
      return bindings.elements.every((element) => element.isTypeOnly);
    }
    return false;
  }
  return ts.isExportDeclaration(node) && node.isTypeOnly === true;
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
