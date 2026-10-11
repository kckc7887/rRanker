export const imageDownloads = new Map<string, string>();
const textFiles = new Map<string, string>();
const directories = new Set<string>();

class Directory {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/');
  }
}

class File extends Directory {
  get name() { return this.uri.split('/').at(-1) ?? ''; }
  async text() { return textFiles.get(this.uri) ?? ''; }
}

export const fileSystem = {
  Directory,
  File,
  Paths: { cache: new Directory('file:///cache') },
};

export const legacyFileSystem = {
  createDownloadResumable: (url: string, uri: string) => ({
    downloadAsync: async () => {
      imageDownloads.set(uri, url);
      return { uri, status: 200 };
    },
    cancelAsync: async () => undefined,
  }),
  deleteAsync: async (uri: string) => {
    for (const files of [imageDownloads, textFiles]) {
      for (const path of files.keys()) if (path === uri || path.startsWith(`${uri}/`)) files.delete(path);
    }
    directories.delete(uri);
  },
  getInfoAsync: async (uri: string) => {
    if (imageDownloads.has(uri)) return { exists: true, isDirectory: false, size: 128 };
    const text = textFiles.get(uri);
    if (text !== undefined) return { exists: true, isDirectory: false, size: new TextEncoder().encode(text).length };
    return { exists: directories.has(uri), isDirectory: directories.has(uri), size: 0 };
  },
  makeDirectoryAsync: async (uri: string) => { directories.add(uri); },
  readDirectoryAsync: async (uri: string) => [...imageDownloads.keys(), ...textFiles.keys()]
    .filter(path => path.startsWith(`${uri}/`) && !path.slice(uri.length + 1).includes('/'))
    .map(path => path.slice(uri.length + 1)),
  writeAsStringAsync: async (uri: string, text: string) => { textFiles.set(uri, text); },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    const files = imageDownloads.has(from) ? imageDownloads : textFiles;
    const value = files.get(from);
    if (value === undefined) throw new Error('file not found');
    files.set(to, value);
    files.delete(from);
  },
};
