import { Directory, File, Paths } from 'expo-file-system';

export type BestImageWebViewSource = { html: string; baseUrl: string } | { uri: string };

export type PreparedBestImageWebViewSources = {
  sources: BestImageWebViewSource[];
  dispose: () => void;
};

let sourceBatch = 0;

export function inlineBestImageWebViewSources(htmlPages: readonly string[]): BestImageWebViewSource[] {
  return htmlPages.map((html) => ({ html, baseUrl: 'https://assets2.lxns.net/' }));
}

export function prepareBestImageWebViewSources(
  htmlPages: readonly string[],
  directory: Directory = Paths.cache,
): PreparedBestImageWebViewSources {
  sourceBatch += 1;
  const files: File[] = [];
  try {
    const sources = htmlPages.map((html, index) => {
      const file = new File(directory, `rranker-best-image-${sourceBatch}-${index}.html`);
      file.create({ overwrite: true });
      file.write(html);
      files.push(file);
      return { uri: file.uri };
    });
    return {
      sources,
      dispose: () => files.forEach((file) => { if (file.exists) file.delete(); }),
    };
  } catch (error) {
    files.forEach((file) => { if (file.exists) file.delete(); });
    throw error;
  }
}

export const prepareAndroidBestImageWebViewSources = prepareBestImageWebViewSources;
