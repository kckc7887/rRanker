import { describe, expect, it } from 'vitest';
import { inspectArchitectureSources } from '../scripts/lib/architecture-boundaries.mjs';
import { GAME_MODULES } from '../scripts/lib/architecture-modules.mjs';

/** 测试用的模块登记：在正式登记表上追加一个虚构游戏，验证「登记才通过」。 */
const FIXTURE_MODULES = [
  ...GAME_MODULES,
  { module: 'future', components: ['future'], screens: ['FutureScreens.tsx'], aliases: ['future'] },
];

const inspect = (path: string, source: string, options: { modules?: unknown } = {}) => (
  inspectArchitectureSources([{ path, source }], {
    modules: options.modules ?? FIXTURE_MODULES,
    exceptions: [],
  }).violations
);

describe('architecture boundary fixtures', () => {
  describe('审查报告列出的边界反例必须被拦下', () => {
    it.each([
      // Phira 组件导入 Rizline 页面：跨游戏页面方向必须被拦下。
      ['components/phira/Card.tsx', "import { RizlineScreens } from '@/screens/RizlineScreens';"],
      // domain 导入全局会话状态：领域对全局状态的隔离。
      ['domain/game-rules.ts', "import { useSession } from '@/state/session-store';"],
      // domain 导入具体 SQLite 仓储：领域对存储实现的隔离。
      ['domain/game-rules.ts', "import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';"],
      // TufScreens 导入 Phira 组件：游戏归属不再靠 screen 名称推断。
      ['screens/TufScreens.tsx', "import { Card } from '@/components/phira/Card';"],
      // 公共渲染向游戏容器反向依赖。
      ['components/game-content/Card.tsx', "import { RizlineScreens } from '@/screens/RizlineScreens';"],
      // 游戏界面借用另一款游戏的领域语义（真实仓库里这类引用按文件登记为过渡例外）。
      ['components/phira/Card.tsx', "import { rate } from '@/domain/phigros';"],
    ])('拦截 %s', (path, source) => {
      expect(inspect(path, source).join('\n')).toMatch(/跨游戏模块依赖|领域层|公共核心反向依赖/u);
    });

    it.each([
      'if (payload.kind === "phira") render();',
      'if (bundle.game === "phigros") render();',
      'switch (data.kind) { case "rizline": break; default: break; }',
      'if (gameId === "musedash") render();',
    ])('共享渲染不得按具体游戏分支：%s', (source) => {
      expect(inspect('components/game-content/Card.tsx', source).join('\n')).toContain('共享渲染按具体游戏分支');
    });
  });

  describe('登记、别名与绕行方式', () => {
    it('未登记的组件目录与页面文件必须失败', () => {
      expect(inspect('components/unknown/Card.tsx', 'export const Card = 1;').join('\n'))
        .toContain('未登记的组件目录');
      expect(inspect('screens/UnknownScreens.tsx', 'export const Screen = 1;').join('\n'))
        .toContain('未登记的页面文件');
      // 虚构游戏在正式登记表里没有条目：不登记就不通过。
      expect(inspect('screens/FutureScreens.tsx', 'export const Screen = 1;', { modules: GAME_MODULES }).join('\n'))
        .toContain('未登记的页面文件');
      expect(inspect('screens/FutureScreens.tsx', 'export const Screen = 1;')).toEqual([]);
    });

    it.each([
      ['components/phira/Card.tsx', "export { Card } from '@/components/phigros/Card';", '再导出'],
      ['components/phira/Card.tsx', "const card = import('@/components/phigros/Card');", '受支持的动态导入'],
      ['components/phira/Card.tsx', "const card = require('@/components/phigros/Card');", 'require'],
      ['components/phira/Card.tsx', "import { Card } from '../phigros/Card';", '相对路径别名'],
    ])('普通 import 换成 %s 也不能绕过（%s）', (path, source) => {
      expect(inspect(path, source).join('\n')).toContain('跨游戏模块依赖');
    });

    it('把所有具名说明符写成 type 也不会绕过结构性限制', () => {
      expect(inspect('domain/game-rules.ts', "import { type Card } from '@/components/Card';").join('\n'))
        .toContain('领域层反向依赖');
    });
  });

  describe('合法组合必须通过', () => {
    it.each([
      ['screens/PhiraScreens.tsx', "import { Card } from '@/components/phira/Card'; import { Row } from '@/components/game-content/Row';"],
      ['screens/FutureScreens.tsx', "import { Card } from '@/components/future/Card';"],
      ['screens/GameAccountsScreen.tsx', "import { Form } from '@/components/phigros/Form';"],
      ['state/filter.ts', "import type { Filter } from '@/domain/muse-dash';"],
      ['features/storage-management/adapters.ts', "import { clearCache } from '@/services/cache'; switch (gameId) { case 'phira': break; }"],
      ['hooks/use-game-data.ts', "switch (gameId) { case 'phira': break; }"],
      ['domain/game-bind-options.ts', "if (gameId === 'phira') return true;"],
      ['features/game-content/adapters/phira.ts', "if (gameId === 'phira') return true;"],
      ['features/game-content/adapters/phira.ts', "if (payload.kind === 'phira') return true;"],
      ['components/game-content/Card.tsx', "import { rate } from '@/domain/phigros'; if (variant === 'compact') render();"],
      ['domain/game-rules.ts', "import type { ProviderSession } from '@/providers/contracts';"],
      ['domain/game-rules.ts', "import type { SnapshotRepository } from '@/repositories/snapshot-repository';"],
      ['app/(tabs)/(overview)/index.tsx', "import { PhiraScreens } from '@/screens/PhiraScreens'; if (gameId === 'phira') render();"],
      ['app/songs/[songId].tsx', "import { TufScreens } from '@/screens/TufScreens'; switch (payload.kind) { case 'phira': break; default: break; }"],
    ])('允许 %s', (path, source) => {
      expect(inspect(path, source)).toEqual([]);
    });
  });
});
