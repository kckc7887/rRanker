import { describe, expect, it } from 'vitest';
import { inspectArchitectureSources } from '../scripts/lib/architecture-boundaries.mjs';

const inspect = (path: string, source: string) => inspectArchitectureSources([{ path, source }], ['phira', 'phigros', 'musedash', 'future']);

describe('architecture boundary fixtures', () => {
  it.each([
    ['screens/PhiraScreens.tsx', "import { Card } from '@/components/phigros/Card';", '跨游戏组件依赖'],
    ['screens/PhiraRandomChartsScreen.tsx', "export { Filter } from '../components/phigros/Filter';", '跨游戏组件依赖'],
    ['screens/MuseDashScreens.tsx', "const card = import('@/components/phira/Card');", '跨游戏组件依赖'],
    ['components/phira/Card.tsx', "const card = require('../phigros/Card');", '跨游戏组件依赖'],
    ['features/best-image/preview.tsx', "import { Card } from '@/components/phigros/Card';", '公共核心反向依赖'],
    ['state/filter.ts', "import type { Filter } from '@/components/musedash/Filter';", '状态层反向依赖'],
    ['storage/cache.ts', "import { useCache } from '@/hooks/use-cache';", '存储执行核心反向依赖'],
    ['features/storage-management/adapters.ts', "export { useCache } from '../../hooks/use-cache';", '存储执行核心反向依赖'],
    ['domain/value.ts', "import type { Card } from '@/features/game-content/presentation';", '领域层反向依赖'],
    ['components/game-content/Card.tsx', "if (data.gameId === 'phira') render();", '共享渲染按具体'],
    ['features/best-image/value.ts', 'switch (gameId) { default: break; }', '共享渲染枚举'],
  ])('rejects %s', (path, source, reason) => {
    expect(inspect(path, source)).toEqual([expect.stringContaining(reason)]);
  });

  it.each([
    ['screens/PhiraScreens.tsx', "import { Card } from '@/components/phira/Card'; import { Row } from '@/components/game-content/Row';"],
    ['screens/FutureScreens.tsx', "import { Card } from '@/components/future/Card';"],
    ['screens/GameAccountsScreen.tsx', "import { Form } from '@/components/phigros/Form';"],
    ['state/filter.ts', "import type { Filter } from '@/domain/muse-dash';"],
    ['features/storage-management/adapters.ts', "import { clearCache } from '@/services/cache'; switch (gameId) { case 'phira': break; }"],
    ['hooks/use-game-data.ts', "switch (gameId) { case 'phira': break; }"],
    ['domain/game-bind-options.ts', "if (gameId === 'phira') return true;"],
    ['features/game-content/adapters/phira.ts', "if (gameId === 'phira') return true;"],
    ['components/game-content/Card.tsx', "import { rate } from '@/domain/phigros'; if (variant === 'compact') render();"],
  ])('allows %s', (path, source) => {
    expect(inspect(path, source)).toEqual([]);
  });
});
