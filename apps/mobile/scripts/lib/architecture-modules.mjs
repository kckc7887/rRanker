/**
 * 模块归属登记表：谁属于哪个游戏模块、哪些目录是公共层。
 *
 * 门禁不再靠 screen 文件名猜游戏：每个游戏模块显式登记自己拥有的组件目录、页面文件与
 * 文件前缀别名（`mui`/`chunithm`/…）。没有登记的组件目录或页面文件会直接判为违规，
 * 因此新增游戏（哪怕页面叫 `TufScreens` 这类与游戏 ID 不同的名字）必须显式登记才能通过。
 */

/** 归一化：去掉短横线与大小写差异，便于比较 `muse-dash` 与 `MuseDash`。 */
export function normalizeModuleToken(value) {
  return String(value).replaceAll('-', '').toLowerCase();
}

/**
 * 游戏模块登记。`components` 是 `src/components` 下的目录名，
 * `screens` 是 `src/screens` 下的页面文件名，`aliases` 用于 domain/services/features 的文件前缀。
 */
export const GAME_MODULES = Object.freeze([
  { module: 'maimai', components: ['maimai'], screens: ['MaimaiRandomChartsScreen.tsx', 'MaimaiScreens.tsx'], aliases: ['maimai'] },
  { module: 'chunithm', components: ['chunithm'], screens: ['ChunithmBestImageScreen.tsx', 'ChunithmRandomChartsScreen.tsx'], aliases: ['chunithm'] },
  { module: 'phigros', components: ['phigros'], screens: ['PhigrosBestImageScreen.tsx', 'PhigrosRandomChartsScreen.tsx'], aliases: ['phigros'] },
  { module: 'phira', components: ['phira'], screens: ['PhiraScreens.tsx', 'PhiraRandomChartsScreen.tsx'], aliases: ['phira'] },
  { module: 'rizline', components: ['rizline'], screens: ['RizlineScreens.tsx', 'RizlineRandomChartsScreen.tsx'], aliases: ['rizline'] },
  { module: 'musedash', components: ['musedash'], screens: ['MuseDashScreens.tsx', 'MuseDashRandomChartsScreen.tsx'], aliases: ['muse-dash', 'musedash'] },
  { module: 'majdata', components: ['majdata'], screens: ['MajdataScreens.tsx'], aliases: ['majdata'] },
  { module: 'osu', components: ['osu'], screens: ['OsuScreens.tsx'], aliases: ['osu'] },
  { module: 'adofai', components: ['adofai'], screens: ['TufScreens.tsx', 'TufRandomChartsScreen.tsx'], aliases: ['adofai', 'tuf'] },
]);

/** `src/components` 下的公共目录（不是游戏目录）。 */
export const SHARED_COMPONENT_DIRS = Object.freeze(['game-content']);

/** `src/screens` 下与单个游戏无关的页面文件。 */
export const SHARED_SCREENS = Object.freeze([
  'GameAccountsScreen.tsx',
  'StorageManagementScreen.tsx',
  'game-accounts-actions.ts',
]);

/** 按文件名前缀归属游戏的层：其它层一律视为公共层。 */
export const MODULE_SCOPED_LAYERS = Object.freeze(['domain', 'features', 'hooks', 'providers', 'services']);

/** 共享渲染核心：这些目录不得按具体游戏分支，也不得依赖游戏容器。 */
export const SHARED_RENDER_ROOTS = Object.freeze([
  'components/game-content/',
  'features/best-image/',
  'features/chart-download-shared/',
  'features/chart-preview-shared/',
]);

/** 允许按游戏分派的公共位置：适配器与注册表是游戏差异的合法归属。 */
export const SHARED_DISPATCH_ALLOWED = Object.freeze([
  'features/game-content/adapters/',
  'domain/game-bind-options',
  'domain/game-profile',
  'domain/game-mode-family',
  'domain/game-data',
  'domain/game-content',
]);

/** 判定「看起来像游戏 ID 的字符串字面量」。 */
export const GAME_ID_LITERALS = Object.freeze([
  'adofai', 'chunithm', 'future', 'maimai', 'majdata-net', 'musedash', 'osu-catch', 'osu-mania',
  'osu-standard', 'osu-taiko', 'phigros', 'phira', 'rizline', 'test',
]);

function moduleForComponentDir(dir, modules) {
  return modules.find((entry) => entry.components?.includes(dir)) ?? null;
}

/** import 说明符可能省略扩展名，登记表按带扩展名的文件名比对。 */
function stripExtension(value) {
  return String(value).replace(/\.tsx?$/u, '');
}

function moduleForScreenFile(file, modules) {
  return modules.find((entry) => entry.screens?.includes(file)
    || entry.screens?.includes(`${file}.tsx`)) ?? null;
}

function moduleForLayerFile(layer, base, modules) {
  if (!MODULE_SCOPED_LAYERS.includes(layer)) return null;
  const tokens = [base.replace(/\.tsx?$/u, ''), base.replace(/\.tsx?$/u, '').replace(/^use-/u, '')];
  return modules.find((entry) => (entry.aliases ?? []).some((alias) => {
    const normalizedAlias = normalizeModuleToken(alias);
    return tokens.some((token) => normalizeModuleToken(token).startsWith(normalizedAlias));
  })) ?? null;
}

/**
 * 解析一个仓库内路径的归属。
 * 返回 `{ kind: 'app' | 'shared' | 'game' | 'unknown', module?, gameUi?, reason? }`。
 * `sharedUi` 表示该公共模块属于共享渲染核心（反向依赖游戏容器会被拦）。
 */
export function resolveModuleOwner(path, modules = GAME_MODULES) {
  if (path.startsWith('app/')) return { kind: 'app' };
  const segments = path.split('/');
  const layer = segments[0];
  const second = segments[1] ?? '';
  if (layer === 'components') {
    // 直接放在 components 下的文件（含 import 省略扩展名的写法）视为公共组件。
    if (segments.length === 2) return { kind: 'shared', sharedUi: true };
    const module = moduleForComponentDir(second, modules);
    if (module) return { kind: 'game', module: module.module, gameUi: true };
    if (SHARED_COMPONENT_DIRS.includes(second)) return { kind: 'shared', sharedUi: true };
    return { kind: 'unknown', reason: `未登记的组件目录 components/${second}` };
  }
  if (layer === 'screens') {
    if (segments.length === 2 && SHARED_SCREENS.some((file) => stripExtension(file) === stripExtension(second))) {
      return { kind: 'shared' };
    }
    const screenModule = moduleForScreenFile(stripExtension(second), modules);
    if (screenModule) return { kind: 'game', module: screenModule.module, gameUi: true };
    if (segments.length === 2) {
      return { kind: 'unknown', reason: `未登记的页面文件 screens/${second}` };
    }
    return { kind: 'shared' };
  }
  const module = moduleForLayerFile(layer, second, modules);
  if (module) {
    // 界面归属：组件目录、游戏页面与游戏功能模块都属于「游戏界面」，
    // 其它游戏不得直接引用；纯 domain/provider 文件的跨游戏引用另行登记为过渡例外。
    const gameUi = layer === 'features' || SHARED_RENDER_ROOTS.some((prefix) => path.startsWith(prefix));
    return { kind: 'game', module: module.module, gameUi };
  }
  const sharedUi = SHARED_RENDER_ROOTS.some((prefix) => path.startsWith(prefix));
  return { kind: 'shared', sharedUi };
}
