export const imageDownloads = new Map<string, string>();

class Directory {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/');
  }
}

class File extends Directory {
  get name() { return this.uri.split('/').at(-1) ?? ''; }
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
  deleteAsync: async (uri: string) => { imageDownloads.delete(uri); },
  getInfoAsync: async () => ({ exists: false }),
  makeDirectoryAsync: async () => undefined,
  readDirectoryAsync: async () => [],
};
