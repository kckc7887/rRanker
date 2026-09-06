import { CryptoDigestAlgorithm, digest } from 'expo-crypto';

export function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  return bytesToHex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)));
}
