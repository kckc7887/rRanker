import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createSerializedKeyValueStorage, type KeyValueStorage } from '@/storage/key-value-storage';

function fixture() {
  const values = new Map<string, string>();
  const raw: KeyValueStorage = {
    getItem: vi.fn(async (key) => values.get(key) ?? null),
    setItem: vi.fn(async (key, value) => { values.set(key, value); }),
    removeItem: vi.fn(async (key) => { values.delete(key); }),
    getAllKeys: vi.fn(async () => [...values.keys()]),
  };
  return { raw, values, storage: createSerializedKeyValueStorage(raw) };
}

describe('shared native KV execution owner', () => {
  it('serializes complete native lifetimes across keys and operation types', async () => {
    const { raw, storage } = fixture();
    let finish!: () => void;
    let active = 0;
    let maximum = 0;
    raw.setItem = vi.fn(async () => {
      maximum = Math.max(maximum, ++active);
      await new Promise<void>((resolve) => { finish = resolve; });
      active--;
    });
    const first = storage.setItem('theme', 'blue');
    const rest = [storage.getItem('session'), storage.removeItem('log'), storage.getAllKeys()];
    await Promise.resolve();
    expect(raw.getItem).not.toHaveBeenCalled();
    expect(raw.removeItem).not.toHaveBeenCalled();
    expect(raw.getAllKeys).not.toHaveBeenCalled();
    finish();
    await Promise.all([first, ...rest]);
    expect(maximum).toBe(1);
    expect(raw.getItem).toHaveBeenCalledWith('session');
    expect(raw.removeItem).toHaveBeenCalledWith('log');
    expect(raw.getAllKeys).toHaveBeenCalledOnce();
  });

  it('preserves the original rejection and continues queued work', async () => {
    const { raw, storage } = fixture();
    const failure = new Error('statement unavailable');
    vi.mocked(raw.setItem).mockRejectedValueOnce(failure);
    const rejected = storage.setItem('first', 'value');
    const recovered = storage.setItem('next', 'retained');
    await expect(rejected).rejects.toBe(failure);
    await recovered;
    expect(await storage.getItem('next')).toBe('retained');
  });

  it('reuses the same owner for one raw instance and never serializes another instance with it', async () => {
    const first = fixture();
    const second = fixture();
    expect(createSerializedKeyValueStorage(first.raw)).toBe(first.storage);
    expect(createSerializedKeyValueStorage(first.storage)).toBe(first.storage);
    expect(second.storage).not.toBe(first.storage);
    let release!: () => void;
    first.raw.setItem = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const blocked = first.storage.setItem('first', 'value');
    await Promise.resolve();
    await second.storage.setItem('second', 'value');
    expect(second.values.get('second')).toBe('value');
    release();
    await blocked;
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/u.test(path) ? [path] : [];
  });
}

function nativeKvReferences(source: string): ts.Node[] {
  const references: ts.Node[] = [];
  const file = ts.createSourceFile('consumer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier) && node.moduleSpecifier.text === 'expo-sqlite/kv-store') references.push(node);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const specifier = node.arguments[0];
      if (specifier && ts.isStringLiteralLike(specifier) && specifier.text === 'expo-sqlite/kv-store') references.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return references;
}

describe('production KV consumer ownership', () => {
  it('detects multiline, reexport, dynamic and CommonJS bypasses without matching text literals', () => {
    expect(nativeKvReferences(`import Default, {\n x\n} from 'expo-sqlite/kv-store';
      export * from 'expo-sqlite/kv-store'; import(\n 'expo-sqlite/kv-store'\n); require('expo-sqlite/kv-store');
      const text = "import fake from 'expo-sqlite/kv-store'";`)).toHaveLength(4);
  });

  it('allows native KV access only in the shared owner and the isolated probe constructor', () => {
    const sourceRoot = resolve(process.cwd(), 'src');
    const violations: string[] = [];
    for (const path of [...sourceFiles(sourceRoot), ...sourceFiles(resolve(process.cwd(), 'app'))]) {
      const name = relative(sourceRoot, path).replaceAll('\\', '/');
      const references = nativeKvReferences(readFileSync(path, 'utf8'));
      if (name === 'storage/key-value-storage.ts') continue;
      if (name === 'services/native-storage-probe.ts') {
        expect(references).toHaveLength(1);
        const declaration = references[0];
        expect(ts.isImportDeclaration(declaration) && !declaration.importClause?.name).toBe(true);
        expect(declaration.getText()).toBe("import { SQLiteStorage } from 'expo-sqlite/kv-store';");
      } else if (references.length) violations.push(name);
    }
    expect(violations).toEqual([]);
  });
});
