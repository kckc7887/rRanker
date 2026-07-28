import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export const SECURE_VALUE_CHUNK_BYTES = 1900;

type SecureStoreAdapter = Pick<
  typeof SecureStore,
  'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'
>;

type SecureValueManifest = {
  version: 1;
  generation: string;
  chunkCount: number;
  checksum: string;
};

const STORE_OPTS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function manifestKey(reference: string): string {
  return `${reference}.manifest`;
}

function chunkKey(reference: string, generation: string, index: number): string {
  return `${reference}.chunk.${generation}.${index}`;
}

function parseManifest(raw: string | null): SecureValueManifest | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SecureValueManifest>;
    const chunkCount = parsed.chunkCount;
    if (parsed.version !== 1
      || typeof parsed.generation !== 'string'
      || !/^[a-f0-9]+$/u.test(parsed.generation)
      || !Number.isSafeInteger(chunkCount)
      || (chunkCount ?? 0) < 1
      || typeof parsed.checksum !== 'string') {
      return null;
    }
    return {
      version: 1,
      generation: parsed.generation,
      chunkCount: chunkCount!,
      checksum: parsed.checksum,
    };
  } catch {
    return null;
  }
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function splitSecureValue(value: string): string[] {
  if (!value) return [''];
  const chunks: string[] = [];
  let chunk = '';
  let chunkBytes = 0;
  for (const char of value) {
    const charBytes = utf8ByteLength(char);
    if (chunk && chunkBytes + charBytes > SECURE_VALUE_CHUNK_BYTES) {
      chunks.push(chunk);
      chunk = '';
      chunkBytes = 0;
    }
    chunk += char;
    chunkBytes += charBytes;
  }
  if (chunk || chunks.length === 0) chunks.push(chunk);
  return chunks;
}

async function checksum(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

async function deleteManifestChunks(
  store: SecureStoreAdapter,
  reference: string,
  manifest: SecureValueManifest,
): Promise<void> {
  for (let index = 0; index < manifest.chunkCount; index += 1) {
    await store.deleteItemAsync(chunkKey(reference, manifest.generation, index));
  }
}

/**
 * SecureStore 单项限制为 2048 字节。该适配器用版本化清单原子切换分片，
 * 让任意长度的敏感字符串仍只落在系统安全存储中。
 */
export class LargeSecureValueStore {
  constructor(private readonly store: SecureStoreAdapter = SecureStore) {}

  createReference(namespace: string): string {
    const safeNamespace = namespace.replace(/[^a-z0-9._-]/giu, '-');
    return `rranker.secure.${safeNamespace}.${Crypto.randomUUID()}`;
  }

  async read(reference: string): Promise<string | null> {
    const manifest = parseManifest(await this.store.getItemAsync(manifestKey(reference)));
    if (!manifest) return null;
    const chunks: string[] = [];
    for (let index = 0; index < manifest.chunkCount; index += 1) {
      const chunk = await this.store.getItemAsync(
        chunkKey(reference, manifest.generation, index),
      );
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    const value = chunks.join('');
    return await checksum(value) === manifest.checksum ? value : null;
  }

  async write(reference: string, value: string): Promise<void> {
    const previous = parseManifest(await this.store.getItemAsync(manifestKey(reference)));
    const generation = Crypto.randomUUID().replace(/-/gu, '');
    const chunks = splitSecureValue(value);
    const next: SecureValueManifest = {
      version: 1,
      generation,
      chunkCount: chunks.length,
      checksum: await checksum(value),
    };
    const writtenKeys: string[] = [];
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        const key = chunkKey(reference, generation, index);
        await this.store.setItemAsync(key, chunks[index]!, STORE_OPTS);
        writtenKeys.push(key);
      }
      await this.store.setItemAsync(
        manifestKey(reference),
        JSON.stringify(next),
        STORE_OPTS,
      );
    } catch (error) {
      for (const key of writtenKeys) {
        await this.store.deleteItemAsync(key).catch(() => undefined);
      }
      throw error;
    }
    if (previous) {
      await deleteManifestChunks(this.store, reference, previous).catch(() => undefined);
    }
  }

  async delete(reference: string): Promise<void> {
    const manifest = parseManifest(await this.store.getItemAsync(manifestKey(reference)));
    if (manifest) await deleteManifestChunks(this.store, reference, manifest);
    await this.store.deleteItemAsync(manifestKey(reference));
  }
}
