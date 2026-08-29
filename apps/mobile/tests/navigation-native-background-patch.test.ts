import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

type PatchModule = {
  NATIVE_STACK_VERSION: string;
  SCREEN_STACK_VERSION: string;
  applyExactPatch: (filePath: string, original: string, patched: string) => 'applied' | 'already-applied';
  applyNavigationBackgroundPatch: () => {
    screensRoot: string;
    nativeStackRoot: string;
    results: { file: string; status: 'applied' | 'already-applied' }[];
  };
  assertPackageVersion: (packageRoot: string, expectedVersion: string) => void;
};

const require = createRequire(import.meta.url);
const patchModule = require('../scripts/patch-navigation-native-container-background.cjs') as PatchModule;

describe('native navigation container background patch', () => {
  it('is exact, idempotent, and rejects source drift', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'rranker-navigation-patch-'));
    const fixturePath = path.join(fixtureRoot, 'fixture.txt');
    writeFileSync(fixturePath, 'before\n');

    expect(patchModule.applyExactPatch(fixturePath, 'before\n', 'after\n')).toBe('applied');
    expect(patchModule.applyExactPatch(fixturePath, 'before\n', 'after\n')).toBe('already-applied');
    expect(readFileSync(fixturePath, 'utf8')).toBe('after\n');
    expect(() => patchModule.applyExactPatch(fixturePath, 'missing\n', 'replacement\n')).toThrow(
      /expected exactly one unpatched source anchor or one patched block/,
    );

    writeFileSync(fixturePath, 'before\nafter\n');
    expect(() => patchModule.applyExactPatch(fixturePath, 'before\n', 'after\n')).toThrow(
      /found 1 unpatched source anchors and 1 patched blocks/,
    );

    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('pins the dependency versions that the native backport targets', () => {
    expect(patchModule.SCREEN_STACK_VERSION).toBe('4.16.0');
    expect(patchModule.NATIVE_STACK_VERSION).toBe('7.17.10');
  });

  it('rejects dependency version drift', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'rranker-navigation-version-'));
    writeFileSync(
      path.join(fixtureRoot, 'package.json'),
      JSON.stringify({ name: 'fixture-navigation-package', version: '9.9.9' }),
    );

    expect(() => patchModule.assertPackageVersion(fixtureRoot, '1.0.0')).toThrow(
      /Unsupported fixture-navigation-package version 9\.9\.9; expected 1\.0\.0/,
    );

    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('keeps the installed backport complete and idempotent', () => {
    const first = patchModule.applyNavigationBackgroundPatch();
    const second = patchModule.applyNavigationBackgroundPatch();

    expect(first.results).toHaveLength(19);
    expect(second.results.every(({ status }) => status === 'already-applied')).toBe(true);

    const nativeStackSource = readFileSync(
      path.join(first.nativeStackRoot, 'src/views/NativeStackView.native.tsx'),
      'utf8',
    );
    expect(nativeStackSource).toContain('const { colors } = useTheme();');
    expect(nativeStackSource).toContain(
      'nativeContainerStyle={{ backgroundColor: colors.background }}',
    );

    const appLayout = readFileSync(path.join(process.cwd(), 'app/_layout.tsx'), 'utf8');
    expect(appLayout).toContain('background: theme.background');

    const themeTokens = readFileSync(
      path.join(process.cwd(), 'src/theme/theme-tokens.ts'),
      'utf8',
    );
    expect(themeTokens).toMatch(/dark: true[^\n]+background: '#0D1117'/);
    expect(themeTokens).toMatch(/dark: false[^\n]+background: '#F7F8FA'/);

    const fabricSpec = readFileSync(
      path.join(first.screensRoot, 'src/fabric/ScreenStackNativeComponent.ts'),
      'utf8',
    );
    expect(fabricSpec).toContain('nativeContainerBackgroundColor?: ColorValue;');

    const iosStack = readFileSync(path.join(first.screensRoot, 'ios/RNSScreenStack.mm'), 'utf8');
    expect(iosStack).toContain(
      '_controller.view.backgroundColor = _nativeContainerBackgroundColor;',
    );

    const androidManager = readFileSync(
      path.join(
        first.screensRoot,
        'android/src/main/java/com/swmansion/rnscreens/ScreenStackViewManager.kt',
      ),
      'utf8',
    );
    expect(androidManager).toContain('override fun setNativeContainerBackgroundColor(');
    expect(androidManager).toContain('value: Int?');
  });
});
