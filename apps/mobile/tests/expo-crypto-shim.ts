import { createHash } from 'node:crypto';

export const CryptoDigestAlgorithm = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA384: 'SHA-384',
  SHA512: 'SHA-512',
  MD5: 'MD5',
};

export const CryptoEncoding = {
  HEX: 'hex',
  BASE64: 'base64',
};

export async function getRandomBytesAsync(byteCount: number): Promise<Uint8Array> {
  return new Uint8Array(byteCount).map((_, index) => (index * 17 + 3) % 256);
}

export function getRandomBytes(byteCount: number): Uint8Array {
  return new Uint8Array(byteCount).map((_, index) => (index * 17 + 3) % 256);
}

export async function digestStringAsync(
  _algorithm: string,
  data: string,
  options?: { encoding?: string },
): Promise<string> {
  // Deterministic fake digest for unit tests; not cryptographic.
  const hex = Array.from(data)
    .reduce((sum, char) => (sum + char.charCodeAt(0)) % 255, 0)
    .toString(16)
    .padStart(2, '0')
    .repeat(32)
    .slice(0, 64);
  if (options?.encoding === 'base64') {
    return Buffer.from(hex, 'hex').toString('base64');
  }
  return hex;
}

export async function digest(_algorithm: string, data: BufferSource): Promise<ArrayBuffer> {
  const bytes = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
  const hash = createHash('sha256').update(bytes).digest();
  return Uint8Array.from(hash).buffer;
}
