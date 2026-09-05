import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const script = readFileSync(path.resolve('scripts/patch-react-native-webview-xiaomi-bridge.cjs'), 'utf8');
const anchor = 'if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){';
function fixture(java = anchor, version = '13.16.1') {
  let source = java;
  const fakeRequire = Object.assign((name: string) => {
    if (name === 'node:path') return path;
    if (name === 'node:fs') return {
      readFileSync: (file: string) => file.endsWith('package.json') ? JSON.stringify({ version }) : source,
      writeFileSync: (_file: string, text: string) => { source = text; },
    };
    throw new Error(name);
  }, { resolve: () => path.resolve('node_modules/react-native-webview/package.json') });
  return {
    run: () => vm.runInNewContext(script, { require: fakeRequire, console: { log() {} } }),
    read: () => source,
  };
}

describe('Xiaomi WebView bridge patch', () => {
  it('patches once and accepts a second install without changing source', () => {
    const target = fixture();
    target.run();
    const patched = target.read();
    expect(patched).toContain('"Xiaomi".equalsIgnoreCase(android.os.Build.MANUFACTURER)');
    expect(patched).toContain('!useLegacyBridge && WebViewFeature.isFeatureSupported');
    target.run();
    expect(target.read()).toBe(patched);
  });
  it('rejects unknown versions, missing anchors, duplicates and half-patched source', () => {
    expect(() => fixture(anchor, '99.0.0').run()).toThrow('Unsupported');
    expect(() => fixture('changed source').run()).toThrow('implementation changed');
    expect(() => fixture(`${anchor}\n${anchor}`).run()).toThrow('implementation changed');
    const target = fixture();
    target.run();
    expect(() => fixture(`${target.read()}\n${anchor}`).run()).toThrow('implementation changed');
  });
});
