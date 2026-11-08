import { CryptoDigestAlgorithm, digest } from 'expo-crypto';

type ResourceIntegrityNativeModule = {
  sha256FileAsync: (uri: string) => Promise<string>;
  copyFileToContentUriAsync?: (fromUri: string, toUri: string) => Promise<void>;
};

let nativeModule: Promise<ResourceIntegrityNativeModule> | undefined;

function loadNativeModule(): Promise<ResourceIntegrityNativeModule> {
  nativeModule ??= import('expo-modules-core').then(({ requireNativeModule }) =>
    requireNativeModule<ResourceIntegrityNativeModule>('ResourceIntegrity'));
  return nativeModule;
}

export function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  return bytesToHex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)));
}

export async function sha256FileAsync(uri: string): Promise<string> {
  return (await loadNativeModule()).sha256FileAsync(uri);
}

export async function copyFileToContentUriAsync(fromUri: string, toUri: string): Promise<void> {
  const module = await loadNativeModule();
  if (!module.copyFileToContentUriAsync) throw new Error('当前设备不支持保存到此位置');
  return module.copyFileToContentUriAsync(fromUri, toUri);
}
