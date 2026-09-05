import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Exercise the root's actual navigation composition without restoring accounts.
const source = ts.createSourceFile('layout.tsx', readFileSync('app/_layout.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const navigation = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ThemedNavigation');
if (!navigation) throw new Error('Root navigation is missing');
const code = ts.transpileModule(navigation.getText(source), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

type Element = { type: string; props: Record<string, any>; children: Element[] };
describe('root navigation theme contract', () => {
  it.each([false, true])('keeps Router theme defaults and opaque native surfaces with dark=%s', (dark) => {
    const themeImports = source.statements.filter(ts.isImportDeclaration).filter((node) =>
      /\bThemeProvider\b/.test(node.importClause?.namedBindings?.getText(source) ?? ''));
    expect(themeImports.map((node) => (node.moduleSpecifier as ts.StringLiteral).text))
      .toEqual(['expo-router/react-navigation']);
    const appTheme = { dark, accent: '#246BFD', background: dark ? '#101010' : '#FAFAFA', surface: dark ? '#202020' : '#FFFFFF', text: '#888888', border: '#666666', statusBar: dark ? 'light' : 'dark' };
    const defaults = { dark: false, fonts: { regular: 'default-font' }, colors: { retained: 'default' } };
    const darkDefaults = { dark: true, fonts: { regular: 'dark-font' }, colors: { retained: 'dark' } };
    const listeners = { transitionStart() {}, transitionEnd() {} };
    const tree = runInNewContext(`${code}\nThemedNavigation()`, {
      React: { createElement: (type: string, props: Record<string, unknown>, ...children: Element[]) => ({ type, props, children }) },
      useAppTheme: () => appTheme, useNavigationTransitionListeners: () => listeners,
      DarkTheme: darkDefaults, DefaultTheme: defaults, ThemeProvider: 'theme', NotificationProvider: 'notifications',
      Stack: Object.assign(() => undefined, { Screen: 'screen' }), StatusBar: 'status', songDetailScreenOptions: () => ({}),
    }) as Element;
    expect(tree.type).toBe('theme');
    expect(tree.props.value).toMatchObject({ dark, fonts: (dark ? darkDefaults : defaults).fonts,
      colors: { background: appTheme.background, card: appTheme.surface, retained: dark ? 'dark' : 'default' } });
    const stack = tree.children[0]!.children[0]!;
    expect(stack.props.screenListeners).toBe(listeners);
    expect(stack.props.screenOptions).toMatchObject({ contentStyle: { backgroundColor: appTheme.background }, headerStyle: { backgroundColor: appTheme.surface } });
  });
});
