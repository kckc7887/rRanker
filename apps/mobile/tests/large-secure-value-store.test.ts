import {
  LargeSecureValueStore,
  SECURE_VALUE_CHUNK_BYTES,
  utf8ByteLength,
} from '@/storage/large-secure-value-store';

function createBackend() {
  const values = new Map<string, string>();
  const backend = {
    values,
    getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: vi.fn(async (key: string) => { values.delete(key); }),
  };
  return backend;
}

describe('LargeSecureValueStore', () => {
  it('按 UTF-8 字节安全分片并完整恢复超长混合文本', async () => {
    const backend = createBackend();
    const store = new LargeSecureValueStore(backend);
    const value = `${'a'.repeat(2300)}${'中文😀'.repeat(900)}`;

    await store.write('rranker.secure.test.long', value);

    expect(await store.read('rranker.secure.test.long')).toBe(value);
    for (const [, written] of backend.setItemAsync.mock.calls) {
      expect(utf8ByteLength(written)).toBeLessThanOrEqual(SECURE_VALUE_CHUNK_BYTES);
    }
  });

  it('覆盖时先切换清单再清理旧分片', async () => {
    const backend = createBackend();
    const store = new LargeSecureValueStore(backend);
    const reference = 'rranker.secure.test.overwrite';
    await store.write(reference, '旧'.repeat(1500));
    const oldKeys = [...backend.values.keys()].filter((key) => key.includes('.chunk.'));

    await store.write(reference, 'new-value');

    expect(await store.read(reference)).toBe('new-value');
    expect(oldKeys.every((key) => !backend.values.has(key))).toBe(true);
  });

  it('新清单写入失败时保留旧值并清理新分片', async () => {
    const backend = createBackend();
    const store = new LargeSecureValueStore(backend);
    const reference = 'rranker.secure.test.rollback';
    await store.write(reference, 'stable-value');
    let failManifest = true;
    backend.setItemAsync.mockImplementation(async (key: string, value: string) => {
      if (failManifest && key.endsWith('.manifest')) {
        failManifest = false;
        throw new Error('manifest write failed');
      }
      backend.values.set(key, value);
    });

    await expect(store.write(reference, 'next'.repeat(900))).rejects.toThrow('manifest write failed');

    expect(await store.read(reference)).toBe('stable-value');
    const manifest = JSON.parse(backend.values.get(`${reference}.manifest`)!) as { generation: string };
    const chunkKeys = [...backend.values.keys()].filter((key) => key.includes('.chunk.'));
    expect(chunkKeys.every((key) => key.includes(manifest.generation))).toBe(true);
  });

  it('分片缺失或清单损坏时返回 null，删除时清理完整记录', async () => {
    const backend = createBackend();
    const store = new LargeSecureValueStore(backend);
    const missingRef = 'rranker.secure.test.missing';
    await store.write(missingRef, 'x'.repeat(4000));
    const missingChunk = [...backend.values.keys()].find((key) => key.includes('.chunk.'))!;
    backend.values.delete(missingChunk);
    expect(await store.read(missingRef)).toBeNull();

    const corruptRef = 'rranker.secure.test.corrupt';
    await store.write(corruptRef, 'secret');
    backend.values.set(`${corruptRef}.manifest`, '{bad json');
    expect(await store.read(corruptRef)).toBeNull();

    const deleteRef = 'rranker.secure.test.delete';
    await store.write(deleteRef, 'delete-me'.repeat(500));
    await store.delete(deleteRef);
    expect([...backend.values.keys()].some((key) => key.startsWith(deleteRef))).toBe(false);
  });
});
