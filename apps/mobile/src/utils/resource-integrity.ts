import { CryptoDigestAlgorithm, digest } from 'expo-crypto';

let nativeModule: Promise<{ sha256FileAsync: (uri: string) => Promise<string> }> | undefined;

export function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  return bytesToHex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)));
}

export async function sha256FileAsync(uri: string): Promise<string> {
  nativeModule ??= import('expo-modules-core').then(({ requireNativeModule }) =>
    requireNativeModule<{ sha256FileAsync: (uri: string) => Promise<string> }>('ResourceIntegrity'));
  return (await nativeModule).sha256FileAsync(uri);
}
