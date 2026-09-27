import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TRANSITION_EXCEPTIONS, inspectArchitectureSources } from '../scripts/lib/architecture-boundaries.mjs';

/**
 * 公共入口不得直接依赖游戏模块。
 * `TRANSITION_EXCEPTIONS` 只登记尚未迁出的跨层引用，不得再为这些入口保留条目；
 * 公共入口一旦重新长出游戏依赖，就由本测试和架构检查同时拦下。
 */
const SHARED_ENTRY_POINTS = [
  'components/AccountSwitchSheet.tsx',
  'components/BoundAccountGroupedList.tsx',
  'components/ProviderLoginSheet.tsx',
  'components/MaimaiFilterBar.tsx',
  'features/best-image/build-best-image-html.ts',
];

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(projectRoot, 'src');

function violationsOfSource(entry: string, source: string) {
  return inspectArchitectureSources([{ path: entry, source }], { root: srcRoot, exceptions: [] }).violations;
}

function violationsOf(entry: string) {
  return violationsOfSource(entry, readFileSync(path.join(srcRoot, entry), 'utf8'));
}

describe('公共入口的游戏依赖边界', () => {
  it.each(SHARED_ENTRY_POINTS)('%s 不直接依赖游戏模块', (entry) => {
    expect(violationsOf(entry).join('\n')).not.toContain('公共核心反向依赖游戏模块');
  });

  it('过渡例外表不再为公共入口保留条目', () => {
    const excepted = TRANSITION_EXCEPTIONS
      .map((row) => row.path)
      .filter((rowPath) => SHARED_ENTRY_POINTS.includes(rowPath));
    expect(excepted).toEqual([]);
  });

  it('游戏差异登记在组合边界的注册表，共享容器仍然不许引用游戏组件', () => {
    const gamePanelImport = "import { OsuLoginPanel } from '@/components/osu/OsuLoginPanel';";
    expect(violationsOfSource('features/game-content/provider-login-panels.tsx', gamePanelImport)).toEqual([]);
    expect(violationsOfSource('components/game-content/AccountSlot.tsx', gamePanelImport).join('\n'))
      .toContain('公共核心反向依赖游戏模块');
  });
});
